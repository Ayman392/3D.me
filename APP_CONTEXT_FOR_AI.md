# 3d.me: Master Technical Specification & Architecture Context

> **Prompt Note for AI Assistants (ChatGPT / Claude / Gemini)**:  
> This document is the complete, single-source-of-truth technical context for **3d.me** (formerly MeshForge). Use this context to implement new features, refactor existing modules, or debug issues without breaking existing Apple Silicon optimizations or architecture conventions.

---

## 1. Project Overview & Identity

- **Application Name**: `3d.me`
- **Root Directory**: `~/Projects/3dme` (accessible also via symlink `~/Projects/meshforge` and workspace `~/Downloads/3dme`)
- **Primary Goal**: A professional, offline-capable AI 3D creation studio running **100% locally on Apple Silicon (M1/M2/M3)** with zero cloud GPU dependencies, zero third-party API fees (no Meshy, no Tripo API), and total data privacy.
- **Current Core Milestone**: Single **Image → 3D Mesh → Binary GLTF (.GLB)** generation in ~25–30 seconds.
- **Target Machine**: MacBook Pro M1, 16 GB Unified Memory, macOS Apple Silicon.

---

## 2. Technology Stack & Design System

### Frontend Stack
- **Framework**: Next.js 15 (App Router, React 19, TypeScript).
- **Styling**: Tailwind CSS with custom `graphite` DCC color palette (dark slate `#0b0c0f`, panel `#16181f`, border `#242834`) and industrial amber accent (`#ff7700`).
- **Icons**: `lucide-react`.
- **3D Graphics Engine**: Three.js (`three`), `@react-three/fiber`, `@react-three/drei`.
- **Authentication & Database**: `@supabase/ssr` (server-side authentication with cookies; strict rejection of deprecated `@supabase/auth-helpers-nextjs`).

### UI / UX Philosophy (DCC / CAD Style)
- **Design Inspiration**: Blender, Figma, Linear, modern CAD software.
- **Rules**:
  - No purple SaaS gradients, no glassmorphism, no bloated cards, no floating blobs, no "AI magic" hype copy.
  - Dark graphite surfaces, 1px subtle borders, compact controls, monospace metadata hierarchy, small corner radii (`rounded-md`, `rounded-sm`), minimal animation, maximum viewport real estate.

### Backend AI Microservice Stack
- **Runtime**: Python 3.12 within an isolated virtual environment (`ai-engine/venv`).
- **API Framework**: FastAPI + Uvicorn (ASGI) running on `http://127.0.0.1:8000`.
- **Deep Learning Framework**: PyTorch 2.15 with Apple Metal Performance Shaders (`mps`) acceleration and `PYTORCH_ENABLE_MPS_FALLBACK=1`.
- **Neural Model**: Stability AI's **TripoSR** (`stabilityai/TripoSR`), cached locally via Hugging Face Hub.
- **Image Segmentation**: `rembg` powered by ONNX Runtime (`onnxruntime` CPU/Apple Silicon execution provider).
- **Surface Extraction**: `torchmcubes` (C++ Marching Cubes algorithm compiled natively for ARM64 using Clang and `pybind11`).
- **3D Mesh Operations**: `trimesh` for geometry parsing, scene centering, normal computation, and binary GLB packaging.

---

## 3. Full Project Directory Tree

```
~/Projects/3dme/
├── .env.example                          # Supabase & engine environment template
├── .env.local                            # Local active environment variables
├── package.json                          # Next.js 15, R3F, Drei, Three.js, Supabase SSR
├── tsconfig.json                         # Strict TypeScript configuration with @/* alias
├── next.config.ts                        # Proxy rewrite for /api/engine/* -> :8000
├── tailwind.config.ts                    # Graphite & Forge amber color scheme
├── postcss.config.mjs
├── start.sh                              # Unified single-command startup script
├── README.md                             # Quickstart & setup documentation
├── PROJECT_LAB_REPORT.md                 # Full academic lab report for instructors
├── APP_CONTEXT_FOR_AI.md                 # Master context for ChatGPT / LLM prompting
├── supabase/
│   └── migrations/
│       └── 20261118000000_create_generations.sql  # Generations table, RLS, & storage bucket
├── ai-engine/
│   ├── app.py                            # FastAPI server, single-worker queue, CORS
│   ├── generator.py                      # 12-step generation pipeline
│   ├── model.py                          # Singleton TripoSR loader, MPS detection, GC
│   ├── requirements.txt                  # Python dependencies
│   ├── test_triposr.py                   # Benchmark verification script
│   ├── outputs/                          # Generated binary GLB files and temp working dir
│   │   ├── test_chair.glb
│   │   └── 3dme-*.glb
│   ├── tsr/                              # TripoSR core architecture
│   │   ├── system.py                     # TSR module (tokenizer, backbone, NeRF decoder)
│   │   ├── utils.py                      # rembg background removal & foreground scaling
│   │   ├── bake_texture.py               # Texture baking utility
│   │   └── models/
│   │       ├── isosurface.py             # MarchingCubeHelper with MPS-to-CPU tensor bridge
│   │       ├── nerf_renderer.py          # Triplane volume rendering
│   │       ├── network_utils.py
│   │       ├── tokenizers/               # DINO-ViT image tokenizer
│   │       └── transformer/
│   └── venv/                             # Python 3.12 virtual environment (ARM64)
└── src/
    ├── middleware.ts                     # Route protection for /dashboard, /history, /models
    ├── context/
    │   └── AuthContext.tsx               # Client authentication & dev session persistence
    ├── utils/
    │   └── supabase/
    │       ├── client.ts                 # createBrowserClient with dev fallback
    │       ├── server.ts                 # createServerClient with cookie store
    │       └── middleware.ts             # Session refresh & route redirection
    ├── components/
    │   ├── layout/
    │   │   └── AppSidebar.tsx            # Left navigation bar with live engine status pulse
    │   └── viewer/
    │       └── ModelViewer.tsx           # Three.js / R3F interactive CAD 3D viewport
    └── app/
        ├── layout.tsx                    # Root layout with dark theme & AuthProvider
        ├── page.tsx                      # Root redirect -> /dashboard
        ├── globals.css                   # Graphite base styles & custom DCC scrollbar
        ├── auth/
        │   ├── actions.ts                # Server actions: login, signup, signout, reset
        │   └── callback/
        │       └── route.ts              # Supabase auth exchange callback
        ├── login/
        │   └── page.tsx                  # Sign in screen
        ├── signup/
        │   └── page.tsx                  # Account creation screen
        ├── forgot-password/
        │   └── page.tsx                  # Password reset screen
        ├── dashboard/
        │   └── page.tsx                  # Main Image -> 3D workspace with real-time polling
        ├── text-to-3d/
        │   └── page.tsx                  # Milestone 2 placeholder UI ("Coming next")
        ├── history/
        │   └── page.tsx                  # Chronological activity log with modal 3D inspector
        ├── models/
        │   └── page.tsx                  # Model gallery with direct download & deletion
        └── settings/
            └── page.tsx                  # System diagnostics & hardware monitor
```

---

## 4. Key Architectural Mechanisms (Crucial for Upgrades)

### 4.1 The AI Engine Pipeline (`ai-engine/generator.py`)
1. **Input Validation**: Accepts PNG, JPG, JPEG, WEBP up to 25 MB.
2. **Background Removal**: `rembg.remove()` uses an ONNX U-Net model to strip background pixels.
3. **Framing & Normalization**: Scales foreground to 85% of image boundaries, converts to float32, and composites over 50% neutral gray (`0.5, 0.5, 0.5`) RGB canvas.
4. **Tokenization & Backbone**: DINO-ViT encodes the 2D image into spatial tokens. The TripoSR transformer generates an implicit triplane feature representation (XY, XZ, YZ).
5. **Marching Cubes Surface Extraction**: Density fields are sampled on a regular grid:
   - `Draft`: 160³ resolution
   - `Standard` (Default for M1 16GB): 256³ resolution
   - `High`: 320³ resolution
6. **Color Field Sampling**: Evaluates RGB radiance at extracted vertex positions to generate vertex colors.
7. **GLB Compilation & Validation**: `trimesh.Trimesh` packages the mesh into binary GLTF (`.glb`). Trimesh verifies geometry validity before reporting completion.

### 4.2 The Apple Silicon MPS-to-CPU Bridge (`ai-engine/tsr/models/isosurface.py`)
- **Problem**: PyTorch MPS executes the neural forward pass in 0.23s. However, the C++ Marching Cubes library (`torchmcubes`) requires CPU memory pointers (`vol must be a CPU tensor`).
- **Implementation**:
  ```python
  level_3d = -level.view(self.resolution, self.resolution, self.resolution)
  try:
      if level_3d.device.type == "cuda":
          v_pos, t_pos_idx = self.mc_func(level_3d.detach(), 0.0)
      else:
          v_pos, t_pos_idx = self.mc_func(level_3d.detach().cpu(), 0.0)
  except Exception:
      v_pos, t_pos_idx = self.mc_func(level_3d.detach().cpu(), 0.0)
  v_pos = v_pos[..., [2, 1, 0]] / (self.resolution - 1.0)
  return v_pos.to(level.device), t_pos_idx.to(level.device)
  ```
- **Rule for Upgrades**: Never remove `.cpu()` from Marching Cubes inputs on macOS, or the process will crash.

### 4.3 Unified Memory Optimization (16 GB Safety)
- **Singleton Loader**: `TripoSRModelManager` in `ai-engine/model.py` loads the 1.7 GB model once into RAM.
- **Sequential Queue**: `ThreadPoolExecutor(max_workers=1)` in `ai-engine/app.py` ensures only one generation executes at a time. Other requests remain in `"queued"` status.
- **Memory Release**: After each job, `generator.py` executes:
  ```python
  if device == "mps" and hasattr(torch, "mps"):
      torch.mps.empty_cache()
  gc.collect()
  ```

### 4.4 Next.js Proxy & API Communication
- In `next.config.ts`, requests to `/api/engine/:path*` are rewritten to `http://127.0.0.1:8000/:path*`.
- The dashboard polls `GET /api/engine/jobs/{job_id}` every 1000ms until status is `"completed"` or `"failed"`.
- The sidebar checks `GET /api/engine/health` every 8000ms to update the live status pill (`Ready` / `Offline`).

### 4.5 Dual-Mode Supabase Authentication & Storage
- **Production Mode**: Configured with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Models are uploaded to private bucket `models/{user_id}/{job_id}.glb` and signed URLs are generated.
- **Offline / Development Fallback Mode**: If Supabase credentials are not set, the app creates a secure local cookie `meshforge_dev_session` and stores generated records in `localStorage`. This allows instant zero-config testing without being blocked by remote database provisioning.

---

## 5. Verified Performance Benchmarks (Apple Silicon M1)

- **Model Load Time**: ~5.5 seconds
- **Neural Forward Pass (MPS)**: **0.23 seconds**
- **Mesh Extraction (256³ Resolution)**: **24.28 seconds**
- **Full Pipeline (Image -> GLB)**: **30.35 seconds**
- **Output Statistics**: ~42,169 vertices, ~84,160 triangles, 1.61 MB binary GLB.
- **WebGL Frame Rate**: Solid 60 FPS in Three.js viewport.

---

## 6. Development Roadmap & How to Implement Upgrades

When prompting ChatGPT for future upgrades, refer to these planned milestones:

### Milestone 2: Text → 3D Pipeline
- **Goal**: Allow users to input text prompts and produce 3D models.
- **Architecture**:
  1. Add a local text-to-image generator (e.g., Stable Diffusion Turbo / CoreML or small diffusion model).
  2. Synthesize multi-view or canonical perspective image.
  3. Feed the resulting image directly into the existing `TripoSRGenerator.process()` pipeline.
  4. Connect the UI in `src/app/text-to-3d/page.tsx`.

### Milestone 3: Multi-Image 3D Reconstruction
- **Goal**: Support 3–6 photos (front, back, left, right) to eliminate backface occlusion.
- **Architecture**:
  1. Update `POST /generate` to accept `files: List[UploadFile]`.
  2. Pass image list to `model([img1, img2, ...], device=device)`.
  3. Fuse cross-attention triplanes before Marching Cubes extraction.
  4. Update dashboard dropzone to accept multiple files with reorderable thumbnails.

### Milestone 4: Mobile QR Companion with Guided Capture
- **Goal**: Scan a QR code on the desktop monitor with an iPhone/Android to snap guided photos that appear instantly in the desktop studio.
- **Architecture**:
  1. **Desktop**: Generates a dynamic session room ID and displays a QR code linking to `http://<local-ip>:3000/companion?session=<id>`.
  2. **Mobile WebApp**: A lightweight WebRTC / WebSocket interface with:
     - On-screen circular capture guide (ensures 85% object bounding).
     - Lighting & shadow contrast indicator.
     - Ghost silhouette alignment overlay.
  3. **Data Transport**: Images taken on phone stream over local Wi-Fi directly into the desktop state, triggering generation without manual AirDrop or file transfers.

### Milestone 5: Professional CAD/DCC Viewport Tools
- **Goal**: Elevate the Three.js viewport into a creative DCC tool.
- **Features**:
  1. **Decimation Slider**: Fast quadric mesh simplification (reducing 85k triangles to 5k for mobile/web games).
  2. **MatCap Shaders**: Toggle Clay, Chrome, Normal map, and Zebra stripe inspection shaders.
  3. **Export Formats**: Add USDZ (Apple AR Quick Look on iOS), OBJ/MTL, and STL (3D printing slicer compatible).

---

## 7. How to Run the Project

- **Unified Startup**:
  ```bash
  cd ~/Projects/3dme && ./start.sh
  ```
- **Backend Only**:
  ```bash
  cd ~/Projects/3dme/ai-engine && ./venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000
  ```
- **Frontend Only**:
  ```bash
  cd ~/Projects/3dme && npm run dev
  ```
- **Build Verification**:
  ```bash
  cd ~/Projects/3dme && npm run build
  ```
