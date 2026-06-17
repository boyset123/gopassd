const matiBoundary = require('../assets/map/mati-boundary.json');

/** Mati City boundary from PSGC medres (`davao-oriental-medres.json`), feature `City of Mati` (adm3_psgc 1102509000). */

const MATI_CITY_VICINITY_MESSAGE =
  'The selected destination is outside Mati City. Pass slips are only valid for destinations within Mati City.';

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(point, polygon) {
  if (!polygon.length) return false;
  if (!pointInRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(point, polygon[i])) return false;
  }
  return true;
}

function pointInGeometry(point, geometry) {
  if (geometry.type === 'Polygon') {
    return pointInPolygonCoords(point, geometry.coordinates);
  }
  return geometry.coordinates.some((poly) => pointInPolygonCoords(point, poly));
}

function isWithinMatiCity(latitude, longitude) {
  if (latitude == null || longitude == null) return false;
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const point = [lon, lat];
  return matiBoundary.features.some((feature) => pointInGeometry(point, feature.geometry));
}

module.exports = {
  MATI_CITY_VICINITY_MESSAGE,
  isWithinMatiCity,
  matiCityBoundary: matiBoundary,
};
