"""Builds public/analysis/BREATH_outcome_template.xlsx — the workbook users fill in
before uploading to the Analysis panel.

Run from the project folder:  python scripts/build_outcome_template.py
(needs openpyxl; reads the exposure list from public/analysis/exposures.json)
"""
import json
import os
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "analysis", "BREATH_outcome_template.xlsx")
EXPOSURES = json.load(open(os.path.join(ROOT, "public", "analysis", "exposures.json"), encoding="utf-8"))

HEAD = PatternFill("solid", fgColor="1F4E5A")
REQ = PatternFill("solid", fgColor="D9EAD3")
OPT = PatternFill("solid", fgColor="FFF2CC")
WHITE = Font(name="Arial", bold=True, color="FFFFFF", size=10)
BOLD = Font(name="Arial", bold=True, size=10)
BASE = Font(name="Arial", size=10)
thin = Side(style="thin", color="BBBBBB")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)

wb = Workbook()

# ---------------------------------------------------------------- instructions
ws = wb.active
ws.title = "Instructions"
lines = [
    ("BREATH-HCMC — outcome template / Mẫu nhập outcome", True),
    ("", False),
    ("1. Sheet 'Data': one row per participant. Do NOT enter names, phone numbers or addresses.", False),
    ("   Sheet 'Data': mỗi dòng là một người tham gia. KHÔNG nhập họ tên, số điện thoại hay địa chỉ.", False),
    ("2. ID: a unique code per participant (e.g. BN-001).", False),
    ("3. Location: in Google Maps, right-click the home → click the first line (e.g. 10.77614, 106.63456) to copy it,", False),
    ("   then paste it into 'Google Maps coordinates'. Alternatively fill 'Latitude' and 'Longitude' separately.", False),
    ("   Toạ độ: trên Google Maps, nhấp chuột phải vào nhà → bấm dòng số đầu tiên để sao chép → dán vào cột 'Google Maps coordinates'.", False),
    ("4. Add one column per outcome or covariate to the right of 'Exclusion reason'. Rename or delete the example columns.", False),
    ("   'Exclude' = yes removes a participant who does not meet your eligibility criteria (give the reason); the report shows", False),
    ("   the participant flow. Cột 'Exclude' = yes để loại người không đạt tiêu chuẩn chọn mẫu (ghi lý do).", False),
    ("   Numbers only; binary variables as 0/1; leave a cell empty if the value is missing (never fill in a mean or median).", False),
    ("   Chỉ nhập số; biến nhị giá nhập 0/1; ô thiếu thì để trống (không điền trung bình hay trung vị).", False),
    ("5. Sheet 'Variables': one row per column you added, with the exact same column name:", False),
    ("   Role = outcome / covariate / cluster / ignore;  Type = continuous / binary / count / categorical;", False),
    ("   Transform = none / log (log for right-skewed positive outcomes such as WBC or NLR);", False),
    ("   Plausible min / max are used to flag entry errors; 'Primary exposure' marks a hypothesis you fixed BEFORE seeing data;", False),
    ("   'Covariates for this outcome' (optional) lists the covariates for that outcome only, e.g. 'Age, Sex, Height' for FEV1.", False),
    ("   Plan first: upload the template with Variables / Exposures / Settings filled and NO data rows to get a plan", False),
    ("   fingerprint you can register (e.g. on OSF) before outcome data are collected.", False),
    ("6. Sheet 'Exposures': set Include = no to drop an exposure; Anchor = yes adjusts every model for that exposure", False),
    ("   instead of testing it (e.g. road proximity if it is studied elsewhere).", False),
    ("7. Sheet 'Settings': optional analysis settings. Then save as .xlsx and upload in the Analysis panel.", False),
    ("", False),
    ("Privacy: the file is read and analysed inside your browser; nothing is uploaded to a server.", False),
    ("Bảo mật: file được đọc và phân tích ngay trong trình duyệt; không có dữ liệu nào được gửi lên máy chủ.", False),
    ("See sheet 'Example' for a filled-in example (synthetic data).", False),
]
for i, (t, b) in enumerate(lines, 1):
    c = ws.cell(row=i, column=1, value=t)
    c.font = Font(name="Arial", bold=b, size=12 if b else 10)
ws.column_dimensions["A"].width = 130

# ---------------------------------------------------------------- data
DATA_COLS = ["ID", "Google Maps coordinates", "Latitude", "Longitude", "Exclude", "Exclusion reason",
             "Age", "Sex", "BMI", "WBC", "NLR", "FEV1_pct"]
ws = wb.create_sheet("Data")
for j, h in enumerate(DATA_COLS, 1):
    c = ws.cell(row=1, column=j, value=h)
    c.font, c.fill, c.border = WHITE, HEAD, BOX
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.column_dimensions[c.column_letter].width = 24 if j <= 4 else (18 if j == 6 else 14)
dv_ex = DataValidation(type="list", formula1='"yes,no"', allow_blank=True)
ws.add_data_validation(dv_ex)
dv_ex.add("E2:E5000")
ws.freeze_panes = "B2"
ws.row_dimensions[1].height = 30

# ---------------------------------------------------------------- variables
VAR_COLS = ["Column name", "Role", "Type", "Transform", "Unit", "Plausible min", "Plausible max",
            "Primary exposure (optional)", "Description", "Covariates for this outcome (optional)"]
VARS = [
    ["Age", "covariate", "continuous", "none", "years", 18, 110, "", "Age at measurement"],
    ["Sex", "covariate", "binary", "none", "1 = male, 0 = female", 0, 1, "", ""],
    ["BMI", "covariate", "continuous", "none", "kg/m²", 12, 60, "", "Body mass index"],
    ["WBC", "outcome", "continuous", "log", "×10⁹/L", 1, 50, "", "White blood cell count"],
    ["NLR", "outcome", "continuous", "log", "ratio", 0.1, 100, "", "Neutrophil-to-lymphocyte ratio"],
    ["FEV1_pct", "outcome", "continuous", "none", "% predicted", 5, 150, "", "Post-bronchodilator FEV1 % predicted", "Age, Sex"],
]
ws = wb.create_sheet("Variables")
for j, h in enumerate(VAR_COLS, 1):
    c = ws.cell(row=1, column=j, value=h)
    c.font, c.fill, c.border = WHITE, HEAD, BOX
    ws.column_dimensions[c.column_letter].width = [22, 13, 14, 11, 20, 13, 13, 30, 40, 30][j - 1]
for i, r in enumerate(VARS, 2):
    for j, v in enumerate(r, 1):
        c = ws.cell(row=i, column=j, value=v)
        c.font, c.border = BASE, BOX
ws.freeze_panes = "A2"
n_exp = len(EXPOSURES) + 1
rules = [("B", '"outcome,covariate,cluster,ignore"'), ("C", '"continuous,binary,count,categorical"'),
         ("D", '"none,log"'), ("H", f"=Exposures!$A$2:$A${n_exp}")]
for col, formula in rules:
    dv = DataValidation(type="list", formula1=formula, allow_blank=True, showDropDown=False)
    dv.error, dv.errorTitle = "Choose a value from the list", "Invalid value"
    ws.add_data_validation(dv)
    dv.add(f"{col}2:{col}200")

# ---------------------------------------------------------------- exposures
EXP_COLS = ["Key", "Exposure", "Domain", "Source", "Analysis scale", "Include", "Anchor (adjust, do not test)"]
ws = wb.create_sheet("Exposures")
for j, h in enumerate(EXP_COLS, 1):
    c = ws.cell(row=1, column=j, value=h)
    c.font, c.fill, c.border = WHITE, HEAD, BOX
    ws.column_dimensions[c.column_letter].width = [16, 42, 32, 40, 14, 10, 26][j - 1]
for i, e in enumerate(EXPOSURES, 2):
    scale = {"none": "as measured", "log10": "log10(m)", "log10p1": "log10(m + 1)"}[e["transform"]]
    vals = [e["key"], e["label"], e["domain"], e["source"], scale, "yes", "no"]
    for j, v in enumerate(vals, 1):
        c = ws.cell(row=i, column=j, value=v)
        c.font, c.border = BASE, BOX
for col in ("F", "G"):
    dv = DataValidation(type="list", formula1='"yes,no"', allow_blank=False)
    ws.add_data_validation(dv)
    dv.add(f"{col}2:{col}{n_exp}")
ws.freeze_panes = "B2"

# ---------------------------------------------------------------- settings
SET = [
    ("Setting", "Value", "Meaning"),
    ("fdr_level", 0.05, "False discovery rate threshold for flagging associations"),
    ("run_profiles", "yes", "Principal-component exposure profiles (yes/no)"),
    ("run_stability", "yes", "Elastic-net stability selection for continuous outcomes (yes/no)"),
    ("reference_point", "", "Optional 'lat, lng' of the study clinic; adds distance to it as an exposure"),
    ("max_robustness", 30, "Maximum number of nominal associations given the full robustness check"),
]
ws = wb.create_sheet("Settings")
for i, r in enumerate(SET, 1):
    for j, v in enumerate(r, 1):
        c = ws.cell(row=i, column=j, value=v)
        c.font, c.border = (WHITE, BOX) if i == 1 else (BASE, BOX)
        if i == 1:
            c.fill = HEAD
ws.column_dimensions["A"].width, ws.column_dimensions["B"].width, ws.column_dimensions["C"].width = 18, 20, 80
for cell, f in (("B3", '"yes,no"'), ("B4", '"yes,no"')):
    dv = DataValidation(type="list", formula1=f, allow_blank=False)
    ws.add_data_validation(dv)
    dv.add(cell)

# ---------------------------------------------------------------- example
ws = wb.create_sheet("Example")
ex = [DATA_COLS,
      ["EX-001", "10.77614, 106.63456", "", "", "", "", 67, 1, 21.4, 8.1, 2.6, 41],
      ["EX-002", "", 10.7626, 106.6602, "", "", 72, 1, 19.8, 9.4, 3.9, 28],
      ["EX-003", "10.75807, 106.64571", "", "", "", "", 59, 0, 24.9, 6.7, 1.8, 63],
      ["EX-004", "10.80160, 106.64930", "", "", "", "", 64, 1, 22.0, "", 2.2, 35],
      ["EX-005", "10.74521, 106.62890", "", "", "yes", "FEV1/FVC >= 0.70", 70, 1, 18.6, 7.5, 2.9, ""]]
for i, r in enumerate(ex, 1):
    for j, v in enumerate(r, 1):
        c = ws.cell(row=i, column=j, value=v)
        c.font = WHITE if i == 1 else BASE
        c.border = BOX
        if i == 1:
            c.fill = HEAD
for j in range(1, len(DATA_COLS) + 1):
    ws.column_dimensions[ws.cell(row=1, column=j).column_letter].width = 20
ws.cell(row=8, column=1, value="Synthetic example. Empty cells = missing values (EX-004 WBC, EX-005 FEV1); EX-005 is excluded.").font = Font(name="Arial", italic=True, size=9)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
wb.save(OUT)
print("wrote", OUT)
