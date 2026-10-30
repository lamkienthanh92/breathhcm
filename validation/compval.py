"""Engine estimates vs independent reference implementations, on the 1,000 random points with simulated
covariates and outcomes (no participant data needed). Run after measure_points.mjs."""
import json, os, sys, time
import numpy as np
from scipy.optimize import minimize
from scipy import stats
from sklearn.linear_model import PoissonRegressor
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "public", "analysis"))
import breath_analysis as B

A = json.load(open(os.path.join(HERE, "app_features.json")))
meta = json.load(open(os.path.join(os.path.dirname(HERE), "public", "analysis", "exposures.json")))
tr = {m["key"]: m["transform"] for m in meta}
feat = A["random"]
n = len(feat)
rng = np.random.default_rng(99)
C = np.column_stack([np.ones(n), rng.normal(65, 9, n), rng.binomial(1, .9, n), rng.normal(22, 3.5, n)])
def sc(k):
    x = np.array([f[k] if f[k] is not None else np.nan for f in feat], float)
    x = np.log10(np.clip(x, 1, None)) if tr[k] == "log10" else (np.log10(x + 1) if tr[k] == "log10p1" else x)
    ok = np.isfinite(x)
    if ok.mean() < 0.8 or np.nanstd(x) == 0 or np.nanmax(np.unique(x[ok], return_counts=True)[1]) > 0.95 * ok.sum():
        return None
    x = np.where(ok, x, np.nanmean(x))
    return (x - x.mean()) / x.std(ddof=1)
lin = C[:, 1:] @ [0.01, 0.1, 0.02]
z = (lin - lin.mean()) / lin.std()
yc = 2 + lin + rng.normal(0, 0.3, n)
yb = (rng.random(n) < 1 / (1 + np.exp(-(-1 + 0.3 * z)))).astype(float)
yp = rng.poisson(np.exp(0.3 + 0.2 * z)).astype(float)
def ref_gauss(y, X):
    b = np.linalg.lstsq(X, y, rcond=None)[0]; Xi = np.linalg.inv(X.T @ X)
    h = np.einsum("ij,jk,ik->i", X, Xi, X); e = y - X @ b
    return b, np.sqrt(np.diag(Xi @ (X.T * (e / (1 - h)) ** 2) @ X @ Xi))
def sandwich(X, y, mu, var):
    Ai = np.linalg.inv(X.T @ (X * var[:, None])); e = y - mu
    return np.sqrt(np.diag(Ai @ ((X * (e ** 2)[:, None]).T @ X) @ Ai * len(y) / (len(y) - X.shape[1])))
def ref_logit(y, X):
    nll = lambda b: -(y * (X @ b) - np.log1p(np.exp(X @ b))).sum()
    gr = lambda b: -X.T @ (y - 1 / (1 + np.exp(-(X @ b))))
    b = minimize(nll, np.zeros(X.shape[1]), jac=gr, method="BFGS", options={"gtol": 1e-12, "maxiter": 10000}).x
    mu = 1 / (1 + np.exp(-(X @ b))); return b, sandwich(X, y, mu, mu * (1 - mu))
def ref_pois(y, X):
    b = PoissonRegressor(alpha=0, fit_intercept=False, tol=1e-12, max_iter=100000).fit(X, y).coef_
    mu = np.exp(X @ b); return b, sandwich(X, y, mu, mu)
out = {}
for fam, y, ref in [("gaussian", yc, ref_gauss), ("binomial", yb, ref_logit), ("poisson", yp, ref_pois)]:
    db = ds = 0.0; m = 0
    for k in tr:
        x = sc(k)
        if x is None: continue
        X = np.column_stack([C[:, :1], x, C[:, 1:]])
        r = B.fit_model(y, X, fam); b, se = ref(y, X)
        db = max(db, abs(r["coef"][1] - b[1])); ds = max(ds, abs(r["se"][1] - se[1])); m += 1
    out[fam] = {"exposures": m, "max_abs_beta_diff": db, "max_abs_se_diff": ds}
print(json.dumps(out, indent=1))
