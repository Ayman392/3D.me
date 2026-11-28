import { LiquidAccordion } from "@/components/Home/FAQ/page";
import BeamWordmarkFooter from "@/components/Home/Footer/page";
import HeroSection from "@/components/Home/Hero/page";
import { FeatureSteps } from "@/components/Home/HowItWorks/page";

const features = [
  {
    step: "Step 1",
    title: "Capture or Prompt Locally",
    content:
      "Start with a 2D image (PNG, JPG, WEBP), a text prompt generating four SD-Turbo candidate views scored by Qwen2.5-VL, or a functional CAD request with scale calibration—all processed locally with zero cloud uploads.",
    image: "/images/step-1.png",
  },
  {
    step: "Step 2",
    title: "Reconstruct & Repair Mesh",
    content:
      "Run triplane reconstruction with 256³ Marching Cubes and xatlas UV baking on Apple Silicon MPS in ~30 seconds, or generate verified B-rep solids in Build123d / CadQuery with automated manifold cleanup, flat base trimming, and tolerance checks.",
    image: "/images/step-2.png",
  },
  {
    step: "Step 3",
    title: "Inspect & Export Ready Files",
    content:
      "Orbit, zoom, and inspect your 3D asset in the browser viewport and export production-ready .GLB models or print-ready .STL, .3MF, and .STEP files saved locally to ~/.3dme/models/.",
    image: "/images/step-3.png",
  },
];

const FAQ = [
  {
    question: "What is 3d.me, and what can I make with it?",
    answer:
      "3d.me is a local 3D creation studio for Apple Silicon. You can start from a single 2D image (PNG, JPG or WEBP up to 25 MB), from a text prompt, or from a parametric CAD request for functional parts such as enclosures and brackets. Each path ends in a file you can inspect in the browser or send to a 3D printer: a GLB with PBR vertex colors, a print-ready STL or 3MF, or a STEP file for CAD parts. Image and text requests use neural reconstruction, which suits organic shapes. CAD requests use exact dimensions, because a neural mesh cannot guarantee that a part fits real hardware.",
  },
  {
    question: "Does it work offline, and is my data private?",
    answer:
      "The reconstruction runs on your own machine with no cloud API dependencies. Even the language and vision models run locally through Ollama, with no API keys. By default your files are saved in ~/.3dme/models and your job history in a local SQLite database at ~/.3dme/jobs.db. Supabase sign-in and cloud storage are an opt-in mode that only turns on when you set NEXT_PUBLIC_STORAGE_MODE=supabase. Because nothing is sent to a third-party 3D service, your private images and designs stay with you.",
  },
  {
    question: "How fast is it, and what hardware do I need?",
    answer:
      "On the test machine, a MacBook Pro M1 with 16 GB of unified memory, a full image-to-3D run took 30.35 seconds. The main parts were 5.50 s to load the engine from disk cache, 0.23 s for the GPU forward pass and 24.28 s for surface extraction at 256³. A Preview mode that extracts the surface at 128³ takes about 3.8 seconds, and a text-to-3D run takes about 28 to 34 seconds. 3d.me is built for consumer Apple Silicon and uses PyTorch with Metal Performance Shaders. The report only benchmarks the M1, so other machines are untested. To fit in 16 GB, the 1.7 GB of reconstruction weights load once, jobs run one at a time, and caches are cleared after each generation.",
  },
  {
    question: "Can I upload several photos of one object?",
    answer:
      "Not yet. Multi-image reconstruction, with 3 to 6 photos from the front, sides, back and top, is planned as Milestone 3, along with camera pose estimation and triplane fusion. A mobile companion that sends photos from your phone over local Wi-Fi by scanning a QR code is planned for Milestone 4.",
  },
  {
    question: "Are the models ready to 3D print, and will a printed part fit?",
    answer:
      "Raw marching cubes output is not printable: it has floating debris, holes and an uneven bottom. So every mesh goes through print preparation: debris removal, topology cleanup, a watertight and manifold guarantee, an optional smoothing filter, a flat base cut, and scaling to the height in millimetres you choose. You then get a pass, warn or fail quality report, and outputs are 40,000 to 85,000 triangles, watertight and manifold. Fit is a different matter. For organic shapes the scale comes from the height you choose, so an exact fit is not guaranteed. For functional parts, the CAD Studio requires a trusted scale (calipers, a reference object such as a credit card or an A4 sheet, or ArUco markers) and checks the real geometry, including a bounding box within ±0.1 mm and minimum wall thickness, before you export.",
  },
  {
    question: "Does it cost anything, and can I use the results commercially?",
    answer:
      "There are no per-generation credits and no subscription. Every component is free and runs on your own machine. Commercial use needs a license check, though. BRIA RMBG 2.0 and SD-Turbo are limited to non-commercial or research use, which is fine for coursework, and text-to-3D depends on SD-Turbo. The default segmentation model is U2-Net, TripoSR is MIT licensed, the Qwen models use the Tongyi Qianwen license, and no GPL libraries are used.",
  },
];

export default function HomePage() {
  return (
    <main className="flex-1">
      <HeroSection />
      <FeatureSteps
        features={features}
        title="How it Works"
        autoPlayInterval={4000}
        imageHeight="h-[500px]"
      />
      <LiquidAccordion items={FAQ} defaultOpen={0} />
      <BeamWordmarkFooter brand="3d.me" />
    </main>
  );
}
