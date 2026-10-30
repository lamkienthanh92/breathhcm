import * as XLSX from "xlsx";
import { ROAD_NAMES } from "./roads.js";
import { getPM25Risk } from "./air.js";
import { roadPM25, roadPM25Stats, getPM25Meta } from "./pm25.js";
import { SOURCE_CATS, SOURCES } from "./sourceUtils.js";
import { lookupNDVI, lookupEVI, getNDVIClass } from "./ndvi.js";
import { lookupOneHealthLayers, LANDCOVER_LABELS } from "./oneHealthGrids.js";
import { findWard } from "./wards.js";

const ALL_CATS = [
  "industrial",
  "market",
  "landfill",
  "wastewater",
  "fuel",
  "hospital",
  "park",
  "forest",
  "school",
  "clinic",
  "veterinary",
  "farm",
  "recreation",
  "butcher",
  "publicinfra",
];

// ── Sheet 1: Patient Results (1 row per patient, summary columns) ─────
function buildPatientSheet(sessions) {
  const catKeys = ALL_CATS;

  const header = [
    "#",
    "Patient / Sample ID",
    "Latitude",
    "Longitude",
    "Nearest Road",
    "Min Distance (m)",
    "Home PM2.5 annual mean (µg/m³)",
    "PM2.5 Category (WHO 2021 annual / QCVN 05:2023)",
    "PM2.5 ≤ QCVN 05:2023 annual 25 µg/m³?",
    "PM2.5 uncertainty ±1σ (µg/m³)",
    "PM2.5 product",
    "PM2.5 period",
    "PM2.5 grid resolution",
    "PM2.5 grid cell centre lat",
    "PM2.5 grid cell centre lon",
    "PM2.5 fallback grid? (do not analyse if YES)",
    "Measured At",
    // Closest per category
    ...catKeys.flatMap((cat) => [
      `${SOURCE_CATS[cat].desc} — Closest (m)`,
      `${SOURCE_CATS[cat].desc} — Closest Name`,
      `${SOURCE_CATS[cat].desc} — Count nearby`,
    ]),
    // Climate
    "Avg Temp 2020–2024 (°C)",
    "Avg Humidity 2020–2024 (%)",
    "Avg Wind 2020–2024 (m/s)",
    "Annual Rainfall 2020–2024 (mm/yr)",
    "NDVI (MODIS 2020–2024)",
    "NDVI Class",
    "EVI (MODIS 2020–2024)",
    "EVI Class",
    // One Health expansion — administrative
    "Ward / Phường",
    // One Health expansion — environment
    "Population (people/100m cell, WorldPop 2024)",
    "NO2 (Sentinel-5P idx, 2025)",
    "SO2 (Sentinel-5P idx, 2025)",
    "CO (Sentinel-5P idx, 2025)",
    "O3 tropospheric (Sentinel-5P idx, 2025)",
    "Land Surface Temp (°C, MODIS 2025)",
    "Night Light Radiance (VIIRS, last 12mo)",
    "Built-up Surface (%, GHSL 2020)",
    "Surface Water Occurrence (%, 1984–2021)",
    "Elevation (m, SRTM)",
    "Land Cover Class (Dynamic World)",
    "Tree Canopy Cover 2000 (%, Hansen)",
    "Forest Loss since 2000 (%, Hansen)",
    // Road distances
    ...ROAD_NAMES.map((n) => `Road: ${n} (m)`),
    ...ROAD_NAMES.map((n) => `PM2.5 along road: ${n} (µg/m³)`),
  ];

  const rows = sessions.map((s, i) => {
    const dm = Object.fromEntries(s.dists.map((d) => [d.name, d.dist]));
    const stats = s.sourceStats || {};
    const climat = s.climate || {};
    return [
      i + 1,
      s.patientName || "",
      s.geo.lat,
      s.geo.lng,
      s.closest.name,
      s.minDist,
      s.pm25 ?? "N/A",
      getPM25Risk(s.pm25).label,
      (() => {
        const q = getPM25Risk(s.pm25).meetsQCVN;
        return q === null ? "N/A" : q ? "Yes" : "No";
      })(),
      s.pm25Detail?.sigma ?? "N/A",
      s.pm25Meta?.product ?? "N/A",
      s.pm25Meta?.period ?? "N/A",
      s.pm25Meta?.resolution ?? "N/A",
      s.pm25Detail?.cellLat ?? "N/A",
      s.pm25Detail?.cellLng ?? "N/A",
      s.pm25Meta ? (s.pm25Meta.isFallback ? "YES" : "No") : "N/A",
      s.timestamp,
      ...catKeys.flatMap((cat) => [
        stats[`${cat}_closest_dist`] ?? "N/A",
        stats[`${cat}_closest_name`] ?? "",
        stats[`${cat}_count`] ?? "N/A",
      ]),
      climat.tempMean ?? "N/A",
      climat.humidityMean ?? "N/A",
      climat.windMean ?? "N/A",
      climat.precipAnnual ?? "N/A",
      lookupNDVI(s.geo.lat, s.geo.lng) ?? "N/A",
      getNDVIClass(lookupNDVI(s.geo.lat, s.geo.lng)).label,
      lookupEVI(s.geo.lat, s.geo.lng) ?? "N/A",
      getNDVIClass(lookupEVI(s.geo.lat, s.geo.lng)).label,
      (() => {
        const w = findWard(s.geo.lat, s.geo.lng);
        return w ? w.name : "N/A (outside HCMC ward boundaries)";
      })(),
      ...(() => {
        const oh = lookupOneHealthLayers(s.geo.lat, s.geo.lng);
        return [
          oh.population ?? "N/A",
          oh.no2 ?? "N/A",
          oh.so2 ?? "N/A",
          oh.co ?? "N/A",
          oh.o3 ?? "N/A",
          oh.lst ?? "N/A",
          oh.nightlights ?? "N/A",
          oh.builtup ?? "N/A",
          oh.water ?? "N/A",
          oh.elevation ?? "N/A",
          oh.landcover !== null && oh.landcover !== undefined
            ? `${oh.landcover} (${LANDCOVER_LABELS[oh.landcover] ?? "?"})`
            : "N/A",
          oh.treecover ?? "N/A",
          oh.forestloss ?? "N/A",
        ];
      })(),
      ...ROAD_NAMES.map((n) => dm[n] ?? ""),
      ...ROAD_NAMES.map((n) => roadPM25(n) ?? ""),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = [
    { wch: 4 },
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 28 },
    { wch: 14 },
    { wch: 18 },
    { wch: 30 },
    { wch: 16 },
    { wch: 16 },
    { wch: 30 },
    { wch: 16 },
    { wch: 30 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 22 },
    ...catKeys.flatMap(() => [{ wch: 22 }, { wch: 30 }, { wch: 18 }]),
    { wch: 22 },
    { wch: 24 },
    { wch: 22 },
    { wch: 26 },
    { wch: 22 },
    { wch: 26 },
    { wch: 20 },
    { wch: 26 },
    { wch: 26 }, // Ward
    ...Array(13).fill({ wch: 24 }), // One Health environmental columns
    ...ROAD_NAMES.map(() => ({ wch: 16 })),
    ...ROAD_NAMES.map(() => ({ wch: 18 })),
  ];
  return ws;
}

// ── Sheet 2: PM2.5 by Road ────────────────────────────────────────────
// Length-weighted mean of the grid cells each road passes through (sampled
// every 100 m along the polyline) — replaces the old single centroid value.
function buildRoadSheet() {
  const header = [
    "Road Name",
    "PM2.5 along road, length-weighted mean (µg/m³)",
    "Min cell (µg/m³)",
    "Max cell (µg/m³)",
    "Grid cells crossed",
    "Road length sampled (km)",
    "Share of length with data",
    "Same-name parts found",
    "Length excluded: same name elsewhere (km)",
    "Category (WHO 2021 annual / QCVN 05:2023)",
  ];
  const rows = ROAD_NAMES.map((n) => {
    const st = roadPM25Stats(n) || {};
    return [
      n,
      st.mean ?? "N/A",
      st.min ?? "N/A",
      st.max ?? "N/A",
      st.nCells ?? 0,
      st.lengthKm ?? "N/A",
      st.coverage != null ? Math.round(st.coverage * 1000) / 10 + "%" : "N/A",
      st.parts ?? "N/A",
      st.excludedKm ?? "N/A",
      getPM25Risk(st.mean).label,
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = [{ wch: 32 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 30 }];
  return ws;
}

// ── Sheet 3: PM2.5 provenance — what produced every PM2.5 number above ──
function buildPM25ProvenanceSheet(sessions) {
  const m = getPM25Meta() || {};
  const usedProducts = [...new Set(sessions.map((s) => s.pm25Meta?.product).filter(Boolean))];
  const rows = [
    ["Field", "Value"],
    ["Product", m.product ?? "N/A"],
    ["Fallback grid in use?", m.isFallback ? "YES — legacy ~5.5 km grid; do not analyse" : "No"],
    ["Fallback reason", m.fallbackReason ?? ""],
    ["Period (annual mean)", m.period ?? ""],
    ["Grid resolution", m.resolution ?? ""],
    ["Uncertainty layer", m.hasSigma ? "Yes (±1σ, µg/m³)" : "No"],
    ["Citation", m.citation ?? ""],
    ["License", m.license ?? ""],
    ["Product page", m.productUrl ?? ""],
    ["Source files", (m.sourceFiles || []).join(", ")],
    ["Grid file generated (UTC)", m.generatedAt ?? ""],
    ["Products used by rows in this workbook", usedProducts.join(" | ") || "N/A"],
    ["Home value method", "Annual mean of the grid cell containing the coordinate (no interpolation)."],
    ["Road value method", "Length-weighted mean of grid cells along the road polyline, sampled every 100 m. Only the longest geographically connected part is used; same-name streets elsewhere are excluded (see 'PM2.5 by Road')."],
    ["Category thresholds", "WHO 2021 annual: AQG 5, IT-4 10, IT-3 15, IT-2 25, IT-1 35 µg/m³; QCVN 05:2023/BTNMT annual 25 µg/m³."],
    ["Producer caveat", m.note ?? ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 36 }, { wch: 110 }];
  return ws;
}

// ── Sheets 4+: One sheet per category ────────────────────────────────
// Rows = patients, Columns = individual sites sorted by distance (patient 1)
function buildCategorySheet(sessions, cat) {
  if (!sessions.length) return XLSX.utils.aoa_to_sheet([["No data"]]);

  // Get all sites for this category from SOURCES (global list, fixed order)
  // Sort by distance to first patient so nearest columns come first
  const allSites = SOURCES.filter((s) => s.cat === cat);

  // Compute distances for first session to determine column order
  const firstDists = sessions[0]?.sourceDists ?? [];
  const firstDistMap = Object.fromEntries(
    firstDists
      .filter((s) => s.cat === cat)
      .map((s) => [`${s.lat},${s.lng}`, s.dist])
  );

  // Sort sites by distance to first patient
  const sortedSites = [...allSites].sort((a, b) => {
    const da = firstDistMap[`${a.lat},${a.lng}`] ?? Infinity;
    const db = firstDistMap[`${b.lat},${b.lng}`] ?? Infinity;
    return da - db;
  });

  // Header row: Patient ID | site1_name (dist) | site2_name ...
  const header = [
    "Patient / Sample ID",
    "Latitude",
    "Longitude",
    ...sortedSites.map((s) => s.name || `${s.lat},${s.lng}`),
  ];

  // Data rows
  const rows = sessions.map((s) => {
    // Build lookup: "lat,lng" -> dist for this session
    const distMap = Object.fromEntries(
      (s.sourceDists ?? [])
        .filter((d) => d.cat === cat)
        .map((d) => [`${d.lat},${d.lng}`, d.dist])
    );
    return [
      s.patientName || "",
      s.geo.lat,
      s.geo.lng,
      ...sortedSites.map((site) => distMap[`${site.lat},${site.lng}`] ?? "N/A"),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = [
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    ...sortedSites.map(() => ({ wch: 14 })),
  ];
  return ws;
}

// ── Main export ───────────────────────────────────────────────────────
// buildWorkbook() is shared by the browser download below and by the
// command-line batch exporter (scripts/batch_export.mjs).
export function buildWorkbook(sessions) {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    buildPatientSheet(sessions),
    "Patient Results"
  );
  XLSX.utils.book_append_sheet(wb, buildRoadSheet(), "PM2.5 by Road");
  XLSX.utils.book_append_sheet(wb, buildPM25ProvenanceSheet(sessions), "PM2.5 Provenance");

  // One sheet per category
  const SHEET_NAMES = {
    industrial: "🏭 Industrial",
    market: "🛒 Markets",
    landfill: "🗑 Landfill",
    wastewater: "💧 Wastewater",
    fuel: "⛽ Fuel Stations",
    hospital: "🏥 Hospitals",
    park: "🌳 Parks",
    forest: "🌿 Forest",
    school: "🎓 Schools",
    clinic: "💊 Clinics",
    veterinary: "🐾 Veterinary",
    farm: "🐄 Farms",
    recreation: "🏃 Recreation",
    butcher: "🥩 Butchers",
    publicinfra: "🚰 Public Infra",
  };

  for (const cat of ALL_CATS) {
    const ws = buildCategorySheet(sessions, cat);
    // Excel sheet names max 31 chars, strip emoji for safety
    const sheetName = SHEET_NAMES[cat]
      .replace(/[^\w\s\-]/g, "")
      .trim()
      .slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  return wb;
}

export function exportExcel(sessions) {
  const wb = buildWorkbook(sessions);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const url = URL.createObjectURL(
    new Blob([out], { type: "application/octet-stream" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `copd_hcmc_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
