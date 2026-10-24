import { useEffect, useMemo, useRef, useState } from "react";
import {
  easeCubicInOut,
  geoMercatorRaw,
  geoProjection,
  timer,
  type GeoProjection,
  type GeoRawProjection,
} from "d3";
import type { Extent } from "./regions";

/** Everything that places a map on screen, in a form that can be blended. */
export interface View {
  /** Unit-scale projection of rotated (λ, φ) radians. */
  raw: GeoRawProjection;
  scale: number;
  translate: [number, number];
  rotate: [number, number, number];
}

// Latitude where Mercator's y reaches π, the edge of the square d3 clips it to
const mercatorMaxLat = Math.atan(Math.sinh(Math.PI));

/** Mercator with the poles clamped, so blending it never meets infinity. */
export const clampedMercatorRaw: GeoRawProjection = (lambda, phi) =>
  geoMercatorRaw(
    lambda,
    Math.max(-mercatorMaxLat, Math.min(mercatorMaxLat, phi)),
  );

/** The view of a projection already rotated and fitted, drawn with `raw`. */
export function viewOf(raw: GeoRawProjection, fitted: GeoProjection): View {
  return {
    raw,
    scale: fitted.scale(),
    translate: fitted.translate(),
    rotate: fitted.rotate(),
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Wraps an angle in degrees to [-180, 180). */
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

export function interpolateView(a: View, b: View) {
  // Turn the globe the short way round
  const rotateDelta = b.rotate.map((r, i) => wrap(r - a.rotate[i]));
  return (t: number): View => ({
    raw: (lambda, phi) => {
      const [x0, y0] = a.raw(lambda, phi);
      const [x1, y1] = b.raw(lambda, phi);
      return [lerp(x0, x1, t), lerp(y0, y1, t)];
    },
    // Geometric, so zooming in or out looks steady
    scale: a.scale ** (1 - t) * b.scale ** t,
    translate: [
      lerp(a.translate[0], b.translate[0], t),
      lerp(a.translate[1], b.translate[1], t),
    ],
    rotate: [
      a.rotate[0] + rotateDelta[0] * t,
      a.rotate[1] + rotateDelta[1] * t,
      a.rotate[2] + rotateDelta[2] * t,
    ],
  });
}

export function projectionOf(view: View, clip: Extent): GeoProjection {
  return geoProjection(view.raw)
    .scale(view.scale)
    .translate(view.translate)
    .rotate(view.rotate)
    // Coarser resampling: the blended raw projection is costly to evaluate
    .precision(2)
    .clipExtent(clip);
}

export interface ViewTarget {
  /** The real projection, shown once the transition is over. */
  projection: GeoProjection;
  view: View;
}

/**
 * Animates from the shown view to `target` whenever it changes, starting
 * from wherever a running transition has got to. While animating, the
 * returned projection is a blend without `invert`, clipped to `clip`.
 */
export function useViewTransition(
  target: ViewTarget,
  clip: Extent,
  duration = 750,
) {
  const [settled, setSettled] = useState(target);
  const [frame, setFrame] = useState<View | null>(null);
  // The view on screen, where the next transition starts from
  const shown = useRef(target.view);

  useEffect(() => {
    if (target === settled) return;
    const interpolate = interpolateView(shown.current, target.view);
    const t = timer((elapsed) => {
      if (elapsed >= duration) {
        t.stop();
        shown.current = target.view;
        setFrame(null);
        setSettled(target);
        return;
      }
      const view = interpolate(easeCubicInOut(elapsed / duration));
      shown.current = view;
      setFrame(view);
    });
    return () => t.stop();
  }, [target, settled, duration]);

  const framed = useMemo(
    () => frame && projectionOf(frame, clip),
    [frame, clip],
  );
  return {
    projection: framed ?? settled.projection,
    animating: target !== settled,
  };
}
