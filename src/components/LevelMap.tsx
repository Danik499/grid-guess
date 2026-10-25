import { useMemo, useState, type MouseEvent, type PointerEvent } from "react";
import { geoPath, type GeoProjection } from "d3";
import type { FeatureCollection } from "geojson";
import { useMapProjection } from "../hooks/useMapProjection";
import { useNarrow } from "../hooks/useNarrow";
import { cellKey, type CountryCells } from "../lib/countryArea";
import {
  cellOutline,
  createGrid,
  createGridOutline,
  sameCell,
  type GridCell,
} from "../lib/GridLayer";
import { cellAtPoint } from "../lib/hitTest";
import type { Country, Level } from "../lib/level";
import { useViewTransition } from "../lib/projectionTransition";
import type { ProjectionName } from "../lib/projections";
import { thinWorld } from "../lib/simplify";

export function LevelMap({
  level,
  displayCountry,
  countryCells,
  world,
  projectionName,
  marked,
  revealed,
  onCellClick,
}: {
  level: Level;
  displayCountry: Country;
  countryCells: CountryCells;
  world: FeatureCollection;
  projectionName: ProjectionName;
  /** Cells the player picked, outlined in rust. */
  marked: GridCell[];
  /** Shows the country and how it splits over the cells. */
  revealed: boolean;
  /** Leave out to make the map ignore the pointer. */
  onCellClick?: (cell: GridCell) => void;
}) {
  const { grid } = level;
  const narrow = useNarrow();
  const { width, extent, target } = useMapProjection(
    level,
    projectionName,
    narrow,
  );
  // Hit-testing uses the target, which has `invert`
  const { projection, height, frameClip } = target;

  const { projection: shown, animating } = useViewTransition(
    target,
    frameClip,
    narrow ? 450 : 750,
  );

  // A hovered cell belongs to the view it was found in, so it is dropped as
  // soon as the level or the projection changes
  const [hover, setHover] = useState<{
    cell: GridCell;
    projection: GeoProjection;
  } | null>(null);
  const hoveredCell =
    onCellClick && hover?.projection === projection ? hover.cell : null;

  // Redrawing the full coastline every frame is too slow for phones
  const coarseWorld = useMemo(() => thinWorld(world, 6), [world]);

  const { pathGenerator, worldPath, countryPath, gridPath, gridOutlinePath } =
    useMemo(() => {
      const pathGenerator = geoPath(shown);
      return {
        pathGenerator,
        worldPath: pathGenerator(animating ? coarseWorld : world)!,
        countryPath: revealed ? pathGenerator(displayCountry)! : "",
        gridPath: pathGenerator(createGrid(grid, extent))!,
        gridOutlinePath: pathGenerator(createGridOutline(extent))!,
      };
    }, [
      shown,
      animating,
      revealed,
      displayCountry,
      grid,
      extent,
      world,
      coarseWorld,
    ]);

  const heatmap = useMemo(() => {
    if (!revealed || animating) return [];
    const best = countryCells.cells[0].share;
    return countryCells.cells.map(({ cell, share }) => {
      const outline = cellOutline(cell);
      return {
        key: cellKey(cell),
        path: pathGenerator(outline)!,
        centre: pathGenerator.centroid(outline),
        weight: share / best,
        label: share < 0.01 ? "<1%" : `${Math.round(share * 100)}%`,
      };
    });
  }, [revealed, animating, countryCells, pathGenerator]);

  /** The cell under the pointer, if the pointer is over the map. */
  const cellUnder = (e: MouseEvent<SVGSVGElement>): GridCell | null => {
    // The map is moving and cells are not where `projection` puts them
    if (animating || !onCellClick) return null;
    const inverse = e.currentTarget.getScreenCTM()?.inverse();
    if (!inverse) return null;
    // Pointer position in SVG (viewBox) coordinates
    const { x, y } = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      inverse,
    );
    return cellAtPoint([x, y], projection, extent, grid);
  };

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    // Touch has no hover; a tap picks its cell on click
    if (e.pointerType === "touch") return;
    const cell = cellUnder(e);
    setHover((prev) =>
      !cell
        ? null
        : prev && prev.projection === projection && sameCell(prev.cell, cell)
          ? prev
          : { cell, projection },
    );
  };

  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    const cell = cellUnder(e);
    if (cell) onCellClick?.(cell);
  };

  return (
    <svg
      className="min-h-0 w-full flex-1 touch-manipulation select-none"
      viewBox={`0 0 ${width} ${height}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHover(null)}
      onClick={handleClick}
    >
      <path
        d={worldPath}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth={0.7}
      />
      {heatmap.map(({ key, path, weight }) => (
        <path
          key={key}
          d={path}
          fill="var(--color-heat)"
          fillOpacity={0.15 + 0.45 * weight}
          pointerEvents="none"
        />
      ))}
      {revealed && (
        <path
          d={countryPath}
          fill="var(--color-correct)"
          fillOpacity={0.5}
          stroke="currentColor"
        />
      )}
      {hoveredCell && (
        <path
          d={pathGenerator(cellOutline(hoveredCell))!}
          fill="var(--color-ink)"
          fillOpacity={0.12}
          pointerEvents="none"
        />
      )}
      <path d={gridPath} fill="none" stroke="var(--color-grid)" strokeOpacity={0.75} strokeWidth={1} />
      <path d={gridOutlinePath} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} />
      {marked.map((cell) => (
        <path
          key={cellKey(cell)}
          d={pathGenerator(cellOutline(cell))!}
          fill="none"
          stroke="var(--color-wrong)"
          strokeWidth={3}
          pointerEvents="none"
        />
      ))}
      {revealed && (
        <path
          d={pathGenerator(cellOutline(countryCells.cells[0].cell))!}
          fill="none"
          stroke="var(--color-correct)"
          strokeWidth={4}
          pointerEvents="none"
        />
      )}
      <g
        fontSize={narrow ? 20 : 14}
        fontWeight={600}
        fill="currentColor"
        stroke="var(--bg)"
        strokeWidth={3}
        paintOrder="stroke"
        textAnchor="middle"
        dominantBaseline="middle"
        pointerEvents="none"
        className={`transition-opacity duration-200 ${animating ? "opacity-0" : ""}`}
      >
        {heatmap.map(
          ({ key, centre: [x, y], label }) =>
            Number.isFinite(x) && (
              <text key={key} x={x} y={y}>
                {label}
              </text>
            ),
        )}
      </g>
    </svg>
  );
}
