import { useEffect, useMemo, useState, type PointerEvent } from "react";
import {
  geoDistance,
  geoEqualEarth,
  geoEquirectangular,
  geoMercator,
  geoNaturalEarth1,
  geoPath,
  json,
  range,
  type GeoProjection,
} from "d3";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import {
  cellAt,
  cellOutline,
  createGrid,
  createGridOutline,
  type GridCell,
} from "./lib/GridLayer";
import {
  cellKey,
  computeCountryCells,
  type RankedCellShare,
} from "./lib/countryArea";
import { regions, type Extent, type RegionName } from "./lib/regions";

const width = 1000;
const height = 700;
// Leaves room around the map for the axis labels
const padding = 50;

const projections = {
  geoEqualEarth,
  geoNaturalEarth1,
  geoMercator,
  geoEquirectangular,
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

// Meridians are labelled where they meet the southern edge of the map,
// parallels where they meet the western edge. Each label shows the degrees
// and the projected (SVG) coordinate of the label position.
function computeLabels(
  projection: GeoProjection,
  [[lon0, lat0], [lon1, lat1]]: Extent,
  step: number,
) {
  const lons = range(Math.ceil(lon0 / step) * step, lon1 + 1, step);
  const lats = range(Math.ceil(lat0 / step) * step, lat1 + 1, step).filter(
    (lat) => Math.abs(lat) < 90,
  );
  const southToNorth = range(lat0, lat1 + 1, 1);
  const westToEast = range(lon0, lon1 + 1, 1);
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

type Country = Feature<Geometry, { name: string; continent: string }>;

const pickRandomCountry = (
  countries: Country[],
  continents: string[] | null,
): Country => {
  const pool = continents
    ? countries.filter((c) => continents.includes(c.properties.continent))
    : countries;
  return pool[Math.floor(Math.random() * pool.length)];
};

const formatKm2 = (km2: number) =>
  `${Math.round(km2).toLocaleString("en-US")} km²`;
const formatPercent = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

function CellInfo({
  countryName,
  cell,
  share,
  cellCount,
  best,
  totalKm2,
}: {
  countryName: string;
  cell: GridCell | null;
  share: RankedCellShare | undefined;
  cellCount: number;
  best: { share: number };
  totalKm2: number;
}) {
  if (!cell) {
    return (
      <div className="h-12 text-sm opacity-60">
        Click a cell to see how much of {countryName} lies in it (
        {formatKm2(totalKm2)} in total).
      </div>
    );
  }
  const where = `${formatLon(cell.lon0)}–${formatLon(cell.lon1)}, ${formatLat(cell.lat0)}–${formatLat(cell.lat1)}`;
  return (
    <div className="h-12 text-sm">
      <div className="font-semibold">
        {where}:{" "}
        {share
          ? `${formatPercent(share.share)} of ${countryName} (${formatKm2(share.areaKm2)})`
          : `no part of ${countryName}`}
      </div>
      {share && (
        <div className="opacity-80">
          Covers {formatPercent(share.coverage)} of the cell · rank {share.rank}{" "}
          of {cellCount} · {formatPercent(share.share / best.share)} of the best
          cell
        </div>
      )}
    </div>
  );
}

interface MapData {
  countries: Country[];
  world: FeatureCollection;
}

type CountriesTopology = Topology<{
  countries: GeometryCollection<Country["properties"]>;
}>;
type CoastlineTopology = Topology<{ coastline: GeometryCollection }>;

// TopoJSON built from data/ by `npm run data`, served from public/ so it
// stays out of the JS bundle
async function loadMapData(): Promise<MapData> {
  const base = import.meta.env.BASE_URL;
  const [countries, coastline] = await Promise.all([
    json<CountriesTopology>(`${base}countries.topo.json`),
    json<CoastlineTopology>(`${base}coastline.topo.json`),
  ]);
  if (!countries || !coastline) throw new Error("Map data is empty");
  return {
    countries: feature(countries, countries.objects.countries).features,
    world: feature(coastline, coastline.objects.coastline),
  };
}

function App() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMapData()
      .then(setData)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  if (error) {
    return <div className="p-4">Could not load map data: {error}</div>;
  }
  if (!data) {
    return <div className="p-4 opacity-60">Loading map…</div>;
  }
  return <Game {...data} />;
}

function Game({ countries, world }: MapData) {
  const [projectionName, setProjectionName] =
    useState<ProjectionName>("geoEqualEarth");
  const [regionName, setRegionName] = useState<RegionName>("World");
  const { continents, extent, step } = regions[regionName];
  const [country, setCountry] = useState(() =>
    pickRandomCountry(countries, regions.World.continents),
  );

  const [hoveredCell, setHoveredCell] = useState<GridCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);

  const countryCells = useMemo(
    () => computeCountryCells(country.geometry, step),
    [country, step],
  );
  const selectedShare = selectedCell
    ? countryCells.byKey.get(cellKey(selectedCell))
    : undefined;

  const {
    projection,
    pathGenerator,
    worldPath,
    countryPath,
    gridPath,
    gridOutlinePath,
    labels,
  } = useMemo(() => {
    const box: Extent = [
      [padding, padding],
      [width - padding, height - padding],
    ];
    // Rotate the globe so the centre of the region is the centre of the map
    const [[lon0, lat0], [lon1, lat1]] = extent;
    const projection = projections[projectionName]()
      .rotate([-(lon0 + lon1) / 2, -(lat0 + lat1) / 2])
      .fitExtent(
        box,
        regionName === "World"
          ? { type: "Sphere" }
          : createGridOutline(step, extent),
      );
    // Keep coastlines and countries inside the region's frame
    if (regionName !== "World") {
      projection.clipExtent([
        [padding - 1, padding - 1],
        [width - padding + 1, height - padding + 1],
      ]);
    }
    const pathGenerator = geoPath(projection);
    return {
      projection,
      pathGenerator,
      worldPath: pathGenerator(world)!,
      countryPath: pathGenerator(country)!,
      gridPath: pathGenerator(createGrid(step, extent)())!,
      gridOutlinePath: pathGenerator(createGridOutline(step, extent))!,
      labels: computeLabels(projection, extent, step),
    };
  }, [projectionName, country, regionName, extent, step, world]);

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const inverse = svg.getScreenCTM()?.inverse();
    if (!inverse) return;
    // Pointer position in SVG (viewBox) coordinates
    const { x, y } = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      inverse,
    );
    const lonLat = projection.invert?.([x, y]);
    // Only cells over the map count: points outside the globe invert to
    // something that does not project back to where the pointer is.
    const back = lonLat && projection(lonLat);
    if (!lonLat || !back || Math.hypot(back[0] - x, back[1] - y) > 0.5) {
      setHoveredCell(null);
      return;
    }
    const [[lon0, lat0], [lon1, lat1]] = extent;
    if (
      lonLat[0] < lon0 ||
      lonLat[0] >= lon1 ||
      lonLat[1] < lat0 ||
      lonLat[1] >= lat1
    ) {
      setHoveredCell(null);
      return;
    }
    const cell = cellAt(lonLat, step);
    setHoveredCell((prev) =>
      prev && prev.lon0 === cell.lon0 && prev.lat0 === cell.lat0 ? prev : cell,
    );
  };

  return (
    <div className="flex h-screen flex-col items-center gap-2 p-4">
      <div className="flex gap-2">
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
        <select
          value={regionName}
          onChange={(e) => {
            const next = e.target.value as RegionName;
            setRegionName(next);
            setCountry(pickRandomCountry(countries, regions[next].continents));
            setSelectedCell(null);
            setHoveredCell(null);
          }}
        >
          {Object.keys(regions).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xl font-semibold">{country.properties.name}</span>
        <button
          type="button"
          className="rounded border px-2 py-0.5"
          onClick={() => {
            setCountry(pickRandomCountry(countries, continents));
            setSelectedCell(null);
          }}
        >
          New country
        </button>
      </div>
      <CellInfo
        countryName={country.properties.name}
        cell={selectedCell}
        share={selectedShare}
        cellCount={countryCells.cells.length}
        best={countryCells.cells[0]}
        totalKm2={countryCells.totalKm2}
      />
      <svg
        className="min-h-0 w-full flex-1"
        viewBox={`0 0 ${width} ${height}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredCell(null)}
        onClick={() => setSelectedCell(hoveredCell)}
      >
        <path
          d={worldPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.6}
        />
        <path d={countryPath} fill="orange" stroke="currentColor" />
        {hoveredCell && (
          <path
            d={pathGenerator(cellOutline(hoveredCell))!}
            fill="green"
            fillOpacity={0.3}
            pointerEvents="none"
          />
        )}
        {selectedCell && (
          <path
            d={pathGenerator(cellOutline(selectedCell))!}
            fill="none"
            stroke="red"
            strokeWidth={3}
            pointerEvents="none"
          />
        )}
        <path d={gridPath} fill="none" stroke="green" strokeWidth={1} />
        <path d={gridOutlinePath} fill="none" stroke="green" strokeWidth={1} />
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
