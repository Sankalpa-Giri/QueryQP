export type ScribbleSpec = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  startDeg: number;
  sweepDeg: number;
  /** radius growth over the sweep (0.05 = ends 5% wider), so the loop overshoots like a hand-drawn one */
  grow: number;
  tiltDeg: number;
};

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * A hand-drawn-looking loop: an ellipse that starts at `startDeg`, sweeps past 360 degrees,
 * slowly grows and is slightly tilted. Returned as a smooth cubic-Bezier SVG path
 * (Catmull-Rom converted), so the stroke has no visible facets when zoomed in.
 */
export function scribblePath(s: ScribbleSpec, steps = 120): string {
  const ct = Math.cos(rad(s.tiltDeg));
  const st = Math.sin(rad(s.tiltDeg));

  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = rad(s.startDeg + s.sweepDeg * t);
    const k = 1 + s.grow * t;
    const ex = s.rx * k * Math.cos(a);
    const ey = s.ry * k * Math.sin(a);
    pts.push([s.cx + ex * ct - ey * st, s.cy + ex * st + ey * ct]);
  }

  const f = (n: number) => n.toFixed(2);
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
