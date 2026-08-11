"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AmbientOrbs } from "@/components/AmbientOrbs";
import { Logo } from "@/components/Logo";
import { FadeUp } from "@/components/motion";
import { ApiError } from "@/lib/api";
import { useResetPassword } from "@/lib/hooks";

/** Reset password — set a new password using the token from the emailed link. */
function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const reset = useResetPassword();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!token) {
      setError("This reset link is invalid. Please request a new one.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    try {
      await reset.mutateAsync({ token, new_password: password });
      setDone(true);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Couldn't reset your password. Please try again.",
      );
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

          {done ? (
            <>
              <div className="mt-4 text-lg font-extrabold text-text">Password updated</div>
              <div className="mt-1.5 text-[13px] text-muted">
                Your password has been reset. You can now sign in with your new password.
              </div>
              <button
                onClick={() => router.push("/login")}
                className="btn-primary mt-6 w-full py-3"
              >
                Sign in
              </button>
            </>
          ) : !token ? (
            <>
              <div className="mt-4 text-lg font-extrabold text-text">Invalid reset link</div>
              <div className="mt-1.5 text-[13px] text-muted">
                This link is missing its token or is malformed. Request a fresh reset link and try
                again.
              </div>
              <button
                onClick={() => router.push("/forgot-password")}
                className="btn-primary mt-6 w-full py-3"
              >
                Request a new link
              </button>
            </>
          ) : (
            <>
              <div className="mt-4 text-lg font-extrabold text-text">Set a new password</div>
              <div className="mb-6 mt-1.5 text-[13px] text-muted">
                Choose a new password for your account.
              </div>

              <div className="mb-1.5 text-xs font-semibold text-muted">New password</div>
              <input
                type="password"
                className="panel-input"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <div className="mb-1.5 mt-4 text-xs font-semibold text-muted">Confirm password</div>
              <input
                type="password"
                className="panel-input"
                placeholder="Re-type new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />

              {error && <div className="mt-3 text-xs text-danger">{error}</div>}

              <button
                onClick={handleSubmit}
                disabled={reset.isPending}
                className="btn-primary mt-6 w-full py-3"
              >
                {reset.isPending ? "Updating…" : "Reset password"}
              </button>

              <div className="mt-4 text-center text-[13px] text-muted">
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
