# BREATH-HCMC

**Residential exposure assessment and exposome-wide analysis in the browser — Ho Chi Minh City, Vietnam**

Live application: https://breath-hcmc.netlify.app/

BREATH-HCMC measures 33 residential environmental exposures from open satellite products and OpenStreetMap for any coordinate in Ho Chi Minh City and analyses them against user-supplied outcomes. All computation runs in the user's browser; no participant data are uploaded.

## Features
- **Exposure measurement**: satellite PM2.5 (ACAG V6.GL.03, 0.01°), Sentinel-5P NO2, CO, SO2 and O3, MODIS NDVI, EVI and land surface temperature, VIIRS night-time light, GHSL built-up surface, WorldPop population, SRTM elevation, and OpenStreetMap counts within 1 km and distances for 15 facility categories, plus major-road metrics (kernel index, nearest distance, roads within 200 m).
- **Template workflow**: download the Excel template, paste Google Maps coordinates and outcomes, upload — everything else is automatic.
- **Safeguards**: data-quality audit (plausible ranges, median-imputation detection, extreme values, digit preference), exposure screening and contrast reporting, Benjamini–Hochberg FDR, minimal detectable effects, and robustness checks for every nominal association (spatial trend surface, ward-clustered errors, anchor removal, exclusion of flagged records, leave-one-out).
- **Further analyses**: domain tests, exposure profiles (PCA, parallel analysis, varimax), elastic-net stability selection, restricted cubic splines, Moran's I of residuals.
- **Privacy-preserving maps**: ward aggregates only; wards with fewer than five participants are suppressed inside the engine.
- **Outputs**: Excel workbook, HTML report, SVG figures and maps, reproducibility package, analysis-plan fingerprint for pre-registration, R script for independent re-analysis.

## Run locally
```bash
npm install
npm start            # development server
npm run build        # production build in ./build
```
Node.js 18 or 20. The analysis module downloads Pyodide 0.26.4 (numpy, pandas, scipy, scikit-learn) from jsDelivr on first use and the browser caches it.

## Repository layout
| Path | Content |
|---|---|
| `src/`, `public/` | Web application; exposure definitions in `src/analysis/exposureFeatures.js`; Python analysis engine in `public/analysis/breath_analysis.py` |
| `scripts/` | `validate_engine.py` (estimator checks), `simulate_validation.py` (simulation study), template and exposure-list builders, batch exporter |
| `validation/` | Independent WGS84 implementation, convergent validity, computational equivalence and run-time scripts; `figures/` holds the article's figure code (needs residence-level intermediate files, available on request) |
| `data/` | 1,000 random evaluation points with all exposures, 45-column exposure surface grid, aggregated validation and simulation results, Supplementary Tables S1–S7 |

## Reproduce the validation
```bash
cd validation
node export_app_data.mjs        # app data for the independent implementation
node measure_points.mjs         # app measurements at the random points
python independent.py           # agreement with an independent WGS84 implementation
python convergent.py            # convergent validity across independent sensors
python compval.py               # engine vs reference implementations
python perf.py                  # run time
python ../scripts/validate_engine.py
```
Python 3.10+ with numpy, pandas, scipy and scikit-learn. All random draws use fixed seeds.

## Privacy
Residential coordinates and residence-level exposures of study participants are not included. Every script runs unchanged on `validation/points_random.json`.

## Citation
See `CITATION.cff`. Please also cite the accompanying article once published.

## License
MIT (see `LICENSE`). Data layers remain subject to their providers' terms; OpenStreetMap data © OpenStreetMap contributors (ODbL).
