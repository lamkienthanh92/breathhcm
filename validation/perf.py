import json, os, sys, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "public", "analysis"))
import breath_analysis as B
A = json.load(open(os.path.join(HERE, "app_features.json")))
meta = json.load(open(os.path.join(os.path.dirname(HERE), "public", "analysis", "exposures.json")))
pts = A["residences"] + A["random"]
rng = np.random.default_rng(5)
out = []
for n in [155, 500, len(pts)]:
    sel = pts[:n]
    age = rng.normal(65, 9, n); sex = rng.binomial(1, .9, n); bmi = rng.normal(22, 3.5, n)
    y1 = np.exp(2 + rng.normal(0, .3, n)); y2 = rng.binomial(1, .3, n); y3 = rng.poisson(1.2, n)
    data = [["ID", "Latitude", "Longitude", "Age", "Sex", "BMI", "Y1", "Y2", "Y3"]] + [
        [p["id"], p["lat"], p["lng"], float(a), int(s), float(b), float(u), int(v), int(w)]
        for p, a, s, b, u, v, w in zip(sel, age, sex, bmi, y1, y2, y3)]
    var = [["Column name", "Role", "Type", "Transform"], ["Age", "covariate", "continuous", "none"], ["Sex", "covariate", "binary", "none"],
           ["BMI", "covariate", "continuous", "none"], ["Y1", "outcome", "continuous", "log"], ["Y2", "outcome", "binary", "none"],
           ["Y3", "outcome", "count", "none"]]
    exp = [["Key", "Include", "Anchor"]] + [[m["key"], "yes", "yes" if m["key"] == "road_kernel" else "no"] for m in meta]
    sheets = {"Data": data, "Variables": var, "Exposures": exp, "Settings": [["Setting", "Value"], ["run_profiles", "yes"], ["run_stability", "yes"]]}
    feats = [{"id": p["id"], **{k: v for k, v in p.items() if k not in ("id", "lat", "lng")}} for p in sel]
    t0 = time.time()
    r = B.run_analysis(sheets, feats, meta)
    out.append({"n": n, "engine_seconds_cpython": round(time.time() - t0, 1), "ok": r["ok"], "tests": r["summary"]["n_tests"],
                "measure_seconds_node": round(n * A["timing_ms_per_point"]["random"] / 1000, 2)})
    print(out[-1], flush=True)
json.dump(out, open(os.path.join(HERE, "perf.json"), "w"), indent=1)
