export type Extent = [[number, number], [number, number]];

export interface Region {
  /** Natural Earth `continent`s of the countries to pick from; null for all. */
  continents: string[] | null;
  /**
   * [[lon0, lat0], [lon1, lat1]] the map shows; it grows to the nearest grid
   * lines once the level's grid is known.
   */
  extent: Extent;
  /** Grid cell sizes, in degrees, a level in this region can use. */
  steps: number[];
}

export const regions = {
  World: {
    continents: null,
    extent: [
      [-180, -90],
      [180, 90],
    ],
    steps: [20, 30],
  },
  Europe: {
    continents: ["Europe"],
    extent: [
      [-30, 30],
      [60, 80],
    ],
    steps: [5, 10],
  },
  Asia: {
    continents: ["Asia"],
    extent: [
      [30, -15],
      [180, 75],
    ],
    steps: [10, 15],
  },
  Eurasia: {
    continents: ["Europe", "Asia"],
    extent: [
      [-30, -15],
      [180, 75],
    ],
    steps: [10, 15],
  },
  Africa: {
    continents: ["Africa"],
    extent: [
      [-30, -45],
      [60, 45],
    ],
    steps: [10, 15],
  },
} satisfies Record<string, Region>;

export type RegionName = keyof typeof regions;
