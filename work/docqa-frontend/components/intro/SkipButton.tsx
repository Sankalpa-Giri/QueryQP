"use client";

import { motion } from "framer-motion";
import { intro } from "../../config/intro";

export function SkipButton({ onSkip }: { onSkip: () => void }) {
  const { label, appearsAfter } = intro.accessibility.skipButton;
  return (
    <motion.button
      type="button"
      onClick={onSkip}
      className="absolute bottom-6 right-6 z-10 rounded-full border border-line bg-background/70 px-4 py-2 text-sm text-ink-muted backdrop-blur transition-colors hover:text-ink"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: appearsAfter, duration: 0.4 }}
    >
      {label}
    </motion.button>
  );
}
