"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { CountUp } from "@/components/CountUp";
import { Logo } from "@/components/Logo";
import { Reveal } from "@/components/motion";
import { SupplyChainAct } from "@/components/SupplyChainAct";
import { OrbitAct } from "@/components/orbit/OrbitAct";
import { ApiError, getToken } from "@/lib/api";
import { useBillingStatus, useCreateCheckout } from "@/lib/hooks";

/**
 * Marketing landing page (route "/").
 *
 * The page opens with the Orbit act: a blue-marble globe pinned at the centre
 * of the viewport while the copy around it is exchanged chapter by chapter, and
 * the earth turns to the region each chapter is about. Everything after the act
 * (capabilities, pricing, about, contact) scrolls normally.
 *
 * "Schedule a walkthrough" opens the Calendly popup when CALENDLY_URL is set;
 * otherwise it falls back to a pre-filled email.
 */
const CONTACT_EMAIL = "chainsilienceai@gmail.com";
// Your Calendly scheduling link. Leave empty to fall back to the email scheduler.
const CALENDLY_URL = "https://calendly.com/chainsilienceai/30min";
const MEETING_URL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "Meeting request: Chainsilience AI",
)}&body=${encodeURIComponent(
  "Hi Chainsilience AI team,\n\nI'd like to schedule a walkthrough.\n\nCompany:\nSupply chain / industry:\nPreferred times:\n",
)}`;

declare global {
  interface Window {
    Calendly?: { initPopupWidget: (opts: { url: string }) => void };
  }
}

/** Load Calendly's popup-widget assets once (only when a link is configured). */
function useCalendly() {
  useEffect(() => {
    if (!CALENDLY_URL || typeof document === "undefined") return;
    if (!document.getElementById("calendly-css")) {
      const link = document.createElement("link");
      link.id = "calendly-css";
      link.rel = "stylesheet";
      link.href = "https://assets.calendly.com/assets/external/widget.css";
      document.head.appendChild(link);
    }
    if (!document.getElementById("calendly-js")) {
      const s = document.createElement("script");
      s.id = "calendly-js";
      s.src = "https://assets.calendly.com/assets/external/widget.js";
      s.async = true;
      document.body.appendChild(s);
    }
  }, []);
}

/** Open the Calendly scheduling popup, or fall back to the email scheduler. */
function openScheduler() {
  if (CALENDLY_URL && typeof window !== "undefined" && window.Calendly) {
    window.Calendly.initPopupWidget({ url: CALENDLY_URL });
    return;
  }
  window.location.href = MEETING_URL;
}

const NAV = [
  { label: "Home", id: "home" },
  { label: "Capabilities", id: "features" },
  { label: "Pricing", id: "pricing" },
  { label: "About", id: "about" },
  { label: "Contact", id: "contact" },
];

const PLANS = [
  {
    name: "Starter",
    price: "$0",
    cadence: "/ forever",
    tagline: "For a single team getting started.",
    features: [
      "1 company digital twin",
      "Daily news scan",
      "Core AI risk scoring",
      "Community support",
    ],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Growth",
    price: "$499",
    cadence: "/ month",
    tagline: "For teams running live risk operations.",
    features: [
      "Multiple digital twins",
      "Real-time news ingestion",
      "Monte Carlo simulation",
      "Multi-objective mitigation scoring",
      "Email alerts and Action Center",
      "Priority support",
    ],
    cta: "Start Growth",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    tagline: "For organisations with scale and compliance needs.",
    features: [
      "SSO and role-based access",
      "Dedicated Nemotron throughput",
      "Custom data integrations",
      "SLA and dedicated support",
      "On-prem / VPC deployment",
    ],
    cta: "Talk to us",
    highlight: false,
  },
];

// Numbers that are true of the running system, not marketing rounding.
const STATS = [
  { value: "16+", label: "Global intelligence sources" },
  { value: "30s", label: "News poll interval" },
  { value: "10,000", label: "Scenarios simulated per risk" },
  { value: "24/7", label: "Continuous monitoring" },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function LandingPage() {
  const router = useRouter();
  const launch = () => router.push(getToken() ? "/dashboard" : "/login");
  // Free plan: a signed-in user goes straight in; a guest starts onboarding
  // (create a free account) with no payment involved.
  const startFree = () => router.push(getToken() ? "/dashboard" : "/onboarding");
  useCalendly();

  // Stripe Checkout: signed-in users go to Stripe; guests sign in first.
  const checkout = useCreateCheckout();
  const [hasSession, setHasSession] = useState(false);
  const billing = useBillingStatus(hasSession);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  useEffect(() => setHasSession(Boolean(getToken())), []);
  async function subscribe(plan: string) {
    setCheckoutError(null);
    if (!getToken()) {
      router.push("/login");
      return;
    }
    try {
      const { url } = await checkout.mutateAsync(plan);
      window.location.href = url;
    } catch (e) {
      setCheckoutError(
        e instanceof ApiError
          ? e.message
          : "Couldn't start checkout. Please try again.",
      );
    }
  }

  return (
    // No overflow control on this wrapper. Any non-visible overflow here would
    // make it the containing block for the fixed navbar and background, so both
    // would scroll away with the page, and it would clip the pinned stage.
    // Horizontal overflow is handled once, on <html>, in globals.css.
    <div className="relative min-h-screen text-text">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1100px 560px at 72% -8%, rgba(91,141,239,0.06), transparent 60%)," +
            "#0a0d14",
        }}
      />

      <Navbar onLaunch={launch} />

      <main>
        <OrbitAct onLaunch={launch} onSchedule={openScheduler} />
        <Proof />
        <Pricing
          onStartFree={startFree}
          onSubscribe={subscribe}
          subscribing={checkout.isPending}
          error={checkoutError}
          currentPlan={hasSession ? billing.data?.plan ?? null : null}
          checkingPlan={hasSession && billing.isLoading}
        />
        <About />
        <Contact />
      </main>

      <Footer onLaunch={launch} />
    </div>
  );
}

/* --------------------------------------------------------------------------- */

function Navbar({ onLaunch }: { onLaunch: () => void }) {
  return (
    <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <nav
        className="flex h-[52px] w-full max-w-5xl items-center justify-between rounded-full border px-4"
        style={{
          background: "rgba(14,19,27,0.62)",
          borderColor: "rgba(148,163,184,0.14)",
          backdropFilter: "blur(16px) saturate(140%)",
          WebkitBackdropFilter: "blur(16px) saturate(140%)",
        }}
      >
        <button onClick={() => scrollTo("home")} className="flex items-center">
          <Logo size={26} font={15} />
        </button>

        <div className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => scrollTo(n.id)}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-text"
            >
              {n.label}
            </button>
          ))}
        </div>

        <button
          onClick={onLaunch}
          className="btn-primary rounded-full px-4 py-2 text-[13px]"
        >
          Launch demo
        </button>
      </nav>
    </header>
  );
}

/* --------------------------------------------------------------------------- */

/** The first thing after the act releases: four numbers the system can back. */
function Proof() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-8 pt-24">
      <div className="grid grid-cols-2 gap-x-6 gap-y-9 md:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.08} amount={0.6}>
            <CountUp
              value={s.value}
              delayMs={150 + i * 80}
              className="num block text-[30px] font-medium leading-none tracking-tight text-text"
            />
            <div className="mt-2.5 text-[12.5px] leading-snug text-muted">{s.label}</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------- */

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-14 max-w-2xl">
      <h2 className="text-[clamp(1.7rem,3.6vw,2.5rem)] font-semibold tracking-[-0.022em] text-text">
        {title}
      </h2>
      {sub && <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

function Pricing({
  onStartFree,
  onSubscribe,
  subscribing,
  error,
  currentPlan,
  checkingPlan,
}: {
  onStartFree: () => void;
  onSubscribe: (plan: string) => void;
  subscribing: boolean;
  error: string | null;
  currentPlan: string | null;
  checkingPlan: boolean;
}) {
  // Route each plan's CTA: Starter to free onboarding (no payment), Growth to
  // Stripe checkout, Enterprise to contact.
  const handler = (name: string) =>
    name === "Growth"
      ? () => onSubscribe("growth")
      : name === "Enterprise"
        ? () => scrollTo("contact")
        : onStartFree;
  const isCurrentPlan = (name: string) => {
    const plan = currentPlan?.toLowerCase();
    return Boolean(plan) && (plan === name.toLowerCase() || (plan === "free" && name === "Starter"));
  };

  return (
    <section id="pricing" className="mx-auto max-w-5xl scroll-mt-28 px-6 py-24">
      <SectionHeading
        title="Start free, scale when you're ready"
        sub="Transparent tiers that grow with the size and criticality of your supply chain."
      />
      {error && (
        <div
          className="mb-6 max-w-md rounded-control border px-4 py-2.5 text-[12.5px] font-medium"
          style={{ background: "rgba(224,87,91,0.1)", borderColor: "rgba(224,87,91,0.35)", color: "#e0575b" }}
        >
          {error}
        </div>
      )}
      {currentPlan && (
        <div className="mb-6 max-w-md rounded-control border border-accent/25 bg-accent/[0.06] px-4 py-2.5 text-[12.5px] text-muted">
          Current plan: <span className="font-semibold capitalize text-accent">{currentPlan}</span>
        </div>
      )}
      <div className="grid items-stretch gap-5 md:grid-cols-3">
        {PLANS.map((p, i) => {
          const current = isCurrentPlan(p.name);
          return (
            <Reveal key={p.name} delay={i * 0.09} amount={0.25} className="flex">
            <div
              className="relative flex w-full flex-col rounded-panel border p-7"
              style={{
                borderColor: p.highlight ? "rgba(91,141,239,0.35)" : "rgba(148,163,184,0.12)",
                background: p.highlight ? "rgba(91,141,239,0.05)" : "rgba(19,24,34,0.6)",
              }}
            >
              {p.highlight && (
                <span
                  className="absolute -top-2.5 left-7 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white"
                  style={{ background: "#5b8def" }}
                >
                  Most popular
                </span>
              )}
              {current && (
                <span className="absolute right-5 top-5 rounded-full border border-accent/30 bg-accent/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
                  Current
                </span>
              )}
              <div className="text-[14px] font-semibold text-text">{p.name}</div>
              <div className="mt-3 flex items-end gap-1.5">
                <span className="num text-[34px] font-medium leading-none tracking-tight text-text">
                  {p.price}
                </span>
                {p.cadence && <span className="text-[13px] text-muted">{p.cadence}</span>}
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{p.tagline}</p>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13.5px]">
                    <span aria-hidden className="mt-[2px] text-[11px] text-accent">
                      ✓
                    </span>
                    <span className="text-muted">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={handler(p.name)}
                disabled={current || checkingPlan || (p.name === "Growth" && subscribing)}
                className={`mt-7 py-3 disabled:cursor-not-allowed disabled:opacity-60 ${
                  p.highlight ? "btn-primary" : "btn-ghost"
                }`}
              >
                {current
                  ? "Current plan"
                  : p.name === "Growth" && subscribing
                    ? "Starting checkout…"
                    : p.cta}
              </button>
            </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------- */

/**
 * "Resilience, made computable": a statement block, then a pinned walk down one
 * lane of a supply chain.
 *
 * Same language as the orbit act. The lane holds still and scrolling steps you
 * from stage to stage, with that stage's copy exchanged beside it, so the
 * section demonstrates its own claim rather than asserting it.
 */
function About() {
  return (
    <>
      <section id="about" className="scroll-mt-28 px-6 pb-16 pt-28">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-[clamp(1.7rem,3.6vw,2.5rem)] font-semibold tracking-[-0.022em] text-text">
            Resilience, made computable.
          </h2>
          <p className="mt-6 text-[15.5px] leading-[1.8] text-muted">
            Supply chains break in ways spreadsheets cannot anticipate. Chainsilience AI was built
            to turn the constant noise of global events (earthquakes, port congestion, export
            controls, strikes) into a clear, ranked picture of what threatens <em>your</em> business
            and what to do about it.
          </p>
          <p className="mt-5 text-[15.5px] leading-[1.8] text-muted">
            We pair a live digital twin of your network with explainable AI scoring and Monte Carlo
            simulation, so every recommendation arrives with its reasoning attached rather than as a
            black box.
          </p>
          <div className="mt-9 flex flex-wrap gap-2.5">
            {[
              "Explainable by design",
              "Deterministic fallbacks",
              "Company-scoped and private",
            ].map((t) => (
              <span
                key={t}
                className="rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium text-muted"
                style={{
                  borderColor: "rgba(148,163,184,0.16)",
                  background: "rgba(148,163,184,0.05)",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <SupplyChainAct />
    </>
  );
}

/* --------------------------------------------------------------------------- */

function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  function send() {
    const subject = encodeURIComponent(`Chainsilience AI enquiry: ${form.name || "Website"}`);
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`,
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <section id="contact" className="mx-auto max-w-5xl scroll-mt-28 px-6 py-24">
      <div className="grid gap-12 md:grid-cols-2">
        <div>
          <h2 className="text-[clamp(1.7rem,3.6vw,2.5rem)] font-semibold tracking-[-0.022em] text-text">
            Let&apos;s map your risk together.
          </h2>
          <p className="mt-4 max-w-md text-[14.5px] leading-[1.75] text-muted">
            Book a 30-minute walkthrough and we&apos;ll build a sample digital twin for your chain,
            or send a message and we&apos;ll reply within one business day.
          </p>

          <button
            type="button"
            onClick={openScheduler}
            className="btn-primary mt-8 px-6 py-3.5"
          >
            Schedule a walkthrough
          </button>

          <div className="mt-6 text-[13.5px] text-muted">
            Prefer email?{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-accent">
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>

        {/* Composes a mailto, so there is no backend dependency on this form. */}
        <div
          className="rounded-panel border p-7"
          style={{ borderColor: "rgba(148,163,184,0.12)", background: "rgba(19,24,34,0.6)" }}
        >
          <div className="grid gap-4">
            <Field label="Name">
              <input
                className="panel-input"
                placeholder="Your full name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="Work email">
              <input
                type="email"
                className="panel-input"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            <Field label="Message">
              <textarea
                className="panel-input min-h-[110px] resize-y"
                placeholder="Tell us about your supply chain"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              />
            </Field>
            <button onClick={send} className="btn-primary py-3">
              Send message
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

/* --------------------------------------------------------------------------- */

function Footer({ onLaunch }: { onLaunch: () => void }) {
  return (
    <footer className="border-t" style={{ borderColor: "rgba(148,163,184,0.1)" }}>
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 px-6 py-10 md:flex-row">
        <Logo size={26} font={15} />
        <div className="flex flex-wrap items-center justify-center gap-5 text-[13px] text-muted">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => scrollTo(n.id)} className="hover:text-text">
              {n.label}
            </button>
          ))}
          <button onClick={onLaunch} className="font-medium text-accent">
            Launch demo
          </button>
        </div>
      </div>
      <div className="pb-8 text-center text-[12px] text-muted/70">
        © {new Date().getFullYear()} Chainsilience AI. All rights reserved.
      </div>
    </footer>
  );
}
