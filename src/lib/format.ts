export const formatPercent = (fraction: number) =>
  `${(fraction * 100).toFixed(1)}%`;

export const pointsLabel = (points: number) =>
  `${points} ${points === 1 ? "point" : "points"}`;
