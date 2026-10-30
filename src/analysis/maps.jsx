// Maps for the analysis results, drawn as plain SVG from the app's own ward
// polygons and exposure measurements, so they work offline and download as
// publication-ready SVG.
//
// Privacy by design: no individual residence is ever drawn. Participant
// counts and outcome residuals are shown only as ward aggregates, and wards
// with fewer than `min_cell` participants (5) arrive from the engine already
// suppressed and are drawn hatched.
import { useState, useMemo } from "react";
import { WARDS } from "../wards.js";
import { color, font } from "../theme.js";
import { ChartFrame } from "./charts.jsx";
import { studyExtent } from "./surface.js";

const VIRIDIS = ["#440154", "#482878", "#3E4989", "#31688E", "#26828E", "#1F9E89", "#35B779", "#6ECE58", "#B5DE2B", "#FDE725"];
const RDBU = ["#2166AC", "#4393C3", "#92C5DE", "#D1E5F0", "#F7F7F7", "#FDDBC7", "#F4A582", "#D6604D", "#B2182B"];
const TXT = { fontFamily: "Arial, Helvetica, sans-serif" };

function hex(c) {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function ramp(stops, t) {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const a = hex(stops[i]);
  const b = hex(stops[i + 1]);
  const f = x - i;
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`;
}
const fmtNum = (v) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString("en-US");
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
};

function projection(bbox, width) {
  const [x0, y0, x1, y1] = bbox;
  const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const height = Math.round((width * (y1 - y0)) / ((x1 - x0) * k));
  return {
    width,
    height,
    x: (lng) => ((lng - x0) / (x1 - x0)) * width,
    y: (lat) => ((y1 - lat) / (y1 - y0)) * height,
    kmPerPx: ((x1 - x0) * 111.32 * k) / width,
  };
}

function wardsIn(bbox) {
  const [x0, y0, x1, y1] = bbox;
  return WARDS.filter((w) => !(w.bbox[2] < x0 || w.bbox[0] > x1 || w.bbox[3] < y0 || w.bbox[1] > y1));
}

function wardPath(w, P) {
  return w.polygons
    .map((poly) => poly.map((ring) => "M" + ring.map(([lng, lat]) => `${P.x(lng).toFixed(1)},${P.y(lat).toFixed(1)}`).join("L") + "Z").join(""))
    .join("");
}

function MapFurniture({ P, top }) {
  const nice = [0.5, 1, 2, 5, 10].find((km) => km / P.kmPerPx >= P.width * 0.16) || 10;
  const len = nice / P.kmPerPx;
  const y = top + P.height - 12;
  return (
    <g>
      <rect x={4} y={y - 15} width={len + 12} height={20} fill="#fff" fillOpacity="0.8" rx="3" />
      <rect x={P.width - 27} y={top + 1} width={22} height={30} fill="#fff" fillOpacity="0.8" rx="3" />
      <line x1={10} x2={10 + len} y1={y} y2={y} stroke="#222" strokeWidth="2" />
      <text x={10 + len / 2} y={y - 4} fontSize="9" textAnchor="middle" fill="#222">{nice} km</text>
      <g transform={`translate(${P.width - 16}, ${top + 12})`}>
        <path d="M0,-9 L5,5 L0,2 L-5,5 Z" fill="#222" />
        <text y="16" fontSize="8.5" textAnchor="middle" fill="#222">N</text>
      </g>
    </g>
  );
}

function ColorBar({ x, y, w, stops, lo, hi, label, ticks }) {
  const id = `cb${Math.round(x * 7 + y * 13 + w)}${stops.length}`;
  return (
    <g>
      <defs>
        <linearGradient id={id}>
          {stops.map((c, i) => <stop key={i} offset={`${(100 * i) / (stops.length - 1)}%`} stopColor={c} />)}
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={w} height={8} fill={`url(#${id})`} stroke="#999" strokeWidth="0.4" />
      {(ticks || [[0, fmtNum(lo)], [1, fmtNum(hi)]]).map(([t, s], i) => (
        <text key={i} x={x + t * w} y={y + 18} fontSize="8.5" textAnchor="middle" fill="#333">{s}</text>
      ))}
      <text x={x + w / 2} y={y - 3} fontSize="8.5" textAnchor="middle" fill="#333">{label}</text>
    </g>
  );
}

// values: {wardName: number | null}; null = suppressed (< min cell size); missing = no participants.
export function WardChoropleth({ bbox, values, title, unit, diverging = false, width = 360, idp = "m" }) {
  const P = projection(bbox, width);
  const ws = wardsIn(bbox);
  const nums = Object.values(values).filter((v) => v != null && Number.isFinite(v));
  let lo = Math.min(...nums);
  let hi = Math.max(...nums);
  if (diverging) {
    const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
    lo = -m;
    hi = m;
  }
  const fill = (v) => (hi > lo ? ramp(diverging ? RDBU : VIRIDIS, (v - lo) / (hi - lo)) : ramp(VIRIDIS, 0.5));
  const top = 18;
  const H = top + P.height + 44;
  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} style={TXT}>
      <defs>
        <pattern id={`${idp}hatch`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="#f2f2f2" />
          <line x1="0" y1="0" x2="0" y2="5" stroke="#9a9a9a" strokeWidth="1.2" />
        </pattern>
      </defs>
      <defs>
        <clipPath id={`${idp}clip`}><rect x="0" y="0" width={width} height={P.height} /></clipPath>
      </defs>
      <rect width={width} height={H} fill="#fff" />
      <text x={2} y={12} fontSize="10.5" fontWeight="bold" fill="#222">{title}</text>
      <g transform={`translate(0, ${top})`} clipPath={`url(#${idp}clip)`}>
        {ws.map((w) => {
          const has = Object.prototype.hasOwnProperty.call(values, w.name);
          const v = values[w.name];
          const f = !has ? "#fafafa" : v == null ? `url(#${idp}hatch)` : fill(v);
          return <path key={w.name} d={wardPath(w, P)} fill={f} fillRule="evenodd" stroke="#666" strokeWidth={has ? 0.7 : 0.35} />;
        })}
      </g>
      <MapFurniture P={P} top={top} />
      {nums.length > 0 && (
        <ColorBar x={width * 0.18} y={top + P.height + 16} w={width * 0.44} stops={diverging ? RDBU : VIRIDIS} lo={lo} hi={hi} label={unit} />
      )}
      <rect x={width * 0.7} y={top + P.height + 16} width="10" height="8" fill={`url(#${idp}hatch)`} stroke="#999" strokeWidth="0.4" />
      <text x={width * 0.7 + 14} y={top + P.height + 23} fontSize="8.5" fill="#333">&lt; 5 participants</text>
    </svg>
  );
}

// Exposure surface measured on a regular grid with the app's own code.
export function SurfaceMap({ surface, featureKey, label, transform = "none", width = 360, title }) {
  const P = projection(surface.bbox, width);
  const ws = wardsIn(surface.bbox);
  const raw = surface.cells.map((c) => c.f[featureKey]);
  const toScale = (v) => (transform === "log10" ? Math.log10(Math.max(v, 1)) : transform === "log10p1" ? Math.log10(v + 1) : v);
  const fromScale = (s) => (transform === "log10" ? 10 ** s : transform === "log10p1" ? 10 ** s - 1 : s);
  const sc = raw.map((v) => (v == null || !Number.isFinite(v) ? null : toScale(v)));
  const fin = sc.filter((v) => v != null).sort((a, b) => a - b);
  const q = (p) => fin[Math.min(fin.length - 1, Math.max(0, Math.round(p * (fin.length - 1))))];
  const lo = q(0.02);
  const hi = q(0.98);
  const top = 18;
  const H = top + P.height + 44;
  const cw = P.x(surface.bbox[0] + surface.dLng) - P.x(surface.bbox[0]) + 0.6;
  const ch = P.y(surface.bbox[3] - surface.dLat) - P.y(surface.bbox[3]) + 0.6;
  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} style={TXT}>
      <defs>
        <clipPath id={`sm${featureKey}clip`}><rect x="0" y="0" width={width} height={P.height} /></clipPath>
      </defs>
      <rect width={width} height={H} fill="#fff" />
      <text x={2} y={12} fontSize="10.5" fontWeight="bold" fill="#222">{title || label}</text>
      <g transform={`translate(0, ${top})`} clipPath={`url(#sm${featureKey}clip)`}>
        {surface.cells.map((c, i) =>
          sc[i] == null ? null : (
            <rect key={i} x={P.x(c.lng - surface.dLng / 2)} y={P.y(c.lat + surface.dLat / 2)} width={cw} height={ch}
              fill={hi > lo ? ramp(VIRIDIS, (sc[i] - lo) / (hi - lo)) : ramp(VIRIDIS, 0.5)} />
          )
        )}
        {ws.map((w) => <path key={w.name} d={wardPath(w, P)} fill="none" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="0.6" />)}
      </g>
      <MapFurniture P={P} top={top} />
      <ColorBar x={width * 0.18} y={top + P.height + 16} w={width * 0.64} stops={VIRIDIS} lo={fromScale(lo)} hi={fromScale(hi)}
        label={label + (transform !== "none" ? " (log scale)" : "")}
        ticks={[0, 0.5, 1].map((t) => [t, fmtNum(fromScale(lo + t * (hi - lo)))])} />
    </svg>
  );
}

const sel = { fontSize: 12, padding: 4, marginRight: 8 };
const tabBtn = (on) => ({
  border: `1px solid ${on ? color.forest : color.line}`, background: on ? color.forest : "#fff", color: on ? "#fff" : color.ink,
  borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", marginRight: 6, fontFamily: font.body,
});
const cellValues = (wards) => Object.fromEntries(Object.entries(wards).map(([w, c]) => [w, c.suppressed ? null : c.mean]));

export function MapsSection({ result, computeSurface, initialSurface = null }) {
  const maps = result.maps;
  const bbox = useMemo(() => (maps ? studyExtent(Object.keys(maps.participants)) : null), [maps]);
  const [tab, setTab] = useState("participants");
  const [surface, setSurface] = useState(initialSurface);
  const [progress, setProgress] = useState(null);
  const exposures = (result.screening || []).filter((e) => e.status === "tested" || e.status === "anchor");
  const [expKey, setExpKey] = useState(exposures[0]?.key);
  const [outcome, setOutcome] = useState(maps?.residuals?.[0]?.outcome);
  if (!maps || !bbox) return null;
  const meta = Object.fromEntries((result.screening || []).map((e) => [e.key, e]));
  const transformOf = (k) => (k?.endsWith("_dist") ? "log10" : k === "road_mindist" ? "log10p1" : "none");
  const res = maps.residuals.find((r) => r.outcome === outcome);
  const run = async () => {
    setProgress(0);
    const s = await computeSurface(bbox, 45, setProgress);
    setSurface(s);
    setProgress(null);
  };
  return (
    <div>
      <div style={{ fontSize: 11.5, color: color.inkSoft, marginBottom: 6 }}>
        No individual residence is drawn. Counts and residuals are ward averages; wards with fewer than {maps.min_cell} participants
        ({maps.n_wards_suppressed} of {maps.n_wards}) are hatched and their values are never exported.
      </div>
      <div style={{ marginBottom: 6 }}>
        {[["participants", "Participants"], ["surface", "Exposure surface"], ["residuals", "Outcome residuals"],
          ["gradient", `Spatial-gradient checks (${maps.gradient_pairs.length})`]].map(([k, l]) => (
          <button key={k} style={tabBtn(tab === k)} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "participants" && (
        <ChartFrame title="Participants per ward" fileName="map_participants_per_ward.svg">
          <WardChoropleth bbox={bbox} values={maps.participants} title="Participants per ward" unit="participants" width={460} idp="mp" />
        </ChartFrame>
      )}

      {tab === "surface" && (
        <div>
          <select value={expKey} onChange={(e) => setExpKey(e.target.value)} style={sel}>
            {exposures.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
          {!surface && progress == null && (
            <button style={tabBtn(true)} onClick={run}>Measure exposure surfaces (~10 s)</button>
          )}
          {progress != null && <span style={{ fontSize: 12, fontFamily: font.mono }}>Measuring grid… {Math.round(100 * progress)}%</span>}
          {surface && expKey && (
            <ChartFrame title={`Exposure surface: ${meta[expKey]?.label}`} fileName={`map_surface_${expKey}.svg`}
              caption="Each cell is measured with the same code as the participants' residences.">
              <SurfaceMap surface={surface} featureKey={expKey} label={meta[expKey]?.label || expKey} transform={transformOf(expKey)} width={460} />
            </ChartFrame>
          )}
        </div>
      )}

      {tab === "residuals" && res && (
        <div>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} style={sel}>
            {maps.residuals.map((r) => <option key={r.outcome} value={r.outcome}>{r.outcome}</option>)}
          </select>
          <ChartFrame title={`Outcome residuals by ward: ${outcome}`} fileName={`map_residuals_${outcome}.svg`}
            caption="Mean residual of the covariate-adjusted model. Spatial clustering of colours indicates large-scale structure the model has not captured.">
            <WardChoropleth bbox={bbox} values={cellValues(res.wards)} title={`${outcome}: mean residual`} unit={res.unit} diverging width={460} idp="mr" />
          </ChartFrame>
        </div>
      )}

      {tab === "gradient" && (
        <div>
          {maps.gradient_pairs.length === 0 && <div style={{ fontSize: 12, color: color.inkSoft }}>No association was flagged as a spatial gradient.</div>}
          {maps.gradient_pairs.map((g, i) => (
            <ChartFrame key={i} title={`${g.outcome} ~ ${g.label}: flagged as a spatial gradient`} fileName={`map_gradient_${g.outcome}_${g.exposure}.svg`}
              caption="If both maps follow the same broad north–south or east–west pattern, the association reflects geography rather than local exposure.">
              <svg width={740} height={projection(bbox, 360).height + 62}>
                <g><WardChoropleth bbox={bbox} values={cellValues(g.outcome_wards)} title={`${g.outcome}: mean residual`} unit={g.outcome_unit} diverging width={360} idp={`ga${i}`} /></g>
                <g transform="translate(380,0)"><WardChoropleth bbox={bbox} values={cellValues(g.exposure_wards)} title={`${g.label}: mean (SD units)`} unit="SD units" diverging width={360} idp={`gb${i}`} /></g>
              </svg>
            </ChartFrame>
          ))}
        </div>
      )}
    </div>
  );
}
