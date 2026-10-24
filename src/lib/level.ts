import type { Feature, Geometry } from "geojson";
import {
  computeCountryCells,
  countryAreaKm2,
  countryBounds,
} from "./countryArea";
import { snapExtent, type Grid, type GridCell } from "./GridLayer";
import type { ProjectionName } from "./projections";
import { regions, type Extent, type RegionName } from "./regions";

export type Country = Feature<Geometry, { name: string; continent: string }>;

export type Difficulty = "easy" | "medium" | "hard";

interface DifficultyRule {
  /** Smallest country to ask about. */
  minKm2: number;
  /** How many cells the country may touch, inclusive. */
  cells: [number, number];
  /** Smallest lead, in share of the country, of the best cell over the next. */
  margin: number;
  /** Projections to show the level in; Mercator makes cell sizes deceptive. */
  projections: ProjectionName[];
}

export const difficultyRules: Record<Difficulty, DifficultyRule> = {
  easy: {
    minKm2: 300_000,
    cells: [2, 4],
    margin: 0.15,
    projections: ["geoEqualEarth", "geoNaturalEarth1"],
  },
  medium: {
    minKm2: 50_000,
    cells: [2, 6],
    margin: 0.08,
    projections: ["geoEqualEarth", "geoNaturalEarth1", "geoEquirectangular"],
  },
  hard: {
    minKm2: 10_000,
    cells: [3, 9],
    margin: 0.03,
    projections: [
      "geoEqualEarth",
      "geoNaturalEarth1",
      "geoEquirectangular",
      "geoMercator",
    ],
  },
};

/** Everything that defines a level; the same seed always gives the same one. */
export interface Level {
  seed: number;
  difficulty: Difficulty;
  /** Country name, stable across data rebuilds. */
  country: string;
  regionName: RegionName;
  projectionName: ProjectionName;
  grid: Grid;
}

/** Small seeded PRNG, uniform in [0, 1). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

// Not puzzles: no fair grid, or no land to speak of
const excludedContinents = ["Antarctica", "Seven seas (open ocean)"];

const areaCache = new WeakMap<Country, number>();
function areaOf(country: Country) {
  let area = areaCache.get(country);
  if (area === undefined) {
    area = countryAreaKm2(country.geometry);
    areaCache.set(country, area);
  }
  return area;
}

/** Whether the cell lies inside the extent, which may run past 180°. */
function cellInExtent(
  { lon0, lat0, lon1, lat1 }: GridCell,
  [[eLon0, eLat0], [eLon1, eLat1]]: Extent,
) {
  if (lat0 < eLat0 || lat1 > eLat1) return false;
  return [0, 360].some(
    (shift) => lon0 + shift >= eLon0 && lon1 + shift <= eLon1,
  );
}

const COUNTRY_TRIES = 300;
const GRID_TRIES = 20;

/**
 * A fair level: the country's best cell leads the next by the difficulty's
 * margin, the country touches a fitting number of cells, and the best cell
 * is in the frame. Countries named in `exclude` are not picked.
 */
export function generateLevel(
  seed: number,
  difficulty: Difficulty,
  countries: Country[],
  exclude: readonly string[] = [],
): Level {
  const random = mulberry32(seed);
  const pick = <T>(items: readonly T[]) =>
    items[Math.floor(random() * items.length)];
  const rule = difficultyRules[difficulty];
  const [minCells, maxCells] = rule.cells;

  const pool = countries.filter(
    (c) =>
      !excludedContinents.includes(c.properties.continent) &&
      !exclude.includes(c.properties.name) &&
      areaOf(c) >= rule.minKm2,
  );

  for (let i = 0; i < COUNTRY_TRIES; i++) {
    const country = pick(pool);
    const regionNames = (Object.keys(regions) as RegionName[]).filter(
      (name) => {
        const { continents } = regions[name];
        return !continents || continents.includes(country.properties.continent);
      },
    );
    const regionName = pick(regionNames);
    const region = regions[regionName];
    const { minLon, maxLon, minLat, maxLat } = countryBounds(country.geometry);

    for (let j = 0; j < GRID_TRIES; j++) {
      const step = pick(region.steps);
      const offset: [number, number] = [
        Math.floor(random() * step),
        Math.floor(random() * step),
      ];
      // Most cells the bounding box can touch: far too many means the
      // country is too big for this step, and is slow to measure
      const boxCells =
        (Math.ceil((maxLon - minLon) / step) + 1) *
        (Math.ceil((maxLat - minLat) / step) + 1);
      if (boxCells > maxCells * 4) continue;

      const grid = { step, offset };
      const { cells } = computeCountryCells(country.geometry, grid);
      if (cells.length < minCells || cells.length > maxCells) continue;
      if (cells[0].share - (cells[1]?.share ?? 0) < rule.margin) continue;
      if (!cellInExtent(cells[0].cell, snapExtent(region.extent, grid))) {
        continue;
      }
      return {
        seed,
        difficulty,
        country: country.properties.name,
        regionName,
        projectionName: pick(rule.projections),
        grid,
      };
    }
  }
  throw new Error(`No ${difficulty} level found for seed ${seed}`);
}

export const difficulties = Object.keys(difficultyRules) as Difficulty[];
