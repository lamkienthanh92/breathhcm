// Exposure features for the outcome-analysis module.
//
// Turns one measurePoint() result (src/measure.js) into a flat set of
// numeric exposures with stable keys. Every analysis exposure is defined
// here once, with its domain, source and the transform the analysis applies,
// so the browser module, the template's "Exposures" sheet and the
// reproducibility script all use the same definitions.
//
// Counts use ONE uniform 1-km buffer for every point-of-interest category
// (the map panel's per-category "count nearby" radii differ and must not be
// used for analysis). Distances are passed raw (metres); the analysis applies
// the log10 transform named in `transform`.

import { haversine } from "../sourceUtils.js";

export const DOMAINS = {
  air: "Ambient air quality",
  green: "Greenness & blue space",
  urban: "Urban form, density & heat",
  landuse: "Pollution-emitting land uses",
  services: "Urban services & health-care access",
  roads: "Traffic & roads",
};

const BUFFER_M = 1000;
const ROAD_LAMBDA_M = 100;
const ROAD_NEAR_M = 200;

const grid = (key, label, domain, source, extra = {}) => ({ key, label, domain, source, kind: "grid", transform: "none", ...extra });
const count = (cat, label, domain) => ({
  key: `${cat}_n1km`, label: `${label} within 1 km (n)`, domain, source: "OpenStreetMap", kind: "count", cat, transform: "none",
});
const dist = (cat, label, domain) => ({
  key: `${cat}_dist`, label: `Distance to ${label} (m)`, domain, source: "OpenStreetMap", kind: "dist", cat, transform: "log10",
});

export const FEATURES = [
  // Ambient air quality
  grid("pm25", "PM2.5, satellite (µg/m³)", "air", "ACAG SatPM V6.GL.03, 0.01°"),
  grid("no2", "NO2 column index", "air", "Sentinel-5P TROPOMI"),
  grid("co", "CO column index", "air", "Sentinel-5P TROPOMI"),
  grid("so2", "SO2 column index", "air", "Sentinel-5P TROPOMI", { nonNegative: true }),
  grid("o3", "O3 tropospheric column index", "air", "Sentinel-5P TROPOMI"),
  // Greenness & blue space
  grid("ndvi", "NDVI", "green", "MODIS 2020–2024, 250 m"),
  grid("evi", "EVI", "green", "MODIS 2020–2024, 250 m"),
  grid("water", "Surface water occurrence (%)", "green", "JRC 1984–2021"),
  grid("treecover", "Tree canopy cover 2000 (%)", "green", "Hansen GFC"),
  count("park", "Urban parks", "green"),
  dist("forest", "forest / woodland", "green"),
  // Urban form, density & heat
  grid("builtup", "Built-up surface (%)", "urban", "GHSL 2020, 100 m"),
  grid("population", "Population (per 100-m cell)", "urban", "WorldPop 2024, 100 m"),
  grid("nightlights", "Night-time light radiance (nW/cm²/sr)", "urban", "VIIRS DNB, 12-month mean"),
  grid("lst", "Land surface temperature (°C)", "urban", "MODIS 2025, 1 km"),
  grid("elevation", "Elevation (m)", "urban", "SRTM, 30 m"),
  grid("forestloss", "Forest loss since 2000 (%)", "urban", "Hansen GFC"),
  // Pollution-emitting land uses
  count("industrial", "Industrial sites", "landuse"),
  count("fuel", "Fuel stations", "landuse"),
  count("market", "Traditional markets", "landuse"),
  dist("butcher", "butcher / meat processing", "landuse"),
  dist("publicinfra", "water / waste infrastructure", "landuse"),
  dist("wastewater", "wastewater treatment plant", "landuse"),
  dist("landfill", "landfill", "landuse"),
  dist("farm", "farm / livestock land", "landuse"),
  // Urban services & health-care access
  count("hospital", "Hospitals", "services"),
  count("clinic", "Clinics / pharmacies", "services"),
  count("school", "Schools", "services"),
  dist("recreation", "sports / recreation facility", "services"),
  dist("veterinary", "veterinary facility", "services"),
  // Traffic & roads
  {
    key: "road_kernel", label: "Road kernel index, Σ exp(−d/100 m)", domain: "roads", kind: "road",
    source: "OpenStreetMap major roads (444 named roads)", transform: "none",
  },
  {
    key: "road_mindist", label: "Distance to nearest major road (m)", domain: "roads", kind: "road",
    source: "OpenStreetMap major roads", transform: "log10p1",
  },
  {
    key: "road_n200", label: "Major roads within 200 m (n)", domain: "roads", kind: "road",
    source: "OpenStreetMap major roads", transform: "none",
  },
];

export const REFERENCE_FEATURE = {
  key: "ref_dist", label: "Distance to reference point (m)", domain: "services", kind: "ref",
  source: "Geocoded residence", transform: "log10",
};

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// m: measurePoint() result. ref: optional {lat, lng} (e.g. the study clinic).
export function featuresFor(m, ref = null) {
  const out = {};
  const oh = m.oneHealth || {};
  const byCat = {};
  for (const s of m.sourceDists || []) (byCat[s.cat] = byCat[s.cat] || []).push(s.dist);
  for (const f of FEATURES) {
    let v = null;
    if (f.kind === "grid") v = f.key === "pm25" ? num(m.pm25) : f.key === "ndvi" ? num(m.ndvi) : f.key === "evi" ? num(m.evi) : num(oh[f.key]);
    else if (f.kind === "count") v = (byCat[f.cat] || []).filter((d) => d <= BUFFER_M).length;
    else if (f.kind === "dist") v = byCat[f.cat]?.length ? Math.min(...byCat[f.cat]) : null;
    else if (f.key === "road_kernel") v = (m.dists || []).reduce((a, d) => a + Math.exp(-d.dist / ROAD_LAMBDA_M), 0);
    else if (f.key === "road_mindist") v = num(m.minDist);
    else if (f.key === "road_n200") v = (m.dists || []).filter((d) => d.dist <= ROAD_NEAR_M).length;
    out[f.key] = v;
  }
  if (ref) out[REFERENCE_FEATURE.key] = haversine(m.geo.lat, m.geo.lng, ref.lat, ref.lng);
  out._ward = m.ward?.name ?? null;
  return out;
}

export function featureMeta(withRef = false) {
  const list = withRef ? [...FEATURES, REFERENCE_FEATURE] : FEATURES;
  return list.map(({ key, label, domain, source, transform, nonNegative }) => ({
    key, label, domain: DOMAINS[domain], source, transform, nonNegative: !!nonNegative,
  }));
}
