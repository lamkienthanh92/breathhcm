#!/usr/bin/env python3
"""
Build public/data/pm25.json — the ~1 km annual-mean PM2.5 grid the app reads.

Input: one or more ANNUAL files of the WashU ACAG satellite-derived PM2.5
product line (van Donkelaar, Hammer, Martin et al.), gridded at 0.01° × 0.01°:

  * V6.GL.03 (CNN, current ACAG recommendation, 1998–2024)  ← used by the app
      file name like  V6GL03.CNNPM25.GL.202401-202412.nc
      https://www.satpm.org/v6-gl-03  — AWS bucket "satpmdata", prefix V6GL03/
      Easiest route: scripts/colab_pm25_1cell.py (one Google Colab cell).
      (V6.GL.02.04 and its old bucket "v6.gl.02.04" are retired.)
  * V5.GL.05.02 / V5.GL.06 (GWR, "traditional" algorithm) — check satpm.org
      for a matching 0.01° uncertainty (SIGMA) file; pass it via --sigma.
  * A GeoTIFF exported from Google Earth Engine (see gee_export_pm25.js).

Each input is cropped to the bounding box, (optionally) averaged across
years, and written as a compact flat array the browser can index in O(1).
NO resampling is done: cells keep the product's native 0.01° grid.

Usage
-----
  pip install netCDF4 numpy          # or: xarray / h5py; rasterio for .tif
  python scripts/build_pm25_grid.py \
      --input V6GL03.CNNPM25.GL.202401-202412.nc

  # multi-year mean for long-term exposure (e.g. 2022–2024):
  python scripts/build_pm25_grid.py --input V6GL03.CNNPM25.GL.202[234]01-*.nc

  # V5 with its matching uncertainty layer:
  python scripts/build_pm25_grid.py \
      --input V5GL0502.HybridPM25.Global.202301-202312.nc \
      --sigma V5GL0502.HybridPM25SIGMA.Global.202301-202312.nc

Readers are tried in order: netCDF4 → xarray → h5py → scipy (NetCDF-3 only).
"""

import argparse
import datetime as dt
import json
import math
import os
import re
import sys
import warnings

import numpy as np

FORMAT_ID = "onehealth-pm25-grid/v1"

# Default bbox = whole post-2025-merger HCMC (incl. former Bình Dương,
# Bà Rịa–Vũng Tàu and Côn Đảo), measured from src/wards.js, plus margin.
DEFAULT_BBOX = (8.55, 11.60, 106.25, 107.70)  # lat_min, lat_max, lon_min, lon_max

CITATIONS = {
    "V6": (  # same reference is cited by ACAG for V6.GL.01, V6.GL.02.04 and V6.GL.03
        "Shen S, Li C, van Donkelaar A, Jacobs N, Wang C, Martin RV. Enhancing "
        "global estimation of fine particulate matter concentrations by including "
        "geophysical a priori information in deep learning. ACS ES&T Air 2024. "
        "doi:10.1021/acsestair.3c00054"
    ),
    "V5": (
        "van Donkelaar A, Hammer MS, Bindle L, et al. Monthly global estimates of "
        "fine particulate matter and their uncertainty. Environ Sci Technol 2021;"
        "55:15287-15300. doi:10.1021/acs.est.1c05309 — and Hammer MS, van Donkelaar "
        "A, et al. Remote Sens Environ 2023;294:113624. doi:10.1016/j.rse.2023.113624"
    ),
}

# Landmarks used only for the printed sanity check after building.
LANDMARKS = [
    ("Chợ Bến Thành (Q1 cũ)", 10.7725, 106.6980),
    ("Thủ Dầu Một", 10.9804, 106.6519),
    ("Củ Chi", 10.9730, 106.4930),
    ("Cần Giờ", 10.4110, 106.9540),
    ("Vũng Tàu", 10.3460, 107.0843),
]

LAT_NAMES = ("lat", "latitude", "LAT", "Latitude", "y")
LON_NAMES = ("lon", "longitude", "LON", "Longitude", "x")
VAR_HINTS = ("PM25", "pm25", "GWRPM25", "CNNPM25", "PM25SIGMA", "SIGMA", "sigma")


# ───────────────────────────── readers ─────────────────────────────────
def _pick(names, candidates, what, path):
    for c in candidates:
        if c in names:
            return c
    raise SystemExit(f"[{os.path.basename(path)}] cannot find {what} variable among {sorted(names)}")


def _pick_data_var(variables, lat_name, lon_name, path):
    for h in VAR_HINTS:
        if h in variables:
            return h
    two_d = [k for k, v in variables.items() if k not in (lat_name, lon_name) and len(v) == 2]
    if len(two_d) == 1:
        return two_d[0]
    raise SystemExit(
        f"[{os.path.basename(path)}] ambiguous data variable; candidates: {two_d}. "
        "Rename or extend VAR_HINTS."
    )


def _index_range(coord, lo, hi):
    """Index slice covering every cell centre within [lo, hi]."""
    idx = np.where((coord >= lo) & (coord <= hi))[0]
    if idx.size == 0:
        raise SystemExit(f"bbox [{lo}, {hi}] does not overlap coordinate range [{coord.min()}, {coord.max()}]")
    return int(idx.min()), int(idx.max()) + 1


def read_netcdf(path, bbox):
    """Return (lat_1d, lon_1d, data_2d[lat, lon]) cropped to bbox, NaN for missing."""
    lat_min, lat_max, lon_min, lon_max = bbox
    errors = []

    # 1) netCDF4 — reads only the requested hyperslab from disk.
    try:
        import netCDF4  # noqa: F401
        with netCDF4.Dataset(path) as ds:
            names = set(ds.variables)
            la = _pick(names, LAT_NAMES, "latitude", path)
            lo = _pick(names, LON_NAMES, "longitude", path)
            dims = {k: v.dimensions for k, v in ds.variables.items()}
            vn = _pick_data_var(dims, la, lo, path)
            lat = np.asarray(ds.variables[la][:], dtype="f8")
            lon = np.asarray(ds.variables[lo][:], dtype="f8")
            i0, i1 = _index_range(lat, lat_min, lat_max)
            j0, j1 = _index_range(lon, lon_min, lon_max)
            var = ds.variables[vn]
            lat_first = var.dimensions[0] in (la, ds.variables[la].dimensions[0])
            sub = var[i0:i1, j0:j1] if lat_first else var[j0:j1, i0:i1].T
            sub = np.ma.filled(np.ma.asarray(sub, dtype="f8"), np.nan)
            return lat[i0:i1], lon[j0:j1], sub, vn
    except ImportError as e:
        errors.append(f"netCDF4: {e}")

    # 2) xarray (needs netCDF4 or h5netcdf engine underneath).
    try:
        import xarray as xr
        with xr.open_dataset(path) as ds:
            names = set(ds.variables)
            la = _pick(names, LAT_NAMES, "latitude", path)
            lo = _pick(names, LON_NAMES, "longitude", path)
            vn = _pick_data_var({k: ds[k].dims for k in ds.data_vars}, la, lo, path)
            lat = ds[la].values.astype("f8")
            lon = ds[lo].values.astype("f8")
            i0, i1 = _index_range(lat, lat_min, lat_max)
            j0, j1 = _index_range(lon, lon_min, lon_max)
            da = ds[vn].isel({ds[la].dims[0]: slice(i0, i1), ds[lo].dims[0]: slice(j0, j1)})
            da = da.transpose(ds[la].dims[0], ds[lo].dims[0])
            return lat[i0:i1], lon[j0:j1], da.values.astype("f8"), vn
    except ImportError as e:
        errors.append(f"xarray: {e}")
    except ValueError as e:  # no engine available
        errors.append(f"xarray: {e}")

    # 3) h5py — NetCDF-4 files are HDF5 underneath.
    try:
        import h5py
        with h5py.File(path, "r") as f:
            names = set(f.keys())
            la = _pick(names, LAT_NAMES, "latitude", path)
            lo = _pick(names, LON_NAMES, "longitude", path)
            vn = _pick_data_var({k: f[k].shape for k in names}, la, lo, path)
            lat = f[la][:].astype("f8")
            lon = f[lo][:].astype("f8")
            i0, i1 = _index_range(lat, lat_min, lat_max)
            j0, j1 = _index_range(lon, lon_min, lon_max)
            ds = f[vn]
            if ds.shape == (lat.size, lon.size):
                sub = ds[i0:i1, j0:j1].astype("f8")
            else:
                sub = ds[j0:j1, i0:i1].astype("f8").T
            fill = ds.attrs.get("_FillValue")
            if fill is not None:
                sub[sub == np.asarray(fill).item()] = np.nan
            sf = ds.attrs.get("scale_factor")
            ao = ds.attrs.get("add_offset")
            if sf is not None:
                sub = sub * np.asarray(sf).item()
            if ao is not None:
                sub = sub + np.asarray(ao).item()
            return lat[i0:i1], lon[j0:j1], sub, vn
    except ImportError as e:
        errors.append(f"h5py: {e}")

    # 4) scipy — NetCDF-3 classic only (ACAG ships NetCDF-4, so this is a
    #    last resort for converted/test files).
    try:
        from scipy.io import netcdf_file
        with netcdf_file(path, "r", mmap=False) as f:
            names = set(f.variables)
            la = _pick(names, LAT_NAMES, "latitude", path)
            lo = _pick(names, LON_NAMES, "longitude", path)
            vn = _pick_data_var({k: v.dimensions for k, v in f.variables.items()}, la, lo, path)
            lat = np.array(f.variables[la][:], dtype="f8")
            lon = np.array(f.variables[lo][:], dtype="f8")
            i0, i1 = _index_range(lat, lat_min, lat_max)
            j0, j1 = _index_range(lon, lon_min, lon_max)
            v = f.variables[vn]
            lat_first = v.dimensions[0] == f.variables[la].dimensions[0]
            sub = np.array(v[i0:i1, j0:j1] if lat_first else v[j0:j1, i0:i1].T, dtype="f8")
            fill = getattr(v, "_FillValue", None)
            if fill is not None:
                sub[sub == fill] = np.nan
            return lat[i0:i1], lon[j0:j1], sub, vn
    except Exception as e:  # noqa: BLE001
        errors.append(f"scipy: {e}")

    raise SystemExit(
        "Could not read NetCDF file. Install one reader:  pip install netCDF4\n  " + "\n  ".join(errors)
    )


def read_geotiff(path, bbox):
    try:
        import rasterio
        from rasterio.windows import from_bounds
    except ImportError:
        raise SystemExit("Reading GeoTIFF needs rasterio:  pip install rasterio")
    lat_min, lat_max, lon_min, lon_max = bbox
    with rasterio.open(path) as src:
        if src.crs and src.crs.to_epsg() not in (4326, None):
            raise SystemExit(f"{path}: expected EPSG:4326, got {src.crs}. Re-export in the native ACAG projection.")
        win = from_bounds(lon_min, lat_min, lon_max, lat_max, src.transform).round_offsets().round_lengths()
        data = src.read(1, window=win, masked=True).astype("f8").filled(np.nan)
        t = src.window_transform(win)
        rows, cols = data.shape
        lon = t.c + t.a * (np.arange(cols) + 0.5)
        lat = t.f + t.e * (np.arange(rows) + 0.5)
        keep_r = (lat >= lat_min) & (lat <= lat_max)
        keep_c = (lon >= lon_min) & (lon <= lon_max)
        return lat[keep_r], lon[keep_c], data[np.ix_(keep_r, keep_c)], "band1"


def read_any(path, bbox):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".tif", ".tiff"):
        return read_geotiff(path, bbox)
    return read_netcdf(path, bbox)


# ───────────────────────────── helpers ─────────────────────────────────
def normalise(lat, lon, data):
    """Ascending lat (south→north) and lon (west→east)."""
    if lat.size > 1 and lat[1] < lat[0]:
        lat, data = lat[::-1], data[::-1, :]
    if lon.size > 1 and lon[1] < lon[0]:
        lon, data = lon[::-1], data[:, ::-1]
    return lat, lon, data


def regular_step(coord, name):
    """Grid step from the full span (robust to float32 coordinate noise)."""
    if coord.size < 2:
        raise SystemExit(f"{name}: need at least 2 cells inside the bbox")
    step = float((coord[-1] - coord[0]) / (coord.size - 1))
    d = np.diff(coord)
    if np.max(np.abs(d - step)) > abs(step) * 0.05:
        raise SystemExit(f"{name} spacing is not regular (mean {step}, range {d.min()}..{d.max()})")
    return round(step, 6)


def snap(value, step):
    """Round an origin to the precision the grid step implies (kills float32 noise)."""
    nd = max(0, -math.floor(math.log10(abs(step)))) + 2
    return round(float(value), nd)


def detect_product(path):
    b = os.path.basename(path)
    m = re.search(r"V(\d)GL(\d\d)\.?(\d\d)?", b)
    if not m:
        return None, None
    major = f"V{m.group(1)}"
    ver = f"{major}.GL.{m.group(2)}" + (f".{m.group(3)}" if m.group(3) else "")
    algo = "CNN" if "CNN" in b else ("GWR" if ("GWR" in b or "Hybrid" in b) else "")
    return f"ACAG {ver}" + (f" ({algo})" if algo else ""), major


def detect_period(path):
    m = re.search(r"(\d{4})(\d{2})-(\d{4})(\d{2})", os.path.basename(path))
    if not m:
        return None, None
    y0, m0, y1, m1 = map(int, m.groups())
    months = (y1 - y0) * 12 + (m1 - m0) + 1
    return (y0, m0, y1, m1), months


def to_list(arr):
    out = []
    for v in arr.ravel():
        out.append(None if not math.isfinite(v) else round(float(v), 1))
    return out


# ─────────────────────────────── main ──────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", nargs="+", required=True, help="annual .nc or .tif file(s); several = multi-year mean")
    ap.add_argument("--sigma", nargs="+", help="matching uncertainty file(s) (V5.GL.05.02 SIGMA), same years/order")
    ap.add_argument("--bbox", nargs=4, type=float, metavar=("LAT_MIN", "LAT_MAX", "LON_MIN", "LON_MAX"), default=DEFAULT_BBOX)
    ap.add_argument("--product", help="product label shown in the app (auto-detected from file name)")
    ap.add_argument("--period", help="period label, e.g. '2023' or '2019–2023' (auto-detected)")
    ap.add_argument("--citation", help="citation text (auto-selected for ACAG V5/V6)")
    ap.add_argument("--allow-monthly", action="store_true", help="accept non-annual files (not recommended)")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "public", "data", "pm25.json"))
    args = ap.parse_args()

    bbox = tuple(args.bbox)
    layers, years, lat_ref, lon_ref = [], [], None, None
    for path in args.input:
        period, months = detect_period(path)
        if months is not None and months != 12 and not args.allow_monthly:
            raise SystemExit(f"{path}: covers {months} month(s), not an annual mean. Use the annual file or --allow-monthly.")
        lat, lon, data, vn = read_any(path, bbox)
        lat, lon, data = normalise(lat, lon, data)
        if lat_ref is None:
            lat_ref, lon_ref = lat, lon
        elif lat.shape != lat_ref.shape or lon.shape != lon_ref.shape or \
                not (np.allclose(lat, lat_ref, atol=1e-5) and np.allclose(lon, lon_ref, atol=1e-5)):
            raise SystemExit(f"{path}: grid differs from {args.input[0]} — cannot average different grids.")
        layers.append(data)
        if period:
            years.append(period[0])
        print(f"  read {os.path.basename(path)} [{vn}] → {data.shape[0]}×{data.shape[1]} cells")

    stack = np.stack(layers)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN cells (sea) are expected
        mean = np.nanmean(stack, axis=0) if len(layers) > 1 else stack[0]
    incomplete = int(np.sum(np.any(np.isnan(stack), axis=0) & np.isfinite(mean))) if len(layers) > 1 else 0

    sigma = None
    if args.sigma:
        if len(args.sigma) != len(args.input):
            raise SystemExit("--sigma needs one file per --input file, same order.")
        sl = []
        for path in args.sigma:
            la, lo, d, _ = read_any(path, bbox)
            la, lo, d = normalise(la, lo, d)
            if d.shape != mean.shape or not np.allclose(la, lat_ref, atol=1e-5):
                raise SystemExit(f"{path}: sigma grid does not match the PM2.5 grid.")
            sl.append(d)
        # Multi-year: root-mean-square of yearly sigmas / n (assumes independent
        # yearly errors — an approximation; documented in the output note).
        s = np.stack(sl)
        with np.errstate(invalid="ignore", divide="ignore"):
            sigma = np.sqrt(np.nansum(s ** 2, axis=0)) / np.sum(np.isfinite(s), axis=0) if len(sl) > 1 else s[0]

    d_lat = regular_step(lat_ref, "latitude")
    d_lon = regular_step(lon_ref, "longitude")

    product, major = detect_product(args.input[0])
    product = args.product or product or "Satellite-derived PM2.5 (unlabelled)"
    citation = args.citation or CITATIONS.get(major or "", "")
    if args.period:
        period_label = args.period
    elif years:
        ys = sorted(set(years))
        period_label = str(ys[0]) if len(ys) == 1 else f"{ys[0]}–{ys[-1]} (mean of {len(ys)} annual means)"
    else:
        period_label = "unknown — pass --period"

    finite = mean[np.isfinite(mean)]
    if finite.size == 0:
        raise SystemExit("All cells are missing inside the bbox — wrong file or bbox?")

    out = {
        "format": FORMAT_ID,
        "product": product,
        "productUrl": "https://sites.wustl.edu/acag/datasets/surface-pm2-5/",
        "citation": citation,
        "license": "CC BY 4.0 (ACAG SatPM2.5)" if major else "",
        "variable": "Annual mean ground-level PM2.5",
        "unit": "µg/m³",
        "period": period_label,
        "years": sorted(set(years)),
        "lat0": snap(lat_ref[0], d_lat),
        "lon0": snap(lon_ref[0], d_lon),
        "dLat": d_lat,
        "dLon": d_lon,
        "nLat": int(lat_ref.size),
        "nLon": int(lon_ref.size),
        "bbox": list(bbox),
        "values": to_list(mean),
        "stats": {
            "min": round(float(finite.min()), 1),
            "max": round(float(finite.max()), 1),
            "mean": round(float(finite.mean()), 2),
            "nValid": int(finite.size),
            "nMissing": int(mean.size - finite.size),
            "cellsWithIncompleteYears": incomplete,
        },
        "note": (
            "Native 0.01° grid, cropped only (no resampling). ACAG notes that 0.01° "
            "files are gridded at the finest resolution of their inputs but are "
            "unlikely to fully resolve PM2.5 gradients at that resolution."
        ),
        "sourceFiles": [os.path.basename(p) for p in args.input],
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "generator": "scripts/build_pm25_grid.py",
    }
    if sigma is not None:
        out["sigma"] = to_list(sigma)
        out["sigmaSourceFiles"] = [os.path.basename(p) for p in args.sigma]
        if len(args.sigma) > 1:
            out["note"] += " Multi-year sigma = sqrt(sum σ²)/n, assuming independent yearly errors."

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))

    # ── sanity report ──
    size_kb = os.path.getsize(args.out) / 1024
    km_ns = d_lat * 111.32
    km_ew = d_lon * 111.32 * math.cos(math.radians((bbox[0] + bbox[1]) / 2))
    print(f"\n✓ wrote {os.path.relpath(args.out)} ({size_kb:.0f} KB)")
    print(f"  product : {product}   period: {period_label}")
    print(f"  grid    : {out['nLat']}×{out['nLon']} cells, {d_lat}° × {d_lon}° (~{km_ns:.2f} × {km_ew:.2f} km)")
    print(f"  values  : min {out['stats']['min']}  mean {out['stats']['mean']}  max {out['stats']['max']} µg/m³; "
          f"{out['stats']['nMissing']} missing cells (mostly sea)")
    if incomplete:
        print(f"  ⚠ {incomplete} cells lack at least one year — their mean uses fewer years.")
    if finite.min() < 1 or finite.max() > 150:
        print("  ⚠ values outside 1–150 µg/m³ — check units / variable before using.")
    print("  landmarks:")
    for name, la, lo in LANDMARKS:
        i = round((la - out["lat0"]) / d_lat)
        j = round((lo - out["lon0"]) / d_lon)
        v = out["values"][i * out["nLon"] + j] if 0 <= i < out["nLat"] and 0 <= j < out["nLon"] else "outside bbox"
        print(f"    {name:<24} {la:.4f}, {lo:.4f} → {v}")


if __name__ == "__main__":
    main()
