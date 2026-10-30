// OPTIONAL path — export ACAG satellite-derived PM2.5 from the Google Earth
// Engine community catalog (awesome-gee-community-catalog, "sat-io").
//
// Prefer the official ACAG NetCDF (V6.GL.03, through 2024 — see
// scripts/colab_pm25_1cell.py) when you can:
// the community-catalog copy may lag behind the newest ACAG release. The
// print() below shows which years / properties the catalog actually holds —
// check it before trusting the version label.
//
// Paste into https://code.earthengine.google.com, run, then start the task in
// the "Tasks" tab. Afterwards:
//   python scripts/build_pm25_grid.py --input ACAG_PM25_<YEAR>_HCMC.tif \
//       --product "ACAG V6.GL.02 (GEE sat-io copy)" --period <YEAR>

var YEAR = 2022;
var col = ee.ImageCollection('projects/sat-io/open-datasets/GLOBAL-SATELLITE-PM25/ANNUAL');
print('Catalog contents (check version + years):', col.limit(40));

// Whole post-merger HCMC incl. Côn Đảo — same default bbox as the Python script.
var region = ee.Geometry.Rectangle([106.25, 8.55, 107.70, 11.60], 'EPSG:4326', false);

var img = col.filterDate(YEAR + '-01-01', (YEAR + 1) + '-01-01').first();
img = ee.Image(img).select(0).toFloat();
print('Selected image:', img);

// Export on the image's OWN grid (crs + crsTransform) so Earth Engine does
// not resample the native 0.01° cells. Do NOT pass `scale` here.
var proj = img.projection().getInfo();
Export.image.toDrive({
  image: img,
  description: 'ACAG_PM25_' + YEAR + '_HCMC',
  region: region,
  crs: proj.crs,
  crsTransform: proj.transform,
  fileFormat: 'GeoTIFF',
  maxPixels: 1e9
});

Map.centerObject(region, 8);
Map.addLayer(img.clip(region), {min: 15, max: 40, palette: ['fff7bc', 'fec44f', 'ec7014', '8c2d04']}, 'PM2.5 ' + YEAR);
