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
    </main>
  );
}
