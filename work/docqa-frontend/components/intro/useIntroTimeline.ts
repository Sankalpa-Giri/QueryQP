"use client";

import { useEffect, useRef, useState } from "react";
import { timeline } from "../../config/intro";

/**
 * Walks through the timeline in intro.animation.json and returns the current phase id.
 * Components compare phases with `reached(phase, "some-id")` to decide what to show.
 */
export function useIntroTimeline(active: boolean, onPhase?: (id: string) => void) {
  const [phase, setPhase] = useState("idle");
  const onPhaseRef = useRef(onPhase);
  onPhaseRef.current = onPhase;

  useEffect(() => {
    if (!active) return;
    const timers = timeline.map((step) =>
      window.setTimeout(() => {
        setPhase(step.id);
        onPhaseRef.current?.(step.id);
      }, step.at * 1000),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [active]);

  return phase;
}
