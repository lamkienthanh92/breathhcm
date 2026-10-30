// PM2.5 exposure layer — ~1 km satellite-derived annual mean.
//
// Primary source: public/data/pm25.json, built by scripts/build_pm25_grid.py
// from the WashU ACAG SatPM2.5 product line (van Donkelaar, Hammer, Martin et
// al.; currently V6.GL.03, 2022–2024 mean) at its native 0.01° × 0.01° grid —
// cropped only, never resampled. To rebuild: scripts/colab_pm25_1cell.py.
//
// Fallback: if that file is missing or invalid, the old 0.05° (~5.5 km)
// grid in air.js is used instead, and getPM25Meta().isFallback is true so
// every UI element / export column can say which product a number came from.
// Nothing silently mixes the two.
//
// Lookups are "cell containing the point" with a hard bounds check: a point
// outside the grid returns null instead of the edge cell's value.

import { PM25_GRID_LEGACY } from "./air.js";
import { ROADS, ROAD_NAMES } from "./roads.js";
import { findWard } from "./wards.js";
import { registerGrid, isGridsLoaded } from "./gridLoader.js";

export const PM25_FORMAT_ID = "onehealth-pm25-grid/v1";
const DATA_PATH = "/data/pm25.json";
const REF_LAT = 10.8; // for converting degrees to km in labels (central HCMC)
const ROAD_SAMPLE_M = 100; // spacing of sample points along each road polyline

let _g = null;
let _promise = null;
let _roadStats = null;

const round1 = (v) => Math.round(v * 10) / 10;

function resolutionText(dLat, dLon) {
  const ns = dLat * 111.32;
  const ew = dLon * 111.32 * Math.cos((REF_LAT * Math.PI) / 180);
  return {
    text: `${dLat}° × ${dLon}° (~${ns.toFixed(1)} × ${ew.toFixed(1)} km)`,
    km: (ns + ew) / 2,
  };
}

function validate(d) {
  if (!d || d.format !== PM25_FORMAT_ID)
    throw new Error(`unexpected format "${d && d.format}" (expected ${PM25_FORMAT_ID})`);
  for (const k of ["lat0", "lon0", "dLat", "dLon", "nLat", "nLon"])
    if (typeof d[k] !== "number" || !Number.isFinite(d[k])) throw new Error(`field ${k} missing/invalid`);
  if (!(d.dLat > 0 && d.dLon > 0)) throw new Error("dLat/dLon must be positive");
  if (!Array.isArray(d.values) || d.values.length !== d.nLat * d.nLon)
    throw new Error(`values has ${d.values && d.values.length} cells, expected ${d.nLat * d.nLon}`);
  if (d.sigma && d.sigma.length !== d.values.length) throw new Error("sigma length ≠ values length");
}

function fromFile(d) {
  validate(d);
  const res = resolutionText(d.dLat, d.dLon);
  return {
    kind: "satellite",
    isFallback: false,
    product: d.product || "Satellite-derived PM2.5",
    period: d.period || "",
    citation: d.citation || "",
    license: d.license || "",
    productUrl: d.productUrl || "",
    note: d.note || "",
    sourceFiles: d.sourceFiles || [],
    generatedAt: d.generatedAt || "",
    stats: d.stats || null,
    lat0: d.lat0,
    lon0: d.lon0,
    dLat: d.dLat,
    dLon: d.dLon,
    nLat: d.nLat,
    nLon: d.nLon,
    values: d.values,
    sigma: d.sigma || null,
    resolution: res.text,
    resolutionKm: res.km,
    fallbackReason: null,
  };
}

function fromLegacy(reason) {
  const { lats, lons, grid } = PM25_GRID_LEGACY;
  const nLat = lats.length;
  const nLon = lons.length;
  const dLat = Math.round(((lats[nLat - 1] - lats[0]) / (nLat - 1)) * 1e6) / 1e6;
  const dLon = Math.round(((lons[nLon - 1] - lons[0]) / (nLon - 1)) * 1e6) / 1e6;
  const values = [];
  for (let i = 0; i < nLat; i++)
    for (let j = 0; j < nLon; j++) {
      const v = grid[i] ? grid[i][j] : null;
      values.push(v === undefined ? null : v);
    }
  const res = resolutionText(dLat, dLon);
  return {
    kind: "legacy",
    isFallback: true,
    product: "Legacy grid (labelled \"NASA ACAG V6GL03\"; provenance unverified)",
    period: "2023 (as labelled)",
    citation: "",
    license: "",
    productUrl: "",
    note:
      "Fallback only. ~5.5 km cells: one value covers several wards, so it cannot separate residences within a neighbourhood.",
    sourceFiles: ["src/air.js (embedded)"],
    generatedAt: "",
    stats: null,
    lat0: lats[0],
    lon0: lons[0],
    dLat,
    dLon,
    nLat,
    nLon,
    values,
    sigma: null,
    resolution: res.text,
    resolutionKm: res.km,
    fallbackReason: reason,
  };
}

// Never rejects: on any problem with pm25.json it resolves to the legacy grid.
export function loadPM25() {
  if (_promise) return _promise;
  const url = `${process.env.PUBLIC_URL || ""}${DATA_PATH}`;
  _promise = fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        // CRA's dev server answers unknown paths with index.html (HTTP 200).
        throw new Error("response is not JSON — file probably not generated yet");
      }
      return fromFile(data);
    })
    .catch((e) =>
      fromLegacy(`public/data/pm25.json not usable (${e.message}). Run scripts/build_pm25_grid.py — see README.`)
    )
    .then((g) => {
      _g = g;
      _roadStats = null;
      return g;
    });
  return _promise;
}

// Adds the satellite grid to the shared registry (key "pm25") so distance
// profiles and city-wide correlations can use it. Deliberately skipped for
// the legacy fallback: ~5.5 km cells would make those panels look more
// informative than they are.
export function registerPM25Grid() {
  if (!_g || _g.isFallback || !isGridsLoaded()) return false;
  const lats = [];
  const lons = [];
  const grid = [];
  for (let i = 0; i < _g.nLat; i++) lats.push(Math.round((_g.lat0 + i * _g.dLat) * 1e6) / 1e6);
  for (let j = 0; j < _g.nLon; j++) lons.push(Math.round((_g.lon0 + j * _g.dLon) * 1e6) / 1e6);
  for (let i = 0; i < _g.nLat; i++) grid.push(_g.values.slice(i * _g.nLon, (i + 1) * _g.nLon));
  registerGrid("pm25", { lats, lons, grid });
  return true;
}

export function isPM25Loaded() {
  return _g !== null;
}

// ── Lookups ──────────────────────────────────────────────────────────────
function cellOf(lat, lng) {
  if (!_g) return null;
  const i = Math.round((lat - _g.lat0) / _g.dLat);
  const j = Math.round((lng - _g.lon0) / _g.dLon);
  if (i < 0 || i >= _g.nLat || j < 0 || j >= _g.nLon) return null;
  return { i, j, k: i * _g.nLon + j };
}

export function lookupPM25(lat, lng) {
  const c = cellOf(lat, lng);
  if (!c) return null;
  const v = _g.values[c.k];
  return v === null || v === undefined ? null : round1(v);
}

// Everything an analyst needs to reproduce or audit a single value.
export function lookupPM25Detail(lat, lng) {
  const c = cellOf(lat, lng);
  if (!c) return { value: null, sigma: null, inGrid: false, cellLat: null, cellLng: null };
  const v = _g.values[c.k];
  const s = _g.sigma ? _g.sigma[c.k] : null;
  return {
    value: v === null || v === undefined ? null : round1(v),
    sigma: s === null || s === undefined ? null : round1(s),
    inGrid: true,
    cellLat: Math.round((_g.lat0 + c.i * _g.dLat) * 1e6) / 1e6,
    cellLng: Math.round((_g.lon0 + c.j * _g.dLon) * 1e6) / 1e6,
  };
}

// Small, serialisable summary — stored with every measurement so an export
// always says which product produced its numbers.
export function getPM25Meta() {
  if (!_g) return null;
  return {
    kind: _g.kind,
    isFallback: _g.isFallback,
    product: _g.product,
    period: _g.period,
    resolution: _g.resolution,
    resolutionKm: _g.resolutionKm,
    citation: _g.citation,
    license: _g.license,
    productUrl: _g.productUrl,
    note: _g.note,
    sourceFiles: _g.sourceFiles,
    generatedAt: _g.generatedAt,
    stats: _g.stats,
    hasSigma: !!_g.sigma,
    fallbackReason: _g.fallbackReason,
    shortLabel: _g.isFallback
      ? `Legacy ~${_g.resolutionKm.toFixed(1)} km grid (fallback)`
      : `${_g.product.replace(/\s*\(.*\)$/, "")} · ${_g.period.replace(/\s*\(.*\)$/, "")} · ~${_g.resolutionKm.toFixed(1)} km`,
  };
}

// Cells (with bounds) inside a square box around a point — for the map.
export function pm25CellsInBox(lat, lng, boxDeg) {
  if (!_g) return [];
  const iLo = Math.max(0, Math.round((lat - boxDeg - _g.lat0) / _g.dLat));
  const iHi = Math.min(_g.nLat - 1, Math.round((lat + boxDeg - _g.lat0) / _g.dLat));
  const jLo = Math.max(0, Math.round((lng - boxDeg - _g.lon0) / _g.dLon));
  const jHi = Math.min(_g.nLon - 1, Math.round((lng + boxDeg - _g.lon0) / _g.dLon));
  const hLat = _g.dLat / 2;
  const hLon = _g.dLon / 2;
  const out = [];
  for (let i = iLo; i <= iHi; i++) {
    for (let j = jLo; j <= jHi; j++) {
      const k = i * _g.nLon + j;
      const v = _g.values[k];
      if (v === null || v === undefined) continue;
      const cLat = _g.lat0 + i * _g.dLat;
      const cLng = _g.lon0 + j * _g.dLon;
      out.push({
        value: v,
        sigma: _g.sigma ? _g.sigma[k] : null,
        cLat,
        cLng,
        bounds: [
          [cLat - hLat, cLng - hLon],
          [cLat + hLat, cLng + hLon],
        ],
      });
    }
  }
  return out;
}

// Quantile breaks. With `values` (e.g. the cells currently on the map) the
// breaks are local; without, they cover every valid cell inside the One
// Health study box (10.35–11.15 N, 106.35–107.05 E).
let _breaks = null;
export function pm25ColorBreaks(nClasses = 6, values = null) {
  if (values && values.length) {
    const v = [...values].sort((a, b) => a - b);
    const out = [];
    for (let q = 1; q < nClasses; q++) out.push(round1(v[Math.floor((v.length * q) / nClasses)]));
    return out;
  }
  if (_breaks && _breaks.n === nClasses && _breaks.src === _g) return _breaks.b;
  if (!_g) return [];
  const vals = [];
  for (let i = 0; i < _g.nLat; i++) {
    const la = _g.lat0 + i * _g.dLat;
    if (la < 10.35 || la > 11.15) continue;
    for (let j = 0; j < _g.nLon; j++) {
      const lo = _g.lon0 + j * _g.dLon;
      if (lo < 106.35 || lo > 107.05) continue;
      const v = _g.values[i * _g.nLon + j];
      if (v !== null && v !== undefined) vals.push(v);
    }
  }
  vals.sort((a, b) => a - b);
  const b = [];
  for (let q = 1; q < nClasses; q++) b.push(round1(vals[Math.floor((vals.length * q) / nClasses)] ?? 0));
  _breaks = { n: nClasses, src: _g, b };
  return b;
}

// ── Road-level PM2.5 ────────────────────────────────────────────────────
// Length-weighted mean of the cells each road passes through (sampled every
// ROAD_SAMPLE_M metres along every segment), plus min/max/number of cells.
// Replaces the old single "centroid" value: at ~1 km a long road crosses
// many cells, and a centroid can even fall off the road.
function haversine(a, b, c, d) {
  const R = 6371000;
  const dL = ((c - a) * Math.PI) / 180;
  const dG = ((d - b) * Math.PI) / 180;
  const x =
    Math.sin(dL / 2) ** 2 + Math.cos((a * Math.PI) / 180) * Math.cos((c * Math.PI) / 180) * Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Several names in roads.js bundle unrelated streets that merely share a
// name (e.g. a "Nam Kỳ Khởi Nghĩa" ~50 km away near the export's corner, in
// Long An / Tiền Giang). Segments are grouped into geographically connected
// parts (bounding boxes within LINK_DEG of each other, chained). The part
// with the most length INSIDE HCMC's ward polygons is used (ties → longest);
// the rest is reported as excluded. "Longest part" alone picked the wrong
// Đinh Bộ Lĩnh (2.29 km outside HCMC vs 2.17 km in Bình Thạnh).
const LINK_DEG = 0.005; // ~550 m

function segLength(seg) {
  let L = 0;
  for (let p = 0; p < seg.length - 1; p++) L += haversine(seg[p][0], seg[p][1], seg[p + 1][0], seg[p + 1][1]);
  return L;
}

function mainPart(segs) {
  const n = segs.length;
  if (n <= 1) return { segs, parts: n, excludedM: 0 };
  const bb = segs.map((sg) => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const [la, lo] of sg) { if (la < a) a = la; if (la > b) b = la; if (lo < c) c = lo; if (lo > d) d = lo; }
    return [a - LINK_DEG, b + LINK_DEG, c - LINK_DEG, d + LINK_DEG];
  });
  const parent = segs.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (bb[i][0] <= bb[j][1] && bb[j][0] <= bb[i][1] && bb[i][2] <= bb[j][3] && bb[j][2] <= bb[i][3])
        parent[find(i)] = find(j);
  const len = {};
  const lenIn = {};
  const lens = segs.map(segLength);
  for (let i = 0; i < n; i++) {
    const r = find(i);
    len[r] = (len[r] || 0) + lens[i];
    const mid = segs[i][Math.floor(segs[i].length / 2)];
    if (findWard(mid[0], mid[1])) lenIn[r] = (lenIn[r] || 0) + lens[i];
  }
  const roots = Object.keys(len);
  const score = (r) => [Math.round(lenIn[r] || 0), len[r]];
  const best = roots.reduce((x, y) => {
    const [ax, bx] = score(x);
    const [ay, by] = score(y);
    return ay > ax || (ay === ax && by > bx) ? y : x;
  });
  const total = lens.reduce((x, y) => x + y, 0);
  return {
    segs: segs.filter((_, i) => String(find(i)) === best),
    parts: roots.length,
    excludedM: total - len[best],
  };
}

function computeRoadStats() {
  const out = {};
  for (const name of ROAD_NAMES) {
    const part = mainPart((ROADS[name] && ROADS[name].segs) || []);
    const segs = part.segs;
    let vw = 0;
    let wData = 0;
    let wAll = 0;
    let min = Infinity;
    let max = -Infinity;
    const cells = new Set();
    for (const seg of segs) {
      for (let p = 0; p < seg.length - 1; p++) {
        const [a0, b0] = seg[p];
        const [a1, b1] = seg[p + 1];
        const L = haversine(a0, b0, a1, b1);
        if (!(L > 0)) continue;
        const n = Math.max(1, Math.ceil(L / ROAD_SAMPLE_M));
        const w = L / n;
        for (let s = 0; s < n; s++) {
          const t = (s + 0.5) / n;
          wAll += w;
          const c = cellOf(a0 + t * (a1 - a0), b0 + t * (b1 - b0));
          if (!c) continue;
          const v = _g.values[c.k];
          if (v === null || v === undefined) continue;
          vw += v * w;
          wData += w;
          if (v < min) min = v;
          if (v > max) max = v;
          cells.add(c.k);
        }
      }
    }
    out[name] =
      wData > 0
        ? {
            mean: round1(vw / wData),
            min: round1(min),
            max: round1(max),
            nCells: cells.size,
            lengthKm: Math.round(wAll / 10) / 100,
            coverage: wData / wAll,
            parts: part.parts,
            excludedKm: Math.round(part.excludedM / 10) / 100,
          }
        : {
            mean: null,
            min: null,
            max: null,
            nCells: 0,
            lengthKm: Math.round(wAll / 10) / 100,
            coverage: 0,
            parts: part.parts,
            excludedKm: Math.round(part.excludedM / 10) / 100,
          };
  }
  return out;
}

export function roadPM25Stats(name) {
  if (!_g) return null;
  if (!_roadStats) _roadStats = computeRoadStats();
  return _roadStats[name] || null;
}

export function roadPM25(name) {
  const s = roadPM25Stats(name);
  return s ? s.mean : null;
}

export function maxRoadPM25() {
  let m = 0;
  for (const n of ROAD_NAMES) {
    const v = roadPM25(n);
    if (v !== null && v > m) m = v;
  }
  return m || 1;
}

// For the command-line batch exporter: load an already-parsed pm25.json
// with the same validation as the browser loader. Throws instead of falling
// back, so a batch run can never silently use the legacy grid.
export function setPM25FromData(data) {
  _g = fromFile(data);
  _promise = Promise.resolve(_g);
  _roadStats = null;
  _breaks = null;
  return _g;
}
