"""Independent re-implementation of the app's exposure computations (WGS84 ellipsoid geometry,
own grid indexing) and agreement with the app's values at 155 residences + 1,000 random points."""
import json
import os
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
os.chdir(HERE)

A = json.load(open("app_features.json"))
SRC = pd.DataFrame(json.load(open("sources.json")))
ROADS = json.load(open("roads.json"))
GR = json.load(open(os.path.join(ROOT, "public", "data", "grids.json")))
PM = json.load(open(os.path.join(ROOT, "public", "data", "pm25.json")))
NDVI, EVI = json.load(open("ndvi.json")), json.load(open("evi.json"))
a_, f_ = 6378137.0, 1 / 298.257223563
b_ = a_ * (1 - f_)
e2 = f_ * (2 - f_)


def vincenty(lat1, lon1, lat2, lon2):
    """Inverse geodesic distance on WGS84 (Vincenty 1975), vectorised over lat2/lon2."""
    L = np.radians(lon2 - lon1)
    U1 = np.arctan((1 - f_) * np.tan(np.radians(lat1)))
    U2 = np.arctan((1 - f_) * np.tan(np.radians(lat2)))
    sU1, cU1, sU2, cU2 = np.sin(U1), np.cos(U1), np.sin(U2), np.cos(U2)
    lam = L.copy()
    for _ in range(200):
        sl, cl = np.sin(lam), np.cos(lam)
        ss = np.sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2)
        cs = sU1 * sU2 + cU1 * cU2 * cl
        sig = np.arctan2(ss, cs)
        sa = np.where(ss == 0, 0, cU1 * cU2 * sl / np.where(ss == 0, 1, ss))
        c2a = 1 - sa ** 2
        c2sm = np.where(c2a == 0, 0, cs - 2 * sU1 * sU2 / np.where(c2a == 0, 1, c2a))
        C = f_ / 16 * c2a * (4 + f_ * (4 - 3 * c2a))
        lam_new = L + (1 - C) * f_ * sa * (sig + C * ss * (c2sm + C * cs * (-1 + 2 * c2sm ** 2)))
        if np.max(np.abs(lam_new - lam)) < 1e-12:
            lam = lam_new
            break
        lam = lam_new
    u2 = c2a * (a_ ** 2 - b_ ** 2) / b_ ** 2
    Acoef = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)))
    Bcoef = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)))
    ds = Bcoef * ss * (c2sm + Bcoef / 4 * (cs * (-1 + 2 * c2sm ** 2) - Bcoef / 6 * c2sm * (-3 + 4 * ss ** 2) * (-3 + 4 * c2sm ** 2)))
    return b_ * Acoef * (sig - ds)


def enu(lat0, lon0, lat, lon):
    """Local east/north metres on the WGS84 ellipsoid around (lat0, lon0)."""
    p = np.radians(lat0)
    M = a_ * (1 - e2) / (1 - e2 * np.sin(p) ** 2) ** 1.5
    N = a_ / np.sqrt(1 - e2 * np.sin(p) ** 2)
    return np.radians(np.asarray(lon) - lon0) * N * np.cos(p), np.radians(np.asarray(lat) - lat0) * M


ROAD_SEGS = []
for name, r in ROADS.items():
    pts = [np.array(s, float) for s in r["segs"] if len(s) >= 2]
    ROAD_SEGS.append((name, r["halfWidth"], pts))


def road_metrics(lat, lon):
    ds = []
    for _, hw, segs in ROAD_SEGS:
        m = np.inf
        for s in segs:
            x, y = enu(lat, lon, s[:, 0], s[:, 1])
            ax, ay, bx, by = x[:-1], y[:-1], x[1:], y[1:]
            dx, dy = bx - ax, by - ay
            ls = dx * dx + dy * dy
            t = np.clip(np.where(ls > 0, -(ax * dx + ay * dy) / np.where(ls > 0, ls, 1), 0), 0, 1)
            d = np.hypot(ax + t * dx, ay + t * dy)
            m = min(m, d.min())
        ds.append(max(0.0, m - hw))
    ds = np.array(ds)
    return {"road_kernel": float(np.exp(-ds / 100).sum()), "road_mindist": float(ds.min()), "road_n200": int((ds <= 200).sum())}


def grid_edges(centres):
    c = np.asarray(centres, float)
    return c


def nearest_by_edges(centres, v):
    """Cell whose Voronoi interval (midpoints between centres) contains v — a different algorithm from argmin."""
    c = np.asarray(centres, float)
    order = np.argsort(c)
    cs = c[order]
    mids = (cs[1:] + cs[:-1]) / 2
    k = np.searchsorted(mids, v)
    return order[min(k, len(c) - 1)]


def grid_value(g, lat, lon, latkey="lats", lonkey="lons"):
    i = nearest_by_edges(g[latkey], lat)
    j = nearest_by_edges(g[lonkey], lon)
    return g["grid"][i][j]


def pm25(lat, lon):
    i = int(np.floor((lat - (PM["lat0"] - PM["dLat"] / 2)) / PM["dLat"]))
    j = int(np.floor((lon - (PM["lon0"] - PM["dLon"] / 2)) / PM["dLon"]))
    v = PM["values"][i * PM["nLon"] + j]
    return None if v is None else round(v + 1e-9, 1)


CAT_COUNT = {"park": "park", "industrial": "industrial", "fuel": "fuel", "market": "market", "hospital": "hospital",
             "clinic": "clinic", "school": "school"}
CAT_DIST = ["forest", "butcher", "publicinfra", "wastewater", "landfill", "farm", "recreation", "veterinary"]
GRID_KEYS = ["no2", "co", "so2", "o3", "lst", "nightlights", "builtup", "water", "population", "elevation", "treecover", "forestloss"]


def independent(p):
    lat, lon = p["lat"], p["lng"]
    out = {}
    d = vincenty(lat, lon, SRC.lat.values, SRC.lng.values)
    for c in CAT_COUNT:
        out[f"{c}_n1km"] = int(((SRC.cat.values == c) & (d <= 1000)).sum())
    for c in CAT_DIST:
        m = SRC.cat.values == c
        out[f"{c}_dist"] = float(d[m].min()) if m.any() else None
    for k in GRID_KEYS:
        out[k] = grid_value(GR[k], lat, lon)
    out["ndvi"] = grid_value(NDVI, lat, lon, "lats", "lngs")
    out["evi"] = grid_value(EVI, lat, lon, "lats", "lngs")
    out["pm25"] = pm25(lat, lon)
    out.update(road_metrics(lat, lon))
    return out


if __name__ == "__main__":
    import time
    rows = []
    t0 = time.time()
    pts = [("residence", p) for p in A["residences"]] + [("random", p) for p in A["random"]]
    for kind, p in pts:
        ind = independent(p)
        for k, v in ind.items():
            rows.append({"set": kind, "id": p["id"], "feature": k, "app": p.get(k), "independent": v})
    df = pd.DataFrame(rows)
    df.to_csv("agreement_long.csv", index=False)
    print("points", len(pts), "seconds", round(time.time() - t0, 1))
