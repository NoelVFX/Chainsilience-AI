"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FadeUp, Stagger, StaggerItem } from "@/components/motion";
import { useApproveScenario, useScenarios } from "@/lib/hooks";
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

function SimulatorInner() {
  const router = useRouter();
  const search = useSearchParams();
  const riskId = Number(search.get("risk") ?? 1);
  const { data, isLoading } = useScenarios(riskId);
  const approve = useApproveScenario(riskId);

  const [selectedId, setSelectedId] = useState("switch");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (data?.scenarios.length) {
      setSelectedId((cur) =>
        data.scenarios.some((s) => s.id === cur) ? cur : data.scenarios[0].id,
      );
    }
  }, [data]);

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
      <p className="mb-6 text-[13px] text-muted">{data.risk_title}</p>

      {/* Scenario cards */}
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
                className="tilt-card h-full w-full rounded-card bg-surface p-[18px] text-left"
                style={{
                  border: active ? "1.5px solid #22d3ee" : "1px solid rgba(148,163,184,0.14)",
                }}
              >
                <div className="text-sm font-bold text-text">{s.name}</div>
                <div className="mt-2 text-xs text-muted">Risk reduction</div>
                <div className="text-lg font-extrabold text-cyan">{s.risk_reduction}</div>
              </button>
            </StaggerItem>
          );
        })}
      </Stagger>

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
