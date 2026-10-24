import { useEffect, useMemo, useState } from "react";
import {
  dailyKey,
  dailyLevels,
  dailyNumber,
  dailyRounds,
  loadProgress,
  newProgress,
  saveProgress,
  type DailyProgress,
  type RoundProgress,
} from "../../lib/daily";
import type { MapData } from "../../lib/mapData";
import { DailyRound } from "./DailyRound";
import { DailySummary } from "./DailySummary";

/** Saved progress, if it fits today's rounds. */
function resumeProgress(key: string): DailyProgress {
  const saved = loadProgress(key);
  return saved?.rounds?.length === dailyRounds.length ? saved : newProgress();
}

export function DailyGame({
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
