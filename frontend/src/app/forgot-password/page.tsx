"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AmbientOrbs } from "@/components/AmbientOrbs";
import { Logo } from "@/components/Logo";
import { FadeUp } from "@/components/motion";
import { ApiError } from "@/lib/api";
import { useForgotPassword } from "@/lib/hooks";

/**
 * Forgot password — request a reset link. The backend always responds with the
 * same generic message (it never reveals whether an account exists), so on
 * success we show a neutral "check your email" state.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const forgot = useForgotPassword();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    try {
      const res = await forgot.mutateAsync(email.trim());
      setDevUrl(res.dev_reset_url ?? null);
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <AmbientOrbs variant="auth" />

      <FadeUp y={22} className="relative z-10 w-[400px] max-w-full">
        <div
          className="rounded-panel border border-line bg-surface p-10"
          style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.45), 0 0 60px rgba(34,211,238,0.08)" }}
        >
          <Logo />

          {sent ? (
            <>
              <div className="mt-4 text-lg font-extrabold text-text">Check your email</div>
              <div className="mt-1.5 text-[13px] text-muted">
                If an account exists for{" "}
                <span className="font-semibold text-text">{email.trim()}</span>, we&apos;ve sent a
                link to reset your password. The link expires in 30 minutes.
              </div>

              {devUrl && (
                <div
                  className="mt-4 rounded-control border px-4 py-3 text-[12px] font-semibold"
                  style={{
                    background: "rgba(251,191,36,0.1)",
                    borderColor: "rgba(251,191,36,0.35)",
                    color: "#fbbf24",
                  }}
                >
                  Dev mode — no email service is configured. Use this link to reset:
                  <Link
                    href={devUrl.replace(/^.*\/reset-password/, "/reset-password")}
                    className="mt-2 block break-all font-mono font-bold text-cyan underline"
                  >
                    {devUrl}
                  </Link>
                </div>
              )}

              <button
                onClick={() => router.push("/login")}
                className="btn-primary mt-6 w-full py-3"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <div className="mt-4 text-lg font-extrabold text-text">Forgot your password?</div>
              <div className="mb-6 mt-1.5 text-[13px] text-muted">
                Enter your account email and we&apos;ll send you a link to reset your password.
              </div>

              <div className="mb-1.5 text-xs font-semibold text-muted">Email</div>
              <input
                type="email"
                className="panel-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />

              {error && <div className="mt-3 text-xs text-danger">{error}</div>}

              <button
                onClick={handleSubmit}
                disabled={forgot.isPending}
                className="btn-primary mt-6 w-full py-3"
              >
                {forgot.isPending ? "Sending…" : "Send reset link"}
              </button>

              <div className="mt-4 text-center text-[13px] text-muted">
                Remembered it?{" "}
                <span
                  onClick={() => router.push("/login")}
                  className="cursor-pointer font-semibold text-cyan"
                >
                  Back to sign in
                </span>
              </div>
            </>
          )}
        </div>
      </FadeUp>
    </div>
  );
}
