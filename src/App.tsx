import { useEffect, useMemo, useState, type PointerEvent } from "react";
import { geoPath, json } from "d3";
import type { FeatureCollection } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import {
  cellAt,
  cellOutline,
  createGrid,
  createGridOutline,
  isWorld,
  snapExtent,
  type GridCell,
} from "./lib/GridLayer";
import {
  cellKey,
  computeCountryCells,
  type RankedCellShare,
} from "./lib/countryArea";
import {
  generateLevel,
  randomSeed,
  type Country,
  type Difficulty,
  difficultyRules,
} from "./lib/level";
import { useViewTransition, viewOf } from "./lib/projectionTransition";
import {
  projectionLabels,
  projections,
  type ProjectionName,
} from "./lib/projections";
import { regions, type Extent } from "./lib/regions";

const width = 1000;
const height = 700;
const padding = 50;
// Region views are clipped to this frame, and so is every transition frame
const frameClip: Extent = [
  [padding - 1, padding - 1],
  [width - padding + 1, height - padding + 1],
];

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
  return (
    <div className="h-12 text-sm">
      <div className="font-semibold">
        {share
          ? `${formatPercent(share.share)} of ${countryName} (${formatKm2(share.areaKm2)})`
          : `No part of ${countryName}`}
      </div>
      {share && (
        <div className="opacity-80">
          Rank {share.rank} of {cellCount} ·{" "}
          {formatPercent(share.share / best.share)} of the best cell
        </div>
      )}
    </div>
  );
}

interface MapData {
  /** Low-poly countries, used for calculations */
  countries: Country[];
  /** Medium-poly countries by name, used for drawing */
  displayCountries: Map<string, Country>;
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
  const [countries, displayCountries, coastline] = await Promise.all([
    json<CountriesTopology>(`${base}countries-low.topo.json`),
    json<CountriesTopology>(`${base}countries-medium.topo.json`),
    json<CoastlineTopology>(`${base}coastline.topo.json`),
  ]);
  if (!countries || !displayCountries || !coastline) throw new Error("Map data is empty");
  return {
    countries: feature(countries, countries.objects.countries).features,
    displayCountries: new Map(
      feature(
        displayCountries,
        displayCountries.objects.countries,
      ).features.map((c) => [c.properties.name, c]),
    ),
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

const difficulties = Object.keys(difficultyRules) as Difficulty[];

function initialDifficulty(): Difficulty {
  const param = new URLSearchParams(location.search).get("difficulty");
  return difficulties.find((d) => d === param) ?? "easy";
}

function initialSeed() {
  const param = Number(new URLSearchParams(location.search).get("seed"));
  return Number.isInteger(param) && param > 0 ? param : randomSeed();
}

function Game({ countries, displayCountries, world }: MapData) {
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [seed, setSeed] = useState(initialSeed);
  const level = useMemo(
    () => generateLevel(seed, difficulty, countries),
    [seed, difficulty, countries],
  );
  const country = useMemo(
    () => countries.find((c) => c.properties.name === level.country)!,
    [countries, level],
  );
  const displayCountry = displayCountries.get(level.country) ?? country;
  const { grid, regionName } = level;
  const extent = useMemo(
    () => snapExtent(regions[regionName].extent, grid),
    [regionName, grid],
  );
  // Lets the player look at the level in another projection
  const [projectionOverride, setProjectionOverride] =
    useState<ProjectionName | null>(null);
  const projectionName = projectionOverride ?? level.projectionName;

  // Shareable: reloading the URL brings back the same level
  useEffect(() => {
    const params = new URLSearchParams({ seed: String(seed), difficulty });
    history.replaceState(null, "", `?${params}`);
  }, [seed, difficulty]);

  const [hoveredCell, setHoveredCell] = useState<GridCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);

  // Clears what belonged to the previous level
  const startLevel = () => {
    setProjectionOverride(null);
    setSelectedCell(null);
    setHoveredCell(null);
  };

  const countryCells = useMemo(
    () => computeCountryCells(country.geometry, grid),
    [country, grid],
  );
  const selectedShare = selectedCell
    ? countryCells.byKey.get(cellKey(selectedCell))
    : undefined;

  // The country stays hidden until the player picks the cell holding most of it
  const found = selectedShare?.rank === 1;

  const target = useMemo(() => {
    const box: Extent = [
      [padding, padding],
      [width - padding, height - padding],
    ];
    // Rotate the globe so the centre of the region is the centre of the map.
    // The world is centred on a grid line, so its edges are grid lines too
    // and no cell is split across the two sides of the map.
    const [[lon0, lat0], [lon1, lat1]] = extent;
    const world = isWorld(extent);
    const centre = world
      ? [grid.offset[0], 0]
      : [(lon0 + lon1) / 2, (lat0 + lat1) / 2];
    const { create, raw } = projections[projectionName];
    const projection = create()
      .rotate([-centre[0], -centre[1]])
      .fitExtent(box, createGridOutline(extent));
    // Keep coastlines and countries inside the region's frame
    if (!world) {
      projection.clipExtent(frameClip);
    }
    return { projection, view: viewOf(raw, projection) };
  }, [projectionName, extent, grid]);
  // Hit-testing uses the target, which has `invert`
  const { projection } = target;

  const { projection: shown, animating } = useViewTransition(target, frameClip);

  const { pathGenerator, worldPath, countryPath, gridPath, gridOutlinePath } =
    useMemo(() => {
      const pathGenerator = geoPath(shown);
      return {
        pathGenerator,
        worldPath: pathGenerator(world)!,
        countryPath: pathGenerator(displayCountry)!,
        gridPath: pathGenerator(createGrid(grid, extent))!,
        gridOutlinePath: pathGenerator(createGridOutline(extent))!,
      };
    }, [shown, displayCountry, grid, extent, world]);

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    // The map is moving and cells are not where `projection` puts them
    if (animating) return;
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
    // The frame can run past 180°, where `invert` gives negative longitudes
    const lon = lonLat[0] < lon0 ? lonLat[0] + 360 : lonLat[0];
    if (lon >= lon1 || lonLat[1] < lat0 || lonLat[1] >= lat1) {
      setHoveredCell(null);
      return;
    }
    const cell = cellAt(lonLat, grid);
    setHoveredCell((prev) =>
      prev && prev.lon0 === cell.lon0 && prev.lat0 === cell.lat0 ? prev : cell,
    );
  };

  return (
    <div className="flex h-screen flex-col items-center gap-2 p-4">
      <div className="flex gap-2">
        <select
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value as Difficulty);
            startLevel();
          }}
        >
          {difficulties.map((name) => (
            <option key={name} value={name}>
              {name[0].toUpperCase() + name.slice(1)}
            </option>
          ))}
        </select>
        <select
          value={projectionName}
          onChange={(e) => {
            setProjectionOverride(e.target.value as ProjectionName);
            setHoveredCell(null);
          }}
        >
          {(Object.keys(projections) as ProjectionName[]).map((name) => (
            <option key={name} value={name}>
              {projectionLabels[name]}
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
            setSeed(randomSeed());
            startLevel();
          }}
        >
          Next level
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
        onClick={() => !animating && setSelectedCell(hoveredCell)}
      >
        <path
          d={worldPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.6}
        />
        {found && <path d={countryPath} fill="orange" stroke="currentColor" />}
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
      </svg>
    </div>
  );
}

export default App;
