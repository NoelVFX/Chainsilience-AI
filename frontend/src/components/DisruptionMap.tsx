"use client";

import { GlobeMount } from "@/components/three/GlobeMount";

/**
 * Global Disruption Map. Renders an interactive 3D globe (React Three Fiber)
 * with a glowing, pulsing marker per disruption at its real lat/lon. Degrades
 * to a lightweight 2D SVG projection when WebGL is unavailable.
 */
interface Point {
  country: string;
  lat: number;
  lon: number;
  severity: string;
  score: number;
}

const SEV_COLOR: Record<string, string> = {
  critical: "#f87171",
  high: "#fbbf24",
  medium: "#3b82f6",
  low: "#34d399",
};

export function DisruptionMap({ points }: { points: Point[] }) {
  return (
    <div
      className="relative overflow-hidden rounded-[10px] border border-line"
      style={{ height: 220, background: "radial-gradient(circle at 50% 40%, #0d2036 0%, #081018 70%)" }}
    >
      <GlobeMount points={points} fallback={<SvgMap points={points} />} />

      {/* drag hint + legend overlay */}
      <div className="pointer-events-none absolute left-2 top-2 text-[9px] text-muted/70">
        drag to rotate
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 flex gap-2 text-[9px] text-muted">
        {["critical", "high", "medium", "low"].map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: SEV_COLOR[s] }} />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 2D equirectangular fallback (no WebGL). */
function SvgMap({ points }: { points: Point[] }) {
  const W = 100;
  const H = 55;
  const project = (lat: number, lon: number) => ({
    x: ((lon + 180) / 360) * W,
    y: ((90 - lat) / 180) * H,
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
      {Array.from({ length: 9 }).map((_, i) => (
        <line key={`v${i}`} x1={(i + 1) * 10} y1={0} x2={(i + 1) * 10} y2={H} stroke="rgba(148,163,184,0.10)" strokeWidth={0.15} />
      ))}
      {Array.from({ length: 5 }).map((_, i) => (
        <line key={`h${i}`} x1={0} y1={(i + 1) * (H / 6)} x2={W} y2={(i + 1) * (H / 6)} stroke="rgba(148,163,184,0.10)" strokeWidth={0.15} />
      ))}
      {points.map((p, i) => {
        const { x, y } = project(p.lat, p.lon);
        const color = SEV_COLOR[p.severity] ?? "#22d3ee";
        const r = 0.9 + (p.score / 100) * 1.6;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={r * 2.4} fill={color} opacity={0.18} />
            <circle cx={x} cy={y} r={r} fill={color} />
          </g>
        );
      })}
    </svg>
  );
}
