import type { GridCell } from "./GridLayer";
import {
  generateLevel,
  type Country,
  type Difficulty,
  type Level,
} from "./level";

/** One round per entry, easiest first. */
export const dailyRounds: Difficulty[] = [
  "easy",
  "easy",
  "medium",
  "medium",
  "hard",
];

export const TRIES_PER_ROUND = 3;

// Day #1 of the daily challenge
const LAUNCH = Date.UTC(2026, 9, 24);

/** The player's local date as `YYYY-MM-DD`; the same everywhere that day. */
export function dailyKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Number of the daily challenge for a `dailyKey`, starting at 1. */
export function dailyNumber(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - LAUNCH) / 86_400_000) + 1;
}

/** 32-bit FNV-1a hash, so a date string makes a seed. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The day's levels, one per round, never the same country twice. */
export function dailyLevels(key: string, countries: Country[]): Level[] {
  const levels: Level[] = [];
  dailyRounds.forEach((difficulty, i) => {
    const used = levels.map((l) => l.country);
    levels.push(
      generateLevel(hash(`${key}#${i}`), difficulty, countries, used),
    );
  });
  return levels;
}

export interface RoundProgress {
  /** Cells clicked, in order; never the same cell twice. */
  tries: GridCell[];
  found: boolean;
}

export interface DailyProgress {
  /** Round being shown; equals the number of rounds once the day is over. */
  current: number;
  rounds: RoundProgress[];
}

export const newProgress = (): DailyProgress => ({
  current: 0,
  rounds: dailyRounds.map(() => ({ tries: [], found: false })),
});

export const roundOver = ({ tries, found }: RoundProgress) =>
  found || tries.length >= TRIES_PER_ROUND;

/** 3, 2 or 1 points for finding the cell on the 1st, 2nd or 3rd try. */
export const pointsFor = ({ tries, found }: RoundProgress) =>
  found ? TRIES_PER_ROUND + 1 - tries.length : 0;

export const MAX_POINTS = dailyRounds.length * TRIES_PER_ROUND;

const storageKey = (key: string) => `gridguess-daily-${key}`;

// Storage may be missing or blocked; the game then just does not resume
export function loadProgress(key: string): DailyProgress | null {
  try {
    const saved = localStorage.getItem(storageKey(key));
    return saved ? (JSON.parse(saved) as DailyProgress) : null;
  } catch {
    return null;
  }
}

export function saveProgress(key: string, progress: DailyProgress) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(progress));
  } catch {
    // See loadProgress
  }
}
