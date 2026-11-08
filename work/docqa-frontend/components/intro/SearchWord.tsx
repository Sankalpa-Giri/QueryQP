"use client";

import { motion } from "framer-motion";
import { colors, intro, reached, stepOf } from "../../config/intro";
import { EASE_OUT } from "../../lib/motion";

/** The word "Search" on the third ruled line. Letter spacing tightens as it fades in. */
export function SearchWord({ phase }: { phase: string }) {
  const w = intro.elements.searchWord;
  const on = reached(phase, "search-in");

  return (
    <motion.text
      x={w.x}
      y={w.y}
      textAnchor="middle"
      fontSize={w.fontSize}
      fontWeight={w.fontWeight}
      fill={colors.textPrimary}
      className="font-sans"
      initial={{ opacity: 0, letterSpacing: w.entry.letterSpacingFrom }}
      animate={on ? { opacity: 1, letterSpacing: w.entry.letterSpacingTo } : undefined}
      transition={{ duration: stepOf("search-in").duration, ease: EASE_OUT }}
    >
      {w.text}
    </motion.text>
  );
}
