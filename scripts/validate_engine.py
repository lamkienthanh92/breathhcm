"""Numerical checks of the analysis engine against reference implementations.
Run:  python scripts/validate_engine.py   (needs numpy, scipy, scikit-learn)"""
import os, sys
import numpy as np
from scipy.optimize import minimize
from sklearn.linear_model import PoissonRegressor
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "analysis"))
import breath_analysis as B

rng = np.random.default_rng(0)
n = 300
X = np.column_stack([np.ones(n), rng.normal(size=n), rng.normal(size=n), rng.integers(0, 2, n)])
ok = True

# OLS: coefficients vs least squares; HC3 vs explicit formula
y = X @ [1, 0.5, -0.3, 0.2] + rng.normal(size=n) * (1 + np.abs(X[:, 1]))
r = B.fit_model(y, X, "gaussian")
b = np.linalg.lstsq(X, y, rcond=None)[0]
XtXi = np.linalg.inv(X.T @ X)
h = np.einsum("ij,jk,ik->i", X, XtXi, X)
e = y - X @ b
V = XtXi @ (X.T * (e / (1 - h)) ** 2) @ X @ XtXi
ok &= np.allclose(r["coef"], b) and np.allclose(r["se"], np.sqrt(np.diag(V)))
print("OLS + HC3:", np.allclose(r["coef"], b), np.allclose(r["se"], np.sqrt(np.diag(V))))

# Logistic: coefficients vs direct likelihood maximisation
yb = (rng.random(n) < 1 / (1 + np.exp(-(X @ [-0.5, 0.8, -0.4, 0.3])))).astype(float)
g = B.fit_model(yb, X, "binomial")
opt = minimize(lambda bb: -(yb * (X @ bb) - np.log1p(np.exp(X @ bb))).sum(), np.zeros(4), method="BFGS", options={"gtol": 1e-10})
ok &= np.allclose(g["coef"], opt.x, atol=1e-4)
print("Logistic:", np.allclose(g["coef"], opt.x, atol=1e-4))

# Poisson: coefficients vs scikit-learn
yc = rng.poisson(np.exp(X @ [0.2, 0.3, -0.2, 0.1])).astype(float)
p = B.fit_model(yc, X, "poisson")
sp = PoissonRegressor(alpha=0, fit_intercept=False, max_iter=10000, tol=1e-10).fit(X, yc)
ok &= np.allclose(p["coef"], sp.coef_, atol=1e-4)
print("Poisson:", np.allclose(p["coef"], sp.coef_, atol=1e-4))

# Benjamini-Hochberg vs textbook example
q = B.bh_fdr([0.01, 0.04, 0.03, 0.005])
ok &= np.allclose(q, [0.02, 0.04, 0.04, 0.02])
print("BH FDR:", np.allclose(q, [0.02, 0.04, 0.04, 0.02]))
# Redundancy screening: one near-duplicate pair must remove exactly one exposure (regression test)
m = 60
rng2 = np.random.default_rng(3)
base = rng2.normal(size=m)
feats = [{"id": f"S{i}", "a": float(base[i]), "a_copy": float(base[i] * 2 + 1), "b": float(rng2.normal()), "c": float(rng2.normal())}
         for i in range(m)]
meta = [{"key": k, "label": k, "domain": "d", "source": "s", "transform": "none"} for k in ("a", "a_copy", "b", "c")]
data = [["ID", "Latitude", "Longitude", "Y"]] + [[f"S{i}", 10.75 + i * 1e-3, 106.65, float(rng2.normal())] for i in range(m)]
res = B.run_analysis({"Data": data, "Variables": [["Column name", "Role", "Type", "Transform"], ["Y", "outcome", "continuous", "none"]],
                      "Settings": [["Setting", "Value"], ["run_profiles", "no"], ["run_stability", "no"]]}, feats, meta)
status = {s_["key"]: s_["status"] for s_ in res["screening"]}
red_ok = status == {"a": "tested", "a_copy": "excluded", "b": "tested", "c": "tested"}
ok &= red_ok
print("Redundancy screening:", red_ok)
print("ALL CHECKS PASSED" if ok else "SOME CHECKS FAILED")
sys.exit(0 if ok else 1)
