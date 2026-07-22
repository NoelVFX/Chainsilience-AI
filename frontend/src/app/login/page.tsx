"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AmbientOrbs } from "@/components/AmbientOrbs";
import { EarthLoader } from "@/components/EarthLoader";
import { Logo } from "@/components/Logo";
import { FadeUp } from "@/components/motion";
import { GlobeMount } from "@/components/three/GlobeMount";
import { useLogin } from "@/lib/hooks";

/** Screen 1 — Login. Centered card on the animated orb background. */
export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSignIn() {
    try {
      await login.mutateAsync({ email, password });
      router.push("/dashboard");
    } catch {
      /* error surfaced below */
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <AmbientOrbs variant="auth" />

      {/* Decorative rotating 3D globe behind the card. */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        style={{ opacity: 0.8 }}
        aria-hidden
      >
        <div style={{ width: "min(620px, 88vw)", height: "min(620px, 88vw)" }}>
          <GlobeMount points={[]} backdrop />
        </div>
      </div>

      <FadeUp y={22} className="login-parent relative z-10 w-[400px] max-w-full">
      <div
        className="login-card rounded-panel border border-line bg-surface p-10"
        style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.45), 0 0 60px rgba(34,211,238,0.08)" }}
      >
        <div className="depth">
          <Logo />
        </div>
        <div className="mb-7 mt-1.5 text-[13px] text-muted">
          Transforming global supply chain signals into actionable business decisions.
        </div>

        <div className="flex flex-col gap-3.5">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted">Email</div>
            <input
              type="email"
              className="panel-input"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted">Password</div>
            <input
              type="password"
              className="panel-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
            />
          </div>
          <div className="-mt-1.5 flex justify-end">
            <span className="cursor-pointer text-xs text-muted hover:text-text">
              Forgot password?
            </span>
          </div>

          {login.isError && (
            <div className="text-xs text-danger">
              Invalid email or password.
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={login.isPending}
            className="btn-primary depth-sm mt-2 flex min-h-[46px] items-center justify-center py-3"
          >
            {login.isPending ? <EarthLoader px={26} /> : "Sign In"}
          </button>

          <div className="mt-1 text-center text-[13px] text-muted">
            New company?{" "}
            <span
              onClick={() => router.push("/onboarding")}
              className="cursor-pointer font-semibold text-cyan"
            >
              Start onboarding
            </span>
          </div>
        </div>
      </div>
      </FadeUp>
    </div>
  );
}
