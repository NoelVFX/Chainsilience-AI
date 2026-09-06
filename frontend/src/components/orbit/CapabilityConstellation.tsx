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

import { FOCUS_ANCHOR, SPHERE_FILL, STEPS, type OrbitFocus } from "./chapters";

const TAU = Math.PI * 2;
/** The diagonal cards sit at sin(60deg) of the vertical radius. */
const SIN60 = Math.sin(Math.PI / 3);

/**
 * Where the six steps sit on the ring, in radians, y down.
 *
 * Spacing them by equal ARC LENGTH rather than equal angle. On a flat ellipse
 * those are very different things: a degree near the left and right ends covers
 * far less perimeter than a degree at the top, so equal angles bunch the cards
 * up at the sides and squeeze out the gaps the arrows have to live in. Equal
 * arc length distributes them evenly all the way round. On a circle the two
 * agree exactly, and this reduces to a hexagon.
 *
 * Returns the six angles in step order — upper left, upper right, right, lower
 * right, lower left, left — monotonically increasing, so an arrow to the next
 * step is always a clockwise sweep.
 */
function ringAngles(rx: number, ry: number): number[] {
  const N = 1024;
  const cum = new Float64Array(N + 1);
  let px = rx;
  let py = 0;
  for (let i = 1; i <= N; i++) {
    const a = (i / N) * TAU;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    cum[i] = cum[i - 1] + Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  const perimeter = cum[N];

  // Six points at equal perimeter fractions, starting at the right-hand end.
  // Symmetry then puts the fourth exactly opposite, and mirrors the rest.
  const even: number[] = [];
  let j = 0;
  for (let k = 0; k < 6; k++) {
    const target = (k / 6) * perimeter;
    while (j < N && cum[j + 1] < target) j += 1;
    const span = cum[j + 1] - cum[j] || 1;
    even.push(((j + (target - cum[j]) / span) / N) * TAU);
  }

  // Rotate into step order and unwrap, so the sequence climbs from upper left
  // round to left without crossing zero in the middle.
  return [even[4] - TAU, even[5] - TAU, even[0], even[1], even[2], even[3]];
}

/** Cards are a fixed height, so every position is known before layout. */
const CARD_H = 104;
/** How far the earth blows up when a card is opened. Unchanged. */
const FOCUS_ZOOM = 4.6;
/** Headroom reserved at the top of the stage for the chapter headline. */
const HEADLINE_BAND = 178;
/** Worst-case panel height, used to keep an opened panel on screen. */
const PANEL_H = 320;
/** Clear run each arrow needs between two cards before it reads as an arrow. */
const ARROW_RUN = 72;

interface Geometry {
  w: number;
  h: number;
  /** Radius of the globe's box. The sphere itself fills SPHERE_FILL of it. */
  globeR: number;
  cardW: number;
  /** The ring the six cards sit on. An ellipse: stages are wider than tall. */
  rx: number;
  ry: number;
  /** Each step's angle on that ring, in step order. */
  angles: number[];
  panelW: number;
}

/**
 * Measure the stage and derive every position from it. The ring has to clear the
 * globe, the headline and the stage edges all at once, and the globe is sized in
 * viewport units, so this is computed from real pixels rather than authored at
 * one fixed size.
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

      const wantCardW = Math.min(w * 0.2, 280);
      // Widest ring that keeps the side cards fully on stage.
      const rx0 = Math.min(w * 0.34, w / 2 - wantCardW / 2 - 24, 500);
      // The topmost and bottommost cards sit at sin(60deg) of the vertical
      // radius, so that is what has to clear the headline above and the stage
      // edge below.
      const ry = Math.min(
        (h / 2 - HEADLINE_BAND - CARD_H / 2) / SIN60,
        (h / 2 - CARD_H / 2 - 20) / SIN60,
        h * 0.34,
      );

      // Six cards of a fixed width do not fit every ring. On a short stage the
      // ellipse flattens, neighbours close up, and the arrow between them is
      // trimmed away to a stub — so the card takes its width from the ring
      // rather than the ring being drawn around a width that will not fit.
      // Narrowing only ever widens the ring, so one corrective pass converges.
      const gaps = ringAngles(rx0, ry);
      let minChord = Infinity;
      for (let i = 0; i < gaps.length; i++) {
        const a = gaps[i];
        const b = i === gaps.length - 1 ? gaps[0] + TAU : gaps[i + 1];
        minChord = Math.min(
          minChord,
          Math.hypot(rx0 * (Math.cos(b) - Math.cos(a)), ry * (Math.sin(b) - Math.sin(a))),
        );
      }
      const cardW = Math.max(168, Math.min(wantCardW, minChord - ARROW_RUN));
      const rx = Math.min(w * 0.34, w / 2 - cardW / 2 - 24, 500);

      setGeo({
        w,
        h,
        // Mirrors GLOBE in OrbitAct: min(32svh, 62vw).
        globeR: Math.min(h * 0.32, w * 0.62) / 2,
        cardW,
        rx,
        ry,
        angles: ringAngles(rx, ry),
        panelW: Math.min(w * 0.3, 400),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return geo;
}

/** The point on the ring at angle `a`, in stage pixels. */
function ringPoint(geo: Geometry, a: number): [number, number] {
  return [geo.w / 2 + geo.rx * Math.cos(a), geo.h / 2 + geo.ry * Math.sin(a)];
}

/** Where a card sits at rest, and the direction it points from the globe. */
function slot(geo: Geometry, i: number) {
  const a = geo.angles[i];
  const dx = geo.rx * Math.cos(a);
  const dy = geo.ry * Math.sin(a);
  const len = Math.hypot(dx, dy) || 1;
  return {
    sx: Math.sign(dx) || 1,
    left: geo.w / 2 + dx - geo.cardW / 2,
    top: geo.h / 2 + dy - CARD_H / 2,
    // Unchanged from the radial version: a unit vector from the globe's centre
    // toward the card, and the same zoom. The camera logic never learns that the
    // cards were rearranged.
    focus: { ux: dx / len, uy: dy / len, zoom: FOCUS_ZOOM } as OrbitFocus,
  };
}

/** The card's rectangle, inflated, for trimming arrows that would run under it. */
function cardRect(geo: Geometry, i: number, pad: number) {
  const s = slot(geo, i);
  return {
    x1: s.left - pad,
    y1: s.top - pad,
    x2: s.left + geo.cardW + pad,
    y2: s.top + CARD_H + pad,
  };
}

/** Where the detail panel docks: the card's corner, grown outward, kept on screen. */
function panelBox(geo: Geometry, i: number) {
  const s = slot(geo, i);
  const left = s.sx < 0 ? s.left + geo.cardW - geo.panelW : s.left;
  return {
    left: Math.min(Math.max(left, 16), geo.w - geo.panelW - 16),
    top: Math.min(Math.max(s.top, 16), Math.max(16, geo.h - PANEL_H)),
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

export function CapabilityConstellation({ active, onFocusChange, camZoom, camBearing }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const geo = useGeometry(hostRef);
  const [lit, setLit] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const reduced = useReducedMotion() ?? false;

  // Stand-ins for the scene's camera before it has published anything, and in
  // the list fallback where there is no scene at all.
  const idleZoom = useMotionValue(1);
  const idleBearing = useMotionValue(0);
  const zoom = camZoom ?? idleZoom;
  const bearing = camBearing ?? idleBearing;

  // Below this the ring does not fit; the same six steps become a stacked list.
  const ring = !!geo && geo.w >= 1000 && geo.h >= 620;

  const close = useCallback(() => setOpen(null), []);

  // Scrolling away from the chapter, or shrinking past the ring's threshold,
  // closes whatever was open. A card left open off-screen would come back with
  // the camera still dived into it.
  useEffect(() => {
    if (!active || !ring) setOpen(null);
  }, [active, ring]);

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
  // The ring fades as the camera passes through it, so card text never streaks
  // across the frame at several times its size.
  const sceneOpacity = useTransform(zoom, [1.05, 1.85], [1, 0]);

  if (!ring || !geo) {
    return (
      <div ref={hostRef} className="absolute inset-0">
        <div className="flex h-full items-center justify-center px-5">
          <StepList compact expandable />
        </div>
      </div>
    );
  }

  const openSx = open === null ? 0 : slot(geo, open).sx;

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
        <CycleArrows geo={geo} lit={lit} />

        {STEPS.map((c, i) => {
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
                borderColor: lit === i ? "rgba(91,141,239,0.42)" : "rgba(148,163,184,0.14)",
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
              <div className="num mb-1.5 flex items-baseline gap-1.5 text-[10.5px] tracking-[0.12em] text-accent/70">
                <span>{c.k}</span>
                <span className="text-muted/40">/ 06</span>
              </div>
              <div className="text-[14px] font-semibold tracking-[-0.01em] text-text">
                {c.title}
              </div>
              <div className="mt-1 text-[11.5px] leading-[1.45] text-muted/75">{c.blurb}</div>
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
              <span>
                Step {STEPS[open].k} <span className="text-muted/40">/ 06</span>
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="text-[12px] leading-none text-muted/70 hover:text-text"
              >
                &#10005;
              </button>
            </div>
            <div className="text-[15px] font-semibold tracking-[-0.012em] text-text">
              {STEPS[open].title}
            </div>
            <p className="mt-2 text-[12.5px] leading-[1.65] text-muted">{STEPS[open].detail}</p>

            <div className="mt-4 border-t border-line pt-3">
              <div className="num text-[9.5px] uppercase tracking-[0.14em] text-muted/60">
                What runs here
              </div>
              <ul className="mt-2.5 space-y-2">
                {STEPS[open].features.map((f) => (
                  <li key={f.label} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent/70"
                    />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium leading-[1.4] text-text">
                        {f.label}
                      </span>
                      <span className="block text-[11.5px] leading-[1.5] text-muted/80">
                        {f.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* The loop is the point, so the panel names what comes next rather
                than leaving the reader to find the arrow again. */}
            <button
              type="button"
              className="num mt-4 flex w-full items-center gap-1.5 border-t border-line pt-3 text-left text-[10.5px] tracking-[0.08em] text-muted/70 transition-colors hover:text-accent"
              onClick={() => {
                const next = (open + 1) % STEPS.length;
                setOpen(next);
                onFocusChange?.(slot(geo, next).focus);
              }}
            >
              <span>Next</span>
              <span aria-hidden>&rarr;</span>
              <span className="truncate text-text/80">
                {STEPS[(open + 1) % STEPS.length].title}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The same six steps as a stacked list. Used where the ring does not fit, and in
 * the reduced-motion rendering of the act. The numbers and the rule down the
 * left carry the sequence that the arrows carry on the ring.
 */
export function StepList({
  compact = false,
  expandable = false,
}: {
  compact?: boolean;
  expandable?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ol className="mx-auto w-full max-w-2xl">
      {STEPS.map((c, i) => {
        const isOpen = open === i;
        const last = i === STEPS.length - 1;
        const body = (
          <>
            <div className="num mb-1 text-[10.5px] tracking-[0.12em] text-accent/70">
              {c.k} <span className="text-muted/40">/ 06</span>
            </div>
            <div
              className={`font-semibold tracking-[-0.01em] text-text ${
                compact ? "text-[13px]" : "text-[14.5px]"
              }`}
            >
              {c.title}
            </div>
            <p className="mt-1 text-[12px] leading-[1.55] text-muted">{c.blurb}</p>
            {isOpen && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-[12px] leading-[1.6] text-muted">{c.detail}</p>
                <ul className="mt-2.5 space-y-1.5">
                  {c.features.map((f) => (
                    <li key={f.label} className="text-[11.5px] leading-[1.5] text-muted/80">
                      <span className="font-medium text-text">{f.label}</span>
                      {" — "}
                      {f.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        );
        return (
          <li key={c.k} className="relative flex gap-4 pb-3">
            {/* The connector between steps, and the loop back to the top. */}
            <div className="flex w-3 shrink-0 flex-col items-center pt-4">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {!last && <span className="mt-1 w-px flex-1 bg-line-strong" />}
            </div>
            {expandable ? (
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
                className="tilt-card min-w-0 flex-1 rounded-panel border p-4 text-left"
                style={{
                  borderColor: isOpen ? "rgba(91,141,239,0.45)" : "rgba(148,163,184,0.14)",
                  background: "rgba(16,21,30,0.82)",
                }}
              >
                {body}
              </button>
            ) : (
              <div
                className="tilt-card min-w-0 flex-1 rounded-panel border p-4"
                style={{
                  borderColor: "rgba(148,163,184,0.14)",
                  background: "rgba(16,21,30,0.82)",
                }}
              >
                {body}
              </div>
            )}
          </li>
        );
      })}
      <li className="num flex gap-4 pl-7 text-[10.5px] tracking-[0.1em] text-muted/60">
        <span aria-hidden>&#8629;</span> back to 01
      </li>
    </ol>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One arrow per step, running along the ring to the step after it — including
 * the sixth back to the first, which is what makes this a cycle rather than a
 * list bent into a circle.
 *
 * Each arrow is a true elliptical arc on the same ellipse the cards sit on, so
 * it reads as one continuous orbit. The ends are trimmed by walking outward from
 * each card until the arc clears its rectangle, which keeps the arrows off the
 * cards at any viewport size without hand-tuned gaps.
 *
 * These live inside the scene layer, so the camera carries them too and they
 * stay welded to the ring as it grows.
 */
function CycleArrows({ geo, lit }: { geo: Geometry; lit: number | null }) {
  const PAD = 12;
  const HEAD = 9;

  const arrows = STEPS.map((_, i) => {
    const next = (i + 1) % STEPS.length;
    const from = geo.angles[i];
    // The last arrow closes the loop, so its target is the first step one full
    // turn on. That wrap is the whole reason this reads as a cycle.
    const to = i === STEPS.length - 1 ? geo.angles[0] + TAU : geo.angles[next];
    const rectA = cardRect(geo, i, PAD);
    const rectB = cardRect(geo, next, PAD);
    const inside = (r: ReturnType<typeof cardRect>, [x, y]: [number, number]) =>
      x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;

    // Walk in from both ends until the arc is clear of both cards.
    const STEPS_N = 48;
    const da = (to - from) / STEPS_N;
    let s = 0;
    while (s < STEPS_N && inside(rectA, ringPoint(geo, from + s * da))) s += 1;
    let e = STEPS_N;
    while (e > s && inside(rectB, ringPoint(geo, from + e * da))) e -= 1;
    // Back off the head a touch further, so it points at the card, not into it.
    e = Math.max(s, e - 1);
    if (e - s < 2) return null;

    const aStart = from + s * da;
    const aEnd = from + e * da;
    const [x1, y1] = ringPoint(geo, aStart);
    const [x2, y2] = ringPoint(geo, aEnd);

    // Tangent at the end of the arc, for the head's orientation.
    const tx = -geo.rx * Math.sin(aEnd);
    const ty = geo.ry * Math.cos(aEnd);
    const tl = Math.hypot(tx, ty) || 1;
    const ux = tx / tl;
    const uy = ty / tl;
    const bx = x2 - ux * HEAD;
    const by = y2 - uy * HEAD;
    const hw = 4.5;
    const head = `${x2},${y2} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}`;

    // Same ellipse, so an elliptical arc reproduces the ring exactly. Sweep 1 is
    // clockwise in SVG's y-down space, which is the direction of travel.
    const d = `M ${x1} ${y1} A ${geo.rx} ${geo.ry} 0 0 1 ${bx} ${by}`;

    return { d, head };
  });

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0"
      width={geo.w}
      height={geo.h}
      viewBox={`0 0 ${geo.w} ${geo.h}`}
    >
      {arrows.map((p, i) =>
        p === null ? null : (
          <g
            key={i}
            style={{
              transition: "opacity 220ms cubic-bezier(0.23,1,0.32,1)",
              opacity: lit === null ? 0.5 : lit === i ? 1 : 0.22,
            }}
          >
            <path
              d={p.d}
              fill="none"
              stroke="#5b8def"
              strokeWidth={lit === i ? 1.6 : 1}
              strokeLinecap="round"
            />
            <polygon points={p.head} fill="#5b8def" />
          </g>
        ),
      )}
    </svg>
  );
}
