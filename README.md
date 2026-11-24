# 3d.me

3d.me is a professional local AI 3D creation application optimized for Apple Silicon (M1/M2/M3) using PyTorch MPS hardware acceleration and TripoSR.

---

## Quick Start (Single Command)

From the project root directory:

```bash
cd ~/Projects/3dme
./start.sh
```

or using npm:

```bash
npm run start:all
```

This single command starts:
1. **Local AI Engine**: FastAPI running TripoSR on Apple Silicon MPS (`http://127.0.0.1:8000`)
2. **3d.me Frontend**: Next.js App on `http://localhost:3000`

---

## Alternative: Running in Separate Terminals

If you prefer seeing logs in individual terminal windows:

### Terminal 1: Local AI Engine
```bash
cd ~/Projects/3dme/ai-engine
./venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000
```
- Verify health: `curl http://127.0.0.1:8000/health`

### Terminal 2: Next.js Frontend
```bash
cd ~/Projects/3dme
npm run dev
```
- Open browser: `http://localhost:3000`

---

## Authentication & Supabase Setup

- **Development Mode**: By default, you can sign up and sign in immediately with any email/password without remote cloud keys.
- **Remote Supabase Integration**:
  1. Add your project credentials to `.env.local`:
     ```env
     NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
     NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
     ```
  2. Execute the database migration in the Supabase SQL Editor:
     - File: `supabase/migrations/20261118000000_create_generations.sql`

---

## Case Generator (Parametric CAD Enclosures)

The **Case Generator** (`/cad`) builds 3D-printable enclosures (base box + friction-fit lid) with mounting standoffs and custom cutouts from natural language descriptions or exact specs.

### Requirements:
- **Ollama** running locally with the code generation model:
  ```bash
  ollama pull qwen2.5-coder:7b
  ollama serve
  ```
- **Dependencies** (`cadquery`, `httpx`, `trimesh`) are installed in `ai-engine/venv`.

### How to Use:
1. Open `http://localhost:3000/cad` from the sidebar under **CREATE → CAD**.
2. Type a prompt (e.g., *"Case for Raspberry Pi 4B with a USB-C cutout on the left and vent slots on the back"*).
3. Click **Plan design**: Local `qwen2.5-coder:7b` parses components and cutouts into structured JSON, while deterministic Python calculates clearances and standoffs.
4. Verify or adjust the spec: wall thickness, corner radius, component chips, or cutout rows.
5. The **Feasibility** panel verifies the print in real-time against your 3D printer bed (e.g. 220×220×250 mm) and highlights corner proximity or thin wall warnings.
6. Click **Build Enclosure** to generate B-Rep geometry and preview Base, Lid, or Both in interactive 3D.
7. Download production-ready **STL** (watertight mesh), **STEP** (CAD solids), or **GLB** files.

