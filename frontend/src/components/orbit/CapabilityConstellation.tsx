"use client";

import { useEffect, useRef, useState } from "react";

import { CAPABILITIES } from "./chapters";

/** Card centres as (dx, dy) offsets from the globe, in the order of CAPABILITIES. */
const SLOTS: [number, number][] = [
  [-1, -1], // 01 upper left
  [-1, 0], //  02 left
  [-1, 1], //  03 lower left
  [1, -1], //  04 upper right
  [1, 0], //   05 right
  [1, 1], //   06 lower right
];

interface Geometry {
  w: number;
  h: number;
  globeR: number;
  cardW: number;
  dxSide: number;
  dxCorner: number;
  dyCorner: number;
}

/**
 * Measure the stage and derive every position from it. The arrows have to start
 * exactly at the globe's rim, and the globe is sized in viewport units, so the
 * layout is computed from real pixels rather than authored at one fixed size.
 */
function useGeometry(ref: React.RefObject<HTMLDivElement>): Geometry | null {
  const [geo, setGeo] = useState<Geometry | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      setGeo({
        w,
        h,
        // Mirrors GLOBE in OrbitAct: min(38svh, 68vw).
        globeR: Math.min(h * 0.38, w * 0.68) / 2,
        cardW: Math.min(w * 0.208, 300),
        dxSide: Math.min(w * 0.32, 462),
        dxCorner: Math.min(w * 0.262, 377),
        dyCorner: Math.min(h * 0.29, 262),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return geo;
}

export function CapabilityConstellation({ active }: { active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const geo = useGeometry(hostRef);
  const [lit, setLit] = useState<number | null>(null);

  // Below this the fan does not fit; the same six cards become a plain grid.
  const radial = !!geo && geo.w >= 1000 && geo.h >= 620;

  return (
    <div ref={hostRef} className="absolute inset-0">
      {radial && geo ? (
        <>
          <Arrows geo={geo} lit={lit} />
          {CAPABILITIES.map((c, i) => {
            const [sx, sy] = SLOTS[i];
            const dx = sy === 0 ? geo.dxSide * sx : geo.dxCorner * sx;
            const dy = geo.dyCorner * sy;
            return (
              <div
                key={c.k}
                className="absolute"
                style={{
                  left: `calc(50% + ${dx}px)`,
                  top: `calc(50% + ${dy}px)`,
                  width: geo.cardW,
                  transform: "translate(-50%, -50%)",
                  pointerEvents: active ? "auto" : "none",
                }}
                onMouseEnter={() => setLit(i)}
                onMouseLeave={() => setLit((v) => (v === i ? null : v))}
              >
                <Card capability={c} />
              </div>
            );
          })}
        </>
      ) : (
        <div className="flex h-full items-center justify-center px-5">
          <CapabilityGrid compact />
        </div>
      )}
    </div>
  );
}

/** The same six cards, laid out as a grid. Used where the fan does not fit. */
export function CapabilityGrid({ compact = false }: { compact?: boolean }) {
  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
      {CAPABILITIES.map((c) => (
        <Card key={c.k} capability={c} compact={compact} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Card({
  capability,
  compact = false,
}: {
  capability: (typeof CAPABILITIES)[number];
  compact?: boolean;
}) {
  return (
    <div
      className="tilt-card rounded-panel border p-4"
      style={{
        borderColor: "rgba(148,163,184,0.14)",
        background: "rgba(16,21,30,0.82)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div className="num mb-2 text-[10.5px] tracking-[0.12em] text-accent/70">
        {capability.k}
      </div>
      <div
        className={`font-semibold tracking-[-0.01em] text-text ${
          compact ? "text-[12.5px]" : "text-[14px]"
        }`}
      >
        {capability.title}
      </div>
      {!compact && (
        <p className="mt-1.5 text-[12px] leading-[1.55] text-muted">{capability.blurb}</p>
      )}
    </div>
  );
}

/**
 * One arrow per card: a radial line from the globe's rim to the middle of that
 * card's inner edge, with a head at the tip. Hovering a card brightens its own
 * arrow, which is the whole point of drawing them at all.
 */
function Arrows({ geo, lit }: { geo: Geometry; lit: number | null }) {
  const cx = geo.w / 2;
  const cy = geo.h / 2;
  const start = geo.globeR + 14;

  const paths = CAPABILITIES.map((_, i) => {
    const [sx, sy] = SLOTS[i];
    const dx = (sy === 0 ? geo.dxSide : geo.dxCorner) * sx;
    const tipX = dx - sx * (geo.cardW / 2 + 10);
    const tipY = geo.dyCorner * sy;
    const len = Math.hypot(tipX, tipY);
    const ux = tipX / len;
    const uy = tipY / len;

    const x1 = cx + ux * start;
    const y1 = cy + uy * start;
    const x2 = cx + tipX;
    const y2 = cy + tipY;

    // Arrowhead: a triangle at the tip, squared off against the travel direction.
    const hl = 9;
    const hw = 4.5;
    const bx = x2 - ux * hl;
    const by = y2 - uy * hl;
    const head = `${x2},${y2} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}`;

    return { x1, y1, x2: bx, y2: by, head };
  });

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0"
      width={geo.w}
      height={geo.h}
      viewBox={`0 0 ${geo.w} ${geo.h}`}
    >
      {paths.map((p, i) => {
        const on = lit === i;
        return (
          <g
            key={i}
            style={{
              transition: "opacity 200ms cubic-bezier(0.23,1,0.32,1)",
              opacity: on ? 1 : 0.42,
            }}
          >
            <line
              x1={p.x1}
              y1={p.y1}
              x2={p.x2}
              y2={p.y2}
              stroke="#5b8def"
              strokeWidth={on ? 1.6 : 1}
              strokeLinecap="round"
            />
            <polygon points={p.head} fill="#5b8def" />
          </g>
        );
      })}
    </svg>
  );
}
