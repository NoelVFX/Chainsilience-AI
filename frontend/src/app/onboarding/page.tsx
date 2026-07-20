"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AmbientOrbs } from "@/components/AmbientOrbs";
import { GlobeMount } from "@/components/three/GlobeMount";
import { getToken } from "@/lib/api";
import { useOnboarding, useRegister } from "@/lib/hooks";

/**
 * Screen 2 — Company Onboarding. Collects the company profile that seeds the
 * Digital Twin. If the visitor has no session yet, a lightweight account is
 * provisioned first (Registration → Onboarding per the spec workflow).
 */
export default function OnboardingPage() {
  const router = useRouter();
  const register = useRegister();
  const onboarding = useOnboarding();
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    company_name: "Acme Semiconductor Inc.",
    industry: "Semiconductors",
    countries: "Taiwan, USA, Vietnam",
    risk_tolerance: "Balanced",
    primary_products: "Processor X200, Sensor Array M4",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleContinue() {
    setBusy(true);
    try {
      if (!getToken()) {
        // Provision a session for the new company, then complete onboarding.
        const slug = form.company_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        await register.mutateAsync({
          email: `founder-${Date.now()}@${slug || "company"}.chainsight.ai`,
          password: "chainsight",
          company_name: form.company_name,
        });
      }
      await onboarding.mutateAsync(form);
      router.push("/dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <AmbientOrbs variant="auth" />

      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        style={{ opacity: 0.4 }}
        aria-hidden
      >
        <div style={{ width: "min(760px, 94vw)", height: "min(760px, 94vw)" }}>
          <GlobeMount points={[]} backdrop />
        </div>
      </div>

      <div
        className="relative z-10 w-[720px] max-w-full rounded-panel border border-line bg-surface p-11"
        style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.45)" }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "linear-gradient(135deg,#22d3ee,#3b82f6)",
            }}
          />
          <div className="text-[17px] font-extrabold text-text">Chainsilience AI</div>
        </div>

        <div className="mt-6 text-2xl font-extrabold text-text">Set up your company</div>
        <div className="mb-6 text-[13px] text-muted">
          This builds your Digital Twin — the model of your supply chain we use to
          reason about risk.
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Company Name">
            <input
              className="panel-input"
              value={form.company_name}
              onChange={(e) => set("company_name", e.target.value)}
            />
          </Field>
          <Field label="Industry">
            <select
              className="panel-input"
              value={form.industry}
              onChange={(e) => set("industry", e.target.value)}
            >
              <option>Semiconductors</option>
              <option>Manufacturing</option>
              <option>Logistics</option>
              <option>Consumer Electronics</option>
            </select>
          </Field>
          <Field label="Countries of Operation">
            <input
              className="panel-input"
              value={form.countries}
              onChange={(e) => set("countries", e.target.value)}
            />
          </Field>
          <Field label="Risk Tolerance">
            <select
              className="panel-input"
              value={form.risk_tolerance}
              onChange={(e) => set("risk_tolerance", e.target.value)}
            >
              <option>Conservative</option>
              <option>Balanced</option>
              <option>Aggressive</option>
            </select>
          </Field>
        </div>

        <div className="mb-1.5 mt-[18px] text-xs font-semibold text-muted">
          Primary Products
        </div>
        <input
          className="panel-input"
          value={form.primary_products}
          onChange={(e) => set("primary_products", e.target.value)}
        />

        <div className="mb-2 mt-[18px] text-xs font-semibold text-muted">
          Supply Chain Data
        </div>
        <label className="dropzone block cursor-pointer rounded-panel border-[1.5px] border-dashed border-line-strong bg-inset p-[22px] text-center">
          <div className="text-[13px] font-semibold text-text">
            {fileName ? `Selected: ${fileName}` : "Drop CSV / Excel file here"}
          </div>
          <div className="mt-1 font-mono text-xs text-muted">
            suppliers.csv · factories.csv · inventory.csv
          </div>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </label>

        <button onClick={handleContinue} disabled={busy} className="btn-primary mt-6 w-full py-3.5">
          {busy ? "Building Digital Twin…" : "Build Digital Twin & Continue"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-muted">{label}</div>
      {children}
    </div>
  );
}
