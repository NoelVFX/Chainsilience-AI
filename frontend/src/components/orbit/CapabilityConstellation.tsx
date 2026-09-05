"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { CAPABILITIES, type OrbitFocus } from "./chapters";

/** Card slots as (sx, sy) direction from the globe, in the order of CAPABILITIES. */
const SLOTS: [number, number][] = [
  [-1, -1], // 01 upper left
  [-1, 0], //  02 left
  [-1, 1], //  03 lower left
  [1, -1], //  04 upper right
  [1, 0], //   05 right
  [1, 1], //   06 lower right
];

/** Closed cards are a fixed height, so every position is known before layout. */
const CLOSED_H = 96;
/**
 * How far the earth blows up when a card is opened.
 *
 * Deliberately past the point where the sphere still fits the stage. Anything
 * that keeps the whole globe in frame reads as inflating a ball; the zoom only
 * reads as zooming once the earth overflows the edges and you are looking at a
 * crop of it, the way an image viewer works.
 */
const FOCUS_ZOOM = 4.6;

const SPRING = { type: "spring" as const, duration: 0.44, bounce: 0.16 };

interface Geometry {
  w: number;
  h: number;
  globeR: number;
  cardW: number;
  openW: number;
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
        // Mirrors GLOBE in OrbitAct: min(32svh, 62vw).
        globeR: Math.min(h * 0.32, w * 0.62) / 2,
        cardW: Math.min(w * 0.208, 300),
        openW: Math.min(w * 0.3, 400),
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

/** Where a card sits, closed and open, plus the direction it points. */
function placement(geo: Geometry, i: number, open: boolean) {
  const [sx, sy] = SLOTS[i];
  const dx = (sy === 0 ? geo.dxSide : geo.dxCorner) * sx;
  const dy = geo.dyCorner * sy;

  const closedLeft = geo.w / 2 + dx - geo.cardW / 2;
  const top = Math.min(
    Math.max(geo.h / 2 + dy - CLOSED_H / 2, 16),
    Math.max(16, geo.h - (open ? 236 : CLOSED_H) - 16),
  );

  // An opened card grows outward, away from the globe, so the magnified earth
  // has the room it needs on the inner side.
  let left = closedLeft;
  if (open) {
    left = sx < 0 ? closedLeft + geo.cardW - geo.openW : closedLeft;
    left = Math.min(Math.max(left, 16), geo.w - geo.openW - 16);
  }

  const len = Math.hypot(dx, dy) || 1;
  return {
    left,
    top,
    width: open ? geo.openW : geo.cardW,
    sx,
    focus: { ux: dx / len, uy: dy / len, zoom: FOCUS_ZOOM } as OrbitFocus,
  };
}

interface Props {
  active: boolean;
  onFocusChange?: (focus: OrbitFocus | null) => void;
}

export function CapabilityConstellation({ active, onFocusChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const geo = useGeometry(hostRef);
  const [lit, setLit] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const reduced = useReducedMotion() ?? false;

  // Below this the fan does not fit; the same six cards become a plain grid.
  const radial = !!geo && geo.w >= 1000 && geo.h >= 620;

  const close = useCallback(() => setOpen(null), []);

  // Scrolling away from the chapter, or shrinking past the fan's threshold,
  // closes whatever was open. A card left open off-screen would come back
  // expanded with the globe still magnified into it.
  useEffect(() => {
    if (!active || !radial) setOpen(null);
  }, [active, radial]);

  // Tell the stage which way to magnify the earth, and to let go on close.
  useEffect(() => {
    if (open === null || !geo) {
      onFocusChange?.(null);
      return;
    }
    onFocusChange?.(placement(geo, open, true).focus);
  }, [open, geo, onFocusChange]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!radial || !geo) {
    return (
      <div ref={hostRef} className="absolute inset-0">
        <div className="flex h-full items-center justify-center px-5">
          <CapabilityGrid compact expandable />
        </div>
      </div>
    );
  }

  const openSx = open === null ? 0 : SLOTS[open][0];

  return (
    <div ref={hostRef} className="absolute inset-0">
      <Arrows geo={geo} lit={lit} open={open} />

      {/* Click-catcher. The gradient is darker on the card's side and clear on
          the globe's, so the copy has ground under it without veiling the
          magnified earth the card is pointing at. */}
      <AnimatePresence>
        {open !== null && (
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 z-10 cursor-default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
            onClick={close}
            style={{
              background:
                openSx < 0
                  ? "linear-gradient(90deg, rgba(6,9,15,0.8) 0%, rgba(6,9,15,0.36) 46%, rgba(6,9,15,0) 78%)"
                  : "linear-gradient(270deg, rgba(6,9,15,0.8) 0%, rgba(6,9,15,0.36) 46%, rgba(6,9,15,0) 78%)",
            }}
          />
        )}
      </AnimatePresence>

      {CAPABILITIES.map((c, i) => {
        const isOpen = open === i;
        const p = placement(geo, i, isOpen);
        const dimmed = open !== null && !isOpen;
        return (
          <motion.button
            key={c.k}
            type="button"
            layout={!reduced}
            transition={reduced ? { duration: 0 } : SPRING}
            aria-expanded={isOpen}
            className="tilt-card absolute z-20 rounded-panel border p-4 text-left"
            style={{
              left: p.left,
              top: p.top,
              width: p.width,
              minHeight: isOpen ? undefined : CLOSED_H,
              borderColor: isOpen ? "rgba(91,141,239,0.45)" : "rgba(148,163,184,0.14)",
              background: isOpen ? "rgba(14,19,28,0.94)" : "rgba(16,21,30,0.82)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              boxShadow: isOpen
                ? "0 26px 70px rgba(0,0,0,0.55), 0 0 30px rgba(91,141,239,0.22)"
                : undefined,
              pointerEvents: active ? "auto" : "none",
            }}
            animate={{ opacity: dimmed ? 0.16 : 1 }}
            onMouseEnter={() => setLit(i)}
            onMouseLeave={() => setLit((v) => (v === i ? null : v))}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(isOpen ? null : i);
            }}
          >
            <motion.div layout={!reduced} transition={reduced ? { duration: 0 } : SPRING}>
              <div className="num mb-2 flex items-center justify-between text-[10.5px] tracking-[0.12em] text-accent/70">
                <span>{c.k}</span>
                <span
                  aria-hidden
                  className="text-[12px] leading-none text-muted/70"
                  style={{ opacity: isOpen ? 1 : 0, transition: "opacity 180ms ease" }}
                >
                  &#10005;
                </span>
              </div>
              <div className="text-[14px] font-semibold tracking-[-0.01em] text-text">
                {c.title}
              </div>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.p
                    key="body"
                    className="mt-2.5 text-[13px] leading-[1.65] text-muted"
                    initial={reduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.28, delay: 0.08, ease: [0.23, 1, 0.32, 1] }}
                  >
                    {c.blurb}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.button>
        );
      })}
    </div>
  );
}

/** The same six cards, laid out as a grid. Used where the fan does not fit. */
export function CapabilityGrid({
  compact = false,
  expandable = false,
}: {
  compact?: boolean;
  expandable?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
      {CAPABILITIES.map((c, i) => {
        const isOpen = open === i;
        const body = (
          <p className="mt-1.5 text-[12px] leading-[1.55] text-muted">{c.blurb}</p>
        );
        const inner = (
          <>
            <div className="num mb-2 text-[10.5px] tracking-[0.12em] text-accent/70">{c.k}</div>
            <div
              className={`font-semibold tracking-[-0.01em] text-text ${
                compact ? "text-[12.5px]" : "text-[14px]"
              }`}
            >
              {c.title}
            </div>
            {(!expandable || isOpen) && body}
          </>
        );
        const style = {
          borderColor: isOpen ? "rgba(91,141,239,0.45)" : "rgba(148,163,184,0.14)",
          background: "rgba(16,21,30,0.82)",
        };
        return expandable ? (
          <button
            key={c.k}
            type="button"
            aria-expanded={isOpen}
            onClick={() => setOpen(isOpen ? null : i)}
            className="tilt-card rounded-panel border p-4 text-left"
            style={style}
          >
            {inner}
          </button>
        ) : (
          <div key={c.k} className="tilt-card rounded-panel border p-4" style={style}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One arrow per card: a radial line from the globe's rim to the middle of that
 * card's inner edge, with a head at the tip. Hovering a card brightens its own
 * arrow; opening one mutes the other five.
 */
function Arrows({
  geo,
  lit,
  open,
}: {
  geo: Geometry;
  lit: number | null;
  open: number | null;
}) {
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
        const on = lit === i || open === i;
        const muted = open !== null && open !== i;
        return (
          <g
            key={i}
            style={{
              transition: "opacity 220ms cubic-bezier(0.23,1,0.32,1)",
              opacity: muted ? 0.1 : on ? 1 : 0.42,
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
