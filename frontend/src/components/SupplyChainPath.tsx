"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import type { RefObject } from "react";

interface Stage {
  stage: string;
  detail: string;
  /** Set on the one stage carrying a live disruption, so severity reads. */
  alert?: string;
}

/**
 * One lane through a chain, from raw material to the customer who feels it.
 * Deliberately a single path rather than a network: the point of the section is
 * that an event upstream arrives downstream, and a lane shows that in one read.
 */
const STAGES: Stage[] = [
  { stage: "Tier-2 supplier", detail: "Silicon wafer · Hsinchu" },
  { stage: "Tier-1 supplier", detail: "Sensor array · Shenzhen" },
  { stage: "Port of origin", detail: "Kaohsiung" },
  { stage: "Ocean route", detail: "Transpacific · 18 days", alert: "Congestion detected" },
  { stage: "Port of entry", detail: "Long Beach" },
  { stage: "Assembly", detail: "Monterrey" },
  { stage: "Customer", detail: "Austin" },
];

const GAP = 78;
const RAIL = GAP * (STAGES.length - 1);
const DOT_X = 11;

/**
 * The chain does not scroll past. It holds still, in the same language as the
 * pinned globe, and scrolling walks a signal down it: the rail fills, each
 * stage lights as the signal reaches it, and the disrupted leg turns.
 */
export function SupplyChainPath({ sectionRef }: { sectionRef: RefObject<HTMLElement> }) {
  const reduced = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Hold briefly at each end so the first and last stages are readable rather
  // than flashing past at the very edges of the section.
  const travel = useTransform(scrollYProgress, [0.06, 0.94], [0, 1], { clamp: true });

  const fillScale = useTransform(travel, (v) => (reduced ? 1 : v));
  const pulseY = useTransform(travel, (v) => v * RAIL);
  const pulseOpacity = useTransform(travel, [0, 0.02, 0.98, 1], [0, 1, 1, 0]);

  return (
    <div className="relative" style={{ height: RAIL + 40, paddingTop: 20 }}>
      <div className="relative" style={{ height: RAIL }}>
        {/* Base rail */}
        <div
          aria-hidden
          className="absolute w-px"
          style={{ left: DOT_X, top: 0, height: RAIL, background: "rgba(148,163,184,0.2)" }}
        />
        {/* Travelled rail. scaleY from the top, so this is transform-only. */}
        <motion.div
          aria-hidden
          className="absolute w-px origin-top"
          style={{
            left: DOT_X,
            top: 0,
            height: RAIL,
            background: "linear-gradient(180deg, rgba(91,141,239,0.35), #5b8def)",
            scaleY: fillScale,
          }}
        />
        {/* The signal itself, travelling down the lane. */}
        {!reduced && (
          <motion.span
            aria-hidden
            className="absolute block rounded-full"
            style={{
              left: DOT_X - 4,
              top: -4,
              width: 9,
              height: 9,
              background: "#5b8def",
              boxShadow: "0 0 14px rgba(91,141,239,0.9)",
              y: pulseY,
              opacity: pulseOpacity,
            }}
          />
        )}

        {STAGES.map((s, i) => (
          <Stage key={s.stage} stage={s} index={i} travel={travel} reduced={reduced} />
        ))}
      </div>
    </div>
  );
}

function Stage({
  stage,
  index,
  travel,
  reduced,
}: {
  stage: Stage;
  index: number;
  travel: MotionValue<number>;
  reduced: boolean;
}) {
  const at = index / (STAGES.length - 1);
  const span = 1 / (STAGES.length - 1);

  // A stage lights just before the signal arrives and stays lit behind it, so
  // the rail reads as a route already travelled rather than a moving spotlight.
  const raw = useTransform(travel, [at - span * 0.5, at - span * 0.05], [0, 1], {
    clamp: true,
  });
  const lit = useTransform(raw, (v) => (reduced ? 1 : v));

  const color = stage.alert ? "#e0575b" : "#5b8def";

  return (
    <div className="absolute left-0 right-0" style={{ top: index * GAP - 9 }}>
      <div className="flex items-start gap-4">
        <span className="relative mt-[3px] block h-[18px] w-[23px] flex-shrink-0">
          {/* Unlit dot */}
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: DOT_X - 3.5,
              top: 5,
              width: 7,
              height: 7,
              background: "rgba(148,163,184,0.35)",
            }}
          />
          {/* Lit dot and halo, faded in as the signal arrives. */}
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: DOT_X - 4.5,
              top: 4,
              width: 9,
              height: 9,
              background: color,
              boxShadow: `0 0 10px ${color}`,
              opacity: lit,
            }}
          />
        </span>

        <div className="min-w-0 pb-1">
          <div className="relative">
            <div className="text-[13.5px] font-semibold text-muted">{stage.stage}</div>
            {/* The bright label is a second layer, so only opacity animates. */}
            <motion.div
              aria-hidden
              className="absolute inset-0 text-[13.5px] font-semibold text-text"
              style={{ opacity: lit }}
            >
              {stage.stage}
            </motion.div>
          </div>
          <div className="num mt-1 text-[11px] tracking-[0.02em] text-muted/80">
            {stage.detail}
          </div>
          {stage.alert && (
            <motion.div
              className="mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10.5px] font-medium"
              style={{
                borderColor: "rgba(224,87,91,0.32)",
                background: "rgba(224,87,91,0.08)",
                color: "#e0575b",
                opacity: lit,
              }}
            >
              <span
                aria-hidden
                className="block h-1.5 w-1.5 rounded-full"
                style={{ background: "#e0575b" }}
              />
              {stage.alert}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
