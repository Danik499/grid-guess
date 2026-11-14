// Measures map transitions on the device itself, to compare optimizations
// on phones. Off unless the page is opened with `perf` in its URL; then a
// panel in the corner runs a fixed benchmark and keeps its results across
// reloads, so a run before a change sits next to a run after it.

export const perfEnabled = new URLSearchParams(location.search).has("perf");

const storageKey = "grid-guess-transition-perf";
const rounds = 3;
// Pause between transitions, so one does not run into the next
const settleMs = 300;

interface RunResult {
  at: string;
  label: string;
  hz: number;
  transitions: number;
  fps: number;
  medianMs: number;
  p95Ms: number;
  worstMs: number;
  /** Share of the frames the screen could have shown that were missed. */
  droppedPct: number;
}

let waiting: ((intervals: number[]) => void) | null = null;

/**
 * Starts timing frames for a transition. Call the returned function when it
 * ends; `finished` is false when it was cut short and should not count.
 */
export function transitionStarted(): (finished: boolean) => void {
  if (!perfEnabled) return () => {};
  const intervals: number[] = [];
  let last: number | null = null;
  let raf = requestAnimationFrame(function tick(now) {
    if (last !== null) intervals.push(now - last);
    last = now;
    raf = requestAnimationFrame(tick);
  });
  return (finished) => {
    cancelAnimationFrame(raf);
    if (finished && waiting) waiting(intervals);
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const quantile = (sorted: number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/** The screen's frame interval, from frames while nothing moves. */
async function measureVsync() {
  const intervals: number[] = [];
  await new Promise<void>((resolve) => {
    let last: number | null = null;
    requestAnimationFrame(function tick(now) {
      if (last !== null) intervals.push(now - last);
      last = now;
      if (intervals.length < 60) requestAnimationFrame(tick);
      else resolve();
    });
  });
  return quantile(
    intervals.sort((a, b) => a - b),
    0.5,
  );
}

function nextTransition() {
  return new Promise<number[] | null>((resolve) => {
    const timeout = setTimeout(() => {
      waiting = null;
      resolve(null);
    }, 3000);
    waiting = (intervals) => {
      clearTimeout(timeout);
      waiting = null;
      resolve(intervals);
    };
  });
}

function summarize(intervals: number[], vsync: number, transitions: number) {
  const sorted = [...intervals].sort((a, b) => a - b);
  const total = intervals.reduce((s, d) => s + d, 0);
  const missed = intervals.reduce(
    (s, d) => s + Math.max(0, Math.round(d / vsync) - 1),
    0,
  );
  return {
    hz: Math.round(1000 / vsync),
    transitions,
    fps: Math.round((intervals.length / total) * 1000),
    medianMs: +quantile(sorted, 0.5).toFixed(1),
    p95Ms: +quantile(sorted, 0.95).toFixed(1),
    worstMs: +sorted[sorted.length - 1].toFixed(1),
    droppedPct: Math.round((missed / (intervals.length + missed)) * 100),
  };
}

function loadResults(): RunResult[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "[]");
  } catch {
    return [];
  }
}

function saveResults(results: RunResult[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(results));
  } catch {
    // Results then last until the page is reloaded
  }
}

/** Switches the Random mode's projection picker through every projection. */
async function runBenchmark(report: (text: string) => void) {
  const select = [...document.querySelectorAll("select")].find((s) =>
    s.querySelector('option[value="geoMercator"]'),
  );
  if (!select) {
    report("Open Random mode first");
    return null;
  }
  report("Measuring screen…");
  const vsync = await measureVsync();
  const names = [...select.options].map((o) => o.value);
  const first = names.indexOf(select.value);
  const intervals: number[] = [];
  let transitions = 0;
  const steps = names.length * rounds;
  for (let i = 1; i <= steps; i++) {
    report(`Transition ${i}/${steps}…`);
    const done = nextTransition();
    select.value = names[(first + i) % names.length];
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const frames = await done;
    if (frames) {
      intervals.push(...frames);
      transitions++;
    }
    await sleep(settleMs);
  }
  if (!intervals.length) {
    report("No transitions were measured");
    return null;
  }
  return summarize(intervals, vsync, transitions);
}

export function installPerfPanel() {
  if (!perfEnabled) return;
  let results = loadResults();

  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;left:4px;bottom:4px;z-index:1000;max-width:calc(100vw - 8px);" +
    "padding:6px;background:rgba(0,0,0,.8);color:#fff;border-radius:4px;" +
    "font:11px/1.35 ui-monospace,monospace;";
  const status = document.createElement("div");
  const table = document.createElement("pre");
  table.style.cssText = "margin:4px 0;white-space:pre;overflow-x:auto;";
  const label = document.createElement("input");
  label.placeholder = "label, e.g. after";
  label.style.cssText = "width:9em;font:inherit;color:#000;background:#fff;";
  const button = (text: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText =
      "margin-left:4px;padding:1px 6px;font:inherit;color:#000;background:#fff;";
    b.onclick = onClick;
    return b;
  };

  const render = () => {
    table.textContent = results.length
      ? [
          "label      Hz  fps  med  p95  worst drop",
          ...results.map((r) =>
            [
              r.label.padEnd(9).slice(0, 9),
              String(r.hz).padStart(3),
              String(r.fps).padStart(4),
              r.medianMs.toFixed(0).padStart(4),
              r.p95Ms.toFixed(0).padStart(4),
              r.worstMs.toFixed(0).padStart(6),
              `${r.droppedPct}%`.padStart(4),
            ].join(" "),
          ),
        ].join("\n")
      : "No runs yet";
  };

  let running = false;
  const run = button("Run", async () => {
    if (running) return;
    running = true;
    const summary = await runBenchmark((text) => (status.textContent = text));
    running = false;
    if (!summary) return;
    const result: RunResult = {
      at: new Date().toISOString(),
      label: label.value.trim() || `run ${results.length + 1}`,
      ...summary,
    };
    results = [...results, result];
    saveResults(results);
    console.table(results);
    status.textContent = "Done";
    render();
  });
  const clear = button("Clear", () => {
    results = [];
    saveResults(results);
    render();
  });

  const controls = document.createElement("div");
  controls.append(label, run, clear);
  status.textContent = "Transition benchmark";
  panel.append(status, table, controls);
  document.body.append(panel);
  render();
}
