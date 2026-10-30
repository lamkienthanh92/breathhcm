#!/usr/bin/env node
// Command-line batch exporter for BREATH-HCMC.
//
// Measures every coordinate in a CSV/Excel list with the app's own code
// (src/measure.js) and writes the same Excel workbook as the app's
// "Export Excel" button (src/excelExport.js → buildWorkbook).
//
// Usage (from the project folder, after `npm install`):
//   node scripts/batch_export.mjs <input.csv|xlsx> <output.xlsx> [--climate]
//
// Input: same formats as the in-app batch panel — columns ID/STT, lat/Vĩ độ,
// lng/Kinh độ (header optional). --climate also queries Open-Meteo (needs
// internet; slow). PM2.5 must come from public/data/pm25.json: the script
// stops with an error rather than fall back to the legacy 5.5 km grid.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";
import { setGrids } from "../src/gridLoader.js";
import { setPM25FromData, getPM25Meta } from "../src/pm25.js";
import { measurePoint } from "../src/measure.js";
import { rowsToCases, textToRows } from "../src/batchParse.js";
import { buildWorkbook } from "../src/excelExport.js";
import { fetchClimate } from "../src/climate.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const withClimate = args.includes("--climate");
const [input, output] = args.filter((a) => !a.startsWith("--"));
if (!input || !output) {
  console.error("Usage: node scripts/batch_export.mjs <input.csv|xlsx> <output.xlsx> [--climate]");
  process.exit(1);
}

setGrids(JSON.parse(fs.readFileSync(path.join(root, "public/data/grids.json"), "utf8")));
setPM25FromData(JSON.parse(fs.readFileSync(path.join(root, "public/data/pm25.json"), "utf8")));

let rows;
if (/\.(xlsx|xls)$/i.test(input)) {
  const wb = XLSX.read(fs.readFileSync(input), { type: "buffer" });
  rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
} else {
  rows = textToRows(fs.readFileSync(input, "utf8").replace(/^﻿/, ""));
}
const { cases, rejected } = rowsToCases(rows);
if (rejected.length)
  console.warn(`Skipped ${rejected.length} row(s) outside 10–11°N / 106–107°E or not numeric:`,
    rejected.map((r) => `${r.id} [${r.raw}]`).join("; "));
if (!cases.length) {
  console.error("No valid coordinates found.");
  process.exit(1);
}

const sessions = cases.map((c) => measurePoint(c.lat, c.lng, c.id));
if (withClimate) {
  for (let i = 0; i < sessions.length; i++) {
    sessions[i] = { ...sessions[i], climate: await fetchClimate(sessions[i].geo.lat, sessions[i].geo.lng) };
    process.stdout.write(`\rClimate ${i + 1}/${sessions.length}`);
  }
  process.stdout.write("\n");
}
XLSX.writeFile(buildWorkbook(sessions), output);
console.log(`Wrote ${output}: ${sessions.length} case(s) · PM2.5: ${getPM25Meta().shortLabel}`);
