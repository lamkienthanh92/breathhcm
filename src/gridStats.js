import { getGrids } from "./gridLoader.js";
import { lookupGridValue } from "./oneHealthGrids.js";

// ── Generalized distance-decay profile (any grid, not just population) ─
// Same bounding-box technique as populationStats.js's original
// implementation, parameterized by which grid to read.
const RADII_M = [200, 500, 1000, 2000, 3000];

export function getDistanceProfile(gridKey, lat, lng) {
  const grids = getGrids();
  if (!grids || !grids[gridKey]) return [];
  const { lats, lons, grid } = grids[gridKey];

  const maxRadiusM = RADII_M[RADII_M.length - 1];
  const dLat = maxRadiusM / 111000;
  const dLng = maxRadiusM / (111000 * Math.cos((lat * Math.PI) / 180));

  let iLo = lats.findIndex((v) => v >= lat - dLat);
  if (iLo < 0) iLo = 0;
  let iHi = lats.length - 1;
  while (iHi > 0 && lats[iHi] > lat + dLat) iHi--;
  let jLo = lons.findIndex((v) => v >= lng - dLng);
  if (jLo < 0) jLo = 0;
  let jHi = lons.length - 1;
  while (jHi > 0 && lons[jHi] > lng + dLng) jHi--;

  const sums = RADII_M.map(() => 0);
  const counts = RADII_M.map(() => 0);

  for (let i = iLo; i <= iHi; i++) {
    for (let j = jLo; j <= jHi; j++) {
      const v = grid[i][j];
      if (v === null || v === undefined) continue;
      const dy = (lats[i] - lat) * 111000;
      const dx = (lons[j] - lng) * 111000 * Math.cos((lat * Math.PI) / 180);
      const distM = Math.sqrt(dx * dx + dy * dy);
      for (let r = 0; r < RADII_M.length; r++) {
        if (distM <= RADII_M[r]) {
          sums[r] += v;
          counts[r]++;
        }
      }
    }
  }

  return RADII_M.map((r, i) => ({
    radius: r,
    label: r >= 1000 ? `${r / 1000}km` : `${r}m`,
    avg: counts[i] ? sums[i] / counts[i] : null,
    cellCount: counts[i],
  }));
}

// ── City-wide pairwise correlation between two grid layers ─────────────
// Samples the finer of the two grids (skipping every Nth cell to keep
// compute reasonable), looks up the paired grid's nearest value at each
// sample coordinate, and computes Pearson's r. This is a genuinely
// ecological (area-level) correlation, not an individual-level one --
// see the caveat surfaced in CorrelationPanel.jsx before reading meaning
// into any of these numbers.
const _corrCache = new Map();

export function getCorrelation(keyA, keyB, stride = 4) {
  const cacheKey = [keyA, keyB, stride].sort().join("|") + `|${stride}`;
  if (_corrCache.has(cacheKey)) return _corrCache.get(cacheKey);

  const grids = getGrids();
  if (!grids || !grids[keyA] || !grids[keyB]) return null;

  const { lats, lons, grid } = grids[keyA];
  const xs = [];
  const ys = [];

  for (let i = 0; i < lats.length; i += stride) {
    for (let j = 0; j < lons.length; j += stride) {
      const a = grid[i][j];
      if (a === null || a === undefined) continue;
      const b = lookupGridValue(grids[keyB], lats[i], lons[j]);
      if (b === null || b === undefined) continue;
      xs.push(a);
      ys.push(b);
    }
  }

  const n = xs.length;
  if (n < 10) return null;

  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0,
    denX = 0,
    denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const r = denX && denY ? num / Math.sqrt(denX * denY) : null;
  const result = { r, n };
  _corrCache.set(cacheKey, result);
  return result;
}

// Curated pairs worth showing -- chosen for plausible One Health relevance
// rather than an exhaustive 13x13 matrix (78 pairs would be noise).
export const CORRELATION_PAIRS = [
  { a: "no2", b: "builtup", label: "NO2 vs Built-up Surface", hypothesis: "traffic/industry pollution tracks urbanization" },
  { a: "lst", b: "treecover", label: "Land Surface Temp vs Tree Cover", hypothesis: "urban heat island — greenery cools surfaces" },
  { a: "population", b: "no2", label: "Population Density vs NO2", hypothesis: "exposure burden — do denser areas see more NO2?" },
  { a: "builtup", b: "elevation", label: "Built-up Surface vs Elevation", hypothesis: "development pattern vs terrain" },
  { a: "water", b: "lst", label: "Surface Water vs Land Surface Temp", hypothesis: "water bodies as local cooling effect" },
  { a: "nightlights", b: "population", label: "Night Lights vs Population", hypothesis: "economic activity proxy vs residents" },
  // PM2.5 pairs: shown only when the ~1 km satellite grid is loaded. PM2.5 is
  // always the LOOKUP side (b) so sampling stays inside the One Health grid
  // extent, where every PM2.5 lookup is in-bounds.
  { a: "population", b: "pm25", labelB: "PM2.5 (~1km)", label: "Population vs PM2.5", hypothesis: "exposure burden — do denser areas breathe more PM2.5?", optional: true },
  { a: "no2", b: "pm25", labelB: "PM2.5 (~1km)", label: "NO2 vs PM2.5", hypothesis: "shared combustion sources (traffic, industry)?", optional: true },
];
