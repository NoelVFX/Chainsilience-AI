import * as THREE from "three";

/**
 * Convert geographic coordinates to a point on a sphere of the given radius.
 * Uses the standard spherical mapping (lat/lon in degrees).
 */
export function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

export const SEVERITY_COLOR: Record<string, string> = {
  critical: "#f87171",
  high: "#fbbf24",
  medium: "#3b82f6",
  low: "#34d399",
};
