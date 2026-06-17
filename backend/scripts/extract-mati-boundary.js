/**
 * Extract City of Mati from davao-oriental-medres.json into app boundary assets.
 *
 * Usage:
 *   node backend/scripts/extract-mati-boundary.js [path-to-davao-oriental-medres.json]
 */
const fs = require('fs');
const path = require('path');

const defaultSource = path.resolve(
  __dirname,
  '../../../capstone/respondr/assets/map/davao-oriental-medres.json',
);
const sourcePath = process.argv[2] ? path.resolve(process.argv[2]) : defaultSource;

const data = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const mati = {
  type: 'FeatureCollection',
  features: data.features.filter(
    (feature) =>
      feature.properties &&
      (feature.properties.adm3_en === 'City of Mati' || feature.properties.adm3_psgc === 1102509000),
  ),
};

if (mati.features.length === 0) {
  console.error('No City of Mati feature found in', sourcePath);
  process.exit(1);
}

const targets = [
  path.resolve(__dirname, '../assets/map/mati-boundary.json'),
  path.resolve(__dirname, '../../gopassmobile/assets/map/mati-boundary.json'),
];

for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(mati));
  console.log('Wrote', target);
}
