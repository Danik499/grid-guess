import { useSyncExternalStore } from "react";

// Narrow screens get a portrait map, so it fills the screen instead of
// sitting in a thin landscape strip
const narrowQuery = window.matchMedia("(max-width: 640px)");

const subscribeNarrow = (notify: () => void) => {
  narrowQuery.addEventListener("change", notify);
  return () => narrowQuery.removeEventListener("change", notify);
};

export const useNarrow = () =>
  useSyncExternalStore(subscribeNarrow, () => narrowQuery.matches);
