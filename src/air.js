// ── LEGACY PM2.5 grid — fallback only ──────────────────────────────────
// 0.05° × 0.05° (~5.5 km) grid inherited from earlier versions of this app.
// The original header called it "NASA ACAG V6GL03 (2023)". That label cannot
// be traced to a specific ACAG release (ACAG is the Atmospheric Composition
// Analysis Group at Washington University in St. Louis, not NASA; its
// releases are named V5.GL.0x / V6.GL.0x.xx), so treat provenance as
// unverified. At ~5.5 km a single cell spans several wards — all 193
// residences of a 15×17 km catchment fall into only a handful of cells.
//
// The app now reads the ~1 km ACAG grid from public/data/pm25.json (built by
// scripts/build_pm25_grid.py). This grid is used ONLY when that file is
// missing or invalid, and every place that shows a value then says so.
//
// The old ROAD_PM25 table (per-road values sampled from THIS grid at each
// road's centroid) was removed: road values are now computed at runtime
// from whichever grid is active, averaged along the full road geometry —
// see roadPM25Stats() in pm25.js.
export const PM25_GRID_LEGACY = {
  lats: [
    10.375, 10.425, 10.475, 10.525, 10.575, 10.625, 10.675, 10.725, 10.775,
    10.825, 10.875, 10.925, 10.975, 11.025, 11.075, 11.125,
  ],
  lons: [
    106.375, 106.425, 106.475, 106.525, 106.575, 106.625, 106.675, 106.725,
    106.775, 106.825, 106.875, 106.925, 106.975, 107.025,
  ],
  grid: [
    [
      23.6,
      24.0,
      24.2,
      24.7,
      24.8,
      24.9,
      24.8,
      24.5,
      23.9,
      null,
      20.6,
      20.7,
      null,
      null,
    ],
    [
      23.8,
      24.7,
      25.5,
      26.4,
      26.9,
      26.6,
      26.1,
      25.4,
      24.5,
      23.9,
      22.5,
      22.0,
      21.7,
      null,
    ],
    [
      24.6, 25.4, 26.3, 27.4, 28.0, 28.0, 27.9, 26.8, 26.4, 25.0, 24.0, 23.4,
      23.1, 23.1,
    ],
    [
      25.3, 25.9, 26.8, 27.7, 28.1, 29.1, 29.6, 29.2, 28.0, 25.6, 24.3, 23.9,
      23.9, 24.4,
    ],
    [
      25.7, 26.3, 27.1, 28.0, 28.8, 30.1, 30.9, 31.2, 30.2, 27.7, 25.7, 25.0,
      25.1, 25.6,
    ],
    [
      25.8, 25.9, 27.3, 28.8, 29.8, 30.9, 31.9, 32.6, 31.9, 29.8, 28.3, 27.5,
      26.7, 26.3,
    ],
    [
      25.6, 25.8, 27.2, 29.3, 30.7, 31.9, 32.9, 33.6, 33.0, 31.3, 29.8, 29.0,
      27.9, 25.9,
    ],
    [
      25.2, 25.8, 27.1, 29.4, 31.4, 33.2, 34.0, 34.4, 33.5, 32.2, 30.8, 30.4,
      28.3, 25.0,
    ],
    [
      25.7, 26.4, 27.9, 29.5, 31.9, 34.2, 35.0, 35.3, 35.0, 33.6, 32.2, 30.5,
      28.0, 24.1,
    ],
    [
      27.2, 27.7, 28.6, 29.6, 31.8, 34.1, 35.8, 36.6, 36.3, 34.9, 32.8, 30.4,
      27.3, 23.6,
    ],
    [
      27.7, 27.7, 28.3, 29.6, 31.3, 33.5, 35.0, 36.3, 36.0, 34.9, 33.1, 30.2,
      26.8, 23.6,
    ],
    [
      27.4, 27.1, 27.8, 28.8, 30.0, 31.6, 33.2, 34.5, 34.8, 34.4, 32.3, 29.5,
      26.8, 24.5,
    ],
    [
      26.8, 26.4, 26.8, 27.9, 29.2, 30.5, 31.5, 32.4, 33.1, 32.5, 30.3, 27.9,
      26.3, 24.6,
    ],
    [
      25.9, 25.6, 25.8, 26.7, 28.1, 29.4, 30.2, 30.8, 30.8, 29.4, 28.2, 26.7,
      25.4, 24.2,
    ],
    [
      24.6, 24.7, 24.6, 25.7, 26.6, 27.7, 27.9, 27.8, 27.2, 26.3, 25.1, 24.2,
      23.4, 23.1,
    ],
    [
      23.2, 23.1, 23.3, 24.1, 24.4, 24.8, 24.2, 23.4, 22.5, 22.1, 21.7, 21.5,
      21.3, 21.2,
    ],
  ],
  unit: "µg/m³",
  year: 2023,
  source: "Legacy grid labelled \"NASA ACAG V6GL03 GWRPM25\" (provenance unverified)",
};

// ── Category of an ANNUAL-MEAN PM2.5 value ─────────────────────────────
// WHO 2021 Air Quality Guidelines, annual mean: AQG 5 µg/m³; interim
// targets IT-4 10, IT-3 15, IT-2 25, IT-1 35. Vietnam QCVN 05:2023/BTNMT
// annual limit: 25 µg/m³.
//
// Previous versions labelled ≤15 µg/m³ as "Meets WHO standard". 15 µg/m³ is
// the WHO 24-hour guideline (and annual IT-3), not the annual guideline —
// for annual exposure that label was wrong by a factor of 3.
export const WHO_AQG_ANNUAL = 5;
export const QCVN05_2023_ANNUAL = 25;

export function getPM25Risk(pm25) {
  if (pm25 === null || pm25 === undefined || Number.isNaN(pm25))
    return {
      label: "No data",
      short: "N/A",
      color: "#6B7280",
      bg: "#F3F4F6",
      bar: "#D1D5DB",
      meetsQCVN: null,
    };
  const meetsQCVN = pm25 <= QCVN05_2023_ANNUAL;
  if (pm25 <= 5)
    return { label: "Meets WHO AQG (≤5)", short: "AQG", color: "#166534", bg: "#F0FDF4", bar: "#22C55E", meetsQCVN };
  if (pm25 <= 10)
    return { label: "WHO IT-4 (5–10)", short: "IT-4", color: "#3F6212", bg: "#F7FEE7", bar: "#84CC16", meetsQCVN };
  if (pm25 <= 15)
    return { label: "WHO IT-3 (10–15)", short: "IT-3", color: "#1D4ED8", bg: "#EFF6FF", bar: "#60A5FA", meetsQCVN };
  if (pm25 <= 25)
    return { label: "WHO IT-2 (15–25) · ≤ QCVN", short: "IT-2", color: "#92400E", bg: "#FFFBEB", bar: "#F59E0B", meetsQCVN };
  if (pm25 <= 35)
    return { label: "WHO IT-1 (25–35) · > QCVN", short: "IT-1", color: "#9A3412", bg: "#FFF7ED", bar: "#F97316", meetsQCVN };
  return { label: "Above WHO IT-1 (>35) · > QCVN", short: ">IT-1", color: "#9B1C1C", bg: "#FEF2F2", bar: "#EF4444", meetsQCVN };
}
// NOTE: A composite "Exposure Score" (weighted blend of road distance +
// PM2.5) previously lived here. It was removed — a single arbitrary-weighted
// number (0.6 distance + 0.4 PM2.5) has no validated scientific basis and
// risks being read as more authoritative than it is. Use the raw variables
// (distance, PM2.5, and the One Health layers) directly in statistical
// models instead of a pre-baked index.
