import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { featureMeta } = await import(path.join(root, "src/analysis/exposureFeatures.js"));
fs.writeFileSync(path.join(root, "public/analysis/exposures.json"), JSON.stringify(featureMeta(false), null, 1));
console.log(featureMeta(false).length);
