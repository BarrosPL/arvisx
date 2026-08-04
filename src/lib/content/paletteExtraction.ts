import sharp from "sharp";

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface LabColor {
  l: number;
  a: number;
  b: number;
}

interface XyzColor {
  x: number;
  y: number;
  z: number;
}

// Conversão padrão sRGB -> XYZ -> LAB (iluminante D65) - sem biblioteca externa, só
// as fórmulas de referência (CIE). LAB é usado (em vez de RGB direto) porque distância
// euclidiana em LAB se aproxima melhor de diferença de cor PERCEBIDA - duas cores
// numericamente distantes em RGB podem parecer quase iguais a olho nu, e vice-versa
// (motivo do algoritmo F1.3 da spec pedir k-means em LAB, não em RGB puro).
const REF_X = 95.047;
const REF_Y = 100.0;
const REF_Z = 108.883;
const DELTA = 6 / 29;

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(channel: number): number {
  const v = channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function xyzToLabF(t: number): number {
  return t > DELTA ** 3 ? Math.cbrt(t) : t / (3 * DELTA * DELTA) + 4 / 29;
}

function labToXyzFInverse(t: number): number {
  return t > DELTA ? t ** 3 : 3 * DELTA * DELTA * (t - 4 / 29);
}

export function rgbToLab(rgb: RgbColor): LabColor {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const xyz: XyzColor = {
    x: (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) * 100,
    y: (r * 0.2126729 + g * 0.7151522 + b * 0.072175) * 100,
    z: (r * 0.0193339 + g * 0.119192 + b * 0.9503041) * 100,
  };

  const fx = xyzToLabF(xyz.x / REF_X);
  const fy = xyzToLabF(xyz.y / REF_Y);
  const fz = xyzToLabF(xyz.z / REF_Z);

  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToRgb(lab: LabColor): RgbColor {
  const fy = (lab.l + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;

  const xyz: XyzColor = {
    x: REF_X * labToXyzFInverse(fx),
    y: REF_Y * labToXyzFInverse(fy),
    z: REF_Z * labToXyzFInverse(fz),
  };

  const x = xyz.x / 100;
  const y = xyz.y / 100;
  const z = xyz.z / 100;

  return {
    r: linearToSrgb(x * 3.2404542 + y * -1.5371385 + z * -0.4985314),
    g: linearToSrgb(x * -0.969266 + y * 1.8760108 + z * 0.041556),
    b: linearToSrgb(x * 0.0556434 + y * -0.2040259 + z * 1.0572252),
  };
}

function labDistanceSq(a: LabColor, b: LabColor): number {
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return dl * dl + da * da + db * db;
}

export interface KMeansCluster {
  centroid: LabColor;
  count: number;
}

/**
 * K-means (Lloyd's algorithm) em espaço LAB - `randomFn` injetável (Math.random por
 * padrão) só pra testes conseguirem um resultado determinístico, mesmo espírito do
 * `TextMeasurer` injetável em autoFit.ts. Init por "farthest point" (não k-means++
 * probabilístico completo) - determinístico o bastante dado o primeiro ponto, simples
 * de implementar sem dependência nova.
 */
export function kMeansLab(points: LabColor[], k: number, iterations = 12, randomFn: () => number = Math.random): KMeansCluster[] {
  if (points.length === 0) return [];
  const effectiveK = Math.min(k, points.length);

  const centroids: LabColor[] = [points[Math.floor(randomFn() * points.length)]];
  while (centroids.length < effectiveK) {
    let farthest = points[0];
    let maxDist = -1;
    for (const point of points) {
      const minDistToCentroids = Math.min(...centroids.map((c) => labDistanceSq(point, c)));
      if (minDistToCentroids > maxDist) {
        maxDist = minDistToCentroids;
        farthest = point;
      }
    }
    centroids.push(farthest);
  }

  let assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    assignments = points.map((point) => {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = labDistanceSq(point, centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      return best;
    });

    const sums = centroids.map(() => ({ l: 0, a: 0, b: 0, count: 0 }));
    points.forEach((point, i) => {
      const sum = sums[assignments[i]];
      sum.l += point.l;
      sum.a += point.a;
      sum.b += point.b;
      sum.count++;
    });

    for (let c = 0; c < centroids.length; c++) {
      if (sums[c].count > 0) {
        centroids[c] = { l: sums[c].l / sums[c].count, a: sums[c].a / sums[c].count, b: sums[c].b / sums[c].count };
      }
    }
  }

  const counts = new Array(centroids.length).fill(0);
  for (const assignment of assignments) counts[assignment]++;

  return centroids.map((centroid, i) => ({ centroid, count: counts[i] })).filter((cluster) => cluster.count > 0);
}

/** Saturação HSL padrão (0-1) - usada pro filtro "descarta cluster com saturação <
 * 8%" da spec F1.3 (fundo neutro/cinza não deve virar cor de marca). */
export function saturationOf(rgb: RgbColor): number {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const lightness = (max + min) / 2;
  const delta = max - min;
  return lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
}

function rgbToHex(rgb: RgbColor): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[rgb.r, rgb.g, rgb.b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export interface ExtractedPalette {
  primary: string;
  secondary: string;
  accent: string;
}

/** Mesmos valores de DEFAULT_PALETTE (brand-form.tsx) - usado quando a imagem não
 * rende 3 clusters saturados o bastante (ex: foto preto-e-branco). */
const FALLBACK: ExtractedPalette = { primary: "#1E3A8A", secondary: "#DBEAFE", accent: "#F59E0B" };

/**
 * Núcleo puro do algoritmo (F1.3 da spec: k-means k=5 em LAB, descarta cluster com
 * saturação < 8%, ordena por frequência × saturação, pega os 3 primeiros) - separado
 * de `extractPaletteFromImage` (que decodifica a imagem com sharp) pra ser testável
 * com pixels sintéticos, sem precisar de arquivo de imagem real.
 */
export function extractPaletteFromPixels(pixels: RgbColor[], randomFn: () => number = Math.random): ExtractedPalette {
  if (pixels.length === 0) return FALLBACK;

  const labPixels = pixels.map(rgbToLab);
  const clusters = kMeansLab(labPixels, 5, 12, randomFn);

  const candidates = clusters
    .map((cluster) => ({ rgb: labToRgb(cluster.centroid), count: cluster.count }))
    .filter((c) => saturationOf(c.rgb) >= 0.08)
    .sort((a, b) => b.count * saturationOf(b.rgb) - a.count * saturationOf(a.rgb));

  const hexes = candidates.map((c) => rgbToHex(c.rgb));
  return {
    primary: hexes[0] ?? FALLBACK.primary,
    secondary: hexes[1] ?? FALLBACK.secondary,
    accent: hexes[2] ?? FALLBACK.accent,
  };
}

/** Decodifica a imagem enviada (upload de post - F1.3 adaptado, ver contexto do plano)
 * e roda a extração - resize pra ~120×120 antes do k-means, não precisa dos pixels
 * originais todos pra achar as cores dominantes, só deixaria o cálculo mais lento. */
export async function extractPaletteFromImage(imageBuffer: Buffer): Promise<ExtractedPalette> {
  const { data, info } = await sharp(imageBuffer).resize(120, 120, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const pixels: RgbColor[] = [];
  for (let i = 0; i + info.channels - 1 < data.length; i += info.channels) {
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  }

  return extractPaletteFromPixels(pixels);
}
