import { useState, useCallback, useMemo, useEffect } from "react";
import { ROAD_NAMES } from "./roads.js";
import { getPM25Risk } from "./air.js";
import {
  loadPM25,
  registerPM25Grid,
  getPM25Meta,
  roadPM25,
  roadPM25Stats,
  maxRoadPM25,
} from "./pm25.js";
import { SOURCES } from "./sourceUtils.js";
import { fetchClimate } from "./climate.js";
import {
  PollutionSummaryCard,
  GreenSummaryCard,
  ClimateCard,
} from "./EnvComponents";
import { SourcesTable } from "./sourcesTable";
import { exportExcel } from "./excelExport.js";
import { measurePoint } from "./measure.js";
import { BatchPanel } from "./BatchPanel.jsx";
import { AnalysisPanel } from "./analysis/AnalysisPanel.jsx";
import { loadGrids } from "./gridLoader.js";
import { MapView } from "./MapView.jsx";
import { OneHealthCard } from "./OneHealthCard.jsx";
import { DataSourcesTable } from "./DataSourcesTable.jsx";
import { DistanceTrendsGrid } from "./DistanceTrendsGrid.jsx";
import { CorrelationPanel } from "./CorrelationPanel.jsx";
import { SourceExposureRadar } from "./SourceExposureRadar.jsx";
import { color, font, card, inp, eyebrow, buttonPrimary, topographicSvgDataUri } from "./theme.js";
import { Readout, IconChip, SectionHeader, StatusDot, Icon, CAT_ICON } from "./ui.jsx";

// ── Helpers ───────────────────────────────────────────────────────────
function getRoadRisk(d) {
  if (d < 50)
    return { label: "High", color: "#9B1C1C", bg: "#FEF2F2", bar: "#EF4444" };
  if (d < 200)
    return { label: "Med", color: "#92400E", bg: "#FFFBEB", bar: "#F59E0B" };
  return { label: "Low", color: "#166534", bg: "#F0FDF4", bar: "#22C55E" };
}
function parseCoord(s) {
  if (!s?.trim()) return null;
  const m = s.trim().match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
  if (!m) return null;
  const a = parseFloat(m[1]),
    b = parseFloat(m[2]);
  if (isNaN(a) || isNaN(b) || a < 10 || a > 11 || b < 106 || b > 107)
    return null;
  return { lat: a, lng: b };
}

function pm25Tooltip(result) {
  const m = result.pm25Meta;
  const d = result.pm25Detail;
  if (!m) return "";
  const cell =
    d?.cellLat != null ? ` Grid cell centre: ${d.cellLat}, ${d.cellLng}.` : " Point lies outside the PM2.5 grid.";
  if (m.isFallback)
    return `LEGACY FALLBACK — ${m.product}. Resolution ${m.resolution}: one value spans several wards; not usable to compare nearby residences.${cell}`;
  return (
    `Source: ${m.product}, annual mean ${m.period}. Resolution ${m.resolution} (native grid, not resampled).` +
    (d?.sigma != null ? ` Uncertainty ±${d.sigma} µg/m³ (1σ).` : "") +
    `${cell} Category uses WHO 2021 annual AQG/interim targets and QCVN 05:2023 (25 µg/m³). ` +
    "ACAG notes 0.01° files do not fully resolve PM2.5 gradients at that scale — read as ~1 km neighbourhood exposure, not street-level."
  );
}

export default function App() {
  const [coord, setCoord] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [asc, setAsc] = useState(true);
  const [tab, setTab] = useState("traffic");
  const [filterCat, setFilterCat] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [envLoading, setEnvLoading] = useState(false);
  const [gridsReady, setGridsReady] = useState(false);
  const [gridsError, setGridsError] = useState(null);
  const [gridsProgress, setGridsProgress] = useState(0);
  const [pm25Meta, setPm25Meta] = useState(null);

  // Load the ~19MB One Health environmental grids ONCE on mount, from a
  // static JSON asset (not bundled JS -- see gridLoader.js for why).
  // Everything that reads grid data (search, map heatmap, population
  // chart) is gated on gridsReady so nothing reads a null grid.
  useEffect(() => {
    let cancelled = false;
    // PM2.5 (~1 km, /data/pm25.json) loads in parallel. loadPM25() never
    // rejects -- if the file is missing it falls back to the legacy ~5.5 km
    // grid and getPM25Meta().isFallback says so (banner below + every export).
    Promise.all([loadGrids(), loadPM25()])
      .then(() => {
        registerPM25Grid(); // no-op for the legacy fallback
        if (!cancelled) {
          setPm25Meta(getPM25Meta());
          setGridsReady(true);
        }
      })
      .catch((e) => {
        if (!cancelled) setGridsError(e.message || String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const doSearch = useCallback(async () => {
    const p = parseCoord(coord);
    if (!p) {
      setErr("Invalid coordinates — expected format: lat, lng");
      return;
    }
    setErr("");

    const base = measurePoint(p.lat, p.lng, name);

    setResult(base);
    setEnvLoading(true);

    const climate = await fetchClimate(p.lat, p.lng);
    const full = { ...base, climate };
    setResult(full);
    setSessions((prev) => [...prev, full]);
    setEnvLoading(false);
  }, [coord, name]);

  const sortedRoads = useMemo(() => {
    if (!result) return [];
    const arr = [...result.dists];
    if (tab === "traffic")
      return arr.sort((a, b) => (asc ? a.dist - b.dist : b.dist - a.dist));
    return arr.sort((a, b) => {
      const pa = roadPM25(a.name) ?? 0,
        pb = roadPM25(b.name) ?? 0;
      return asc ? pa - pb : pb - pa;
    });
  }, [result, asc, tab]);

  const maxDist = result ? Math.max(...result.dists.map((d) => d.dist)) : 1;
  const maxPM25 = useMemo(() => (gridsReady ? maxRoadPM25() : 1), [gridsReady]);
  const ok = parseCoord(coord);
  const roadRk = result ? getRoadRisk(result.minDist) : null;
  const pm25Rk = result ? getPM25Risk(result.pm25) : null;

  return (
    <div
      style={{
        fontFamily: font.body,
        maxWidth: 820,
        margin: "0 auto",
        fontSize: 13,
        color: color.ink,
        paddingBottom: "2rem",
      }}
    >
      {/* Header — deep-forest banner with a topographic contour signature */}
      <div
        style={{
          background: `linear-gradient(160deg, ${color.forest} 0%, #16302A 100%)`,
          backgroundImage: `${topographicSvgDataUri()}, linear-gradient(160deg, ${color.forest} 0%, #16302A 100%)`,
          backgroundSize: "480px auto, cover",
          backgroundRepeat: "repeat, no-repeat",
          padding: "1.4rem 0.9rem 1.6rem",
          marginBottom: "1.1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 21c4.5-4.2 7-7.7 7-11a7 7 0 10-14 0c0 3.3 2.5 6.8 7 11z"
                stroke="#EAF3EC"
                strokeWidth="1.4"
                fill="none"
              />
              <circle cx="12" cy="10" r="2.6" stroke="#EAF3EC" strokeWidth="1.4" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                color: "#A7C4AE",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                fontFamily: font.mono,
                marginBottom: 2,
              }}
            >
              Field Exposure Station · HCMC
            </div>
            <h1
              style={{
                fontFamily: font.display,
                fontSize: 22,
                fontWeight: 600,
                color: "#F7F6EF",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              One Health Exposure Explorer
            </h1>
            <p
              style={{
                fontSize: 11,
                color: "#B7CBBB",
                margin: "4px 0 0",
                fontFamily: font.mono,
              }}
            >
              {ROAD_NAMES.length} roads · {SOURCES.length.toLocaleString()}{" "}
              OSM sources · 168 wards · air · land · water · animal layers
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 0.85rem" }}>
      {/* Input */}
      <div style={{ ...card, marginBottom: 12 }}>
        <label
          style={{
            ...eyebrow(color.forestSoft),
            display: "block",
            marginBottom: 8,
          }}
        >
          📍 Google Maps Coordinates
          <span
            style={{
              fontWeight: 400,
              color: color.inkFaint,
              fontSize: 10,
              marginLeft: 8,
              textTransform: "none",
              letterSpacing: "normal",
              fontFamily: font.body,
            }}
          >
            right-click → click the coordinate line → paste
          </span>
        </label>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: 2 }}>
            <input
              style={{
                ...inp,
                borderColor: coord ? color.sage : color.line,
                background: coord ? color.sageMist : color.parchment,
                fontFamily: font.mono,
                fontSize: 14,
              }}
              placeholder="10.758773, 106.649111"
              value={coord}
              onChange={(e) => setCoord(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              autoFocus
            />
            {!coord ? (
              <div style={{ fontSize: 10, color: color.inkFaint, marginTop: 5 }}>
                Paste coordinates from Google Maps
              </div>
            ) : !ok ? (
              <div style={{ fontSize: 10, color: color.brick, marginTop: 5 }}>
                ⚠ Not recognized — expected "lat, lng"
              </div>
            ) : (
              <div style={{ fontSize: 10, color: color.forestSoft, marginTop: 5 }}>
                ✓ {ok.lat.toFixed(6)}, {ok.lng.toFixed(6)}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              style={{
                ...inp,
                borderColor: name ? color.water : color.line,
                background: name ? color.waterMist : color.parchment,
              }}
              placeholder="Patient name / Sample ID"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
            />
            <div style={{ fontSize: 10, color: color.inkFaint, marginTop: 5 }}>
              {name ? (
                <span style={{ color: color.water }}>✓ {name}</span>
              ) : (
                "Sample label"
              )}
            </div>
          </div>
          <button
            onClick={doSearch}
            disabled={!ok || envLoading || !gridsReady}
            style={{
              ...buttonPrimary,
              flexShrink: 0,
              whiteSpace: "nowrap",
              background: ok && !envLoading && gridsReady ? color.forest : "#D1D5DB",
              cursor: ok && !envLoading && gridsReady ? "pointer" : "not-allowed",
            }}
          >
            {!gridsReady ? "Loading data…" : envLoading ? "Loading…" : "Measure"}
          </button>
        </div>
        {!gridsReady && !gridsError && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: color.inkSoft,
              background: color.sageMist,
              borderRadius: 7,
              padding: "7px 12px",
            }}
          >
            ⏳ Loading ~19MB of environmental grid data (population, air
            quality, land cover…) — one-time load, cached for the rest of
            this session. May take a few seconds on a slower connection.
          </div>
        )}
        {gridsError && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: color.brick,
              background: color.brickMist,
              borderRadius: 7,
              padding: "7px 12px",
            }}
          >
            ⚠️ Failed to load environmental data: {gridsError}. Check that{" "}
            <code>/public/data/grids.json</code> was deployed alongside the
            app, then reload the page.
          </div>
        )}
        {gridsReady && pm25Meta?.isFallback && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: color.ink,
              background: color.brickMist,
              border: `1px solid ${color.brick}`,
              borderRadius: 7,
              padding: "7px 12px",
              lineHeight: 1.55,
            }}
          >
            ⚠️ <strong>PM2.5 is running on the legacy ~5.5 km fallback grid</strong>,
            not the ~1 km satellite product. Values from this grid cannot
            separate residences within a neighbourhood — do not use them for
            analysis. {pm25Meta.fallbackReason}
          </div>
        )}
        {err && (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: color.brick,
              background: color.brickMist,
              borderRadius: 7,
              padding: "7px 12px",
            }}
          >
            {err}
          </div>
        )}
      </div>

      <BatchPanel ready={gridsReady} onAdd={(list) => setSessions((prev) => [...prev, ...list])} />

      <AnalysisPanel ready={gridsReady} />

      {/* Session bar */}
      {sessions.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
            padding: "8px 14px",
            background: color.sageMist,
            borderRadius: 9,
            border: `1px solid ${color.line}`,
          }}
        >
          <span style={{ fontSize: 12, color: color.inkSoft }}>
            💾 <strong style={{ color: color.ink }}>{sessions.length}</strong>{" "}
            measurement{sessions.length !== 1 ? "s" : ""}
            {sessions.some((s) => s.patientName) && (
              <span style={{ color: color.water, marginLeft: 8 }}>
                ·{" "}
                {[
                  ...new Set(
                    sessions
                      .filter((s) => s.patientName)
                      .map((s) => s.patientName)
                  ),
                ]
                  .slice(0, 3)
                  .join(", ")}
                {sessions.filter((s) => s.patientName).length > 3 ? "…" : ""}
              </span>
            )}
          </span>
          <button
            onClick={() => exportExcel(sessions)}
            style={{
              padding: "6px 16px",
              fontSize: 12,
              fontWeight: 700,
              border: "none",
              borderRadius: 7,
              background: color.forestSoft,
              color: "#fff",
              cursor: "pointer",
              fontFamily: font.body,
            }}
          >
            ⬇ Export Excel ({sessions.length} case
            {sessions.length !== 1 ? "s" : ""})
          </button>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* 4 metric cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <Readout
              iconName="ruler"
              tint={color.forestSoft}
              label="Coordinates"
              value={`${result.geo.lat.toFixed(5)}, ${result.geo.lng.toFixed(5)}`}
              meta={result.patientName ? `👤 ${result.patientName}` : null}
              tooltip="User-entered coordinate, as pasted from Google Maps — exact, not gridded."
            />
            <Readout
              iconName="ruler"
              tint={roadRk.bar}
              label="Nearest Road"
              value={result.minDist.toLocaleString("en-US")}
              unit="m"
              meta={result.closest.name}
              statusLabel={roadRk.label}
              tooltip="Source: road geometry inherited from original project (unverified, structurally OSM-like — see Data Sources table below). Distance: exact Haversine point-to-segment, not gridded."
            />
            <Readout
              iconName="cloudRain"
              tint={pm25Rk.bar}
              label="Home PM2.5"
              value={result.pm25 ?? "–"}
              unit="µg/m³"
              meta={
                (result.pm25Detail?.sigma != null ? `±${result.pm25Detail.sigma} · ` : "") +
                (result.pm25Meta?.shortLabel ?? "")
              }
              statusLabel={pm25Rk.label}
              tooltip={pm25Tooltip(result)}
            />
            <Readout
              iconName="ward"
              tint={color.clay}
              label="Ward · Population"
              value={
                result.oneHealth?.population != null
                  ? Math.round(result.oneHealth.population)
                  : "–"
              }
              unit="/ 100m cell"
              meta={result.ward ? result.ward.name : "Outside HCMC"}
              tooltip="Source: WorldPop community catalog, 2024. Displayed at ~1.4km grid spacing (downsampled from 100m native) — see Data Sources table below for the full caveat."
            />
          </div>

          {/* Env cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <PollutionSummaryCard
              closest={result.closestByCat}
              sourceDists={result.sourceDists}
              loading={false}
            />
            <GreenSummaryCard
              closest={result.closestByCat}
              ndvi={result.ndvi}
              evi={result.evi}
              sourceDists={result.sourceDists}
            />
          </div>

          <ClimateCard climate={result.climate} loading={envLoading} />

          {/* Interactive map — point, ward boundary, nearest sources */}
          <div style={{ marginBottom: 12 }}>
            <MapView
              point={result.geo}
              sourceDists={result.sourceDists}
              ward={result.ward}
              closestRoad={result.closest}
            />
          </div>

          {/* One Health environmental layers */}
          <OneHealthCard
            oneHealth={result.oneHealth}
            ward={result.ward}
            loading={envLoading}
            point={result.geo}
          />

          {/* Distance-decay trends across multiple variables (not just population) */}
          <DistanceTrendsGrid point={result.geo} />

          {/* OSM proximity radar — visually distinct chart type */}
          <SourceExposureRadar closestByCat={result.closestByCat} />

          {/* City-wide correlation analysis between environmental variables */}
          <CorrelationPanel />

          {/* Full data provenance / resolution disclosure */}
          <DataSourcesTable />

          {/* Bottom table */}
          <div
            style={{ ...card, padding: 0, overflow: "hidden", marginTop: 4 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 16px",
                borderBottom: "1px solid #F3F4F6",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  ["traffic", "Distance"],
                  ["pm25", "Road PM2.5"],
                  ["sources", "All Sources"],
                ].map(([k, lbl]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    style={{
                      padding: "6px 13px",
                      fontSize: 10.5,
                      fontWeight: 700,
                      border: "none",
                      borderRadius: 7,
                      cursor: "pointer",
                      fontFamily: font.mono,
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                      background: tab === k ? color.forest : color.sageMist,
                      color: tab === k ? "#fff" : color.inkSoft,
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {tab !== "sources" && (
                <button
                  onClick={() => setAsc((s) => !s)}
                  style={{
                    fontSize: 10.5,
                    color: color.inkSoft,
                    border: `1px solid ${color.line}`,
                    background: color.parchment,
                    cursor: "pointer",
                    padding: "5px 11px",
                    borderRadius: 6,
                    fontFamily: font.mono,
                  }}
                >
                  {asc ? "↑ Ascending" : "↓ Descending"}
                </button>
              )}
            </div>

            {tab === "sources" && (
              <SourcesTable
                distances={result.sourceDists}
                filterCat={filterCat}
                setFilterCat={setFilterCat}
                maxVisible={150}
              />
            )}

            {tab !== "sources" && (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr>
                    {(tab === "traffic"
                      ? [
                          "#",
                          "Road Name",
                          "Distance to Edge",
                          "Road PM2.5",
                          "Risk",
                        ]
                      : [
                          "#",
                          "Road Name",
                          "PM2.5 along road (µg/m³)",
                          "Distance",
                          "WHO 2021 / QCVN",
                        ]
                    ).map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 14px",
                          textAlign: "left",
                          fontSize: 11,
                          fontWeight: 700,
                          color: color.inkFaint,
                          background: color.parchment,
                          borderBottom: `1px solid ${color.line}`,
                          fontFamily: font.mono,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRoads.map((r, i) => {
                    const isC = r.name === result.closest.name;
                    const rPM25 = roadPM25(r.name);
                    const rStats = roadPM25Stats(r.name);
                    const rTitle = rStats && rStats.mean != null
                      ? `Length-weighted mean along ${rStats.lengthKm} km of road · range ${rStats.min}–${rStats.max} µg/m³ across ${rStats.nCells} grid cell${rStats.nCells !== 1 ? "s" : ""}` +
                        (rStats.excludedKm > 0 ? ` · ${rStats.excludedKm} km of a same-name street elsewhere excluded` : "")
                      : "Road lies outside the PM2.5 grid";
                    const rowBg = isC ? "#EFF6FF" : "transparent";
                    const tdBase = {
                      padding: "7px 14px",
                      borderBottom: "1px solid #F9FAFB",
                    };

                    if (tab === "traffic") {
                      const rk = getRoadRisk(r.dist);
                      const prk = getPM25Risk(rPM25);
                      const pct = Math.min(
                        100,
                        Math.round((r.dist / maxDist) * 100)
                      );
                      return (
                        <tr key={r.name} style={{ background: rowBg }}>
                          <td
                            style={{
                              ...tdBase,
                              color: "#D1D5DB",
                              fontSize: 11,
                              width: 28,
                            }}
                          >
                            {i + 1}
                          </td>
                          <td
                            style={{
                              ...tdBase,
                              fontWeight: isC ? 700 : 500,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isC && (
                              <span
                                style={{ color: "#2563EB", marginRight: 5 }}
                              >
                                ★
                              </span>
                            )}
                            {r.name}
                          </td>
                          <td style={tdBase}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  width: 60,
                                  height: 4,
                                  background: color.line,
                                  borderRadius: 2,
                                  flexShrink: 0,
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: 4,
                                    borderRadius: 2,
                                    background: rk.bar,
                                  }}
                                />
                              </div>
                              <span
                                style={{
                                  fontWeight: 700,
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {r.dist.toLocaleString("en-US")} m
                              </span>
                            </div>
                          </td>
                          <td style={tdBase} title={rTitle}>
                            <span
                              style={{
                                fontWeight: 600,
                                color: prk.color,
                                fontSize: 12,
                              }}
                            >
                              {rPM25 ?? "–"} µg/m³
                            </span>
                          </td>
                          <td style={tdBase}>
                            <StatusDot label={rk.label} tint={rk.bar} />
                          </td>
                        </tr>
                      );
                    } else {
                      const prk = getPM25Risk(rPM25);
                      const pct = Math.min(
                        100,
                        Math.round(((rPM25 ?? 0) / maxPM25) * 100)
                      );
                      return (
                        <tr key={r.name} style={{ background: rowBg }}>
                          <td
                            style={{
                              ...tdBase,
                              color: "#D1D5DB",
                              fontSize: 11,
                              width: 28,
                            }}
                          >
                            {i + 1}
                          </td>
                          <td
                            style={{
                              ...tdBase,
                              fontWeight: isC ? 700 : 500,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isC && (
                              <span
                                style={{ color: "#2563EB", marginRight: 5 }}
                              >
                                ★
                              </span>
                            )}
                            {r.name}
                          </td>
                          <td style={tdBase} title={rTitle}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  width: 60,
                                  height: 4,
                                  background: color.line,
                                  borderRadius: 2,
                                  flexShrink: 0,
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: 4,
                                    borderRadius: 2,
                                    background: prk.bar,
                                  }}
                                />
                              </div>
                              <span
                                style={{
                                  fontWeight: 700,
                                  fontVariantNumeric: "tabular-nums",
                                  color: prk.color,
                                }}
                              >
                                {rPM25 ?? "N/A"} µg/m³
                              </span>
                            </div>
                          </td>
                          <td
                            style={{
                              ...tdBase,
                              color: color.inkFaint,
                              fontSize: 12,
                            }}
                          >
                            {r.dist.toLocaleString("en-US")} m
                          </td>
                          <td style={tdBase}>
                            <StatusDot label={prk.short} tint={prk.bar} />
                          </td>
                        </tr>
                      );
                    }
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p
            style={{
              fontSize: 10,
              color: color.inkFaint,
              marginTop: 8,
              lineHeight: 1.8,
            }}
          >
            Distance to road: Haversine point-to-segment · PM2.5:{" "}
            {result.pm25Meta?.isFallback
              ? `LEGACY fallback grid ${result.pm25Meta.resolution} (provenance unverified)`
              : `${result.pm25Meta?.product}, ${result.pm25Meta?.period}, ${result.pm25Meta?.resolution}`}
            {" "}· road PM2.5 = length-weighted mean along each road · Sources:
            OSM via Overpass export (2 296 sites, offline) · Climate: Open-Meteo
            5-year normal 2020–2024 · Annual PM2.5 categories: WHO AQG 2021 ≤5,
            IT-4 10, IT-3 15, IT-2 25, IT-1 35 µg/m³; QCVN 05:2023 annual ≤25
            µg/m³
          </p>
        </>
      )}
      </div>
    </div>
  );
}
