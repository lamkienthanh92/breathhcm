import { SOURCE_CATS } from "./sourceUtils.js";

const POLL_CATS = [
  "industrial",
  "market",
  "landfill",
  "wastewater",
  "fuel",
  "hospital",
];
const GREEN_CATS = ["park", "forest"];
const ONE_HEALTH_CATS = [
  "school",
  "clinic",
  "veterinary",
  "farm",
  "recreation",
  "butcher",
  "publicinfra",
];
const ALL_CATS = [...POLL_CATS, ...GREEN_CATS, ...ONE_HEALTH_CATS];

function CatBadge({ cat }) {
  const m = SOURCE_CATS[cat];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 8px",
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 700,
        background: m.bg,
        color: m.color,
      }}
    >
      {m.icon} {m.desc}
    </span>
  );
}

function DistBar({ dist, maxDist, cat }) {
  const isGreen = cat === "park" || cat === "forest";
  const pct = Math.min(100, Math.round((dist / maxDist) * 100));
  const barColor = isGreen
    ? dist < 500
      ? "#22C55E"
      : "#6B7280"
    : dist < 200
    ? "#EF4444"
    : dist < 500
    ? "#F59E0B"
    : "#6B7280";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 60,
          height: 4,
          background: "#F3F4F6",
          borderRadius: 2,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: 4,
            borderRadius: 2,
            background: barColor,
          }}
        />
      </div>
      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {dist.toLocaleString("en-US")} m
      </span>
    </div>
  );
}

export function SourcesTable({
  distances,
  filterCat,
  setFilterCat,
  maxVisible = 150,
}) {
  if (!distances || distances.length === 0) return null;

  const visible = (
    filterCat ? distances.filter((s) => s.cat === filterCat) : distances
  ).slice(0, maxVisible);

  const maxDist = visible.length ? visible[visible.length - 1].dist : 1;

  return (
    <div>
      {/* Category filter pills */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          padding: "10px 14px",
          borderBottom: "1px solid #F3F4F6",
        }}
      >
        <button
          onClick={() => setFilterCat(null)}
          style={{
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 700,
            border: "none",
            borderRadius: 20,
            cursor: "pointer",
            fontFamily: "inherit",
            background: filterCat === null ? "#111" : "#F3F4F6",
            color: filterCat === null ? "#fff" : "#6B7280",
          }}
        >
          All ({distances.length})
        </button>
        {ALL_CATS.map((cat) => {
          const count = distances.filter((s) => s.cat === cat).length;
          if (count === 0) return null;
          const m = SOURCE_CATS[cat];
          const active = filterCat === cat;
          return (
            <button
              key={cat}
              onClick={() => setFilterCat(active ? null : cat)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 700,
                border: "none",
                borderRadius: 20,
                cursor: "pointer",
                fontFamily: "inherit",
                background: active ? m.color : m.bg,
                color: active ? "#fff" : m.color,
              }}
            >
              {m.icon} {m.desc} ({count})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead>
          <tr>
            {["#", "Name", "Category", "Distance"].map((h) => (
              <th
                key={h}
                style={{
                  padding: "8px 14px",
                  textAlign: "left",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#9CA3AF",
                  background: "#FAFAFA",
                  borderBottom: "1px solid #F3F4F6",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((s, i) => (
            <tr
              key={`${s.cat}-${i}`}
              style={{ background: i % 2 === 0 ? "transparent" : "#FAFAFA" }}
            >
              <td
                style={{
                  padding: "6px 14px",
                  borderBottom: "1px solid #F9FAFB",
                  color: "#D1D5DB",
                  fontSize: 11,
                  width: 28,
                }}
              >
                {i + 1}
              </td>
              <td
                style={{
                  padding: "6px 14px",
                  borderBottom: "1px solid #F9FAFB",
                  fontWeight: 500,
                }}
              >
                {s.name}
              </td>
              <td
                style={{
                  padding: "6px 14px",
                  borderBottom: "1px solid #F9FAFB",
                }}
              >
                <CatBadge cat={s.cat} />
              </td>
              <td
                style={{
                  padding: "6px 14px",
                  borderBottom: "1px solid #F9FAFB",
                }}
              >
                <DistBar dist={s.dist} maxDist={maxDist} cat={s.cat} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {distances.length > maxVisible && (
        <div
          style={{
            padding: "8px 14px",
            fontSize: 11,
            color: "#9CA3AF",
            textAlign: "center",
          }}
        >
          Showing top {maxVisible} of {distances.length} — use category filter
          to narrow down
        </div>
      )}
    </div>
  );
}
