"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { GlobeMount } from "@/components/three/GlobeMount";
import { Logo } from "@/components/Logo";
import { FadeUp } from "@/components/motion";
import { ApiError, getToken } from "@/lib/api";
import { useBillingStatus, useCreateCheckout } from "@/lib/hooks";

/**
 * Marketing landing page (route "/"). A 3D globe hero over the dark brand
 * gradient, glassmorphism nav + cards, and sections for features, pricing,
 * about, and contact. "Launch Demo" smart-routes into the app.
 *
 * "Schedule a meeting" opens the Calendly popup when CALENDLY_URL is set;
 * otherwise it falls back to a pre-filled email.
 */
const CONTACT_EMAIL = "chainsilienceai@gmail.com";
// Your Calendly scheduling link. Leave empty to fall back to the email scheduler.
const CALENDLY_URL = "https://calendly.com/chainsilienceai/30min";
const MEETING_URL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "Meeting request — Chainsilience AI",
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
  { label: "Features", id: "features" },
  { label: "Pricing", id: "pricing" },
  { label: "About", id: "about" },
  { label: "Contact", id: "contact" },
];

const GRADIENT = "#5b8def";

const FEATURES = [
  {
    icon: "◎",
    title: "AI Risk Scoring",
    body: "NVIDIA Nemotron rates every disruption into an explainable composite score — with a transparent breakdown of the factors that drove it.",
  },
  {
    icon: "◈",
    title: "Live Digital Twin",
    body: "Model your suppliers, components, factories and routes as a graph, then watch a single event cascade to revenue in real time.",
  },
  {
    icon: "⤳",
    title: "Monte Carlo Simulation",
    body: "Production-stoppage probability estimated across thousands of seeded scenarios, differentiated by event type and severity.",
  },
  {
    icon: "⚇",
    title: "Two-Agent News Intelligence",
    body: "A verifier agent filters unreliable signals; a relevance agent keeps only what actually touches your supply-chain paths.",
  },
  {
    icon: "⚖",
    title: "Mitigation Scoring",
    body: "Strategies ranked by a multi-objective utility of service, net financial impact, risk reduction and implementation cost.",
  },
  {
    icon: "✓",
    title: "Action Center",
    body: "Approve a mitigation and track it through to completion — the linked risk's score, revenue and impact update as work lands.",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "$0",
    cadence: "/ forever",
    tagline: "For a single team getting started.",
    features: [
      "1 company Digital Twin",
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
      "Multiple Digital Twins",
      "Real-time news ingestion",
      "Monte Carlo simulation",
      "Multi-objective mitigation scoring",
      "Email alerts & Action Center",
      "Priority support",
    ],
    cta: "Start Growth",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    tagline: "For organisations with scale & compliance needs.",
    features: [
      "SSO & role-based access",
      "Dedicated Nemotron throughput",
      "Custom data integrations",
      "SLA & dedicated support",
      "On-prem / VPC deployment",
    ],
    cta: "Talk to us",
    highlight: false,
  },
];

const STATS = [
  { value: "16+", label: "Global intelligence sources" },
  { value: "1,000s", label: "Simulations per risk" },
  { value: "100%", label: "Explainable AI scoring" },
  { value: "24/7", label: "Continuous monitoring" },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function LandingPage() {
  const router = useRouter();
  const launch = () => router.push(getToken() ? "/dashboard" : "/login");
  // Free plan: a signed-in user goes straight in; a guest starts onboarding
  // (create a free account) — no payment involved.
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
    <div className="relative min-h-screen overflow-x-hidden text-text">
      {/* soft brand glows */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1100px 560px at 72% -8%, rgba(91,141,239,0.06), transparent 60%)," +
            "#0b0e15",
        }}
      />

      <Navbar onLaunch={launch} />

      <main>
        <Hero onLaunch={launch} />
        <Features />
        <HowItWorks />
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
        className="flex w-full max-w-5xl items-center justify-between rounded-full border px-4 py-2.5"
        style={{
          background: "rgba(17,24,39,0.55)",
          borderColor: "rgba(148,163,184,0.14)",
          backdropFilter: "blur(16px) saturate(140%)",
          WebkitBackdropFilter: "blur(16px) saturate(140%)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.45)",
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
          className="rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5"
          style={{ background: GRADIENT, boxShadow: "0 6px 16px rgba(0,0,0,0.32)" }}
        >
          Launch Demo
        </button>
      </nav>
    </header>
  );
}

/* --------------------------------------------------------------------------- */

function Hero({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section
      id="home"
      className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 text-center"
    >
      {/* 3D globe centerpiece (decorative backdrop mode: auto-spins, translucent) */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2"
        style={{ width: "min(760px, 92vw)", height: "min(760px, 92vw)", opacity: 0.55 }}
      >
        <GlobeMount points={[]} backdrop fallback={null} />
      </div>

      <FadeUp>
        <span
          className="mb-6 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold text-cyan"
          style={{ borderColor: "rgba(91, 141, 239,0.3)", background: "rgba(91, 141, 239,0.06)" }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-cyan" style={{ boxShadow: "0 0 8px #5b8def" }} />
          Powered by NVIDIA Nemotron
        </span>
      </FadeUp>

      <FadeUp delay={0.05}>
        <h1
          className="mx-auto max-w-3xl text-[clamp(2.6rem,7vw,5rem)] font-extrabold leading-[1.02] tracking-tight text-text"
          style={{ letterSpacing: "-0.03em" }}
        >
          See supply-chain risk before it reaches your revenue.
        </h1>
      </FadeUp>

      <FadeUp delay={0.1}>
        <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-muted md:text-[17px]">
          Chainsilience AI turns global disruption signals into scored, explainable risks on a live
          digital twin of your supply chain — then ranks the mitigations that protect service,
          revenue and time.
        </p>
      </FadeUp>

      <FadeUp delay={0.15}>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={onLaunch}
            className="rounded-full px-7 py-3.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
            style={{ background: GRADIENT, boxShadow: "0 8px 20px rgba(0,0,0,0.36)" }}
          >
            Launch Demo →
          </button>
          <button
            type="button"
            onClick={openScheduler}
            className="rounded-full border px-7 py-3.5 text-sm font-semibold text-text transition-colors"
            style={{ borderColor: "rgba(148,163,184,0.25)", background: "rgba(148,163,184,0.06)" }}
          >
            Schedule a meeting
          </button>
        </div>
      </FadeUp>

      {/* stat strip */}
      <div className="mt-16 grid w-full max-w-3xl grid-cols-2 gap-4 md:grid-cols-4">
        {STATS.map((s, i) => (
          <div
            key={s.label}
            className="tilt-card reveal rounded-panel border px-4 py-4 text-center"
            style={{
              borderColor: "rgba(148,163,184,0.12)",
              background: "rgba(20,25,34,0.55)",
              animationDelay: `${i * 0.06}s`,
            }}
          >
            <div className="num text-2xl font-semibold text-text">{s.value}</div>
            <div className="mt-1 text-[11.5px] text-muted">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------- */

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-cyan">{eyebrow}</div>
      <h2 className="text-[clamp(1.8rem,4vw,2.6rem)] font-extrabold tracking-tight text-text">{title}</h2>
      {sub && <p className="mx-auto mt-3 max-w-xl text-[14.5px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
      <SectionHeading
        eyebrow="Features"
        title="An intelligence layer for your supply chain"
        sub="Every module works together — from raw global signals to the specific action that reduces your risk."
      />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="tilt-card reveal h-full rounded-panel border p-6"
            style={{ borderColor: "rgba(148,163,184,0.14)", background: "rgba(17,24,39,0.5)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", animationDelay: `${i * 0.06}s` }}
          >
            <div
              className="mb-4 flex h-11 w-11 items-center justify-center rounded-card text-xl font-bold text-white"
              style={{ background: GRADIENT }}
            >
              {f.icon}
            </div>
            <h3 className="mb-2 text-[16px] font-bold text-text">{f.title}</h3>
            <p className="text-[13.5px] leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------- */

function HowItWorks() {
  const steps = [
    { n: "01", t: "Model your twin", d: "Onboard your suppliers, components, factories and routes — or upload a CSV — to build a live graph of your chain." },
    { n: "02", t: "Ingest & score", d: "We continuously scan global sources, verify and match signals to your paths, and score the resulting risks." },
    { n: "03", t: "Simulate & act", d: "Run Monte Carlo stoppage estimates, rank mitigations by objective, then approve and track them in the Action Center." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <SectionHeading eyebrow="How it works" title="From signal to action in three steps" />
      <div className="grid gap-5 md:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={s.n}
            className="tilt-card reveal rounded-panel border p-6"
            style={{ borderColor: "rgba(148,163,184,0.14)", background: "rgba(13,20,32,0.5)", animationDelay: `${i * 0.06}s` }}
          >
            <div className="mb-3 text-3xl font-extrabold" style={{ color: "rgba(91, 141, 239,0.35)" }}>{s.n}</div>
            <h3 className="mb-2 text-[16px] font-bold text-text">{s.t}</h3>
            <p className="text-[13.5px] leading-relaxed text-muted">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------- */

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
  // Route each plan's CTA: Starter → free onboarding (no payment), Growth →
  // Stripe checkout, Enterprise → contact.
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
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
      <SectionHeading
        eyebrow="Pricing"
        title="Start free, scale when you're ready"
        sub="Transparent tiers that grow with the size and criticality of your supply chain."
      />
      {error && (
        <div
          className="mx-auto mb-6 max-w-md rounded-control border px-4 py-2.5 text-center text-[12.5px] font-semibold"
          style={{ background: "rgba(248,113,113,0.1)", borderColor: "rgba(248,113,113,0.35)", color: "#f87171" }}
        >
          {error}
        </div>
      )}
      {currentPlan && (
        <div className="mx-auto mb-6 max-w-md rounded-control border border-cyan/30 bg-cyan/[0.06] px-4 py-2.5 text-center text-[12.5px] text-muted">
          Current plan: <span className="font-bold capitalize text-cyan">{currentPlan}</span>
        </div>
      )}
      <div className="grid items-stretch gap-5 md:grid-cols-3">
        {PLANS.map((p) => {
          const current = isCurrentPlan(p.name);
          return (
            <div
            key={p.name}
            className="relative flex flex-col rounded-panel border p-7"
            style={{
              borderColor: p.highlight ? "rgba(91, 141, 239,0.4)" : "rgba(148,163,184,0.14)",
              background: p.highlight ? "rgba(91, 141, 239,0.06)" : "rgba(17,24,39,0.5)",
              boxShadow: p.highlight ? "0 20px 60px rgba(91, 141, 239,0.12)" : "none",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            {p.highlight && (
              <span
                className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-bold text-white"
                style={{ background: GRADIENT }}
              >
                Most popular
              </span>
            )}
            {current && (
              <span className="absolute right-4 top-4 rounded-full border border-cyan/30 bg-cyan/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan">
                Current plan
              </span>
            )}
            <div className="text-[15px] font-bold text-text">{p.name}</div>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-4xl font-extrabold text-text">{p.price}</span>
              {p.cadence && <span className="mb-1 text-[13px] text-muted">{p.cadence}</span>}
            </div>
            <p className="mt-2 text-[13px] text-muted">{p.tagline}</p>
            <ul className="mt-5 flex flex-1 flex-col gap-2.5">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13.5px] text-text">
                  <span className="mt-0.5 text-cyan">✓</span>
                  <span className="text-muted">{f}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={handler(p.name)}
              disabled={current || checkingPlan || (p.name === "Growth" && subscribing)}
              className="mt-7 rounded-control py-3 text-sm font-bold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
              style={
                p.highlight
                  ? { background: GRADIENT, color: "#fff", boxShadow: "0 6px 16px rgba(0,0,0,0.32)" }
                  : { background: "rgba(148,163,184,0.08)", color: "#e7ecf5", border: "1px solid rgba(148,163,184,0.25)" }
              }
            >
              {current ? "Current plan" : p.name === "Growth" && subscribing ? "Starting checkout…" : p.cta}
            </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------- */

function About() {
  return (
    <section id="about" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-cyan">About</div>
          <h2 className="text-[clamp(1.8rem,4vw,2.6rem)] font-extrabold tracking-tight text-text">
            Resilience, made computable.
          </h2>
          <p className="mt-5 text-[14.5px] leading-relaxed text-muted">
            Supply chains break in ways spreadsheets can&apos;t anticipate. Chainsilience AI was built
            to turn the constant noise of global events — earthquakes, port congestion, export
            controls, strikes — into a clear, ranked picture of what threatens <em>your</em> business,
            and what to do about it.
          </p>
          <p className="mt-4 text-[14.5px] leading-relaxed text-muted">
            We pair a live digital twin of your network with explainable AI scoring and Monte Carlo
            simulation, so every recommendation comes with its reasoning — not a black box.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {["Explainable by design", "Deterministic fallbacks", "Company-scoped & private"].map((t) => (
              <span
                key={t}
                className="rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold text-text"
                style={{ borderColor: "rgba(148,163,184,0.2)", background: "rgba(148,163,184,0.06)" }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <div
          className="relative aspect-square w-full overflow-hidden rounded-panel border"
          style={{ borderColor: "rgba(148,163,184,0.14)", background: "rgba(13,20,32,0.4)" }}
        >
          <GlobeMount points={[]} backdrop fallback={null} />
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------- */

function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  function send() {
    const subject = encodeURIComponent(`Chainsilience AI enquiry — ${form.name || "Website"}`);
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`,
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <section id="contact" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
      <div className="grid gap-10 md:grid-cols-2">
        {/* left: talk to us */}
        <div>
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-cyan">Contact</div>
          <h2 className="text-[clamp(1.8rem,4vw,2.6rem)] font-extrabold tracking-tight text-text">
            Let&apos;s map your risk together.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-muted">
            Book a 30-minute walkthrough and we&apos;ll build a sample digital twin for your chain —
            or drop us a message and we&apos;ll get back within one business day.
          </p>

          <button
            type="button"
            onClick={openScheduler}
            className="mt-7 inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
            style={{ background: GRADIENT, boxShadow: "0 6px 16px rgba(0,0,0,0.32)" }}
          >
            📅 Schedule a meeting
          </button>

          <div className="mt-6 text-[13.5px] text-muted">
            Prefer email?{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-cyan">
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>

        {/* right: quick message form (composes a mailto — no backend needed) */}
        <div
          className="rounded-panel border p-7"
          style={{ borderColor: "rgba(148,163,184,0.14)", background: "rgba(17,24,39,0.5)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
        >
          <div className="grid gap-4">
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted">Name</div>
              <input
                className="panel-input"
                placeholder="Jane Doe"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted">Work email</div>
              <input
                type="email"
                className="panel-input"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted">Message</div>
              <textarea
                className="panel-input min-h-[110px] resize-y"
                placeholder="Tell us about your supply chain…"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              />
            </div>
            <button onClick={send} className="btn-primary py-3">
              Send message
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------- */

function Footer({ onLaunch }: { onLaunch: () => void }) {
  return (
    <footer className="border-t" style={{ borderColor: "rgba(148,163,184,0.12)" }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 md:flex-row">
        <Logo size={26} font={15} />
        <div className="flex flex-wrap items-center justify-center gap-5 text-[13px] text-muted">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => scrollTo(n.id)} className="hover:text-text">
              {n.label}
            </button>
          ))}
          <button onClick={onLaunch} className="font-semibold text-cyan">
            Launch Demo
          </button>
        </div>
      </div>
      <div className="pb-8 text-center text-[12px] text-muted/70">
        © {new Date().getFullYear()} Chainsilience AI. All rights reserved.
      </div>
    </footer>
  );
}
