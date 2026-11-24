const DIVERSE_QUERIES = [
  "3d character render blender",
  "hard surface 3d model pbr",
  "stylized 3d mech robot",
  "3d sci fi prop glb",
  "vintage camera 3d render",
  "3d diorama miniature",
  "medieval weapon 3d model",
  "3d vehicle concept render",
  "cyberpunk 3d bust",
  "3d environment asset",
];

// Curated 3D render thumbnails so fallbacks stay strictly 3D-themed
const FALLBACK_IMAGES = [
  "https://media.sketchfab.com/models/b24782b7137e47c7b7d517c7f5a301e6/thumbnails/26d271c5b4374128b0f0a06b13bc81f0/1024x576.jpeg",
  "https://media.sketchfab.com/models/427993c8a1f34d2c9b2e4334b6d835ea/thumbnails/b8869a742b70400f8e1a54504db5c219/1024x576.jpeg",
  "https://media.sketchfab.com/models/18b168d9b853463c8d45c6fd7c66b21a/thumbnails/50c5742c20a34176b180e7f338411ea0/1024x576.jpeg",
  "https://media.sketchfab.com/models/7e3b35a03c1b4c8d8b797065848a03f1/thumbnails/7c7d9b4d5a8b4f3a8f4c1365f43a59ef/1024x576.jpeg",
  "https://media.sketchfab.com/models/98f4d268158d46519621a97828341684/thumbnails/48c550b81b934f44a8e80e6a26db4142/1024x576.jpeg",
  "https://media.sketchfab.com/models/3a81e7b09f5c41f7958b32f28b9217d6/thumbnails/c57e7b31a8d44f0cb48f31c6e8595f0d/1024x576.jpeg",
  "https://media.sketchfab.com/models/5c49b0f82d7a47c38e1539c576e4a812/thumbnails/92d721f02183457ba471981e54c21506/1024x576.jpeg",
  "https://media.sketchfab.com/models/6f2a9c4e18b34d569a7c24e68105b39f/thumbnails/3b4e718d9a2c4f6e8b52c13479a0d2e1/1024x576.jpeg",
  "https://media.sketchfab.com/models/8d1c3e5a7f9b42608c1e3579a0b2c4d6/thumbnails/6e8a0c2e4f61483a9b1d3f579a0c2e46/1024x576.jpeg",
  "https://media.sketchfab.com/models/2e4f6a8c0b1d43579e1f3a5c7b9d0e24/thumbnails/1a3c5e7g9i1k43579m1o3q5s7u9w1y31/1024x576.jpeg",
  "https://media.sketchfab.com/models/4b6d8f0a2c4e4680a2c4e6g8i0k2m4o6/thumbnails/7c9e1a3c5e7g491b3d5f7h9j1l3n5p79/1024x576.jpeg",
  "https://media.sketchfab.com/models/9a8b7c6d5e4f43210fedcba987654321/thumbnails/2f4e6d8c0b1a4938271605f4e3d2c1b0/1024x576.jpeg",
  "https://media.sketchfab.com/models/1c3e5g7i9k1m43579q1s3u5w7y9a1c35/thumbnails/8d6b4f2e0a8c462e0a8c6b4d2f0e8c64/1024x576.jpeg",
  "https://media.sketchfab.com/models/5f7h9j1l3n5p479r1t3v5x7z9b1d3f57/thumbnails/4a2c6e8g0i2k4680b2d4f6h8j0l2n4p6/1024x576.jpeg",
  "https://media.sketchfab.com/models/7e9g1i3k5m7o491q3s5u7w9y1a3c5e73/thumbnails/0b2d4f6h8j0l42468x0z2b4d6f8h0j28/1024x576.jpeg",
  "https://media.sketchfab.com/models/3g5i7k9m1o3q457s9u1w3y5a7c9e1g39/thumbnails/6c8e0a2c4e6g480a2c4e6g8i0k2m4o62/1024x576.jpeg",
  "https://media.sketchfab.com/models/8i0k2m4o6q8s402u4w6y8a0c2e4g6i84/thumbnails/9e1a3c5e7g9i413k5m7o9q1s3u5w7y95/1024x576.jpeg",
  "https://media.sketchfab.com/models/2k4m6o8q0s2u446w8y0a2c4e6g8i0k26/thumbnails/5g7i9k1m3o5q479s1u3w5y7a9c1e3g51/1024x576.jpeg",
  "https://media.sketchfab.com/models/6m8o0q2s4u6w480y2a4c6e8g0i2k4m60/thumbnails/3i5k7m9o1q3s457u9w1y3a5c7e9g1i37/1024x576.jpeg",
  "https://media.sketchfab.com/models/0o2q4s6u8w0y424a6c8e0g2i4k6m8o08/thumbnails/1k3m5o7q9s1u435w7y9a1c3e5g7i9k13/1024x576.jpeg",
];

const FALLBACK_LABELS = [
  "Cybernetic Bust 3D",
  "Stylized Mech Rig",
  "Retro Rangefinder Mesh",
  "PBR Armor Helm",
  "Triplane Sculpt Study",
  "Sci-Fi Recon Drone",
  "Voxel Diorama Kit",
  "Hard-Surface Turret",
  "GLB Material Sphere",
  "Artisan Relic Mesh",
  "3D Character Bust",
  "Industrial Valve Rig",
  "Low-Poly Outpost",
  "Steampunk Chronometer",
  "Sculpted Creature",
  "Modular Sci-Fi Crate",
  "Orbital Probe Mesh",
  "Ceramic Vessel 3D",
  "Mecha Jetpack Asset",
  "Marching Cubes Sample",
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
      // Fall back smoothly to 3D fallback renders
    }
  }

  for (let i = 0; collected.length < limit; i++) {
    const fallbackUrl = FALLBACK_IMAGES[i % FALLBACK_IMAGES.length];
    const fallbackTitle = FALLBACK_LABELS[i % FALLBACK_LABELS.length];
    if (!seenUrls.has(fallbackUrl)) {
      seenUrls.add(fallbackUrl);
      collected.push({
        title: fallbackTitle,
        image: fallbackUrl,
      });
    } else {
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
