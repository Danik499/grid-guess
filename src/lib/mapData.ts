import { json } from "d3";
import type { FeatureCollection } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Country } from "./level";

export interface MapData {
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
export async function loadMapData(): Promise<MapData> {
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
