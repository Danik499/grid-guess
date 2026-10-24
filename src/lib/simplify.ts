import type { FeatureCollection } from "geojson";

type Coords = number[] | Coords[];

/** Every `step`th point of each line, for drawing while the map moves. */
function thin(coords: Coords, step: number): Coords {
  if (typeof coords[0] === "number") return coords;
  const parts = coords as Coords[];
  if (typeof parts[0][0] !== "number") return parts.map((c) => thin(c, step));
  return parts.filter((_, i) => i % step === 0 || i === parts.length - 1);
}

export const thinWorld = (
  world: FeatureCollection,
  step: number,
): FeatureCollection => ({
  ...world,
  features: world.features.map((f) =>
    "coordinates" in f.geometry
      ? {
          ...f,
          geometry: {
            ...f.geometry,
            coordinates: thin(f.geometry.coordinates as Coords, step),
          } as typeof f.geometry,
        }
      : f,
  ),
});
