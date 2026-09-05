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
   * "radial" replaces the headline-above / body-below layout with six capability
   * cards fanned around the globe, each joined to it by an arrow.
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
    headline: "Six parts of one pipeline.",
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

export interface Capability {
  k: string;
  title: string;
  blurb: string;
  /** Where the card sits, and where its arrow lands, on the 1440x860 stage. */
  card: [number, number];
  tip: [number, number];
}

/**
 * The six capabilities, fanned around the globe. Coordinates are authored on a
 * fixed 1440x860 stage that is uniformly scaled to fit, so the cards and their
 * arrows stay in register at every viewport size.
 */
export const CAPABILITIES: Capability[] = [
  {
    k: "01",
    title: "Explainable risk scoring",
    blurb: "Every score carries its factor breakdown, traceable back to the evidence.",
    card: [343, 170],
    tip: [502, 258],
  },
  {
    k: "02",
    title: "Live digital twin",
    blurb: "Suppliers, components, factories and routes as a graph you can traverse.",
    card: [258, 430],
    tip: [416, 430],
  },
  {
    k: "03",
    title: "Two-agent news intelligence",
    blurb: "A verifier drops unreliable signals; a relevance agent keeps what touches you.",
    card: [343, 690],
    tip: [502, 602],
  },
  {
    k: "04",
    title: "Monte Carlo simulation",
    blurb: "10,000 seeded scenarios per risk, for a real stoppage probability.",
    card: [1097, 170],
    tip: [938, 258],
  },
  {
    k: "05",
    title: "Multi-objective mitigation",
    blurb: "Ranked on service, cost, recovery time and net financial impact.",
    card: [1182, 430],
    tip: [1024, 430],
  },
  {
    k: "06",
    title: "Action Center",
    blurb: "Approve a mitigation and watch the linked risk's score and exposure move.",
    card: [1097, 690],
    tip: [938, 602],
  },
];
