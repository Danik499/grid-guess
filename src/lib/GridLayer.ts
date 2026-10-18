import { geoGraticule } from "d3";

/** Grid covering the whole globe, with square cells of `step` degrees. */
export function createGrid(step: number) {
  return geoGraticule()
    .extent([
      [-180, -90],
      [180, 90],
    ])
    .step([step, step]);
}

export interface GridCell {
  lon0: number;
  lat0: number;
  lon1: number;
  lat1: number;
}

/** The grid cell, for a grid made by `createGrid(step)`, containing a point. */
export function cellAt([lon, lat]: [number, number], step: number): GridCell {
  const lon0 = Math.max(Math.floor(lon / step) * step, -180);
  const lat0 = Math.max(Math.floor(lat / step) * step, -90);
  return {
    lon0,
    lat0,
    lon1: Math.min(lon0 + step, 180),
    lat1: Math.min(lat0 + step, 90),
  };
}

/** Polygon for a cell. Edges are densified so they follow any projection. */
export function cellOutline({ lon0, lat0, lon1, lat1 }: GridCell) {
  return geoGraticule()
    .extent([
      [lon0, lat0],
      [lon1, lat1],
    ])
    .outline();
}
