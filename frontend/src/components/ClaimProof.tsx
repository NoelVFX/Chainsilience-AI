"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

const EASE = [0.23, 1, 0.32, 1] as const;

type Evidence =
  | {
      kind: "factors";
      score: number;
      severity: string;
      rows: [string, number][];
    }
  | {
      kind: "chain";
      rows: { name: string; state: string; resolved?: string }[];
    }
  | { kind: "scope"; rows: [string, string][] };

interface Claim {
  k: string;
  label: string;
  caption: string;
  evidence: Evidence;
  note: string;
}

/**
 * Three claims that used to sit here as decorative pills. The claim is the front
 * of the card and the thing that makes it true is the back, which is the one
 * relationship a flip actually describes. A claim in a pill is filler; a claim
 * you can turn over is the argument.
 */
const CLAIMS: Claim[] = [
  {
    k: "01",
    label: "Explainable by design",
    caption: "One scored risk",
    evidence: {
      kind: "factors",
      score: 71,
      severity: "HIGH",
      rows: [
        ["Severity", 82],
        ["Exposure", 64],
        ["Coverage", 41],
      ],
    },
    note: "Every score carries this breakdown. Figures are an example.",
  },
  {
    k: "02",
    label: "Deterministic fallbacks",
    caption: "Scoring path, in order",
    evidence: {
      kind: "chain",
      rows: [
        { name: "NVIDIA Nemotron", state: "unavailable" },
        { name: "OpenAI", state: "unavailable" },
        { name: "Deterministic", state: "resolved", resolved: "71" },
      ],
    },
    note: "With both models down, the score still resolves.",
  },
  {
    k: "03",
    label: "Company-scoped and private",
    caption: "One tenant from another",
    evidence: {
      kind: "scope",
      rows: [
        ["Every read", "company_id = :you"],
        ["Neo4j subgraph", "one per company"],
        ["Cross-tenant", "0 rows"],
      ],
    },
    note: "Scoping lives in the repository, not in each endpoint.",
  },
];

export function ClaimProof() {
  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CLAIMS.map((c) => (
        <FlipCard key={c.k} claim={c} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FlipCard({ claim }: { claim: Claim }) {
  // Hover turns it over on a pointer; a click latches it, so touch and keyboard
  // get the same thing without needing a hover they cannot perform.
  const [hovered, setHovered] = useState(false);
  const [latched, setLatched] = useState(false);
  const reduced = useReducedMotion() ?? false;
  const shown = hovered || latched;

  return (
    <div className="flip-card h-[248px]" data-flipped={shown}>
      <button
        type="button"
        aria-expanded={shown}
        aria-label={`${claim.label}. Show the evidence.`}
        className="flip-card-inner block w-full cursor-pointer text-left"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          // Leaving with a mouse also drops the latch, so a pointer user never
          // walks away leaving three cards stuck open. A touch user gets no
          // mouseleave, which is exactly why the latch exists for them.
          setHovered(false);
          setLatched(false);
        }}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={() => setLatched((v) => !v)}
      >
        <span className="flip-card-face flip-card-front" aria-hidden={shown}>
          <span className="num text-[10.5px] tracking-[0.14em] text-accent/70">{claim.k}</span>
          <span className="mt-auto block text-[16.5px] font-semibold leading-[1.3] tracking-[-0.012em] text-text">
            {claim.label}
          </span>
          <span className="num mt-2.5 flex items-center gap-1.5 text-[10.5px] tracking-[0.1em] text-muted/60">
            <span aria-hidden>&#8634;</span> proof
          </span>
        </span>

        <span className="flip-card-face flip-card-back" aria-hidden={!shown}>
          <span className="num text-[10px] uppercase tracking-[0.14em] text-muted/70">
            {claim.caption}
          </span>
          <span className="mt-3 block">
            <EvidenceView evidence={claim.evidence} shown={shown} reduced={reduced} />
          </span>
          <span className="mt-auto block pt-3 text-[11px] leading-[1.5] text-muted/80">
            {claim.note}
          </span>
        </span>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function EvidenceView({
  evidence,
  shown,
  reduced,
}: {
  evidence: Evidence;
  shown: boolean;
  reduced: boolean;
}) {
  if (evidence.kind === "factors") {
    return (
      <span className="block">
        <span className="mb-3 flex items-baseline gap-2">
          <span className="num text-[24px] font-medium leading-none text-text">
            {evidence.score}
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-[9.5px] font-semibold tracking-[0.06em]"
            style={{ background: "rgba(224,87,91,0.14)", color: "#e0575b" }}
          >
            {evidence.severity}
          </span>
        </span>
        <span className="flex flex-col gap-2">
          {evidence.rows.map(([label, value], i) => (
            <span key={label} className="grid grid-cols-[68px_1fr_22px] items-center gap-2">
              <span className="text-[11.5px] text-muted">{label}</span>
              <Bar pct={value} delay={0.16 + i * 0.06} shown={shown} reduced={reduced} />
              <span className="num text-right text-[11px] text-text">{value}</span>
            </span>
          ))}
        </span>
      </span>
    );
  }

  if (evidence.kind === "chain") {
    return (
      <span className="flex flex-col gap-1.5">
        {evidence.rows.map((r) => {
          const resolved = r.state === "resolved";
          return (
            <span
              key={r.name}
              className="flex items-center justify-between rounded-control border px-2.5 py-1.5"
              style={{
                borderColor: resolved ? "rgba(91,141,239,0.3)" : "rgba(148,163,184,0.1)",
                background: resolved ? "rgba(91,141,239,0.06)" : "transparent",
              }}
            >
              <span className="text-[11.5px]" style={{ color: resolved ? "#e7eaf1" : "#6b7688" }}>
                {r.name}
              </span>
              <span
                className="num text-[10.5px]"
                style={{ color: resolved ? "#5b8def" : "#6b7688" }}
              >
                {resolved ? r.resolved : r.state}
              </span>
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <span className="flex flex-col gap-2.5">
      {evidence.rows.map(([label, value]) => (
        <span key={label} className="grid grid-cols-[86px_1fr] items-baseline gap-2">
          <span className="text-[11.5px] text-muted">{label}</span>
          <span className="num text-[10.5px] text-accent">{value}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * A factor bar. Grows on scaleX from the left rather than animating width, so
 * the reveal is a transform and never touches layout. It runs when the card is
 * turned over, not on mount, or it would have played to a face nobody was
 * looking at.
 */
function Bar({
  pct,
  delay,
  shown,
  reduced,
}: {
  pct: number;
  delay: number;
  shown: boolean;
  reduced: boolean;
}) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-[3px] bg-inset">
      <motion.span
        className="block h-full w-full origin-left rounded-[3px]"
        style={{ background: "#5b8def" }}
        initial={false}
        animate={{ scaleX: reduced || shown ? pct / 100 : 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.5, delay, ease: EASE }}
      />
    </span>
  );
}
