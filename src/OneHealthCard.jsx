import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { GRID_META, LANDCOVER_LABELS } from "./oneHealthGrids.js";
import { color, font, card as cardBase, eyebrow } from "./theme.js";
import {
  buildPopulationComparison,
  getPopulationDistanceProfile,
  getPopulationPercentile,
} from "./populationStats.js";

const card = {
  ...cardBase,
  borderLeft: `3px solid ${color.forestSoft}`,
};

function fmt(key, v) {
  if (v === null || v === undefined) return "N/A";
  if (key === "landcover") return `${LANDCOVER_LABELS[v] ?? "?"} (class ${v})`;
  return v;
}

const ROWS = [
  ["population", "👥"],
  ["no2", "🌫️"],
  ["so2", "🏭"],
  ["co", "🚗"],
  ["o3", "☀️"],
  ["lst", "🌡️"],
  ["nightlights", "🌃"],
  ["builtup", "🏙️"],
  ["water", "🌊"],
  ["elevation", "⛰️"],
  ["landcover", "🗺️"],
  ["treecover", "🌲"],
  ["forestloss", "🪓"],
];

const BAR_COLORS = [color.clay, color.forestSoft, color.water];

function PercentileBadge({ pct }) {
  if (pct === null) return null;
  const tint = pct >= 75 ? color.brick : pct >= 40 ? color.amber : color.forestSoft;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        padding: "8px 12px",
        background: `${tint}12`,
        border: `1px solid ${tint}33`,
        borderRadius: 10,
        flex: "1 1 160px",
      }}
    >
      <span style={{ fontSize: 26, fontWeight: 800, color: tint, fontFamily: font.mono }}>
        {pct}
        <span style={{ fontSize: 13, fontWeight: 600 }}>%</span>
      </span>
      <span style={{ fontSize: 10, color: color.inkSoft, lineHeight: 1.3 }}>
        denser than this % of<br />all measured HCMC cells
      </span>
    </div>
  );
}

function DistanceProfileChart({ profile }) {
  const data = profile.map((p) => ({ label: p.label, density: p.avgDensity ?? 0 }));
  return (
    <div style={{ height: 130, marginTop: 4 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="popDensityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color.clay} stopOpacity={0.5} />
              <stop offset="100%" stopColor={color.clay} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={color.line} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9.5, fontFamily: font.mono, fill: color.inkSoft }}
            axisLine={{ stroke: color.line }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fontFamily: font.mono, fill: color.inkSoft }}
            axisLine={false}
            tickLine={false}
            width={34}
          />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              fontFamily: font.mono,
              border: `1px solid ${color.line}`,
              borderRadius: 6,
            }}
            formatter={(v) => [`${v.toFixed(1)} people/cell avg`, "density"]}
          />
          <Area
            type="monotone"
            dataKey="density"
            stroke={color.clay}
            strokeWidth={2}
            fill="url(#popDensityFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ComparisonChart({ oneHealth, ward }) {
  const { data, wardCellCount } = buildPopulationComparison(oneHealth.population, ward);
  return (
    <>
      <div style={{ height: 110 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={color.line} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fontFamily: font.mono, fill: color.inkSoft }}
              axisLine={{ stroke: color.line }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fontFamily: font.mono, fill: color.inkSoft }}
              axisLine={false}
              tickLine={false}
              width={34}
            />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                fontFamily: font.mono,
                border: `1px solid ${color.line}`,
                borderRadius: 6,
              }}
              formatter={(v) => [`${v.toFixed(1)} people/cell`, ""]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: 9, color: color.inkFaint, marginTop: 4, lineHeight: 1.5 }}>
        {ward
          ? `Ward average computed from ${wardCellCount.toLocaleString()} population-grid points (100m resolution) inside "${ward.name}".`
          : "No ward boundary at this location — ward comparison unavailable."}
      </p>
    </>
  );
}

function PopulationDetail({ oneHealth, ward, point }) {
  const profile = getPopulationDistanceProfile(point.lat, point.lng);
  const pct = getPopulationPercentile(oneHealth.population);

  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        background: color.parchment,
        border: `1px solid ${color.line}`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <PercentileBadge pct={pct} />
      </div>

      <div style={{ ...eyebrow(color.clay), marginBottom: 2 }}>
        Density trend by distance from point
      </div>
      <DistanceProfileChart profile={profile} />

      <div style={{ ...eyebrow(color.forestSoft), marginTop: 10, marginBottom: 2 }}>
        This location vs. ward vs. city
      </div>
      <ComparisonChart oneHealth={oneHealth} ward={ward} />
    </div>
  );
}

export function OneHealthCard({ oneHealth, ward, loading, point }) {
  const [expandedPop, setExpandedPop] = useState(true);

  return (
    <div style={{ ...card, marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div style={eyebrow(color.forestSoft)}>
          🌐 One Health Environmental Layers
        </div>
        <div style={{ fontSize: 11, color: color.clay, fontWeight: 700, fontFamily: font.mono }}>
          {ward ? `📍 ${ward.name}` : "Ward: outside HCMC boundary data"}
        </div>
      </div>

      {loading || !oneHealth ? (
        <div style={{ fontSize: 12, color: color.inkFaint }}>Loading…</div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 8,
            }}
          >
            {ROWS.map(([key, icon]) => {
              const meta = GRID_META[key];
              const isPop = key === "population";
              return (
                <div
                  key={key}
                  onClick={isPop ? () => setExpandedPop((s) => !s) : undefined}
                  title={`Source: ${meta.source} (${meta.vintage}) · Native: ${meta.nativeRes} · Displayed: ${meta.displayRes} · ${meta.note}`}
                  style={{
                    border: `1px solid ${isPop ? color.clay : color.line}`,
                    borderRadius: 10,
                    padding: "6px 10px",
                    background: isPop ? `${color.clay}0D` : color.parchment,
                    cursor: isPop ? "pointer" : "default",
                    position: "relative",
                  }}
                >
                  <div style={{ fontSize: 10, color: color.inkFaint, fontWeight: 600, fontFamily: font.mono, display: "flex", justifyContent: "space-between" }}>
                    <span>{icon} {meta.label.split("(")[0].trim()}</span>
                    {isPop && (
                      <span style={{ color: color.clay, fontSize: 9 }}>
                        {expandedPop ? "▲ hide trend" : "▼ show trend"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: color.ink, fontFamily: font.mono }}>
                    {fmt(key, oneHealth[key])}
                    {oneHealth[key] !== null && key !== "landcover" && (
                      <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 3 }}>
                        {meta.unit === "idx" ? "" : meta.unit}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {expandedPop && point && (
            <PopulationDetail oneHealth={oneHealth} ward={ward} point={point} />
          )}
        </>
      )}
      <p style={{ fontSize: 9, color: color.inkFaint, marginTop: 8, lineHeight: 1.6 }}>
        Sources: Sentinel-5P TROPOMI 2025 (gas indices, ~1km sensor-limited) ·
        MODIS LST 2025 (~1km) · VIIRS nightlights (~500m) · GHSL 2020 (100m) ·
        JRC Global Surface Water (displayed 100m) · SRTM elevation (~150m) ·
        Dynamic World land cover (100m) · Hansen forest (~150m) · WorldPop 2024
        population (100m, full native resolution). Gas indices are relative
        (scaled column density), not calibrated µg/m³. Hover any tile for its
        exact source & resolution.
      </p>
    </div>
  );
}
