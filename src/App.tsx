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
  type CountryCells,
} from "./lib/countryArea";
import {
  MAX_POINTS,
  TRIES_PER_ROUND,
  dailyKey,
  dailyLevels,
  dailyNumber,
  dailyRounds,
  loadProgress,
  newProgress,
  pointsFor,
  roundOver,
  saveProgress,
  type DailyProgress,
  type RoundProgress,
} from "./lib/daily";
import {
  generateLevel,
  randomSeed,
  type Country,
  type Difficulty,
  type Level,
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

const formatPercent = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

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
  if (!countries || !displayCountries || !coastline)
    throw new Error("Map data is empty");
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

type Mode = "daily" | "random";

const initialMode = (): Mode =>
  new URLSearchParams(location.search).get("mode") === "random"
    ? "random"
    : "daily";

function App() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState(initialMode);

  useEffect(() => {
    loadMapData()
      .then(setData)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  // Daily is the default, so its URL carries nothing; random levels write
  // their own parameters
  useEffect(() => {
    if (mode === "daily") history.replaceState(null, "", location.pathname);
  }, [mode]);

  if (error) {
    return <div className="p-4">Could not load map data: {error}</div>;
  }
  if (!data) {
    return <div className="p-4 opacity-60">Loading map…</div>;
  }
  return (
    <div className="flex h-screen flex-col items-center gap-2 p-4">
      <div className="flex gap-1">
        {(["daily", "random"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`rounded border px-3 py-0.5 ${m === mode ? "font-semibold" : "opacity-60"}`}
            onClick={() => setMode(m)}
          >
            {m === "daily" ? "Daily" : "Random"}
          </button>
        ))}
      </div>
      {mode === "daily" ? (
        <DailyGame {...data} onPlayRandom={() => setMode("random")} />
      ) : (
        <RandomGame {...data} />
      )}
    </div>
  );
}

/** The level's country, for calculations and for drawing, and its cells. */
function useLevelCountry(
  level: Level,
  { countries, displayCountries }: MapData,
) {
  const country = useMemo(
    () => countries.find((c) => c.properties.name === level.country)!,
    [countries, level],
  );
  const displayCountry = displayCountries.get(level.country) ?? country;
  const countryCells = useMemo(
    () => computeCountryCells(country.geometry, level.grid),
    [country, level],
  );
  return { country, displayCountry, countryCells };
}

const sameCell = (a: GridCell, b: GridCell) =>
  a.lon0 === b.lon0 && a.lat0 === b.lat0;

function LevelMap({
  level,
  displayCountry,
  countryCells,
  world,
  projectionName,
  marked,
  revealed,
  onCellClick,
}: {
  level: Level;
  displayCountry: Country;
  countryCells: CountryCells;
  world: FeatureCollection;
  projectionName: ProjectionName;
  /** Cells the player picked, outlined in red. */
  marked: GridCell[];
  /** Shows the country and how it splits over the cells. */
  revealed: boolean;
  /** Leave out to make the map ignore the pointer. */
  onCellClick?: (cell: GridCell) => void;
}) {
  const { grid, regionName } = level;
  const extent = useMemo(
    () => snapExtent(regions[regionName].extent, grid),
    [regionName, grid],
  );

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

  // A hovered cell belongs to the view it was found in, so it is dropped as
  // soon as the level or the projection changes
  const [hover, setHover] = useState<{
    cell: GridCell;
    projection: typeof projection;
  } | null>(null);
  const hoveredCell =
    onCellClick && hover?.projection === projection ? hover.cell : null;

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

  const heatmap = useMemo(() => {
    if (!revealed) return [];
    const best = countryCells.cells[0].share;
    return countryCells.cells.map(({ cell, share }) => {
      const outline = cellOutline(cell);
      return {
        key: cellKey(cell),
        path: pathGenerator(outline)!,
        centre: pathGenerator.centroid(outline),
        weight: share / best,
        label: share < 0.01 ? "<1%" : `${Math.round(share * 100)}%`,
      };
    });
  }, [revealed, countryCells, pathGenerator]);

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    // The map is moving and cells are not where `projection` puts them
    if (animating || !onCellClick) return;
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
      setHover(null);
      return;
    }
    const [[lon0, lat0], [lon1, lat1]] = extent;
    // The frame can run past 180°, where `invert` gives negative longitudes
    const lon = lonLat[0] < lon0 ? lonLat[0] + 360 : lonLat[0];
    if (lon >= lon1 || lonLat[1] < lat0 || lonLat[1] >= lat1) {
      setHover(null);
      return;
    }
    const cell = cellAt(lonLat, grid);
    setHover((prev) =>
      prev && prev.projection === projection && sameCell(prev.cell, cell)
        ? prev
        : { cell, projection },
    );
  };

  return (
    <svg
      className="min-h-0 w-full flex-1"
      viewBox={`0 0 ${width} ${height}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHover(null)}
      onClick={() => !animating && hoveredCell && onCellClick?.(hoveredCell)}
    >
      <path d={worldPath} fill="none" stroke="currentColor" strokeWidth={0.6} />
      {heatmap.map(({ key, path, weight }) => (
        <path
          key={key}
          d={path}
          fill="steelblue"
          fillOpacity={0.15 + 0.45 * weight}
          pointerEvents="none"
        />
      ))}
      {revealed && (
        <path
          d={countryPath}
          fill="orange"
          fillOpacity={0.8}
          stroke="currentColor"
        />
      )}
      {hoveredCell && (
        <path
          d={pathGenerator(cellOutline(hoveredCell))!}
          fill="green"
          fillOpacity={0.3}
          pointerEvents="none"
        />
      )}
      <path d={gridPath} fill="none" stroke="green" strokeWidth={1} />
      <path d={gridOutlinePath} fill="none" stroke="green" strokeWidth={1} />
      {marked.map((cell) => (
        <path
          key={cellKey(cell)}
          d={pathGenerator(cellOutline(cell))!}
          fill="none"
          stroke="red"
          strokeWidth={3}
          pointerEvents="none"
        />
      ))}
      {revealed && (
        <path
          d={pathGenerator(cellOutline(countryCells.cells[0].cell))!}
          fill="none"
          stroke="limegreen"
          strokeWidth={4}
          pointerEvents="none"
        />
      )}
      <g
        fontSize={14}
        fontWeight={600}
        fill="currentColor"
        stroke="var(--bg)"
        strokeWidth={3}
        paintOrder="stroke"
        textAnchor="middle"
        dominantBaseline="middle"
        pointerEvents="none"
        className={`transition-opacity duration-200 ${animating ? "opacity-0" : ""}`}
      >
        {heatmap.map(
          ({ key, centre: [x, y], label }) =>
            Number.isFinite(x) && (
              <text key={key} x={x} y={y}>
                {label}
              </text>
            ),
        )}
      </g>
    </svg>
  );
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

const emptyRound = (): RoundProgress => ({ tries: [], found: false });

/** The round after clicking `cell`; unchanged if the click does not count. */
function addTry(
  round: RoundProgress,
  cell: GridCell,
  countryCells: CountryCells,
): RoundProgress {
  if (roundOver(round) || round.tries.some((t) => sameCell(t, cell))) {
    return round;
  }
  return {
    tries: [...round.tries, cell],
    found: countryCells.byKey.get(cellKey(cell))?.rank === 1,
  };
}

const roundStatus = (round: RoundProgress) =>
  roundOver(round)
    ? round.found
      ? `Found on try ${round.tries.length}`
      : "Not found"
    : `Try ${round.tries.length + 1}/${TRIES_PER_ROUND}`;

/** What each try told the player. */
function TryList({
  name,
  round,
  countryCells,
}: {
  name: string;
  round: RoundProgress;
  countryCells: CountryCells;
}) {
  const best = countryCells.cells[0];
  return (
    <ol className="h-16 text-sm">
      {round.tries.length === 0 && (
        <li className="opacity-60">
          Click the cell that holds the biggest part of {name}.
        </li>
      )}
      {round.tries.map((cell, i) => {
        const share = countryCells.byKey.get(cellKey(cell));
        return (
          <li key={cellKey(cell)}>
            {i + 1}.{" "}
            {!share
              ? `No part of ${name}`
              : share.rank === 1
                ? `Found it: ${formatPercent(share.share)} of ${name}`
                : `Rank ${share.rank} of ${countryCells.cells.length} · ${formatPercent(share.share / best.share)} of the best cell`}
          </li>
        );
      })}
    </ol>
  );
}

// The found cell is outlined as the best one, not as a miss
const misses = (round: RoundProgress) =>
  round.found ? round.tries.slice(0, -1) : round.tries;

function RandomGame(data: MapData) {
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [seed, setSeed] = useState(initialSeed);
  const level = useMemo(
    () => generateLevel(seed, difficulty, data.countries),
    [seed, difficulty, data.countries],
  );
  const { country, displayCountry, countryCells } = useLevelCountry(
    level,
    data,
  );
  // Lets the player look at the level in another projection
  const [projectionOverride, setProjectionOverride] =
    useState<ProjectionName | null>(null);
  const projectionName = projectionOverride ?? level.projectionName;

  // Shareable: reloading the URL brings back the same level
  useEffect(() => {
    const params = new URLSearchParams({
      mode: "random",
      seed: String(seed),
      difficulty,
    });
    history.replaceState(null, "", `?${params}`);
  }, [seed, difficulty]);

  const [round, setRound] = useState(emptyRound);
  // The country stays hidden until the player finds its cell or runs out of
  // tries
  const over = roundOver(round);

  // Clears what belonged to the previous level
  const startLevel = () => {
    setProjectionOverride(null);
    setRound(emptyRound());
  };

  return (
    <>
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
          onChange={(e) =>
            setProjectionOverride(e.target.value as ProjectionName)
          }
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
        <span className="opacity-60">{roundStatus(round)}</span>
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
      <TryList
        name={country.properties.name}
        round={round}
        countryCells={countryCells}
      />
      <LevelMap
        level={level}
        displayCountry={displayCountry}
        countryCells={countryCells}
        world={data.world}
        projectionName={projectionName}
        marked={misses(round)}
        revealed={over}
        onCellClick={
          over
            ? undefined
            : (cell) => setRound((r) => addTry(r, cell, countryCells))
        }
      />
    </>
  );
}

/** Saved progress, if it fits today's rounds. */
function resumeProgress(key: string): DailyProgress {
  const saved = loadProgress(key);
  return saved?.rounds?.length === dailyRounds.length ? saved : newProgress();
}

function DailyGame({
  onPlayRandom,
  ...data
}: MapData & { onPlayRandom: () => void }) {
  // Fixed when the page opens, so midnight does not swap the levels mid-game
  const [key] = useState(() => dailyKey(new Date()));
  const levels = useMemo(
    () => dailyLevels(key, data.countries),
    [key, data.countries],
  );
  const [progress, setProgress] = useState(() => resumeProgress(key));
  useEffect(() => saveProgress(key, progress), [key, progress]);

  const title = `Daily #${dailyNumber(key)}`;
  if (progress.current >= levels.length) {
    return (
      <DailySummary
        title={title}
        levels={levels}
        progress={progress}
        onPlayRandom={onPlayRandom}
      />
    );
  }
  const index = progress.current;
  const updateRound = (round: RoundProgress) =>
    setProgress((p) => ({
      ...p,
      rounds: p.rounds.map((r, i) => (i === index ? round : r)),
    }));
  return (
    <DailyRound
      {...data}
      title={title}
      index={index}
      level={levels[index]}
      round={progress.rounds[index]}
      onRoundChange={updateRound}
      onNext={() => setProgress((p) => ({ ...p, current: p.current + 1 }))}
    />
  );
}

function DailyRound({
  title,
  index,
  level,
  round,
  onRoundChange,
  onNext,
  ...data
}: MapData & {
  title: string;
  index: number;
  level: Level;
  round: RoundProgress;
  onRoundChange: (round: RoundProgress) => void;
  onNext: () => void;
}) {
  const { country, displayCountry, countryCells } = useLevelCountry(
    level,
    data,
  );
  const name = country.properties.name;
  const over = roundOver(round);

  const last = index === dailyRounds.length - 1;
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="opacity-60">
          {title} · Round {index + 1}/{dailyRounds.length}
        </span>
        <span className="text-xl font-semibold">{name}</span>
        <span className="opacity-60">
          {over
            ? `${pointsFor(round)} ${pointsFor(round) === 1 ? "point" : "points"}`
            : `Try ${round.tries.length + 1}/${TRIES_PER_ROUND}`}
        </span>
        {over && (
          <button
            type="button"
            className="rounded border px-2 py-0.5"
            onClick={onNext}
          >
            {last ? "See results" : "Next round"}
          </button>
        )}
      </div>
      <TryList name={name} round={round} countryCells={countryCells} />
      <LevelMap
        level={level}
        displayCountry={displayCountry}
        countryCells={countryCells}
        world={data.world}
        projectionName={level.projectionName}
        marked={misses(round)}
        revealed={over}
        onCellClick={
          over
            ? undefined
            : (cell) => onRoundChange(addTry(round, cell, countryCells))
        }
      />
    </>
  );
}

function DailySummary({
  title,
  levels,
  progress,
  onPlayRandom,
}: {
  title: string;
  levels: Level[];
  progress: DailyProgress;
  onPlayRandom: () => void;
}) {
  const total = progress.rounds.reduce((sum, r) => sum + pointsFor(r), 0);
  return (
    <div className="flex flex-col items-center gap-3 pt-8">
      <div className="opacity-60">{title}</div>
      <div className="text-3xl font-semibold">
        {total} / {MAX_POINTS}
      </div>
      <table className="text-sm">
        <tbody>
          {levels.map((level, i) => {
            const round = progress.rounds[i];
            const points = pointsFor(round);
            return (
              <tr key={level.country}>
                <td className="pr-4 capitalize opacity-60">{dailyRounds[i]}</td>
                <td className="pr-4 font-semibold">{level.country}</td>
                <td className="pr-4">
                  {round.found
                    ? `found on try ${round.tries.length}`
                    : "not found"}
                </td>
                <td className="text-right">
                  {points} {points === 1 ? "point" : "points"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="opacity-60">Come back tomorrow for a new challenge.</div>
      <button
        type="button"
        className="rounded border px-3 py-1"
        onClick={onPlayRandom}
      >
        Play random levels
      </button>
    </div>
  );
}

export default App;
