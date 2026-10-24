import { useMemo } from "react";
import { geoPath } from "d3";
import { createGridOutline, isWorld, snapExtent } from "../lib/GridLayer";
import type { Level } from "../lib/level";
import { viewOf } from "../lib/projectionTransition";
import { projections, type ProjectionName } from "../lib/projections";
import { regions, type Extent } from "../lib/regions";

const padding = 50;

/** The projection that frames the level's region, sized for the screen. */
export function useMapProjection(
  { grid, regionName }: Level,
  projectionName: ProjectionName,
  narrow: boolean,
) {
  const width = narrow ? 600 : 1000;
  // Phones get a tight frame; the map is as wide as the screen
  const pad = narrow ? 10 : padding;
  const extent = useMemo(
    () => snapExtent(regions[regionName].extent, grid),
    [regionName, grid],
  );

  const target = useMemo(() => {
    // Rotate the globe so the centre of the region is the centre of the map.
    // The world is centred on a grid line, so its edges are grid lines too
    // and no cell is split across the two sides of the map.
    const [[lon0, lat0], [lon1, lat1]] = extent;
    const world = isWorld(extent);
    const centre = world
      ? [grid.offset[0], 0]
      : [(lon0 + lon1) / 2, (lat0 + lat1) / 2];
    const { create, raw } = projections[projectionName];
    const outline = createGridOutline(extent);
    const projection = create().rotate([-centre[0], -centre[1]]);
    let height = 700;
    if (narrow) {
      // Fit the width, then cut the frame to the height the map takes
      // fitWidth puts the top of the map at y = 0
      projection.fitWidth(width - 2 * pad, outline);
      const [tx, ty] = projection.translate();
      projection.translate([tx + pad, ty + pad]);
      height = Math.ceil(geoPath(projection).bounds(outline)[1][1] + pad);
    } else {
      projection.fitExtent(
        [
          [pad, pad],
          [width - pad, height - pad],
        ],
        outline,
      );
    }
    // Region views are clipped to this frame, and so is every transition frame
    const frameClip: Extent = [
      [pad - 1, pad - 1],
      [width - pad + 1, height - pad + 1],
    ];
    // Keep coastlines and countries inside the region's frame
    if (!world) {
      projection.clipExtent(frameClip);
    }
    return { projection, view: viewOf(raw, projection), height, frameClip };
  }, [projectionName, extent, grid, width, narrow, pad]);

  return { width, extent, target };
}
