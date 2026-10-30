// climate.js
// Fetches 5-year climate normals (2020-2024) from Open-Meteo Historical API
// per patient coordinate. Returns annual means suitable for chronic exposure studies.

const START = "2020-01-01";
const END = "2024-12-31";

const DAILY_VARS = [
  "temperature_2m_mean",
  "precipitation_sum",
  "wind_speed_10m_mean",
  "relative_humidity_2m_mean",
].join(",");

// ── Wind direction label ──────────────────────────────────────────────
export function windDirLabel(deg) {
  if (deg == null) return "–";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

// ── Mean of a numeric array, ignoring nulls ───────────────────────────
function mean(arr) {
  const valid = arr.filter((v) => v != null && !isNaN(v));
  if (!valid.length) return null;
  return (
    Math.round((valid.reduce((s, v) => s + v, 0) / valid.length) * 10) / 10
  );
}

// ── Sum of a numeric array, ignoring nulls ────────────────────────────
function sum(arr) {
  const valid = arr.filter((v) => v != null && !isNaN(v));
  if (!valid.length) return null;
  // Return average annual sum (total / 5 years)
  return Math.round(valid.reduce((s, v) => s + v, 0) / 5);
}

// ── Main fetch ────────────────────────────────────────────────────────
// Returns climate normal object or null on failure.
export async function fetchClimate(lat, lng) {
  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat}&longitude=${lng}` +
    `&start_date=${START}&end_date=${END}` +
    `&daily=${DAILY_VARS}` +
    `&timezone=Asia%2FHo_Chi_Minh`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = await res.json();
    const d = data?.daily;
    if (!d) return null;

    return {
      // Annual means
      tempMean: mean(d.temperature_2m_mean), // °C
      humidityMean: mean(d.relative_humidity_2m_mean), // %
      windMean: mean(d.wind_speed_10m_mean), // m/s
      // Annual sum averaged over 5 years
      precipAnnual: sum(d.precipitation_sum), // mm/year
      // Meta
      period: "2020–2024",
      nDays: d.temperature_2m_mean?.length ?? 0,
    };
  } catch {
    return null;
  }
}
