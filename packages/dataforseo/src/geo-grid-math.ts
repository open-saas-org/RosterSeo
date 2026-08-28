// Pure math, no I/O - generates the lat/lng points for a geo-grid rank
// scan. Uses a simple equirectangular degree-offset approximation (not
// real geodesic/GIS math): fine at the scale these scans operate at (a few
// km radius around a business), not intended for large-area precision.

export interface GridPoint {
  lat: number;
  lng: number;
  row: number;
  col: number;
}

export interface GenerateGridPointsInput {
  centerLat: number;
  centerLng: number;
  gridSize: number; // odd number (3/5/7) so there's always a true center point
  radiusKm: number; // distance from center to the grid's outer edge
}

const KM_PER_DEGREE_LAT = 111.32;

// Generates an NxN grid (gridSize x gridSize) centered on (centerLat,
// centerLng), spanning +/- radiusKm in each direction. Longitude degrees
// shrink toward the poles, so its km-per-degree is scaled by cos(latitude).
export function generateGridPoints({ centerLat, centerLng, gridSize, radiusKm }: GenerateGridPointsInput): GridPoint[] {
  const kmPerDegreeLng = KM_PER_DEGREE_LAT * Math.cos((centerLat * Math.PI) / 180);
  const half = Math.floor(gridSize / 2);
  const points: GridPoint[] = [];

  for (let row = -half; row <= half; row++) {
    for (let col = -half; col <= half; col++) {
      const latOffsetKm = (row / half || 0) * radiusKm;
      const lngOffsetKm = (col / half || 0) * radiusKm;
      points.push({
        lat: centerLat + latOffsetKm / KM_PER_DEGREE_LAT,
        lng: centerLng + lngOffsetKm / kmPerDegreeLng,
        row: row + half,
        col: col + half,
      });
    }
  }

  return points;
}
