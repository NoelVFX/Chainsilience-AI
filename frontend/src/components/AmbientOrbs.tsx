"use client";

/**
 * Decorative, slowly-floating, hue-shifting color orbs behind the content —
 * the "living" background from the design. Pointer-events are disabled so they
 * never intercept clicks.
 */
export function AmbientOrbs({ variant = "app" }: { variant?: "auth" | "app" }) {
  if (variant === "auth") {
    return (
      <>
        <div
          className="orb"
          style={{
            top: -80,
            left: -100,
            width: 380,
            height: 380,
            background:
              "radial-gradient(circle at 35% 35%,rgba(34,211,238,0.55),rgba(34,211,238,0) 70%)",
            animation: "floatOrbA 9s ease-in-out infinite, hueBlur20 13s linear infinite",
          }}
        />
        <div
          className="orb"
          style={{
            bottom: -100,
            right: -80,
            width: 420,
            height: 420,
            background:
              "radial-gradient(circle at 60% 40%,rgba(139,92,246,0.45),rgba(139,92,246,0) 70%)",
            animation: "floatOrbB 11s ease-in-out infinite, hueBlur20 16s linear infinite",
          }}
        />
      </>
    );
  }
  return (
    <>
      <div
        className="orb"
        style={{
          zIndex: -1,
          top: -140,
          right: -120,
          width: 480,
          height: 480,
          filter: "blur(30px)",
          background:
            "radial-gradient(circle at 40% 40%,rgba(139,92,246,0.22),rgba(139,92,246,0) 70%)",
          animation: "floatOrbA 16s ease-in-out infinite, hueBlur30 20s linear infinite",
        }}
      />
      <div
        className="orb"
        style={{
          zIndex: -1,
          bottom: -160,
          left: 200,
          width: 520,
          height: 520,
          filter: "blur(30px)",
          background:
            "radial-gradient(circle at 50% 50%,rgba(34,211,238,0.16),rgba(34,211,238,0) 70%)",
          animation: "floatOrbB 18s ease-in-out infinite, hueBlur30 24s linear infinite",
        }}
      />
    </>
  );
}
