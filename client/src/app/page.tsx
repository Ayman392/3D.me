import Hero from "@/components/Home/Hero/page";
import HowItWorksSection from "@/components/Home/HowItWorks/page";
import { ShowcaseSection } from "@/components/Home/Showcase/page";

export default function HomePage() {
  return (
    <main className="flex-1">
      <Hero />
      <ShowcaseSection />
      <HowItWorksSection />
    </main>
  );
}
