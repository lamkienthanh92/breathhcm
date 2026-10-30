// Exports the app's point-of-interest, road and vegetation data to JSON for the independent implementation.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const { SOURCES } = await import(path.join(root, "src/sourceUtils.js"));
const { ROADS } = await import(path.join(root, "src/roads.js"));
const { NDVI_GRID, EVI_GRID } = await import(path.join(root, "src/ndvi.js"));
fs.writeFileSync(path.join(here, "sources.json"), JSON.stringify(SOURCES.map((s) => ({ lat: s.lat, lng: s.lng, cat: s.cat }))));
fs.writeFileSync(path.join(here, "roads.json"), JSON.stringify(Object.fromEntries(Object.entries(ROADS).map(([n, r]) => [n, { segs: r.segs, halfWidth: r.halfWidth }]))));
fs.writeFileSync(path.join(here, "ndvi.json"), JSON.stringify(NDVI_GRID));
fs.writeFileSync(path.join(here, "evi.json"), JSON.stringify(EVI_GRID));
console.log("exported", SOURCES.length, "points of interest and", Object.keys(ROADS).length, "roads");
