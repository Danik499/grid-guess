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
