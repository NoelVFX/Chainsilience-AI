"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { FadeUp } from "@/components/motion";
import { ApiError } from "@/lib/api";
import { useBillingStatus, useCancelPlan, useCreateCheckout } from "@/lib/hooks";

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  growth: "Growth",
  enterprise: "Enterprise",
};

/** Billing — view the current plan and cancel it at the end of the period. */
export default function BillingPage() {
  const router = useRouter();
  const { data: status, isLoading } = useBillingStatus();
  const cancel = useCancelPlan();
  const checkout = useCreateCheckout();

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPaid = status?.plan === "growth" || status?.plan === "enterprise";
  const cancelling = Boolean(status?.cancel_at_period_end);

  const onCancel = async () => {
    setError(null);
    try {
      await cancel.mutateAsync();
      setConfirming(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not cancel your plan.");
    }
  };

  const onUpgrade = async () => {
    setError(null);
    try {
      const { url } = await checkout.mutateAsync("growth");
      window.location.href = url;
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not start checkout. Please try again.",
      );
    }
  };

  return (
    <AppShell>
      <h1 className="mb-1 text-[22px] font-extrabold text-text">Billing</h1>
      <p className="mb-6 text-[13px] text-muted">Manage your plan and subscription</p>

      {isLoading || !status ? (
        <div className="h-56 w-full max-w-[560px] animate-pulse rounded-panel border border-line bg-surface" />
      ) : (
        <FadeUp y={16} className="w-full max-w-[560px]">
          <div className="rounded-panel border border-line bg-surface p-7">
            {/* Current plan */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted">
                  Current plan
                </div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <span className="text-[20px] font-extrabold text-text">
                    {PLAN_LABEL[status.plan] ?? status.plan}
                  </span>
                  <StatusPill active={status.active} cancelling={cancelling} paid={isPaid} />
                </div>
              </div>
              {isPaid && (
                <div className="text-right">
                  <div className="text-[20px] font-extrabold text-text">$499</div>
                  <div className="text-[12px] text-muted">per month</div>
                </div>
              )}
            </div>

            <div className="my-6 h-px w-full bg-line" />

            {/* State-dependent body */}
            {cancelling ? (
              <div
                className="rounded-control border p-4 text-[13px]"
                style={{
                  borderColor: "rgba(251,191,36,0.25)",
                  background: "rgba(251,191,36,0.06)",
                  color: "#e7ecf5",
                }}
              >
                <div className="font-semibold text-text">Your plan is set to cancel.</div>
                <div className="mt-1 text-muted">
                  You&apos;ll keep full access until the end of the current billing period.
                  After that your subscription won&apos;t renew and you won&apos;t be charged
                  again.
                </div>
              </div>
            ) : isPaid ? (
              <div className="text-[13px] text-muted">
                Your Growth plan renews automatically each month. You can cancel anytime —
                you&apos;ll keep access until the end of the period you&apos;ve already paid
                for.
              </div>
            ) : (
              <div className="text-[13px] text-muted">
                You&apos;re on the free plan. Upgrade to Growth for real-time monitoring,
                unlimited scenarios, and priority intelligence.
              </div>
            )}

            {error && (
              <div className="mt-4 text-[13px] font-medium" style={{ color: "#f87171" }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex flex-col gap-2.5">
              {isPaid && !cancelling && !confirming && (
                <button
                  onClick={() => {
                    setError(null);
                    setConfirming(true);
                  }}
                  className="rounded-control border py-3 text-sm font-semibold text-text transition-colors"
                  style={{ borderColor: "rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.07)" }}
                >
                  Cancel plan
                </button>
              )}

              {isPaid && !cancelling && confirming && (
                <div
                  className="rounded-control border p-4"
                  style={{ borderColor: "rgba(248,113,113,0.30)", background: "rgba(248,113,113,0.05)" }}
                >
                  <div className="text-[13px] font-semibold text-text">
                    Cancel your Growth plan?
                  </div>
                  <div className="mt-1 text-[12.5px] text-muted">
                    Billing stops after the current period. You keep access until then.
                  </div>
                  <div className="mt-3.5 flex gap-2.5">
                    <button
                      onClick={onCancel}
                      disabled={cancel.isPending}
                      className="flex-1 rounded-control py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                      style={{ background: "#dc2626" }}
                    >
                      {cancel.isPending ? "Cancelling…" : "Yes, cancel plan"}
                    </button>
                    <button
                      onClick={() => setConfirming(false)}
                      disabled={cancel.isPending}
                      className="flex-1 rounded-control border py-2.5 text-sm font-semibold text-text"
                      style={{ borderColor: "rgba(148,163,184,0.25)", background: "rgba(148,163,184,0.06)" }}
                    >
                      Keep plan
                    </button>
                  </div>
                </div>
              )}

              {!isPaid && (
                <button
                  onClick={onUpgrade}
                  disabled={checkout.isPending}
                  className="btn-primary py-3 disabled:opacity-60"
                >
                  {checkout.isPending ? "Starting checkout…" : "Upgrade to Growth"}
                </button>
              )}

              <button
                onClick={() => router.push("/dashboard")}
                className="rounded-control border py-3 text-sm font-semibold text-text"
                style={{ borderColor: "rgba(148,163,184,0.20)", background: "rgba(148,163,184,0.04)" }}
              >
                Back to dashboard
              </button>
            </div>
          </div>
        </FadeUp>
      )}
    </AppShell>
  );
}

function StatusPill({
  active,
  cancelling,
  paid,
}: {
  active: boolean;
  cancelling: boolean;
  paid: boolean;
}) {
  let label = "Free";
  let color = "#8b98b3";
  if (cancelling) {
    label = "Cancels at period end";
    color = "#fbbf24";
  } else if (paid && active) {
    label = "Active";
    color = "#34d399";
  }
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.03em]"
      style={{ color, background: `${color}1f`, border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  );
}
