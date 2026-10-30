// Environmental grid layers -- One Health expansion.
//
// IMPORTANT ARCHITECTURE NOTE: the actual grid data (~19MB) used to be
// embedded directly in this file as JS array literals. That crashed
// production builds on Netlify with "JavaScript heap out of memory" --
// webpack/babel has to parse a literal that size into an AST during
// build, which costs roughly 10-20x the source size in memory, blowing
// past typical CI build-container heap limits (~2GB).
//
// Fix: the grid data now lives at /public/data/grids.json, a static
// asset that Create React App copies verbatim (never parsed by the
// bundler) and the browser fetches + JSON.parse()s at runtime instead.
// This is the standard pattern for large datasets in a bundled web app.
//
// Practical effect: every lookup function below is now backed by data
// that must be loaded first via loadGrids() (see gridLoader.js). Call
// loadGrids() once on app start and gate the UI on it being ready --
// see App.jsx.

import { getGrids } from "./gridLoader.js";

// Metadata is tiny (13 short objects) so it stays as a normal JS const --
// no need to fetch this part separately.
export const GRID_META = {
  no2: { label: "NO2 (relative index, x1e9 mol/m^2)", unit: "idx", source: "Sentinel-5P TROPOMI", vintage: "2025", nativeRes: "~1km", displayRes: "~1km", note: "sensor-limited, cannot go finer" },
  so2: { label: "SO2 (relative index, x1e9 mol/m^2)", unit: "idx", source: "Sentinel-5P TROPOMI", vintage: "2025", nativeRes: "~1km", displayRes: "~1km", note: "sensor-limited, cannot go finer" },
  co: { label: "CO (relative index, x1e3 mol/m^2)", unit: "idx", source: "Sentinel-5P TROPOMI", vintage: "2025", nativeRes: "~1km", displayRes: "~1km", note: "sensor-limited, cannot go finer" },
  o3: { label: "O3 tropospheric (relative index, x1e3 mol/m^2)", unit: "idx", source: "Sentinel-5P TROPOMI", vintage: "2025", nativeRes: "~1km", displayRes: "~1km", note: "sensor-limited, cannot go finer" },
  lst: { label: "Land Surface Temperature", unit: "C", source: "MODIS MOD11A2", vintage: "2025", nativeRes: "~1km", displayRes: "~1km", note: "sensor-limited, cannot go finer" },
  nightlights: { label: "Night Light Radiance (economic activity proxy)", unit: "nW/cm2/sr", source: "VIIRS DNB monthly composite", vintage: "last 12mo", nativeRes: "~500m", displayRes: "~500m", note: "sensor-limited, cannot go finer" },
  builtup: { label: "Built-up Surface (% of cell)", unit: "%", source: "GHSL P2023A", vintage: "2020 (observed epoch)", nativeRes: "100m", displayRes: "100m", note: "full native resolution, no downsampling" },
  water: { label: "Surface Water Occurrence (1984-2021)", unit: "%", source: "JRC Global Surface Water v1.4", vintage: "1984-2021 aggregate", nativeRes: "30m (Landsat)", displayRes: "100m", note: "exported at 100m via GEE, not further downsampled" },
  population: { label: "Population (estimated people per cell)", unit: "people", source: "WorldPop community catalog", vintage: "2024", nativeRes: "100m", displayRes: "100m", note: "full native resolution, no downsampling" },
  elevation: { label: "Elevation", unit: "m", source: "SRTM", vintage: "static (2000 mission)", nativeRes: "30m", displayRes: "~150m", note: "downsampled 5x -- full 30m would be ~130MB, impractical for a JS bundle" },
  landcover: { label: "Land Cover Class (0=water,1=trees,2=grass,3=flooded_veg,4=crops,5=shrub,6=built,7=bare,8=snow)", unit: "class", source: "Dynamic World V1", vintage: "last 12mo", nativeRes: "10m", displayRes: "100m", note: "downsampled 10x -- full 10m would be >100MB, impractical for a JS bundle" },
  treecover: { label: "Tree Canopy Cover (year 2000 baseline)", unit: "%", source: "Hansen Global Forest Change", vintage: "2000 baseline", nativeRes: "30m", displayRes: "~150m", note: "downsampled 5x -- full 30m would be ~130MB, impractical for a JS bundle" },
  forestloss: { label: "Forest Loss since 2000 (% of cell)", unit: "%", source: "Hansen Global Forest Change", vintage: "2000-2025", nativeRes: "30m", displayRes: "~150m", note: "downsampled 5x -- full 30m would be ~130MB, impractical for a JS bundle" },
};

function nearestIndex(arr, val) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(arr[i] - val);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// Generic lookup: gridObj = {lats, lons, grid}
export function lookupGridValue(gridObj, lat, lng) {
  if (!gridObj) return null;
  const iL = nearestIndex(gridObj.lats, lat);
  const iG = nearestIndex(gridObj.lons, lng);
  const v = gridObj.grid[iL]?.[iG];
  return (v === null || v === undefined) ? null : v;
}

// Look up every One Health environmental layer at once for a coordinate.
// Requires loadGrids() to have resolved already (App.jsx gates the UI on
// this) -- if grids aren't loaded yet, every value comes back null rather
// than throwing, so a stray early call fails soft.
export function lookupOneHealthLayers(lat, lng) {
  const grids = getGrids();
  const out = {};
  for (const key of Object.keys(GRID_META)) {
    out[key] = grids ? lookupGridValue(grids[key], lat, lng) : null;
  }
  return out;
}

export const LANDCOVER_LABELS = {
  0: 'Water', 1: 'Trees', 2: 'Grass', 3: 'Flooded vegetation',
  4: 'Crops', 5: 'Shrub & scrub', 6: 'Built area', 7: 'Bare ground', 8: 'Snow/ice',
};
