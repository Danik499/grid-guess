import { useSyncExternalStore } from "react";

// Touch is the main input (phones, most tablets), so taps need confirming
const coarseQuery = window.matchMedia("(pointer: coarse)");

const subscribeCoarse = (notify: () => void) => {
  coarseQuery.addEventListener("change", notify);
  return () => coarseQuery.removeEventListener("change", notify);
};

export const useCoarsePointer = () =>
  useSyncExternalStore(subscribeCoarse, () => coarseQuery.matches);
