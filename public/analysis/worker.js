/* Analysis worker: runs breath_analysis.py inside the browser with Pyodide.
 * Nothing leaves the user's computer: Pyodide and its packages are downloaded
 * once from the CDN (then cached by the browser); the data never are.
 *
 * Messages in:  { id, action: "parse" | "run", payload }
 * Messages out: { id, type: "status", message } | { id, type: "result", result } | { id, type: "error", error }
 */
/* global importScripts, loadPyodide */
const PYODIDE_VERSION = "0.26.4";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
let ready = null;

function init(id) {
  if (ready) return ready;
  ready = (async () => {
    self.postMessage({ id, type: "status", message: "Loading the Python engine (first use downloads ~30 MB, then cached)…" });
    importScripts(PYODIDE_URL + "pyodide.js");
    const py = await loadPyodide({ indexURL: PYODIDE_URL });
    self.postMessage({ id, type: "status", message: "Loading numpy, pandas, scipy, scikit-learn…" });
    await py.loadPackage(["numpy", "pandas", "scipy", "scikit-learn"]);
    const src = await (await fetch(new URL("breath_analysis.py", self.location.href))).text();
    py.FS.writeFile("/home/pyodide/breath_analysis.py", src);
    py.runPython("import sys\nsys.path.insert(0, '/home/pyodide')\nimport breath_analysis");
    return py;
  })();
  ready.catch(() => {
    ready = null; // allow a retry after a network failure
  });
  return ready;
}

self.onmessage = async (e) => {
  const { id, action, payload } = e.data || {};
  try {
    const py = await init(id);
    self.postMessage({ id, type: "status", message: action === "parse" ? "Checking the template…" : "Running the analysis…" });
    py.globals.set("ARG", JSON.stringify(payload));
    const fn = action === "parse" ? "api_parse" : "api_run";
    const out = py.runPython(`breath_analysis.${fn}(ARG)`);
    py.globals.delete("ARG");
    self.postMessage({ id, type: "result", result: JSON.parse(out) });
  } catch (err) {
    self.postMessage({ id, type: "error", error: String((err && err.message) || err) });
  }
};
