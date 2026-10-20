import {
  geoEqualEarth,
  geoEqualEarthRaw,
  geoEquirectangular,
  geoEquirectangularRaw,
  geoMercator,
  geoNaturalEarth1,
  geoNaturalEarth1Raw,
} from "d3";
import { clampedMercatorRaw } from "./projectionTransition";

// `raw` is what transitions blend between
export const projections = {
  geoEqualEarth: { create: geoEqualEarth, raw: geoEqualEarthRaw },
  geoNaturalEarth1: { create: geoNaturalEarth1, raw: geoNaturalEarth1Raw },
  geoMercator: { create: geoMercator, raw: clampedMercatorRaw },
  geoEquirectangular: {
    create: geoEquirectangular,
    raw: geoEquirectangularRaw,
  },
};
export type ProjectionName = keyof typeof projections;

export const projectionLabels: Record<ProjectionName, string> = {
  geoEqualEarth: "Equal Earth",
  geoNaturalEarth1: "Natural Earth",
  geoMercator: "Mercator",
  geoEquirectangular: "Equirectangular",
};
