import { useMemo } from "react";
import { computeCountryCells } from "../lib/countryArea";
import type { Level } from "../lib/level";
import type { MapData } from "../lib/mapData";

/** The level's country, for calculations and for drawing, and its cells. */
export function useLevelCountry(
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
