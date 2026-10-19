export type Extent = [[number, number], [number, number]];

export interface Region {
  /** Natural Earth `continent`s of the countries to pick from; null for all. */
  continents: string[] | null;
  /** [[lon0, lat0], [lon1, lat1]] shown on the map; multiples of `step`. */
  extent: Extent;
  /** Grid cell size in degrees of longitude/latitude. */
  step: number;
}

export const regions = {
  World: {
    continents: null,
    extent: [
      [-180, -90],
      [180, 90],
    ],
    step: 30,
  },
  Europe: {
    continents: ["Europe"],
    extent: [
      [-30, 30],
      [60, 80],
    ],
    step: 10,
  },
  Asia: {
    continents: ["Asia"],
    extent: [
      [30, -15],
      [180, 75],
    ],
    step: 15,
  },
  Eurasia: {
    continents: ["Europe", "Asia"],
    extent: [
      [-30, -15],
      [180, 75],
    ],
    step: 15,
  },
  Africa: {
    continents: ["Africa"],
    extent: [
      [-30, -45],
      [60, 45],
    ],
    step: 15,
  },
} satisfies Record<string, Region>;

export type RegionName = keyof typeof regions;
