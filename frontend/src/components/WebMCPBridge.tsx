"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { createTools } from "@/lib/webmcp/tools";

type Status = "pending" | "connected" | "unavailable";

/**
 * Registers Chainsilience AI's tools on the WebMCP surface so the user's agent can
 * drive the workspace. Mounted once, app-wide, inside the React Query provider.
 * Renders a small status badge so you can confirm the surface is live during a
 * demo. Set NEXT_PUBLIC_WEBMCP_BADGE=off to hide it.
 */
export function WebMCPBridge() {
  const qc = useQueryClient();
  const tools = useMemo(() => createTools(qc), [qc]);
  const [status, setStatus] = useState<Status>("pending");

  useEffect(() => {
    const mc = document.modelContext;
    if (!mc || typeof mc.registerTool !== "function") {
      setStatus("unavailable");
      return;
    }
    const unregisters = tools.map((tool) =>
      mc.registerTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: tool.execute,
      }),
    );
    setStatus("connected");
    return () => {
      for (const off of unregisters) if (typeof off === "function") off();
    };
  }, [tools]);

  if (process.env.NEXT_PUBLIC_WEBMCP_BADGE === "off") return null;

  const color = status === "connected" ? "#34d399" : "#64748b";
  const label =
    status === "connected"
      ? `WebMCP · ${tools.length} tools`
      : status === "unavailable"
        ? "WebMCP idle"
        : "WebMCP …";

  return (
    <div
      title="Tools exposed to your agent via document.modelContext"
      style={{
        position: "fixed",
        right: 14,
        bottom: 14,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 11px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: "#cbd5e1",
        background: "rgba(15,23,42,0.72)",
        border: `1px solid ${color}55`,
        backdropFilter: "blur(6px)",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
      {label}
    </div>
  );
}
