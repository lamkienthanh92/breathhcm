import { useState } from "react";
import { SOURCE_CATS } from "./sourceUtils.js";
import { getNDVIClass } from "./ndvi.js";
import { color, font, card as cardBase } from "./theme.js";
import { CAT_ICON, IconChip, SectionHeader, TickGauge, Icon } from "./ui.jsx";

const card = cardBase;

function riskTint(dist, isGreen) {
  if (isGreen) return dist < 200 ? color.forestSoft : dist < 500 ? color.sage : color.inkFaint;
  return dist < 200 ? color.brick : dist < 500 ? color.amber : color.inkSoft;
}

function ExpandToggleBtn({ expanded, onClick }) {
  return (
    <button
      onClick={onClick}
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
        whiteSpace: "nowrap",
      }}
    >
      {expanded ? "▲ Show closest only" : "▼ Show all nearby"}
    </button>
  );
}

function SourceRow({ source, compact }) {
  const meta = SOURCE_CATS[source.cat];
  const dist = source.dist;
  const isGreen = source.cat === "park" || source.cat === "forest";
  const tint = riskTint(dist, isGreen);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: compact ? "4px 0" : "7px 0",
        borderBottom: `1px solid ${color.line}`,
      }}
    >
      <IconChip
        iconName={CAT_ICON[source.cat]}
        tint={isGreen ? color.forestSoft : color.clay}
        size={compact ? 20 : 26}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: compact ? 10.5 : 11.5,
            fontWeight: 600,
            color: color.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {source.name}
        </div>
        {!compact && (
          <div style={{ fontSize: 9.5, color: color.inkFaint, fontFamily: font.mono }}>
            {meta.desc}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div
          style={{
            fontSize: compact ? 11.5 : 13,
            fontWeight: 700,
            color: tint,
            fontVariantNumeric: "tabular-nums",
            fontFamily: font.mono,
          }}
        >
          {dist.toLocaleString("en-US")}
          <span style={{ fontSize: 10, fontWeight: 400 }}> m</span>
        </div>
      </div>
    </div>
  );
}

function EmptyRow({ cat }) {
  const meta = SOURCE_CATS[cat];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 0",
        borderBottom: `1px solid ${color.line}`,
        opacity: 0.55,
      }}
    >
      <IconChip iconName={CAT_ICON[cat]} tint={color.inkFaint} size={26} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10.5, color: color.inkFaint, fontFamily: font.mono }}>
          {meta.desc}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: color.inkFaint, fontFamily: font.mono }}>
        none found
      </div>
    </div>
  );
}

// Sub-list shown when a category is expanded: top N nearest sites.
function ExpandedCategoryList({ cat, sourceDists, n = 5 }) {
  const items = (sourceDists || [])
    .filter((s) => s.cat === cat)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n);
  if (!items.length) return null;
  return (
    <div
      style={{
        marginLeft: 36,
        marginBottom: 6,
        paddingLeft: 10,
        borderLeft: `2px solid ${color.line}`,
      }}
    >
      {items.map((s, i) => (
        <SourceRow key={`${s.lat},${s.lng},${i}`} source={s} compact />
      ))}
    </div>
  );
}

// ── Pollution Sources Card ────────────────────────────────────────────
export function PollutionSummaryCard({ closest, sourceDists }) {
  const [expanded, setExpanded] = useState(false);
  const POLL_CATS = ["industrial", "market", "landfill", "wastewater", "fuel", "hospital"];
  return (
    <div style={card}>
      <SectionHeader
        iconName="factory"
        tint={color.clay}
        label="Pollution Sources"
        caption="OSM Overpass"
        toggle={
          closest && (
            <ExpandToggleBtn expanded={expanded} onClick={() => setExpanded((s) => !s)} />
          )
        }
      />
      {!closest ? (
        <div style={{ fontSize: 11, color: color.inkFaint }}>Will appear after measurement</div>
      ) : (
        POLL_CATS.map((cat) => (
          <div key={cat}>
            {closest[cat] ? <SourceRow source={closest[cat]} /> : <EmptyRow cat={cat} />}
            {expanded && (
              <ExpandedCategoryList cat={cat} sourceDists={sourceDists} />
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── Green Buffer + NDVI/EVI Card ──────────────────────────────────────
function VegTile({ label, value, cls, range, min, max }) {
  return (
    <div
      style={{
        flex: 1,
        background: color.parchment,
        border: `1px solid ${color.line}`,
        borderRadius: 10,
        padding: "9px 11px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: color.forestSoft,
            fontFamily: font.mono,
            letterSpacing: "0.05em",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: color.ink,
            fontFamily: font.mono,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value != null ? value.toFixed(3) : "–"}
        </span>
      </div>
      <div style={{ fontSize: 9.5, color: color.inkSoft, marginTop: 2 }}>{cls.label}</div>
      <TickGauge value={value ?? min} min={min} max={max} tint={color.forestSoft} />
      <div style={{ fontSize: 8.5, color: color.inkFaint, marginTop: 3, fontFamily: font.mono }}>
        range {range}
      </div>
    </div>
  );
}

export function GreenSummaryCard({ closest, ndvi, evi, sourceDists }) {
  const [expanded, setExpanded] = useState(false);
  const GREEN_CATS = ["park", "forest"];
  const ndviClass = getNDVIClass(ndvi);
  const eviClass = getNDVIClass(evi);

  return (
    <div style={card}>
      <SectionHeader
        iconName="tree"
        tint={color.forestSoft}
        label="Green Buffer & Vegetation"
        caption="OSM + MODIS ~1km"
        toggle={
          closest && (
            <ExpandToggleBtn expanded={expanded} onClick={() => setExpanded((s) => !s)} />
          )
        }
      />

      {!closest ? (
        <div style={{ fontSize: 11, color: color.inkFaint }}>Will appear after measurement</div>
      ) : (
        GREEN_CATS.map((cat) => (
          <div key={cat}>
            {closest[cat] ? <SourceRow source={closest[cat]} /> : <EmptyRow cat={cat} />}
            {expanded && (
              <ExpandedCategoryList cat={cat} sourceDists={sourceDists} />
            )}
          </div>
        ))
      )}

      <div style={{ margin: "12px 0 0" }}>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: color.inkFaint,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontFamily: font.mono,
            marginBottom: 7,
          }}
        >
          Satellite Vegetation Index · MODIS 2020–2024
        </div>

        {ndvi === null && evi === null ? (
          <div style={{ fontSize: 11, color: color.inkFaint }}>
            No satellite data at this location
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <VegTile label="NDVI" value={ndvi} cls={ndviClass} range="–0.2 to 1.0" min={-0.2} max={1.0} />
            <VegTile label="EVI" value={evi} cls={eviClass} range="–0.1 to 0.6" min={-0.1} max={0.6} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Climate Card ──────────────────────────────────────────────────────
function ClimateStat({ iconName, label, value, unit, sub }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 90, flex: 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 9.5,
          color: color.inkFaint,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontFamily: font.mono,
        }}
      >
        <Icon name={iconName} size={11} color={color.water} />
        {label}
      </div>
      <div
        style={{
          fontSize: 21,
          fontWeight: 700,
          color: color.ink,
          lineHeight: 1,
          fontFamily: font.mono,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value ?? "–"}
        {value != null && unit && (
          <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2, color: color.inkSoft }}>
            {unit}
          </span>
        )}
      </div>
      <div style={{ height: 2, width: 24, background: color.water, borderRadius: 2 }} />
      {sub && <div style={{ fontSize: 9, color: color.inkFaint }}>{sub}</div>}
    </div>
  );
}

export function ClimateCard({ climate, loading }) {
  return (
    <div style={{ ...card, marginBottom: 12 }}>
      <SectionHeader
        iconName="thermo"
        tint={color.water}
        label="Climate Normal at Location"
        caption="Open-Meteo · 5yr mean 2020–2024"
      />
      {loading ? (
        <div style={{ fontSize: 11, color: color.inkFaint }}>
          Fetching 5-year climate data… (may take 5–10 s)
        </div>
      ) : climate ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: "2px 0 8px" }}>
            <ClimateStat iconName="thermo" label="Avg Temp" value={climate.tempMean} unit="°C" sub="annual mean" />
            <ClimateStat iconName="droplet" label="Avg Humidity" value={climate.humidityMean} unit="%" sub="annual mean" />
            <ClimateStat iconName="wind" label="Avg Wind" value={climate.windMean} unit="m/s" sub="annual mean" />
            <ClimateStat iconName="cloudRain" label="Annual Rain" value={climate.precipAnnual} unit="mm" sub="avg / year" />
          </div>
          <div style={{ fontSize: 9.5, color: color.inkFaint, marginTop: 4, fontFamily: font.mono }}>
            Based on {climate.nDays.toLocaleString()} daily records ({climate.period}) at this coordinate
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: color.inkFaint }}>Will appear after measurement</div>
      )}
    </div>
  );
}
