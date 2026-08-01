"use client";

import { useRouter } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { EarthLoader } from "@/components/EarthLoader";
import { Stagger, StaggerItem } from "@/components/motion";
import { useRisks } from "@/lib/hooks";

/** Risk list — every active disruption, newest/most-severe first. */
export default function RiskListPage() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useRisks();

  return (
    <AppShell>
      <h1 className="mb-1 text-[22px] font-extrabold text-text">Risk Detail</h1>
      <p className="mb-6 text-[13px] text-muted">
        All active disruptions affecting your supply chain — select one to inspect its
        breakdown, impact, and mitigation scenarios.
      </p>

      {isLoading ? (
        <div className="flex justify-center pt-16">
          <EarthLoader px={90} label="Loading disruptions…" />
        </div>
      ) : isError ? (
        <div className="mx-auto mt-10 max-w-md rounded-card border border-line bg-surface p-8 text-center">
          <div className="text-[14px] font-bold text-danger">Couldn&apos;t load risks</div>
          <button onClick={() => refetch()} className="btn-primary mt-4 px-5 py-2.5">
            Retry
          </button>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="mx-auto mt-10 max-w-md rounded-card border border-dashed border-line bg-surface p-10 text-center">
          <div className="text-[15px] font-bold text-text">No active disruptions</div>
          <p className="mt-2 text-[13px] text-muted">
            Nothing is threatening your supply chain right now. Use{" "}
            <span className="font-semibold text-cyan">↻ Ingest live news</span> on the
            dashboard to scan for new events.
          </p>
          <button onClick={() => router.push("/dashboard")} className="btn-primary mt-5 px-5 py-2.5">
            Go to Dashboard
          </button>
        </div>
      ) : (
        <Stagger className="flex flex-col gap-2.5">
          {data.map((r) => (
            <StaggerItem key={r.id}>
              <button
                onClick={() => router.push(`/risk/${r.id}`)}
                className="row-hover flex w-full items-center gap-4 rounded-card border border-line bg-surface p-4 text-left transition-colors"
              >
                <span
                  style={{ width: 10, height: 10, borderRadius: "50%", background: r.severity_color, flexShrink: 0 }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-text">{r.title}</div>
                  <div className="mt-0.5 truncate text-[12px] text-muted">
                    {r.supplier} · {r.time}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-[12.5px] font-bold" style={{ color: r.severity_color }}>
                    {r.severity}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">{r.impact}</div>
                </div>
                <span className="ml-1 flex-shrink-0 text-muted">›</span>
              </button>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </AppShell>
  );
}
