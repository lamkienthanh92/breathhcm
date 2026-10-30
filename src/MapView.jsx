import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { SOURCE_CATS, SOURCES } from "./sourceUtils.js";
import { getNearbyWards } from "./wards.js";
import { getGrids } from "./gridLoader.js";
import { pm25CellsInBox, pm25ColorBreaks, getPM25Meta } from "./pm25.js";
import { color, font } from "./theme.js";

// Fix default marker icons (Leaflet + bundlers issue)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const MAX_MARKERS_PER_CAT = 8;
const POLLUTION_CATS = ["industrial", "landfill", "wastewater", "fuel"];

// How far around the searched point to draw the choropleth grid. Bigger
// box = more context but more rectangles to render; 0.025° (~2.7km) at
// 100m cells is ~54x54 ≈ 2,900 rectangles, which the canvas renderer
// handles comfortably.
const CHORO_BOX_DEG = 0.025;

// ── Population choropleth: real 100m grid cells, real color-coded value,
// real borders. Replaces the earlier leaflet.heat blur, which (a) wasn't
// rendering reliably -- UMD plugin interop issues are common in bundled
// ESM apps -- and (b) was the wrong visual metaphor anyway: this is
// discrete gridded data, not a continuous density field, so showing it
// as actual bounded cells is both more honest and easier to read.
let _popThresholds = null;
function getPopThresholds(grid) {
  if (_popThresholds) return _popThresholds;
  const vals = [];
  for (const row of grid.grid) for (const v of row) if (v !== null && v > 0) vals.push(v);
  vals.sort((a, b) => a - b);
  const at = (p) => vals[Math.floor(vals.length * p)] || 0;
  _popThresholds = [at(0.2), at(0.4), at(0.6), at(0.8)];
  return _popThresholds;
}

const POP_COLORS = ["#DBEAFE", "#93C5FD", "#FBBF24", "#F97316", "#DC2626"];

function popColorFor(v, thresholds) {
  if (v === null || v === undefined || v <= 0) return null;
  for (let i = 0; i < thresholds.length; i++) {
    if (v <= thresholds[i]) return POP_COLORS[i];
  }
  return POP_COLORS[POP_COLORS.length - 1];
}

function buildPopulationChoropleth(lat, lng) {
  const grids = getGrids();
  if (!grids) return { rects: [], legend: [] };
  const g = grids.population;
  const { lats, lons, grid } = g;
  const halfLat = (lats[1] - lats[0]) / 2;
  const halfLng = (lons[1] - lons[0]) / 2;
  const thresholds = getPopThresholds(g);

  let iLo = lats.findIndex((v) => v >= lat - CHORO_BOX_DEG);
  if (iLo < 0) iLo = 0;
  let iHi = lats.length - 1;
  while (iHi > 0 && lats[iHi] > lat + CHORO_BOX_DEG) iHi--;
  let jLo = lons.findIndex((v) => v >= lng - CHORO_BOX_DEG);
  if (jLo < 0) jLo = 0;
  let jHi = lons.length - 1;
  while (jHi > 0 && lons[jHi] > lng + CHORO_BOX_DEG) jHi--;

  const rects = [];
  for (let i = iLo; i <= iHi; i++) {
    for (let j = jLo; j <= jHi; j++) {
      const v = grid[i][j];
      const c = popColorFor(v, thresholds);
      if (!c) continue;
      rects.push({
        bounds: [
          [lats[i] - halfLat, lons[j] - halfLng],
          [lats[i] + halfLat, lons[j] + halfLng],
        ],
        color: c,
        popup: `<b>${v.toFixed(1)} people</b> / 100m cell`,
      });
    }
  }
  return {
    rects,
    legend: [
      { color: POP_COLORS[0], label: `≤ ${thresholds[0].toFixed(0)}` },
      { color: POP_COLORS[1], label: `≤ ${thresholds[1].toFixed(0)}` },
      { color: POP_COLORS[2], label: `≤ ${thresholds[2].toFixed(0)}` },
      { color: POP_COLORS[3], label: `≤ ${thresholds[3].toFixed(0)}` },
      { color: POP_COLORS[4], label: `> ${thresholds[3].toFixed(0)}` },
    ],
  };
}

// ── Pollution-source-density choropleth: bins OSM pollution-category
// points into a coarser grid (built on the fly, ~250m cells) and colors
// by count per cell. Also real bounded cells, not a blur.
const POLL_COLORS = ["#FEF3C7", "#FDBA74", "#F97316", "#DC2626", "#7C2D12"];
const POLL_CELL_DEG = 0.0025; // ~250-280m

function buildPollutionChoropleth(lat, lng) {
  const cellsMap = new Map();
  const iOf = (v) => Math.floor(v / POLL_CELL_DEG);

  for (const s of SOURCES) {
    if (!POLLUTION_CATS.includes(s.cat)) continue;
    if (Math.abs(s.lat - lat) > CHORO_BOX_DEG || Math.abs(s.lng - lng) > CHORO_BOX_DEG) continue;
    const key = `${iOf(s.lat)}|${iOf(s.lng)}`;
    cellsMap.set(key, (cellsMap.get(key) || 0) + 1);
  }

  const rects = [];
  for (const [key, count] of cellsMap.entries()) {
    const [ci, cj] = key.split("|").map(Number);
    const cLat = ci * POLL_CELL_DEG;
    const cLng = cj * POLL_CELL_DEG;
    const colorIdx = Math.min(POLL_COLORS.length - 1, count - 1);
    rects.push({
      bounds: [
        [cLat, cLng],
        [cLat + POLL_CELL_DEG, cLng + POLL_CELL_DEG],
      ],
      color: POLL_COLORS[colorIdx],
      popup: `<b>${count}</b> pollution source${count !== 1 ? "s" : ""} in this ~280m cell`,
    });
  }
  return {
    rects,
    legend: [
      { color: POLL_COLORS[0], label: "1" },
      { color: POLL_COLORS[1], label: "2" },
      { color: POLL_COLORS[2], label: "3" },
      { color: POLL_COLORS[3], label: "4" },
      { color: POLL_COLORS[4], label: "5+" },
    ],
  };
}

// ── PM2.5 choropleth: the actual satellite grid cells (~1 km) around the
// point, coloured by sextiles of the cells SHOWN (local scale). City-wide
// breaks (≈22–27 µg/m³) would paint the whole inner city (25–34) one colour;
// the legend prints the µg/m³ values so maps remain comparable by number.
const PM25_COLORS = ["#FFF7BC", "#FEE391", "#FEC44F", "#FE9929", "#EC7014", "#B4400A"];

function pm25ColorFor(v, breaks) {
  for (let i = 0; i < breaks.length; i++) if (v <= breaks[i]) return PM25_COLORS[i];
  return PM25_COLORS[PM25_COLORS.length - 1];
}

function buildPM25Choropleth(lat, lng) {
  const meta = getPM25Meta();
  if (!meta) return { rects: [], legend: [] };
  // ~12 cells each way at 1 km; legacy 5.5 km cells need a wider box to show more than one cell.
  const box = Math.max(0.12, 3 * (meta.resolutionKm / 111));
  const cells = pm25CellsInBox(lat, lng, box);
  const breaks = pm25ColorBreaks(PM25_COLORS.length, cells.map((c) => c.value));
  const rects = cells.map((c) => ({
    bounds: c.bounds,
    color: pm25ColorFor(c.value, breaks),
    popup:
      `<b>PM2.5 ${c.value.toFixed(1)}${c.sigma != null ? ` ± ${c.sigma.toFixed(1)}` : ""} µg/m³</b>` +
      `<br/>${meta.isFallback ? "LEGACY fallback grid" : meta.product}, ${meta.period}` +
      `<br/>cell centre ${c.cLat.toFixed(3)}, ${c.cLng.toFixed(3)} · ${meta.resolution}`,
  }));
  const legend = PM25_COLORS.map((col, i) => ({
    color: col,
    label: i === 0 ? `≤${breaks[0]}` : i < breaks.length ? `≤${breaks[i]}` : `>${breaks[breaks.length - 1]}`,
  }));
  return { rects, legend, zoom: meta.resolutionKm > 3 ? 11 : 13 };
}

function ChoroplethToggle({ mode, setMode, legend }) {
  const options = [
    ["none", "None"],
    ["population", "Population"],
    ["pollution", "Pollution"],
    ["pm25", "PM2.5"],
  ];
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <span
          style={{
            fontSize: 9.5,
            fontFamily: font.mono,
            color: color.inkFaint,
            marginRight: 2,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Grid overlay:
        </span>
        {options.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            style={{
              fontSize: 10,
              fontFamily: font.mono,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background: mode === k ? color.forest : color.sageMist,
              color: mode === k ? "#fff" : color.inkSoft,
            }}
          >
            {label}
          </button>
        ))}
        {legend && legend.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginLeft: 8, alignItems: "center" }}>
            {legend.map((l, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 10, height: 10, background: l.color, borderRadius: 2, border: `1px solid ${color.line}` }} />
                <span style={{ fontSize: 8.5, fontFamily: font.mono, color: color.inkFaint }}>{l.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MapView({ point, sourceDists, ward, closestRoad }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const layerRef = useRef(null);
  const choroLayerRef = useRef(null);
  const [choroMode, setChoroMode] = useState("population");
  const prevModeRef = useRef("population");
  const [legend, setLegend] = useState([]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true, // rectangles/circles render via canvas -- much
                             // faster than SVG once we're drawing thousands
                             // of choropleth cells.
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(mapRef.current);

      // Dedicated pane below the default overlay pane (z-index 400) so
      // choropleth cells always render underneath markers/ward outlines
      // regardless of which effect adds its layer first. (LayerGroup has
      // no bringToBack() — that only exists on individual vector layers
      // — so pane-based ordering is the robust fix, not a per-layer call.)
      const pane = mapRef.current.createPane("choropleth");
      pane.style.zIndex = 350;
    }
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Markers + ward boundaries layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !point) return;

    if (layerRef.current) layerRef.current.remove();
    const group = L.layerGroup().addTo(map);
    layerRef.current = group;

    L.marker([point.lat, point.lng])
      .addTo(group)
      .bindPopup("<b>📍 Measured location</b>");

    const nearbyWards = getNearbyWards(point.lat, point.lng, 0.02);
    nearbyWards.forEach((w) => {
      const isContaining = ward && w.name === ward.name;
      const latlngs = w.polygons.map((poly) =>
        poly.map((ring) => ring.map(([lng, lat]) => [lat, lng]))
      );
      latlngs.forEach((poly) => {
        L.polygon(poly, {
          color: isContaining ? color.forestSoft : color.inkFaint,
          weight: isContaining ? 2.5 : 1,
          fillColor: isContaining ? color.sage : "transparent",
          fillOpacity: isContaining ? 0.04 : 0,
          opacity: isContaining ? 1 : 0.5,
          dashArray: isContaining ? null : "3,4",
        })
          .addTo(group)
          .bindPopup(`<b>Phường/Xã:</b> ${w.name}`);
      });
    });

    const byCat = {};
    for (const s of sourceDists || []) {
      if (!byCat[s.cat]) byCat[s.cat] = [];
      if (byCat[s.cat].length < MAX_MARKERS_PER_CAT) byCat[s.cat].push(s);
    }
    Object.values(byCat)
      .flat()
      .forEach((s) => {
        const meta = SOURCE_CATS[s.cat];
        L.circleMarker([s.lat, s.lng], {
          radius: 5,
          color: meta?.bar || "#666",
          fillColor: meta?.bar || "#666",
          fillOpacity: 0.85,
          weight: 1,
        })
          .addTo(group)
          .bindPopup(
            `<b>${meta?.icon || ""} ${s.name}</b><br/>${
              meta?.desc || s.cat
            }<br/>${s.dist.toLocaleString()} m away`
          );
      });

    map.setView([point.lat, point.lng], 15);
  }, [point, sourceDists, ward]);

  // Choropleth grid layer (independent toggle)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !point) return;
    if (choroLayerRef.current) {
      choroLayerRef.current.remove();
      choroLayerRef.current = null;
    }
    // PM2.5 cells are ~1 km: zoom out so the gradient is visible, and
    // return to street level when leaving PM2.5 mode.
    const prev = prevModeRef.current;
    prevModeRef.current = choroMode;

    if (choroMode === "none") {
      setLegend([]);
      if (prev === "pm25") map.setView([point.lat, point.lng], 15);
      return;
    }

    const built =
      choroMode === "population"
        ? buildPopulationChoropleth(point.lat, point.lng)
        : choroMode === "pm25"
        ? buildPM25Choropleth(point.lat, point.lng)
        : buildPollutionChoropleth(point.lat, point.lng);
    const { rects, legend: lg } = built;
    if (choroMode === "pm25") map.setView([point.lat, point.lng], built.zoom || 13);
    else if (prev === "pm25") map.setView([point.lat, point.lng], 15);

    const group = L.layerGroup();
    rects.forEach((r) => {
      L.rectangle(r.bounds, {
        pane: "choropleth",
        color: "rgba(255,255,255,0.4)",
        weight: 0.5,
        fillColor: r.color,
        fillOpacity: 0.55,
      })
        .addTo(group)
        .bindPopup(r.popup);
    });
    group.addTo(map);
    choroLayerRef.current = group;
    setLegend(lg);
  }, [choroMode, point]);

  return (
    <div>
      <ChoroplethToggle mode={choroMode} setMode={setChoroMode} legend={legend} />
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: 340,
          borderRadius: 14,
          border: `1px solid ${color.line}`,
          overflow: "hidden",
        }}
      />
      <p style={{ fontSize: 9, color: color.inkFaint, marginTop: 6, lineHeight: 1.5 }}>
        Solid boundary = ward containing this point · dashed = neighboring
        wards (context only). Grid overlay shows real cell boundaries at
        their actual resolution (population: 100m · pollution density:
        ~280m · PM2.5: {getPM25Meta()?.resolution ?? "–"}
        {getPM25Meta()?.isFallback ? " — LEGACY fallback" : ""}) — colored by
        value, not a blurred estimate. PM2.5 colours: sextiles of the cells
        shown (local scale — read the µg/m³ values in the legend).
      </p>
    </div>
  );
}
