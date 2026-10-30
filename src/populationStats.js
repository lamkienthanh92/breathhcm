import { getGrids } from "./gridLoader.js";
import { pointInWardPolygon } from "./wards.js";

function popGrid() {
  const g = getGrids();
  return g ? g.population : null;
}

// City-wide average population per 100m grid cell, computed once from the
// full grid (lazy singleton — expensive-ish but only runs once ever).
let _cityAvg = null;
export function getCityAveragePopulation() {
  if (_cityAvg !== null) return _cityAvg;
  const g = popGrid();
  if (!g) return null;
  let sum = 0,
    n = 0;
  for (const row of g.grid) {
    for (const v of row) {
      if (v !== null && v !== undefined) {
        sum += v;
        n++;
      }
    }
  }
  _cityAvg = n ? sum / n : null;
  return _cityAvg;
}

// Average population per 100m grid cell across every grid-cell centroid
// that falls inside the given ward's polygon. Cached per ward name since
// the same ward is likely to be re-queried within a session.
// Returns { avg, cellCount } for transparency about sample size (now
// typically dozens-hundreds of cells per ward at 100m resolution, not 1).
const _wardAvgCache = new Map();
export function getWardAveragePopulation(ward) {
  if (!ward) return { avg: null, cellCount: 0 };
  if (_wardAvgCache.has(ward.name)) return _wardAvgCache.get(ward.name);
  const g = popGrid();
  if (!g) return { avg: null, cellCount: 0 };
  const { lats, lons, grid } = g;
  let sum = 0,
    n = 0;
  for (let i = 0; i < lats.length; i++) {
    for (let j = 0; j < lons.length; j++) {
      const v = grid[i][j];
      if (v === null || v === undefined) continue;
      if (pointInWardPolygon(lats[i], lons[j], ward)) {
        sum += v;
        n++;
      }
    }
  }
  const result = { avg: n ? sum / n : null, cellCount: n };
  _wardAvgCache.set(ward.name, result);
  return result;
}

// Convenience: build the 3-bar comparison dataset for the population chart.
export function buildPopulationComparison(currentValue, ward) {
  const { avg: wardAvg, cellCount } = getWardAveragePopulation(ward);
  const cityAvg = getCityAveragePopulation();
  return {
    data: [
      { label: "This location", value: currentValue ?? 0 },
      { label: ward ? `${ward.name} avg` : "Ward avg", value: wardAvg ?? 0 },
      { label: "HCMC avg", value: cityAvg ?? 0 },
    ],
    wardCellCount: cellCount,
  };
}

// Population density profile as a function of distance from a point —
// shows the actual spatial trend (dense core vs. tapering outward) that
// a single 3-bar comparison can't convey. Efficient: only scans the
// small bounding-box submatrix around the point (a few thousand cells
// at 100m resolution), not the full ~700k-cell grid, even though it
// computes 5 radius bins in one pass.
const RADII_M = [200, 500, 1000, 2000, 3000];

export function getPopulationDistanceProfile(lat, lng) {
  const g = popGrid();
  if (!g) return [];
  const { lats, lons, grid } = g;
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
    avgDensity: counts[i] ? sums[i] / counts[i] : null,
    cellCount: counts[i],
  }));
}

// This location's percentile rank within the full city population-density
// distribution — "denser than 82% of HCMC" is far more legible than a raw
// "people per cell" number with no context.
let _sortedCityValues = null;
export function getPopulationPercentile(value) {
  if (value === null || value === undefined) return null;
  if (_sortedCityValues === null) {
    const g = popGrid();
    if (!g) return null;
    const vals = [];
    for (const row of g.grid) {
      for (const v of row) {
        if (v !== null && v !== undefined) vals.push(v);
      }
    }
    vals.sort((a, b) => a - b);
    _sortedCityValues = vals;
  }
  const arr = _sortedCityValues;
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((lo / arr.length) * 100);
}
