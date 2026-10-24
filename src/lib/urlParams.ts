// Everything the page reads from or writes to its URL.
// Daily is the default, so its URL carries nothing; random levels write
// their seed and difficulty so the URL can be shared.
import { difficulties, randomSeed, type Difficulty } from "./level";

export type Mode = "daily" | "random";

const params = () => new URLSearchParams(location.search);

export const initialMode = (): Mode =>
  params().get("mode") === "random" ? "random" : "daily";

export function initialDifficulty(): Difficulty {
  const param = params().get("difficulty");
  return difficulties.find((d) => d === param) ?? "easy";
}

export function initialSeed() {
  const param = Number(params().get("seed"));
  return Number.isInteger(param) && param > 0 ? param : randomSeed();
}

export function writeRandomParams(seed: number, difficulty: Difficulty) {
  const search = new URLSearchParams({
    mode: "random",
    seed: String(seed),
    difficulty,
  });
  history.replaceState(null, "", `?${search}`);
}

export function clearParams() {
  history.replaceState(null, "", location.pathname);
}
