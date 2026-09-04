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
import dynamic from "next/dynamic";
import { useRef, useState } from "react";

import { CapabilityConstellation, CapabilityGrid } from "./CapabilityConstellation";
import { CHAPTERS, type OrbitChapter } from "./chapters";

const OrbitCanvas = dynamic(() => import("./OrbitCanvas"), { ssr: false, loading: () => null });

/**
 * Diameter of the pinned globe. svh, not dvh: a mobile URL bar hiding must not
 * resize the one thing the entire act is anchored to.
 *
 * The stage is a fixed budget: nav space, a copy band, the globe, a second copy
 * band. Everything in it is sized against viewport height as well as width, or
 * the copy runs under the navbar on a short laptop screen.
 */
const GLOBE = "min(32svh, 62vw)";
/** Reserved top and bottom. Symmetric, so the globe stays optically centred. */
const STAGE_PAD = 72;
/** Gap between a copy band and the globe. */
const BAND_GAP = "clamp(16px, 3svh, 36px)";
const N = CHAPTERS.length;

interface Props {
  onLaunch: () => void;
  onSchedule: () => void;
}


/**
 * The Orbit act.
 *
 * The page does not travel downward past a stack of sections. The globe holds
 * the centre of the viewport for the whole act while the copy above and below it
 * is exchanged, and the earth turns to the region each chapter is about.
 *
 * Scroll progress is consumed as a motion value inside the WebGL frame loop, so
 * turning the earth costs zero React renders. Only the chapter index (five
 * changes across the whole act) is state.
 */
export function OrbitAct({ onLaunch, onSchedule }: Props) {
  const actRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion() ?? false;
  const [chapter, setChapter] = useState(0);

  const { scrollYProgress } = useScroll({
    target: actRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.min(N - 1, Math.max(0, Math.round(v * (N - 1))));
    setChapter((prev) => (prev === next ? prev : next));
  });

  const goTo = (i: number) => {
    const el = actRef.current;
    if (!el) return;
    const top = el.offsetTop + (el.offsetHeight - window.innerHeight) * (i / (N - 1));
    window.scrollTo({ top, behavior: "smooth" });
  };

  // Reduced motion: no pinning and no scroll-driven turn. One still globe, then
  // the chapters as ordinary stacked sections.
  if (reduced) {
    return (
      <section id="home" className="mx-auto max-w-3xl px-6 pb-10 pt-32">
        <div className="mx-auto mb-16" style={{ width: GLOBE, height: GLOBE }}>
          <OrbitCanvas progress={scrollYProgress} chapter={0} reducedMotion />
        </div>
        {CHAPTERS.map((c, i) => (
          <div
            key={c.rail}
            id={c.layout === "radial" ? "features" : undefined}
            className="mb-20 scroll-mt-28 text-center"
          >
            <ChapterHead chapter={c} index={i} />
            {c.layout === "radial" ? (
              <div className="mt-8">
                <CapabilityGrid />
              </div>
            ) : (
              <div className="mt-5">
                <ChapterFoot
                  chapter={c}
                  index={i}
                  onLaunch={onLaunch}
                  onSchedule={onSchedule}
                />
              </div>
            )}
          </div>
        ))}
      </section>
    );
  }

  return (
    <section id="home" ref={actRef} className="relative" style={{ height: `${N * 100}svh` }}>
      {/* Scroll anchors: each chapter starts one viewport further down, so an
          in-page link can land on a chapter rather than on the act as a whole. */}
      {CHAPTERS.map((c, i) =>
        c.layout === "radial" ? (
          <div
            key={c.rail}
            id="features"
            aria-hidden
            className="absolute left-0 w-px"
            style={{ top: `${i * 100}svh`, height: 1 }}
          />
        ) : null,
      )}

      <div className="sticky top-0 h-[100svh] w-full">
        {/* The constant: one earth, dead centre, for the whole act. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div style={{ width: GLOBE, height: GLOBE }}>
            <OrbitCanvas progress={scrollYProgress} chapter={chapter} />
          </div>
        </div>

        {/* Scrim: darkens the top and bottom bands so copy always has ground
            under it, and leaves the globe's midriff untouched. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,13,20,0.94) 0%, rgba(10,13,20,0.34) 25%," +
              "rgba(10,13,20,0) 41%, rgba(10,13,20,0) 59%, rgba(10,13,20,0.34) 75%," +
              "rgba(10,13,20,0.94) 100%)",
          }}
        />

        {CHAPTERS.map((c, i) => (
          <Chapter
            key={c.rail}
            chapter={c}
            index={i}
            progress={scrollYProgress}
            active={i === chapter}
            onLaunch={onLaunch}
            onSchedule={onSchedule}
          />
        ))}

        <Rail current={chapter} onSelect={goTo} />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Chapter({
  chapter,
  index,
  progress,
  active,
  onLaunch,
  onSchedule,
}: {
  chapter: OrbitChapter;
  index: number;
  progress: MotionValue<number>;
  active: boolean;
  onLaunch: () => void;
  onSchedule: () => void;
}) {
  const step = 1 / (N - 1);
  const c = index * step;

  // Each chapter owns a window of scroll: fully legible across the middle of its
  // window, handing over at the edges.
  const opacity = useTransform(
    progress,
    [c - step * 0.52, c - step * 0.14, c + step * 0.14, c + step * 0.52],
    [0, 1, 1, 0],
  );
  // Copy drifts upward as it leaves, so the exchange has a direction.
  const y = useTransform(progress, [c - step * 0.52, c, c + step * 0.52], [20, 0, -20]);
  // A little blur bridges the crossfade. Without it you read two overlapping
  // blocks of text instead of one block changing. Kept on the copy wrappers
  // rather than the full-viewport layer so the blurred region stays small.
  const blurPx = useTransform(
    progress,
    [c - step * 0.52, c - step * 0.22, c + step * 0.22, c + step * 0.52],
    [4, 0, 0, 4],
  );
  const filter = useMotionTemplate`blur(${blurPx}px)`;

  // The capabilities chapter fans six cards around the globe instead of stacking
  // copy above and below it, so it gets its own layout.
  if (chapter.layout === "radial") {
    return (
      <motion.div
        className="absolute inset-0"
        style={{ opacity, pointerEvents: active ? "auto" : "none" }}
        aria-hidden={!active}
      >
        <motion.h2
          className="absolute inset-x-0 top-[86px] mx-auto max-w-[24ch] text-balance px-6 text-center text-[clamp(1.4rem,2.6vw,2rem)] font-semibold tracking-[-0.02em] text-text"
          style={{ y, filter }}
        >
          {chapter.headline}
        </motion.h2>
        <CapabilityConstellation active={active} />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="absolute inset-0 grid grid-rows-[1fr_auto_1fr] px-6"
      style={{
        opacity,
        pointerEvents: active ? "auto" : "none",
        // Symmetric, so the middle row stays centred on the globe while the top
        // band still clears the fixed navbar.
        paddingTop: STAGE_PAD,
        paddingBottom: STAGE_PAD,
      }}
      aria-hidden={!active}
    >
      <motion.div
        className="flex min-h-0 items-end justify-center"
        style={{ y, filter, paddingBottom: BAND_GAP }}
      >
        <ChapterHead chapter={chapter} index={index} />
      </motion.div>

      {/* Reserves exactly the globe's footprint, so copy never lands on it. */}
      <div aria-hidden style={{ height: GLOBE }} />

      <motion.div
        className="flex min-h-0 items-start justify-center"
        style={{ y, filter, paddingTop: BAND_GAP }}
      >
        <ChapterFoot
          chapter={chapter}
          index={index}
          onLaunch={onLaunch}
          onSchedule={onSchedule}
        />
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */

function ChapterHead({ chapter, index }: { chapter: OrbitChapter; index: number }) {
  const isHero = index === 0;
  return (
    <div className="mx-auto w-full max-w-3xl text-center">
      {/* The badge is the first thing to go on a short screen: it is the least
          load-bearing element in the band and the only one that can be cut
          without losing meaning. */}
      {isHero && (
        <span
          className="mb-5 hidden items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11.5px] font-medium text-accent [@media(min-height:760px)]:inline-flex"
          style={{ borderColor: "rgba(91,141,239,0.28)", background: "rgba(91,141,239,0.07)" }}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
          Powered by NVIDIA Nemotron
        </span>
      )}
      {/* Both headlines are measured to break at two lines, and are capped by
          viewport HEIGHT as well as width: the band above the globe is finite,
          and a third line pushes the copy under the navbar. */}
      {isHero ? (
        <h1 className="mx-auto max-w-[26ch] text-balance text-[clamp(1.5rem,min(3.9vw,4.8svh),3.05rem)] font-semibold leading-[1.06] tracking-[-0.026em] text-text">
          {chapter.headline}
        </h1>
      ) : (
        <h2 className="mx-auto max-w-[24ch] text-balance text-[clamp(1.3rem,min(3.1vw,4svh),2.4rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-text">
          {chapter.headline}
        </h2>
      )}
    </div>
  );
}

function ChapterFoot({
  chapter,
  index,
  onLaunch,
  onSchedule,
}: {
  chapter: OrbitChapter;
  index: number;
  onLaunch: () => void;
  onSchedule: () => void;
}) {
  const isHero = index === 0;
  return (
    <div className="mx-auto w-full max-w-xl text-center">
      <p className="mx-auto max-w-[52ch] text-[clamp(13.5px,1.9svh,15.5px)] leading-[1.62] text-muted">
        {chapter.body}
      </p>

      {isHero ? (
        <div
          className="flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ marginTop: BAND_GAP }}
        >
          <button
            onClick={onLaunch}
            className="btn-primary px-7"
            style={{ paddingBlock: "clamp(10px, 1.6svh, 14px)" }}
          >
            Launch demo
          </button>
          <button
            onClick={onSchedule}
            className="btn-ghost px-7"
            style={{ paddingBlock: "clamp(10px, 1.6svh, 14px)" }}
          >
            Schedule a walkthrough
          </button>
        </div>
      ) : (
        chapter.proof && (
          <div
            className="num mt-5 inline-flex items-center rounded-full border px-3.5 py-1.5 text-[11.5px] text-muted"
            style={{ borderColor: "rgba(148,163,184,0.16)", background: "rgba(148,163,184,0.05)" }}
          >
            {chapter.proof}
          </div>
        )
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Chapter rail. Real navigation: it says where you are and jumps you there. */
function Rail({ current, onSelect }: { current: number; onSelect: (i: number) => void }) {
  return (
    <nav
      aria-label="Chapters"
      className="absolute right-5 top-1/2 hidden -translate-y-1/2 flex-col gap-3 md:flex"
    >
      {CHAPTERS.map((c, i) => {
        const on = i === current;
        return (
          <button
            key={c.rail}
            onClick={() => onSelect(i)}
            aria-current={on ? "step" : undefined}
            aria-label={`Go to chapter: ${c.rail}`}
            className="flex items-center justify-end gap-2.5"
          >
            <span
              className="text-[10.5px] uppercase tracking-[0.16em] transition-opacity duration-200"
              style={{ color: "#e7eaf1", opacity: on ? 1 : 0 }}
            >
              {c.rail}
            </span>
            <span
              aria-hidden
              className="block w-[3px] rounded-full transition-all duration-300"
              style={{
                height: on ? 22 : 8,
                background: on ? "#5b8def" : "rgba(148,163,184,0.3)",
                transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            />
          </button>
        );
      })}
    </nav>
  );
}
