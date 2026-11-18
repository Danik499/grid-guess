import { useEffect, useMemo, useState } from "react";
import { LevelMap } from "../components/LevelMap";
import { TryList } from "../components/TryList";
import { useLevelCountry } from "../hooks/useLevelCountry";
import { roundOver } from "../lib/daily";
import {
  difficulties,
  generateLevel,
  randomSeed,
  type Difficulty,
} from "../lib/level";
import type { MapData } from "../lib/mapData";
import {
  projectionLabels,
  projections,
  type ProjectionName,
} from "../lib/projections";
import { addTry, emptyRound, misses, roundStatus } from "../lib/round";
import {
  initialDifficulty,
  initialSeed,
  writeRandomParams,
} from "../lib/urlParams";

export function RandomGame(data: MapData) {
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
  useEffect(() => writeRandomParams(seed, difficulty), [seed, difficulty]);

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
      <div className="flex flex-wrap justify-center gap-2">
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
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span className="font-display text-3xl">{country.properties.name}</span>
        <span className="text-ink-soft">{roundStatus(round)}</span>
        <button
          type="button"
          className="btn"
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
        countries={data.countries}
        displayCountries={data.displayCountries}
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
