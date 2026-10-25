import {
  MAX_POINTS,
  dailyRounds,
  pointsFor,
  type DailyProgress,
} from "../../lib/daily";
import { pointsLabel } from "../../lib/format";
import type { Level } from "../../lib/level";

export function DailySummary({
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
    <div className="flex flex-col items-center gap-3 overflow-y-auto pt-4 sm:pt-8">
      <div className="text-ink-soft">{title}</div>
      <div className="font-display text-4xl">
        {total} / {MAX_POINTS}
      </div>
      <table className="max-w-full text-xs sm:text-sm">
        <tbody>
          {levels.map((level, i) => {
            const round = progress.rounds[i];
            return (
              <tr key={level.country}>
                <td className="pr-2 capitalize sm:pr-4 opacity-60">
                  {dailyRounds[i]}
                </td>
                <td className="pr-2 font-semibold sm:pr-4">{level.country}</td>
                <td className="pr-2 sm:pr-4">
                  {round.found
                    ? `found on try ${round.tries.length}`
                    : "not found"}
                </td>
                <td className="text-right">{pointsLabel(pointsFor(round))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="text-ink-soft">
        Come back tomorrow for a new challenge.
      </div>
      <button type="button" className="btn" onClick={onPlayRandom}>
        Play random levels
      </button>
    </div>
  );
}
