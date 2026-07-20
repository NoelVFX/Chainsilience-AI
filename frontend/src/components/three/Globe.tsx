"use client";

import { Billboard, Line, OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
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

  useFrame((_, delta) => {
    if (groupRef.current && (backdrop || reducedMotion)) {
      // Backdrop/reduced-motion: rotate the group directly (no OrbitControls).
      groupRef.current.rotation.y += delta * (reducedMotion ? 0.03 : 0.08);
    }
  });

  return (
    <group ref={groupRef} scale={backdrop ? 1.35 : 1}>
      {/* core */}
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
      {/* wireframe shell */}
      <mesh scale={1.003}>
        <icosahedronGeometry args={[R, 6]} />
        <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={backdrop ? 0.06 : 0.12} />
      </mesh>
      {/* latitude/longitude rings for a techy graticule */}
      <Graticule />
      {/* atmosphere rim glow */}
      <mesh scale={1.16}>
        <sphereGeometry args={[R, 32, 32]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.05} side={THREE.BackSide} />
      </mesh>
      {!backdrop && points.map((p, i) => <Marker key={`${p.country}-${i}`} point={p} />)}
    </group>
  );
}

/** Thin latitude & longitude rings (drei <Line> avoids the SVG `line` clash). */
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
        <Line key={i} points={pts} color="#3b82f6" transparent opacity={0.14} lineWidth={1} />
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
      {!backdrop && !reducedMotion && (
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.55}
          rotateSpeed={0.5}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={(2 * Math.PI) / 3}
        />
      )}
    </>
  );
}
