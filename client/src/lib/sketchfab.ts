const DIVERSE_QUERIES = [
  "hard surface 3d model",
  "stylized 3d character",
  "vintage camera 3d",
  "mechanical robot 3d",
  "architectural building 3d",
  "sci fi vehicle 3d",
  "sewing machine 3d",
  "medieval sword 3d",
  "avocado fruit 3d",
  "diorama cafe 3d",
];

// 20 distinct images so cards never collapse to a single repeated image
const FALLBACK_IMAGES = [
  "https://cdn.21st.dev/assets/mirror/4d/4d1bff4ea8b9f400dff7ae405f92e15bd39ec76e9285c7d96017e64ba1de3ae1.jpg",
  "https://cdn.21st.dev/assets/mirror/ee/ee36e332fe99d7611c43b90511db08a4f84e4545caa78e7b52e9ccffe273864b.jpg",
  "https://cdn.21st.dev/assets/mirror/dd/dddeaa4e6132c65bf7ff99d197f792a30937b5cbfe97a2b1ee54a793684df52e.jpg",
  "https://cdn.21st.dev/assets/mirror/48/487977107b5011b5e1c25289f6e4393ef555e1a92daee554788e9363b233ca14.jpg",
  "https://cdn.21st.dev/assets/mirror/a1/a12509688be6c9d3b2cb26d2ea1cfce48b8a8dbf2653e17be8a3fc31bd69f162.jpg",
  "https://cdn.21st.dev/assets/mirror/05/051f9e565b5b0b221384d9c27a0760febc3fb48d190c046adfda579f3614c958.jpg",
  "https://cdn.21st.dev/assets/mirror/87/87d4f60a4465d19d14b8acefa46275df4ccd767ccea6d7f234ea5bad99cfec56.jpg",
  "https://cdn.21st.dev/assets/mirror/06/0610989e0675a12c02d35aa5464e2644bf77913214b748b73a894808d2d79877.jpg",
  "https://cdn.21st.dev/assets/mirror/fe/fe90b90751e671a9526134c4743e2fcbf6c1a24991aba273ad7418c88fc9c701.jpg",
  "https://cdn.21st.dev/assets/mirror/2e/2e0452c1994fcc2130a1b8ef68e34b5ea52d1b35b80dde09b99349ad1de54598.jpg",
  "https://cdn.21st.dev/assets/mirror/84/847dc523558808119dc4bbb5218ff862ae5f5b455f33e9a0304f2f5a4b2f0f2c.jpg",
  "https://cdn.21st.dev/assets/mirror/2f/2f128763d177d6bdda3de9f0a766693406034977082bdb542138b7b74af9697b.jpg",
  "https://cdn.21st.dev/assets/mirror/30/30f8223f1d1ecc24fc8b7a9995b8ee98449b1e9fc300c14fbccec01b6a83a0ae.jpg",
  "https://cdn.21st.dev/assets/mirror/b4/b4df0e3e425ffce3b4f62fd7bc717e4dc90b94455f4d65d64fc07fe9721b0519.jpg",
  "https://cdn.21st.dev/assets/mirror/90/90c625659f072e4a701c2e37fa4ca46f25c7ca8689d723e7802fe84cf17874e9.jpg",
  "https://cdn.21st.dev/assets/mirror/6a/6aa0befc69cc3db8f3f3558d4b5e1216a5b64ceae1b86f51acf1c3f1432a8cf7.jpg",
  "https://cdn.21st.dev/assets/mirror/dc/dc126cfd753dc217945d0ea2f915e539dfe4ffb5fdea02245d0f576b25a9c4dd.jpg",
  "https://cdn.21st.dev/assets/mirror/ab/ab5f167fcb763aee7c3247fb8af97875998a7f519a6119da7dadd9cf73ae1a2c.jpg",
  "https://cdn.21st.dev/assets/mirror/57/57d6e450f7068e5f3be04907dcc0815343e67df1dc82f2da0ff1c859afc1f700.jpg",
  "https://cdn.21st.dev/assets/mirror/e4/e491359016d1494074e287dfbb55be068cffc0110017ae2257a5d4cdec193a47.jpg",
];

const FALLBACK_LABELS = [
  "Cybernetic Bust",
  "Stylized Mech",
  "Retro Camera",
  "Armor Helm",
  "Botanical Specimen",
  "Sci-Fi Drone",
  "Architectural Study",
  "Artisan Prop",
  "Turbine Core",
  "Sculpted Form",
  "Tactical Gear",
  "Crystal Relic",
  "Industrial Rig",
  "Character Study",
  "Miniature Diorama",
  "Weapon Concept",
  "Orbital Probe",
  "Ceramic Vessel",
  "Steampunk Gadget",
  "PBR Material Sphere",
];

export interface SketchfabCardItem {
  title: string;
  image: string;
  viewerUrl?: string;
}

interface SketchfabThumbnail {
  url?: string;
  width?: number;
}

interface SketchfabSearchResult {
  name?: string;
  viewerUrl?: string;
  thumbnails?: {
    images?: SketchfabThumbnail[];
  };
}

export function getInitialHeroItems(limit = 20): SketchfabCardItem[] {
  return Array.from({ length: limit }, (_, i) => ({
    title: FALLBACK_LABELS[i % FALLBACK_LABELS.length],
    image: FALLBACK_IMAGES[i % FALLBACK_IMAGES.length],
  }));
}

export async function fetchSketchfabHeroItems(
  limit = 20,
  apiToken = process.env.NEXT_PUBLIC_SKETCHFAB_API_TOKEN,
): Promise<SketchfabCardItem[]> {
  const headers: HeadersInit = {};
  if (apiToken) {
    headers.Authorization = `Token ${apiToken}`;
  }

  const collected: SketchfabCardItem[] = [];
  const seenUrls = new Set<string>();

  for (const query of DIVERSE_QUERIES) {
    if (collected.length >= limit) break;

    try {
      const url = `https://api.sketchfab.com/v3/search?type=models&q=${encodeURIComponent(
        query,
      )}&count=3`;
      const res = await fetch(url, { headers });
      if (!res.ok) continue;

      const data = await res.json();
      const results: SketchfabSearchResult[] = Array.isArray(data?.results)
        ? data.results
        : [];

      for (const item of results) {
        if (collected.length >= limit) break;
        const imgs = item.thumbnails?.images || [];
        const sorted = [...imgs].sort(
          (a, b) => (b.width || 0) - (a.width || 0),
        );
        const bestImg =
          sorted.find((t) => (t.width || 0) <= 1024 && t.url)?.url ||
          sorted[0]?.url;

        if (bestImg && !seenUrls.has(bestImg)) {
          seenUrls.add(bestImg);
          collected.push({
            title: item.name || query,
            image: bestImg,
            viewerUrl: item.viewerUrl,
          });
        }
      }
    } catch {
      // Fall back smoothly to curated images
    }
  }

  // Merge unique fallback images so every slot is visually distinct
  for (let i = 0; collected.length < limit; i++) {
    const fallbackUrl = FALLBACK_IMAGES[i % FALLBACK_IMAGES.length];
    const fallbackTitle = FALLBACK_LABELS[i % FALLBACK_LABELS.length];
    if (!seenUrls.has(fallbackUrl)) {
      seenUrls.add(fallbackUrl);
      collected.push({
        title: fallbackTitle,
        image: fallbackUrl,
      });
    } else if (collected.length < limit) {
      // Only push a duplicate if all 20 unique fallbacks were already used
      const remaining = FALLBACK_IMAGES.find((u) => !seenUrls.has(u));
      if (remaining) {
        seenUrls.add(remaining);
        collected.push({ title: fallbackTitle, image: remaining });
      } else {
        collected.push({ title: fallbackTitle, image: fallbackUrl });
      }
    }
  }

  return collected.slice(0, limit);
}
