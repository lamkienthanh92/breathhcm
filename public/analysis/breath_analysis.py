"""BREATH-HCMC outcome-analysis engine.

Runs inside the browser (Pyodide, loaded by public/analysis/worker.js) and as a
plain Python script for reproducibility:

    python breath_analysis.py payload.json results.json

`payload.json` is the file the app's "Download reproducibility package" button
saves: the uploaded template (as sheets of cell values) plus the exposures the
app computed for each participant. Requires numpy, pandas, scipy, scikit-learn.

Pipeline: parse and validate the template -> data-quality audit -> exposure
screening and contrast -> exposome-wide association study (EWAS) with FDR ->
robustness checks for every nominal association -> domains, profiles and
stability selection -> plain-language summary and methods text.
"""
import hashlib
import json
import math
import re
import sys
import unicodedata
import warnings

import numpy as np
import pandas as pd
from scipy import stats

VERSION = "1.0.0"
warnings.filterwarnings("ignore")


# =============================================================================
# Helpers
# =============================================================================
def _norm(s):
    s = unicodedata.normalize("NFD", str(s if s is not None else ""))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return s.replace("đ", "d").replace("Đ", "D").strip().lower()


def _num(v):
    if v is None:
        return np.nan
    if isinstance(v, (int, float, np.integer, np.floating)) and not isinstance(v, bool):
        return float(v)
    s = str(v).strip()
    if s == "":
        return np.nan
    s = s.replace(",", ".") if s.count(",") == 1 and "." not in s else s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None  # signals a non-numeric entry


def _clean(o):
    """Make results JSON-serialisable (numpy -> python, NaN/inf -> None)."""
    if isinstance(o, dict):
        return {str(k): _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        return None if not math.isfinite(float(o)) else float(o)
    if isinstance(o, np.ndarray):
        return _clean(o.tolist())
    if isinstance(o, (np.bool_,)):
        return bool(o)
    return o


def bh_fdr(p):
    p = np.asarray(p, float)
    out = np.full(len(p), np.nan)
    ok = np.isfinite(p)
    if not ok.any():
        return out
    pv = p[ok]
    n = len(pv)
    order = np.argsort(pv)
    ranked = pv[order] * n / (np.arange(n) + 1)
    q = np.minimum.accumulate(ranked[::-1])[::-1]
    tmp = np.empty(n)
    tmp[order] = np.minimum(q, 1)
    out[ok] = tmp
    return out


def holm(p):
    p = np.asarray(p, float)
    n = len(p)
    order = np.argsort(p)
    adj = np.empty(n)
    run = 0.0
    for rank, i in enumerate(order):
        run = max(run, min(1.0, (n - rank) * p[i]))
        adj[i] = run
    return adj


# =============================================================================
# 1. Template parsing
# =============================================================================
ID_KEYS = ["id", "stt", "ma", "ma so", "patient id", "sample id"]
COORD_KEYS = ["google maps coordinates", "toa do google maps", "coordinates", "toa do", "coordinate"]
LAT_KEYS = ["latitude", "lat", "vi do"]
LNG_KEYS = ["longitude", "lng", "lon", "kinh do"]
EXCL_KEYS = ["exclude", "loai tru"]
EXCL_REASON_KEYS = ["exclusion reason", "ly do loai tru", "reason"]
YES = {"yes", "y", "1", "true", "x", "co"}
ROLES = {"outcome", "covariate", "cluster", "ignore"}
TYPES = {"continuous", "binary", "count", "categorical"}
TRANSFORMS = {"none", "log"}


def _sheet(sheets, name):
    for k, v in sheets.items():
        if _norm(k) == _norm(name):
            return v
    return None


def _rows_to_frame(rows):
    rows = [list(r) for r in (rows or []) if r is not None]
    while rows and all(str(c).strip() == "" for c in rows[0]):
        rows.pop(0)
    if not rows:
        return pd.DataFrame()
    header = [str(h).strip() for h in rows[0]]
    width = len(header)
    body = [r + [""] * (width - len(r)) if len(r) < width else r[:width] for r in rows[1:]]
    body = [r for r in body if any(str(c).strip() != "" for c in r)]
    df = pd.DataFrame(body, columns=header)
    return df.loc[:, [c for c in df.columns if c != ""]]


def _find(cols, keys):
    nc = {_norm(c): c for c in cols}
    for k in keys:
        if k in nc:
            return nc[k]
    for k in keys:
        for n, c in nc.items():
            if n.startswith(k + " ") or n.startswith(k + "("):
                return c
    return None


def _parse_coord(s):
    if s is None or str(s).strip() == "":
        return None
    parts = [p for p in re.split(r"[,;\s]+", str(s).strip()) if p]
    if len(parts) != 2:
        return "bad"
    try:
        return float(parts[0]), float(parts[1])
    except ValueError:
        return "bad"


def parse_template(sheets):
    errors, warns = [], []
    raw_data = _sheet(sheets, "Data")
    data = _rows_to_frame(raw_data)
    if data.shape[1] == 0:
        return {"ok": False, "errors": ["Sheet 'Data' is missing or has no header row."], "warnings": []}
    c_id, c_coord = _find(data.columns, ID_KEYS), _find(data.columns, COORD_KEYS)
    c_lat, c_lng = _find(data.columns, LAT_KEYS), _find(data.columns, LNG_KEYS)
    if c_id is None:
        errors.append("Sheet 'Data' has no 'ID' column.")
    if c_coord is None and (c_lat is None or c_lng is None):
        errors.append("Sheet 'Data' needs 'Google Maps coordinates' or both 'Latitude' and 'Longitude'.")
    if errors:
        return {"ok": False, "errors": errors, "warnings": warns}
    c_ex, c_exr = _find(data.columns, EXCL_KEYS), _find(data.columns, EXCL_REASON_KEYS)

    rows, bad_rows, excluded = [], [], []
    seen = set()
    for i, r in data.iterrows():
        rid = str(r[c_id]).strip()
        if rid == "" or rid.lower() == "nan":
            bad_rows.append(f"row {i + 2}: missing ID")
            continue
        if rid in seen:
            bad_rows.append(f"row {i + 2}: duplicate ID '{rid}'")
            continue
        if c_ex is not None and _norm(r[c_ex]) in YES:
            seen.add(rid)
            reason = str(r[c_exr]).strip() if c_exr is not None else ""
            excluded.append({"id": rid, "reason": reason if reason and reason.lower() != "nan" else "not stated"})
            continue
        lat = lng = None
        if c_coord is not None:
            pc = _parse_coord(r[c_coord])
            if pc == "bad":
                bad_rows.append(f"ID {rid}: coordinates not in 'lat, lng' form")
                continue
            if pc:
                lat, lng = pc
        if lat is None and c_lat is not None and c_lng is not None:
            lat, lng = _num(r[c_lat]), _num(r[c_lng])
        if lat is None or lng is None or not (np.isfinite(lat) and np.isfinite(lng)):
            bad_rows.append(f"ID {rid}: no coordinates")
            continue
        if not (10 <= lat <= 11 and 106 <= lng <= 107):
            bad_rows.append(f"ID {rid}: coordinates outside Ho Chi Minh City ({lat}, {lng})")
            continue
        seen.add(rid)
        rows.append({"row": int(i), "id": rid, "lat": float(lat), "lng": float(lng)})
    if bad_rows:
        warns.append({"issue": "Rows skipped", "detail": bad_rows[:50], "n": len(bad_rows)})

    # --- variable dictionary
    vdf = _rows_to_frame(_sheet(sheets, "Variables"))
    variables = []
    data_cols = [c for c in data.columns if c not in (c_id, c_coord, c_lat, c_lng, c_ex, c_exr)]
    if vdf.empty:
        errors.append("Sheet 'Variables' is missing or empty.")
    else:
        vc = {k: _find(vdf.columns, [k]) for k in ["column name", "role", "type", "transform", "unit",
                                                    "plausible min", "plausible max", "primary exposure", "description",
                                                    "covariates for this outcome"]}
        for _, r in vdf.iterrows():
            name = str(r[vc["column name"]]).strip() if vc["column name"] else ""
            if not name:
                continue
            role = _norm(r[vc["role"]]) if vc["role"] else ""
            vtype = _norm(r[vc["type"]]) if vc["type"] else ""
            tr = _norm(r[vc["transform"]]) if vc["transform"] else "none"
            tr = tr or "none"
            if name not in data.columns:
                errors.append(f"Variables: column '{name}' does not exist in sheet 'Data'.")
                continue
            if role not in ROLES:
                errors.append(f"Variables: '{name}' has role '{role}'; use outcome, covariate, cluster or ignore.")
                continue
            if role == "ignore":
                continue
            if role != "cluster" and vtype not in TYPES:
                errors.append(f"Variables: '{name}' has type '{vtype}'; use continuous, binary, count or categorical.")
                continue
            if tr not in TRANSFORMS:
                errors.append(f"Variables: '{name}' has transform '{tr}'; use none or log.")
                continue
            if role == "outcome" and vtype == "categorical":
                errors.append(f"Variables: categorical outcome '{name}' is not supported; recode it as binary.")
                continue
            pe = str(r[vc["primary exposure"]]).strip() if vc["primary exposure"] else ""
            cv = str(r[vc["covariates for this outcome"]]).strip() if vc["covariates for this outcome"] else ""
            cv_list = [c.strip() for c in re.split(r"[,;]", cv) if c.strip() and c.strip().lower() != "nan"]
            variables.append({
                "name": name, "role": role, "type": vtype or "categorical", "transform": tr,
                "unit": str(r[vc["unit"]]).strip() if vc["unit"] else "",
                "min": _num(r[vc["plausible min"]]) if vc["plausible min"] else np.nan,
                "max": _num(r[vc["plausible max"]]) if vc["plausible max"] else np.nan,
                "primary_exposure": "" if pe.lower() == "nan" else pe,
                "description": str(r[vc["description"]]).strip() if vc["description"] else "",
                "covariates": cv_list if role == "outcome" else [],
            })
        undeclared = [c for c in data_cols if c not in {v["name"] for v in variables}
                      and c not in set(vdf[vc["column name"]].astype(str).str.strip())]
        if undeclared:
            warns.append({"issue": "Columns not described in 'Variables' were ignored", "detail": undeclared,
                          "n": len(undeclared)})
    if not any(v["role"] == "outcome" for v in variables):
        errors.append("Declare at least one outcome in sheet 'Variables'.")
    cov_names = {v["name"] for v in variables if v["role"] == "covariate"}
    for v in variables:
        bad = [c for c in v.get("covariates", []) if c not in cov_names]
        if bad:
            errors.append(f"Variables: outcome '{v['name']}' lists covariates that are not declared as covariates: {', '.join(bad)}.")

    # --- values
    values, bad_cells = {}, []
    keep_ids = {r["row"]: r["id"] for r in rows}
    for v in variables:
        col = []
        for i, val in data[v["name"]].items():
            if i not in keep_ids:
                continue
            if v["type"] == "categorical" or v["role"] == "cluster":
                col.append(None if str(val).strip() == "" else str(val).strip())
                continue
            x = _num(val)
            if x is None:
                bad_cells.append(f"{v['name']} (ID {keep_ids[i]}): '{val}' is not a number")
                x = np.nan
            if v["type"] == "binary" and np.isfinite(x) and x not in (0.0, 1.0):
                bad_cells.append(f"{v['name']} (ID {keep_ids[i]}): binary value must be 0 or 1, got {val}")
                x = np.nan
            col.append(x)
        values[v["name"]] = col
    if bad_cells:
        warns.append({"issue": "Invalid cells set to missing", "detail": bad_cells[:50], "n": len(bad_cells)})

    # --- exposures sheet and settings
    exp_cfg = {}
    edf = _rows_to_frame(_sheet(sheets, "Exposures"))
    if not edf.empty:
        ck, ci, ca = _find(edf.columns, ["key"]), _find(edf.columns, ["include"]), _find(edf.columns, ["anchor"])
        for _, r in edf.iterrows():
            if ck and str(r[ck]).strip():
                exp_cfg[str(r[ck]).strip()] = {
                    "include": _norm(r[ci]) != "no" if ci else True,
                    "anchor": _norm(r[ca]) == "yes" if ca else False,
                }
    settings = {"fdr_level": 0.05, "run_profiles": True, "run_stability": True, "reference_point": None,
                "max_robustness": 30}
    sdf = _sheet(sheets, "Settings") or []
    for r in sdf[1:]:
        if not r or len(r) < 2:
            continue
        k, val = _norm(r[0]), r[1]
        if k in ("fdr_level", "max_robustness") and _num(val) not in (None,) and np.isfinite(_num(val)):
            settings[k] = float(_num(val)) if k == "fdr_level" else int(_num(val))
        elif k in ("run_profiles", "run_stability"):
            settings[k] = _norm(val) != "no"
        elif k == "reference_point" and str(val).strip():
            pc = _parse_coord(val)
            settings[k] = list(pc) if pc and pc != "bad" else None

    plan = json.dumps({"variables": [{k: v[k] for k in ("name", "role", "type", "transform", "primary_exposure", "covariates")}
                                     for v in variables], "exposures": exp_cfg,
                       "settings": settings}, sort_keys=True, default=str)
    n_rows = int(len(data))
    flow = {"rows_in_sheet": n_rows, "skipped_invalid": len(bad_rows), "excluded": excluded,
            "n_excluded": len(excluded), "analysed": len(rows)}
    mode = "plan" if n_rows == 0 else "analysis"
    if mode == "analysis" and not rows and not errors:
        errors.append("No row has a valid ID and coordinates.")
    return _clean({
        "ok": not errors, "mode": mode, "flow": flow, "errors": errors, "warnings": warns, "rows": rows, "variables": variables,
        "values": values, "exposure_config": exp_cfg, "settings": settings,
        "plan_fingerprint": hashlib.sha256(plan.encode()).hexdigest()[:16],
    })


# =============================================================================
# 2. Regression models (OLS / logistic / Poisson) with robust standard errors
# =============================================================================
def fit_model(y, X, family="gaussian", clusters=None):
    """X includes the intercept. Returns dict(coef, se, p, lo, hi, n, converged, resid, fitted)."""
    y = np.asarray(y, float)
    X = np.asarray(X, float)
    ok = np.isfinite(y) & np.isfinite(X).all(1)
    if clusters is not None:
        clusters = np.asarray(clusters, object)
        ok &= pd.notna(clusters)
        clusters = clusters[ok]
    y, X = y[ok], X[ok]
    n, k = X.shape
    if n < k + 5:
        return None
    converged = True
    if family == "gaussian":
        XtX_inv = np.linalg.pinv(X.T @ X)
        b = XtX_inv @ X.T @ y
        mu = X @ b
        e = y - mu
        if clusters is None:
            h = np.einsum("ij,jk,ik->i", X, XtX_inv, X)
            w = (e / np.clip(1 - h, 1e-8, None)) ** 2
            V = XtX_inv @ (X.T * w) @ X @ XtX_inv
            df = n - k
        else:
            V, df = _cluster_V(X, e[:, None] * X, XtX_inv, clusters, n, k)
        A_inv = XtX_inv
    else:
        b = np.zeros(k)
        if family == "binomial":
            pbar = np.clip(y.mean(), 1e-3, 1 - 1e-3)
            b[0] = np.log(pbar / (1 - pbar))
        else:
            b[0] = np.log(max(y.mean(), 1e-3))
        for _ in range(100):
            eta = np.clip(X @ b, -30, 30)
            if family == "binomial":
                mu = 1 / (1 + np.exp(-eta))
                var = np.clip(mu * (1 - mu), 1e-10, None)
            else:
                mu = np.exp(eta)
                var = np.clip(mu, 1e-10, None)
            z = eta + (y - mu) / var
            WX = X * var[:, None]
            b_new = np.linalg.pinv(X.T @ WX) @ (WX.T @ z)
            if np.max(np.abs(b_new - b)) < 1e-9:
                b = b_new
                break
            b = b_new
        else:
            converged = False
        if np.any(np.abs(b[1:]) > 15):
            converged = False
        eta = np.clip(X @ b, -30, 30)
        mu = 1 / (1 + np.exp(-eta)) if family == "binomial" else np.exp(eta)
        var = np.clip(mu * (1 - mu) if family == "binomial" else mu, 1e-10, None)
        A_inv = np.linalg.pinv(X.T @ (X * var[:, None]))
        e = y - mu
        if clusters is None:
            meat = (X * (e ** 2)[:, None]).T @ X
            V = A_inv @ meat @ A_inv * n / max(n - k, 1)
            df = None
        else:
            V, _ = _cluster_V(X, e[:, None] * X, A_inv, clusters, n, k)
            df = None
    se = np.sqrt(np.clip(np.diag(V), 0, None))
    with np.errstate(divide="ignore", invalid="ignore"):
        t = b / se
    if df is None:
        p = 2 * stats.norm.sf(np.abs(t))
        crit = stats.norm.ppf(0.975)
    else:
        p = 2 * stats.t.sf(np.abs(t), df)
        crit = stats.t.ppf(0.975, df)
    return {"coef": b, "se": se, "p": p, "lo": b - crit * se, "hi": b + crit * se, "n": n, "k": k,
            "V": V, "converged": converged, "resid": e, "fitted": mu, "mask": ok, "A_inv": A_inv, "X": X}


def _cluster_V(X, scores, bread, clusters, n, k):
    groups = pd.unique(clusters)
    G = len(groups)
    meat = np.zeros((k, k))
    for g in groups:
        s = scores[clusters == g].sum(0)
        meat += np.outer(s, s)
    c = (G / max(G - 1, 1)) * ((n - 1) / max(n - k, 1))
    return c * bread @ meat @ bread, max(G - 1, 1)


FAMILY = {"continuous": "gaussian", "binary": "binomial", "count": "poisson"}


def effect_scale(vtype, transform, b, lo, hi, se):
    """Return (estimate, lo, hi, mde, label) on the reporting scale for a 1-SD exposure contrast."""
    if vtype == "continuous" and transform == "log":
        f = lambda v: 100 * (np.exp(v) - 1)
        return f(b), f(lo), f(hi), f(2.8 * se), "% difference per 1-SD"
    if vtype == "binary":
        return np.exp(b), np.exp(lo), np.exp(hi), np.exp(2.8 * se), "odds ratio per 1-SD"
    if vtype == "count":
        return np.exp(b), np.exp(lo), np.exp(hi), np.exp(2.8 * se), "rate ratio per 1-SD"
    return b, lo, hi, 2.8 * se, "difference per 1-SD"


def null_value(vtype, transform):
    return 1.0 if vtype in ("binary", "count") else 0.0


# =============================================================================
# 3. Spatial helpers
# =============================================================================
def haversine_matrix(lat, lon):
    lat = np.radians(np.asarray(lat, float))[:, None]
    lon = np.radians(np.asarray(lon, float))[:, None]
    a = np.sin((lat - lat.T) / 2) ** 2 + np.cos(lat) * np.cos(lat.T) * np.sin((lon - lon.T) / 2) ** 2
    return 2 * 6371000 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def knn_weights(D, k=8):
    n = D.shape[0]
    k = min(k, n - 1)
    W = np.zeros_like(D)
    for i in range(n):
        d = D[i].copy()
        d[i] = np.inf
        W[i, np.argsort(d)[:k]] = 1
    return W / W.sum(1, keepdims=True)


def morans_i(x, W, n_perm=499, seed=1):
    z = np.asarray(x, float) - np.nanmean(x)
    n = len(z)
    S0 = W.sum()
    I = (n / S0) * (z @ W @ z) / (z @ z)
    rng = np.random.default_rng(seed)
    perms = np.array([(n / S0) * (zz @ W @ zz) / (zz @ zz) for zz in (rng.permutation(z) for _ in range(n_perm))])
    p = (np.sum(np.abs(perms - perms.mean()) >= abs(I - perms.mean())) + 1) / (n_perm + 1)
    return float(I), float(p)


# =============================================================================
# 4. Data-quality audit
# =============================================================================
def audit(df, variables, ids):
    issues, flagged = [], {}

    def flag(var, issue, rows_idx, severity, suggestion):
        id_list = [ids[i] for i in rows_idx]
        issues.append({"variable": var, "issue": issue, "n": len(id_list), "ids": id_list[:12],
                       "severity": severity, "suggestion": suggestion})
        for i in rows_idx:
            flagged.setdefault(ids[i], set()).add(var)

    cont = [v for v in variables if v["type"] in ("continuous", "count") and v["role"] != "cluster"]
    imputed_value = {}
    for v in variables:
        if v["role"] == "cluster" or v["type"] == "categorical":
            continue
        x = df[v["name"]].astype(float)
        nmiss = int(x.isna().sum())
        if nmiss:
            issues.append({"variable": v["name"], "issue": f"{nmiss} missing value(s) ({100 * nmiss / len(x):.0f}%)",
                           "n": nmiss, "ids": [], "severity": "info",
                           "suggestion": "Analysed as complete cases; never fill in means or medians."})
        xv = x.dropna()
        if xv.empty:
            continue
        lo, hi = v.get("min"), v.get("max")
        out = np.where(((np.isfinite(lo) if lo is not None else False) & (x < lo)) |
                       ((np.isfinite(hi) if hi is not None else False) & (x > hi)))[0] if (lo is not None or hi is not None) else []
        if len(out):
            flag(v["name"], f"Outside the plausible range [{lo}, {hi}]", list(out), "warning",
                 "Check the source record; correct entry errors or set to missing.")
        if v["type"] not in ("continuous", "count") or len(xv) < 20:
            continue
        vc = xv.value_counts()
        top, cnt = vc.index[0], int(vc.iloc[0])
        med = float(xv.median())
        if cnt >= 5 and cnt / len(xv) >= 0.05 and xv.nunique() > 10 and abs(top - med) <= 0.01 * max(abs(med), 1e-9):
            idx = list(np.where(x == top)[0])
            imputed_value[v["name"]] = top
            flag(v["name"], f"{cnt} identical values equal to the median ({top:g}): possible median imputation",
                 idx, "warning", "Confirm against source records; if imputed, set to missing.")
        mad = 1.4826 * float(np.median(np.abs(xv - med)))
        if mad > 0:
            rz = (x - med) / mad
            ext = list(np.where(rz.abs() > 6)[0])
            if ext:
                flag(v["name"], f"Extreme value(s) more than 6 robust SD from the median", ext, "warning",
                     "Verify; a single extreme value can create or hide an association.")
        if (xv == np.round(xv)).mean() > 0.9 and xv.abs().max() >= 20 and len(xv) >= 50:
            share = float(np.isin(np.round(xv).astype(int) % 10, [0, 5]).mean())
            if share > 0.4:
                issues.append({"variable": v["name"], "n": int(len(xv)), "ids": [], "severity": "info",
                               "issue": f"Digit preference: {100 * share:.0f}% of values end in 0 or 5 (expected ~20%)",
                               "suggestion": "Values may be rounded or self-reported; interpret small differences cautiously."})
    if len(imputed_value) >= 2:
        names = list(imputed_value)
        m = np.ones(len(df), bool)
        for nme in names:
            m &= (df[nme].astype(float) == imputed_value[nme]).values
        idx = list(np.where(m)[0])
        if len(idx) >= 3:
            flag(" + ".join(names), f"{len(idx)} records share the median value in {len(names)} variables at once",
                 idx, "warning", "Strong sign of block imputation in the source data.")
    return issues, flagged


# =============================================================================
# 5. Main analysis
# =============================================================================
def run_analysis(sheets, features, meta):
    P = parse_template(sheets)
    if not P["ok"]:
        return {"ok": False, "stage": "template", "errors": P["errors"], "warnings": P["warnings"]}
    if P["mode"] == "plan":
        return _clean({"ok": True, "mode": "plan", "plan_fingerprint": P["plan_fingerprint"], "variables": P["variables"],
                       "exposure_config": P["exposure_config"], "settings": P["settings"], "version": VERSION,
                       "plan_text": _plan_text(P)})
    S = P["settings"]
    alpha, fdr_level = 0.05, float(S["fdr_level"])
    rows = P["rows"]
    feat = {str(f["id"]): f for f in features}
    ids = [r["id"] for r in rows if r["id"] in feat]
    missing_feat = [r["id"] for r in rows if r["id"] not in feat]
    rows = [r for r in rows if r["id"] in feat]
    n = len(rows)
    idx_of = {r["id"]: i for i, r in enumerate(P["rows"])}
    df = pd.DataFrame({v["name"]: [P["values"][v["name"]][idx_of[i]] for i in ids] for v in P["variables"]})
    df["_lat"] = [r["lat"] for r in rows]
    df["_lng"] = [r["lng"] for r in rows]
    df["_ward"] = [feat[i].get("_ward") for i in ids]
    variables = P["variables"]
    outcomes = [v for v in variables if v["role"] == "outcome"]
    covs = [v for v in variables if v["role"] == "covariate"]
    clus = [v for v in variables if v["role"] == "cluster"]
    cluster = df[clus[0]["name"]].values if clus else df["_ward"].values

    # ---------------- data quality
    qc, flagged = audit(df, variables, ids)
    if missing_feat:
        qc.append({"variable": "coordinates", "issue": "No exposures could be computed", "n": len(missing_feat),
                   "ids": missing_feat[:12], "severity": "warning", "suggestion": "Check the coordinates."})
    dup = pd.Series(list(zip(df["_lat"].round(6), df["_lng"].round(6)))).duplicated(keep=False)
    if dup.any():
        qc.append({"variable": "coordinates", "issue": "Identical coordinates shared by several IDs",
                   "n": int(dup.sum()), "ids": [ids[i] for i in np.where(dup)[0]][:12], "severity": "info",
                   "suggestion": "Shared buildings are possible; repeated default locations are not."})

    # ---------------- exposures: transform, screen, contrast
    cfg = P["exposure_config"]
    meta = [m for m in meta if m["key"] in feat[ids[0]]]
    E, screen = {}, []
    D = haversine_matrix(df["_lat"], df["_lng"])
    W = knn_weights(D, 8) if n >= 20 else None
    for m in meta:
        key = m["key"]
        raw = pd.Series([feat[i].get(key) for i in ids], dtype=float)
        c = cfg.get(key, {"include": True, "anchor": False})
        if m["transform"] == "log10":
            x = np.log10(raw.clip(lower=1))
        elif m["transform"] == "log10p1":
            x = np.log10(raw + 1)
        else:
            x = raw
        rec = {"key": key, "label": m["label"], "domain": m["domain"], "source": m["source"],
               "n_distinct": int(raw.nunique()), "missing": int(raw.isna().sum()),
               "cv_pct": float(100 * raw.std() / abs(raw.mean())) if raw.mean() not in (0, np.nan) and raw.notna().sum() > 1 else None,
               "median": float(raw.median()) if raw.notna().any() else None,
               "p25": float(raw.quantile(.25)) if raw.notna().any() else None,
               "p75": float(raw.quantile(.75)) if raw.notna().any() else None,
               "anchor": bool(c.get("anchor")), "status": "tested", "reason": ""}
        top_share = float(raw.value_counts(normalize=True).iloc[0]) if raw.notna().any() else 1.0
        if not c.get("include", True):
            rec["status"], rec["reason"] = "excluded", "Excluded by user"
        elif raw.notna().sum() < 0.8 * n:
            rec["status"], rec["reason"] = "excluded", "More than 20% missing"
        elif rec["n_distinct"] < 2 or top_share > 0.95:
            rec["status"], rec["reason"] = "excluded", f"Constant or near-constant ({100 * top_share:.0f}% share one value)"
        elif m.get("nonNegative") and (raw < 0).any():
            rec["status"], rec["reason"] = "excluded", "Negative values for a non-negative quantity (retrieval noise)"
        if rec["status"] == "tested" and c.get("anchor"):
            rec["status"] = "anchor"
        if rec["status"] in ("tested", "anchor"):
            E[key] = x.values
            if W is not None and np.isfinite(x).all():
                rec["morans_i"], rec["morans_p"] = morans_i(x.values, W)
        if rec["n_distinct"] <= 5 and rec["status"] == "tested":
            rec["warning"] = f"Only {rec['n_distinct']} distinct values: almost no within-sample contrast"
        elif rec["cv_pct"] is not None and rec["cv_pct"] < 5 and rec["status"] == "tested":
            rec["warning"] = "Varies by less than 5% across residences: only very large effects are detectable"
        screen.append(rec)
    kept = []
    for a in [s["key"] for s in screen if s["status"] == "tested"]:
        redundant = None
        for b_ in kept:
            r = stats.spearmanr(E[a], E[b_], nan_policy="omit").statistic
            if abs(r) > 0.95:
                redundant = (b_, r)
                break
        if redundant:
            s = next(s for s in screen if s["key"] == a)
            s["status"], s["reason"] = "excluded", f"Redundant with {redundant[0]} (rho = {redundant[1]:.2f})"
        else:
            kept.append(a)
    tested = kept
    anchors = [s["key"] for s in screen if s["status"] == "anchor"]
    label = {m["key"]: m["label"] for m in meta}
    domain = {m["key"]: m["domain"] for m in meta}
    for key in tested:  # extreme exposure values (a single one can manufacture an association)
        x = pd.Series(E[key])
        med, mad = x.median(), 1.4826 * (x - x.median()).abs().median()
        if mad > 0:
            ext = list(np.where(((x - med) / mad).abs() > 6)[0])
            if ext and len(ext) <= max(3, 0.02 * n):
                qc.append({"variable": label[key], "issue": "Extreme exposure value(s) more than 6 robust SD from the median",
                           "n": len(ext), "ids": [ids[i] for i in ext][:12], "severity": "warning",
                           "suggestion": "Check the coordinates; such points can dominate an association."})
                for i in ext:
                    flagged.setdefault(ids[i], set()).add(label[key])

    # ---------------- design matrices
    cov_map = {}
    for v in covs:
        if v["type"] == "categorical":
            d = pd.get_dummies(df[v["name"]], prefix=v["name"], drop_first=True, dtype=float)
            d[df[v["name"]].isna().values] = np.nan
            cov_map[v["name"]] = [d[c].values for c in d.columns]
        else:
            cov_map[v["name"]] = [df[v["name"]].astype(float).values]

    def cov_cols_for(v):
        names = v.get("covariates") or [c["name"] for c in covs]
        return [col for nme in names for col in cov_map[nme]]

    def cov_names_for(v):
        return v.get("covariates") or [c["name"] for c in covs]
    anchor_cols = [(E[a] - np.nanmean(E[a])) / np.nanstd(E[a], ddof=1) for a in anchors]
    lat_z = (df["_lat"] - df["_lat"].mean()) / df["_lat"].std()
    lng_z = (df["_lng"] - df["_lng"].mean()) / df["_lng"].std()
    trend = np.column_stack([lat_z, lng_z, lat_z ** 2, lng_z ** 2, lat_z * lng_z])
    Z = {k: (E[k] - np.nanmean(E[k])) / np.nanstd(E[k], ddof=1) for k in tested}

    def yvec(v):
        y = df[v["name"]].astype(float).values
        if v["transform"] == "log":
            y = np.where(y > 0, np.log(np.where(y > 0, y, 1)), np.nan)
        return y

    def design(v, xcols, with_anchor=True, extra=None, rowmask=None):
        cols = [np.ones(n)] + list(xcols) + cov_cols_for(v) + (anchor_cols if with_anchor else [])
        if extra is not None:
            cols += list(extra.T) if extra.ndim == 2 else [extra]
        X = np.column_stack(cols)
        if rowmask is not None:
            X = X.copy()
            X[~rowmask] = np.nan
        return X

    # ---------------- EWAS
    ewas = []
    for v in outcomes:
        y = yvec(v)
        fam = FAMILY[v["type"]]
        if fam == "binomial":
            ev = np.nansum(y)
            if min(ev, np.isfinite(y).sum() - ev) < 10 * (2 + len(cov_cols_for(v)) + len(anchors)):
                qc.append({"variable": v["name"], "issue": "Fewer than 10 events per model parameter",
                           "n": int(ev), "ids": [], "severity": "warning",
                           "suggestion": "Logistic estimates may be unstable; reduce covariates or treat as exploratory."})
        for key in tested:
            r = fit_model(y, design(v, [Z[key]]), fam)
            if r is None:
                continue
            est, lo, hi, mde, unit = effect_scale(v["type"], v["transform"], r["coef"][1], r["lo"][1], r["hi"][1], r["se"][1])
            ewas.append({"outcome": v["name"], "exposure": key, "label": label[key], "domain": domain[key],
                         "estimate": est, "lo": lo, "hi": hi, "p": r["p"][1], "n": r["n"], "unit": unit,
                         "mde": mde, "converged": r["converged"], "beta": r["coef"][1], "se": r["se"][1],
                         "prespecified": v.get("primary_exposure") == key})
    E_df = pd.DataFrame(ewas)
    if E_df.empty:
        return {"ok": False, "stage": "analysis", "errors": ["No model could be fitted (too few complete records)."],
                "warnings": P["warnings"]}
    E_df["q_within"] = E_df.groupby("outcome")["p"].transform(lambda s: pd.Series(bh_fdr(s.values), index=s.index))
    E_df["q_all"] = bh_fdr(E_df.p.values)
    pre = E_df[E_df.prespecified]
    if len(pre):
        E_df.loc[pre.index, "p_holm_prespecified"] = holm(pre.p.values)

    # ---------------- same scan without the anchors: which associations depend on them?
    anchor_dependent = []
    if anchors:
        for v in outcomes:
            y = yvec(v)
            for key in tested:
                r = fit_model(y, design(v, [Z[key]], with_anchor=False), FAMILY[v["type"]])
                if r is None:
                    continue
                prim = E_df[(E_df.outcome == v["name"]) & (E_df.exposure == key)].iloc[0]
                if r["p"][1] < alpha and prim.p >= alpha:
                    est, lo, hi, _, unit = effect_scale(v["type"], v["transform"], r["coef"][1], r["lo"][1], r["hi"][1], r["se"][1])
                    anchor_dependent.append({"outcome": v["name"], "exposure": key, "label": label[key],
                                             "estimate_without_anchor": est, "p_without_anchor": r["p"][1],
                                             "estimate_with_anchor": prim.estimate, "p_with_anchor": prim.p, "unit": unit})

    # ---------------- robustness of every nominal association
    hits = E_df[E_df.p < alpha].sort_values("p").head(int(S["max_robustness"]))
    robust = []
    for _, h in hits.iterrows():
        v = next(o for o in outcomes if o["name"] == h.outcome)
        y, fam, x = yvec(v), FAMILY[v["type"]], Z[h.exposure]
        nul = null_value(v["type"], v["transform"])
        checks = []

        def add(name, r):
            if r is None:
                return
            est, lo, hi, _, _ = effect_scale(v["type"], v["transform"], r["coef"][1], r["lo"][1], r["hi"][1], r["se"][1])
            checks.append({"check": name, "estimate": est, "lo": lo, "hi": hi, "p": r["p"][1], "n": r["n"],
                           "excludes_null": bool(lo > nul or hi < nul)})
        add("Primary model", fit_model(y, design(v, [x]), fam))
        add("Spatial trend surface (quadratic latitude/longitude)", fit_model(y, design(v, [x], extra=trend), fam))
        if pd.Series(cluster).nunique() >= 10:
            add(f"Standard errors clustered by area ({pd.Series(cluster).nunique()} clusters)",
                fit_model(y, design(v, [x]), fam, clusters=cluster))
        if anchors:
            add("Without anchor adjustment", fit_model(y, design(v, [x], with_anchor=False), fam))
        relevant = {h.outcome, label[h.exposure]} | set(cov_names_for(v))
        keep = np.array([not (flagged.get(i, set()) & relevant or
                              any(h.outcome in f or label[h.exposure] in f for f in flagged.get(i, set())))
                         for i in ids])
        if (~keep).any():
            add(f"Excluding records flagged by the data-quality audit for these variables ({int((~keep).sum())})",
                fit_model(y, design(v, [x], rowmask=keep), fam))
        Xp = design(v, [x])
        base = fit_model(y, Xp, fam)
        loo = []
        for i in np.where(base["mask"])[0]:
            m_ = np.ones(n, bool)
            m_[i] = False
            r = fit_model(y, design(v, [x], rowmask=m_), fam)
            if r is not None:
                loo.append((r["coef"][1], r["p"][1], ids[i]))
        loo_b = np.array([a for a, _, _ in loo])
        j = int(np.argmax(np.abs(loo_b - base["coef"][1]))) if len(loo_b) else None
        worst_p = max(p for _, p, _ in loo) if loo else None
        sp = next((c for c in checks if c["check"].startswith("Spatial")), None)
        verdict = []
        if sp and not sp["excludes_null"]:
            verdict.append("spatial gradient")
        if worst_p is not None and worst_p >= alpha:
            verdict.append(f"depends on a single record (ID {loo[j][2]})")
        qcck = next((c for c in checks if c["check"].startswith("Excluding records")), None)
        if qcck and not qcck["excludes_null"]:
            verdict.append("sensitive to data-quality flags")
        clck = next((c for c in checks if c["check"].startswith("Standard errors clustered")), None)
        if clck and not clck["excludes_null"]:
            verdict.append("area clustering")
        robust.append({"outcome": h.outcome, "exposure": h.exposure, "label": h.label, "unit": h.unit,
                       "q_within": h.q_within, "checks": checks,
                       "loo_most_influential_id": loo[j][2] if j is not None else None,
                       "loo_worst_p": worst_p,
                       "verdict": "robust to all checks" if not verdict else "not robust: " + "; ".join(verdict)})

    # ---------------- residual spatial autocorrelation
    moran_resid = []
    if W is not None:
        for v in outcomes:
            r = fit_model(yvec(v), design(v, []), FAMILY[v["type"]])
            if r is None:
                continue
            m_ = r["mask"]
            Wm = knn_weights(D[np.ix_(m_, m_)], 8)
            I, p = morans_i(r["resid"], Wm)
            moran_resid.append({"outcome": v["name"], "morans_i": I, "p": p, "n": int(m_.sum())})

    # ---------------- ward-level aggregates for maps (privacy: cells with < MIN_CELL people are suppressed here,
    # so no small-area value ever leaves the engine, the Excel file or the report)
    MIN_CELL = 5
    wards = pd.Series(df["_ward"].values, dtype=object)

    def ward_table(values):
        s_ = pd.DataFrame({"ward": wards.values, "v": np.asarray(values, float)}).dropna()
        out = {}
        for w, g in s_.groupby("ward"):
            out[str(w)] = ({"n": int(len(g)), "mean": float(g.v.mean())} if len(g) >= MIN_CELL
                           else {"n": None, "mean": None, "suppressed": True})
        return out

    wc = wards.dropna().value_counts()
    maps = {"min_cell": MIN_CELL, "participants": {str(w): (int(c) if c >= MIN_CELL else None) for w, c in wc.items()},
            "n_wards": int(len(wc)), "n_wards_suppressed": int((wc < MIN_CELL).sum()), "residuals": [], "gradient_pairs": []}
    resid_by_outcome = {}
    for v in outcomes:
        r = fit_model(yvec(v), design(v, []), FAMILY[v["type"]])
        if r is None:
            continue
        rf = np.full(n, np.nan)
        rf[r["mask"]] = r["resid"]
        if v["type"] == "continuous" and v["transform"] == "log":
            vals, unit = 100 * (np.exp(rf) - 1), "% above (+) or below (−) model expectation"
        elif v["type"] == "continuous":
            vals, unit = rf, f"observed − expected ({v.get('unit') or 'outcome units'})"
        else:
            vals, unit = rf, "observed − expected " + ("probability" if v["type"] == "binary" else "count")
        resid_by_outcome[v["name"]] = (vals, unit)
        maps["residuals"].append({"outcome": v["name"], "unit": unit, "wards": ward_table(vals)})
    for rb in robust:
        if "spatial gradient" in rb["verdict"] and rb["outcome"] in resid_by_outcome:
            maps["gradient_pairs"].append({
                "outcome": rb["outcome"], "exposure": rb["exposure"], "label": rb["label"],
                "outcome_unit": resid_by_outcome[rb["outcome"]][1],
                "outcome_wards": ward_table(resid_by_outcome[rb["outcome"]][0]),
                "exposure_wards": ward_table(Z[rb["exposure"]])})

    # ---------------- domains
    domains = []
    dom_keys = {}
    for k in tested:
        dom_keys.setdefault(domain[k], []).append(k)
    for v in outcomes:
        y, fam = yvec(v), FAMILY[v["type"]]
        for dname, keys in dom_keys.items():
            r = fit_model(y, design(v, [Z[k] for k in keys]), fam)
            if r is None:
                continue
            idx = list(range(1, 1 + len(keys)))
            b, Vb = r["coef"][idx], r["V"][np.ix_(idx, idx)]
            W_ = float(b @ np.linalg.pinv(Vb) @ b)
            domains.append({"outcome": v["name"], "domain": dname, "n_exposures": len(keys),
                            "wald_chi2": W_, "p": float(stats.chi2.sf(W_, len(keys)))})
    if domains:
        Ddf = pd.DataFrame(domains)
        Ddf["q"] = Ddf.groupby("outcome")["p"].transform(lambda s: pd.Series(bh_fdr(s.values), index=s.index))
        domains = Ddf.to_dict("records")

    # ---------------- profiles (PCA + parallel analysis + varimax)
    profiles = None
    if S["run_profiles"] and len(tested) >= 5:
        profiles = _profiles(Z, tested, label, outcomes, yvec, design, n)

    # ---------------- stability selection (continuous outcomes)
    stability = []
    if S["run_stability"] and len(tested) >= 3:
        stability = _stability(Z, tested, label, outcomes, yvec, cov_cols_for, anchor_cols, n)

    # ---------------- dose-response (restricted cubic splines) for the strongest nominal associations
    dose = []
    for _, h in hits.head(5).iterrows():
        v = next(o for o in outcomes if o["name"] == h.outcome)
        x = E[h.exposure].astype(float)
        fin = np.isfinite(x)
        if np.unique(x[fin]).size < 8:
            continue
        kn = np.percentile(x[fin], [10, 50, 90])
        if len(np.unique(kn)) < 3:
            continue
        Bx = rcs_basis(x, kn)
        r = fit_model(yvec(v), design(v, list(Bx.T)), FAMILY[v["type"]])
        if r is None:
            continue
        b, V = r["coef"][1:3], r["V"][1:3, 1:3]
        p_nl = float(2 * stats.norm.sf(abs(b[1] / np.sqrt(V[1, 1])))) if V[1, 1] > 0 else None
        p_all = float(stats.chi2.sf(float(b @ np.linalg.pinv(V) @ b), 2))
        grid = np.linspace(np.percentile(x[fin], 5), np.percentile(x[fin], 95), 40)
        Dm = rcs_basis(grid, kn) - rcs_basis(np.array([np.median(x[fin])]), kn)
        est = Dm @ b
        se = np.sqrt(np.clip(np.einsum("ij,jk,ik->i", Dm, V, Dm), 0, None))
        tr = next(m["transform"] for m in meta if m["key"] == h.exposure)
        xs = 10 ** grid - (1 if tr == "log10p1" else 0) if tr in ("log10", "log10p1") else grid
        curve = []
        for xi, e_, s_ in zip(xs, est, se):
            ce, cl, ch, _, unit = effect_scale(v["type"], v["transform"], e_, e_ - 1.96 * s_, e_ + 1.96 * s_, s_)
            curve.append({"x": float(xi), "estimate": ce, "lo": cl, "hi": ch})
        dose.append({"outcome": h.outcome, "exposure": h.exposure, "label": h.label, "p_nonlinear": p_nl,
                     "p_overall": p_all, "unit": unit.replace(" per 1-SD", " vs median exposure"), "curve": curve,
                     "log_x": tr in ("log10", "log10p1")})

    # ---------------- analysis dataset, app estimates and R script for independent re-analysis
    ds_cols = ["id", "lat", "lng", "area"] + [v["name"] for v in variables if v["role"] in ("outcome", "covariate")] \
        + anchors + tested
    ds_rows = []
    for i in range(n):
        row = [ids[i], float(df["_lat"].iloc[i]), float(df["_lng"].iloc[i]), cluster[i]]
        row += [df[v["name"]].iloc[i] for v in variables if v["role"] in ("outcome", "covariate")]
        row += [E[a][i] for a in anchors] + [E[k][i] for k in tested]
        ds_rows.append(row)
    app_est = E_df[["outcome", "exposure", "beta", "se", "p", "n"]].to_dict("records")
    r_script = _r_script(outcomes, covs, tested, anchors, cov_names_for)

    # ---------------- summary
    n_tests = len(E_df)
    n_nom = int((E_df.p < alpha).sum())
    n_fdr = int((E_df.q_within < fdr_level).sum())
    summary = {
        "n_participants": n, "n_outcomes": len(outcomes), "n_exposures_tested": len(tested),
        "anchors": [label[a] for a in anchors], "n_tests": n_tests, "n_nominal": n_nom,
        "expected_by_chance": alpha * n_tests, "n_fdr_within": n_fdr,
        "n_fdr_all": int((E_df.q_all < fdr_level).sum()),
        "n_robust": sum(1 for r in robust if r["verdict"].startswith("robust")),
        "fdr_level": fdr_level, "plan_fingerprint": P["plan_fingerprint"],
        "low_contrast_exposures": [s["label"] for s in screen if s.get("warning")],
        "n_qc_warnings": sum(1 for q in qc if q["severity"] == "warning"),
        "flow": P["flow"],
        "small_sample": n < 50,
    }
    summary["headline"] = _headline(summary, robust, anchor_dependent)
    res = {"ok": True, "version": VERSION, "summary": summary, "qc": qc, "parse_warnings": P["warnings"],
           "screening": screen, "ewas": E_df.drop(columns=[]).to_dict("records"), "robustness": robust,
           "anchor_dependent": anchor_dependent, "moran_residuals": moran_resid, "domains": domains,
           "profiles": profiles, "stability": stability, "dose_response": dose, "maps": maps, "settings": S, "variables": variables,
           "analysis_dataset": {"columns": ds_cols, "rows": ds_rows}, "app_estimates": app_est, "r_script": r_script}
    res["methods_text"] = _methods_text(res)
    return _clean(res)


def _profiles(Z, tested, label, outcomes, yvec, design, n):
    X = np.column_stack([Z[k] for k in tested])
    ok = np.isfinite(X).all(1)
    Xo = X[ok]
    C = np.corrcoef(Xo.T)
    ev, evec = np.linalg.eigh(C)
    o = np.argsort(ev)[::-1]
    ev, evec = ev[o], evec[:, o]
    rng = np.random.default_rng(2026)
    sims = np.array([np.sort(np.linalg.eigvalsh(np.corrcoef(rng.standard_normal(Xo.shape).T)))[::-1] for _ in range(200)])
    pa = np.percentile(sims, 95, axis=0)
    k = int(np.argmax(ev < pa)) if (ev < pa).any() else len(ev)
    k = max(1, min(k, 8))
    L = evec[:, :k] * np.sqrt(ev[:k])
    if k > 1:
        L = _varimax(L)
    for j in range(k):
        if L[np.argmax(np.abs(L[:, j])), j] < 0:
            L[:, j] *= -1
    scores = np.full((n, k), np.nan)
    sc = Xo @ np.linalg.pinv(C) @ L
    scores[ok] = (sc - sc.mean(0)) / sc.std(0, ddof=1)
    names = []
    for j in range(k):
        top = np.argsort(-np.abs(L[:, j]))[:3]
        names.append(f"Profile {j + 1}: " + ", ".join(f"{label[tested[t]]} ({'+' if L[t, j] > 0 else '−'})" for t in top))
    assoc = []
    for v in outcomes:
        r = fit_model(yvec(v), design(v, list(scores.T)), FAMILY[v["type"]])
        if r is None:
            continue
        for j in range(k):
            est, lo, hi, _, unit = effect_scale(v["type"], v["transform"], r["coef"][1 + j], r["lo"][1 + j], r["hi"][1 + j], r["se"][1 + j])
            assoc.append({"outcome": v["name"], "profile": names[j], "estimate": est, "lo": lo, "hi": hi,
                          "p": r["p"][1 + j], "unit": unit})
    if assoc:
        A = pd.DataFrame(assoc)
        A["q"] = A.groupby("outcome")["p"].transform(lambda s: pd.Series(bh_fdr(s.values), index=s.index))
        assoc = A.to_dict("records")
    return {"n_profiles": k, "variance_explained_pct": float(100 * ev[:k].sum() / len(ev)), "names": names,
            "loadings": {label[t]: {names[j]: float(L[i, j]) for j in range(k)} for i, t in enumerate(tested)},
            "associations": assoc}


def _varimax(L, q=100, tol=1e-8):
    p, k = L.shape
    R = np.eye(k)
    d = 0
    for _ in range(q):
        d_old = d
        Lam = L @ R
        u, s, vh = np.linalg.svd(L.T @ (Lam ** 3 - (1 / p) * Lam @ np.diag(np.diag(Lam.T @ Lam))))
        R = u @ vh
        d = s.sum()
        if d_old and d / d_old < 1 + tol:
            break
    return L @ R


def _stability(Z, tested, label, outcomes, yvec, cov_cols_for, anchor_cols, n, B=200):
    from sklearn.linear_model import ElasticNet, ElasticNetCV
    out = []
    X = np.column_stack([Z[k] for k in tested])
    for v in outcomes:
        if v["type"] != "continuous":
            continue
        C = np.column_stack([np.ones(n)] + cov_cols_for(v) + anchor_cols)
        y = yvec(v)
        ok = np.isfinite(y) & np.isfinite(X).all(1) & np.isfinite(C).all(1)
        if ok.sum() < 30:
            continue
        Co = C[ok]
        res = lambda a: a - Co @ np.linalg.lstsq(Co, a, rcond=None)[0]
        yr = res(y[ok])
        Xr = np.column_stack([res(X[ok, j]) for j in range(X.shape[1])])
        Xr = (Xr - Xr.mean(0)) / Xr.std(0)
        alpha_ = ElasticNetCV(l1_ratio=0.5, cv=5, n_alphas=40, random_state=1, max_iter=5000).fit(Xr, yr).alpha_
        rng = np.random.default_rng(7)
        sel = np.zeros(X.shape[1])
        sign = np.zeros(X.shape[1])
        m = len(yr)
        for _ in range(B):
            i = rng.choice(m, m, replace=True)
            c = ElasticNet(alpha=alpha_, l1_ratio=0.5, max_iter=5000).fit(Xr[i], yr[i]).coef_
            sel += c != 0
            sign += np.sign(c)
        for j, k in enumerate(tested):
            out.append({"outcome": v["name"], "exposure": k, "label": label[k], "selection_freq": sel[j] / B,
                        "direction": "+" if sign[j] > 0 else ("−" if sign[j] < 0 else "0"),
                        "stable": bool(sel[j] / B >= 0.6)})
    return out


def _headline(s, robust, anchor_dep):
    msg = []
    if s.get("small_sample"):
        msg.append(f"Only {s['n_participants']} participants: power is low and estimates are imprecise.")
    msg += [f"{s['n_nominal']} of {s['n_tests']} exposure–outcome tests had p < 0.05; "
           f"about {s['expected_by_chance']:.1f} would be expected by chance alone."]
    if s["n_fdr_within"] == 0:
        msg.append(f"None passed the false-discovery-rate threshold (q < {s['fdr_level']}).")
    else:
        msg.append(f"{s['n_fdr_within']} passed the false-discovery-rate threshold (q < {s['fdr_level']}).")
    nr = s["n_robust"]
    msg.append(f"{nr} of {len(robust)} nominal associations were robust to every check." if robust else "")
    if anchor_dep:
        msg.append(f"{len(anchor_dep)} association(s) appeared only when the anchor exposure(s) were ignored.")
    if s["low_contrast_exposures"]:
        msg.append(f"{len(s['low_contrast_exposures'])} exposure(s) varied too little across residences to detect "
                   "realistic effects (see the contrast table).")
    return " ".join(m for m in msg if m)


def _methods_text(r):
    s = r["summary"]
    outs = ", ".join(f"{v['name']} ({v['type']}{', log-transformed' if v['transform'] == 'log' else ''})"
                     for v in r["variables"] if v["role"] == "outcome")
    covs = ", ".join(v["name"] for v in r["variables"] if v["role"] == "covariate") or "none"
    anch = (", and for " + ", ".join(s["anchors"])) if s["anchors"] else ""
    fl = s.get("flow", {})
    excl = (f" Of {fl.get('rows_in_sheet')} records, {fl.get('n_excluded', 0)} were excluded by the investigators and "
            f"{fl.get('skipped_invalid', 0)} lacked a valid ID or coordinates." if fl else "")
    return (
        f"Residential exposures were derived for {s['n_participants']} participants with the BREATH-HCMC application "
        f"(analysis module v{VERSION}; plan fingerprint {s['plan_fingerprint']}).{excl} Exposures that were constant or "
        "near-constant, mostly missing, physically implausible or redundant (|Spearman rho| > 0.95) were excluded "
        f"before outcome analysis, leaving {s['n_exposures_tested']}. Counts used a uniform 1-km buffer and distances "
        "were log10-transformed. Outcomes were " + outs + ". Each exposure (per 1-SD) was entered separately in "
        "linear, logistic or Poisson regression, as appropriate, with heteroskedasticity-robust standard errors (HC3 for "
        f"linear models), adjusted for {covs}{anch} unless an outcome-specific covariate set was declared. The Benjamini–Hochberg false discovery rate was controlled within "
        "each outcome and across all tests, and the number of associations with p < 0.05 was compared with the number "
        "expected by chance. Every nominal association was re-estimated with a quadratic latitude–longitude trend "
        "surface, area-clustered standard errors, exclusion of records flagged by the data-quality audit and "
        "leave-one-out deletion. Minimal detectable effects were computed as 2.8 standard errors (80% power, two-sided "
        "alpha 0.05). Exposure domains were tested jointly with Wald tests, exposure profiles were derived by principal "
        "component analysis with parallel analysis and varimax rotation, and elastic-net stability selection (200 "
        "bootstrap resamples, 60% threshold) was applied to continuous outcomes. Residual spatial autocorrelation was "
        "assessed with Moran's I (8 nearest neighbours), and restricted cubic splines (knots at the 10th, 50th and 90th "
        "percentiles) examined the shape of the strongest associations."
    )


def rcs_basis(x, knots):
    """Restricted cubic spline basis (Harrell), 3 knots -> linear term + 1 non-linear term."""
    x = np.asarray(x, float)
    k = np.asarray(knots, float)
    K = len(k)
    tp = lambda u: np.where(u > 0, u, 0) ** 3
    cols = [x]
    for j in range(K - 2):
        cols.append((tp(x - k[j]) - tp(x - k[K - 2]) * (k[K - 1] - k[j]) / (k[K - 1] - k[K - 2])
                     + tp(x - k[K - 1]) * (k[K - 2] - k[j]) / (k[K - 1] - k[K - 2])) / (k[K - 1] - k[0]) ** 2)
    return np.column_stack(cols)


def _plan_text(P):
    outs = [v for v in P["variables"] if v["role"] == "outcome"]
    covs = [v["name"] for v in P["variables"] if v["role"] == "covariate"]
    pre = [f"{v['name']} ~ {v['primary_exposure']}" for v in outs if v.get("primary_exposure")]
    anchors = [k for k, c in P["exposure_config"].items() if c.get("anchor")]
    dropped = [k for k, c in P["exposure_config"].items() if not c.get("include", True)]
    lines = [
        f"BREATH-HCMC analysis plan (engine v{VERSION}); plan fingerprint {P['plan_fingerprint']}.",
        "Outcomes: " + "; ".join(f"{v['name']} ({v['type']}, transform {v['transform']}"
                                 + (f", adjusted for {', '.join(v['covariates'])}" if v.get("covariates") else "") + ")"
                                 for v in outs) + ".",
        "Covariates (default for every outcome): " + (", ".join(covs) or "none") + ".",
        "Pre-specified primary hypotheses: " + ("; ".join(pre) if pre else "none (all analyses exploratory)") + ".",
        "Anchor exposures (adjusted for, not tested): " + (", ".join(anchors) or "none") + ".",
        "Exposures excluded by the investigators: " + (", ".join(dropped) or "none") + ".",
        f"False discovery rate threshold: {P['settings']['fdr_level']}.",
        "Register this text and fingerprint (e.g. on OSF) before uploading outcome data; uploading the same plan with "
        "data reproduces the same fingerprint.",
    ]
    return "\n".join(lines)


def _r_script(outcomes, covs, tested, anchors, cov_names_for):
    q = lambda v: '"' + str(v).replace('"', '\\"') + '"'
    rv = lambda xs: "c(" + ", ".join(q(x) for x in xs) + ")"
    cat_covs = [c["name"] for c in covs if c["type"] == "categorical"]
    outs = ",\n  ".join(
        f"list(name = {q(v['name'])}, type = {q(v['type'])}, transform = {q(v['transform'])}, covs = {rv(cov_names_for(v))})"
        for v in outcomes)
    return f"""# BREATH-HCMC — independent re-analysis in R of the app's exposome-wide models
# Files (from the app): BREATH_analysis_dataset.csv, BREATH_app_estimates.csv
# install.packages("sandwich")
library(sandwich)
d   <- read.csv("BREATH_analysis_dataset.csv", check.names = FALSE, stringsAsFactors = FALSE)
app <- read.csv("BREATH_app_estimates.csv", check.names = FALSE, stringsAsFactors = FALSE)
std <- function(x) (x - mean(x, na.rm = TRUE)) / sd(x, na.rm = TRUE)
categorical <- {rv(cat_covs)}
for (v in categorical) d[[v]] <- factor(d[[v]])
anchors   <- {rv(anchors)}
exposures <- {rv(tested)}
outcomes  <- list(
  {outs}
)
rows <- list()
for (o in outcomes) {{
  y <- d[[o$name]]
  if (o$transform == "log") y <- ifelse(y > 0, log(y), NA)
  fam <- switch(o$type, continuous = gaussian(), binary = binomial(), count = poisson())
  for (e in exposures) {{
    df <- data.frame(y = y, x = std(d[[e]]), d[, o$covs, drop = FALSE], check.names = FALSE)
    for (a in anchors) df[[paste0("anchor_", a)]] <- std(d[[a]])
    m <- glm(y ~ ., data = df, family = fam)
    V <- if (o$type == "continuous") vcovHC(m, type = "HC3") else vcovHC(m, type = "HC1")
    rows[[length(rows) + 1]] <- data.frame(outcome = o$name, exposure = e, beta_R = unname(coef(m)["x"]),
                                           se_R = sqrt(V["x", "x"]), n_R = nobs(m))
  }}
}}
r   <- do.call(rbind, rows)
cmp <- merge(r, app, by = c("outcome", "exposure"))
cat("Models compared:", nrow(cmp), "\n")
cat("Max |beta(R) - beta(app)|:", signif(max(abs(cmp$beta_R - cmp$beta)), 3), "\n")
cat("Max |SE(R) - SE(app)|:   ", signif(max(abs(cmp$se_R - cmp$se)), 3), "\n")
cat("Sample sizes identical:  ", all(cmp$n_R == cmp$n), "\n")
write.csv(cmp, "BREATH_R_vs_app.csv", row.names = FALSE)
"""


# =============================================================================
# Entry points
# =============================================================================
def api_parse(sheets_json):
    return json.dumps(parse_template(json.loads(sheets_json)))


def api_run(payload_json):
    p = json.loads(payload_json)
    try:
        return json.dumps(run_analysis(p["sheets"], p["features"], p["meta"]))
    except Exception as e:  # report instead of crashing the worker
        import traceback
        return json.dumps({"ok": False, "stage": "analysis", "errors": [f"{type(e).__name__}: {e}"],
                           "traceback": traceback.format_exc()})


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    payload = json.load(open(sys.argv[1], encoding="utf-8"))
    out = run_analysis(payload["sheets"], payload["features"], payload["meta"])
    dest = sys.argv[2] if len(sys.argv) > 2 else "results.json"
    json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(out.get("summary", {}).get("headline", out))
