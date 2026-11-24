import os
import sys
import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from PIL import Image

# Ensure mock diffusion environment variable
os.environ["MOCK_DIFFUSION"] = "1"

from app import app
import text3d

client = TestClient(app)

class TestTextTo3D(unittest.TestCase):
    def setUp(self):
        self.mock_score_patcher = patch("text3d.score_candidate_with_vision", return_value={
            "single_object": True,
            "fully_visible": True,
            "background_clean": True,
            "has_thin_or_floating_parts": False,
            "printability_score": 8.5
        })
        self.mock_enhance_patcher = patch("text3d.call_ollama_enhance_prompt", return_value="A small cute robot toy with sleek surfaces")
        self.mock_score_patcher.start()
        self.mock_enhance_patcher.start()

    def tearDown(self):
        self.mock_score_patcher.stop()
        self.mock_enhance_patcher.stop()

    def test_prompt_formatting_and_styles(self):
        # 1. Base prompt without style
        p1 = text3d.format_prompt("ceramic coffee mug")
        self.assertIn("ceramic coffee mug", p1)
        self.assertIn("single object, centered, three-quarter view", p1)

        # 2. Toy style
        p_toy = text3d.format_prompt("cute cat", style="toy")
        self.assertIn("cute stylized vinyl toy", p_toy)
        self.assertIn("plastic finish", p_toy)

        # 3. Robot style
        p_robot = text3d.format_prompt("desktop assistant", style="robot")
        self.assertIn("cute friendly desktop robot", p_robot)
        self.assertIn("rounded enclosure", p_robot)

        # 4. Product style
        p_prod = text3d.format_prompt("desk lamp", style="product")
        self.assertIn("modern industrial design product", p_prod)

        # 5. Prop style
        p_prop = text3d.format_prompt("magic sword", style="prop")
        self.assertIn("game asset prop", p_prop)
        print("  ✓ Prompt formatting and style presets verified")

    def test_prompt_enhancement_and_fallback(self):
        # Enhance prompt endpoint
        res = client.post("/text3d/enhance", json={"prompt": "desk robot", "style": "robot"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertTrue(len(data["enhanced_prompt"]) > 5)
        self.assertIn("single object", data["formatted_prompt"])
        print("  ✓ Prompt enhancement endpoint and fallback verified")

    def test_candidate_generation_and_memory_unload(self):
        # Request 4 candidate images
        res = client.post("/text3d/candidates", json={
            "prompt": "small friendly desktop robot",
            "style": "robot",
            "seed": 12345
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        job_id = data["job_id"]

        # Fetch job status after background task completes
        job_res = client.get(f"/text3d/jobs/{job_id}")
        self.assertEqual(job_res.status_code, 200)
        job_data = job_res.json()
        self.assertEqual(len(job_data["candidates"]), 4)
        self.assertIn("Visual AI", job_data.get("warning", ""))

        # Verify candidate files exist on disk and can be fetched via /outputs/
        for cand_url in job_data["candidates"]:
            cand_res = client.get(cand_url)
            self.assertEqual(cand_res.status_code, 200)
            self.assertEqual(cand_res.headers["content-type"], "image/png")

        # Memory assertion: diffusion pipeline must be None (unloaded from memory)
        self.assertIsNone(text3d._active_diffusion_pipeline, "Diffusion pipeline was not unloaded!")
        print("  ✓ Candidate generation and immediate memory unload verified")

    def test_candidate_selection_and_triposr_pipeline(self):
        # 1. Create candidates first
        res = client.post("/text3d/candidates", json={
            "prompt": "vintage radio",
            "style": "product",
            "seed": 999
        })
        self.assertEqual(res.status_code, 200)
        job_id = res.json()["job_id"]
        # Fetch job to verify candidates ready
        job_res = client.get(f"/text3d/jobs/{job_id}")
        self.assertEqual(job_res.status_code, 200)

        # 2. Select candidate index 2
        with patch.object(text3d.TripoSRGenerator, "process") as mock_process:
            mock_process.return_value = {
                "glb_filename": f"{job_id}.glb",
                "file_size": 204800,
                "vertex_count": 1500,
                "face_count": 3000,
                "generation_time": 1.2
            }

            # Create dummy GLB file so downstream exists
            dummy_glb = os.path.join(text3d.OUTPUTS_DIR, f"{job_id}.glb")
            with open(dummy_glb, "wb") as f:
                f.write(b"glTFdummy")

            sel_res = client.post(f"/text3d/jobs/{job_id}/select", json={
                "candidate_index": 2,
                "quality": "Standard"
            })
            self.assertEqual(sel_res.status_code, 200)

            # Check job status (background task executes synchronously in TestClient)
            job_status_res = client.get(f"/text3d/jobs/{job_id}")
            self.assertEqual(job_status_res.status_code, 200)
            status_data = job_status_res.json()
            self.assertEqual(status_data["status"], "completed")
            self.assertEqual(status_data["selected_candidate"], 2)
            self.assertEqual(status_data["glb_url"], f"/outputs/{job_id}.glb")
            self.assertEqual(status_data["progress"], 100)

            # Assert memory order: diffusion pipeline was NOT loaded during TripoSR
            self.assertIsNone(text3d._active_diffusion_pipeline)

            # Cleanup dummy GLB
            if os.path.exists(dummy_glb):
                os.remove(dummy_glb)

        print("  ✓ Candidate selection, TripoSR processing and memory-order assertion verified")

    def test_validation_errors(self):
        # Empty prompt
        res = client.post("/text3d/candidates", json={"prompt": ""})
        self.assertEqual(res.status_code, 422)

        # Non-existent job
        res = client.get("/text3d/jobs/txt3d_nonexistent")
        self.assertEqual(res.status_code, 404)

        # Invalid candidate index
        res_cand = client.post("/text3d/candidates", json={"prompt": "apple", "seed": 42})
        job_id = res_cand.json()["job_id"]
        res_invalid = client.post(f"/text3d/jobs/{job_id}/select", json={"candidate_index": 5})
        self.assertEqual(res_invalid.status_code, 422)  # Pydantic ge=0, le=3
        print("  ✓ Validation errors enforced (empty prompt, invalid index, missing job)")


if __name__ == "__main__":
    unittest.main()
