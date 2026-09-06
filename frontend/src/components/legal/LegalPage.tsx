import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/Logo";
import { LEGAL, LEGAL_DOCS } from "@/lib/legal";

export interface TocEntry {
  id: string;
  title: string;
}

/**
 * The shell every legal document sits in.
 *
 * A policy is read, not operated, so this is deliberately quiet: one column at
 * a reading measure, a numbered spine, and a contents rail that only appears
 * when there is room for it. The one flourish is the summary panel — these
 * documents describe a product whose whole claim is that it explains itself,
 * so burying the substance under defined terms would undercut the pitch.
 */
export function LegalPage({
  title,
  summary,
  toc,
  children,
}: {
  title: string;
  summary: ReactNode;
  toc: TocEntry[];
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-base">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
          <Link href="/" className="flex items-center" aria-label="Chainsilience AI home">
            <Logo size={26} font={15} />
          </Link>
          <Link
            href="/"
            className="text-[13px] text-muted transition-colors hover:text-text"
          >
            &larr; Back to site
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 py-16 lg:grid-cols-[1fr_220px] lg:py-20">
        <article className="min-w-0">
          <p className="num text-[11px] uppercase tracking-[0.16em] text-accent/80">Legal</p>
          <h1 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-semibold leading-[1.15] tracking-[-0.024em] text-text">
            {title}
          </h1>
          <p className="num mt-4 text-[12.5px] text-muted">
            Effective {LEGAL.effective} &middot; {LEGAL.entity}
          </p>

          {/* Plain-English precis. Explicitly not the agreement, so it can be
              written for a human without becoming the thing that binds. */}
          <aside className="mt-9 rounded-panel border border-line bg-inset p-6">
            <h2 className="num text-[11px] uppercase tracking-[0.14em] text-muted">
              In short
            </h2>
            <div className="mt-3 space-y-3 text-[14px] leading-[1.7] text-muted">{summary}</div>
            <p className="mt-4 text-[12px] leading-[1.6] text-muted/70">
              This summary is for orientation only. The numbered sections below are the
              operative text.
            </p>
          </aside>

          <div className="mt-12 space-y-11">{children}</div>

          <footer className="mt-16 border-t border-line pt-8">
            <p className="text-[13.5px] leading-[1.75] text-muted">
              Questions about this document? Write to{" "}
              <a href={`mailto:${LEGAL.contact}`} className="text-accent hover:underline">
                {LEGAL.contact}
              </a>
              .
            </p>
            <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
              {LEGAL_DOCS.map((d) => (
                <Link
                  key={d.slug}
                  href={d.slug}
                  className="text-[13px] text-muted transition-colors hover:text-text"
                >
                  {d.title}
                </Link>
              ))}
            </nav>
          </footer>
        </article>

        {/* Contents rail. Hidden below lg, where it would just push the document
            down the page for no navigational gain. */}
        <nav aria-label="Contents" className="hidden lg:block">
          <div className="sticky top-20">
            <p className="num text-[11px] uppercase tracking-[0.14em] text-muted/70">Contents</p>
            <ol className="mt-4 space-y-2.5">
              {toc.map((t, i) => (
                <li key={t.id} className="flex gap-2.5">
                  <span className="num shrink-0 text-[11px] leading-[1.6] text-muted/50">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <a
                    href={`#${t.id}`}
                    className="text-[12.5px] leading-[1.5] text-muted transition-colors hover:text-text"
                  >
                    {t.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

/** One numbered clause. `scroll-mt` keeps the heading clear of the viewport top. */
export function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="flex gap-3 text-[19px] font-semibold leading-[1.35] tracking-[-0.015em] text-text">
        <span className="num shrink-0 pt-[3px] text-[13px] text-accent/70">
          {String(n).padStart(2, "0")}
        </span>
        <span>{title}</span>
      </h2>
      <div className="mt-4 max-w-[68ch] space-y-4">{children}</div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-[14.5px] leading-[1.8] text-muted">{children}</p>;
}

/** A sub-heading inside a clause, for the longer documents. */
export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="pt-2 text-[14.5px] font-semibold leading-[1.5] text-text">{children}</h3>
  );
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="space-y-2.5">{children}</ul>;
}

export function LI({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 text-[14.5px] leading-[1.8] text-muted">
      <span aria-hidden className="mt-[11px] h-px w-3 shrink-0 bg-line-strong" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** Inline emphasis for a defined term or a literal value from the codebase. */
export function Em({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-text">{children}</strong>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="num rounded-[4px] bg-inset px-1.5 py-0.5 text-[12.5px] text-accent">
      {children}
    </code>
  );
}

/**
 * A two- or three-column reference table. Scrolls inside its own container so a
 * wide row can never make the page itself scroll sideways.
 */
export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-panel border border-line">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="num border-b border-line bg-inset px-4 py-3 text-[10.5px] uppercase tracking-[0.12em] text-muted/80"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-b-0">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className="px-4 py-3.5 align-top text-[13.5px] leading-[1.7] text-muted"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
