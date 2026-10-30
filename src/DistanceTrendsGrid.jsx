import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GRID_META } from "./oneHealthGrids.js";
import { getDistanceProfile } from "./gridStats.js";
import { hasGrid } from "./gridLoader.js";
import { color, font } from "./theme.js";
import { SectionHeader } from "./ui.jsx";

// Curated set — the variables most relevant to a One Health exposure read,
// each with its own accent color so the small multiples stay visually
// distinct despite the shared layout.
const VARS = [
  { key: "population", label: "Population", tint: color.clay, icon: "👥" },
  { key: "no2", label: "NO2", tint: "#7C3AED", icon: "🌫️" },
  { key: "lst", label: "Land Temp", tint: "#DC2626", icon: "🌡️" },
  { key: "treecover", label: "Tree Cover", tint: color.forestSoft, icon: "🌲" },
  { key: "builtup", label: "Built-up", tint: color.water, icon: "🏙️" },
  // Only present when the ~1 km satellite PM2.5 grid loaded (see pm25.js);
  // at 1 km the 200m/500m rings usually contain no cell centre → no point.
  {
    key: "pm25",
    label: "PM2.5 (~1km)",
    tint: "#B4400A",
    icon: "💨",
    meta: { unit: "µg/m³", displayRes: "~1km" },
    optional: true,
  },
];

function MiniTrend({ varDef, lat, lng }) {
  const profile = getDistanceProfile(varDef.key, lat, lng);
  const meta = varDef.meta || GRID_META[varDef.key];
  const data = profile.map((p) => ({ label: p.label, v: p.avg }));
  const hasData = data.some((d) => d.v !== null);

  return (
    <div
      style={{
        border: `1px solid ${color.line}`,
        borderRadius: 10,
        padding: "8px 10px",
        background: color.parchment,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          color: varDef.tint,
          fontFamily: font.mono,
          marginBottom: 2,
        }}
      >
        {varDef.icon} {varDef.label}
      </div>
      {!hasData ? (
        <div style={{ fontSize: 9, color: color.inkFaint, height: 70, display: "flex", alignItems: "center" }}>
          Grid too coarse ({meta.displayRes}) for these radii
        </div>
      ) : (
        <div style={{ height: 70 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 8, fontFamily: font.mono, fill: color.inkFaint }}
                axisLine={{ stroke: color.line }}
                tickLine={false}
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  fontSize: 10,
                  fontFamily: font.mono,
                  border: `1px solid ${color.line}`,
                  borderRadius: 6,
                  padding: "4px 8px",
                }}
                labelStyle={{ display: "none" }}
                formatter={(v) => [v === null ? "N/A" : v.toFixed(2), meta.unit]}
              />
              <Line
                type="monotone"
                dataKey="v"
                stroke={varDef.tint}
                strokeWidth={2}
                dot={{ r: 2, fill: varDef.tint }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function DistanceTrendsGrid({ point }) {
  if (!point) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <SectionHeader
        iconName="ruler"
        tint={color.inkSoft}
        label="Distance Trends (200m → 3km)"
        caption="how each variable changes moving away from this point"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
        }}
      >
        {VARS.filter((v) => !v.optional || hasGrid(v.key)).map((v) => (
          <MiniTrend key={v.key} varDef={v} lat={point.lat} lng={point.lng} />
        ))}
      </div>
    </div>
  );
}
