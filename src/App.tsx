import { useEffect, useState } from "react";
import { DailyGame } from "./game/daily/DailyGame";
import { RandomGame } from "./game/RandomGame";
import { loadMapData, type MapData } from "./lib/mapData";
import { clearParams, initialMode } from "./lib/urlParams";

function App() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState(initialMode);

  useEffect(() => {
    loadMapData()
      .then(setData)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  // Daily is the default, so its URL carries nothing; random levels write
  // their own parameters
  useEffect(() => {
    if (mode === "daily") clearParams();
  }, [mode]);

  if (error) {
    return <div className="p-4">Could not load map data: {error}</div>;
  }
  if (!data) {
    return <div className="p-4 text-ink-soft">Loading map…</div>;
  }
  return (
    <div className="flex h-dvh flex-col items-center gap-2 p-2 sm:p-4">
      <div className="flex gap-1">
        {(["daily", "random"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`btn ${m === mode ? "btn-active" : ""}`}
            onClick={() => setMode(m)}
          >
            {m === "daily" ? "Daily" : "Random"}
          </button>
        ))}
      </div>
      {mode === "daily" ? (
        <DailyGame {...data} onPlayRandom={() => setMode("random")} />
      ) : (
        <RandomGame {...data} />
      )}
    </div>
  );
}

export default App;
