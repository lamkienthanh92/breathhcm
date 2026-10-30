// Parsing of coordinate lists for batch measurement. Plain JS (no JSX) so
// that both the browser batch panel and scripts/batch_export.mjs use it.
import { coordInRange } from "./measure.js";

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
const LAT_KEYS = ["lat", "latitude", "vi do", "vido", "y"];
const LNG_KEYS = ["lng", "lon", "long", "longitude", "kinh do", "kinhdo", "x"];
const ID_KEYS = ["id", "stt", "ma", "ma so", "ma so bn", "ma bn", "patient", "patient id", "sample id", "name", "ten", "ho ten"];
const num = (v) => (typeof v === "number" ? v : parseFloat(String(v ?? "").trim().replace(",", ".")));

function findCol(header, keys) {
  const h = header.map(norm);
  for (const k of keys) {
    const i = h.indexOf(k);
    if (i >= 0) return i;
  }
  for (const k of keys) {
    const i = h.findIndex((x) => x.startsWith(k + " ") || x.startsWith(k + "("));
    if (i >= 0) return i;
  }
  return -1;
}

// rows: array of arrays (strings or numbers) → { cases, rejected }
export function rowsToCases(rows) {
  const clean = rows.filter((r) => r && r.some((c) => String(c ?? "").trim() !== ""));
  if (!clean.length) return { cases: [], rejected: [] };
  let start = 0;
  let iId = -1,
    iLat = -1,
    iLng = -1;
  const head = clean[0].map((c) => String(c ?? ""));
  const looksHeader = head.some((c) => c.trim() !== "" && Number.isNaN(num(c)));
  if (looksHeader) {
    iLat = findCol(head, LAT_KEYS);
    iLng = findCol(head, LNG_KEYS);
    iId = findCol(head, ID_KEYS);
    start = 1;
  }
  if (iLat < 0 || iLng < 0) {
    const width = Math.max(...clean.slice(start).map((r) => r.length));
    if (width >= 3) [iId, iLat, iLng] = [0, 1, 2];
    else [iId, iLat, iLng] = [-1, 0, 1];
  }
  const cases = [];
  const rejected = [];
  clean.slice(start).forEach((r, k) => {
    const line = start + k + 1;
    const lat = num(r[iLat]);
    const lng = num(r[iLng]);
    const id = iId >= 0 && r[iId] != null && String(r[iId]).trim() !== "" ? String(r[iId]).trim() : `Row ${line}`;
    if (coordInRange(lat, lng)) cases.push({ id, lat, lng });
    else rejected.push({ line, id, raw: [r[iLat], r[iLng]].join(", ") });
  });
  return { cases, rejected };
}

export function textToRows(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/[;\t]/.test(l) ? l.split(/[;\t]/) : l.includes(",") ? l.split(",") : l.split(/\s+/)));
}

