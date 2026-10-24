import { cellKey, type CountryCells } from "./countryArea";
import { TRIES_PER_ROUND, roundOver, type RoundProgress } from "./daily";
import { sameCell, type GridCell } from "./GridLayer";

export const emptyRound = (): RoundProgress => ({ tries: [], found: false });

/** The round after clicking `cell`; unchanged if the click does not count. */
export function addTry(
  round: RoundProgress,
  cell: GridCell,
  countryCells: CountryCells,
): RoundProgress {
  if (roundOver(round) || round.tries.some((t) => sameCell(t, cell))) {
    return round;
  }
  return {
    tries: [...round.tries, cell],
    found: countryCells.byKey.get(cellKey(cell))?.rank === 1,
  };
}

/** Tries outlined as misses; the found cell is outlined as the best one. */
export const misses = (round: RoundProgress) =>
  round.found ? round.tries.slice(0, -1) : round.tries;

export const roundStatus = (round: RoundProgress) =>
  roundOver(round)
    ? round.found
      ? `Found on try ${round.tries.length}`
      : "Not found"
    : `Try ${round.tries.length + 1}/${TRIES_PER_ROUND}`;
