import json, numpy as np, pandas as pd, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 7.5, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.linewidth": 0.6, "xtick.major.width": 0.6, "ytick.major.width": 0.6, "pdf.fonttype": 42})
DOM = {"Ambient air quality": "#D55E00", "Greenness & blue space": "#009E73", "Urban form, density & heat": "#CC79A7",
       "Pollution-emitting land uses": "#E69F00", "Urban services & health-care access": "#0072B2", "Traffic & roads": "#7F7F7F"}
SHORT = {"pm25": "PM2.5", "no2": "NO2", "co": "CO", "ndvi": "NDVI", "evi": "EVI", "park_n1km": "Parks ≤1 km", "forest_dist": "Dist. forest",
         "builtup": "Built-up surface", "population": "Population", "nightlights": "Night-time light", "lst": "Land surface temp.",
         "elevation": "Elevation", "industrial_n1km": "Industrial ≤1 km", "fuel_n1km": "Fuel stations ≤1 km", "market_n1km": "Markets ≤1 km",
         "butcher_dist": "Dist. butcher", "publicinfra_dist": "Dist. water/waste infra.", "wastewater_dist": "Dist. wastewater",
         "landfill_dist": "Dist. landfill", "farm_dist": "Dist. farmland", "hospital_n1km": "Hospitals ≤1 km", "clinic_n1km": "Clinics ≤1 km",
         "school_n1km": "Schools ≤1 km", "recreation_dist": "Dist. recreation", "veterinary_dist": "Dist. veterinary",
         "road_kernel": "Road kernel index", "road_mindist": "Dist. nearest major road", "road_n200": "Major roads ≤200 m"}
T = pd.read_pickle("table1.pkl"); a = T[T.status == "analysed"].copy()
rel = pd.read_pickle("reliability.pkl")
agr = pd.read_pickle("agreement_long.pkl")
agr["app"] = pd.to_numeric(agr.app, errors="coerce"); agr["independent"] = pd.to_numeric(agr.independent, errors="coerce")
dom = dict(zip(T.key, T.domain))
lab = lambda ax, s: ax.text(-0.13, 1.04, s, transform=ax.transAxes, fontsize=10, fontweight="bold", va="bottom", ha="right")

def save(fig, name):
    fig.savefig(f"figs/{name}.pdf", bbox_inches="tight"); fig.savefig(f"figs/{name}.png", dpi=300, bbox_inches="tight")

# ------------------------------------------------------------------ Figure 1
fig = plt.figure(figsize=(7.2, 6.2))
gs = fig.add_gridspec(2, 2, height_ratios=[1, 1.15], hspace=0.42, wspace=0.32)
# A agreement
ax = fig.add_subplot(gs[0, 0])
dd = agr[agr.feature.str.endswith("_dist")].dropna(subset=["app", "independent"])
dd = dd[dd.independent >= 50]
r = 100 * (dd.app - dd.independent) / dd.independent
ax.scatter(dd.independent, r, s=2, alpha=0.25, c=[DOM[dom[f]] for f in dd.feature], linewidths=0)
ax.set_xscale("log"); ax.axhline(0, color="black", lw=0.6)
ax.axhline(r.median(), color="#444", lw=0.8, ls="--")
ax.set_xlabel("Distance, independent WGS84 implementation (m)"); ax.set_ylabel("App − independent (% of distance)")
ax.set_ylim(-1.2, 1.2)
ax.text(0.02, 0.97, f"8 nearest-facility distances, {len(dd):,} point–facility pairs\nmedian {r.median():.2f}% (range {r.min():.2f} to {r.max():.2f}%)",
        transform=ax.transAxes, va="top", fontsize=6.5)
ax.text(0.02, 0.05, "Grid layers (16): 100% identical values\n1-km counts (7): 97.4–99.9% identical\nRoad kernel index: max |Δ| 0.011",
        transform=ax.transAxes, va="bottom", fontsize=6.5, color="#333")
ax.set_title("Agreement with an independent implementation", fontsize=7.8, loc="left"); lab(ax, "A")
# B reliability vs displacement
ax = fig.add_subplot(gs[0, 1])
labels = []
STY = iter([("-", "o"), ("--", "s"), (":", "^"), ("-.", "D"), ("--", "v"), (":", "P")])
for k in a.key:
    g = rel[(rel.feature == k) & rel.d.notna()].sort_values("d")
    low = g[g.d == 100].icc.iloc[0] < 0.9
    if low:
        ls, mk = next(STY)
        ax.plot(g.d, g.icc, linestyle=ls, marker=mk, ms=3.2, lw=1.2, color=DOM[dom[k]])
        labels.append([g[g.d == 200].icc.iloc[0], k])
    else:
        ax.plot(g.d, g.icc, "-", lw=0.6, color="#9a9a9a", alpha=0.6)
labels.sort()
for i in range(1, len(labels)):
    labels[i][0] = max(labels[i][0], labels[i - 1][0] + 0.045)
for yv, k in labels:
    ax.text(212, yv, SHORT[k], fontsize=6, va="center", color=DOM[dom[k]])
ax.set_xscale("log"); ax.set_xticks([25, 50, 100, 200]); ax.set_xticklabels(["25", "50", "100", "200"])
ax.set_xlim(20, 520); ax.set_ylim(0.2, 1.02)
ax.axhline(0.9, color="#999", lw=0.5, ls=":")
ax.set_xlabel("Simulated geocoding displacement (m)"); ax.set_ylabel("ICC(A,1) with original location")
ax.set_title("Reliability to geocoding error (155 residences, 20 replicates)", fontsize=7.8, loc="left"); lab(ax, "B")
# C contrast vs reliability
ax = fig.add_subplot(gs[1, :])
ax.axvspan(0.3, 5, color="#F4D9CC", alpha=0.5, lw=0); ax.axhspan(0.2, 0.8, color="#E6E6E6", alpha=0.5, lw=0)
ax.text(0.33, 0.24, "Little contrast\n(CV < 5%)", fontsize=6.5, color="#8B3A1A", va="bottom")
ax.text(220, 0.24, "Unreliable at 100 m\n(ICC < 0.80)", fontsize=6.5, color="#555", ha="right", va="bottom")
MK = dict(zip(DOM, ["o", "s", "^", "D", "v", "P"]))
for _, row in a.iterrows():
    ax.scatter(row.cv, row.icc100, s=30, marker=MK[row.domain], color=DOM[row.domain], edgecolor="black", lw=0.4, zorder=3)
offs = {"no2": (4, -9), "co": (4, 2), "lst": (4, -9), "pm25": (4, 2), "builtup": (5, -3), "road_mindist": (-6, 4),
        "population": (5, 2), "elevation": (5, 2), "road_n200": (5, -4), "road_kernel": (-6, 4)}
for _, row in a.iterrows():
    dx, dy = offs.get(row.key, (4, -3))
    if row.key in offs:
        ax.annotate(SHORT[row.key] + (f" ({row.distinct} values)" if row.key == "no2" else ""), (row.cv, row.icc100),
                    xytext=(dx, dy), textcoords="offset points", fontsize=6.3, ha="right" if dx < 0 else "left")
ax.set_xscale("log"); ax.set_xlim(0.3, 250); ax.set_ylim(0.2, 1.03)
ax.set_xlabel("Within-sample contrast: coefficient of variation across 155 residences, % (log scale)")
ax.set_ylabel("Reliability: ICC at 100 m displacement")
ax.set_title("Contrast–reliability profile of the 28 analysable exposures", fontsize=7.8, loc="left")
h = [Line2D([0], [0], marker=MK[d], color="w", markerfacecolor=c, markeredgecolor="black", markeredgewidth=0.4, markersize=6, label=d) for d, c in DOM.items()]
ax.legend(handles=h, loc="lower center", bbox_to_anchor=(0.5, -0.36), ncol=3, frameon=False, fontsize=6.6)
lab(ax, "C")
save(fig, "Figure1_measurement_validity_reliability")

# ------------------------------------------------------------------ Figure 2
sims = [json.loads(l) for f in ("simA.txt", "simB.txt", "simC.txt", "simD.txt") for l in open(f) if l.strip()]
A = next(s for s in sims if s["scenario"].startswith("A"))
Bs = sorted([s for s in sims if s["scenario"].startswith("B")], key=lambda s: float(s["scenario"].split()[-1]))
C = next(s for s in sims if s["scenario"].startswith("C"))
Ds = [s for s in sims if s["scenario"].startswith("D")]
RULES = [("P(>=1 false nominal hit)", "Nominal p < 0.05", "#8C8C8C"), ("P(>=1 false FDR hit)", "FDR q < 0.05", "#0072B2"),
         ("P(>=1 false hit that is FDR-significant AND robust)", "FDR + robustness checks", "#009E73")]
RSTY = {"Nominal p < 0.05": ("-", "o"), "FDR q < 0.05": ("--", "s"), "FDR + robustness checks": (":", "^")}
fig = plt.figure(figsize=(7.4, 3.1))
gs = fig.add_gridspec(1, 3, width_ratios=[1.1, 0.95, 0.9], wspace=0.85)
ax = fig.add_subplot(gs[0, 0])
gvals = [0] + [float(s["scenario"].split()[-1]) for s in Bs]
xs = list(range(len(gvals)))
for key, name, col in RULES:
    ys = [A[key]] + [s[key] for s in Bs]
    ax.plot(xs, [100 * y for y in ys], linestyle=RSTY[name][0], marker=RSTY[name][1], color=col, ms=4, lw=1.5, label=name)
    for xx, yy in zip(xs, ys):
        below = name.startswith("FDR +")
        ax.text(xx, 100 * yy + (-7 if below else 3), f"{100 * yy:.0f}", ha="center", fontsize=5.8, color=col)
ax.set_xticks(xs); ax.set_xticklabels([f"{n}\n({g:g})" for n, g in zip(["None", "Weak", "Moderate", "Strong"], gvals)], fontsize=6.5)
ax.set_xlabel("Outcome spatial gradient (log units/SD)"); ax.set_ylabel("Datasets with ≥1 false-positive exposure (%)")
ax.set_ylim(-9, 110); ax.legend(frameon=False, fontsize=6.3, loc="upper center", bbox_to_anchor=(0.5, -0.32), ncol=1)
ax.set_title("Null exposures, spatial confounding", fontsize=7.8, loc="left"); lab(ax, "A")
ax = fig.add_subplot(gs[0, 1])
pw = [C["power nominal"], C["power FDR"], C["power FDR and robust"]]
fp = [C[k] for k, _, _ in RULES]
x = np.arange(3)
ax.bar(x - 0.19, [100 * v for v in pw], 0.36, color=[c for _, _, c in RULES], label="True exposure detected")
ax.bar(x + 0.19, [100 * v for v in fp], 0.36, color="white", edgecolor=[c for _, _, c in RULES], hatch="////", lw=0.8, label="≥1 false positive")
for i, (p_, f_) in enumerate(zip(pw, fp)):
    ax.text(i - 0.19, 100 * p_ + 1.5, f"{100 * p_:.0f}", ha="center", fontsize=6.3)
    ax.text(i + 0.19, 100 * f_ + 1.5, f"{100 * f_:.0f}", ha="center", fontsize=6.3)
ax.set_xticks(x); ax.set_xticklabels(["Nominal", "FDR", "FDR +\nrobust"])
ax.set_ylabel("Datasets (%)"); ax.set_ylim(0, 100)
ax.legend(frameon=False, fontsize=6.3, loc="upper center", bbox_to_anchor=(0.5, -0.2), ncol=1)
ax.set_title("True NDVI effect (0.25 SD)", fontsize=7.8, loc="left"); lab(ax, "B")
ax = fig.add_subplot(gs[0, 2])
d10 = next(s for s in Ds if "median imputation (10%)" in s); d15 = next(s for s in Ds if "median imputation (15%)" in s)
items = [("Imputation 10%", d10["median imputation (10%)"]), ("Imputation 15%", d15["median imputation (15%)"]),
         ("Unit error ×10", (d10["unit error (x10)"] + d15["unit error (x10)"]) / 2),
         ("Implausible value", (d10["implausible value"] + d15["implausible value"]) / 2),
         ("False alarm (clean)", (d10["false alarm on clean data"] + d15["false alarm on clean data"]) / 2)]
y = np.arange(len(items))[::-1]
ax.barh(y, [100 * v for _, v in items], color=["#009E73"] * 4 + ["#D55E00"], height=0.6)
for yy, (_, v) in zip(y, items):
    ax.text(100 * v + 2, yy, f"{100 * v:.1f}%" if v < 1 else "100%", va="center", fontsize=6.5)
ax.set_yticks(y); ax.set_yticklabels([n for n, _ in items], fontsize=6.6); ax.set_xlim(0, 118)
ax.set_xlabel("Datasets flagged (%)")
ax.set_title("Data-quality audit", fontsize=7.8, loc="left"); ax.text(-0.13, 1.04, "C", transform=ax.transAxes, fontsize=10, fontweight="bold", va="bottom", ha="right")
save(fig, "Figure2_inference_safeguards_simulation")
print("ok")
