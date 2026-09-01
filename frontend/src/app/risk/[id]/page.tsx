"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { DependencyPaths } from "@/components/DependencyPaths";
import { EmailModal } from "@/components/EmailModal";
import { AnimatedBar, FadeUp } from "@/components/motion";
import { useRiskDetail, useRisks } from "@/lib/hooks";

/** Screen 4 — Risk Detail: breakdown, reasoning, event chain, impact. */
export default function RiskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const riskId = Number(params.id);
  const { data, isLoading, isError } = useRiskDetail(riskId);
  const { data: risks } = useRisks();
  const [emailOpen, setEmailOpen] = useState(false);

  // If no valid riskId or risk not found, show the risk list
  const showRiskList = !riskId || isError || (data === undefined && !isLoading);

  return (
    <AppShell>
      <button
        onClick={() => router.push("/dashboard")}
        className="mb-4 text-[13px] text-muted hover:text-text"
      >
        ← Back to Dashboard
      </button>

      {showRiskList ? (
        // Show list of active disruptions
        <>
          <h1 className="mb-6 mt-2 text-[22px] font-extrabold text-text">Active Disruptions</h1>
          <p className="mb-4 text-[13px] text-muted">
            Select a disruption to view detailed risk analysis
          </p>
          <div className="card">
            {!risks || risks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-[14px] font-semibold text-text">
                  No currently active disruptions detected
                </div>
                <div className="mt-1.5 max-w-[380px] text-[12px] leading-[1.6] text-muted">
                  We&apos;re continuously scanning global news. New disruptions affecting
                  your suppliers will appear here automatically.
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                {risks.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => router.push(`/risk/${r.id}`)}
                    className="row-hover grid grid-cols-[8px_minmax(0,1fr)_92px] items-center gap-3.5 rounded-control border-b border-line px-2 py-3.5"
                  >
                    <span
                      style={{ width: 8, height: 8, borderRadius: "50%", background: r.severity_color }}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold text-text">{r.title}</div>
                      <div className="mt-0.5 truncate text-xs text-muted">
                        {r.supplier} · {r.time}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-[12.5px] font-bold" style={{ color: r.severity_color }}>
                        {r.severity}
                      </div>
                      <div className="mt-[3px] text-[11px] text-muted">{r.impact}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : isLoading || !data ? (
        <div className="h-64 animate-pulse rounded-card border border-line bg-surface" />
      ) : (
        <>
          <div className="mb-1 flex items-center gap-3">
            <span
              className="rounded-md px-2.5 py-1 text-[11.5px] font-bold"
              style={{ background: `${data.severity_color}1f`, color: data.severity_color }}
            >
              {data.severity}
            </span>
            <span className="text-[12.5px] text-muted">
              Risk Score {data.score} · {data.time}
            </span>
          </div>
          <h1 className="mb-2 mt-2 text-[22px] font-extrabold text-text">{data.headline}</h1>
          {data.source_url ? (
            <a
              href={data.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-6 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-cyan hover:underline"
            >
              Verify at source{data.source ? ` — ${data.source}` : ""}
              <span aria-hidden>↗</span>
            </a>
          ) : (
            <div className="mb-6" />
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Left column */}
            <FadeUp className="flex flex-col gap-4">
              <div className="card">
                <div className="mb-3.5 text-[15px] font-bold text-text">Risk Score Breakdown</div>
                {data.factors.map((f) => (
                  <div key={f.label} className="mb-3">
                    <div className="mb-[7px] flex justify-between gap-2.5 text-[12.5px] text-muted">
                      <span>{f.label}</span>
                      <span className="font-semibold text-text">{f.value}</span>
                    </div>
                    <AnimatedBar
                      pct={f.value}
                      gradient="linear-gradient(90deg,#5b8def,#5b8def)"
                    />
                  </div>
                ))}
              </div>

              <div className="card">
                <div className="mb-2.5 text-[15px] font-bold text-text">AI Reasoning</div>
                <p className="text-[13px] leading-[1.7] text-muted">{data.reasoning}</p>
              </div>
            </FadeUp>

            {/* Right column */}
            <FadeUp delay={0.12} className="flex flex-col gap-4">
              <div className="card">
                <div className="mb-3.5 text-[15px] font-bold text-text">Event Chain</div>
                <div className="flex flex-col">
                  {data.chain.map((node, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#5b8def" }} />
                        {i < data.chain.length - 1 && (
                          <span style={{ width: 1.5, flex: 1, minHeight: 22, background: "rgba(148,163,184,0.2)" }} />
                        )}
                      </div>
                      <div className="pb-3.5 text-[12.5px] text-text">{node}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="mb-3.5 text-[15px] font-bold text-text">Predicted Impact</div>
                <div className="grid grid-cols-2 gap-3">
                  {data.impact.map((t) => (
                    <div key={t.label} className="rounded-control bg-inset p-3">
                      <div className="text-[11px] font-semibold text-muted">{t.label}</div>
                      <div className="mt-1 text-base font-extrabold text-text">{t.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </FadeUp>
          </div>

          <FadeUp delay={0.18}>
            <DependencyPaths riskId={riskId} />
          </FadeUp>

          <div className="mt-5 flex gap-3">
            <button
              onClick={() => router.push(`/simulator?risk=${riskId}`)}
              className="btn-primary px-5 py-3"
            >
              Run Scenario Simulator
            </button>
            <button onClick={() => setEmailOpen(true)} className="btn-ghost px-5 py-3">
              Generate Mitigation Email
            </button>
          </div>

          {emailOpen && <EmailModal riskId={riskId} onClose={() => setEmailOpen(false)} />}
        </>
      )}
    </AppShell>
  );
}
