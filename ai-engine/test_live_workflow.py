import sys
import time
import httpx
import trimesh

BASE_URL = "http://localhost:3000/api/engine"

def run_live_test():
    print("==================================================")
    print("STARTING FULL LIVE VERIFICATION CHAIN (via Next.js)")
    print(f"Target: {BASE_URL}")
    print("==================================================")

    client = httpx.Client(timeout=60.0)

    # Step 1: Plan initial design
    print("\n--- Step 1: Plan initial design ---")
    prompt_1 = "Cat-style head case for an ESP32 and a 0.96in OLED, big window for the screen, stubby arms, small hole at the bottom front"
    t0 = time.time()
    resp = client.post(f"{BASE_URL}/cad/session", json={"prompt": prompt_1})
    t_step1 = time.time() - t0
    assert resp.status_code == 200, f"Step 1 failed ({resp.status_code}): {resp.text}"
    data = resp.json()
    sid = data["session_id"]
    print(f"  ✓ Session created: {sid} in {t_step1:.2f}s")
    print(f"  Version: {data['version']}")
    print(f"  Diff log: {data['diff_log']}")
    print(f"  Appendages: {[a.get('name') for a in data['spec'].get('appendages', [])]}")
    print(f"  Windows: {[w.get('name', w.get('id')) for w in data['spec'].get('windows', [])]}")
    print(f"  Issues: {data.get('issues')}")

    # Step 2: Edit: ears 4 mm taller
    print("\n--- Step 2: Edit: ears 4 mm taller ---")
    prompt_2 = "ears 4 mm taller"
    t0 = time.time()
    resp = client.post(f"{BASE_URL}/cad/session/{sid}/edit", json={"prompt": prompt_2})
    t_step2 = time.time() - t0
    assert resp.status_code == 200, f"Step 2 failed ({resp.status_code}): {resp.text}"
    data = resp.json()
    print(f"  ✓ Step 2 in {t_step2:.2f}s")
    print(f"  Version: {data['version']}")
    print(f"  Diff: {data.get('last_diff')}")
    print(f"  Recent diffs: {data['diff_log']}")

    # Step 3: Edit: arms tilted down 15 degrees
    print("\n--- Step 3: Edit: arms tilted down 15 degrees ---")
    prompt_3 = "arms tilted down 15 degrees"
    t0 = time.time()
    resp = client.post(f"{BASE_URL}/cad/session/{sid}/edit", json={"prompt": prompt_3})
    t_step3 = time.time() - t0
    assert resp.status_code == 200, f"Step 3 failed ({resp.status_code}): {resp.text}"
    data = resp.json()
    print(f"  ✓ Step 3 in {t_step3:.2f}s")
    print(f"  Version: {data['version']}")
    print(f"  Diff: {data.get('last_diff')}")
    print(f"  Recent diffs: {data['diff_log']}")

    # Step 4: Edit: window 6 mm wider
    print("\n--- Step 4: Edit: window 6 mm wider ---")
    prompt_4 = "window 6 mm wider"
    t0 = time.time()
    resp = client.post(f"{BASE_URL}/cad/session/{sid}/edit", json={"prompt": prompt_4})
    t_step4 = time.time() - t0
    assert resp.status_code == 200, f"Step 4 failed ({resp.status_code}): {resp.text}"
    data = resp.json()
    print(f"  ✓ Step 4 in {t_step4:.2f}s")
    print(f"  Version: {data['version']}")
    print(f"  Diff: {data.get('last_diff')}")
    print(f"  Recent diffs: {data['diff_log']}")

    # Step 5: Edit: add antenna on top
    print("\n--- Step 5: Edit: add antenna on top ---")
    prompt_5 = "add antenna on top"
    t0 = time.time()
    resp = client.post(f"{BASE_URL}/cad/session/{sid}/edit", json={"prompt": prompt_5})
    t_step5 = time.time() - t0
    assert resp.status_code == 200, f"Step 5 failed ({resp.status_code}): {resp.text}"
    data = resp.json()
    print(f"  ✓ Step 5 in {t_step5:.2f}s")
    print(f"  Version: {data['version']}")
    print(f"  Diff: {data.get('last_diff')}")
    print(f"  Recent diffs: {data['diff_log']}")

    # Step 6: Undo twice
    print("\n--- Step 6: Undo twice ---")
    resp = client.post(f"{BASE_URL}/cad/session/{sid}/undo")
    assert resp.status_code == 200, f"Undo 1 failed: {resp.text}"
    data = resp.json()
    print(f"  ✓ Undo 1 -> Version {data['version']}: {data.get('last_diff')}")

    resp = client.post(f"{BASE_URL}/cad/session/{sid}/undo")
    assert resp.status_code == 200, f"Undo 2 failed: {resp.text}"
    data = resp.json()
    print(f"  ✓ Undo 2 -> Version {data['version']}: {data.get('last_diff')}")

    # Step 7: Build enclosure
    print("\n--- Step 7: Build enclosure (< 30s on M1) ---")
    t0 = time.time()
    resp = client.post(f"{BASE_URL}/cad/build", json=data["spec"])
    build_time = time.time() - t0
    assert resp.status_code == 200, f"Build failed ({resp.status_code}): {resp.text}"
    bdata = resp.json()
    job_id = bdata["id"]
    files = bdata["files"]
    print(f"  ✓ Build completed in {build_time:.2f}s (target < 30s)")
    print(f"  Job ID: {job_id}")
    print(f"  Files generated: {list(files.keys())}")

    # Download & Watertight check
    print("\n--- Downloading artifacts and verifying watertightness ---")
    for ftype in ["shell_stl", "cover_stl", "both_glb", "shell_step", "ghost_glb"]:
        fpath = files.get(ftype)
        assert fpath, f"Missing file {ftype}"
        fresp = client.get(f"{BASE_URL}{fpath}")
        assert fresp.status_code == 200, f"Failed to download {fpath}: {fresp.status_code}"
        print(f"  ✓ Downloaded {ftype}: {len(fresp.content)} bytes")

        if ftype == "shell_stl":
            mesh = trimesh.load(trimesh.util.wrap_as_stream(fresp.content), file_type="stl")
            print(f"    Front shell is_watertight: {mesh.is_watertight}, volume: {mesh.volume:.1f} mm³")
            assert mesh.is_watertight, "Front shell STL must be watertight"
        elif ftype == "cover_stl":
            mesh = trimesh.load(trimesh.util.wrap_as_stream(fresp.content), file_type="stl")
            print(f"    Back cover is_watertight: {mesh.is_watertight}, volume: {mesh.volume:.1f} mm³")
            assert mesh.is_watertight, "Back cover STL must be watertight"

    print("\n==================================================")
    print("ALL LIVE VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("==================================================")

if __name__ == "__main__":
    run_live_test()
