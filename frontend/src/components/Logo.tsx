/** Gradient logo chip + wordmark, sized for header / sidebar contexts. */
export function Logo({ size = 34, font = 19 }: { size?: number; font?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size >= 32 ? 9 : 8,
          background: "linear-gradient(135deg,#22d3ee,#3b82f6)",
          flexShrink: 0,
        }}
      />
      <div
        className="font-extrabold text-text"
        style={{ fontSize: font, letterSpacing: "-0.01em" }}
      >
        Chainsilience AI
      </div>
    </div>
  );
}
