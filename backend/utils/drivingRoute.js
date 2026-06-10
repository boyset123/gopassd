/** Default origin for Mati-area pass slips when GPS / route were not stored. */
const DORSU_MATI_ORIGIN = { lat: 7.0731, lon: 126.2167, name: 'DOrSU (Mati area)' };

/**
 * Fetch driving route coordinates via OSRM (GeoJSON). Returns [lat, lon] pairs for Leaflet.
 * @returns {Promise<Array<[number, number]> | null>}
 */
async function fetchDrivingRouteCoords(startLat, startLon, destLat, destLon, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${destLon},${destLat}` +
      '?overview=full&geometries=geojson';
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const json = await response.json();
    const coords = json?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    return coords.map(([lon, lat]) => [lat, lon]);
  } catch (error) {
    console.warn('OSRM route fetch failed:', error?.message || error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function straightLineCoords(startLat, startLon, destLat, destLon) {
  return [
    [startLat, startLon],
    [destLat, destLon],
  ];
}

/**
 * Resolve origin + route coordinates for HR map view.
 * @param {{ latitude?: number, longitude?: number, originLatitude?: number, originLongitude?: number, routePolyline?: string }} slip
 */
async function resolvePassSlipMapRoute(slip) {
  const destLat = slip.latitude;
  const destLon = slip.longitude;

  if (destLat == null || destLon == null) {
    return null;
  }

  let originLat = slip.originLatitude;
  let originLon = slip.originLongitude;
  let originLabel = 'Origin';

  if (originLat == null || originLon == null) {
    originLat = DORSU_MATI_ORIGIN.lat;
    originLon = DORSU_MATI_ORIGIN.lon;
    originLabel = DORSU_MATI_ORIGIN.name;
  }

  let routeCoordinates = null;
  if (!slip.routePolyline) {
    routeCoordinates = await fetchDrivingRouteCoords(originLat, originLon, destLat, destLon);
    if (!routeCoordinates || routeCoordinates.length < 2) {
      routeCoordinates = straightLineCoords(originLat, originLon, destLat, destLon);
    }
  }

  return {
    originLatitude: originLat,
    originLongitude: originLon,
    originLabel,
    routeCoordinates,
  };
}

module.exports = {
  DORSU_MATI_ORIGIN,
  fetchDrivingRouteCoords,
  resolvePassSlipMapRoute,
  straightLineCoords,
};
