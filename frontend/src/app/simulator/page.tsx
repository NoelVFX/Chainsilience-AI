"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FadeUp, Stagger, StaggerItem } from "@/components/motion";
import { useApproveScenario, useScenarios, useRefreshScenarios } from "@/lib/hooks";
import type { ScenarioTile } from "@/lib/types";

/** Screen 5 — Scenario Simulator. Suspense wrapper for useSearchParams. */
export default function SimulatorPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-card border border-line bg-surface" />}>
        <SimulatorInner />
      </Suspense>
    </AppShell>
  );
}

const PRIORITIES = [
  { id: "balanced", label: "Balanced" },
  { id: "risk", label: "Most Reduced Risk" },
  { id: "cost", label: "Lowest Cost" },
  { id: "recovery", label: "Fastest Recovery" },
  { id: "financial", label: "Best Financial Impact" },
];

function SimulatorInner() {
  const router = useRouter();
  const search = useSearchParams();
  const riskId = Number(search.get("risk") ?? 0);
  const [priority, setPriority] = useState("balanced");
  const { data, isLoading } = useScenarios(riskId, priority);
  const refresh = useRefreshScenarios(riskId, priority);
  const approve = useApproveScenarioAndNavigate(riskId);

  const [selectedId, setSelectedId] = useState("switch");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (data?.scenarios.length) {
      setSelectedId((cur) =>
        data.scenarios.some((s) => s.id === cur) ? cur : data.scenarios[0].id,
      );
    }
  }, [data]);

  // No risk selected - show landing page
  if (!riskId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="mb-6 text-[22px] font-extrabold text-text">
          No Disruption Selected
        </div>
        <p className="mb-6 max-w-md text-[13px] text-muted">
          Please select a risk from the Risk Details page to run the scenario simulator.
        </p>
        <button
          onClick={() => router.push("/risk")}
          className="btn-primary px-6 py-3"
        >
          Go to Risk Details
        </button>
      </div>
    );
  }

  if (isLoading || !data) {
    return <div className="h-64 animate-pulse rounded-card border border-line bg-surface" />;
  }

  const selected: ScenarioTile =
    data.scenarios.find((s) => s.id === selectedId) ?? data.scenarios[0];

  async function handleApprove() {
    const result = await approve.mutateAsync(selected.id);
    if (!result.approved) {
      // Duplicate approval — surface the rejection instead of navigating.
      setNotice(result.message || "This scenario is already approved in the Action Center.");
      return;
    }
    router.push("/action-center");
  }

  return (
    <>
      <button
        onClick={() => router.push(`/risk/${riskId}`)}
        className="mb-4 text-[13px] text-muted hover:text-text"
      >
        ← Back to Risk Detail
      </button>
      <h1 className="mb-1 text-[22px] font-extrabold text-text">Scenario Simulator</h1>
      <p className="mb-4 text-[13px] text-muted">{data.risk_title}</p>

      {/* Priority selector — re-ranks options by the multi-objective U(a) score */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[12px] font-semibold text-muted">Prioritise:</span>
        {PRIORITIES.map((p) => {
          const active = priority === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPriority(p.id)}
              className="rounded-control border px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                borderColor: active ? "rgba(34,211,238,0.5)" : "rgba(148,163,184,0.18)",
                color: active ? "#22d3ee" : "#8b98b3",
                background: active ? "rgba(34,211,238,0.08)" : "transparent",
              }}
            >
              {p.label}
            </button>
          );
        })}
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="ml-2 rounded-control border px-3 py-1.5 text-[12px] font-semibold text-muted hover:text-text transition-colors"
          style={{ borderColor: "rgba(148,163,184,0.3)", background: "rgba(148,163,184,0.05)" }}
        >
          {refresh.isPending ? "Refreshing…" : "↻ Refresh Strategies"}
        </button>
      </div>

      {/* Scenario cards — ordered best-fit first for the chosen priority */}
      <Stagger className="mb-6 grid grid-cols-4 gap-3.5">
        {data.scenarios.map((s) => {
          const active = s.id === selected.id;
          return (
            <StaggerItem key={s.id}>
              <button
                onClick={() => {
                  setSelectedId(s.id);
                  setNotice(null);
                }}
                className="tilt-card relative h-full w-full rounded-card bg-surface p-[18px] text-left"
                style={{
                  border: active ? "1.5px solid #22d3ee" : "1px solid rgba(148,163,184,0.14)",
                }}
              >
                {/* rank badge (#1 = best fit for the chosen priority) */}
                <span
                  className="absolute right-2.5 top-2.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-md px-1.5 text-[11px] font-bold"
                  style={{
                    background: s.rank === 1 ? "rgba(52,211,153,0.16)" : "rgba(148,163,184,0.1)",
                    color: s.rank === 1 ? "#34d399" : "#8b98b3",
                  }}
                  title="Multi-objective fit rank"
                >
                  #{s.rank}
                </span>
                <div className="pr-7 text-sm font-bold text-text">{s.name}</div>
                <div className="mt-2 text-xs text-muted">Risk reduction</div>
                <div className="text-lg font-extrabold text-cyan">{s.risk_reduction}</div>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-inset">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.score}%`,
                        background: "linear-gradient(90deg,#22d3ee,#3b82f6)",
                      }}
                    />
                  </div>
                  <span className="text-[10.5px] font-semibold text-muted">{s.score}</span>
                </div>
              </button>
            </StaggerItem>
          );
        })}
      </Stagger>

      <p className="mb-6 -mt-2 text-[11px] text-muted/70">
        Options ranked by a deterministic multi-objective score U(a) = βS·ServiceRecovery
        + βF·NetFinancialImpact + βR·ReducedRisk, with the
        chosen priority weighted highest. #1 (green) is the best fit.
      </p>

      {/* Comparison panel — re-animates when the selected scenario changes */}
      <FadeUp key={selected.id} y={10} delay={0.05} className="card p-6">
        <div className="mb-4 text-[15px] font-bold text-text">{selected.name} — Comparison</div>
        <div className="mb-5 grid grid-cols-4 gap-4">
          <StatTile label="Risk Reduction" value={selected.risk_reduction} color="#34d399" />
          <StatTile label="Implementation Cost" value={selected.cost} color="#e7ecf5" />
          <StatTile label="Recovery Time" value={selected.recovery} color="#e7ecf5" />
          <StatTile label="Net Financial Impact" value={selected.financial} color="#f87171" />
        </div>
        <button
          onClick={handleApprove}
          disabled={approve.isPending}
          className="btn-primary inline-block px-5 py-3"
        >
          {approve.isPending ? "Sending…" : "Approve & Send to Action Center"}
        </button>
        {notice && (
          <div
            className="mt-3.5 rounded-control border px-4 py-2.5 text-[12.5px] font-semibold"
            style={{
              background: "rgba(251,191,36,0.1)",
              borderColor: "rgba(251,191,36,0.35)",
              color: "#fbbf24",
            }}
          >
            ⚠ {notice}
          </div>
        )}
      </FadeUp>
    </>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-[10px] bg-inset p-3.5">
      <div className="text-[11.5px] font-semibold text-muted">{label}</div>
      <div className="mt-1 text-xl font-extrabold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
