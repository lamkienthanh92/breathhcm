// Outcome-analysis panel.
//
// 1. The user downloads the Excel template, fills in IDs, Google Maps
//    coordinates and outcome/covariate columns, and describes each column in
//    the "Variables" sheet.
// 2. On upload everything runs automatically: the template is checked, the
//    exposures are measured with the same code as the Measure button
//    (measurePoint), and the Python engine (public/analysis/breath_analysis.py)
//    runs in a Web Worker through Pyodide. No data leave the browser.
// 3. Results are shown here and can be downloaded as Excel, together with a
//    reproducibility package that re-runs with:  python breath_analysis.py payload.json
import { useState, useRef, useMemo } from "react";
import { measurePoint } from "../measure.js";
import { featuresFor, featureMeta } from "./exposureFeatures.js";
import {
  runInWorker, readWorkbookSheets, resultsWorkbook, downloadWorkbook, downloadJSON, downloadText, downloadRKit, htmlReport,
  TEMPLATE_URL, ENGINE_URL,
} from "./analysisClient.js";
import { ChartFrame, ManhattanChart, ForestChart, ContrastChart, DoseChart } from "./charts.jsx";
import { MapsSection } from "./maps.jsx";
import { computeSurface } from "./surface.js";
import { color, font, card } from "../theme.js";

const sleep0 = () => new Promise((r) => setTimeout(r, 0));
const fmt = (v, d = 2) => (v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(d));
const fmtP = (p) => (p == null ? "—" : p < 0.001 ? "<0.001" : Number(p).toFixed(3));

const btn = (bg, fg = "#fff") => ({
  background: bg, color: fg, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: font.body, textDecoration: "none", display: "inline-block",
});
const th = { textAlign: "left", padding: "6px 8px", borderBottom: `2px solid ${color.line}`, fontSize: 11, color: color.inkSoft, whiteSpace: "nowrap" };
const td = { padding: "5px 8px", borderBottom: `1px solid ${color.line}`, fontSize: 12, verticalAlign: "top" };
const sevColor = { warning: color.amber, error: color.brick, info: color.inkSoft };

function Table({ columns, rows, empty = "Nothing to report." }) {
  if (!rows?.length) return <div style={{ fontSize: 12, color: color.inkSoft, padding: "6px 0" }}>{empty}</div>;
  return (
    <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: font.body }}>
        <thead>
          <tr>{columns.map((c) => <th key={c.label} style={th}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={r._highlight ? { background: color.sageMist } : undefined}>
              {columns.map((c) => <td key={c.label} style={{ ...td, ...(c.mono ? { fontFamily: font.mono } : {}) }}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, caption, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: color.forest, fontFamily: font.display }}>{title}</div>
      {caption && <div style={{ fontSize: 11.5, color: color.inkSoft, margin: "2px 0 6px" }}>{caption}</div>}
      {children}
    </div>
  );
}

function Stat({ label, value, tint = color.forest }) {
  return (
    <div style={{ background: color.parchment, borderRadius: 10, padding: "8px 12px", minWidth: 120 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: tint, fontFamily: font.mono }}>{value}</div>
      <div style={{ fontSize: 11, color: color.inkSoft }}>{label}</div>
    </div>
  );
}

export function AnalysisPanel({ ready }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState("idle");
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [result, setResult] = useState(null);
  const [payload, setPayload] = useState(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef(null);
  const busy = ["reading", "parsing", "measuring", "running"].includes(stage);

  const reset = () => {
    setErrors([]);
    setWarnings([]);
    setResult(null);
    setPayload(null);
  };

  const onFile = async (file) => {
    if (!file) return;
    reset();
    setFileName(file.name);
    try {
      setStage("reading");
      setStatus("Reading the workbook…");
      const sheets = readWorkbookSheets(await file.arrayBuffer());

      setStage("parsing");
      const parsed = await runInWorker("parse", sheets, setStatus);
      setWarnings(parsed.warnings || []);
      if (!parsed.ok) {
        setErrors(parsed.errors || ["The template could not be read."]);
        setStage("error");
        return;
      }

      if (parsed.mode === "plan") {
        setStage("running");
        const plan = await runInWorker("run", { sheets, features: [], meta: [] }, setStatus);
        setResult(plan);
        setStage("done");
        setStatus("");
        return;
      }

      setStage("measuring");
      const rp = parsed.settings?.reference_point;
      const ref = rp ? { lat: rp[0], lng: rp[1] } : null;
      const features = [];
      for (let i = 0; i < parsed.rows.length; i++) {
        const r = parsed.rows[i];
        features.push({ id: r.id, ...featuresFor(measurePoint(r.lat, r.lng, r.id), ref) });
        if (i % 10 === 9 || i === parsed.rows.length - 1) {
          setStatus(`Measuring exposures ${i + 1}/${parsed.rows.length}…`);
          await sleep0();
        }
      }
      const pl = { sheets, features, meta: featureMeta(!!ref) };
      setPayload(pl);

      setStage("running");
      const res = await runInWorker("run", pl, setStatus);
      if (!res.ok) {
        setErrors(res.errors || ["The analysis failed."]);
        setWarnings(res.warnings || []);
        setStage("error");
        return;
      }
      setResult(res);
      setStage("done");
      setStatus("");
    } catch (e) {
      setErrors([e.message || String(e)]);
      setStage("error");
    }
  };


  return (
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: color.forest, fontFamily: font.display }}>
            Outcome analysis (exposome-wide, in your browser)
          </div>
          <div style={{ fontSize: 12, color: color.inkSoft }}>
            Download the template, fill in coordinates and outcomes, upload — the app measures every exposure and runs the full analysis.
          </div>
        </div>
        <span style={{ fontSize: 18, color: color.inkSoft }}>{open ? "▾" : "▸"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <a href={TEMPLATE_URL} download style={btn(color.forestSoft)}>⬇ Download template</a>
            <button style={btn(ready && !busy ? color.water : color.inkFaint)} disabled={!ready || busy} onClick={() => fileRef.current?.click()}>
              ⬆ Upload filled template
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
              onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            {fileName && <span style={{ fontSize: 12, color: color.inkSoft }}>{fileName}</span>}
          </div>
          <div style={{ fontSize: 11, color: color.inkSoft, marginTop: 6 }}>
            Your file is analysed inside this browser tab; nothing is sent to a server. The first run downloads the Python engine (~30 MB) once.
            Tip: upload the template with the Variables, Exposures and Settings sheets filled but no data rows to obtain an
            analysis-plan fingerprint you can register before collecting outcomes.
            {!ready && " Waiting for the environmental grids to load…"}
          </div>

          {busy && (
            <div style={{ marginTop: 12, fontSize: 13, color: color.water, fontFamily: font.mono }}>⏳ {status}</div>
          )}

          {errors.length > 0 && (
            <div style={{ marginTop: 12, background: color.brickMist, borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontWeight: 700, color: color.brick, fontSize: 13 }}>Please fix the template and upload again</div>
              <ul style={{ margin: "6px 0 0 18px", fontSize: 12 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div style={{ marginTop: 10, background: color.amberMist, borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
              {warnings.map((w, i) => (
                <div key={i}><b>{w.issue}</b> ({w.n}): {(w.detail || []).slice(0, 8).join("; ")}{(w.detail || []).length > 8 ? " …" : ""}</div>
              ))}
            </div>
          )}

          {result && result.mode === "plan" && <PlanView plan={result} />}
          {result && result.mode !== "plan" && <ResultsView result={result} payload={payload} computeSurface={computeSurface} />}
        </div>
      )}
    </div>
  );
}

export function PlanView({ plan }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ background: color.waterMist, borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
        <b>Analysis plan only (no data rows).</b> Plan fingerprint: <span style={{ fontFamily: font.mono }}>{plan.plan_fingerprint}</span>.
        Register this plan before uploading outcome data; the same plan with data gives the same fingerprint.
      </div>
      <textarea readOnly value={plan.plan_text} style={{ width: "100%", minHeight: 170, marginTop: 8, fontSize: 12, fontFamily: font.mono, padding: 8, borderRadius: 8, border: `1px solid ${color.line}` }} />
      <button style={{ ...btn(color.forest), marginTop: 6 }} onClick={() => downloadText(plan.plan_text, `BREATH_analysis_plan_${plan.plan_fingerprint}.txt`)}>
        ⬇ Analysis plan (.txt)
      </button>
    </div>
  );
}

export function ResultsView({ result, payload, computeSurface = null, initialSurface = null }) {
  const [outcome, setOutcome] = useState("all");
  const box = useRef(null);
  const verdictOf = useMemo(
    () => Object.fromEntries((result?.robustness || []).map((r) => [`${r.outcome}|${r.exposure}`, r.verdict])),
    [result]
  );
  const outcomes = useMemo(() => [...new Set((result?.ewas || []).map((e) => e.outcome))], [result]);
  const ewasRows = useMemo(() => {
    if (!result) return [];
    const fdr = result.summary.fdr_level;
    return result.ewas
      .filter((e) => outcome === "all" || e.outcome === outcome)
      .sort((a, b) => a.p - b.p)
      .map((e) => ({ ...e, _highlight: e.q_within != null && e.q_within < fdr }));
  }, [result, outcome]);

  const s = result.summary;
  const fl = s.flow || {};
  const chartOutcome = outcome === "all" ? outcomes[0] : outcome;
  const chartRows = (result.ewas || []).filter((e) => e.outcome === chartOutcome);
  const chartUnit = chartRows[0]?.unit || "";
  const chartNull = chartUnit.startsWith("odds") || chartUnit.startsWith("rate") ? 1 : 0;
  const contrastRows = (result.screening || []).filter((e) => e.status === "tested" || e.status === "anchor");
  const report = () => {
    const charts = [...(box.current?.querySelectorAll("[data-chart]") || [])].map((el) => ({
      title: el.getAttribute("data-title") || "", svg: el.querySelector("svg")?.outerHTML || "",
    }));
    downloadText(htmlReport(result, charts), "BREATH_analysis_report.html", "text/html");
  };
  return (
    <div ref={box}>
      <div style={{ marginTop: 14, background: color.sageMist, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: color.ink }}>
        {s.headline}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <Stat label="participants" value={s.n_participants} />
        <Stat label="exposures tested" value={s.n_exposures_tested} />
        <Stat label="tests" value={s.n_tests} />
        <Stat label={`p < 0.05 (≈${fmt(s.expected_by_chance, 1)} by chance)`} value={s.n_nominal} tint={color.clay} />
        <Stat label={`FDR q < ${s.fdr_level}`} value={s.n_fdr_within} tint={color.water} />
        <Stat label="robust to every check" value={s.n_robust} tint={color.forestSoft} />
        <Stat label="data-quality warnings" value={s.n_qc_warnings} tint={s.n_qc_warnings ? color.amber : color.forest} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button style={btn(color.forest)} onClick={() => downloadWorkbook(resultsWorkbook(result), "BREATH_analysis_results.xlsx")}>
          ⬇ Results (Excel)
        </button>
        <button style={btn(color.paper, color.forest)} onClick={() => downloadJSON(payload, "BREATH_reproducibility_payload.json")}>
          ⬇ Reproducibility package (JSON)
        </button>
        <button style={btn(color.paper, color.forest)} onClick={report}>⬇ Report (HTML)</button>
        <button style={btn(color.paper, color.forest)} onClick={() => downloadRKit(result)}>⬇ R re-analysis kit</button>
        <a href={ENGINE_URL} download style={btn(color.paper, color.forest)}>⬇ Python engine</a>
      </div>
      <div style={{ fontSize: 12, color: color.inkSoft, marginTop: 8 }}>
        Participants: {fl.rows_in_sheet ?? "—"} rows → {fl.skipped_invalid ?? 0} skipped (invalid ID/coordinates) → {fl.n_excluded ?? 0} excluded
        by you{(fl.excluded || []).length ? ` (${fl.excluded.slice(0, 6).map((e) => `${e.id}: ${e.reason}`).join("; ")}${fl.excluded.length > 6 ? " …" : ""})` : ""} → <b>{fl.analysed ?? s.n_participants} analysed</b>.
      </div>

      <Section title="1. Data quality" caption="Checked before any analysis. Warnings do not stop the run; review them before interpreting results.">
        <Table rows={result.qc} columns={[
          { label: "Severity", render: (q) => <span style={{ color: sevColor[q.severity], fontWeight: 700 }}>{q.severity}</span> },
          { label: "Variable", render: (q) => q.variable },
          { label: "Issue", render: (q) => q.issue },
          { label: "IDs", render: (q) => (q.ids || []).join(", ") + (q.n > (q.ids || []).length && q.ids?.length ? " …" : "") },
          { label: "What to do", render: (q) => q.suggestion },
        ]} />
      </Section>

      <Section title="2. Exposure screening and contrast" caption="Exposures with almost no variation across residences can only detect implausibly large effects.">
        <Table rows={result.screening} columns={[
          { label: "Exposure", render: (e) => e.label },
          { label: "Domain", render: (e) => e.domain },
          { label: "Status", render: (e) => e.status },
          { label: "Distinct", mono: true, render: (e) => e.n_distinct },
          { label: "CV %", mono: true, render: (e) => fmt(e.cv_pct, 1) },
          { label: "Moran's I", mono: true, render: (e) => fmt(e.morans_i, 2) },
          { label: "Note", render: (e) => <span style={{ color: e.warning ? color.amber : color.inkSoft }}>{e.reason || e.warning || ""}</span> },
        ]} />
      </Section>

      <Section title="Figures" caption="Choose an outcome in section 3 to update the association figures. Each figure downloads as SVG and is embedded in the HTML report.">
        {chartRows.length > 0 && (
          <>
            <ChartFrame title={`Exposome-wide associations: ${chartOutcome}`} fileName={`manhattan_${chartOutcome}.svg`}
              caption="Filled points p < 0.05; dashed lines p = 0.05 and the FDR threshold (if reached); ★ pre-specified.">
              <ManhattanChart rows={chartRows} fdrLevel={s.fdr_level} />
            </ChartFrame>
            <ChartFrame title={`Estimates with 95% CI: ${chartOutcome}`} fileName={`forest_${chartOutcome}.svg`}>
              <ForestChart rows={chartRows} nullValue={chartNull} unit={chartUnit} />
            </ChartFrame>
          </>
        )}
        <ChartFrame title="Within-sample exposure contrast" fileName="exposure_contrast.svg">
          <ContrastChart rows={contrastRows} />
        </ChartFrame>
        {(result.dose_response || []).length > 0 && (
          <ChartFrame title="Dose–response of the strongest nominal associations (restricted cubic splines)" fileName="dose_response.svg">
            <svg width={310 * Math.min(3, result.dose_response.length)} height={215 * Math.ceil(result.dose_response.length / 3)}>
              {result.dose_response.map((d, i) => (
                <g key={i} transform={`translate(${310 * (i % 3)}, ${215 * Math.floor(i / 3)})`}>
                  <DoseChart item={d} />
                </g>
              ))}
            </svg>
          </ChartFrame>
        )}
      </Section>

      {result.maps && (
        <Section title="Maps" caption="Drawn from the app's ward boundaries and exposure measurements; downloadable as SVG and included in the HTML report.">
          <MapsSection result={result} computeSurface={computeSurface} initialSurface={initialSurface} />
        </Section>
      )}

      <Section title="3. Exposome-wide associations" caption="One model per exposure and outcome, per 1-SD exposure. Shaded rows pass the FDR threshold within their outcome.">
        <div style={{ marginBottom: 6 }}>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} style={{ fontSize: 12, padding: 4 }}>
            <option value="all">All outcomes</option>
            {outcomes.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <Table rows={ewasRows} columns={[
          { label: "Outcome", render: (e) => e.outcome },
          { label: "Exposure", render: (e) => (e.prespecified ? "★ " : "") + e.label },
          { label: "Estimate (95% CI)", mono: true, render: (e) => `${fmt(e.estimate)} (${fmt(e.lo)} to ${fmt(e.hi)})` },
          { label: "Scale", render: (e) => e.unit },
          { label: "p", mono: true, render: (e) => fmtP(e.p) },
          { label: "q", mono: true, render: (e) => fmt(e.q_within, 3) },
          { label: "Detectable", mono: true, render: (e) => fmt(e.mde) },
          { label: "Robustness", render: (e) => verdictOf[`${e.outcome}|${e.exposure}`] || (e.p < 0.05 ? "not checked" : "") },
        ]} />
        <div style={{ fontSize: 11, color: color.inkSoft, marginTop: 4 }}>
          ★ pre-specified in the Variables sheet. "Detectable" = smallest effect detectable with 80% power on the same scale.
        </div>
      </Section>

      <Section title="4. Robustness of nominal associations" caption="Spatial trend surface, area-clustered errors, removal of anchors, exclusion of flagged records and leave-one-out.">
        {(result.robustness || []).length === 0 && <div style={{ fontSize: 12, color: color.inkSoft }}>No association had p &lt; 0.05.</div>}
        {(result.robustness || []).map((r, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>
              {r.outcome} ~ {r.label}:{" "}
              <span style={{ color: r.verdict.startsWith("robust") ? color.forestSoft : color.brick }}>{r.verdict}</span>
            </div>
            <Table rows={r.checks} columns={[
              { label: "Check", render: (c) => c.check },
              { label: "Estimate (95% CI)", mono: true, render: (c) => `${fmt(c.estimate)} (${fmt(c.lo)} to ${fmt(c.hi)})` },
              { label: "p", mono: true, render: (c) => fmtP(c.p) },
              { label: "n", mono: true, render: (c) => c.n },
            ]} />
          </div>
        ))}
      </Section>

      {(result.anchor_dependent || []).length > 0 && (
        <Section title="5. Associations that depend on the anchor exposure" caption="Significant only when the anchor (e.g. road proximity) is ignored — they probably reflect the anchor.">
          <Table rows={result.anchor_dependent} columns={[
            { label: "Outcome", render: (a) => a.outcome },
            { label: "Exposure", render: (a) => a.label },
            { label: "Without anchor", mono: true, render: (a) => `${fmt(a.estimate_without_anchor)} (p ${fmtP(a.p_without_anchor)})` },
            { label: "With anchor", mono: true, render: (a) => `${fmt(a.estimate_with_anchor)} (p ${fmtP(a.p_with_anchor)})` },
          ]} />
        </Section>
      )}

      <Section title="6. Domains, profiles and stability selection">
        <Table rows={(result.domains || []).filter((d) => d.p < 0.1)} empty="No domain reached p < 0.10." columns={[
          { label: "Outcome", render: (d) => d.outcome },
          { label: "Domain", render: (d) => d.domain },
          { label: "Exposures", mono: true, render: (d) => d.n_exposures },
          { label: "p", mono: true, render: (d) => fmtP(d.p) },
          { label: "q", mono: true, render: (d) => fmt(d.q, 3) },
        ]} />
        {result.profiles && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: color.inkSoft }}>
              {result.profiles.n_profiles} exposure profiles explain {fmt(result.profiles.variance_explained_pct, 1)}% of exposure variance.
            </div>
            <Table rows={(result.profiles.associations || []).filter((a) => a.p < 0.1)} empty="No profile reached p < 0.10." columns={[
              { label: "Outcome", render: (a) => a.outcome },
              { label: "Profile", render: (a) => a.profile },
              { label: "Estimate (95% CI)", mono: true, render: (a) => `${fmt(a.estimate)} (${fmt(a.lo)} to ${fmt(a.hi)})` },
              { label: "p", mono: true, render: (a) => fmtP(a.p) },
              { label: "q", mono: true, render: (a) => fmt(a.q, 3) },
            ]} />
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <Table rows={(result.stability || []).filter((x) => x.stable)} empty="No exposure was selected in ≥ 60% of bootstrap resamples." columns={[
            { label: "Outcome", render: (x) => x.outcome },
            { label: "Stably selected exposure", render: (x) => x.label },
            { label: "Selection", mono: true, render: (x) => `${fmt(100 * x.selection_freq, 0)}%` },
            { label: "Direction", render: (x) => x.direction },
          ]} />
        </div>
      </Section>

      <Section title="7. Methods text" caption="Paste into your manuscript and edit; keep the plan fingerprint to document the analysis plan.">
        <textarea readOnly value={result.methods_text} style={{ width: "100%", minHeight: 150, fontSize: 12, fontFamily: font.body, padding: 8, borderRadius: 8, border: `1px solid ${color.line}` }} />
      </Section>
    </div>
  );
}
