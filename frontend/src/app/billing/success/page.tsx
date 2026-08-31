"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { AmbientOrbs } from "@/components/AmbientOrbs";
import { EarthLoader } from "@/components/EarthLoader";
import { Logo } from "@/components/Logo";
import { FadeUp } from "@/components/motion";
import { ApiError } from "@/lib/api";
import { useVerifyCheckout } from "@/lib/hooks";

/** Stripe Checkout return page — verifies the session and activates the plan. */
function BillingSuccessInner() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get("session_id") ?? "";
  const verify = useVerifyCheckout();

  const [state, setState] = useState<"verifying" | "done" | "error">("verifying");
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // verify once
    ran.current = true;
    if (!sessionId) {
      setState("error");
      setError("Missing checkout session.");
      return;
    }
    verify
      .mutateAsync(sessionId)
      .then(() => setState("done"))
      .catch((e) => {
        setState("error");
        setError(e instanceof ApiError ? e.message : "We couldn't verify your payment.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <AmbientOrbs variant="auth" />
      <FadeUp y={22} className="relative z-10 w-[420px] max-w-full">
        <div
          className="rounded-panel border border-line bg-surface p-10 text-center"
          style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.45), 0 0 60px rgba(91, 141, 239,0.08)" }}
        >
          <div className="flex justify-center">
            <Logo />
          </div>

          {state === "verifying" && (
            <>
              <div className="mt-8 flex justify-center">
                <EarthLoader px={40} />
              </div>
              <div className="mt-5 text-[15px] font-bold text-text">Confirming your payment…</div>
              <div className="mt-1.5 text-[13px] text-muted">This only takes a moment.</div>
            </>
          )}

          {state === "done" && (
            <>
              <div className="mt-6 text-4xl">✅</div>
              <div className="mt-3 text-lg font-extrabold text-text">You&apos;re all set</div>
              <div className="mt-1.5 text-[13px] text-muted">
                Your Growth plan is active. Welcome to the full Chainsilience AI platform.
              </div>
              <button onClick={() => router.push("/dashboard")} className="btn-primary mt-6 w-full py-3">
                Go to dashboard
              </button>
            </>
          )}

          {state === "error" && (
            <>
              <div className="mt-6 text-4xl">⚠️</div>
              <div className="mt-3 text-lg font-extrabold text-text">Couldn&apos;t confirm payment</div>
              <div className="mt-1.5 text-[13px] text-muted">{error}</div>
              <div className="mt-6 flex flex-col gap-2.5">
                <button onClick={() => router.push("/#pricing")} className="btn-primary py-3">
                  Back to pricing
                </button>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="rounded-control border py-3 text-sm font-semibold text-text"
                  style={{ borderColor: "rgba(148,163,184,0.25)", background: "rgba(148,163,184,0.06)" }}
                >
                  Try the dashboard
                </button>
              </div>
            </>
          )}
        </div>
      </FadeUp>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={null}>
      <BillingSuccessInner />
    </Suspense>
  );
}
