// Browser side of the analysis module: talks to public/analysis/worker.js
// (Pyodide) and turns the engine's JSON results into an Excel workbook.
import * as XLSX from "xlsx";

const BASE = `${process.env.PUBLIC_URL || ""}/analysis`;
let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(`${BASE}/worker.js`);
  worker.onmessage = (e) => {
    const { id, type, message, result, error } = e.data || {};
    const p = pending.get(id);
    if (!p) return;
    if (type === "status") p.onStatus?.(message);
    else if (type === "result") {
      pending.delete(id);
      p.resolve(result);
    } else if (type === "error") {
      pending.delete(id);
      p.reject(new Error(error));
    }
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || "Analysis worker failed"));
    pending.clear();
    worker.terminate();
    worker = null;
  };
  return worker;
}

export function runInWorker(action, payload, onStatus) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, onStatus });
    getWorker().postMessage({ id, action, payload });
  });
}

export function readWorkbookSheets(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  return Object.fromEntries(
    wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" })])
  );
}

const r3 = (v) => (v == null || Number.isNaN(v) ? "" : Math.round(v * 1000) / 1000);

function sheet(rows) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "Nothing to report" }]);
  const keys = Object.keys(rows[0] || { Note: "" });
  ws["!cols"] = keys.map((k) => ({ wch: Math.min(60, Math.max(10, k.length + 2)) }));
  return ws;
}

export function resultsWorkbook(res) {
  const wb = XLSX.utils.book_new();
  const s = res.summary;
  const verdictOf = Object.fromEntries((res.robustness || []).map((r) => [`${r.outcome}|${r.exposure}`, r.verdict]));
  XLSX.utils.book_append_sheet(wb, sheet([
    { Item: "Headline", Value: s.headline },
    { Item: "Participants analysed", Value: s.n_participants },
    { Item: "Outcomes", Value: s.n_outcomes },
    { Item: "Exposures tested", Value: s.n_exposures_tested },
    { Item: "Anchor exposures (adjusted, not tested)", Value: (s.anchors || []).join("; ") || "none" },
    { Item: "Exposure–outcome tests", Value: s.n_tests },
    { Item: "Nominal p < 0.05", Value: s.n_nominal },
    { Item: "Expected by chance", Value: r3(s.expected_by_chance) },
    { Item: `FDR q < ${s.fdr_level} (within outcome)`, Value: s.n_fdr_within },
    { Item: "Robust to every check", Value: s.n_robust },
    { Item: "Analysis plan fingerprint", Value: s.plan_fingerprint },
    { Item: "Engine version", Value: res.version },
    { Item: "Methods text", Value: res.methods_text },
  ]), "Summary");
  XLSX.utils.book_append_sheet(wb, sheet((res.qc || []).map((q) => ({
    Severity: q.severity, Variable: q.variable, Issue: q.issue, N: q.n, IDs: (q.ids || []).join(", "), Suggestion: q.suggestion,
  }))), "Data quality");
  XLSX.utils.book_append_sheet(wb, sheet((res.screening || []).map((e) => ({
    Key: e.key, Exposure: e.label, Domain: e.domain, Source: e.source, Status: e.status, Reason: e.reason || e.warning || "",
    "Distinct values": e.n_distinct, "CV (%)": r3(e.cv_pct), Median: r3(e.median), P25: r3(e.p25), P75: r3(e.p75),
    "Moran's I": r3(e.morans_i),
  }))), "Exposures");
  XLSX.utils.book_append_sheet(wb, sheet([...(res.ewas || [])].sort((a, b) => a.p - b.p).map((e) => ({
    Outcome: e.outcome, Exposure: e.label, Domain: e.domain, Estimate: r3(e.estimate), "95% CI low": r3(e.lo),
    "95% CI high": r3(e.hi), Scale: e.unit, p: e.p, "q (within outcome)": r3(e.q_within), "q (all tests)": r3(e.q_all),
    "Minimal detectable effect": r3(e.mde), N: e.n, "Pre-specified": e.prespecified ? "yes" : "",
    "Holm p (pre-specified)": r3(e.p_holm_prespecified), Robustness: verdictOf[`${e.outcome}|${e.exposure}`] || "",
  }))), "Associations");
  XLSX.utils.book_append_sheet(wb, sheet((res.robustness || []).flatMap((r) => r.checks.map((c) => ({
    Outcome: r.outcome, Exposure: r.label, Check: c.check, Estimate: r3(c.estimate), "95% CI low": r3(c.lo),
    "95% CI high": r3(c.hi), p: c.p, N: c.n, "CI excludes null": c.excludes_null ? "yes" : "no", Verdict: r.verdict,
  })))), "Robustness");
  XLSX.utils.book_append_sheet(wb, sheet((res.anchor_dependent || []).map((a) => ({
    Outcome: a.outcome, Exposure: a.label, "Estimate without anchor": r3(a.estimate_without_anchor),
    "p without anchor": a.p_without_anchor, "Estimate with anchor": r3(a.estimate_with_anchor), "p with anchor": a.p_with_anchor,
  }))), "Anchor-dependent");
  XLSX.utils.book_append_sheet(wb, sheet((res.domains || []).map((d) => ({
    Outcome: d.outcome, Domain: d.domain, Exposures: d.n_exposures, "Wald chi2": r3(d.wald_chi2), p: d.p, q: r3(d.q),
  }))), "Domains");
  if (res.profiles) {
    XLSX.utils.book_append_sheet(wb, sheet(res.profiles.associations.map((a) => ({
      Outcome: a.outcome, Profile: a.profile, Estimate: r3(a.estimate), "95% CI low": r3(a.lo), "95% CI high": r3(a.hi),
      Scale: a.unit, p: a.p, q: r3(a.q),
    }))), "Profiles");
    XLSX.utils.book_append_sheet(wb, sheet(Object.entries(res.profiles.loadings).map(([exp, l]) => ({
      Exposure: exp, ...Object.fromEntries(Object.entries(l).map(([k, v]) => [k.split(":")[0], r3(v)])),
    }))), "Profile loadings");
  }
  XLSX.utils.book_append_sheet(wb, sheet((res.stability || []).map((s2) => ({
    Outcome: s2.outcome, Exposure: s2.label, "Selection frequency": r3(s2.selection_freq), Direction: s2.direction,
    "Stable (>= 60%)": s2.stable ? "yes" : "",
  }))), "Stability selection");
  XLSX.utils.book_append_sheet(wb, sheet((res.moran_residuals || []).map((m) => ({
    Outcome: m.outcome, "Moran's I of residuals": r3(m.morans_i), p: m.p, N: m.n,
  }))), "Spatial residuals");
  XLSX.utils.book_append_sheet(wb, sheet((res.dose_response || []).flatMap((d) => d.curve.map((c) => ({
    Outcome: d.outcome, Exposure: d.label, Exposure_value: r3(c.x), Estimate: r3(c.estimate), "95% CI low": r3(c.lo),
    "95% CI high": r3(c.hi), Scale: d.unit, "p non-linearity": r3(d.p_nonlinear), "p overall": r3(d.p_overall),
  })))), "Dose-response");
  const fl = s.flow || {};
  XLSX.utils.book_append_sheet(wb, sheet([
    { Step: "Rows in sheet 'Data'", N: fl.rows_in_sheet, Detail: "" },
    { Step: "Skipped (missing ID or invalid coordinates)", N: fl.skipped_invalid, Detail: "" },
    { Step: "Excluded by investigators", N: fl.n_excluded, Detail: (fl.excluded || []).map((e) => `${e.id}: ${e.reason}`).join("; ") },
    { Step: "Analysed", N: fl.analysed, Detail: "" },
  ]), "Participant flow");
  if (res.maps) {
    const m = res.maps;
    const rows = Object.entries(m.participants).map(([w, n]) => ({ Ward: w, Participants: n == null ? `<${m.min_cell}` : n }));
    for (const r of m.residuals)
      for (const [w, c] of Object.entries(r.wards))
        rows.push({ Ward: w, Outcome: r.outcome, "Mean residual": c.suppressed ? `suppressed (<${m.min_cell})` : r3(c.mean), Scale: r.unit, N: c.n ?? "" });
    XLSX.utils.book_append_sheet(wb, sheet(rows), "Maps (ward level)");
  }
  if (res.analysis_dataset) {
    const { columns, rows } = res.analysis_dataset;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columns, ...rows]), "Analysis dataset");
  }
  return wb;
}

export function downloadWorkbook(wb, name) {
  XLSX.writeFile(wb, name);
}

export function downloadJSON(obj, name) {
  const blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v) {
  if (v == null) return "";
  const t = String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function toCSV(columns, rows) {
  return [columns, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

export function downloadText(text, name, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Analysis dataset + the app's estimates + an R script that refits every model and reports the differences.
export function downloadRKit(res) {
  const ds = res.analysis_dataset;
  const est = res.app_estimates || [];
  const files = [
    [toCSV(ds.columns, ds.rows), "BREATH_analysis_dataset.csv", "text/csv"],
    [toCSV(["outcome", "exposure", "beta", "se", "p", "n"], est.map((e) => [e.outcome, e.exposure, e.beta, e.se, e.p, e.n])),
      "BREATH_app_estimates.csv", "text/csv"],
    [res.r_script, "BREATH_reanalysis.R", "text/plain"],
  ];
  files.forEach(([t, n, m], i) => setTimeout(() => downloadText(t, n, m), i * 400));
}

const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f2 = (v, d = 2) => (v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(d));
const fp = (p) => (p == null ? "—" : p < 0.001 ? "&lt;0.001" : Number(p).toFixed(3));

function htmlTable(cols, rows) {
  if (!rows.length) return "<p class='muted'>Nothing to report.</p>";
  return `<table><thead><tr>${cols.map((c) => `<th>${esc(c[0])}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${cols.map((c) => `<td>${c[1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

// Self-contained HTML report; `charts` = [{title, svg}] captured from the page so figures match the screen.
export function htmlReport(res, charts = []) {
  const s = res.summary;
  const fl = s.flow || {};
  const verdict = Object.fromEntries((res.robustness || []).map((r) => [`${r.outcome}|${r.exposure}`, r.verdict]));
  const top = [...res.ewas].filter((e) => e.p < 0.05 || e.prespecified).sort((a, b) => a.p - b.p);
  return `<!doctype html><html><head><meta charset="utf-8"><title>BREATH-HCMC analysis report</title>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:1000px;margin:24px auto;color:#222;font-size:13px;line-height:1.45}
h1{font-size:20px}h2{font-size:15px;margin-top:26px;border-bottom:1px solid #ddd;padding-bottom:3px}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border-bottom:1px solid #e5e5e5;padding:4px 6px;text-align:left;vertical-align:top;font-size:12px}
th{background:#f4f4f0}.box{background:#eef3ee;padding:10px 14px;border-radius:8px}.muted{color:#777}.chart{margin:10px 0}</style></head><body>
<h1>BREATH-HCMC exposome-wide analysis report</h1>
<p class="muted">Engine v${esc(res.version)} · plan fingerprint ${esc(s.plan_fingerprint)} · generated ${esc(new Date().toISOString().slice(0, 16).replace("T", " "))}</p>
<div class="box">${esc(s.headline)}</div>
<h2>Participants</h2>
<p>${fl.rows_in_sheet ?? "—"} records → ${fl.skipped_invalid ?? 0} skipped (invalid ID or coordinates) → ${fl.n_excluded ?? 0} excluded by investigators → <b>${fl.analysed ?? s.n_participants} analysed</b>.</p>
${(fl.excluded || []).length ? `<p class="muted">Exclusions: ${esc(fl.excluded.map((e) => `${e.id} (${e.reason})`).join("; "))}</p>` : ""}
<h2>Data quality</h2>
${htmlTable([["Severity", (q) => esc(q.severity)], ["Variable", (q) => esc(q.variable)], ["Issue", (q) => esc(q.issue)], ["IDs", (q) => esc((q.ids || []).join(", "))], ["What to do", (q) => esc(q.suggestion)]], res.qc || [])}
<h2>Exposure screening and contrast</h2>
${htmlTable([["Exposure", (e) => esc(e.label)], ["Domain", (e) => esc(e.domain)], ["Status", (e) => esc(e.status)], ["Distinct", (e) => esc(e.n_distinct)], ["CV %", (e) => f2(e.cv_pct, 1)], ["Note", (e) => esc(e.reason || e.warning || "")]], res.screening || [])}
<h2>Figures</h2>
${charts.map((c) => `<div class="chart"><b>${esc(c.title)}</b><br/>${c.svg}</div>`).join("")}
<h2>Nominal and pre-specified associations</h2>
${htmlTable([["Outcome", (e) => esc(e.outcome)], ["Exposure", (e) => esc((e.prespecified ? "★ " : "") + e.label)], ["Estimate (95% CI)", (e) => `${f2(e.estimate)} (${f2(e.lo)} to ${f2(e.hi)})`], ["Scale", (e) => esc(e.unit)], ["p", (e) => fp(e.p)], ["q", (e) => f2(e.q_within, 3)], ["Robustness", (e) => esc(verdict[`${e.outcome}|${e.exposure}`] || "")]], top)}
<h2>Associations that depend on the anchor exposure</h2>
${htmlTable([["Outcome", (a) => esc(a.outcome)], ["Exposure", (a) => esc(a.label)], ["Without anchor", (a) => `${f2(a.estimate_without_anchor)} (p ${fp(a.p_without_anchor)})`], ["With anchor", (a) => `${f2(a.estimate_with_anchor)} (p ${fp(a.p_with_anchor)})`]], res.anchor_dependent || [])}
<h2>Methods</h2><p>${esc(res.methods_text)}</p>
<p class="muted">All ${res.ewas.length} estimates, robustness checks, domains, profiles and stability selection are in the Excel results file.</p>
</body></html>`;
}

export const TEMPLATE_URL = `${BASE}/BREATH_outcome_template.xlsx`;
export const ENGINE_URL = `${BASE}/breath_analysis.py`;
