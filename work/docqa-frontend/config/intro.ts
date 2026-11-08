import animation from "./intro.animation.json";
import theme from "./theme.json";

type Bezier = [number, number, number, number];
const bezier = (v: number[]) => v as Bezier;

/** The full motion spec (intro.animation.json). */
export const intro = animation;
/** Colours come from theme.json so the intro and the site can't drift apart. */
export const colors = theme.colors;
export const ribbonColors = theme.ribbon;

export const timeline = animation.timeline;

export const ease = {
  out: bezier(animation.easing.out),
  inOut: bezier(animation.easing.inOut),
  in: bezier(animation.easing.in),
  pen: bezier(animation.easing.pen),
};

export function stepOf(id: string) {
  const step = timeline.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown intro step "${id}" (check intro.animation.json)`);
  return step;
}

const order = ["idle", ...timeline.map((s) => s.id)];

/** true once the timeline has reached `id` (or moved past it). */
export function reached(phase: string, id: string): boolean {
  return order.indexOf(phase) >= order.indexOf(id);
}
