"use client";

/**
 * Spinning-earth loading animation (blue ocean + green landmasses drifting
 * across the surface). Size is driven by font-size: the earth is 7.5em wide,
 * so we set font-size = px / 7.5 to hit an exact pixel diameter.
 *
 * Used as the app's "logo" loading indicator (sign-in, data fetches).
 */
const CONTINENTS = [
  "M22,46 C18,30 40,22 55,28 C74,35 82,50 72,64 C62,80 34,80 26,66 C20,58 24,52 22,46 Z",
  "M35,30 C50,22 66,30 68,46 C70,60 58,70 44,66 C30,62 26,44 35,30 Z",
  "M28,58 C24,44 44,40 58,44 C76,50 74,68 58,72 C42,76 32,70 28,58 Z",
  "M40,34 C56,26 74,38 70,54 C66,72 44,74 34,62 C26,52 30,40 40,34 Z",
];

export function EarthLoader({ px = 120, label }: { px?: number; label?: string }) {
  return (
    <div className="earth-wrap">
      <div className="earth-loader" style={{ fontSize: px / 7.5 }} role="status" aria-label="Loading">
        {CONTINENTS.map((d, i) => (
          <svg key={i} viewBox="0 0 100 100" aria-hidden>
            <path d={d} />
          </svg>
        ))}
      </div>
      {label && <p className="earth-label">{label}</p>}
    </div>
  );
}
