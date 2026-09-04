"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";

type Token =
  | { kind: "num"; value: number; grouped: boolean }
  | { kind: "text"; value: string };

/**
 * Split a display value into the numbers that should count and the literal
 * characters that should not. "16+" counts one number and keeps the plus,
 * "10,000" counts one and keeps its grouping, "24/7" counts both halves.
 */
function tokenize(display: string): Token[] {
  const out: Token[] = [];
  const re = /\d[\d,]*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(display)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: display.slice(last, m.index) });
    const raw = m[0];
    out.push({
      kind: "num",
      value: Number(raw.replace(/,/g, "")),
      grouped: raw.includes(","),
    });
    last = m.index + raw.length;
  }
  if (last < display.length) out.push({ kind: "text", value: display.slice(last) });
  return out;
}

interface Props {
  /** The final value, exactly as it should read when the count finishes. */
  value: string;
  durationMs?: number;
  delayMs?: number;
  className?: string;
}

/**
 * A number that counts up to its value the first time it is scrolled into view.
 *
 * The running value is written straight to the DOM node from the animation
 * frame rather than held in state: a counting number changes on every frame,
 * and putting that through React would re-render the tree sixty times a second
 * for a purely decorative effect.
 *
 * The final value is what renders on the server, so the figure is correct with
 * no JavaScript and correct for anyone who prefers reduced motion.
 */
export function CountUp({ value, durationMs = 1100, delayMs = 0, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();
  const tokens = useMemo(() => tokenize(value), [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView || reduced) return;

    const render = (p: number) => {
      el.textContent = tokens
        .map((t) => {
          if (t.kind === "text") return t.value;
          const n = Math.round(t.value * p);
          return t.grouped ? n.toLocaleString("en-US") : String(n);
        })
        .join("");
    };

    render(0);
    const controls = animate(0, 1, {
      duration: durationMs / 1000,
      delay: delayMs / 1000,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: render,
      onComplete: () => {
        // Land on the authored string, so "16+" is never left as "16" and the
        // grouping matches exactly what was written.
        el.textContent = value;
      },
    });
    return () => controls.stop();
  }, [inView, reduced, tokens, value, durationMs, delayMs]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
