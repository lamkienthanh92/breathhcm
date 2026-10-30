import { useState } from "react";
import { GRID_META } from "./oneHealthGrids.js";
import { getPM25Meta } from "./pm25.js";
import { color, font, card as cardBase, eyebrow } from "./theme.js";
import { SectionHeader, Icon } from "./ui.jsx";

const card = cardBase;

// Rows not covered by GRID_META (roads, OSM sources, wards, climate, PM2.5/NDVI)
const OTHER_ROWS = [
  {
    layer: "Road network geometry",
    source: "Unverified — inherited from the original project zip, no source comment in file. Structurally consistent with OSM highway data (Vietnamese names + polyline segments), but not confirmed.",
    resolution: "Vector (exact polyline, not gridded)",
    vintage: "Unknown",
    confidence: "low",
  },
  {
    layer: "NDVI / EVI (original app)",
    source: "MODIS, 5-year mean",
    resolution: "~1km",
    vintage: "2020–2024",
    confidence: "high",
  },
  {
    layer: "8 original OSM categories (park, industrial, market, landfill, wastewater, fuel, hospital, forest)",
    source: "OpenStreetMap via Overpass export",
    resolution: "Point data (exact coordinates, not gridded)",
    vintage: "Offline snapshot — exact query date not recorded",
    confidence: "high",
  },
  {
    layer: "7 One Health OSM categories (school, clinic, veterinary, farm, recreation, butcher, publicinfra)",
    source: "OpenStreetMap via Overpass export",
    resolution: "Point data (exact coordinates, not gridded)",
    vintage: "Snapshot taken during this project's data-collection session",
    confidence: "high",
  },
  {
    layer: "Ward/commune boundaries (168 wards)",
    source: "vietnamese-provinces-database (GitHub, community-maintained)",
    resolution: "Vector polygon, simplified (Ramer-Douglas-Peucker, ~30m tolerance) from original survey-grade boundaries",
    vintage: "Post-2025 administrative merger",
    confidence: "medium",
  },
  {
    layer: "Climate normals (temp, humidity, wind, rain)",
    source: "Open-Meteo historical weather API",
    resolution: "Not published by Open-Meteo for this endpoint — treat as regional reanalysis-model estimate, not hyperlocal measurement",
    vintage: "5-year mean, 2020–2024",
    confidence: "medium",
  },
];

// PM2.5 rows are built at render time from whatever grid actually loaded
// (~1 km satellite product, or the legacy fallback) — never hard-coded.
function pm25Rows() {
  const m = getPM25Meta();
  if (!m) return [];
  if (m.isFallback) {
    return [
      {
        layer: "PM2.5 at home + along roads — LEGACY FALLBACK",
        source: `${m.product}. Active because: ${m.fallbackReason}`,
        resolution: m.resolution,
        vintage: m.period,
        confidence: "low",
        note: "Not for analysis: one ~5.5 km cell spans several wards. Generate public/data/pm25.json to switch to ~1 km.",
      },
    ];
  }
  return [
    {
      layer: "PM2.5 at home (annual mean)",
      source: `${m.product} — WashU Atmospheric Composition Analysis Group (satellite AOD + GEOS-Chem, calibrated to ground monitors)`,
      resolution: `${m.resolution}, native`,
      vintage: m.period,
      confidence: "high",
      note:
        "Cell containing the coordinate, no interpolation." +
        (m.hasSigma ? " ±1σ uncertainty shown." : "") +
        " Producer: 0.01° grid does not fully resolve gradients at that scale.",
    },
    {
      layer: "PM2.5 along each road",
      source: `${m.product} (same grid)`,
      resolution: `${m.resolution} cells along the road polyline`,
      vintage: m.period,
      confidence: "high",
      note: "Length-weighted mean of cells crossed, sampled every 100 m; min/max and cell count in Excel.",
    },
  ];
}

const CONF_COLOR = { high: color.forestSoft, medium: color.amber, low: color.brick };

function ResRow({ layer, source, resolution, vintage, confidence, note }) {
  return (
    <tr style={{ borderBottom: `1px solid ${color.line}` }}>
      <td style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, color: color.ink, verticalAlign: "top" }}>
        {layer}
      </td>
      <td style={{ padding: "8px 10px", fontSize: 10.5, color: color.inkSoft, verticalAlign: "top" }}>
        {source}
      </td>
      <td style={{ padding: "8px 10px", fontSize: 10.5, color: color.inkSoft, fontFamily: font.mono, verticalAlign: "top", whiteSpace: "nowrap" }}>
        {resolution}
      </td>
      <td style={{ padding: "8px 10px", fontSize: 10.5, color: color.inkFaint, verticalAlign: "top", whiteSpace: "nowrap" }}>
        {vintage}
      </td>
      <td style={{ padding: "8px 10px", verticalAlign: "top" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 9.5,
            fontWeight: 700,
            color: CONF_COLOR[confidence],
            fontFamily: font.mono,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: CONF_COLOR[confidence] }} />
          {confidence}
        </span>
      </td>
      <td style={{ padding: "8px 10px", fontSize: 9.5, color: color.inkFaint, verticalAlign: "top", maxWidth: 220 }}>
        {note || ""}
      </td>
    </tr>
  );
}

export function DataSourcesTable() {
  const [open, setOpen] = useState(false);
  const airRows = pm25Rows();
  const gridRows = Object.entries(GRID_META).map(([key, m]) => ({
    layer: m.label.split("(")[0].trim(),
    source: m.source,
    resolution: m.nativeRes === m.displayRes ? m.nativeRes : `${m.nativeRes} → ${m.displayRes}`,
    vintage: m.vintage,
    confidence: "high",
    note: m.note,
  }));

  return (
    <div style={{ ...card, marginTop: 12 }}>
      <SectionHeader
        iconName="ruler"
        tint={color.inkSoft}
        label="Data Sources & Resolution"
        toggle={
          <button
            onClick={() => setOpen((s) => !s)}
            style={{
              fontSize: 9.5,
              fontFamily: font.mono,
              fontWeight: 700,
              color: color.forestSoft,
              background: "none",
              border: `1px solid ${color.line}`,
              borderRadius: 6,
              padding: "3px 8px",
              cursor: "pointer",
            }}
          >
            {open ? "▲ Hide table" : "▼ Show full table"}
          </button>
        }
      />
      {!open ? (
        <p style={{ fontSize: 10.5, color: color.inkSoft, margin: 0 }}>
          {gridRows.length + OTHER_ROWS.length + airRows.length} data layers, mixed
          resolution (10m sensor pixels up to ~
          {(getPM25Meta()?.resolutionKm ?? 1).toFixed(1)}km grids), mixed
          confidence in source attribution. Click "Show full table" for
          the complete breakdown per layer.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${color.line}` }}>
                {["Layer", "Source", "Resolution", "Vintage", "Confidence", "Note"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "6px 10px",
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: color.inkFaint,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      fontFamily: font.mono,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {airRows.map((r) => (
                <ResRow key={r.layer} {...r} />
              ))}
              {gridRows.map((r) => (
                <ResRow key={r.layer} {...r} />
              ))}
              {OTHER_ROWS.map((r) => (
                <ResRow key={r.layer} {...r} />
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 9, color: color.inkFaint, marginTop: 8, lineHeight: 1.6 }}>
            <strong>Confidence</strong> reflects how certain we are of the
            stated source — <span style={{ color: CONF_COLOR.high }}>high</span> means
            directly verified (we ran the query/export ourselves or the
            original app's footer documented it); <span style={{ color: CONF_COLOR.medium }}>medium</span> means
            plausible but not independently verified; <span style={{ color: CONF_COLOR.low }}>low</span> means
            inherited from the original codebase with no way to confirm.
            "Displayed resolution" for satellite grids is coarser than the
            sensor's native pixel size because values were downsampled to
            keep the app's JS bundle small — see README for the exact
            downsampling method (block-mean / mode, per layer type).
          </p>
        </div>
      )}
    </div>
  );
}
