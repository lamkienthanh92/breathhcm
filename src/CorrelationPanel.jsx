import { useState, useEffect } from "react";
import { getCorrelation, CORRELATION_PAIRS } from "./gridStats.js";
import { GRID_META } from "./oneHealthGrids.js";
import { hasGrid } from "./gridLoader.js";
import { color, font, card as cardBase } from "./theme.js";
import { SectionHeader } from "./ui.jsx";

function strengthLabel(absR) {
  if (absR >= 0.7) return "strong";
  if (absR >= 0.4) return "moderate";
  if (absR >= 0.2) return "weak";
  return "negligible";
}

function CorrelationRow({ pair, result }) {
  const r = result?.r ?? 0;
  const tint = r >= 0 ? color.forestSoft : color.brick;
  const widthPct = Math.min(100, Math.abs(r) * 100);
  const labelA = pair.labelA || GRID_META[pair.a]?.label.split("(")[0].trim() || pair.a;
  const labelB = pair.labelB || GRID_META[pair.b]?.label.split("(")[0].trim() || pair.b;

  return (
    <div style={{ padding: "9px 0", borderBottom: `1px solid ${color.line}` }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: color.ink }}>
          {labelA} <span style={{ color: color.inkFaint, fontWeight: 400 }}>vs</span> {labelB}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: tint,
            fontFamily: font.mono,
          }}
        >
          {result ? (r >= 0 ? "+" : "") + r.toFixed(2) : "…"}
        </span>
      </div>
      {/* Diverging bar centered at 0 */}
      <div
        style={{
          position: "relative",
          height: 7,
          background: color.line,
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: `${widthPct / 2}%`,
            background: tint,
            borderRadius: 4,
            transform: r < 0 ? `translateX(-100%)` : "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: -1,
            bottom: -1,
            width: 1,
            background: color.inkFaint,
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span style={{ fontSize: 9, color: color.inkFaint, fontStyle: "italic" }}>
          {pair.hypothesis}
        </span>
        <span style={{ fontSize: 9, color: tint, fontFamily: font.mono, fontWeight: 700 }}>
          {result ? strengthLabel(Math.abs(r)) : ""}
        </span>
      </div>
    </div>
  );
}

// Pairs whose grids are actually loaded (PM2.5 pairs need the ~1 km file).
// Module-level function, not a component-scope const, so the mount-only
// effect below has no missing hook dependency.
function activePairs() {
  return CORRELATION_PAIRS.filter((p) => hasGrid(p.a) && hasGrid(p.b));
}

export function CorrelationPanel() {
  const [results, setResults] = useState({});

  useEffect(() => {
    // Compute lazily off the main thread's critical path — each pair is
    // a few hundred ms at most (measured ~226ms for all 6 combined), but
    // spread across a microtask tick so the UI doesn't freeze on mount.
    const timer = setTimeout(() => {
      const out = {};
      for (const pair of activePairs()) {
        out[`${pair.a}|${pair.b}`] = getCorrelation(pair.a, pair.b, 4);
      }
      setResults(out);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ ...cardBase, marginTop: 12 }}>
      <SectionHeader
        iconName="ruler"
        tint={color.water}
        label="City-wide Correlations"
        caption="Pearson r, sampled across HCMC"
      />
      <div>
        {activePairs().map((pair) => (
          <CorrelationRow
            key={`${pair.a}|${pair.b}`}
            pair={pair}
            result={results[`${pair.a}|${pair.b}`]}
          />
        ))}
      </div>
      <p style={{ fontSize: 9, color: color.inkFaint, marginTop: 10, lineHeight: 1.6 }}>
        <strong>⚠️ Ecological correlation, not individual-level:</strong> these
        r values describe how grid-cell averages relate to each other across
        the whole city — they say nothing about any specific person or
        household, and correlation here does not establish causation (e.g.
        NO2 and built-up surface may both simply track a third factor like
        road density). Treat these as hypothesis-generating, not
        confirmatory. |r|≥0.7 strong · ≥0.4 moderate · ≥0.2 weak ·
        &lt;0.2 negligible (a common but arbitrary convention).
      </p>
    </div>
  );
}
