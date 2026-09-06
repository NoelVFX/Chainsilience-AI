/**
 * The Orbit act — the landing page's pinned scroll sequence.
 *
 * The blue-marble globe stays fixed at the centre of the viewport for the whole
 * act. Scrolling does not move it; it turns it. Each chapter declares the region
 * the globe rotates to and the markers that light up there, so the earth is
 * telling the same story the copy is.
 */

export interface OrbitMarker {
  lat: number;
  lon: number;
  /** Drives the marker colour: accent for twin nodes, severity for disruptions. */
  tone: "node" | "low" | "medium" | "high";
  /** Height of the radial spike, 0-1 (scaled in the scene). */
  weight?: number;
}

export interface OrbitArc {
  from: [number, number];
  to: [number, number];
  /** A muted arc reads as a route that has been cut or de-prioritised. */
  muted?: boolean;
}

export interface OrbitChapter {
  /** Short label for the progress rail. Not printed above the headline. */
  rail: string;
  headline: string;
  body: string;
  /** Small factual chip under the body. Omitted on the hero. */
  proof?: string;
  /** Where the globe turns to. lon is the meridian that faces the camera. */
  view: { lat: number; lon: number };
  markers: OrbitMarker[];
  arcs: OrbitArc[];
  /** A sweeping scan ring, used once, where the copy is about detection. */
  scan?: boolean;
  /**
   * "radial" replaces the headline-above / body-below layout with the six
   * pipeline steps ringed around the globe, each arrowed to the one after it.
   */
  layout?: "split" | "radial";
}

// Real coordinates for the places these chapters talk about, so the globe is
// pointing at somewhere true rather than somewhere convenient.
const TAIWAN: [number, number] = [23.7, 120.9];
const SHENZHEN: [number, number] = [22.5, 114.1];
const SINGAPORE: [number, number] = [1.35, 103.8];
const BUSAN: [number, number] = [35.1, 129.0];
const ROTTERDAM: [number, number] = [51.9, 4.5];
const SUEZ: [number, number] = [30.0, 32.6];
const HAMBURG: [number, number] = [53.5, 10.0];
const LA: [number, number] = [33.7, -118.3];
const AUSTIN: [number, number] = [30.3, -97.7];
const MONTERREY: [number, number] = [25.7, -100.3];

export const CHAPTERS: OrbitChapter[] = [
  {
    rail: "Signal",
    headline: "See supply-chain risk before it reaches your revenue.",
    body: "Chainsilience turns global disruption signals into scored, explainable risks on a live model of your chain.",
    view: { lat: 8, lon: 150 },
    markers: [],
    arcs: [],
  },
  {
    rail: "Twin",
    headline: "Your chain, as a graph that stays current.",
    body: "Suppliers, components, factories, ports and routes become nodes you can traverse, not rows you maintain.",
    proof: "Neo4j dependency paths",
    view: { lat: 20, lon: 112 },
    markers: [
      { lat: TAIWAN[0], lon: TAIWAN[1], tone: "node", weight: 0.9 },
      { lat: SHENZHEN[0], lon: SHENZHEN[1], tone: "node", weight: 0.7 },
      { lat: SINGAPORE[0], lon: SINGAPORE[1], tone: "node", weight: 0.6 },
      { lat: BUSAN[0], lon: BUSAN[1], tone: "node", weight: 0.5 },
    ],
    arcs: [
      { from: TAIWAN, to: SINGAPORE },
      { from: SHENZHEN, to: BUSAN },
    ],
  },
  {
    rail: "Detect",
    headline: "Two agents read the news so you don't have to.",
    body: "A verifier drops unreliable signals. A relevance agent keeps only what actually touches your paths and your geographies.",
    proof: "Scanning continuously, 24/7",
    view: { lat: 34, lon: 24 },
    scan: true,
    markers: [
      { lat: SUEZ[0], lon: SUEZ[1], tone: "high", weight: 1 },
      { lat: ROTTERDAM[0], lon: ROTTERDAM[1], tone: "node", weight: 0.5 },
      { lat: HAMBURG[0], lon: HAMBURG[1], tone: "node", weight: 0.4 },
    ],
    arcs: [{ from: SUEZ, to: ROTTERDAM }],
  },
  {
    rail: "Score",
    headline: "Every score shows the work behind it.",
    body: "Severity, exposure and coverage are broken out factor by factor, then stress-tested across thousands of seeded scenarios.",
    proof: "Monte Carlo stoppage probability",
    view: { lat: 26, lon: -34 },
    markers: [
      { lat: SUEZ[0], lon: SUEZ[1], tone: "high", weight: 1 },
      { lat: ROTTERDAM[0], lon: ROTTERDAM[1], tone: "medium", weight: 0.7 },
      { lat: LA[0], lon: LA[1], tone: "low", weight: 0.5 },
    ],
    arcs: [{ from: SUEZ, to: ROTTERDAM, muted: true }],
  },
  {
    rail: "Act",
    headline: "Reroute before the line stops.",
    body: "Mitigations are ranked on service, cost, recovery time and net financial impact, then tracked to completion in the Action Center.",
    proof: "Multi-objective mitigation scoring",
    view: { lat: 26, lon: -102 },
    markers: [
      { lat: LA[0], lon: LA[1], tone: "medium", weight: 0.8 },
      { lat: MONTERREY[0], lon: MONTERREY[1], tone: "node", weight: 0.7 },
      { lat: AUSTIN[0], lon: AUSTIN[1], tone: "low", weight: 0.6 },
    ],
    arcs: [
      { from: LA, to: AUSTIN, muted: true },
      { from: MONTERREY, to: AUSTIN },
    ],
  },
  {
    // Closes the act. The globe has swept roughly 320 degrees westward by now,
    // so this lands back over the Pacific where the hero opened.
    rail: "Stack",
    headline: "The 6-step workflow",
    body: "",
    view: { lat: 12, lon: -170 },
    markers: [],
    arcs: [],
    layout: "radial",
  },
];

/**
 * Where the globe should magnify to. `ux`/`uy` is a unit vector from the globe's
 * centre toward the thing being focused, in screen space (y down).
 */
export interface OrbitFocus {
  ux: number;
  uy: number;
  zoom: number;
}

/**
 * Where the camera's anchor sits when a card is opened, as a fraction of the
 * globe's radius along the card's direction. Shared, because the cards ride the
 * same camera as the earth and both have to scale about the same point.
 */
export const FOCUS_ANCHOR = 0.72;

/**
 * How much of the globe's box the sphere actually fills on screen, for the
 * act's camera (fov 42, distance 3.6):
 *
 *   2 / (2 * tan(21deg) * 3.6) = 0.7236
 *
 * The box is min(32svh, 62vw); the sphere renders at this fraction of it. Needed
 * outside the scene so the card layer can find the same anchor in CSS pixels.
 */
export const SPHERE_FILL = 0.7236;

/** One thing the platform actually does at a given step, named plainly. */
export interface StepFeature {
  label: string;
  detail: string;
}

export interface Step {
  k: string;
  /** Card face. Short enough to hold one line at the card's width. */
  title: string;
  /** Card face, under the title. One clause. */
  blurb: string;
  /** Panel: what happens at this step, in prose. */
  detail: string;
  /** Panel: the features this step is built from. */
  features: StepFeature[];
}

/**
 * The pipeline, as a closed loop.
 *
 * These are steps rather than a feature list, so the order carries information:
 * each one consumes what the previous one produced, and the sixth feeds the
 * first. That is why they ring the globe with an arrow between them instead of
 * fanning out of it — a cycle is the true shape of this system, and a radial
 * burst was drawing a relationship that does not exist.
 */
export const STEPS: Step[] = [
  {
    k: "01",
    title: "Ingest the signal",
    blurb: "Read the world's news, continuously.",
    detail:
      "Around twenty public feeds — world and business desks alongside shipping and logistics trade press — are fetched concurrently and de-duplicated against everything already held.",
    features: [
      { label: "21 RSS sources", detail: "General, business, maritime and freight" },
      { label: "30-second poll", detail: "A background loop, fetched concurrently" },
      { label: "7-day window", detail: "Anything staler is dropped on ingest" },
      { label: "Offline sample", detail: "Used when the network is unreachable" },
    ],
  },
  {
    k: "02",
    title: "Verify and filter",
    blurb: "Two agents decide what is worth your attention.",
    detail:
      "A verifier drops signals it cannot stand up. A relevance agent keeps only what touches your paths and your geographies, then extracts the disruption into a structured event.",
    features: [
      { label: "Verifier agent", detail: "Scores confidence, discards the unreliable" },
      { label: "Relevance agent", detail: "Matched against your own supply paths" },
      { label: "Event extraction", detail: "Type, location, duration, severity" },
    ],
  },
  {
    k: "03",
    title: "Map to your chain",
    blurb: "Land the event on your digital twin.",
    detail:
      "Suppliers, components, factories, ports and routes are nodes you traverse rather than rows you maintain. The event lands on the ones it actually reaches.",
    features: [
      { label: "8 node types", detail: "Supplier, factory, port, route, product…" },
      { label: "Dependency paths", detail: "Cypher traversal over a Neo4j subgraph" },
      { label: "Company-scoped", detail: "One graph per tenant, never shared" },
    ],
  },
  {
    k: "04",
    title: "Score with reasons",
    blurb: "Show the work behind every number.",
    detail:
      "Severity, exposure and coverage are broken out factor by factor, with reasoning that cites the article it came from — and a score that still resolves when the models are down.",
    features: [
      { label: "Factor breakdown", detail: "Each contribution scored 0–100" },
      { label: "Three-tier scoring", detail: "Nemotron, then OpenAI, then deterministic" },
      { label: "Revenue at risk", detail: "The score carried through to money" },
    ],
  },
  {
    k: "05",
    title: "Simulate the impact",
    blurb: "Turn a score into an operational forecast.",
    detail:
      "Thousands of seeded scenarios per risk give a stoppage probability rather than an adjective, and trace the cascade from the trigger through to revenue.",
    features: [
      { label: "Monte Carlo", detail: "10,000 seeded runs for each risk" },
      { label: "Stoppage probability", detail: "Days of cover before the line stops" },
      { label: "Cascade chain", detail: "Trigger → component → product → revenue" },
    ],
  },
  {
    k: "06",
    title: "Act and close the loop",
    blurb: "Reroute, notify, then feed the result back.",
    detail:
      "Mitigations are ranked on service, cost, recovery time and net financial impact. Approve one and the linked risk's score moves; your rating of it returns to the top of the pipeline.",
    features: [
      { label: "Multi-objective ranking", detail: "Four competing objectives, scored together" },
      { label: "Drafted comms", detail: "Supplier, customer, executive, procurement" },
      { label: "Feedback loop", detail: "Your 1–5 rating trains what surfaces next" },
    ],
  },
];
