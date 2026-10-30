"""Convergent validity: pairs of exposures from independent sensors/producers whose direction of association is
known in advance (urban form, vegetation, heat, activity). Computed on the 1,000 random points (not on residences),
with 95% CIs from a spatial block bootstrap (0.01-degree blocks, ~1.1 km) to respect spatial autocorrelation."""
import json
import os
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

os.chdir(os.path.dirname(os.path.abspath(__file__)))
A = json.load(open("app_features.json"))
R = pd.DataFrame(A["random"])
R["poi_density"] = R[["clinic_n1km", "school_n1km", "market_n1km", "fuel_n1km", "hospital_n1km"]].sum(axis=1)
PAIRS = [  # (x, y, expected sign, rationale)
    ("builtup", "population", +1, "GHSL (Sentinel-2/Landsat) vs WorldPop (census + covariates)"),
    ("builtup", "nightlights", +1, "GHSL vs VIIRS DNB"),
    ("builtup", "ndvi", -1, "GHSL vs MODIS vegetation"),
    ("builtup", "lst", +1, "GHSL vs MODIS land surface temperature (urban heat island)"),
    ("ndvi", "lst", -1, "MODIS vegetation vs MODIS land surface temperature (evaporative cooling)"),
    ("population", "nightlights", +1, "WorldPop vs VIIRS DNB"),
    ("poi_density", "population", +1, "OpenStreetMap services vs WorldPop"),
    ("poi_density", "builtup", +1, "OpenStreetMap services vs GHSL"),
    ("road_kernel", "builtup", +1, "OpenStreetMap roads vs GHSL"),
    ("road_kernel", "nightlights", +1, "OpenStreetMap roads vs VIIRS DNB"),
    ("no2", "builtup", +1, "Sentinel-5P NO2 vs GHSL"),
]
LABEL = {"builtup": "Built-up surface", "population": "Population density", "nightlights": "Night-time light", "ndvi": "NDVI",
         "lst": "Land surface temperature", "poi_density": "OSM service density (1 km)", "road_kernel": "Road kernel index",
         "no2": "NO2 column index"}
block = (np.floor(R.lat / 0.01).astype(int).astype(str) + "_" + np.floor(R.lng / 0.01).astype(int).astype(str)).values
blocks = pd.unique(block)
idx_by_block = {b: np.where(block == b)[0] for b in blocks}
rng = np.random.default_rng(2026)
rows = []
for x, y, sign, why in PAIRS:
    d = R[[x, y]].astype(float)
    ok = d.notna().all(axis=1).values
    rho = spearmanr(d[x][ok], d[y][ok]).statistic
    boots = []
    for _ in range(1000):
        pick = rng.choice(blocks, len(blocks), replace=True)
        ii = np.concatenate([idx_by_block[b] for b in pick])
        ii = ii[ok[ii]]
        boots.append(spearmanr(d[x].values[ii], d[y].values[ii]).statistic)
    lo, hi = np.percentile(boots, [2.5, 97.5])
    agrees = (np.sign(rho) == sign) and (lo * sign > 0)
    rows.append({"Exposure 1": LABEL[x], "Exposure 2": LABEL[y], "Independent sources": why, "Expected sign": "+" if sign > 0 else "−",
                 "Spearman rho": round(rho, 2), "95% CI low": round(lo, 2), "95% CI high": round(hi, 2), "n points": int(ok.sum()),
                 "Consistent with expectation": "yes" if agrees else ("direction only" if np.sign(rho) == sign else "no")})
T = pd.DataFrame(rows)
T.to_csv("convergent_validity.csv", index=False)
pd.set_option("display.width", 220)
print(T.drop(columns=["Independent sources"]).to_string(index=False))
print("blocks", len(blocks))
