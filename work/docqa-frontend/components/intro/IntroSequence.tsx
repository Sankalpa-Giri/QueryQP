"use client";

import { reached } from "../../config/intro";
import { IntroStage } from "./IntroStage";
import { RibbonSweep } from "./RibbonSweep";
import { SkipButton } from "./SkipButton";
import { useIntroTimeline } from "./useIntroTimeline";

type Props = {
  /** false while the provider is still deciding whether to play (avoids a flash of landing page). */
  playing: boolean;
  onReveal: () => void;
  onFinish: () => void;
};

/** Full-screen overlay that plays the intro, then gets out of the way. */
export function IntroSequence({ playing, onReveal, onFinish }: Props) {
  const phase = useIntroTimeline(playing, (id) => {
    if (id === "reveal") onReveal();
    if (id === "done") onFinish();
  });

  // Once ribbons fully cover the screen we can drop the dark backdrop and the stage;
  // the retracting ribbons then uncover the real landing page underneath.
  const revealing = reached(phase, "reveal");

  return (
    <div className={`fixed inset-0 z-[100] ${revealing ? "bg-transparent" : "bg-background"}`}>
      <div className={revealing ? "invisible" : undefined}>
        <IntroStage phase={phase} />
      </div>
      <RibbonSweep phase={phase} />
      {playing && !revealing && <SkipButton onSkip={onFinish} />}
    </div>
  );
}
