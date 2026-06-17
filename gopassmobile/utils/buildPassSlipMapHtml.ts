import { matiCityBoundary } from './matiCityVicinity';

export interface PassSlipLeafletMapState {
  center: { latitude: number; longitude: number };
  currentUserLocation: { latitude: number; longitude: number } | null;
  selectedLocation: { latitude: number; longitude: number } | null;
  routeCoordinates: Array<{ latitude: number; longitude: number }>;
  shouldFitRoute: boolean;
}

const MATI_BOUNDARY_JSON = JSON.stringify(matiCityBoundary);

export function buildPassSlipMapHtml(state: PassSlipLeafletMapState): string {
  const stateJson = JSON.stringify(state);

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      html, body, #map { height: 100%; margin: 0; padding: 0; background: #0a0a14; }
      .leaflet-control-attribution { display: none !important; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const matiBoundary = ${MATI_BOUNDARY_JSON};
      const state = ${stateJson};

      function pointInRing(point, ring) {
        const x = point[0];
        const y = point[1];
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const xi = ring[i][0];
          const yi = ring[i][1];
          const xj = ring[j][0];
          const yj = ring[j][1];
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
        return geometry.coordinates.some(function (poly) {
          return pointInPolygonCoords(point, poly);
        });
      }

      function isWithinMatiCity(latitude, longitude) {
        const point = [longitude, latitude];
        return matiBoundary.features.some(function (feature) {
          return pointInGeometry(point, feature.geometry);
        });
      }

      function ringToLatLngs(ring) {
        return ring.map(function (coord) { return [coord[1], coord[0]]; });
      }

      function collectMatiHoleRings(geojson) {
        const holes = [];
        geojson.features.forEach(function (feature) {
          const geom = feature.geometry;
          if (geom.type === 'Polygon') {
            holes.push(ringToLatLngs(geom.coordinates[0]).reverse());
          } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach(function (poly) {
              holes.push(ringToLatLngs(poly[0]).reverse());
            });
          }
        });
        return holes;
      }

      const matiGeoLayer = L.geoJSON(matiBoundary);
      const matiBounds = matiGeoLayer.getBounds();
      const map = L.map('map', {
        maxBounds: matiBounds.pad(0.08),
        maxBoundsViscosity: 1.0,
      }).setView([state.center.latitude, state.center.longitude], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const worldMask = [[-90, -180], [-90, 180], [90, 180], [90, -180], [-90, -180]];
      const matiHoles = collectMatiHoleRings(matiBoundary);
      L.polygon([worldMask].concat(matiHoles), {
        stroke: false,
        fillColor: '#0a0a14',
        fillOpacity: 0.78,
        interactive: false,
      }).addTo(map);

      L.geoJSON(matiBoundary, {
        style: {
          color: '#fece00',
          weight: 2.5,
          fillColor: '#ffffff',
          fillOpacity: 0.04,
        },
        interactive: false,
      }).addTo(map);

      map.fitBounds(matiBounds, { padding: [36, 36] });

      const points = [];
      if (state.currentUserLocation) {
        const userLatLng = [state.currentUserLocation.latitude, state.currentUserLocation.longitude];
        L.circleMarker(userLatLng, {
          radius: 8,
          color: '#ffffff',
          weight: 2,
          fillColor: '#1d4ed8',
          fillOpacity: 1,
        }).addTo(map).bindPopup('Your Location');
        points.push(userLatLng);
      }
      if (state.selectedLocation) {
        const destLatLng = [state.selectedLocation.latitude, state.selectedLocation.longitude];
        L.circleMarker(destLatLng, {
          radius: 9,
          color: '#ffffff',
          weight: 2,
          fillColor: '#dc3545',
          fillOpacity: 1,
        }).addTo(map).bindPopup('Selected Destination');
        points.push(destLatLng);
      }
      if (state.routeCoordinates && state.routeCoordinates.length > 0) {
        const route = state.routeCoordinates.map(function (p) { return [p.latitude, p.longitude]; });
        L.polyline(route, { color: '#dc3545', weight: 4 }).addTo(map);
        points.push.apply(points, route);
      }
      if (state.shouldFitRoute && points.length > 1) {
        map.fitBounds(points, { padding: [48, 48] });
      }

      map.on('click', function (e) {
        if (!isWithinMatiCity(e.latlng.lat, e.latlng.lng)) {
          return;
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'map-press',
          latitude: e.latlng.lat,
          longitude: e.latlng.lng,
        }));
      });
    </script>
  </body>
</html>
  `;
}
