"use client";

import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { CAPABILITIES, FOCUS_ANCHOR, SPHERE_FILL, type OrbitFocus } from "./chapters";

/** Card slots as (sx, sy) direction from the globe, in the order of CAPABILITIES. */
const SLOTS: [number, number][] = [
  [-1, -1], // 01 upper left
  [-1, 0], //  02 left
  [-1, 1], //  03 lower left
  [1, -1], //  04 upper right
  [1, 0], //   05 right
  [1, 1], //   06 lower right
];

/** Cards are a fixed height, so every position is known before layout. */
const CARD_H = 96;
/** How far the earth blows up when a card is opened. */
const FOCUS_ZOOM = 4.6;

interface Geometry {
  w: number;
  h: number;
  /** Radius of the globe's box. The sphere itself fills SPHERE_FILL of it. */
  globeR: number;
  cardW: number;
  panelW: number;
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
        panelW: Math.min(w * 0.3, 400),
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

/** Where a card sits at rest, and the direction it points from the globe. */
function slot(geo: Geometry, i: number) {
  const [sx, sy] = SLOTS[i];
  const dx = (sy === 0 ? geo.dxSide : geo.dxCorner) * sx;
  const dy = geo.dyCorner * sy;
  const len = Math.hypot(dx, dy) || 1;
  return {
    sx,
    left: geo.w / 2 + dx - geo.cardW / 2,
    top: geo.h / 2 + dy - CARD_H / 2,
    focus: { ux: dx / len, uy: dy / len, zoom: FOCUS_ZOOM } as OrbitFocus,
  };
}

/** Where the detail panel docks: the card's corner, grown outward, kept on screen. */
function panelBox(geo: Geometry, i: number) {
  const s = slot(geo, i);
  const left = s.sx < 0 ? s.left + geo.cardW - geo.panelW : s.left;
  return {
    left: Math.min(Math.max(left, 16), geo.w - geo.panelW - 16),
    top: Math.min(Math.max(s.top, 16), Math.max(16, geo.h - 252)),
    width: geo.panelW,
  };
}

interface Props {
  active: boolean;
  onFocusChange?: (focus: OrbitFocus | null) => void;
  /** The camera's live state, published by the scene each frame. */
  camZoom?: MotionValue<number>;
  camBearing?: MotionValue<number>;
}

export function CapabilityConstellation({
  active,
  onFocusChange,
  camZoom,
  camBearing,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const geo = useGeometry(hostRef);
  const [lit, setLit] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const reduced = useReducedMotion() ?? false;

  // Stand-ins for the scene's camera before it has published anything, and in
  // the grid fallback where there is no scene at all.
  const idleZoom = useMotionValue(1);
  const idleBearing = useMotionValue(0);
  const zoom = camZoom ?? idleZoom;
  const bearing = camBearing ?? idleBearing;

  // Below this the fan does not fit; the same six cards become a plain grid.
  const radial = !!geo && geo.w >= 1000 && geo.h >= 620;

  const close = useCallback(() => setOpen(null), []);

  // Scrolling away from the chapter, or shrinking past the fan's threshold,
  // closes whatever was open. A card left open off-screen would come back with
  // the camera still dived into it.
  useEffect(() => {
    if (!active || !radial) setOpen(null);
  }, [active, radial]);

  useEffect(() => {
    if (open === null || !geo) {
      onFocusChange?.(null);
      return;
    }
    onFocusChange?.(slot(geo, open).focus);
  }, [open, geo, onFocusChange]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // The camera's anchor, in CSS pixels on this stage: the same point the scene
  // scales the earth about. Sharing it is what keeps the two layers locked
  // together instead of drifting apart as the camera moves.
  const anchorR = geo ? geo.globeR * SPHERE_FILL * FOCUS_ANCHOR : 0;
  const cx = geo ? geo.w / 2 : 0;
  const cy = geo ? geo.h / 2 : 0;
  const originX = useTransform(bearing, (b) => cx + Math.cos(b) * anchorR);
  const originY = useTransform(bearing, (b) => cy + Math.sin(b) * anchorR);
  const transformOrigin = useMotionTemplate`${originX}px ${originY}px`;
  // The constellation fades as the camera passes through it, so card text never
  // streaks across the frame at several times its size.
  const sceneOpacity = useTransform(zoom, [1.05, 1.85], [1, 0]);

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
      {/*
        The scene layer. The cards belong to the same world as the earth, so the
        camera carries them too: scaled about the same anchor, by the same
        factor, on the same frame. Nothing here animates itself out of the way.
        Diving in simply leaves them behind, which is the whole point.
      */}
      <motion.div
        className="absolute inset-0"
        style={{
          scale: reduced ? 1 : zoom,
          transformOrigin,
          opacity: reduced ? 1 : sceneOpacity,
          pointerEvents: open === null && active ? "auto" : "none",
        }}
      >
        <Arrows geo={geo} lit={lit} />

        {CAPABILITIES.map((c, i) => {
          const s = slot(geo, i);
          return (
            <button
              key={c.k}
              type="button"
              aria-expanded={open === i}
              className="tilt-card absolute rounded-panel border p-4 text-left"
              style={{
                left: s.left,
                top: s.top,
                width: geo.cardW,
                minHeight: CARD_H,
                borderColor: "rgba(148,163,184,0.14)",
                background: "rgba(16,21,30,0.82)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
              onMouseEnter={() => setLit(i)}
              onMouseLeave={() => setLit((v) => (v === i ? null : v))}
              onClick={() => {
                setOpen(i);
                // Aim the camera in the same commit as the click. Leaving this
                // to the effect below costs an extra render pass before the
                // scene sees it, which is a frame or two of nothing happening.
                onFocusChange?.(slot(geo, i).focus);
              }}
            >
              <div className="num mb-2 text-[10.5px] tracking-[0.12em] text-accent/70">
                {c.k}
              </div>
              <div className="text-[14px] font-semibold tracking-[-0.01em] text-text">
                {c.title}
              </div>
            </button>
          );
        })}
      </motion.div>

      {/*
        The detail panel is not in the scene. It is interface laid over it, so it
        holds still while the camera moves, and it docks at the corner its card
        came from so the connection stays obvious.
      */}
      <AnimatePresence>
        {open !== null && (
          <motion.button
            key="backdrop"
            type="button"
            aria-label="Close"
            className="absolute inset-0 z-10 cursor-default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            onClick={close}
            style={{
              background:
                openSx < 0
                  ? "linear-gradient(90deg, rgba(6,9,15,0.78) 0%, rgba(6,9,15,0.34) 46%, rgba(6,9,15,0) 78%)"
                  : "linear-gradient(270deg, rgba(6,9,15,0.78) 0%, rgba(6,9,15,0.34) 46%, rgba(6,9,15,0) 78%)",
            }}
          />
        )}

        {open !== null && (
          <motion.div
            key="panel"
            className="absolute z-20 rounded-panel border p-4"
            style={{
              ...panelBox(geo, open),
              borderColor: "rgba(91,141,239,0.45)",
              background: "rgba(14,19,28,0.94)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              boxShadow: "0 26px 70px rgba(0,0,0,0.55), 0 0 30px rgba(91,141,239,0.22)",
            }}
            initial={reduced ? false : { opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.16 } }}
            // Held back a beat, so the camera is already moving when it arrives.
            transition={{ duration: 0.3, delay: 0.09, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="num mb-2 flex items-center justify-between text-[10.5px] tracking-[0.12em] text-accent/70">
              <span>{CAPABILITIES[open].k}</span>
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="text-[12px] leading-none text-muted/70 hover:text-text"
              >
                &#10005;
              </button>
            </div>
            <div className="text-[14px] font-semibold tracking-[-0.01em] text-text">
              {CAPABILITIES[open].title}
            </div>
            <p className="mt-2.5 text-[13px] leading-[1.65] text-muted">
              {CAPABILITIES[open].blurb}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
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
            {(!expandable || isOpen) && (
              <p className="mt-1.5 text-[12px] leading-[1.55] text-muted">{c.blurb}</p>
            )}
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
 * card's inner edge, with a head at the tip. These live inside the scene layer,
 * so the camera carries them as well and they stay welded to the rim as it
 * grows, rather than being drawn from a rim that is no longer there.
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
      {paths.map((p, i) => (
        <g
          key={i}
          style={{
            transition: "opacity 220ms cubic-bezier(0.23,1,0.32,1)",
            opacity: lit === i ? 1 : 0.42,
          }}
        >
          <line
            x1={p.x1}
            y1={p.y1}
            x2={p.x2}
            y2={p.y2}
            stroke="#5b8def"
            strokeWidth={lit === i ? 1.6 : 1}
            strokeLinecap="round"
          />
          <polygon points={p.head} fill="#5b8def" />
        </g>
      ))}
    </svg>
  );
}
