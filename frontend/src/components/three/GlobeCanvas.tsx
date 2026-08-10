"use client";

import { Canvas } from "@react-three/fiber";

import { Globe, type GlobePoint } from "./Globe";

interface Props {
  points: GlobePoint[];
  backdrop?: boolean;
  reducedMotion?: boolean;
  /** "always" while on-screen; "never" pauses the render loop (offscreen/hidden). */
  frameloop?: "always" | "demand" | "never";
}

/**
 * The WebGL <Canvas>. Kept in its own module so it can be lazily code-split
 * (dynamic import, ssr:false) — Three.js must never run during SSR.
 */
export default function GlobeCanvas({
  points,
  backdrop = false,
  reducedMotion = false,
  frameloop = "always",
}: Props) {
  return (
    <Canvas
      frameloop={frameloop}
      // Cap devicePixelRatio hard: on HiDPI/Retina laptops an uncapped ratio
      // (1.8+) renders 3-4x the pixels of a 1080p desktop and crushes fill rate
      // on integrated GPUs. 1.25 stays crisp for a small decorative globe.
      dpr={[1, backdrop ? 1 : 1.25]}
      // Adaptive regression: R3F drops resolution automatically under load.
      performance={{ min: 0.5 }}
      camera={{ position: [0, 0.15, 3.95], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      // offsetSize measures synchronously — avoids the initial 300x150 canvas
      // when mounted via dynamic import before the ResizeObserver fires.
      resize={{ offsetSize: true }}
      style={{ background: "transparent", width: "100%", height: "100%" }}
      onCreated={(state) => {
        // Force a correct measurement the moment the renderer exists — the
        // dynamic import can mount the canvas after any initial resize nudge.
        const el = state.gl.domElement.parentElement;
        if (el) state.setSize(el.clientWidth, el.clientHeight);
      }}
    >
      <Globe points={points} backdrop={backdrop} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
