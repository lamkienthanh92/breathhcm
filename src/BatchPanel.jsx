// Batch measurement: paste or upload a list of coordinates, measure them all
// with exactly the same code as the Measure button (measure.js), and add them
// to the session so the normal "Export Excel" button exports every case.
//
// Accepted input
//   • Pasted text: one case per line — "ID, lat, lng" or "lat, lng"
//     (comma, semicolon, tab or space separated; a header line is skipped).
//   • A .csv / .txt / .xlsx / .xls file: the first sheet is read; columns are
//     found by header name (ID/STT/Mã…, Lat/Latitude/Vĩ độ, Lng/Lon/
//     Longitude/Kinh độ). Without recognisable headers the first three
//     columns are taken as ID, lat, lng (or the first two as lat, lng).
// Rows outside the app's coordinate range are listed and skipped.

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { measurePoint } from "./measure.js";
import { rowsToCases, textToRows } from "./batchParse.js";
import { fetchClimate } from "./climate.js";
import { color, font, card, inp } from "./theme.js";

const sleep0 = () => new Promise((r) => setTimeout(r, 0));

export function BatchPanel({ ready, onAdd }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [withClimate, setWithClimate] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState("");
  const fileRef = useRef(null);

  const parseText = (t) => {
    setText(t);
    setFileName("");
    setDone("");
    setParsed(t.trim() ? rowsToCases(textToRows(t)) : null);
  };

  const onFile = async (f) => {
    if (!f) return;
    setDone("");
    setFileName(f.name);
    const buf = await f.arrayBuffer();
    let rows;
    if (/\.(xlsx|xls)$/i.test(f.name)) {
      const wb = XLSX.read(buf, { type: "array" });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
    } else {
      rows = textToRows(new TextDecoder("utf-8").decode(buf).replace(/^﻿/, ""));
    }
    setText("");
    setParsed(rowsToCases(rows));
  };

  const run = async () => {
    if (!parsed?.cases.length) return;
    setRunning(true);
    setDone("");
    const out = [];
    const n = parsed.cases.length;
    for (let i = 0; i < n; i++) {
      const c = parsed.cases[i];
      out.push(measurePoint(c.lat, c.lng, c.id));
      if (i % 5 === 4 || i === n - 1) {
        setProgress(`Measuring ${i + 1}/${n}…`);
        await sleep0(); // keep the page responsive
      }
    }
    if (withClimate) {
      let next = 0;
      let finished = 0;
      const worker = async () => {
        while (next < out.length) {
          const k = next++;
          out[k] = { ...out[k], climate: await fetchClimate(out[k].geo.lat, out[k].geo.lng) };
          finished++;
          setProgress(`Climate ${finished}/${n}…`);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    }
    onAdd(out);
    const noClimate = withClimate ? out.filter((s) => !s.climate).length : null;
    setDone(
      `Added ${n} case${n !== 1 ? "s" : ""} to the session` +
        (noClimate ? ` (${noClimate} without climate data — network/API limit)` : "") +
        ". Use “Export Excel” to download."
    );
    setProgress("");
    setRunning(false);
  };

  const btn = (enabled) => ({
    padding: "7px 16px",
    fontSize: 12,
    fontWeight: 700,
    border: "none",
    borderRadius: 7,
    background: enabled ? color.forest : "#D1D5DB",
    color: "#fff",
    cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: font.body,
  });

  return (
    <div style={{ ...card, marginBottom: 10, padding: "10px 14px" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: color.ink }}>
          📋 Batch measurement · Nhập hàng loạt tọa độ
        </span>
        <span style={{ fontSize: 11, color: color.inkSoft }}>{open ? "▲ hide" : "▼ open"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: color.inkSoft, lineHeight: 1.55, marginBottom: 8 }}>
            Paste one case per line as <code>ID, lat, lng</code> (or <code>lat, lng</code>), or load a
            CSV/Excel file with columns such as <code>STT</code>, <code>Vĩ độ</code>, <code>Kinh độ</code>.
            Every case is measured with the same code as the Measure button and added to the session; then
            export as usual. Climate needs internet and is slower (Open-Meteo rate limits apply).
          </div>
          <textarea
            value={text}
            onChange={(e) => parseText(e.target.value)}
            placeholder={"STT, lat, lng\n1, 10.7761, 106.6346\n2, 10.7634, 106.6512"}
            rows={6}
            disabled={running}
            style={{ ...inp, width: "100%", boxSizing: "border-box", fontFamily: "monospace", fontSize: 12 }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              style={{ display: "none" }}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <button style={btn(!running)} disabled={running} onClick={() => fileRef.current?.click()}>
              📂 Load CSV / Excel
            </button>
            <label style={{ fontSize: 12, color: color.ink }}>
              <input
                type="checkbox"
                checked={withClimate}
                disabled={running}
                onChange={(e) => setWithClimate(e.target.checked)}
              />{" "}
              Include climate (internet)
            </label>
            <button
              style={btn(ready && !running && !!parsed?.cases.length)}
              disabled={!ready || running || !parsed?.cases.length}
              onClick={run}
            >
              {running ? progress || "Running…" : `▶ Measure ${parsed?.cases.length || 0} case${parsed?.cases.length === 1 ? "" : "s"}`}
            </button>
            {!ready && <span style={{ fontSize: 11, color: color.inkSoft }}>Waiting for data to load…</span>}
          </div>
          {parsed && (
            <div style={{ marginTop: 8, fontSize: 11, color: color.inkSoft }}>
              {fileName && <span>File: {fileName} · </span>}
              <strong style={{ color: color.ink }}>{parsed.cases.length}</strong> valid coordinate
              {parsed.cases.length !== 1 ? "s" : ""}
              {parsed.rejected.length > 0 && (
                <span style={{ color: color.brick }}>
                  {" "}· {parsed.rejected.length} skipped (outside 10–11°N, 106–107°E or not a number):{" "}
                  {parsed.rejected
                    .slice(0, 6)
                    .map((r) => `${r.id} [${r.raw}]`)
                    .join("; ")}
                  {parsed.rejected.length > 6 ? "…" : ""}
                </span>
              )}
            </div>
          )}
          {done && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: color.ink,
                background: color.sageMist,
                borderRadius: 7,
                padding: "7px 12px",
              }}
            >
              ✓ {done}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
