import json, numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 7.5, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.linewidth": 0.6, "pdf.fonttype": 42})
top, rob = mpimg.imread("figs/shot_top.png"), mpimg.imread("figs/shot_robust.png")
perf = json.load(open("perf.json")); cv = json.load(open("compval.json"))
h_top, h_rob = top.shape[0] / top.shape[1], rob.shape[0] / rob.shape[1]
W = 7.2
fig = plt.figure(figsize=(W, W * (h_top + h_rob) + 2.4))
gs = fig.add_gridspec(3, 2, height_ratios=[W * h_top, W * h_rob, 2.1], hspace=0.16, wspace=0.42)
def lab(ax, s, x=-0.01, y=1.0):
    ax.text(x, y, s, transform=ax.transAxes, fontsize=10, fontweight="bold", va="bottom", ha="right")
ax = fig.add_subplot(gs[0, :]); ax.imshow(top); ax.axis("off")
ax.set_title("Worked example in the app: summary, participant flow and data-quality audit", fontsize=7.8, loc="left"); lab(ax, "A")
ax = fig.add_subplot(gs[1, :]); ax.imshow(rob); ax.axis("off")
ax.set_title("Automatic robustness checks for the nominal associations", fontsize=7.8, loc="left"); lab(ax, "B")
ax = fig.add_subplot(gs[2, 0])
fams = ["gaussian", "binomial", "poisson"]; names = ["Linear\n(HC3)", "Logistic", "Poisson"]
x = np.arange(3); w = 0.26
for i, (k, c, lbl) in enumerate([("max_abs_beta_diff", "#0072B2", "|Δ coefficient|"), ("max_abs_se_diff", "#009E73", "|Δ standard error|"), ("max_abs_p_diff", "#E69F00", "|Δ p-value|")]):
    v = [max(cv[f][k], 1e-16) for f in fams]
    ax.bar(x + (i - 1) * w, v, w, color=c, label=lbl)
ax.set_yscale("log"); ax.set_ylim(1e-16, 1e-4); ax.set_xticks(x); ax.set_xticklabels(names)
ax.set_ylabel("Maximum absolute difference\n(29 exposures per model family)")
ax.legend(frameon=False, fontsize=6.3, loc="upper left", ncol=1)
ax.set_title("Engine vs independent reference implementations", fontsize=7.8, loc="left"); lab(ax, "C", -0.34)
ax = fig.add_subplot(gs[2, 1])
ns = [p["n"] for p in perf]
ax.plot(ns, [p["measure_seconds_node"] for p in perf], "-o", color="#CC79A7", ms=3.5, label="Exposure measurement (33 exposures)")
ax.plot(ns, [p["engine_seconds_cpython"] for p in perf], "-s", color="#1F4E5A", ms=3.5, label="Full analysis (3 outcomes)")
for p in perf:
    ax.text(p["n"], p["engine_seconds_cpython"] + 0.4, f"{p['engine_seconds_cpython']:.1f} s", fontsize=6, ha="center", color="#1F4E5A")
ax.set_xlabel("Participants"); ax.set_ylabel("Run time (s)"); ax.set_xticks(ns)
ax.legend(frameon=False, fontsize=6.3, loc="upper left")
ax.set_title("Run time (Node.js measurement; CPython engine)", fontsize=7.8, loc="left"); lab(ax, "D", -0.14)
fig.savefig("figs/Figure3_worked_example_reproducibility.pdf", bbox_inches="tight", dpi=300)
fig.savefig("figs/Figure3_worked_example_reproducibility.png", bbox_inches="tight", dpi=300)
print("ok")
