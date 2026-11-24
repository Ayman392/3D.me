import io
import os
import trimesh
import numpy as np
from fastapi.testclient import TestClient
from app import app, OUTPUTS_DIR
import scan_import

def test_scan_import_and_cleanups():
    print("--- Running test_scan_import_and_cleanups ---")
    client = TestClient(app)

    # 1. Decimation status endpoint
    d_res = client.get("/models/decimate/status")
    assert d_res.status_code == 200
    assert d_res.json()["available"] is True
    print(f"  ✓ Decimation status: {d_res.json()['engine']}")

    # 2. Synthetic GLB, OBJ, STL imports
    base_mesh = trimesh.creation.icosphere(subdivisions=2, radius=15.0)

    # GLB import
    glb_bytes = base_mesh.export(file_type="glb")
    res_glb = client.post(
        "/models/import",
        files={"file": ("sample_scan.glb", glb_bytes, "model/gltf-binary")}
    )
    assert res_glb.status_code == 200, f"GLB import failed: {res_glb.text}"
    data_glb = res_glb.json()
    assert data_glb["tag"] == "scan"
    assert data_glb["stats"]["vertices"] > 0
    assert data_glb["stats"]["triangles"] > 0
    assert data_glb["units_suspected"] == "millimeters"
    model_id = data_glb["id"]
    print(f"  ✓ GLB scan imported: {model_id} ({data_glb['stats']['triangles']} tris)")

    # OBJ import
    obj_bytes = base_mesh.export(file_type="obj").encode("utf-8")
    res_obj = client.post(
        "/models/import",
        files={"file": ("sample_scan.obj", obj_bytes, "text/plain")}
    )
    assert res_obj.status_code == 200
    assert res_obj.json()["stats"]["triangles"] > 0
    print("  ✓ OBJ scan imported")

    # STL import
    stl_bytes = base_mesh.export(file_type="stl")
    res_stl = client.post(
        "/models/import",
        files={"file": ("sample_scan.stl", stl_bytes, "model/stl")}
    )
    assert res_stl.status_code == 200
    assert res_stl.json()["stats"]["triangles"] > 0
    print("  ✓ STL scan imported")

    # 3. Unit hints detection
    # Small mesh (< 2 units -> likely meters)
    small_mesh = base_mesh.copy()
    small_mesh.apply_scale(0.005)  # largest extent ~0.15
    small_bytes = small_mesh.export(file_type="glb")
    res_small = client.post(
        "/models/import",
        files={"file": ("meters_scan.glb", small_bytes, "model/gltf-binary")}
    )
    assert res_small.status_code == 200
    assert res_small.json()["units_suspected"] == "meters"
    assert res_small.json()["suggested_scale_factor"] == 1000.0
    print("  ✓ Unit hint correctly identified meters (< 2.0 extent)")

    # Huge mesh (> 5000 units -> likely micrometers)
    huge_mesh = base_mesh.copy()
    huge_mesh.apply_scale(300.0)  # largest extent ~9000
    huge_bytes = huge_mesh.export(file_type="glb")
    res_huge = client.post(
        "/models/import",
        files={"file": ("microns_scan.glb", huge_bytes, "model/gltf-binary")}
    )
    assert res_huge.status_code == 200
    assert res_huge.json()["units_suspected"] == "micrometers"
    assert res_huge.json()["suggested_scale_factor"] == 0.001
    print("  ✓ Unit hint correctly identified micrometers (> 5000 extent)")

    # 4. Floating fragments removal
    main_sphere = trimesh.creation.icosphere(subdivisions=2, radius=20.0)  # 320 faces
    tiny_frag = trimesh.creation.icosphere(subdivisions=0, radius=2.0)  # 20 faces (<10% of main)
    tiny_frag.apply_translation([50.0, 0.0, 0.0])
    combined_mesh = trimesh.util.concatenate([main_sphere, tiny_frag])
    comb_bytes = combined_mesh.export(file_type="glb")

    res_comb = client.post(
        "/models/import",
        files={"file": ("fragmented.glb", comb_bytes, "model/gltf-binary")}
    )
    comb_id = res_comb.json()["id"]
    assert res_comb.json()["stats"]["loose_components"] == 2

    # Cleanup with remove_floating=True
    res_clean_frag = client.post(
        f"/models/{comb_id}/cleanup",
        json={"remove_floating": True, "floating_threshold_pct": 10.0}
    )
    assert res_clean_frag.status_code == 200
    clean_frag_data = res_clean_frag.json()
    assert clean_frag_data["after_stats"]["loose_components"] == 1
    assert clean_frag_data["after_stats"]["triangles"] < clean_frag_data["before_stats"]["triangles"]
    print(f"  ✓ Floating fragment removal reduced loose components from 2 to {clean_frag_data['after_stats']['loose_components']}")

    # 5. Decimation test
    high_poly = trimesh.creation.icosphere(subdivisions=4, radius=25.0)  # 5,120 faces
    hp_bytes = high_poly.export(file_type="glb")
    res_hp = client.post(
        "/models/import",
        files={"file": ("high_poly.glb", hp_bytes, "model/gltf-binary")}
    )
    hp_id = res_hp.json()["id"]
    orig_faces = res_hp.json()["stats"]["triangles"]

    target_faces = 600
    res_dec = client.post(
        f"/models/{hp_id}/cleanup",
        json={"decimate": True, "target_triangles": target_faces, "center_and_ground": True}
    )
    assert res_dec.status_code == 200
    dec_data = res_dec.json()
    after_faces = dec_data["after_stats"]["triangles"]
    assert after_faces < orig_faces
    assert abs(after_faces - target_faces) < 150
    print(f"  ✓ Decimation reduced faces from {orig_faces} to {after_faces} (target {target_faces})")

    # Verify export URLs
    assert os.path.exists(os.path.join(OUTPUTS_DIR, f"{dec_data['cleaned_id']}.stl"))
    assert os.path.exists(os.path.join(OUTPUTS_DIR, f"{dec_data['cleaned_id']}.obj"))
    get_stl = client.get(dec_data["stl_url"])
    assert get_stl.status_code == 200
    get_obj = client.get(dec_data["obj_url"])
    assert get_obj.status_code == 200
    print("  ✓ STL and OBJ exports verified and downloadable")

    # 6. Bad files rejection
    bad_bytes = b"not a 3d model at all just random junk text"
    res_bad = client.post(
        "/models/import",
        files={"file": ("broken.stl", bad_bytes, "model/stl")}
    )
    assert res_bad.status_code == 400
    print("  ✓ Corrupt/non-mesh file rejected with 400")

    # Bad extension
    res_ext = client.post(
        "/models/import",
        files={"file": ("something.exe", b"123", "application/octet-stream")}
    )
    assert res_ext.status_code == 400
    print("  ✓ Invalid extension rejected with 400")

    print("test_scan_import_and_cleanups PASSED!\n")

if __name__ == "__main__":
    test_scan_import_and_cleanups()
