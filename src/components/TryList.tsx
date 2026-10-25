import { cellKey, type CountryCells } from "../lib/countryArea";
import type { RoundProgress } from "../lib/daily";
import { formatPercent } from "../lib/format";

/** What each try told the player. */
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
    <ol className="h-16 w-full max-w-xl overflow-y-auto px-1 text-center text-sm">
      {round.tries.length === 0 && (
        <li className="text-ink-soft">
          Click the cell that holds the biggest part of {name}.
        </li>
      )}
      {round.tries.map((cell, i) => {
        const share = countryCells.byKey.get(cellKey(cell));
        return (
          <li key={cellKey(cell)}>
            {i + 1}.{" "}
            {!share
              ? `No part of ${name}`
              : share.rank === 1
                ? `Found it: ${formatPercent(share.share)} of ${name}`
                : `Rank ${share.rank} of ${countryCells.cells.length} · ${formatPercent(share.share / best.share)} of the best cell`}
          </li>
        );
      })}
    </ol>
  );
}
