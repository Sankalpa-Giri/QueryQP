"use client";

import { motion } from "framer-motion";
import { intro, reached, ribbonColors } from "../../config/intro";
import { EASE_IN_OUT } from "../../lib/motion";

/**
 * The Netflix-style sweep. Ten bands in the palette (orange to white) grow up from the bottom
 * left-to-right until they cover the screen, then retract upward to reveal the landing page.
 */
export function RibbonSweep({ phase }: { phase: string }) {
  const r = intro.elements.ribbons;
  const covering = reached(phase, "ribbon-sweep");
  const retracting = reached(phase, "reveal");

  return (
    <div className="pointer-events-none absolute inset-0 flex" aria-hidden>
      {ribbonColors.slice(0, r.count).map((color, i) => (
        <motion.div
          key={color + i}
          className="h-full flex-1"
          style={{
            background: color,
            // hairline ring closes sub-pixel gaps between bands; the soft shadow overlaps the neighbour
            boxShadow: `0 0 0 0.5px ${color}, -10px 0 24px rgba(0,0,0,0.35)`,
            transformOrigin: retracting ? r.outOrigin : r.inOrigin,
          }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: retracting ? 0 : covering ? 1 : 0 }}
          transition={{ duration: r.itemDuration, delay: i * r.stagger, ease: EASE_IN_OUT }}
        />
      ))}
    </div>
  );
}
