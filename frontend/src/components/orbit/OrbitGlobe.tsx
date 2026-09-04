"use client";

import { Billboard, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { MotionValue } from "framer-motion";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { latLonToVector3 } from "../three/latlon";
import { CHAPTERS, type OrbitArc, type OrbitMarker } from "./chapters";

const R = 1;
const DEG = Math.PI / 180;

const TONE: Record<OrbitMarker["tone"], string> = {
  node: "#5b8def",
  low: "#4bb384",
  medium: "#e0994a",
  high: "#e0575b",
};

/**
 * Rotation that brings meridian `lon` to face the camera. Derived from
 * latLonToVector3: a point at lon = -90 already faces +Z at zero rotation.
 */
const lonToYaw = (lon: number) => -(lon + 90) * DEG;

/** A great-circle arc lifted off the surface, so routes read as flight paths. */
function useArcPoints(arc: OrbitArc) {
  return useMemo(() => {
    const a = latLonToVector3(arc.from[0], arc.from[1], R);
    const b = latLonToVector3(arc.to[0], arc.to[1], R);
    const angle = a.angleTo(b);
    const lift = 0.09 + angle * 0.14;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      // Slerp along the sphere, then bulge outward with a sine so the ends land
      // flush on the surface and the middle floats above it.
      const p = new THREE.Vector3().copy(a).lerp(b, t).normalize();
      pts.push(p.multiplyScalar(R + Math.sin(t * Math.PI) * lift));
    }
    return pts;
  }, [arc]);
}

/**
 * A route between two twin nodes. A muted arc is dashed and grey: that is how a
 * cut or de-prioritised lane reads without needing a label.
 */
function Arc({ arc }: { arc: OrbitArc }) {
  const points = useArcPoints(arc);
  return (
    <Line
      points={points}
      color={arc.muted ? "#6b7688" : "#5b8def"}
      transparent
      opacity={arc.muted ? 0.3 : 0.7}
      lineWidth={arc.muted ? 1 : 1.6}
      dashed={arc.muted}
      dashSize={0.05}
      gapSize={0.04}
    />
  );
}

function Marker({ marker }: { marker: OrbitMarker }) {
  const haloRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const life = useRef(0);
  const color = TONE[marker.tone];
  const weight = marker.weight ?? 0.6;

  const { pos, spikePos, quaternion, spikeLen } = useMemo(() => {
    const p = latLonToVector3(marker.lat, marker.lon, R + 0.008);
    const dir = p.clone().normalize();
    const len = 0.06 + weight * 0.2;
    return {
      pos: p,
      spikeLen: len,
      spikePos: dir.clone().multiplyScalar(R + len / 2),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir,
      ),
    };
  }, [marker.lat, marker.lon, weight]);

  useFrame(({ clock }, delta) => {
    // Scale in from 0.4 (never from 0 — nothing appears out of nothing).
    life.current = Math.min(1, life.current + delta * 3.2);
    const eased = 1 - Math.pow(1 - life.current, 3);
    if (groupRef.current) groupRef.current.scale.setScalar(0.4 + eased * 0.6);

    if (!haloRef.current) return;
    const t = clock.getElapsedTime();
    const s = 1 + Math.sin(t * 2 + marker.lon) * 0.3;
    haloRef.current.scale.setScalar(s);
    const mat = haloRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = (0.34 - Math.sin(t * 2 + marker.lon) * 0.16) * eased;
  });

  return (
    <group ref={groupRef}>
      <mesh position={spikePos} quaternion={quaternion}>
        <cylinderGeometry args={[0.005, 0.018, spikeLen, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} />
      </mesh>
      <mesh position={pos}>
        <sphereGeometry args={[0.026, 16, 16]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <Billboard position={pos}>
        <mesh ref={haloRef}>
          <circleGeometry args={[0.062, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

/** A latitude ring that sweeps pole to pole — the "we are scanning" chapter. */
function ScanRing() {
  const ref = useRef<THREE.Group>(null);
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let lon = -180; lon <= 180; lon += 4) pts.push(latLonToVector3(0, lon, R + 0.012));
    return pts;
  }, []);

  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    // 8s sweep from -60° to +60° latitude and back.
    const t = clock.getElapsedTime() * 0.25;
    const lat = Math.sin(t) * 58;
    g.position.y = Math.sin(lat * DEG) * R;
    const s = Math.max(0.06, Math.cos(lat * DEG));
    g.scale.set(s, 1, s);
  });

  return (
    <group ref={ref}>
      <Line points={points} color="#5b8def" transparent opacity={0.5} lineWidth={1.4} />
    </group>
  );
}

/** Faint latitude / longitude graticule — gives the sphere a readable surface. */
function Graticule() {
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
        <Line key={i} points={pts} color="#5b8def" transparent opacity={0.07} lineWidth={1} />
      ))}
    </group>
  );
}

interface Props {
  /** Scroll progress through the orbit act, 0-1. Read per frame, never as state. */
  progress: MotionValue<number>;
  /** Index of the chapter whose markers and arcs are currently mounted. */
  chapter: number;
  reducedMotion?: boolean;
}

export function OrbitGlobe({ progress, chapter, reducedMotion = false }: Props) {
  const groupRef = useRef<THREE.Group>(null);

  const earthTex = useMemo(() => {
    const t = new THREE.TextureLoader().load("/textures/earth-blue-marble.jpg");
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  const landEmissive = useMemo(() => new THREE.Color("#9fb3cc"), []);

  const active = CHAPTERS[Math.min(chapter, CHAPTERS.length - 1)];

  // Scroll drives rotation through a motion value read inside the frame loop, so
  // turning the globe never re-renders React.
  useFrame(({ clock }, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const d = Math.min(delta, 0.05);

    const p = THREE.MathUtils.clamp(progress.get(), 0, 1);
    const span = CHAPTERS.length - 1;
    const f = p * span;
    const i = Math.min(Math.floor(f), span - 1);
    const t = THREE.MathUtils.smoothstep(f - i, 0, 1);
    const a = CHAPTERS[i].view;
    const b = CHAPTERS[i + 1].view;
    const lon = THREE.MathUtils.lerp(a.lon, b.lon, t);
    const lat = THREE.MathUtils.lerp(a.lat, b.lat, t);

    // A bounded sway (about +/-2.5 degrees) keeps the earth alive without ever
    // leaving the region the chapter is about. An accumulating drift would look
    // livelier for ten seconds and then silently point at the wrong continent.
    const sway = reducedMotion ? 0 : Math.sin(clock.getElapsedTime() * 0.22) * 0.044;

    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, lonToYaw(lon) + sway, 3.2, d);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, lat * DEG * 0.55, 3.2, d);
  });

  return (
    <>
      {/* Lit flatter than a photoreal earth on purpose. This is a readout, not a
          render: a hard terminator would hide half the markers in shadow. */}
      <ambientLight intensity={0.98} />
      <directionalLight position={[4, 3, 5]} intensity={0.85} color="#cfeaff" />
      <pointLight position={[-4, -2, -3]} intensity={0.4} color="#5b8def" />

      <group ref={groupRef}>
        <mesh>
          <sphereGeometry args={[R, 64, 64]} />
          <meshStandardMaterial
            map={earthTex}
            emissiveMap={earthTex}
            emissive={landEmissive}
            emissiveIntensity={0.5}
            roughness={0.9}
            metalness={0}
          />
        </mesh>

        <Graticule />

        {active.markers.map((m, i) => (
          <Marker key={`${chapter}-m${i}`} marker={m} />
        ))}
        {active.arcs.map((a, i) => (
          <Arc key={`${chapter}-a${i}`} arc={a} />
        ))}
        {active.scan && !reducedMotion && <ScanRing />}
      </group>

      {/* Atmosphere rim — a thin back-faced shell, not an outer glow. */}
      <mesh scale={1.14}>
        <sphereGeometry args={[R, 32, 32]} />
        <meshBasicMaterial color="#5b8def" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
    </>
  );
}
