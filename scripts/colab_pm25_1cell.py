# ═══ PM2.5 ~1 km (ACAG SatPM V6.GL.03) cho TP.HCM → pm25.json — dán vào 1 cell Colab rồi chạy ═══
YEARS = [2022, 2023, 2024]               # sửa theo giai đoạn đo hô hấp ký (V6.GL.03 có 1998–2024)
BBOX = (8.55, 11.60, 106.25, 107.70)     # lat_min, lat_max, lon_min, lon_max — TP.HCM sau sáp nhập

import subprocess, sys
try:
    import netCDF4, boto3
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "netCDF4", "boto3"], check=True)
    import netCDF4, boto3
import os, re, json, math, shutil, warnings, urllib.parse, datetime as dt
import numpy as np, requests
from botocore import UNSIGNED
from botocore.config import Config

# Kho chính thức của ACAG (satpm.org): bucket "satpmdata", thư mục V6GL03/
BUCKET, PREFIX = "satpmdata", "V6GL03/"
WEB = "http://satpmdata.s3-website-us-east-1.amazonaws.com/"
PRODUCT = "ACAG SatPM V6.GL.03 (CNN)"
s3 = boto3.client("s3", region_name="us-east-1", config=Config(signature_version=UNSIGNED))

# 1) Liệt kê kho, chọn file TRUNG BÌNH NĂM 0.01° cho từng năm (bản 0.01° nặng hơn hẳn bản 0.1°)
objs = []
try:
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=PREFIX):
        objs += page.get("Contents", [])
except Exception as e:
    print("Không liệt kê được kho:", str(e)[:200])
if not objs:
    try:
        top = s3.list_objects_v2(Bucket=BUCKET, Delimiter="/").get("CommonPrefixes", [])
        print("Thư mục gốc trong kho:", [p["Prefix"] for p in top])
    except Exception as e:
        print(str(e)[:200])
    raise SystemExit(f"Không thấy file dưới {PREFIX} — chụp màn hình gửi Claude.")
nc = [o for o in objs if o["Key"].lower().endswith(".nc")]
print(f"{len(nc)} file .nc dưới {PREFIX}")

def annual(y):
    c = [o for o in nc if f"{y}01-{y}12" in o["Key"]                        # kiểu tên YYYY01-YYYY12
         or ("annual" in o["Key"].lower() and str(y) in os.path.basename(o["Key"])
             and not re.search(rf"{y}(0[2-9]|1[01])", os.path.basename(o["Key"])))]  # hoặc thư mục Annual/
    return max(c, key=lambda o: o["Size"]) if c else None                   # lớn nhất = bản 0.01°

picked = {}
for y in YEARS:
    o = annual(y)
    if o:
        picked[y] = o["Key"]
        print(f"  {y}: {o['Key']}  ({o['Size'] / 1e6:.0f} MB)")
    else:
        print(f"  ⚠ không thấy file năm {y} — bỏ qua")
if not picked:
    print("Ví dụ tên file trong kho:", [o["Key"] for o in nc[:40]])
    raise SystemExit("Không nhận ra file năm — chụp màn hình gửi Claude.")

def fetch(key, local):
    try:
        s3.download_file(BUCKET, key, local)
        return
    except Exception as e:
        print("   tải qua S3 lỗi:", str(e)[:120], "→ thử qua web portal")
    with requests.get(WEB + urllib.parse.quote(key), stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(local, "wb") as fh:
            for chunk in r.iter_content(1 << 22):
                fh.write(chunk)

# 2) Tải từng file, cắt vùng TP.HCM (không nội suy), xóa file gốc
def crop(path):
    with netCDF4.Dataset(path) as ds:
        V = ds.variables
        la = next(n for n in V if n.lower() in ("lat", "latitude"))
        lo = next(n for n in V if n.lower() in ("lon", "longitude"))
        vn = next((n for n in V if n.upper() in ("PM25", "CNNPM25", "GWRPM25")), None) or \
             next(n for n in V if n not in (la, lo) and V[n].ndim == 2)
        lat = np.asarray(V[la][:], "f8"); lon = np.asarray(V[lo][:], "f8")
        i = np.where((lat >= BBOX[0]) & (lat <= BBOX[1]))[0]
        j = np.where((lon >= BBOX[2]) & (lon <= BBOX[3]))[0]
        i0, i1, j0, j1 = i.min(), i.max() + 1, j.min(), j.max() + 1
        v = V[vn]
        sub = v[i0:i1, j0:j1] if v.dimensions[0] == V[la].dimensions[0] else v[j0:j1, i0:i1].T
        sub = np.ma.filled(np.ma.asarray(sub, dtype="f8"), np.nan)
        lat, lon = lat[i0:i1], lon[j0:j1]
    if lat[1] < lat[0]: lat, sub = lat[::-1], sub[::-1, :]
    if lon[1] < lon[0]: lon, sub = lon[::-1], sub[:, ::-1]
    return lat, lon, sub

layers, lat0, lon0 = [], None, None
for y, key in picked.items():
    f = os.path.basename(key)
    print(f"Đang tải + cắt {f} ...")
    fetch(key, f)
    lat, lon, d = crop(f)
    os.remove(f)
    res = float(np.median(np.diff(lat)))
    if res > 0.02:
        raise SystemExit(f"{f} có ô {res:.3f}° — không phải bản 0.01°. Chụp màn hình gửi Claude.")
    if layers and d.shape != layers[0].shape:
        raise SystemExit("Lưới các năm không khớp nhau.")
    if lat0 is None: lat0, lon0 = lat, lon
    layers.append(d)

# 3) Trung bình các năm → pm25.json đúng định dạng app đọc
stack = np.stack(layers)
with warnings.catch_warnings():
    warnings.simplefilter("ignore", RuntimeWarning)  # ô biển toàn NaN là bình thường
    mean = np.nanmean(stack, axis=0)
step = lambda c: round(float((c[-1] - c[0]) / (len(c) - 1)), 6)
snap = lambda v, s: round(float(v), max(0, -math.floor(math.log10(s))) + 2)
dlat, dlon = step(lat0), step(lon0)
ys = sorted(picked)
period = str(ys[0]) if len(ys) == 1 else f"{ys[0]}–{ys[-1]} (mean of {len(ys)} annual means)"
fin = mean[np.isfinite(mean)]
out = {
    "format": "onehealth-pm25-grid/v1",
    "product": PRODUCT,
    "productUrl": "https://www.satpm.org/v6-gl-03",
    "citation": ("Shen S, Li C, van Donkelaar A, Jacobs N, Wang C, Martin RV. Enhancing global estimation "
                 "of fine particulate matter concentrations by including geophysical a priori information in "
                 "deep learning. ACS ES&T Air 2024. doi:10.1021/acsestair.3c00054 (SatPM V6.GL.03)"),
    "license": "CC BY 4.0 (SatPM2.5)",
    "variable": "Annual mean ground-level PM2.5", "unit": "µg/m³",
    "period": period, "years": ys,
    "lat0": snap(lat0[0], dlat), "lon0": snap(lon0[0], dlon), "dLat": dlat, "dLon": dlon,
    "nLat": int(lat0.size), "nLon": int(lon0.size), "bbox": list(BBOX),
    "values": [None if not np.isfinite(v) else round(float(v), 1) for v in mean.ravel()],
    "stats": {"min": round(float(fin.min()), 1), "max": round(float(fin.max()), 1),
              "mean": round(float(fin.mean()), 2), "nValid": int(fin.size),
              "nMissing": int(mean.size - fin.size),
              "cellsWithIncompleteYears": int(np.sum(np.any(np.isnan(stack), 0) & np.isfinite(mean)))},
    "note": ("Native 0.01° grid, cropped only (no resampling). ACAG notes that 0.01° files are gridded at the "
             "finest resolution of their inputs but are unlikely to fully resolve PM2.5 gradients at that resolution."),
    "sourceFiles": [os.path.basename(k) for k in picked.values()],
    "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    "generator": "colab_pm25_1cell.py",
}
with open("pm25.json", "w", encoding="utf-8") as fh:
    json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))

# 4) Kiểm tra nhanh
def at(la, lo):
    i, j = round((la - out["lat0"]) / dlat), round((lo - out["lon0"]) / dlon)
    return out["values"][i * out["nLon"] + j] if 0 <= i < out["nLat"] and 0 <= j < out["nLon"] else None
print(f"\n✓ pm25.json ({os.path.getsize('pm25.json') / 1024:.0f} KB) · {PRODUCT} · {period} · "
      f"lưới {out['nLat']}×{out['nLon']} ô, {dlat}°×{dlon}° · min {out['stats']['min']} / "
      f"TB {out['stats']['mean']} / max {out['stats']['max']} µg/m³")
for n, la, lo in [("Bến Thành", 10.7725, 106.6980), ("Thủ Dầu Một", 10.9804, 106.6519),
                  ("Củ Chi", 10.9730, 106.4930), ("Cần Giờ", 10.4110, 106.9540), ("Vũng Tàu", 10.3460, 107.0843)]:
    print(f"   {n:<12} {at(la, lo)}")
core = np.array([v for v in (at(10.70 + a * 0.01, 106.55 + b * 0.01) for a in range(21) for b in range(26))
                 if v is not None])
print(f"   Nội thành cũ (10.70–10.90N, 106.55–106.80E): {core.size} ô, {core.min()}–{core.max()} µg/m³, "
      f"CV {100 * core.std() / core.mean():.1f}%  (MERRA-2 trong bản thảo: 1 ô, CV 1.8%)")

try:
    from google.colab import files
    files.download("pm25.json")
except Exception:
    print("Tải pm25.json thủ công: biểu tượng thư mục bên trái → pm25.json → ⋮ → Download")
