import fs from "fs";
process.env.PUBLIC_URL = "";
const root = "/tmp/rt";
const React = (await import("react")).default;
const { renderToString } = await import("react-dom/server");
const { WardChoropleth, SurfaceMap } = await import(root + "/src/analysis/maps.mjs");
const surface = JSON.parse(fs.readFileSync("/home/claude/toolpaper/surface.json", "utf8"));
const result = JSON.parse(fs.readFileSync("/home/claude/toolpaper/results_worked.json", "utf8"));
const h = React.createElement;
const W = 330;
const panels = [
  ["A", h(WardChoropleth, { bbox: surface.bbox, values: result.maps.participants, title: "Participants per ward (n = 155)", unit: "participants", width: W, idp: "a" })],
  ["B", h(SurfaceMap, { surface, featureKey: "pm25", label: "PM2.5, satellite (µg/m³)", width: W })],
  ["C", h(SurfaceMap, { surface, featureKey: "ndvi", label: "NDVI", width: W })],
  ["D", h(SurfaceMap, { surface, featureKey: "builtup", label: "Built-up surface (%)", width: W })],
  ["E", h(SurfaceMap, { surface, featureKey: "road_kernel", label: "Road kernel index", width: W })],
  ["F", h(SurfaceMap, { surface, featureKey: "butcher_dist", label: "Distance to butcher/meat processing (m)", transform: "log10", width: W })],
];
const cells = panels.map(([l, p]) => `<div class="p"><div class="l">${l}</div>${renderToString(p)}</div>`).join("");
fs.writeFileSync("/tmp/figS1.html", `<html><head><meta charset="utf-8"><style>
@page { size: 1100px 1010px; margin: 0 } body{margin:8px;width:1090px;font-family:Arial} .p{display:inline-block;position:relative;margin:4px 2px;padding-left:20px;vertical-align:top}
.l{position:absolute;left:0;top:-3px;font-weight:bold;font-size:17px}
</style></head><body>${cells}</body></html>`);
console.log("ok");
