"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode, useEffect, useRef, useState } from "react";

import type { GlobePoint } from "./Globe";

// Client-only, code-split: Three.js never touches the server renderer.
const GlobeCanvas = dynamic(() => import("./GlobeCanvas"), {
  ssr: false,
  loading: () => null,
});

/** Falls back to `fallback` if WebGL throws at runtime (low-end/no-GPU). */
class WebGLBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface Props {
  points: GlobePoint[];
  backdrop?: boolean;
  fallback?: ReactNode;
  className?: string;
}

/**
 * Single entry point for the 3D globe. Handles: client-only mount, WebGL
 * capability + error fallback, and the user's reduced-motion preference.
 */
export function GlobeMount({ points, backdrop = false, fallback = null, className }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [supported, setSupported] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      setSupported(!!gl);
    } catch {
      setSupported(false);
    }
    setReducedMotion(
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    );
  }, []);

  // The <Canvas> is code-split (dynamic import) and mounts after this component,
  // possibly after a slow first chunk load. R3F sometimes measures its container
  // as 0 on mount and leaves the canvas at its 300x150 default. Watch (scoped to
  // this instance) until the canvas appears, and while it is smaller than its
  // container dispatch a resize so R3F (react-use-measure) re-measures.
  useEffect(() => {
    if (!mounted || !supported) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const host = hostRef.current;
      const canvas = host?.querySelector("canvas") as HTMLCanvasElement | null;
      const parent = canvas?.parentElement;
      if (canvas && parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
        // Check BOTH dimensions — the canvas can match width but keep its default
        // 150px height, which would leave the globe clipped and half the card
        // non-interactive.
        if (
          canvas.clientWidth !== parent.clientWidth ||
          canvas.clientHeight !== parent.clientHeight
        ) {
          window.dispatchEvent(new Event("resize"));
        } else {
          window.clearInterval(id); // correctly sized — done
          return;
        }
      }
      if (Date.now() - started > 10_000) window.clearInterval(id); // give up after 10s
    }, 150);
    return () => window.clearInterval(id);
  }, [mounted, supported]);

  if (!mounted) return <>{fallback}</>;
  if (!supported) return <>{fallback}</>;

  return (
    <div ref={hostRef} className={className} style={{ width: "100%", height: "100%" }}>
      <WebGLBoundary fallback={fallback}>
        <GlobeCanvas points={points} backdrop={backdrop} reducedMotion={reducedMotion} />
      </WebGLBoundary>
    </div>
  );
}
