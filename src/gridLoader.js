// Loads /data/grids.json (the ~19MB One Health environmental grids) once,
// caches it in module scope for the rest of the session. Every other
// module that needs grid data (oneHealthGrids.js, populationStats.js,
// MapView.jsx's heatmap) reads through getGrids() rather than importing
// the data directly -- this is what makes it possible to keep the raw
// data OUT of the JS bundle (see oneHealthGrids.js header comment for
// why that matters).

let _grids = null;
let _loadPromise = null;
let _error = null;

export function loadGrids() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = fetch(`${process.env.PUBLIC_URL || ""}/data/grids.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`grids.json fetch failed: HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      _grids = data;
      return data;
    })
    .catch((err) => {
      _error = err;
      throw err;
    });
  return _loadPromise;
}

// Synchronous accessor -- returns null until loadGrids() has resolved.
// Callers that run after the app-level loading gate (see App.jsx) can
// treat this as always-populated; anything that might run earlier must
// handle null.
export function getGrids() {
  return _grids;
}

export function getGridsError() {
  return _error;
}

export function isGridsLoaded() {
  return _grids !== null;
}

// Lets a layer that lives in its own file (e.g. the ~1 km PM2.5 grid in
// /data/pm25.json, see pm25.js) join the shared {lats, lons, grid} registry
// so generic tools -- distance profiles, city-wide correlations -- can use it
// without knowing where it came from. Must be called after loadGrids().
export function registerGrid(key, gridObj) {
  if (!_grids) throw new Error(`registerGrid("${key}") called before grids.json loaded`);
  _grids[key] = gridObj;
}

export function hasGrid(key) {
  return !!(_grids && _grids[key]);
}

// For the command-line batch exporter (Node has no relative fetch): inject
// the parsed grids.json directly. Not used by the browser app.
export function setGrids(data) {
  _grids = data;
  _loadPromise = Promise.resolve(data);
  _error = null;
}
