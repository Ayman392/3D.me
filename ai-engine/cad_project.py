import os
import re
import json
import shutil
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

logger = logging.getLogger("3dme.projects")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")
PROJECTS_DIR = os.path.join(OUTPUTS_DIR, "projects")
os.makedirs(PROJECTS_DIR, exist_ok=True)


def sanitize_project_id(project_id: str) -> str:
    """
    Validates project ID to strictly allow alphanumeric, underscore, and hyphen (1-64 chars).
    Prevents path traversal attacks.
    """
    if not project_id or not isinstance(project_id, str):
        raise ValueError("Project ID cannot be empty.")
    clean = project_id.strip()
    if not re.match(r"^[a-zA-Z0-9_-]{1,64}$", clean):
        raise ValueError(f"Invalid project ID '{clean}'. Must be alphanumeric with '-' or '_' (max 64 chars).")
    
    # Path traversal safety check
    target_dir = os.path.abspath(os.path.join(PROJECTS_DIR, clean))
    if not target_dir.startswith(os.path.abspath(PROJECTS_DIR)):
        raise ValueError(f"Path traversal detected for project ID '{clean}'.")
    return clean


def get_project_dir(project_id: str) -> str:
    safe_id = sanitize_project_id(project_id)
    return os.path.join(PROJECTS_DIR, safe_id)


def list_projects() -> List[Dict[str, Any]]:
    """Returns a list of all saved projects with summary metadata, sorted by updated timestamp desc."""
    projects = []
    if not os.path.exists(PROJECTS_DIR):
        return []

    for entry in os.scandir(PROJECTS_DIR):
        if entry.is_dir():
            p_json = os.path.join(entry.path, "project.json")
            if os.path.exists(p_json):
                try:
                    with open(p_json, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    
                    has_thumb = os.path.exists(os.path.join(entry.path, "thumbnail.png"))
                    projects.append({
                        "id": data.get("id", entry.name),
                        "name": data.get("name", "Untitled Project"),
                        "created": data.get("created", ""),
                        "updated": data.get("updated", ""),
                        "last_build_id": data.get("last_build_id"),
                        "thumbnail": f"/cad/projects/{data.get('id', entry.name)}/thumbnail.png" if has_thumb else None,
                        "mode": data.get("spec", {}).get("mode", "enclosure"),
                        "part_type": data.get("spec", {}).get("part_type"),
                    })
                except Exception as e:
                    logger.warning(f"Failed to read project at {p_json}: {e}")

    # Sort descending by updated timestamp
    projects.sort(key=lambda p: p.get("updated") or "", reverse=True)
    return projects


def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves full project details including spec and version history."""
    p_dir = get_project_dir(project_id)
    p_json = os.path.join(p_dir, "project.json")
    if not os.path.exists(p_json):
        return None
    with open(p_json, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    has_thumb = os.path.exists(os.path.join(p_dir, "thumbnail.png"))
    data["thumbnail"] = f"/cad/projects/{data.get('id')}/thumbnail.png" if has_thumb else None

    ref_photo = None
    for ext in ("jpg", "jpeg", "png", "webp"):
        if os.path.exists(os.path.join(p_dir, f"reference.{ext}")):
            ref_photo = f"/cad/projects/{data.get('id')}/files/reference.{ext}"
            break
    data["reference_photo"] = ref_photo
    return data


def create_project(data: Dict[str, Any]) -> Dict[str, Any]:
    """Creates a new project record and directory."""
    raw_id = data.get("id") or f"proj_{uuid.uuid4().hex[:10]}"
    project_id = sanitize_project_id(raw_id)
    p_dir = get_project_dir(project_id)
    os.makedirs(p_dir, exist_ok=True)

    now_iso = datetime.now(timezone.utc).isoformat()
    project = {
        "id": project_id,
        "name": data.get("name") or "Untitled Project",
        "created": data.get("created") or now_iso,
        "updated": now_iso,
        "spec": data.get("spec") or {},
        "version_history": data.get("version_history") or [],
        "last_build_id": data.get("last_build_id"),
    }

    p_json = os.path.join(p_dir, "project.json")
    with open(p_json, "w", encoding="utf-8") as f:
        json.dump(project, f, indent=2)

    return project


def update_project(project_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Updates an existing project (name, spec, version history, or build id)."""
    current = get_project(project_id)
    if not current:
        raise FileNotFoundError(f"Project '{project_id}' not found.")

    p_dir = get_project_dir(project_id)
    now_iso = datetime.now(timezone.utc).isoformat()

    if "name" in updates and updates["name"]:
        current["name"] = updates["name"].strip()
    if "spec" in updates and updates["spec"] is not None:
        current["spec"] = updates["spec"]
    if "version_history" in updates and updates["version_history"] is not None:
        current["version_history"] = updates["version_history"]
    if "last_build_id" in updates and updates["last_build_id"] is not None:
        current["last_build_id"] = updates["last_build_id"]

    current["updated"] = now_iso

    p_json = os.path.join(p_dir, "project.json")
    with open(p_json, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2)

    return current


def delete_project(project_id: str) -> bool:
    """Deletes the project directory and all contained files."""
    p_dir = get_project_dir(project_id)
    if os.path.exists(p_dir):
        shutil.rmtree(p_dir)
        return True
    return False


def duplicate_project(project_id: str) -> Dict[str, Any]:
    """Duplicates a project under a new ID and appends '(Copy)' to its name."""
    source = get_project(project_id)
    if not source:
        raise FileNotFoundError(f"Source project '{project_id}' not found.")

    new_id = f"proj_{uuid.uuid4().hex[:10]}"
    source_dir = get_project_dir(project_id)
    dest_dir = get_project_dir(new_id)

    # Copy entire directory (includes latest build files and thumbnail)
    shutil.copytree(source_dir, dest_dir)

    now_iso = datetime.now(timezone.utc).isoformat()
    new_project = dict(source)
    new_project["id"] = new_id
    new_project["name"] = f"{source.get('name', 'Untitled')} (Copy)"
    new_project["created"] = now_iso
    new_project["updated"] = now_iso

    p_json = os.path.join(dest_dir, "project.json")
    with open(p_json, "w", encoding="utf-8") as f:
        json.dump(new_project, f, indent=2)

    return new_project


def save_thumbnail(project_id: str, image_bytes: bytes) -> str:
    """Saves a small PNG thumbnail for the project."""
    p_dir = get_project_dir(project_id)
    os.makedirs(p_dir, exist_ok=True)
    thumb_path = os.path.join(p_dir, "thumbnail.png")
    with open(thumb_path, "wb") as f:
        f.write(image_bytes)
    return f"/cad/projects/{project_id}/thumbnail.png"


def save_reference_photo(project_id: str, image_bytes: bytes, ext: str = "jpg") -> str:
    """Saves an uploaded reference photo in the project directory."""
    clean_ext = ext.lower().replace(".", "").strip()
    if clean_ext not in ("jpg", "jpeg", "png", "webp"):
        clean_ext = "jpg"
    p_dir = get_project_dir(project_id)
    os.makedirs(p_dir, exist_ok=True)
    filename = f"reference.{clean_ext}"
    target_path = os.path.join(p_dir, filename)
    with open(target_path, "wb") as f:
        f.write(image_bytes)
    return f"/cad/projects/{project_id}/files/{filename}"


def attach_build_files(project_id: str, build_id: str, files_map: Dict[str, str]) -> Dict[str, str]:
    """
    Copies latest build artifacts from outputs/cad/<build_id>/ into outputs/projects/<project_id>/.
    Returns updated file paths relative to project.
    """
    p_dir = get_project_dir(project_id)
    os.makedirs(p_dir, exist_ok=True)

    project_files = {}
    for key, rel_path in files_map.items():
        if not rel_path:
            continue
        # rel_path is typically /cad/<build_id>/<filename>
        fname = os.path.basename(rel_path)
        src_path = os.path.join(OUTPUTS_DIR, "cad", build_id, fname)
        if os.path.exists(src_path):
            dst_path = os.path.join(p_dir, fname)
            shutil.copy2(src_path, dst_path)
            project_files[key] = f"/cad/projects/{project_id}/files/{fname}"

    # Update project's last_build_id
    update_project(project_id, {"last_build_id": build_id})
    return project_files
