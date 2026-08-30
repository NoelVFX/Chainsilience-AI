"use client";

import { useEffect, useState } from "react";

import { EarthLoader } from "@/components/EarthLoader";
import { ApiError } from "@/lib/api";
import { useCompany, useRebuildCompany } from "@/lib/hooks";

interface Props {
  open: boolean;
  onClose: () => void;
}

const EMPTY = {
  company_name: "",
  industry: "Semiconductors",
  countries: "",
  risk_tolerance: "Balanced",
  primary_products: "",
};

/**
 * "Update company data" — re-run the onboarding profile from inside the app
 * (no email/password, since the account is unchanged). Fields are prefilled
 * with the company's current values; Save rebuilds the Digital Twin and
 * re-creates the Neo4j knowledge graph from the edited profile.
 */
export function UpdateCompanyModal({ open, onClose }: Props) {
  const { data: company, isLoading } = useCompany(open);
  const rebuild = useRebuildCompany();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  // Seed the form with the company's current profile whenever it loads / reopens.
  useEffect(() => {
    if (company) {
      setForm({
        company_name: company.name,
        industry: company.industry,
        countries: company.countries,
        risk_tolerance: company.risk_tolerance,
        primary_products: company.primary_products,
      });
    }
  }, [company, open]);

  if (!open) return null;

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setError(null);
    try {
      await rebuild.mutateAsync(form);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update your company data.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(4,7,15,0.66)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-full rounded-panel border border-line bg-surface p-8"
        style={{ boxShadow: "0 24px 70px rgba(0,0,0,0.5), 0 0 60px rgba(34,211,238,0.06)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[18px] font-extrabold text-text">Update company data</h2>
            <p className="mt-1 text-[13px] text-muted">
              Edit your profile and supply chain, then rebuild the Digital Twin.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text" aria-label="Close">
            ✕
          </button>
        </div>

        {isLoading || !company ? (
          <div className="flex h-40 items-center justify-center">
            <EarthLoader px={34} />
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4">
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
              placeholder="e.g. Processor X200, Sensor Array M4"
            />

            <div
              className="mt-5 rounded-control border p-3.5 text-[12.5px]"
              style={{
                borderColor: "rgba(251,191,36,0.25)",
                background: "rgba(251,191,36,0.06)",
                color: "#e7ecf5",
              }}
            >
              Saving rebuilds your Digital Twin and re-creates the knowledge graph
              from this profile. Existing risks and pending actions will be reset.
            </div>

            {error && (
              <div className="mt-4 text-[13px] font-medium" style={{ color: "#f87171" }}>
                {error}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={save}
                disabled={rebuild.isPending}
                className="btn-primary flex min-h-[46px] flex-1 items-center justify-center py-3 disabled:opacity-60"
              >
                {rebuild.isPending ? <EarthLoader px={24} /> : "Save & rebuild twin"}
              </button>
              <button
                onClick={onClose}
                disabled={rebuild.isPending}
                className="flex-1 rounded-control border py-3 text-sm font-semibold text-text"
                style={{ borderColor: "rgba(148,163,184,0.25)", background: "rgba(148,163,184,0.06)" }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
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
