"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AmbientOrbs } from "@/components/AmbientOrbs";
import { clearToken, getToken } from "@/lib/api";
import { useBillingStatus } from "@/lib/hooks";

interface NavItem {
  label: string;
  href: string;
  dot: string;
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", dot: "#22d3ee" },
  { label: "Risk Detail", href: "/risk/1", dot: "#f87171" },
  { label: "Scenario Simulator", href: "/simulator", dot: "#fbbf24" },
  { label: "Action Center", href: "/action-center", dot: "#34d399" },
];

/**
 * Persistent app shell: ambient background, 240px sidebar with active/hover
 * states, and a scrollable main content area. Guards routes client-side.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [hasSession, setHasSession] = useState(false);
  const billing = useBillingStatus(hasSession);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setHasSession(true);
  }, [router]);

  const isActive = (href: string) =>
    href.startsWith("/risk") ? pathname.startsWith("/risk") : pathname.startsWith(href);

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      <AmbientOrbs variant="app" />

      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-line bg-sidebar px-4 py-[22px]">
        <div className="px-2 pb-[22px]">
          <div className="flex items-center gap-2.5">
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "linear-gradient(135deg,#22d3ee,#3b82f6)",
                flexShrink: 0,
              }}
            />
            <div className="text-[15px] font-extrabold text-text">Chainsilience AI</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className="nav-item flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-left text-[13.5px] transition-all"
                style={{
                  color: active ? "#e7ecf5" : "#8b98b3",
                  fontWeight: active ? 600 : 500,
                  background: active ? "rgba(34,211,238,0.08)" : "transparent",
                  border: active
                    ? "1px solid rgba(34,211,238,0.25)"
                    : "1px solid transparent",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: item.dot,
                    flexShrink: 0,
                    boxShadow: `0 0 6px ${item.dot}`,
                  }}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-line pt-4">
          <button
            onClick={() => router.push("/billing")}
            className="mb-1 flex w-full items-center justify-between rounded-[10px] px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
          >
            <span>
              <span className="block text-[13px] font-semibold text-text">Plan &amp; Billing</span>
              <span className="mt-0.5 block text-[11px] capitalize text-muted">
                {billing.data?.plan ?? "Loading plan…"}
              </span>
            </span>
            <span className="text-xs text-muted">→</span>
          </button>
          <button
            onClick={() => {
              clearToken();
              router.replace("/login");
            }}
            className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[13px] text-muted hover:text-text"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-10 pb-16 pt-[30px]">{children}</main>

      <style jsx>{`
        .nav-item:hover {
          color: #e7ecf5 !important;
        }
      `}</style>
    </div>
  );
}
