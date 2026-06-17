import matiBoundary from '../assets/map/mati-boundary.json';

/** Mati City boundary from PSGC medres (`davao-oriental-medres.json`), feature `City of Mati` (adm3_psgc 1102509000). */
export const MATI_CITY_VICINITY_MESSAGE =
  'The selected destination is outside Mati City. Pass slips are only valid for destinations within Mati City.';

type Position = [number, number];

type PolygonCoords = Position[][];
type MultiPolygonCoords = PolygonCoords[];

interface MatiGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: PolygonCoords | MultiPolygonCoords;
}

interface MatiFeature {
  geometry: MatiGeometry;
}

interface MatiFeatureCollection {
  features: MatiFeature[];
}

const boundary = matiBoundary as MatiFeatureCollection;

function pointInRing(point: Position, ring: Position[]): boolean {
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

function pointInPolygonCoords(point: Position, polygon: PolygonCoords): boolean {
  if (!polygon.length) return false;
  if (!pointInRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(point, polygon[i])) return false;
  }
  return true;
}

function pointInGeometry(point: Position, geometry: MatiGeometry): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygonCoords(point, geometry.coordinates as PolygonCoords);
  }
  return (geometry.coordinates as MultiPolygonCoords).some((poly) => pointInPolygonCoords(point, poly));
}

export function isWithinMatiCity(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const point: Position = [longitude, latitude];
  return boundary.features.some((feature) => pointInGeometry(point, feature.geometry));
}

export { boundary as matiCityBoundary };
