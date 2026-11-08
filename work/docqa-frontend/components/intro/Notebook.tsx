"use client";

import { motion } from "framer-motion";
import { colors, intro, reached, stepOf } from "../../config/intro";
import { EASE_OUT } from "../../lib/motion";

/** The ruled notebook: body, spiral rings on the left, and the holder channel the stylus sits in. */
export function Notebook({ phase }: { phase: string }) {
  const n = intro.elements.notebook;
  const on = reached(phase, "notebook-in");

  const lines = Array.from(
    { length: n.ruledLines.count },
    (_, i) => n.ruledLines.firstY + i * n.ruledLines.gap,
  );
  const rings = Array.from({ length: n.rings.count }, (_, i) => n.rings.firstY + i * n.rings.gap);

  return (
    <motion.g
      initial={{ opacity: 0, y: n.entry.fromY }}
      animate={on ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: stepOf("notebook-in").duration, ease: EASE_OUT }}
    >
      {/* holder channel on the right edge: the stylus docks here */}
      <rect
        x={n.x + n.width - 2}
        y={n.y + n.holder.inset}
        width={n.holder.width}
        height={n.height - n.holder.inset * 2}
        rx={10}
        fill={colors.backgroundAlt}
        stroke={colors.border}
        strokeWidth={1.5}
      />

      {/* notebook body */}
      <rect
        x={n.x}
        y={n.y}
        width={n.width}
        height={n.height}
        rx={n.radius}
        fill={colors.surface}
        stroke={colors.border}
        strokeWidth={1.5}
        filter="url(#intro-soft-shadow)"
      />

      {lines.map((y) => (
        <line
          key={y}
          x1={n.x + n.ruledLines.insetLeft}
          x2={n.x + n.width - n.ruledLines.insetRight}
          y1={y}
          y2={y}
          stroke={colors.border}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      ))}

      {/* spiral rings straddling the left edge */}
      {rings.map((y) => (
        <g key={y}>
          <rect
            x={n.x - n.rings.width / 2 + 6}
            y={y - n.rings.height / 2}
            width={n.rings.width}
            height={n.rings.height}
            rx={n.rings.height / 2}
            fill="#2C2C2C"
            stroke="#454545"
            strokeWidth={1.5}
          />
          <circle cx={n.x + 12} cy={y} r={3} fill={colors.background} />
        </g>
      ))}
    </motion.g>
  );
}
