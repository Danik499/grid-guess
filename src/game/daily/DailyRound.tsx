import { LevelMap } from "../../components/LevelMap";
import { TryList } from "../../components/TryList";
import { useLevelCountry } from "../../hooks/useLevelCountry";
import {
  dailyRounds,
  pointsFor,
  roundOver,
  type RoundProgress,
} from "../../lib/daily";
import { pointsLabel } from "../../lib/format";
import type { Level } from "../../lib/level";
import type { MapData } from "../../lib/mapData";
import { addTry, misses, roundStatus } from "../../lib/round";

export function DailyRound({
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
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span className="opacity-60">
          {title} · Round {index + 1}/{dailyRounds.length}
        </span>
        <span className="text-xl font-semibold">{name}</span>
        <span className="opacity-60">
          {over ? pointsLabel(pointsFor(round)) : roundStatus(round)}
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
