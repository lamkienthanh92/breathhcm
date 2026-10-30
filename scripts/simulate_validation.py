"""Simulation study for the BREATH-HCMC analysis engine.

Uses the real residences and exposures in a reproducibility payload (the JSON the
app downloads) and replaces the outcome with simulated values, so the exposure
correlation and spatial structure are exactly those of a real study.

Scenarios (single continuous outcome, log scale, adjusted for the payload's covariates):
  A  null: outcome unrelated to location or exposures
  B  null with a large-scale spatial gradient (e.g. unmeasured area deprivation)
  C  true effect of one exposure (0.25 SD of the outcome per 1-SD exposure)
  D  data-quality audit: injected median imputation, unit errors and implausible values

Run:  python scripts/simulate_validation.py BREATH_reproducibility_payload.json [n_reps] [scenarios, e.g. ABCD]
"""
import copy
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "analysis"))
import breath_analysis as B  # noqa: E402

payload = json.load(open(sys.argv[1], encoding="utf-8"))
R = int(sys.argv[2]) if len(sys.argv) > 2 else 100
WHICH = sys.argv[3].upper() if len(sys.argv) > 3 else "ABCD"
GRAD = float(sys.argv[4]) if len(sys.argv) > 4 else 0.12   # strength of the spatial gradient in scenario B (log units)
IMP = float(sys.argv[5]) if len(sys.argv) > 5 else 0.15    # share of median-imputed values in scenario D
rng = np.random.default_rng(2026)

sheets0 = payload["sheets"]
P = B.parse_template(sheets0)
data = sheets0["Data"]
head = [str(h) for h in data[0]]
covs = [v for v in P["variables"] if v["role"] == "covariate"]
idx = {h: i for i, h in enumerate(head)}
rows = [r for r in data[1:] if any(str(c).strip() for c in r)]
keep_ids = {r["id"] for r in P["rows"]}
rows = [r for r in rows if str(r[idx[head[0]]]).strip() in keep_ids]
n = len(rows)
lat = np.array([r["lat"] for r in P["rows"]])
lng = np.array([r["lng"] for r in P["rows"]])
feat = {str(f["id"]): f for f in payload["features"]}
ids = [r["id"] for r in P["rows"]]
target = "ndvi" if "ndvi" in feat[ids[0]] else [k for k in feat[ids[0]] if not k.startswith("_")][0]
xt = np.array([feat[i][target] for i in ids], float)
xt = (xt - xt.mean()) / xt.std()
z = lambda a: (a - a.mean()) / a.std()
gradient = z(z(lat) + 0.5 * z(lng))


def make_sheets(y, extra_rows=None):
    s = copy.deepcopy(sheets0)
    keep_cols = [idx[h] for h in head if h in ("ID",) or B._norm(h) in B.COORD_KEYS + B.LAT_KEYS + B.LNG_KEYS + B.EXCL_KEYS
                 + B.EXCL_REASON_KEYS or h in [c["name"] for c in covs]]
    new_head = [head[i] for i in keep_cols] + ["Y"]
    s["Data"] = [new_head] + [[r[i] for i in keep_cols] + [float(v) if np.isfinite(v) else ""] for r, v in zip(rows, y)]
    vh = s["Variables"][0]
    vrows = [r for r in s["Variables"][1:] if str(r[0]).strip() in [c["name"] for c in covs]]
    yrow = ["Y", "outcome", "continuous", "log", "", 0.5, 50, "", ""] + [""] * (len(vh) - 9)
    s["Variables"] = [vh] + vrows + [yrow]
    s["Settings"] = [["Setting", "Value"], ["fdr_level", 0.05], ["run_profiles", "no"], ["run_stability", "no"],
                     ["max_robustness", 30]]
    return s


def run(y):
    res = B.run_analysis(make_sheets(y), payload["features"], payload["meta"])
    E = res["ewas"]
    hits = {e["exposure"] for e in E if e["p"] < 0.05}
    fdr = {e["exposure"] for e in E if e["q_within"] is not None and e["q_within"] < 0.05}
    robust = {r["exposure"] for r in res["robustness"] if r["verdict"].startswith("robust")}
    return res, hits, fdr, robust


EXPO = {k: np.array([feat[i][k] for i in ids], float) for k in feat[ids[0]] if not k.startswith("_") and k != "id"}
CORR = {k: abs(np.corrcoef(np.nan_to_num(v), xt)[0, 1]) if np.nanstd(v) > 0 else 0 for k, v in EXPO.items()}


def scenario(name, gen, true_exposure=None):
    """With a true exposure, exposures correlated |r| >= 0.5 with it are proxies, not counted as false positives."""
    t0 = time.time()
    proxies = {k for k, r in CORR.items() if r >= 0.5} if true_exposure else set()
    any_nom = any_fdr = any_rob = any_both = 0
    tp_nom = tp_fdr = tp_rob = tp_both = 0
    n_nom = []
    for _ in range(R):
        _, hits, fdr, robust = run(gen())
        false = lambda s: s - ({true_exposure} if true_exposure else set()) - proxies
        any_nom += bool(false(hits))
        any_fdr += bool(false(fdr))
        any_rob += bool(false(robust))
        any_both += bool(false(fdr & robust))
        n_nom.append(len(false(hits)))
        if true_exposure:
            tp_nom += true_exposure in hits
            tp_fdr += true_exposure in fdr
            tp_rob += true_exposure in robust
            tp_both += true_exposure in (fdr & robust)
    out = {"scenario": name, "reps": R,
           "P(>=1 false nominal hit)": any_nom / R, "mean false nominal hits": float(np.mean(n_nom)),
           "P(>=1 false FDR hit)": any_fdr / R, "P(>=1 false 'robust' hit)": any_rob / R,
           "P(>=1 false hit that is FDR-significant AND robust)": any_both / R}
    if true_exposure:
        out.update({"power nominal": tp_nom / R, "power FDR": tp_fdr / R, "power robust": tp_rob / R,
                    "power FDR and robust": tp_both / R, "proxy exposures not counted": sorted(proxies - {true_exposure})})
    out["seconds"] = round(time.time() - t0, 1)
    print(json.dumps(out), flush=True)
    return out


base_cov = np.zeros(n)
for c in covs:
    if c["type"] in ("continuous", "binary"):
        v = np.array(P["values"][c["name"]], float)
        v = np.where(np.isfinite(v), v, np.nanmean(v))
        base_cov += 0.05 * z(v)
mu = np.log(8.0) + base_cov
sd = 0.30
gens = {
    "A": lambda: scenario("A null", lambda: np.exp(mu + rng.normal(0, sd, n))),
    "B": lambda: scenario(f"B null + spatial gradient {GRAD}", lambda: np.exp(mu + GRAD * gradient + rng.normal(0, sd, n))),
    "C": lambda: scenario(f"C true effect of {target} (0.25 SD)", lambda: np.exp(mu + 0.25 * sd * xt + rng.normal(0, sd, n)),
                          true_exposure=target),
}
for k in "ABC":
    if k in WHICH:
        gens[k]()
if "D" not in WHICH:
    sys.exit(0)

# D: data-quality audit detection
det = {f"median imputation ({100 * IMP:.0f}%)": 0, "unit error (x10)": 0, "implausible value": 0, "false alarm on clean data": 0}
for _ in range(R):
    y = np.exp(mu + rng.normal(0, sd, n))
    y = np.round(y, 2)
    clean = np.round(np.exp(mu + rng.normal(0, sd, n)), 2)
    Pc = B.parse_template(make_sheets(clean))
    qc_c, fl_c = B.audit(__import__("pandas").DataFrame(Pc["values"]), Pc["variables"], [r["id"] for r in Pc["rows"]])
    det["false alarm on clean data"] += any(q["variable"] == "Y" and q["severity"] == "warning" for q in qc_c)
    i_imp = rng.choice(n, int(IMP * n), replace=False)
    y[i_imp] = np.round(np.median(y), 2)
    rest = np.setdiff1d(np.arange(n), i_imp)
    i_unit, i_bad = rng.choice(rest, 2, replace=False)
    y[i_unit] = y[i_unit] * 10
    y[i_bad] = 120.0
    s = make_sheets(y)
    Pq = B.parse_template(s)
    df = __import__("pandas").DataFrame(Pq["values"])
    qc, flagged = B.audit(df, Pq["variables"], [r["id"] for r in Pq["rows"]])
    flag_ids = {i for i, v in flagged.items() if "Y" in v}
    imp_issue = [q for q in qc if q["variable"] == "Y" and "median imputation" in q["issue"]]
    det[f"median imputation ({100 * IMP:.0f}%)"] += bool(imp_issue) and imp_issue[0]["n"] >= len(i_imp)
    det["unit error (x10)"] += ids[i_unit] in flag_ids
    det["implausible value"] += ids[i_bad] in flag_ids
print(json.dumps({"scenario": "D data-quality audit", "reps": R, **{k: v / R for k, v in det.items()}}), flush=True)
