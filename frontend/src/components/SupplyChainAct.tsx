"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useRef, useState } from "react";

interface Stage {
  stage: string;
  place: string;
  /** What Chainsilience actually does at this link in the chain. */
  copy: string;
  /** Set on the one stage carrying a live disruption, so severity reads. */
  alert?: string;
}

/**
 * One lane through a chain, from raw material to the customer who feels it.
 * Deliberately a single path rather than a network: the point of the section is
 * that an event upstream arrives downstream, and a lane shows that in one read.
 */
const STAGES: Stage[] = [
  {
    stage: "Tier-2 supplier",
    place: "Silicon wafer · Hsinchu",
    copy: "Two tiers above your bill of materials, one fab supplies most of the wafer in your sensor line. The twin holds that relationship, so a Hsinchu event is scored against your revenue instead of filed as foreign news.",
  },
  {
    stage: "Tier-1 supplier",
    place: "Sensor array · Shenzhen",
    copy: "Your direct supplier assembles the array. Its own dependency on the wafer above is an edge in the graph, and that edge is what makes an upstream shock traceable down to a part number.",
  },
  {
    stage: "Port of origin",
    place: "Kaohsiung",
    copy: "Cargo enters the physical network. Dwell time here is the first point where a delay stops being a forecast and becomes something you can measure.",
  },
  {
    stage: "Ocean route",
    place: "Transpacific · 18 days",
    alert: "Congestion detected",
    copy: "Eighteen days with no ability to re-order. This is where the relevance agent earns its place: congestion on this lane is yours, the same report on a lane you do not use is noise.",
  },
  {
    stage: "Port of entry",
    place: "Long Beach",
    copy: "The delay lands, quantified. Monte Carlo turns what is left of the schedule into a probability of stopping the line, rather than a yes or a no.",
  },
  {
    stage: "Assembly",
    place: "Monterrey",
    copy: "Buffer stock is finite. Mitigations are ranked here on service, cost and recovery time together, so the trade-off is explicit before anyone approves it.",
  },
  {
    stage: "Customer",
    place: "Austin",
    copy: "The number that mattered the whole way down. Every score upstream is expressed as revenue at risk here, because that is the only unit the decision is actually made in.",
  },
];

const N = STAGES.length;
/** Vertical distance between stages on the rail. Larger than a list: the lane
    is the subject of the section, not a caption beside it. */
const GAP = 190;
const RAIL = GAP * (N - 1);
const DOT_X = 13;
/** Scroll budget per stage. */
const STAGE_VH = 72;

const EASE = [0.23, 1, 0.32, 1] as const;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * The supply-chain act.
 *
 * The lane does not scroll past as a whole. It is pinned, and scrolling walks
 * down it one stage at a time: the rail slides so the stage you are on sits at
 * a fixed reading line, and the copy beside it is exchanged for that stage's.
 * Movement eases and then holds inside each stage's scroll budget, so it reads
 * as stepping between stations rather than sliding continuously.
 */
export function SupplyChainAct() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion() ?? false;
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  // Position along the rail, in pixels. Eases across the middle of each stage's
  // budget and holds at both ends, which is what makes it feel like arriving.
  const pos = useTransform(scrollYProgress, (v) => {
    const f = clamp01(v) * (N - 1);
    const i = Math.min(Math.floor(f), N - 2);
    const t = clamp01((f - i - 0.16) / 0.68);
    return (i + smoothstep(t)) * GAP;
  });
  const railY = useTransform(pos, (p) => -p);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.min(N - 1, Math.max(0, Math.round(clamp01(v) * (N - 1))));
    setActive((prev) => (prev === next ? prev : next));
  });

  // Reduced motion: no pinning and no travel. The lane and its copy become an
  // ordinary list, in order, all of it legible at once.
  if (reduced) {
    return (
      <section className="mx-auto max-w-3xl px-6 pb-24">
        {STAGES.map((s, i) => (
          <div key={s.stage} className="mb-12 border-l border-line pl-6">
            <div className="num text-[11px] tracking-[0.16em] text-accent/70">
              {String(i + 1).padStart(2, "0")} / {String(N).padStart(2, "0")}
            </div>
            <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-text">
              {s.stage}
            </h3>
            <div className="num mt-1.5 text-[12px] text-muted/80">{s.place}</div>
            {s.alert && <AlertChip label={s.alert} />}
            <p className="mt-3 text-[14.5px] leading-[1.7] text-muted">{s.copy}</p>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section ref={ref} className="relative" style={{ height: `${N * STAGE_VH}svh` }}>
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-[1fr_320px] items-center gap-16 px-6">
          {/* Copy for the stage you are standing on. */}
          <div className="relative min-h-[320px]">
            {STAGES.map((s, i) => (
              <StageCopy key={s.stage} stage={s} index={i} progress={scrollYProgress} />
            ))}
          </div>

          {/* The lane. Masked top and bottom so stages arrive and leave rather
              than being sliced off at a hard edge. */}
          <div
            className="relative h-[100svh]"
            style={{
              maskImage:
                "linear-gradient(180deg, transparent 0%, #000 20%, #000 80%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(180deg, transparent 0%, #000 20%, #000 80%, transparent 100%)",
            }}
          >
            <motion.div className="absolute left-0 right-0 top-1/2" style={{ y: railY }}>
              <div
                aria-hidden
                className="absolute w-px"
                style={{ left: DOT_X, top: 0, height: RAIL, background: "rgba(148,163,184,0.2)" }}
              />
              <TravelledRail pos={pos} />
              {STAGES.map((s, i) => (
                <Node key={s.stage} stage={s} index={i} pos={pos} />
              ))}
            </motion.div>
          </div>
        </div>

        <StageRail active={active} />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function TravelledRail({ pos }: { pos: MotionValue<number> }) {
  const scaleY = useTransform(pos, (p) => clamp01(p / RAIL));
  return (
    <motion.div
      aria-hidden
      className="absolute w-px origin-top"
      style={{
        left: DOT_X,
        top: 0,
        height: RAIL,
        background: "linear-gradient(180deg, rgba(91,141,239,0.4), #5b8def)",
        scaleY,
      }}
    />
  );
}

function Node({ stage, index, pos }: { stage: Stage; index: number; pos: MotionValue<number> }) {
  const at = index * GAP;
  const color = stage.alert ? "#e0575b" : "#5b8def";

  // Lit once the signal has passed, so the rail reads as a route travelled.
  const travelled = useTransform(pos, [at - GAP * 0.45, at - GAP * 0.05], [0, 1], {
    clamp: true,
  });
  // Focus peaks exactly on the stage you are standing on.
  const focus = useTransform(pos, [at - GAP * 0.8, at, at + GAP * 0.8], [0, 1, 0], {
    clamp: true,
  });
  const dotScale = useTransform(focus, [0, 1], [1, 1.7]);
  const haloScale = useTransform(focus, [0, 1], [0.4, 1]);
  const placeOpacity = useTransform(travelled, [0, 1], [0.4, 0.85]);

  return (
    <div className="absolute left-0 right-0" style={{ top: at - 14 }}>
      <div className="flex items-start gap-5">
        <span className="relative mt-[3px] block h-7 w-7 flex-shrink-0">
          {/* Halo, only around the stage in focus. */}
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: DOT_X - 14,
              top: 0,
              width: 28,
              height: 28,
              border: `1px solid ${color}`,
              opacity: focus,
              scale: haloScale,
            }}
          />
          {/* Unlit dot, always present so the lane ahead is visible. */}
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: DOT_X - 4,
              top: 10,
              width: 8,
              height: 8,
              background: "rgba(148,163,184,0.32)",
            }}
          />
          {/* Lit dot, faded and scaled over it. */}
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: DOT_X - 5,
              top: 9,
              width: 10,
              height: 10,
              background: color,
              boxShadow: `0 0 12px ${color}`,
              opacity: travelled,
              scale: dotScale,
            }}
          />
        </span>

        <div className="min-w-0 pt-1.5">
          {/* Two layers, so only opacity animates rather than a colour. */}
          <div className="relative">
            <div className="text-[14px] font-semibold text-muted/50">{stage.stage}</div>
            <motion.div
              aria-hidden
              className="absolute inset-0 text-[14px] font-semibold text-text"
              style={{ opacity: travelled }}
            >
              {stage.stage}
            </motion.div>
          </div>
          <motion.div
            className="num mt-1 text-[11.5px] tracking-[0.02em] text-muted"
            style={{ opacity: placeOpacity }}
          >
            {stage.place}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function StageCopy({
  stage,
  index,
  progress,
}: {
  stage: Stage;
  index: number;
  progress: MotionValue<number>;
}) {
  const step = 1 / (N - 1);
  const at = index * step;

  // The outer and inner edges sum to one stage (0.62 + 0.38), which is what
  // makes the outgoing block's ramp-down and the incoming block's ramp-up cover
  // exactly the same interval. Any other pair leaves the column dipping toward
  // blank across the middle of every transition instead of cross-fading.
  const opacity = useTransform(
    progress,
    [at - step * 0.62, at - step * 0.38, at + step * 0.38, at + step * 0.62],
    [0, 1, 1, 0],
  );
  const y = useTransform(progress, [at - step * 0.62, at, at + step * 0.62], [18, 0, -18]);
  // Overlap means both blocks are briefly on screen in the same place, so a
  // little blur bridges them: without it you read two texts, not one changing.
  const blurPx = useTransform(
    progress,
    [at - step * 0.62, at - step * 0.42, at + step * 0.42, at + step * 0.62],
    [5, 0, 0, 5],
  );
  const filter = useMotionTemplate`blur(${blurPx}px)`;

  return (
    <motion.div className="absolute inset-x-0 top-0" style={{ opacity, y, filter }}>
      <div className="num text-[11px] tracking-[0.16em] text-accent/70">
        {String(index + 1).padStart(2, "0")} / {String(N).padStart(2, "0")}
      </div>
      <h3 className="mt-3 text-[clamp(1.5rem,2.6vw,2.05rem)] font-semibold tracking-[-0.022em] text-text">
        {stage.stage}
      </h3>
      <div className="num mt-2 text-[12.5px] text-muted/85">{stage.place}</div>
      {stage.alert && <AlertChip label={stage.alert} />}
      <p className="mt-5 max-w-[46ch] text-[14.5px] leading-[1.72] text-muted">{stage.copy}</p>
    </motion.div>
  );
}

function AlertChip({ label }: { label: string }) {
  return (
    <div
      className="mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium"
      style={{
        borderColor: "rgba(224,87,91,0.32)",
        background: "rgba(224,87,91,0.08)",
        color: "#e0575b",
      }}
    >
      <span aria-hidden className="block h-1.5 w-1.5 rounded-full" style={{ background: "#e0575b" }} />
      {label}
    </div>
  );
}

/** Which station you are at. Real progress information, not decoration. */
function StageRail({ active }: { active: number }) {
  return (
    <nav
      aria-label="Supply chain stages"
      className="absolute right-5 top-1/2 hidden -translate-y-1/2 flex-col gap-2.5 lg:flex"
    >
      {STAGES.map((s, i) => (
        <span
          key={s.stage}
          aria-current={i === active ? "step" : undefined}
          className="block w-[3px] rounded-full"
          style={{
            height: i === active ? 20 : 7,
            background: i === active ? "#5b8def" : "rgba(148,163,184,0.28)",
            transition: `height 300ms cubic-bezier(${EASE.join(",")}), background 300ms ease`,
          }}
        />
      ))}
    </nav>
  );
}
