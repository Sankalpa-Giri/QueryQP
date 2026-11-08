"use client";

import { useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { colors, intro, reached } from "../../config/intro";
import { scribblePath } from "../../lib/geometry";
import { EASE_IN } from "../../lib/motion";
import { Notebook } from "./Notebook";
import { PenStroke } from "./PenStroke";
import { SearchWord } from "./SearchWord";
import { Stylus } from "./Stylus";
import { usePenChoreography } from "./usePenChoreography";

/** The whole intro scene: backdrop glow + camera + one SVG holding notebook, word, strokes, stylus. */
export function IntroStage({ phase }: { phase: string }) {
  const { camera, backdropGlow, strokes } = intro.elements;
  const { canvas } = intro.meta;

  const stylusRef = useRef<SVGGElement>(null);
  const tipRef = useRef<SVGCircleElement>(null);
  const wordRef = useRef<SVGPathElement>(null);
  const notebookRef = useRef<SVGPathElement>(null);

  const wordPath = useMemo(() => scribblePath(strokes.word), [strokes.word]);
  const notebookPath = useMemo(() => scribblePath(strokes.notebook), [strokes.notebook]);

  usePenChoreography({ phase, stylusRef, tipRef, wordRef, notebookRef });

  const pushing = reached(phase, "ribbon-sweep");
  const glowing = reached(phase, "circle-notebook");

  return (
    <motion.div
      className="absolute inset-0 grid place-items-center"
      style={{ transformOrigin: camera.transformOrigin }}
      initial={{ scale: camera.idleZoom.from }}
      animate={
        pushing
          ? {
              scale: camera.pushIn.to,
              transition: { duration: camera.pushIn.duration, ease: EASE_IN },
            }
          : {
              scale: camera.idleZoom.to,
              transition: { duration: camera.idleZoom.duration, ease: "easeOut" },
            }
      }
    >
      {/* soft orange light behind the notebook; swells when the big loop is drawn */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(${backdropGlow.radius} 42% at 50% 48%, ${backdropGlow.color}, transparent 70%)`,
        }}
        initial={{ opacity: 0 }}
        animate={{
          opacity: pushing || glowing ? backdropGlow.peakOpacity : backdropGlow.restOpacity,
        }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      />

      <svg
        viewBox={`0 0 ${canvas.width} ${canvas.height}`}
        className="relative h-auto max-h-[88vh] w-[min(94vw,880px)] overflow-visible"
        role="img"
        aria-label="A notebook with the word Search, circled by a stylus"
      >
        <defs>
          <filter id="intro-pen-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="intro-soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#000" floodOpacity="0.55" />
          </filter>
          <linearGradient id="intro-stylus-body" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#3A3A3A" />
            <stop offset="0.5" stopColor="#1F1F1F" />
            <stop offset="1" stopColor="#2E2E2E" />
          </linearGradient>
          <radialGradient id="intro-tip-glow">
            <stop offset="0" stopColor={colors.primary} stopOpacity="0.95" />
            <stop offset="1" stopColor={colors.primary} stopOpacity="0" />
          </radialGradient>
        </defs>

        <Notebook phase={phase} />
        <SearchWord phase={phase} />
        <PenStroke d={wordPath} pathRef={wordRef} />
        <PenStroke d={notebookPath} pathRef={notebookRef} />
        <Stylus phase={phase} groupRef={stylusRef} tipRef={tipRef} />
      </svg>
    </motion.div>
  );
}
