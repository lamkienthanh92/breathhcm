import { SOURCES as BASE_SOURCES, SOURCE_CATS as BASE_SOURCE_CATS } from "./sources.js";
import { NEW_SOURCES, NEW_SOURCE_CATS } from "./newSourcesData.js";

// Combined source list: original 8 categories (pollution/green) + One Health
// expansion categories (school, clinic, veterinary, farm, recreation, butcher, publicinfra)
export const SOURCES = [...BASE_SOURCES, ...NEW_SOURCES];
export const SOURCE_CATS = { ...BASE_SOURCE_CATS, ...NEW_SOURCE_CATS };

// ── Haversine point-to-point (metres) ────────────────────────────────
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ── Compute distance from (lat, lng) to every source ─────────────────
// Returns array sorted by distance ascending, with dist injected.
export function computeSourceDistances(lat, lng) {
  return SOURCES.map((s) => ({
    ...s,
    dist: haversine(lat, lng, s.lat, s.lng),
  })).sort((a, b) => a.dist - b.dist);
}

// ── Closest entry per category ────────────────────────────────────────
// Returns object keyed by cat: { ...source, dist }
export function closestPerCategory(distances) {
  const result = {};
  for (const s of distances) {
    if (!(s.cat in result)) result[s.cat] = s;
  }
  return result;
}

// ── Top-N closest across all or filtered by cats ──────────────────────
export function topN(distances, n = 20, cats = null) {
  const filtered = cats
    ? distances.filter((s) => cats.includes(s.cat))
    : distances;
  return filtered.slice(0, n);
}

// ── Summary stats per category for Excel ─────────────────────────────
// Returns flat object: { market_closest_dist, market_closest_name, market_count_1km, ... }
export function categoryStats(distances) {
  const stats = {};
  const RADIUS = {
    market: 800,
    industrial: 1000,
    landfill: 2000,
    wastewater: 2000,
    fuel: 500,
    hospital: 1000,
    park: 500,
    forest: 1000,
    school: 500,
    clinic: 1000,
    veterinary: 1500,
    farm: 1500,
    recreation: 500,
    butcher: 500,
    publicinfra: 500,
  };

  for (const cat of Object.keys(SOURCE_CATS)) {
    const inCat = distances.filter((s) => s.cat === cat);
    const closest = inCat[0] ?? null;
    const radius = RADIUS[cat] ?? 1000;
    const countNearby = inCat.filter((s) => s.dist <= radius).length;

    stats[`${cat}_closest_dist`] = closest?.dist ?? "N/A";
    stats[`${cat}_closest_name`] = closest?.name ?? "";
    stats[`${cat}_count`] = countNearby;
    stats[`${cat}_radius`] = radius;
  }
  return stats;
}
