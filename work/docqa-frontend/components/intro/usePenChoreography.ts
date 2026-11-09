"use client";

import { useEffect, useRef, type RefObject } from "react";
import { animate, type AnimationPlaybackControls } from "framer-motion";
import { ease, intro, stepOf } from "../../config/intro";
import { EASE_IN_OUT } from "../../lib/motion";

type Pose = { x: number; y: number; rot: number };

type Args = {
  phase: string;
  stylusRef: RefObject<SVGGElement | null>;
  tipRef: RefObject<SVGCircleElement | null>;
  wordRef: RefObject<SVGPathElement | null>;
  notebookRef: RefObject<SVGPathElement | null>;
};

const cfg = intro.elements.stylus;
const DOCKED: Pose = { ...cfg.docked, rot: cfg.docked.rotation };

const startPose = (path: SVGPathElement): Pose => {
  const p = path.getPointAtLength(0);
  return { x: p.x, y: p.y, rot: cfg.writingRotation };
};

/** Straight-line move with a small lift in the middle, so the pen feels picked up and put down. */
const arc = (a: Pose, b: Pose, t: number): Pose => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * cfg.liftHeight,
  rot: a.rot + (b.rot - a.rot) * t,
});

/**
 * Drives the stylus imperatively (setAttribute) instead of through React state,
 * so the pen follows the stroke at 60fps without re-rendering anything.
 */
export function usePenChoreography({ phase, stylusRef, tipRef, wordRef, notebookRef }: Args) {
  const running = useRef<AnimationPlaybackControls[]>([]);
  const mounted = useRef(false);
  const pose = useRef<Pose>(DOCKED);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      running.current.forEach((c) => c.stop());
      running.current = [];
    };
  }, []);

  useEffect(() => {
    const stylus = stylusRef.current;
    const word = wordRef.current;
    const book = notebookRef.current;
    if (!stylus || !word || !book) return;

    const apply = (p: Pose) => {
      pose.current = p;
      stylus.setAttribute(
        "transform",
        `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${p.rot.toFixed(2)})`,
      );
    };
    const ink = (on: boolean) => {
      if (tipRef.current) tipRef.current.style.opacity = on ? "1" : "0";
    };
    const track = (c: AnimationPlaybackControls) => running.current.push(c);

    const move = (to: Pose, duration: number, onComplete?: () => void) => {
      const from = pose.current;
      return animate(0, 1, {
        duration,
        ease: EASE_IN_OUT,
        onUpdate: (t) => apply(arc(from, to, t)),
        onComplete,
      });
    };

    const draw = (path: SVGPathElement, duration: number) => {
      const total = path.getTotalLength();
      ink(true);
      return animate(0, 1, {
        duration,
        ease: ease.pen,
        onUpdate: (p) => {
          path.style.strokeDashoffset = String(1 - p);
          const pt = path.getPointAtLength(p * total);
          apply({
            x: pt.x,
            y: pt.y,
            rot: cfg.writingRotation + Math.sin(p * Math.PI * 6) * cfg.wobble,
          });
        },
        onComplete: () => ink(false),
      });
    };

    switch (phase) {
      case "stylus-detach":
        track(move(startPose(word), stepOf("stylus-detach").duration));
        break;

      case "circle-word":
        track(draw(word, stepOf("circle-word").duration));
        break;

      case "circle-notebook": {
        const total = stepOf("circle-notebook").duration;
        track(
          move(startPose(book), cfg.hopDuration, () => {
            if (mounted.current) track(draw(book, total - cfg.hopDuration));
          }),
        );
        break;
      }
    }
  }, [phase, stylusRef, tipRef, wordRef, notebookRef]);
}
