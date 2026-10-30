// Runs the app's own measurePoint()/featuresFor() on (1) residences, (2) random points,
// (3) residences displaced by 25/50/100/200 m in random directions (20 replicates each).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { setGrids } = await import(root + "/src/gridLoader.js");
const { setPM25FromData } = await import(root + "/src/pm25.js");
const { measurePoint } = await import(root + "/src/measure.js");
const { featuresFor } = await import(root + "/src/analysis/exposureFeatures.js");
setGrids(JSON.parse(fs.readFileSync(root + "/public/data/grids.json", "utf8")));
setPM25FromData(JSON.parse(fs.readFileSync(root + "/public/data/pm25.json", "utf8")));
const P = JSON.parse(fs.readFileSync(path.join(root, "validation", "points_random.json"), "utf8"));
const feat = (p) => ({ id: p.id, lat: p.lat, lng: p.lng, ...featuresFor(measurePoint(p.lat, p.lng, p.id)) });
let t0 = performance.now();
const residences = P.residences.map(feat);
const tRes = (performance.now() - t0) / P.residences.length;
t0 = performance.now();
const random = P.random.map(feat);
const tRnd = (performance.now() - t0) / P.random.length;
// deterministic: measure residences a second time
const again = P.residences.map(feat);
const identical = JSON.stringify(again) === JSON.stringify(residences);
// displacement
let seed = 20261030;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const R = 6378137, DIST = [25, 50, 100, 200], REPS = 20;
const displaced = [];
for (const d of DIST) for (let r = 0; r < REPS; r++) for (const p of P.residences) {
  const th = 2 * Math.PI * rand();
  const dLat = (d * Math.cos(th)) / R * 180 / Math.PI;
  const dLng = (d * Math.sin(th)) / (R * Math.cos(p.lat * Math.PI / 180)) * 180 / Math.PI;
  const f = featuresFor(measurePoint(p.lat + dLat, p.lng + dLng, p.id));
  displaced.push({ id: p.id, d, rep: r, ...f });
}
fs.writeFileSync(path.join(root, "validation", "app_features.json"), JSON.stringify({ residences, random, displaced, timing_ms_per_point: { residences: tRes, random: tRnd }, deterministic_repeat_identical: identical }));
console.log("ms/point", tRes.toFixed(2), tRnd.toFixed(2), "identical repeat:", identical, "displaced", displaced.length);
