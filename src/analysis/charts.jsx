// Plain-SVG charts for the analysis results. No chart library: the SVG
// produced here is exactly what the user downloads and what the HTML report
// embeds, so on-screen, downloaded and reported figures are identical.
import { useRef } from "react";
import { color, font } from "../theme.js";
import { DOMAINS } from "./exposureFeatures.js";

export const DOMAIN_COLOR = {
  [DOMAINS.air]: "#D55E00",
  [DOMAINS.green]: "#009E73",
  [DOMAINS.urban]: "#CC79A7",
  [DOMAINS.landuse]: "#E69F00",
  [DOMAINS.services]: "#0072B2",
  [DOMAINS.roads]: "#7F7F7F",
};
const DOMAIN_ORDER = Object.values(DOMAINS);
const domainColor = (d) => DOMAIN_COLOR[d] || "#555";
const shortLabel = (s, n = 34) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const TXT = { fontFamily: "Arial, Helvetica, sans-serif" };

export function downloadSvg(svg, name) {
  if (!svg) return;
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ChartFrame({ title, caption, fileName, children }) {
  const box = useRef(null);
  return (
    <div style={{ marginTop: 10, border: `1px solid ${color.line}`, borderRadius: 10, padding: "8px 10px", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: color.ink, fontFamily: font.body }}>{title}</div>
        <button
          onClick={() => downloadSvg(box.current?.querySelector("svg"), fileName)}
          style={{ fontSize: 11, border: `1px solid ${color.line}`, background: color.parchment, borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}
        >
          ⬇ SVG
        </button>
      </div>
      {caption && <div style={{ fontSize: 11, color: color.inkSoft, marginBottom: 4 }}>{caption}</div>}
      <div ref={box} data-chart={fileName} data-title={title} style={{ overflowX: "auto" }}>{children}</div>
    </div>
  );
}

// Colour key for the domains present, laid out in rows that fit width W. Returns {node, height}.
function domainLegend(domains, x0, y0, W) {
  const present = DOMAIN_ORDER.filter((d) => domains.includes(d));
  const items = [];
  let x = x0;
  let y = y0;
  for (const d of present) {
    const w = 22 + d.length * 5.7;
    if (x + w > W - 8 && x > x0) {
      x = x0;
      y += 16;
    }
    items.push({ d, x, y });
    x += w + 10;
  }
  const node = (
    <g>
      {items.map(({ d, x: xx, y: yy }) => (
        <g key={d}>
          <rect x={xx} y={yy - 8} width="10" height="10" fill={domainColor(d)} />
          <text x={xx + 14} y={yy + 1} fontSize="10" fill="#333">{d}</text>
        </g>
      ))}
    </g>
  );
  return { node, height: present.length ? y - y0 + 16 : 0 };
}

function sortByDomain(rows) {
  return [...rows].sort((a, b) => DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain) || a.label.localeCompare(b.label));
}

// −log10(p) for every exposure for one outcome, grouped by domain.
export function ManhattanChart({ rows, fdrLevel = 0.05 }) {
  const data = sortByDomain(rows);
  const W = Math.max(520, 26 * data.length + 90);
  const leg = domainLegend([...new Set(data.map((d) => d.domain))], 46, 14, W);
  const H = 300 + leg.height;
  const m = { l: 46, r: 12, t: 12 + leg.height, b: 150 };
  const ys = data.map((d) => -Math.log10(Math.max(d.p, 1e-12)));
  const yMax = Math.max(2, Math.ceil(Math.max(...ys, 0) + 0.3));
  const x = (i) => m.l + (i + 0.5) * ((W - m.l - m.r) / data.length);
  const y = (v) => H - m.b - (v / yMax) * (H - m.t - m.b);
  const sig = data.filter((d) => d.q_within != null && d.q_within < fdrLevel);
  const fdrP = sig.length ? Math.max(...sig.map((d) => d.p)) : null;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={TXT}>
      <rect x="0" y="0" width={W} height={H} fill="#fff" />
      {leg.node}
      {Array.from({ length: yMax + 1 }, (_, k) => (
        <g key={k}>
          <line x1={m.l} x2={W - m.r} y1={y(k)} y2={y(k)} stroke="#eee" />
          <text x={m.l - 6} y={y(k) + 4} fontSize="10" textAnchor="end" fill="#555">{k}</text>
        </g>
      ))}
      <text x={12} y={(H - m.b) / 2} fontSize="10.5" fill="#333" transform={`rotate(-90 12 ${(H - m.b) / 2})`} textAnchor="middle">−log10(p)</text>
      <line x1={m.l} x2={W - m.r} y1={y(-Math.log10(0.05))} y2={y(-Math.log10(0.05))} stroke="#888" strokeDasharray="4 3" />
      <text x={W - m.r} y={y(-Math.log10(0.05)) - 3} fontSize="9.5" textAnchor="end" fill="#666">p = 0.05</text>
      {fdrP && (
        <g>
          <line x1={m.l} x2={W - m.r} y1={y(-Math.log10(fdrP))} y2={y(-Math.log10(fdrP))} stroke={color.brick} strokeDasharray="2 2" />
          <text x={W - m.r} y={y(-Math.log10(fdrP)) - 3} fontSize="9.5" textAnchor="end" fill={color.brick}>FDR q &lt; {fdrLevel}</text>
        </g>
      )}
      {data.map((d, i) => (
        <g key={d.exposure}>
          <circle cx={x(i)} cy={y(ys[i])} r={d.p < 0.05 ? 4.6 : 3.4} fill={d.p < 0.05 ? domainColor(d.domain) : "#fff"} stroke={domainColor(d.domain)} strokeWidth="1.4" />
          <text x={x(i)} y={H - m.b + 10} fontSize="9.5" fill="#333" textAnchor="end" transform={`rotate(-55 ${x(i)} ${H - m.b + 10})`}>
            {(d.prespecified ? "★ " : "") + shortLabel(d.label, 30)}
          </text>
        </g>
      ))}
      <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} stroke="#333" />
    </svg>
  );
}

// Estimates with 95% CI for one outcome.
export function ForestChart({ rows, nullValue = 0, unit }) {
  const data = sortByDomain(rows);
  const rowH = 17;
  const W = 640;
  const plotH = 10 + 34 + rowH * data.length;
  const leg = domainLegend([...new Set(data.map((d) => d.domain))], 20, plotH + 8, W);
  const m = { l: 230, r: 20, t: 10, b: 34 + leg.height + 6 };
  const H = plotH + leg.height + 6;
  const lo = Math.min(nullValue, ...data.map((d) => d.lo));
  const hi = Math.max(nullValue, ...data.map((d) => d.hi));
  const pad = (hi - lo) * 0.05 || 1;
  const x = (v) => m.l + ((v - (lo - pad)) / (hi + pad - (lo - pad))) * (W - m.l - m.r);
  const ticks = niceTicks(lo - pad, hi + pad, 6);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={TXT}>
      <rect x="0" y="0" width={W} height={H} fill="#fff" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={m.t} y2={H - m.b} stroke="#f0f0f0" />
          <text x={x(t)} y={H - m.b + 12} fontSize="9.5" textAnchor="middle" fill="#555">{fmtTick(t)}</text>
        </g>
      ))}
      <line x1={x(nullValue)} x2={x(nullValue)} y1={m.t} y2={H - m.b} stroke="#333" strokeDasharray="3 3" />
      {data.map((d, i) => {
        const yy = m.t + rowH * (i + 0.5);
        const c = domainColor(d.domain);
        return (
          <g key={d.exposure}>
            <text x={m.l - 8} y={yy + 3.5} fontSize="10" textAnchor="end" fill="#222">{(d.prespecified ? "★ " : "") + shortLabel(d.label, 38)}</text>
            <line x1={x(d.lo)} x2={x(d.hi)} y1={yy} y2={yy} stroke={c} strokeWidth="1.4" />
            <circle cx={x(d.estimate)} cy={yy} r="3.4" fill={d.p < 0.05 ? c : "#fff"} stroke={c} strokeWidth="1.4" />
          </g>
        );
      })}
      <text x={(m.l + W - m.r) / 2} y={plotH - 6} fontSize="10.5" textAnchor="middle" fill="#333">{unit} (95% CI)</text>
      {leg.node}
    </svg>
  );
}

// Coefficient of variation per exposure (log scale), labelled with distinct values.
export function ContrastChart({ rows }) {
  const data = [...rows].filter((r) => r.cv_pct > 0).sort((a, b) => a.cv_pct - b.cv_pct);
  const rowH = 15;
  const W = 640;
  const plotH = 8 + 32 + rowH * data.length;
  const leg = domainLegend([...new Set(data.map((d) => d.domain))], 20, plotH + 8, W);
  const m = { l: 230, r: 50, t: 8, b: 32 + leg.height + 6 };
  const H = plotH + leg.height + 6;
  const lmin = Math.log10(Math.min(0.5, ...data.map((d) => d.cv_pct)));
  const lmax = Math.log10(Math.max(200, ...data.map((d) => d.cv_pct)));
  const x = (v) => m.l + ((Math.log10(v) - lmin) / (lmax - lmin)) * (W - m.l - m.r);
  const ticks = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].filter((t) => Math.log10(t) >= lmin && Math.log10(t) <= lmax);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={TXT}>
      <rect x="0" y="0" width={W} height={H} fill="#fff" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={m.t} y2={H - m.b} stroke="#f0f0f0" />
          <text x={x(t)} y={H - m.b + 12} fontSize="9.5" textAnchor="middle" fill="#555">{t}</text>
        </g>
      ))}
      <line x1={x(5)} x2={x(5)} y1={m.t} y2={H - m.b} stroke={color.brick} strokeDasharray="3 3" />
      {data.map((d, i) => {
        const yy = m.t + rowH * i;
        return (
          <g key={d.key}>
            <text x={m.l - 8} y={yy + rowH * 0.7} fontSize="9.8" textAnchor="end" fill="#222">{shortLabel(d.label, 38)}</text>
            <rect x={m.l} y={yy + 2} width={Math.max(1, x(d.cv_pct) - m.l)} height={rowH - 4} fill={domainColor(d.domain)} opacity="0.85" />
            <text x={x(d.cv_pct) + 4} y={yy + rowH * 0.7} fontSize="9" fill="#444">{d.n_distinct}</text>
          </g>
        );
      })}
      <text x={(m.l + W - m.r) / 2} y={plotH - 6} fontSize="10.5" textAnchor="middle" fill="#333">
        Coefficient of variation across residences, % (log scale; labels = distinct values; red line = 5%)
      </text>
      {leg.node}
    </svg>
  );
}

// Restricted-cubic-spline curve with 95% band.
export function DoseChart({ item }) {
  const pts = item.curve;
  const W = 300;
  const H = 210;
  const m = { l: 46, r: 10, t: 22, b: 40 };
  const xv = (p) => (item.log_x ? Math.log10(Math.max(p.x, 1e-9)) : p.x);
  const xs = pts.map(xv);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ylo = Math.min(...pts.map((p) => p.lo));
  const yhi = Math.max(...pts.map((p) => p.hi));
  const nul = item.unit.startsWith("odds") || item.unit.startsWith("rate") ? 1 : 0;
  const y0 = Math.min(ylo, nul);
  const y1 = Math.max(yhi, nul);
  const X = (v) => m.l + ((v - xmin) / (xmax - xmin || 1)) * (W - m.l - m.r);
  const Y = (v) => H - m.b - ((v - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);
  const band = pts.map((p, i) => `${X(xs[i])},${Y(p.hi)}`).join(" ") + " " + [...pts].reverse().map((p, i) => `${X(xs[pts.length - 1 - i])},${Y(p.lo)}`).join(" ");
  const line = pts.map((p, i) => `${X(xs[i])},${Y(p.estimate)}`).join(" ");
  const xt = item.log_x ? logTicks(xmin, xmax) : niceTicks(xmin, xmax, 4);
  const yt = niceTicks(y0, y1, 5);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={TXT}>
      <rect x="0" y="0" width={W} height={H} fill="#fff" />
      <text x={m.l} y={12} fontSize="10.5" fill="#222" fontWeight="bold">{item.outcome} ~ {shortLabel(item.label, 30)}</text>
      {yt.map((t) => (
        <g key={`y${t}`}>
          <line x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} stroke="#f0f0f0" />
          <text x={m.l - 5} y={Y(t) + 3} fontSize="9" textAnchor="end" fill="#555">{fmtTick(t)}</text>
        </g>
      ))}
      {xt.map((t) => (
        <text key={`x${t}`} x={X(t)} y={H - m.b + 12} fontSize="9" textAnchor="middle" fill="#555">
          {item.log_x ? fmtTick(10 ** t) : fmtTick(t)}
        </text>
      ))}
      <polygon points={band} fill="#2A6B76" opacity="0.18" />
      <polyline points={line} fill="none" stroke="#2A6B76" strokeWidth="1.8" />
      <line x1={m.l} x2={W - m.r} y1={Y(nul)} y2={Y(nul)} stroke="#333" strokeDasharray="3 3" />
      <text x={(m.l + W - m.r) / 2} y={H - 18} fontSize="9.5" textAnchor="middle" fill="#333">
        {item.log_x ? "distance, m (log scale)" : "exposure"} · p non-linear {item.p_nonlinear == null ? "—" : item.p_nonlinear.toFixed(2)}
      </text>
      <text x={(m.l + W - m.r) / 2} y={H - 5} fontSize="9" textAnchor="middle" fill="#666">{item.unit}</text>
    </svg>
  );
}

function logTicks(lo, hi) {
  const out = [];
  for (let k = Math.floor(lo) - 1; k <= Math.ceil(hi); k++)
    for (const m of [1, 2, 5]) {
      const t = Math.log10(m * 10 ** k);
      if (t >= lo - 1e-9 && t <= hi + 1e-9) out.push(t);
    }
  return out.length >= 2 ? out : niceTicks(lo, hi, 3);
}

function niceTicks(lo, hi, n) {
  if (!(hi > lo)) return [lo];
  const step0 = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0) || step0;
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t / step) * step);
  return out;
}

function fmtTick(v) {
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString("en-US");
  if (a >= 10) return String(Math.round(v * 10) / 10);
  if (a >= 1) return String(Math.round(v * 100) / 100);
  return String(Math.round(v * 1000) / 1000);
}
