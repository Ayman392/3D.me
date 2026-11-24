import Hero from "@/components/Home/Hero/page";
import ShowcaseSection from "@/components/Home/Showcase/page";

export default function HomePage() {
  return (
    <main className="flex-1">
      <div className="relative h-[86vh] min-h-[720px] max-h-[920px] w-full overflow-hidden rounded-lg border">
        <Hero />
      </div>
      <ShowcaseSection />
    </main>
  );
}
