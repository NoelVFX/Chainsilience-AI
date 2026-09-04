"use client";

/**
 * Shared motion primitives (framer-motion), calibrated to the UI/UX guidance:
 * durations 250–400ms, offsets 8–24px, per-item stagger 0.03–0.08s, ease-out.
 * All primitives collapse to no-ops when the user prefers reduced motion.
 */
import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const; // ease-out (expo-ish)

/** Fade + rise entrance for a single block. */
export function FadeUp({
  children,
  delay = 0,
  y = 14,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const groupVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: EASE } },
};

/** Parent that staggers its <StaggerItem> children on mount. */
export function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={groupVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className} style={style}>{children}</div>;
  return (
    <motion.div className={className} style={style} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

/** Progress bar whose fill animates from 0 to `pct` on mount (meaningful motion). */
export function AnimatedBar({ pct, gradient }: { pct: number; gradient: string }) {
  const reduced = useReducedMotion();
  return (
    <div className="h-1.5 overflow-hidden rounded-[3px] bg-inset">
      <motion.div
        className="h-full rounded-[3px]"
        style={{ background: gradient }}
        initial={reduced ? { width: `${pct}%` } : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
      />
    </div>
  );
}

/**
 * Fade + rise the first time the element is scrolled into view. Unlike FadeUp,
 * which fires on mount, this waits until the reader actually reaches it, so a
 * section far down the page still has its entrance when they get there.
 */
export function Reveal({
  children,
  delay = 0,
  y = 16,
  amount = 0.4,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  amount?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
