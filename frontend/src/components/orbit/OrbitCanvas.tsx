"use client";

import { Canvas, useThree } from "@react-three/fiber";
import type { MotionValue } from "framer-motion";
import { useEffect } from "react";

import type { OrbitFocus } from "./chapters";
import { OrbitGlobe } from "./OrbitGlobe";

interface Props {
  progress: MotionValue<number>;
  chapter: number;
  focus?: OrbitFocus | null;
  camZoom?: MotionValue<number>;
  camBearing?: MotionValue<number>;
  autoScale?: boolean;
  reducedMotion?: boolean;
}

/**
 * Keeps the renderer exactly the size of its host element.
 *
 * The canvas is code-split, so it can mount after its container has already been
 * measured and stay at the HTML default of 300x150. The container is also sized
 * in viewport units, so it changes size whenever the window does. Observing the
 * host and calling setSize directly handles both, and is honest about it:
 * dispatching a synthetic window "resize" (the older workaround here) does not
 * reach react-three-fiber, which measures its own container.
 */
function SizeSync() {
  const gl = useThree((s) => s.gl);
  const setSize = useThree((s) => s.setSize);

  useEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;
    const apply = () => {
      if (host.clientWidth > 0 && host.clientHeight > 0) {
        setSize(host.clientWidth, host.clientHeight);
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(host);
    return () => ro.disconnect();
  }, [gl, setSize]);

  return null;
}

/**
 * The WebGL surface for the orbit act. Isolated in its own module so it can be
 * dynamically imported with ssr:false: Three.js must never run on the server.
 */
export default function OrbitCanvas({
  progress,
  chapter,
  focus = null,
  camZoom,
  camBearing,
  autoScale = false,
  reducedMotion = false,
}: Props) {
  return (
    <Canvas
      dpr={[1, 1.6]}
      camera={{ position: [0, 0, 3.6], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      resize={{ offsetSize: true }}
      style={{ background: "transparent", width: "100%", height: "100%" }}
    >
      <SizeSync />
      <OrbitGlobe
        progress={progress}
        chapter={chapter}
        focus={focus}
        camZoom={camZoom}
        camBearing={camBearing}
        autoScale={autoScale}
        reducedMotion={reducedMotion}
      />
    </Canvas>
  );
}
