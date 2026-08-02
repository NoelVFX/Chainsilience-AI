"use client";

import { Billboard, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { latLonToVector3, SEVERITY_COLOR } from "./latlon";

export interface GlobePoint {
  country: string;
  lat: number;
  lon: number;
  severity: string;
  score: number;
}

interface GlobeProps {
  points: GlobePoint[];
  /** Backdrop mode: dimmer, auto-spins, no user controls (decorative). */
  backdrop?: boolean;
  reducedMotion?: boolean;
}

const R = 1;

/** A single disruption marker: a glowing node, a pulsing halo, and a spike. */
function Marker({ point }: { point: GlobePoint }) {
  const haloRef = useRef<THREE.Mesh>(null);
  const color = SEVERITY_COLOR[point.severity] ?? "#22d3ee";
  const pos = useMemo(() => latLonToVector3(point.lat, point.lon, R + 0.01), [point]);
  const spikeLen = 0.12 + (point.score / 100) * 0.28;

  // Orient a spike so it points radially outward from the globe surface.
  const { spikePos, quaternion } = useMemo(() => {
    const dir = pos.clone().normalize();
    const mid = dir.clone().multiplyScalar(R + spikeLen / 2);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir,
    );
    return { spikePos: mid, quaternion: q };
  }, [pos, spikeLen]);

  useFrame(({ clock }) => {
    if (!haloRef.current) return;
    const t = clock.getElapsedTime();
    const s = 1 + Math.sin(t * 2.2 + point.lon) * 0.35;
    haloRef.current.scale.setScalar(s);
    const mat = haloRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.35 - Math.sin(t * 2.2 + point.lon) * 0.18;
  });

  return (
    <group>
      {/* radial spike */}
      <mesh position={spikePos} quaternion={quaternion}>
        <cylinderGeometry args={[0.006, 0.02, spikeLen, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} />
      </mesh>
      {/* node */}
      <mesh position={pos}>
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {/* pulsing halo, always facing the camera */}
      <Billboard position={pos}>
        <mesh ref={haloRef}>
          <circleGeometry args={[0.05, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

/** The rotating earth: solid core, cyan wireframe shell, atmospheric rim. */
function Earth({ points, backdrop, reducedMotion }: GlobeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { gl } = useThree();
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  // Leftover angular velocity (rad/frame) for a little spin-down after release.
  const velocity = useRef({ x: 0, y: 0 });

  // Drag-to-rotate for the foreground (dashboard) globe: press and drag to spin
  // (horizontal) and tilt (vertical). Rotation is applied directly on the group
  // in the pointer handler so it tracks the cursor 1:1; releasing keeps a bit of
  // inertia. Attached regardless of reduced-motion — it's user-initiated.
  useEffect(() => {
    if (backdrop) return;
    const el = gl.domElement;
    el.style.touchAction = "none";
    el.style.cursor = "grab";
    const ROT = 0.006; // radians of rotation per pixel dragged

    const onDown = (e: PointerEvent) => {
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      velocity.current = { x: 0, y: 0 };
      el.style.cursor = "grabbing";
      el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      const g = groupRef.current;
      if (g) {
        g.rotation.y += dx * ROT;
        g.rotation.x = THREE.MathUtils.clamp(g.rotation.x + dy * ROT, -0.6, 0.6);
      }
      velocity.current = { x: dy * ROT, y: dx * ROT };
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      el.style.cursor = "grab";
      el.releasePointerCapture?.(e.pointerId);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onUp);
      el.style.cursor = "";
    };
  }, [gl, backdrop]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const d = Math.min(delta, 0.05); // clamp for tab-switch frame spikes

    if (backdrop) {
      g.rotation.y += d * (reducedMotion ? 0.03 : 0.08);
      return;
    }

    if (dragging.current) return; // user is actively dragging — hands off

    const v = velocity.current;
    if (Math.abs(v.y) > 0.0002 || Math.abs(v.x) > 0.0002) {
      // Inertia: keep spinning from the release velocity, decaying to rest.
      g.rotation.y += v.y;
      g.rotation.x = THREE.MathUtils.clamp(g.rotation.x + v.x, -0.6, 0.6);
      const decay = Math.pow(0.94, d * 60);
      v.y *= decay;
      v.x *= decay;
    } else if (!reducedMotion) {
      // Idle: a gentle drift so it reads as live; tilt eases back to level.
      g.rotation.y += d * 0.08;
      g.rotation.x += (0 - g.rotation.x) * Math.min(1, d * 1.5);
    }
  });

  return (
    // Backdrop fits fully in-frame (scale 1) and is a translucent wireframe with
    // no solid core, so it blends with the page background instead of reading as
    // a clipped dark disc. The dashboard globe keeps a solid, lit earth.
    <group ref={groupRef} scale={1}>
      {/* solid, lit core — only for the foreground (dashboard) globe */}
      {!backdrop && (
        <mesh>
          <sphereGeometry args={[R, 48, 48]} />
          <meshStandardMaterial
            color="#0b1a2e"
            emissive="#06131f"
            emissiveIntensity={0.6}
            roughness={0.9}
            metalness={0.1}
          />
        </mesh>
      )}
      {/* faint occluder for the backdrop so back-side lines don't show through */}
      {backdrop && (
        <mesh>
          <sphereGeometry args={[R * 0.99, 32, 32]} />
          <meshBasicMaterial color="#0a1420" transparent opacity={0.35} />
        </mesh>
      )}
      {/* wireframe shell */}
      <mesh scale={1.003}>
        <icosahedronGeometry args={[R, 6]} />
        <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={backdrop ? 0.22 : 0.12} />
      </mesh>
      {/* latitude/longitude rings for a techy graticule */}
      <Graticule backdrop={backdrop} />
      {/* atmosphere rim glow */}
      <mesh scale={1.16}>
        <sphereGeometry args={[R, 32, 32]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={backdrop ? 0.08 : 0.05} side={THREE.BackSide} />
      </mesh>
      {!backdrop && points.map((p, i) => <Marker key={`${p.country}-${i}`} point={p} />)}
    </group>
  );
}

/** Thin latitude & longitude rings (drei <Line> avoids the SVG `line` clash). */
function Graticule({ backdrop = false }: { backdrop?: boolean }) {
  const rings = useMemo(() => {
    const out: THREE.Vector3[][] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 6) pts.push(latLonToVector3(lat, lon, R + 0.004));
      out.push(pts);
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 6) pts.push(latLonToVector3(lat, lon, R + 0.004));
      out.push(pts);
    }
    return out;
  }, []);

  return (
    <group>
      {rings.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color={backdrop ? "#22d3ee" : "#3b82f6"}
          transparent
          opacity={backdrop ? 0.25 : 0.14}
          lineWidth={1}
        />
      ))}
    </group>
  );
}

/** Full scene contents (lights + earth + optional controls). */
export function Globe({ points, backdrop = false, reducedMotion = false }: GlobeProps) {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 3, 5]} intensity={1.3} color="#bfe9ff" />
      <pointLight position={[-4, -2, -3]} intensity={0.6} color="#8b5cf6" />
      <Earth points={points} backdrop={backdrop} reducedMotion={reducedMotion} />
    </>
  );
}
