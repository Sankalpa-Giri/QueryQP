"use client";

import { motion } from "framer-motion";
import type { RefObject } from "react";
import { colors, intro, reached } from "../../config/intro";

type Props = {
  phase: string;
  groupRef: RefObject<SVGGElement | null>;
  tipRef: RefObject<SVGCircleElement | null>;
};

/**
 * The stylus. Local origin (0,0) is the pen TIP and the body extends upward,
 * so translating the group to a point on a stroke puts the ink exactly there.
 */
export function Stylus({ phase, groupRef, tipRef }: Props) {
  const { docked, length } = intro.elements.stylus;
  const on = reached(phase, "notebook-in");

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={on ? { opacity: 1 } : undefined}
      transition={{ duration: 0.6, delay: 0.25 }}
      filter="url(#intro-soft-shadow)"
    >
      <g ref={groupRef} transform={`translate(${docked.x} ${docked.y}) rotate(${docked.rotation})`}>
        {/* body */}
        <rect
          x={-7}
          y={-length + 14}
          width={14}
          height={length - 36}
          rx={7}
          fill="url(#intro-stylus-body)"
        />
        {/* clip */}
        <rect x={5} y={-length + 34} width={4} height={72} rx={2} fill="#3A3A3A" />
        {/* grip band */}
        <rect x={-7} y={-64} width={14} height={8} fill={colors.primary} />
        {/* cone + ink tip */}
        <path d="M -7 -22 L 0 0 L 7 -22 Z" fill={colors.textPrimary} />
        <path d="M -3.2 -9.5 L 0 0 L 3.2 -9.5 Z" fill={colors.primary} />
        {/* cap */}
        <rect x={-7} y={-length} width={14} height={18} rx={5} fill={colors.primary} />
        {/* glow at the tip, only while inking */}
        <circle
          ref={tipRef}
          cx={0}
          cy={0}
          r={14}
          fill="url(#intro-tip-glow)"
          style={{ opacity: 0 }}
        />
      </g>
    </motion.g>
  );
}
