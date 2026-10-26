import { cellKey, type CountryCells } from "../lib/countryArea";
import { TRIES_PER_ROUND, type RoundProgress } from "../lib/daily";
import { formatCell, formatPercent } from "../lib/format";

/** The ship's log: what each try told the player, with a slot per try left. */
export function TryList({
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
    <div className="w-full max-w-xl px-1">
      <div className="font-caps text-ink-soft text-center text-sm tracking-widest">
        Ship’s log
      </div>
      <ol className="border-rule border-y">
        {Array.from({ length: TRIES_PER_ROUND }, (_, i) => {
          const cell = round.tries[i];
          if (!cell) {
            return (
              <li
                key={i}
                className="border-rule text-ink-soft flex h-8 items-center gap-3 border-b border-dashed px-1 last:border-b-0"
              >
                <span className="border-rule size-6 shrink-0 rounded-full border border-dashed" />
                <span className="italic">
                  {i === 0 &&
                    `Click the cell that holds the biggest part of ${name}.`}
                </span>
              </li>
            );
          }
          const share = countryCells.byKey.get(cellKey(cell));
          const found = share?.rank === 1;
          return (
            <li
              key={cellKey(cell)}
              className="border-rule flex h-8 items-center gap-3 border-b border-dashed px-1 last:border-b-0"
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-sm text-paper [font-variant-numeric:lining-nums] ${found ? "bg-correct" : "bg-wrong"}`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-left">
                {formatCell(cell)}
              </span>
              <span
                className={`shrink-0 text-right ${found ? "text-correct font-semibold" : ""}`}
              >
                {!share
                  ? "No part of it"
                  : found
                    ? `Found it · ${formatPercent(share.share)} of ${name}`
                    : `Rank ${share.rank}/${countryCells.cells.length} · ${formatPercent(share.share / best.share)} of best`}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
