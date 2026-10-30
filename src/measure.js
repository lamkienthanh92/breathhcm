// Single source of truth for "measure one coordinate".
//
// The Measure button (App.jsx), the batch panel (BatchPanel.jsx) and the
// command-line batch exporter (scripts/batch_export.mjs) all call
// measurePoint(), so a coordinate gives exactly the same numbers whichever
// way it is entered. Climate is fetched separately (it needs the network).

import { ROADS, ROAD_NAMES } from "./roads.js";
import { lookupPM25Detail, getPM25Meta } from "./pm25.js";
import { computeSourceDistances, closestPerCategory, categoryStats } from "./sourceUtils.js";
import { lookupNDVI, lookupEVI } from "./ndvi.js";
import { lookupOneHealthLayers } from "./oneHealthGrids.js";
import { findWard } from "./wards.js";

// ── Geometry (road-specific: point-to-segment) ────────────────────────
function haversine(a, b, c, d) {
  const R = 6371000,
    dL = ((c - a) * Math.PI) / 180,
    dG = ((d - b) * Math.PI) / 180;
  const x =
    Math.pow(Math.sin(dL / 2), 2) +
    Math.cos((a * Math.PI) / 180) *
      Math.cos((c * Math.PI) / 180) *
      Math.pow(Math.sin(dG / 2), 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function p2s(pA, pB, aA, aB, bA, bB) {
  const dx = bB - aB,
    dy = bA - aA,
    ls = dx * dx + dy * dy;
  let t = ls === 0 ? 0 : ((pB - aB) * dx + (pA - aA) * dy) / ls;
  t = Math.max(0, Math.min(1, t));
  return haversine(pA, pB, aA + t * dy, aB + t * dx);
}
export function distToRoad(pA, pB, road) {
  const { segs, halfWidth: h } = road;
  if (!segs?.length) return Infinity;
  let m = Infinity;
  for (const seg of segs)
    for (let i = 0; i < seg.length - 1; i++) {
      const d = p2s(pA, pB, seg[i][0], seg[i][1], seg[i + 1][0], seg[i + 1][1]);
      if (d < m) m = d;
    }
  return Math.max(0, Math.round(m - h));
}

// Same bounds as the single-coordinate input box.
export function coordInRange(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 10 && lat <= 11 && lng >= 106 && lng <= 107;
}

// Everything the Measure button computes, except climate.
// Requires loadGrids() and loadPM25() to have resolved.
export function measurePoint(lat, lng, patientName = "") {
  const p = { lat, lng };
  const dists = ROAD_NAMES.map((n) => ({ name: n, dist: distToRoad(p.lat, p.lng, ROADS[n]) }));
  const minDist = Math.min(...dists.map((d) => d.dist));
  const closest = dists.reduce((a, b) => (a.dist < b.dist ? a : b));
  const pm25Detail = lookupPM25Detail(p.lat, p.lng);
  const sourceDists = computeSourceDistances(p.lat, p.lng);
  return {
    geo: p,
    dists,
    minDist,
    closest,
    pm25: pm25Detail.value,
    pm25Detail,
    pm25Meta: getPM25Meta(),
    patientName: String(patientName || "").trim(),
    timestamp: new Date().toLocaleString("en-US"),
    sourceDists,
    closestByCat: closestPerCategory(sourceDists),
    sourceStats: categoryStats(sourceDists),
    ndvi: lookupNDVI(p.lat, p.lng),
    evi: lookupEVI(p.lat, p.lng),
    ward: findWard(p.lat, p.lng),
    oneHealth: lookupOneHealthLayers(p.lat, p.lng),
    climate: null,
  };
}
