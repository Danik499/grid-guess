import { useMemo, useState } from "react";
import {
  geoAzimuthalEqualArea,
  geoDistance,
  geoEqualEarth,
  geoMercator,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
  range,
  type GeoPermissibleObjects,
  type GeoProjection,
} from "d3";
import world from "./custom.geo.json";
import { createGrid } from "./lib/GridLayer";

const width = 1000;
const height = 700;
// Leaves room around the map for the axis labels
const padding = 50;

// Grid cell size in degrees of longitude/latitude
const GRID_STEP = 20;

const projections = {
  geoEqualEarth,
  geoNaturalEarth1,
  geoMercator,
  geoOrthographic,
  geoAzimuthalEqualArea,
};
type ProjectionName = keyof typeof projections;

const formatLon = (lon: number) =>
  `${Math.abs(lon)}°${lon < 0 ? "W" : lon > 0 ? "E" : ""}`;
const formatLat = (lat: number) =>
  `${Math.abs(lat)}°${lat < 0 ? "S" : lat > 0 ? "N" : ""}`;

/**
 * Projects a point and returns its SVG position, or null when it is not
 * drawn: infinite (Mercator poles), outside the SVG, or on the far side of
 * the globe (the point does not survive a round trip through `invert`).
 */
function projectVisible(
  projection: GeoProjection,
  point: [number, number],
): [number, number] | null {
  const xy = projection(point);
  if (!xy || !xy.every(Number.isFinite)) return null;
  const [x, y] = xy;
  if (x < 0 || x > width || y < 0 || y > height) return null;
  const back = projection.invert?.(xy);
  if (!back || geoDistance(back, point) > 1e-6) return null;
  return xy;
}

/** First visible point along `candidates`, in order. */
function firstVisible(
  projection: GeoProjection,
  candidates: [number, number][],
) {
  for (const point of candidates) {
    const xy = projectVisible(projection, point);
    if (xy) return xy;
  }
  return null;
}

const lons = range(Math.ceil(-180 / GRID_STEP) * GRID_STEP, 181, GRID_STEP);
const lats = range(Math.ceil(-90 / GRID_STEP) * GRID_STEP, 91, GRID_STEP).filter(
  (lat) => Math.abs(lat) < 90,
);
const southToNorth = range(-90, 91, 1);
const westToEast = range(-180, 181, 1);

// Meridians are labelled where they meet the southern edge of the map,
// parallels where they meet the western edge. Each label shows the degrees
// and the projected (SVG) coordinate of the label position.
function computeLabels(projection: GeoProjection) {
  const meridians = lons.flatMap((lon) => {
    const xy = firstVisible(
      projection,
      southToNorth.map((lat) => [lon, lat]),
    );
    return xy ? [{ lon, x: xy[0], y: xy[1] }] : [];
  });
  const parallels = lats.flatMap((lat) => {
    const xy = firstVisible(
      projection,
      westToEast.map((lon) => [lon, lat]),
    );
    return xy ? [{ lat, x: xy[0], y: xy[1] }] : [];
  });
  return { meridians, parallels };
}

function App() {
  const [projectionName, setProjectionName] =
    useState<ProjectionName>("geoEqualEarth");

  const { worldPath, gridPath, labels } = useMemo(() => {
    const projection = projections[projectionName]().fitExtent(
      [
        [padding, padding],
        [width - padding, height - padding],
      ],
      { type: "Sphere" },
    );
    const pathGenerator = geoPath(projection);
    return {
      worldPath: pathGenerator(world as GeoPermissibleObjects)!,
      gridPath: pathGenerator(createGrid(GRID_STEP)())!,
      labels: computeLabels(projection),
    };
  }, [projectionName]);

  return (
    <div className="flex h-screen flex-col items-center gap-2 p-4">
      <select
        value={projectionName}
        onChange={(e) => setProjectionName(e.target.value as ProjectionName)}
      >
        {Object.keys(projections).map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <svg className="min-h-0 w-full flex-1" viewBox={`0 0 ${width} ${height}`}>
        <path d={worldPath} />
        <path d={gridPath} fill="none" stroke="green" strokeWidth={1} />
        <g fontSize={10} fill="currentColor">
          {labels.meridians.map(({ lon, x, y }) => (
            <text key={`lon${lon}`} x={x} y={y + 14} textAnchor="middle">
              <tspan>{formatLon(lon)}</tspan>
              <tspan x={x} dy={11}>
                x={Math.round(x)}
              </tspan>
            </text>
          ))}
          {labels.parallels.map(({ lat, x, y }) => (
            <text key={`lat${lat}`} x={x - 6} y={y - 2} textAnchor="end">
              <tspan>{formatLat(lat)}</tspan>
              <tspan x={x - 6} dy={11}>
                y={Math.round(y)}
              </tspan>
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}

export default App;
