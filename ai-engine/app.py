import logging
import os
import threading
import uuid
from typing import Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from generator import TripoSRGenerator, GenerationError
from model import TripoSRModelManager
from cad import router as cad_router, cad_lock
import trimesh
import scan_import
import text3d
from router import classify_intent

# Logging setup
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=logging.INFO
)
logger = logging.getLogger("meshforge.api")

app = FastAPI(
    title="3d.me Local AI Engine",
    description="Local TripoSR 3D Generation Engine for Apple Silicon Mac",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cad_router)
app.include_router(text3d.router, prefix="/text3d", tags=["text3d"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")
os.makedirs(OUTPUTS_DIR, exist_ok=True)

generator = TripoSRGenerator(output_dir=OUTPUTS_DIR)

# Single worker executor ensures only ONE inference job runs at a time
executor = ThreadPoolExecutor(max_workers=1)

# In-memory job state store
jobs: Dict[str, Dict[str, Any]] = {}
jobs_lock = threading.Lock()

ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp"
}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB

class JobResponse(BaseModel):
    job_id: str
    status: str
    progress: int = 0
    message: Optional[str] = None
    glb_url: Optional[str] = None
    download_url: Optional[str] = None
    generation_time: Optional[float] = None
    file_size: Optional[int] = None
    vertex_count: Optional[int] = None
    face_count: Optional[int] = None
    error: Optional[str] = None

class ScaleRequest(BaseModel):
    model_id: str
    axis: Optional[str] = "x"  # "x", "y", or "z"
    target_length_mm: Optional[float] = None
    scale_factor: Optional[float] = None

class CleanupRequest(BaseModel):
    remove_floating: bool = False
    floating_threshold_pct: float = Field(default=5.0, ge=0.1, le=50.0)
    fill_holes: bool = False
    center_and_ground: bool = False
    decimate: bool = False
    target_triangles: Optional[int] = Field(default=None, ge=10)

class ClassifyRequest(BaseModel):
    prompt: Optional[str] = ""
    image_base64: Optional[str] = None
    image_path: Optional[str] = None

@app.post("/route/classify")
async def route_classify(req: ClassifyRequest):
    img_b64 = req.image_base64
    if not img_b64 and req.image_path and os.path.exists(req.image_path):
        import base64
        with open(req.image_path, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode("utf-8")
    result = classify_intent(prompt=req.prompt, image_b64=img_b64)
    return result

@app.get("/health")
def health():
    manager = TripoSRModelManager()
    return {
        "status": "ok",
        "service": "3d.me AI Engine",
        "model": "stabilityai/TripoSR",
        "device": manager.device,
        "mps_available": manager.device == "mps",
        "ready": True
    }

def run_generation_task(job_id: str, image_path: str, quality: str):
    logger.info(f"Starting job {job_id} with quality={quality}")
    
    def update_progress(percent: int, msg: str):
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id]["progress"] = percent
                jobs[job_id]["message"] = msg
                if percent < 100:
                    jobs[job_id]["status"] = "processing"

    try:
        with jobs_lock:
            jobs[job_id]["status"] = "processing"
            jobs[job_id]["progress"] = 5
            jobs[job_id]["message"] = "Initializing generation pipeline..."

        with cad_lock:
            result = generator.process(
                job_id=job_id,
                input_image_path=image_path,
                quality=quality,
                progress_callback=update_progress
            )

        with jobs_lock:
            jobs[job_id].update({
                "status": "completed",
                "progress": 100,
                "message": "3D GLB model generated successfully",
                "glb_url": f"/outputs/{result['glb_filename']}",
                "download_url": f"/download/{job_id}",
                "generation_time": result["generation_time"],
                "file_size": result["file_size"],
                "vertex_count": result["vertex_count"],
                "face_count": result["face_count"],
                "error": None
            })

        # Persist to local ~/.3dme storage
        try:
            import storage
            storage.save_job_record(
                job_id=job_id,
                name=f"Image3D: {job_id[:8]}",
                source_type="image",
                status="completed",
                quality=quality,
                glb_src_path=os.path.join(OUTPUTS_DIR, result["glb_filename"]),
                file_size=result.get("file_size"),
                vertex_count=result.get("vertex_count"),
                face_count=result.get("face_count"),
                generation_time=result.get("generation_time"),
            )
        except Exception as st_err:
            logger.warning(f"Storage persist error: {st_err}")

        logger.info(f"Job {job_id} completed successfully in {result['generation_time']}s")

    except GenerationError as ge:
        logger.error(f"Job {job_id} failed with user-facing error: {ge}")
        with jobs_lock:
            jobs[job_id].update({
                "status": "failed",
                "progress": 0,
                "error": str(ge),
                "message": "Generation failed."
            })
    except Exception as e:
        logger.error(f"Job {job_id} unexpected failure: {e}", exc_info=True)
        with jobs_lock:
            jobs[job_id].update({
                "status": "failed",
                "progress": 0,
                "error": "An internal error occurred during 3D mesh generation. Please check the input image.",
                "message": "Generation failed."
            })
    finally:
        # Clean input upload file
        if os.path.exists(image_path):
            try:
                os.remove(image_path)
            except Exception:
                pass

@app.post("/generate", response_model=JobResponse)
async def generate(
    file: UploadFile = File(...),
    quality: str = Form("Standard")
):
    # Validate MIME type
    content_type = file.content_type or ""
    if content_type.lower() not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type '{content_type}'. Allowed formats: PNG, JPG, JPEG, WEBP."
        )

    # Read and validate size
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Image size ({len(content) / (1024*1024):.1f}MB) exceeds the 25MB limit."
        )

    job_id = str(uuid.uuid4())
    temp_input_path = os.path.join(OUTPUTS_DIR, f"input_{job_id}_{file.filename}")
    
    with open(temp_input_path, "wb") as f:
        f.write(content)

    with jobs_lock:
        jobs[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "progress": 0,
            "message": "Job queued for local processing...",
            "glb_url": None,
            "download_url": None,
            "generation_time": None,
            "file_size": None,
            "vertex_count": None,
            "face_count": None,
            "error": None
        }

    # Dispatch to background thread pool (processed sequentially 1 at a time)
    executor.submit(run_generation_task, job_id, temp_input_path, quality)

    return jobs[job_id]

@app.get("/jobs/{job_id}", response_model=JobResponse)
def get_job_status(job_id: str):
    with jobs_lock:
        if job_id not in jobs:
            raise HTTPException(status_code=404, detail="Job not found")
        return jobs[job_id]

@app.get("/download/{job_id}")
def download_model(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job or job.get("status") != "completed":
            raise HTTPException(status_code=404, detail="Model not ready or job failed")
    
    glb_path = os.path.join(OUTPUTS_DIR, f"{job_id}.glb")
    if not os.path.exists(glb_path):
        raise HTTPException(status_code=404, detail="Model file not found on disk")
        
    return FileResponse(
        path=glb_path,
        media_type="model/gltf-binary",
        filename=f"3dme-{job_id[:8]}.glb"
    )

@app.get("/outputs/{filename}")
def get_output_file(filename: str):
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(OUTPUTS_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    media_type = "model/gltf-binary"
    if safe_filename.endswith(".stl"):
        media_type = "model/stl"
    elif safe_filename.endswith(".obj"):
        media_type = "text/plain"
    elif safe_filename.endswith(".png"):
        media_type = "image/png"
    elif safe_filename.endswith(".jpg") or safe_filename.endswith(".jpeg"):
        media_type = "image/jpeg"
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=safe_filename
    )

@app.get("/models/decimate/status")
def get_decimate_status():
    """Reports status and engine availability for mesh decimation."""
    return scan_import.get_decimation_status()

@app.post("/models/import")
async def import_scan_model(file: UploadFile = File(...)):
    """
    Imports a 3D scan or mesh file (.glb, .gltf, .obj, .stl; max 100 MB).
    Computes geometric stats, watertightness, loose components, and units suspicion.
    Stores the imported mesh in outputs/ as a GLB.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    content = await file.read()
    try:
        mesh = scan_import.load_and_validate_mesh(content, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to load scan mesh: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to parse 3D mesh: {e}")

    scan_id = f"scan_{uuid.uuid4().hex[:10]}"
    output_glb = os.path.join(OUTPUTS_DIR, f"{scan_id}.glb")
    orig_glb = os.path.join(OUTPUTS_DIR, f"{scan_id}_orig.glb")

    try:
        mesh.export(output_glb)
        mesh.export(orig_glb)
    except Exception as e:
        logger.error(f"Failed to export imported GLB: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to save imported model: {e}")

    stats = scan_import.compute_mesh_stats(mesh)
    units_suspected, suggested_factor, unit_hint = scan_import.detect_units(mesh)
    file_size = os.path.getsize(output_glb)

    with jobs_lock:
        jobs[scan_id] = {
            "job_id": scan_id,
            "status": "completed",
            "progress": 100,
            "message": f"Scan '{file.filename}' imported successfully",
            "glb_url": f"/outputs/{scan_id}.glb",
            "download_url": f"/outputs/{scan_id}.glb",
            "generation_time": 0.0,
            "file_size": file_size,
            "vertex_count": stats["vertices"],
            "face_count": stats["triangles"],
            "name": file.filename,
            "tag": "scan",
        }

    return {
        "status": "success",
        "id": scan_id,
        "job_id": scan_id,
        "name": file.filename,
        "tag": "scan",
        "glb_url": f"/outputs/{scan_id}.glb",
        "download_url": f"/outputs/{scan_id}.glb",
        "file_size": file_size,
        "stats": stats,
        "units_suspected": units_suspected,
        "suggested_scale_factor": suggested_factor,
        "unit_hint": unit_hint,
        "warning": "Scans are surface models. Use CAD mode for parts with exact holes and mating surfaces."
    }

@app.post("/models/{model_id}/cleanup")
def cleanup_model(model_id: str, req: CleanupRequest):
    """
    Applies cleanup tools (remove floating components, fill holes, center and ground, decimate)
    to a COPY of the model, keeping the original untouched.
    Exports GLB, STL, and OBJ formats.
    """
    safe_id = os.path.basename(model_id.replace(".glb", ""))
    orig_path = os.path.join(OUTPUTS_DIR, f"{safe_id}_orig.glb")
    if not os.path.exists(orig_path):
        orig_path = os.path.join(OUTPUTS_DIR, f"{safe_id}.glb")

    if not os.path.exists(orig_path):
        raise HTTPException(status_code=404, detail=f"Model '{safe_id}' not found.")

    try:
        orig_mesh = trimesh.load(orig_path, force="mesh")
        if isinstance(orig_mesh, trimesh.Scene):
            orig_mesh = trimesh.util.concatenate([g for g in orig_mesh.geometry.values() if isinstance(g, trimesh.Trimesh)])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not load model geometry: {e}")

    before_stats = scan_import.compute_mesh_stats(orig_mesh)

    try:
        cleaned_mesh, logs = scan_import.apply_cleanup(
            original_mesh=orig_mesh,
            remove_floating=req.remove_floating,
            floating_threshold_pct=req.floating_threshold_pct,
            fill_holes=req.fill_holes,
            center_and_ground=req.center_and_ground,
            decimate=req.decimate,
            target_triangles=req.target_triangles
        )
    except Exception as e:
        logger.error(f"Cleanup processing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {e}")

    cleaned_id = f"{safe_id}_cleaned"
    out_glb = os.path.join(OUTPUTS_DIR, f"{cleaned_id}.glb")
    out_stl = os.path.join(OUTPUTS_DIR, f"{cleaned_id}.stl")
    out_obj = os.path.join(OUTPUTS_DIR, f"{cleaned_id}.obj")

    try:
        cleaned_mesh.export(out_glb)
        cleaned_mesh.export(out_stl)
        cleaned_mesh.export(out_obj)
    except Exception as e:
        logger.error(f"Failed to export cleaned formats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to export cleaned files: {e}")

    after_stats = scan_import.compute_mesh_stats(cleaned_mesh)
    file_size = os.path.getsize(out_glb)

    with jobs_lock:
        jobs[cleaned_id] = {
            "job_id": cleaned_id,
            "status": "completed",
            "progress": 100,
            "message": "Scan cleanup completed",
            "glb_url": f"/outputs/{cleaned_id}.glb",
            "download_url": f"/outputs/{cleaned_id}.glb",
            "generation_time": 0.0,
            "file_size": file_size,
            "vertex_count": after_stats["vertices"],
            "face_count": after_stats["triangles"],
            "name": f"{safe_id} (Cleaned)",
            "tag": "scan",
        }

    return {
        "status": "success",
        "original_id": safe_id,
        "cleaned_id": cleaned_id,
        "glb_url": f"/outputs/{cleaned_id}.glb",
        "stl_url": f"/outputs/{cleaned_id}.stl",
        "obj_url": f"/outputs/{cleaned_id}.obj",
        "download_url": f"/outputs/{cleaned_id}.glb",
        "file_size": file_size,
        "before_stats": before_stats,
        "after_stats": after_stats,
        "changes": logs,
        "warning": "Scans are surface models. Use CAD mode for parts with exact holes and mating surfaces."
    }

@app.post("/models/scale")
def scale_model(req: ScaleRequest):
    """
    Applies uniform trimesh scaling to a copy of a GLB model based on a measured real-world length
    along a specific axis (X, Y, or Z). Original model remains completely untouched.
    """
    import trimesh
    safe_id = os.path.basename(req.model_id.replace(".glb", ""))
    input_path = os.path.join(OUTPUTS_DIR, f"{safe_id}.glb")
    if not os.path.exists(input_path):
        raise HTTPException(status_code=404, detail=f"Model '{safe_id}.glb' not found.")

    try:
        scene_or_mesh = trimesh.load(input_path)
        extents = scene_or_mesh.extents

        if req.scale_factor is not None and req.scale_factor > 0:
            scale_factor = float(req.scale_factor)
            axis = "uniform"
            target_length = round(float(extents[0] * scale_factor), 2)
        else:
            if req.target_length_mm is None or req.target_length_mm <= 0:
                raise HTTPException(status_code=400, detail="Target length must be greater than 0 mm.")
            axis = (req.axis or "x").lower().strip()
            axis_idx = {"x": 0, "y": 1, "z": 2}.get(axis)
            if axis_idx is None:
                raise HTTPException(status_code=400, detail="Axis must be 'x', 'y', or 'z'.")
            curr_len = float(extents[axis_idx])
            if curr_len < 1e-6:
                raise HTTPException(status_code=400, detail="Current model extent along selected axis is near zero.")
            scale_factor = float(req.target_length_mm) / curr_len
            target_length = req.target_length_mm

        scaled_obj = scene_or_mesh.copy()
        scaled_obj.apply_scale(scale_factor)

        scaled_id = f"{safe_id}_scaled"
        output_path = os.path.join(OUTPUTS_DIR, f"{scaled_id}.glb")
        scaled_obj.export(output_path)

        new_extents = scaled_obj.extents
        dims = [round(float(new_extents[0]), 2), round(float(new_extents[1]), 2), round(float(new_extents[2]), 2)]

        return {
            "status": "success",
            "original_model_id": safe_id,
            "scaled_model_id": scaled_id,
            "scale_factor": round(scale_factor, 6),
            "axis": axis,
            "target_length_mm": target_length,
            "dimensions": {"length": dims[0], "width": dims[1], "height": dims[2]},
            "dimensions_list": dims,
            "glb_url": f"/outputs/{scaled_id}.glb",
            "download_url": f"/outputs/{scaled_id}.glb",
            "warning": "Generated from one photo. Shape is approximate. Not for mating surfaces."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error scaling model {safe_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to scale model: {e}")


# ==========================================
# Local Storage Endpoints (~/.3dme)
# ==========================================

@app.get("/storage/jobs")
def list_stored_jobs(status: Optional[str] = None):
    import storage
    return storage.list_jobs(status=status)

@app.get("/storage/models")
def list_stored_models():
    import storage
    return storage.list_jobs(status="completed")

@app.get("/storage/jobs/{job_id}")
def get_stored_job(job_id: str):
    import storage
    rec = storage.get_job_record(job_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Job not found in local storage")
    return rec

@app.delete("/storage/jobs/{job_id}")
def delete_stored_job(job_id: str):
    import storage
    success = storage.delete_job_record(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found in local storage")
    return {"status": "success", "message": f"Job {job_id} deleted"}

@app.get("/storage/files/{filename}")
def get_stored_file(filename: str):
    import storage
    safe_fn = os.path.basename(filename)
    path = os.path.join(storage.MODELS_DIR, safe_fn)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"File {safe_fn} not found in ~/.3dme/models/")
    media = "model/gltf-binary"
    if safe_fn.endswith(".stl"):
        media = "model/stl"
    elif safe_fn.endswith(".3mf"):
        media = "application/vnd.ms-package.3dmanufacturing-3dmodel+xml"
    return FileResponse(path, media_type=media, filename=safe_fn)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
