"use client";

import { useRiskPaths, type DependencyPathNode } from "@/lib/hooks";

// Node-type accent colors (match the twin/graph vocabulary).
const TYPE_COLOR: Record<string, string> = {
  supplier: "#f87171",
  component: "#fbbf24",
  product: "#5b8def",
  factory: "#a78bfa",
  warehouse: "#a78bfa",
  port: "#34d399",
  customer: "#60a5fa",
  route: "#94a3b8",
};

/**
 * Supply-Chain Dependency Paths — every downstream path from the disrupted
 * supplier to the products/customers it feeds, computed by the Neo4j knowledge
 * graph (Cypher) with an in-memory fallback. A badge shows which engine ran.
 */
export function DependencyPaths({ riskId }: { riskId: number }) {
  const { data, isLoading } = useRiskPaths(riskId);

  return (
    <div className="card mt-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="text-[15px] font-bold text-text">Supply-Chain Dependency Paths</div>
        {data && <SourceBadge source={data.source} />}
      </div>
      <p className="mb-4 text-[12px] text-muted">
        Downstream paths from the disrupted supplier through the components, products, sites
        and customers that depend on it.
      </p>

      {isLoading ? (
        <div className="h-16 animate-pulse rounded-control bg-inset" />
      ) : !data || data.paths.length === 0 ? (
        <div className="rounded-control bg-inset p-4 text-[12.5px] text-muted">
          No downstream dependency paths were found for this supplier in the graph.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {data.paths.map((p, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-control bg-inset p-3"
            >
              {p.nodes.map((n, j) => (
                <span key={`${n.key}-${j}`} className="flex items-center gap-1.5">
                  <NodePill node={n} />
                  {j < p.nodes.length - 1 && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      <span aria-hidden>→</span>
                      {p.relationships[j] && <span>{p.relationships[j].toLowerCase()}</span>}
                    </span>
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NodePill({ node }: { node: DependencyPathNode }) {
  const color = TYPE_COLOR[node.type] ?? "#94a3b8";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold text-text"
      style={{ background: `${color}1a`, border: `1px solid ${color}55` }}
      title={node.type}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {node.name}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const neo = source === "neo4j";
  const label = neo ? "via Neo4j" : source === "in_memory" ? "computed in-app" : "unavailable";
  const color = neo ? "#34d399" : "#94a3b8";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
      style={{ color, background: `${color}1a`, border: `1px solid ${color}44` }}
    >
      {label}
    </span>
  );
}
