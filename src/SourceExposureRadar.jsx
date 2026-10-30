import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { SOURCE_CATS } from "./sourceUtils.js";
import { color, font, card as cardBase } from "./theme.js";
import { SectionHeader } from "./ui.jsx";

// Closeness score 0-100: 0m -> 100, 3km+ -> 0, linear falloff. Simple and
// legible on a radar axis, unlike raw meters (which would need a reversed,
// non-linear axis to read intuitively).
function closenessScore(dist) {
  if (dist === null || dist === undefined) return 0;
  return Math.max(0, Math.min(100, 100 - dist / 30));
}

const RISK_CATS = ["industrial", "landfill", "wastewater", "fuel", "market", "butcher", "farm"];
const AMENITY_CATS = ["park", "forest", "school", "clinic", "hospital", "veterinary", "recreation", "publicinfra"];

function buildRadarData(closestByCat, cats) {
  return cats.map((cat) => ({
    cat,
    label: SOURCE_CATS[cat]?.desc?.split("/")[0].trim() || cat,
    score: closenessScore(closestByCat[cat]?.dist),
    dist: closestByCat[cat]?.dist ?? null,
  }));
}

function RadarPane({ title, tint, data }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          color: tint,
          fontFamily: font.mono,
          textAlign: "center",
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      <div style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke={color.line} />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fontSize: 8.5, fontFamily: font.mono, fill: color.inkSoft }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={{ fontSize: 7, fill: color.inkFaint }}
              tickCount={3}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 10,
                fontFamily: font.mono,
                border: `1px solid ${color.line}`,
                borderRadius: 6,
                padding: "4px 8px",
              }}
              formatter={(_, __, item) => [
                item.payload.dist !== null ? `${item.payload.dist.toLocaleString()} m away` : "none found",
                "distance",
              ]}
            />
            <Radar dataKey="score" stroke={tint} fill={tint} fillOpacity={0.28} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function SourceExposureRadar({ closestByCat }) {
  if (!closestByCat) return null;
  const riskData = buildRadarData(closestByCat, RISK_CATS);
  const amenityData = buildRadarData(closestByCat, AMENITY_CATS);

  return (
    <div style={{ ...cardBase, marginTop: 12 }}>
      <SectionHeader
        iconName="ruler"
        tint={color.clay}
        label="OSM Proximity Radar"
        caption="closeness score (100 = at location, 0 = 3km+)"
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <RadarPane title="⚠️ Risk / Pollution Sources" tint={color.clay} data={riskData} />
        <RadarPane title="🌿 Amenities & Green Space" tint={color.forestSoft} data={amenityData} />
      </div>
      <p style={{ fontSize: 9, color: color.inkFaint, marginTop: 8, lineHeight: 1.5 }}>
        Larger shape = closer to more categories. Score is a simple linear
        transform of distance (not a validated exposure index) — hover a
        point for the actual distance in meters. Source: OSM Overpass export.
      </p>
    </div>
  );
}
