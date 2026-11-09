import type { RefObject } from "react";
import { intro } from "../../config/intro";

/**
 * One ink stroke. `pathLength={1}` normalises the dash maths, so the choreography hook
 * only has to move strokeDashoffset from 1 to 0 to draw it.
 */
export function PenStroke({
  d,
  pathRef,
}: {
  d: string;
  pathRef: RefObject<SVGPathElement | null>;
}) {
  const s = intro.elements.strokes;
  return (
    <path
      ref={pathRef}
      d={d}
      fill="none"
      stroke={s.color}
      strokeWidth={s.width}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray="1 2"
      strokeDashoffset={1}
      filter="url(#intro-pen-glow)"
    />
  );
}
