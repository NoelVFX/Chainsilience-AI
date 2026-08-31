"use client";

/**
 * A single, static, very faint accent glow for depth — no animation, no
 * hue-shift, no drifting orbs. The restrained "Slate & Signal" direction:
 * the ground stays calm so the data carries the color.
 */
export function AmbientOrbs({ variant = "app" }: { variant?: "auth" | "app" }) {
  const auth = variant === "auth";
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        zIndex: -1,
        top: auth ? "-8%" : -160,
        right: auth ? "50%" : -140,
        transform: auth ? "translateX(50%)" : undefined,
        width: 640,
        height: 640,
        borderRadius: "50%",
        pointerEvents: "none",
        filter: "blur(70px)",
        background:
          "radial-gradient(circle at 50% 40%, rgba(91,141,239,0.10), rgba(91,141,239,0) 70%)",
      }}
    />
  );
}
