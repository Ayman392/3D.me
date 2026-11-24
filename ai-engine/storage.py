"""
storage.py - Local SQLite & Filesystem Storage Layer for 3d.me

Features:
- Stores 3D model files in ~/.3dme/models/
- Manages metadata, jobs, and history in SQLite at ~/.3dme/jobs.db
- Provides clean CRUD operations for /models and /history
"""

import os
import sqlite3
import shutil
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

logger = logging.getLogger("3dme.storage")

DOT_3DME_DIR = os.path.expanduser("~/.3dme")
MODELS_DIR = os.path.join(DOT_3DME_DIR, "models")
DB_PATH = os.path.join(DOT_3DME_DIR, "jobs.db")


def init_storage():
    """Initializes ~/.3dme directories and SQLite database schema."""
    os.makedirs(MODELS_DIR, exist_ok=True)
    try:
        with sqlite3.connect(DB_PATH, timeout=20.0) as conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA busy_timeout=10000;")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    source_type TEXT,
                    prompt TEXT,
                    status TEXT,
                    quality TEXT,
                    glb_filename TEXT,
                    stl_filename TEXT,
                    three_mf_filename TEXT,
                    source_image_preview TEXT,
                    file_size INTEGER,
                    vertex_count INTEGER,
                    face_count INTEGER,
                    generation_time REAL,
                    print_report_json TEXT,
                    created_at TEXT
                );
            """)
            # Dynamic schema migration for Phase 6 CAD attributes
            cursor.execute("PRAGMA table_info(jobs);")
            cols = [row[1] for row in cursor.fetchall()]
            if "step_filename" not in cols:
                cursor.execute("ALTER TABLE jobs ADD COLUMN step_filename TEXT;")
            if "template_name" not in cols:
                cursor.execute("ALTER TABLE jobs ADD COLUMN template_name TEXT;")
            if "parameters_json" not in cols:
                cursor.execute("ALTER TABLE jobs ADD COLUMN parameters_json TEXT;")
            conn.commit()
            logger.info(f"Initialized local storage at {DOT_3DME_DIR}")
    except Exception as e:
        logger.error(f"Failed to initialize SQLite at {DB_PATH}: {e}", exc_info=True)


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.execute("PRAGMA busy_timeout=10000;")
    conn.row_factory = sqlite3.Row
    return conn


def save_job_record(
    job_id: str,
    name: Optional[str] = None,
    source_type: str = "image",
    prompt: Optional[str] = None,
    status: str = "completed",
    quality: str = "Final",
    glb_src_path: Optional[str] = None,
    stl_src_path: Optional[str] = None,
    three_mf_src_path: Optional[str] = None,
    source_image_preview: Optional[str] = None,
    file_size: Optional[int] = None,
    vertex_count: Optional[int] = None,
    face_count: Optional[int] = None,
    generation_time: Optional[float] = None,
    print_report: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Copies exported 3D files to ~/.3dme/models/ and persists the record into SQLite.
    """
    init_storage()

    glb_filename = None
    if glb_src_path and os.path.exists(glb_src_path):
        glb_filename = f"{job_id}.glb"
        dest = os.path.join(MODELS_DIR, glb_filename)
        if os.path.abspath(glb_src_path) != os.path.abspath(dest):
            shutil.copy2(glb_src_path, dest)
        if not file_size:
            file_size = os.path.getsize(dest)

    stl_filename = None
    if stl_src_path and os.path.exists(stl_src_path):
        stl_filename = f"{job_id}.stl"
        dest = os.path.join(MODELS_DIR, stl_filename)
        if os.path.abspath(stl_src_path) != os.path.abspath(dest):
            shutil.copy2(stl_src_path, dest)

    three_mf_filename = None
    if three_mf_src_path and os.path.exists(three_mf_src_path):
        three_mf_filename = f"{job_id}.3mf"
        dest = os.path.join(MODELS_DIR, three_mf_filename)
        if os.path.abspath(three_mf_src_path) != os.path.abspath(dest):
            shutil.copy2(three_mf_src_path, dest)

    created_at = datetime.now(timezone.utc).isoformat()
    report_json = json.dumps(print_report) if print_report else None

    if not name:
        name = f"Model {job_id[:8]}"

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO jobs (
                id, name, source_type, prompt, status, quality,
                glb_filename, stl_filename, three_mf_filename,
                source_image_preview, file_size, vertex_count, face_count,
                generation_time, print_report_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                status=excluded.status,
                quality=excluded.quality,
                glb_filename=COALESCE(excluded.glb_filename, jobs.glb_filename),
                stl_filename=COALESCE(excluded.stl_filename, jobs.stl_filename),
                three_mf_filename=COALESCE(excluded.three_mf_filename, jobs.three_mf_filename),
                source_image_preview=COALESCE(excluded.source_image_preview, jobs.source_image_preview),
                file_size=COALESCE(excluded.file_size, jobs.file_size),
                vertex_count=COALESCE(excluded.vertex_count, jobs.vertex_count),
                face_count=COALESCE(excluded.face_count, jobs.face_count),
                generation_time=COALESCE(excluded.generation_time, jobs.generation_time),
                print_report_json=COALESCE(excluded.print_report_json, jobs.print_report_json)
        """, (
            job_id, name, source_type, prompt, status, quality,
            glb_filename, stl_filename, three_mf_filename,
            source_image_preview, file_size, vertex_count, face_count,
            generation_time, report_json, created_at
        ))
        conn.commit()

    return get_job_record(job_id) or {}


def save_job(job: Dict[str, Any]) -> Dict[str, Any]:
    """Convenience wrapper taking a job dictionary and saving to SQLite and disk."""
    job_id = job.get("job_id") or job.get("id")
    if not job_id:
        raise ValueError("Job dict must contain 'job_id' or 'id'")

    prompt = job.get("prompt")
    name = job.get("name") or (f"Text3D: {prompt[:30]}" if prompt else f"Model {job_id[:8]}")
    source_type = job.get("source_type", "text3d" if prompt else "image")

    glb_filename = job.get("glb_filename") or f"{job_id}.glb"
    stl_filename = job.get("stl_filename") or f"{job_id}.stl"
    three_mf_filename = job.get("three_mf_filename") or f"{job_id}.3mf"

    outputs_dir = os.path.join(os.path.dirname(__file__), "outputs")
    glb_path = os.path.join(outputs_dir, glb_filename)
    if not os.path.exists(glb_path):
        glb_path = os.path.join(MODELS_DIR, glb_filename)

    stl_path = os.path.join(outputs_dir, stl_filename)
    if not os.path.exists(stl_path):
        stl_path = os.path.join(MODELS_DIR, stl_filename)

    three_mf_path = os.path.join(outputs_dir, three_mf_filename)
    if not os.path.exists(three_mf_path):
        three_mf_path = os.path.join(MODELS_DIR, three_mf_filename)

    selected_cand = job.get("selected_candidate")
    preview = job.get("source_image_preview")
    if not preview and selected_cand is not None:
        preview = f"/outputs/{job_id}_cand_{selected_cand}.png"

    return save_job_record(
        job_id=job_id,
        name=name,
        source_type=source_type,
        prompt=prompt,
        status=job.get("status", "completed"),
        quality=job.get("quality_mode") or job.get("quality", "Final"),
        glb_src_path=glb_path if os.path.exists(glb_path) else None,
        stl_src_path=stl_path if os.path.exists(stl_path) else None,
        three_mf_src_path=three_mf_path if os.path.exists(three_mf_path) else None,
        source_image_preview=preview,
        file_size=job.get("file_size"),
        vertex_count=job.get("vertex_count"),
        face_count=job.get("face_count"),
        generation_time=job.get("generation_time"),
        print_report=job.get("print_report"),
    )


def list_jobs(status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    """Returns list of jobs from SQLite ordered by creation time descending."""
    init_storage()
    query = "SELECT * FROM jobs"
    params = []
    if status:
        query += " WHERE status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    results = []
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        for row in rows:
            d = dict(row)
            if d.get("print_report_json"):
                try:
                    d["print_report"] = json.loads(d["print_report_json"])
                except Exception:
                    d["print_report"] = None
            d.pop("print_report_json", None)

            # Build URL endpoints
            if d.get("glb_filename"):
                d["glb_url"] = f"/api/engine/storage/files/{d['glb_filename']}"
            if d.get("stl_filename"):
                d["stl_url"] = f"/api/engine/storage/files/{d['stl_filename']}"
            if d.get("three_mf_filename"):
                d["three_mf_url"] = f"/api/engine/storage/files/{d['three_mf_filename']}"
            results.append(d)

    return results


def get_job_record(job_id: str) -> Optional[Dict[str, Any]]:
    """Fetches a single job record by ID."""
    init_storage()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        if d.get("print_report_json"):
            try:
                d["print_report"] = json.loads(d["print_report_json"])
            except Exception:
                d["print_report"] = None
        d.pop("print_report_json", None)

        if d.get("glb_filename"):
            d["glb_url"] = f"/api/engine/storage/files/{d['glb_filename']}"
        if d.get("stl_filename"):
            d["stl_url"] = f"/api/engine/storage/files/{d['stl_filename']}"
        if d.get("three_mf_filename"):
            d["three_mf_url"] = f"/api/engine/storage/files/{d['three_mf_filename']}"
        if d.get("step_filename"):
            d["step_url"] = f"/api/engine/storage/files/{d['step_filename']}"
        if d.get("parameters_json"):
            try:
                d["parameters"] = json.loads(d["parameters_json"])
            except Exception:
                d["parameters"] = {}
        return d


def delete_job_record(job_id: str) -> bool:
    """Deletes job record from SQLite and associated files from ~/.3dme/models/."""
    init_storage()
    rec = get_job_record(job_id)
    if not rec:
        return False

    for key in ("glb_filename", "stl_filename", "three_mf_filename", "step_filename"):
        fn = rec.get(key)
        if fn:
            p = os.path.join(MODELS_DIR, fn)
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception as e:
                    logger.warning(f"Failed to delete {p}: {e}")

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        conn.commit()

    return True


def save_cad_template_job(
    job_id: str,
    template_name: str,
    parameters: Dict[str, Any],
    prompt: str = "",
    glb_src_path: Optional[str] = None,
    stl_src_path: Optional[str] = None,
    step_src_path: Optional[str] = None,
    report: Optional[Dict[str, Any]] = None,
    generation_time: float = 0.0
) -> Dict[str, Any]:
    """Stores a Build123d parametric CAD recipe and files in SQLite and ~/.3dme/models/."""
    init_storage()
    glb_fn = f"{job_id}.glb" if glb_src_path and os.path.exists(glb_src_path) else None
    if glb_fn:
        dest = os.path.join(MODELS_DIR, glb_fn)
        if os.path.abspath(glb_src_path) != os.path.abspath(dest):
            shutil.copy2(glb_src_path, dest)

    stl_fn = f"{job_id}.stl" if stl_src_path and os.path.exists(stl_src_path) else None
    if stl_fn:
        dest = os.path.join(MODELS_DIR, stl_fn)
        if os.path.abspath(stl_src_path) != os.path.abspath(dest):
            shutil.copy2(stl_src_path, dest)

    step_fn = f"{job_id}.step" if step_src_path and os.path.exists(step_src_path) else None
    if step_fn:
        dest = os.path.join(MODELS_DIR, step_fn)
        if os.path.abspath(step_src_path) != os.path.abspath(dest):
            shutil.copy2(step_src_path, dest)

    created_at = datetime.now(timezone.utc).isoformat()
    file_size = os.path.getsize(os.path.join(MODELS_DIR, glb_fn)) if glb_fn and os.path.exists(os.path.join(MODELS_DIR, glb_fn)) else 0

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO jobs (
                id, name, source_type, prompt, status, quality,
                glb_filename, stl_filename, step_filename, template_name,
                parameters_json, file_size, generation_time, print_report_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            job_id,
            f"CAD: {template_name.replace('_', ' ').title()}",
            "cad_template",
            prompt,
            "completed",
            "Final",
            glb_fn,
            stl_fn,
            step_fn,
            template_name,
            json.dumps(parameters),
            file_size,
            generation_time,
            json.dumps(report) if report else None,
            created_at
        ))
        conn.commit()

    return get_job_record(job_id) or {}
