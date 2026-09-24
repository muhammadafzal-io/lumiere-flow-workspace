"use client";

import { useEffect, useState } from "react";

/**
 * Drifting lines with nodes riding along them — a quiet "everything is connected" backdrop for the
 * closing section. Curves sweep the full width; white and dark nodes travel each curve on their own
 * slow loop, so the pattern never repeats the same way twice in view.
 *
 * Pure SVG: the lines gently sway with a CSS animation and the nodes follow their paths with SMIL
 * `animateMotion`. Under prefers-reduced-motion nothing moves — the nodes sit still at fixed points
 * along the lines instead. Decorative only, so it is hidden from assistive tech.
 */

const PATHS = [
  "M-40 260 C 200 120, 420 90, 620 140 S 980 270, 1240 70",
  "M-40 150 C 180 170, 380 270, 600 240 S 1000 130, 1240 290",
  "M-40 330 C 240 230, 460 250, 640 305 S 960 340, 1240 190",
  "M-40 60 C 220 10, 420 80, 640 195 S 1000 110, 1240 340",
  "M-40 385 C 300 350, 520 390, 760 315 S 1100 170, 1240 120",
];

interface Node {
  path: number;
  /** Where along the path it rests when motion is off, 0–1. */
  at: number;
  dur: number;
  /** Negative so every node starts mid-loop rather than all together. */
  begin: number;
  tone: "light" | "dark";
  r: number;
}

const NODES: Node[] = [
  { path: 0, at: 0.08, dur: 26, begin: -4, tone: "light", r: 7 },
  { path: 0, at: 0.52, dur: 30, begin: -18, tone: "dark", r: 6 },
  { path: 1, at: 0.3, dur: 22, begin: -9, tone: "light", r: 7 },
  { path: 1, at: 0.78, dur: 28, begin: -21, tone: "dark", r: 6 },
  { path: 2, at: 0.2, dur: 24, begin: -12, tone: "light", r: 6 },
  { path: 2, at: 0.66, dur: 32, begin: -3, tone: "light", r: 8 },
  { path: 3, at: 0.42, dur: 27, begin: -15, tone: "dark", r: 6 },
  { path: 3, at: 0.9, dur: 20, begin: -7, tone: "light", r: 6 },
  { path: 4, at: 0.14, dur: 29, begin: -10, tone: "light", r: 7 },
  { path: 4, at: 0.6, dur: 23, begin: -19, tone: "dark", r: 6 },
];

export function NetworkLines({ className = "" }: { className?: string }) {
  // null until mounted: the preference is only known in the browser, and rendering nodes before
  // we know would flash them in the wrong state.
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [resting, setResting] = useState<{ x: number; y: number }[]>([]);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(prefersReduced);
    if (!prefersReduced) return;
    const points = NODES.map((node) => {
      const el = document.getElementById(`network-path-${node.path}`) as SVGPathElement | null;
      if (!el) return { x: 0, y: 0 };
      const p = el.getPointAtLength(el.getTotalLength() * node.at);
      return { x: p.x, y: p.y };
    });
    setResting(points);
  }, []);

  return (
    <svg
      aria-hidden
      viewBox="0 0 1200 400"
      preserveAspectRatio="xMidYMid slice"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      <g className="network-sway">
        {PATHS.map((d, i) => (
          <path
            key={i}
            id={`network-path-${i}`}
            d={d}
            fill="none"
            stroke="white"
            strokeOpacity={0.5}
            strokeWidth={1.25}
          />
        ))}

        {reduced !== null &&
          NODES.map((node, i) => {
            const fill = node.tone === "light" ? "#ffffff" : "oklch(0.36 0.06 185)";
            const stroke = node.tone === "light" ? "none" : "rgb(255 255 255 / 0.35)";
            if (reduced) {
              const p = resting[i];
              return p ? (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={node.r}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={1.5}
                />
              ) : null;
            }
            return (
              <circle key={i} r={node.r} fill={fill} stroke={stroke} strokeWidth={1.5}>
                <animateMotion
                  dur={`${node.dur}s`}
                  begin={`${node.begin}s`}
                  repeatCount="indefinite"
                  rotate="auto"
                >
                  <mpath href={`#network-path-${node.path}`} />
                </animateMotion>
              </circle>
            );
          })}
      </g>
    </svg>
  );
}
