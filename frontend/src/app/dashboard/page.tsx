"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { DisruptionMap } from "@/components/DisruptionMap";
import { EarthLoader } from "@/components/EarthLoader";
import { useDashboard, useIngestNews } from "@/lib/hooks";

/** Screen 3 — Dashboard: KPI row, Top Risks, disruption map, news, actions. */
export default function DashboardPage() {
  const router = useRouter();
  const { data, isLoading } = useDashboard();
  const ingest = useIngestNews();

  return (
    <AppShell>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Dashboard</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Real-time view of global disruptions affecting your supply chain
          </p>
        </div>
        <button
          onClick={() => ingest.mutate()}
          disabled={ingest.isPending}
          className="btn-ghost px-4 py-2"
          style={{ color: "#22d3ee", borderColor: "rgba(34,211,238,0.3)", background: "rgba(34,211,238,0.1)" }}
        >
          {ingest.isPending ? "Scanning news…" : "↻ Ingest live news"}
        </button>
      </div>

      {ingest.data && (
        <div className="mb-4 rounded-control border border-line bg-inset px-4 py-2.5 text-[12.5px] text-muted">
          {ingest.data.message}
        </div>
      )}

      {isLoading || !data ? (
        <SkeletonDashboard />
      ) : (
        <>
          {/* KPI row */}
          <div className="mb-[22px] grid grid-cols-4 gap-4">
            {data.kpis.map((k, i) => (
              <motion.div
                key={k.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.08, ease: "easeOut" }}
                className="tilt-card rounded-card border border-line bg-surface p-5"
              >
                <div className="text-xs font-semibold text-muted">{k.label}</div>
                <div className="mt-2 text-[28px] font-extrabold text-text">{k.value}</div>
                <div className="mt-1 text-xs text-muted">{k.sub}</div>
              </motion.div>
            ))}
          </div>

          {/* Top Risks + Map */}
          <div className="mb-4 grid grid-cols-[2.3fr_1fr] gap-4">
            <div className="card">
              <div className="mb-3.5 text-[15px] font-bold text-text">Top Risks</div>
              <div className="flex flex-col">
                {data.risks.map((r) => (
                  <div
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
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="mb-3.5 text-[15px] font-bold text-text">Global Disruption Map</div>
              <DisruptionMap points={data.map_points} />
            </div>
          </div>

          {/* News + Recommended Actions */}
          <div className="grid grid-cols-[1.6fr_1fr] gap-4">
            <div className="card">
              <div className="mb-3.5 text-[15px] font-bold text-text">Recent News</div>
              <div className="flex flex-col gap-3">
                {data.news.map((n) => {
                  const clickable = Boolean(n.url);
                  const Row = (
                    <>
                      <div>
                        <div className="text-[13px] font-medium text-text">
                          {n.title}
                          {clickable && <span className="ml-1.5 text-[11px] text-cyan">↗</span>}
                        </div>
                        <div className="mt-[3px] text-[11.5px] text-muted">{n.source}</div>
                      </div>
                      <div className="whitespace-nowrap text-[11.5px] text-muted">{n.time}</div>
                    </>
                  );
                  return clickable ? (
                    <a
                      key={n.id}
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="news-hover flex justify-between gap-3 rounded-lg border-b border-line p-2 no-underline"
                    >
                      {Row}
                    </a>
                  ) : (
                    <div
                      key={n.id}
                      className="news-hover flex justify-between gap-3 rounded-lg border-b border-line p-2"
                    >
                      {Row}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card flex flex-col">
              <div className="mb-3.5 text-[15px] font-bold text-text">Recommended Actions</div>
              <div className="flex-1 text-[12.5px] leading-[1.7] text-muted">
                {data.actions_summary}
              </div>
              <button
                onClick={() => router.push("/action-center")}
                className="mt-3.5 rounded-control border py-2.5 text-[13px] font-bold"
                style={{
                  background: "rgba(34,211,238,0.1)",
                  borderColor: "rgba(34,211,238,0.3)",
                  color: "#22d3ee",
                }}
              >
                Open Action Center
              </button>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function SkeletonDashboard() {
  return (
    <div>
      <div className="mb-8 flex justify-center pt-10">
        <EarthLoader px={96} label="Loading supply-chain intelligence…" />
      </div>
      <div className="animate-pulse">
        <div className="mb-[22px] grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[104px] rounded-card border border-line bg-surface" />
          ))}
        </div>
        <div className="grid grid-cols-[2.3fr_1fr] gap-4">
          <div className="h-[300px] rounded-card border border-line bg-surface" />
          <div className="h-[300px] rounded-card border border-line bg-surface" />
        </div>
      </div>
    </div>
  );
}
