// Exposure surfaces for maps.
//
// Each map cell is measured with exactly the same code as a participant's
// residence (measurePoint + featuresFor), so a surface shows the exposure the
// analysis actually used — including OpenStreetMap distances, counts and the
// road kernel index, which have no ready-made raster.
import { measurePoint } from "../measure.js";
import { WARDS } from "../wards.js";
import { featuresFor } from "./exposureFeatures.js";

// Bounding box [minLng, minLat, maxLng, maxLat] of the named wards, padded by `pad` (fraction of the span).
export function studyExtent(wardNames, pad = 0.06) {
  const names = new Set(wardNames);
  const ws = WARDS.filter((w) => names.has(w.name));
  if (!ws.length) return null;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const w of ws) {
    x0 = Math.min(x0, w.bbox[0]);
    y0 = Math.min(y0, w.bbox[1]);
    x1 = Math.max(x1, w.bbox[2]);
    y1 = Math.max(y1, w.bbox[3]);
  }
  const px = (x1 - x0) * pad;
  const py = (y1 - y0) * pad;
  return [x0 - px, y0 - py, x1 + px, y1 + py];
}

// Measures every exposure at the centre of each cell of a regular grid over `bbox`
// (~4 ms per cell). Cells are not filtered by ward, so slivers between
// simplified ward polygons do not leave holes in the map.
export async function computeSurface(bbox, nCols = 45, onProgress = null) {
  const [x0, y0, x1, y1] = bbox;
  const dLng = (x1 - x0) / nCols;
  const dLat = dLng * Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const nRows = Math.max(1, Math.round((y1 - y0) / dLat));
  const cells = [];
  const total = nRows * nCols;
  let k = 0;
  for (let i = 0; i < nRows; i++) {
    for (let j = 0; j < nCols; j++) {
      k++;
      const lat = y0 + (i + 0.5) * dLat;
      const lng = x0 + (j + 0.5) * dLng;
      cells.push({ lat, lng, f: featuresFor(measurePoint(lat, lng, "")) });
      if (onProgress && cells.length % 40 === 0) {
        onProgress(k / total);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }
  onProgress?.(1);
  return { bbox, dLat, dLng, cells };
}
