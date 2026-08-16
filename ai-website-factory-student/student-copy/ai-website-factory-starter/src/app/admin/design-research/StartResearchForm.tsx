"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startResearchAction } from "@/app/actions/design-research";
import { PrimaryCta } from "@/components/ui/ObsidianAtoms";
import { cn } from "@/lib/utils";

const COUNTRIES = [
  "United Arab Emirates",
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "India",
  "Saudi Arabia",
  "Qatar",
  "Bahrain",
  "Kuwait",
  "Oman",
  "Singapore",
  "Malaysia",
  "South Africa",
  "Nigeria",
  "Egypt",
  "Brazil",
  "Mexico",
  "Italy",
  "Spain",
  "Netherlands",
  "Sweden",
  "Norway",
  "Denmark",
  "Japan",
  "South Korea",
  "China",
  "Philippines",
  "Indonesia",
  "Thailand",
  "New Zealand",
  "Ireland",
  "Pakistan",
  "Turkey",
  "Poland",
  "Portugal",
  "Belgium",
  "Switzerland",
];

/** Niche keys mirror VALID_NICHES in the action. */
const NICHES: Array<{ key: string; label: string; description: string }> = [
  { key: "cleaning", label: "Cleaning Services", description: "Residential & commercial cleaning, deep cleaning, maid services" },
  { key: "restaurant", label: "Restaurant", description: "Dining, cafés, fast food, fine dining, food delivery" },
  { key: "local_service", label: "Local Service", description: "Plumbing, electrical, HVAC, handyman, general contractors" },
  { key: "healthcare", label: "Healthcare / Dental", description: "Clinics, dental practices, physiotherapy, medical centers" },
  { key: "fitness", label: "Fitness / Wellness", description: "Gyms, yoga studios, personal training, spas" },
  { key: "legal", label: "Legal / Professional", description: "Law firms, accounting, consulting, professional services" },
  { key: "home_services", label: "Home Services", description: "Landscaping, pest control, moving, renovation" },
  { key: "food_hospitality", label: "Food / Hospitality", description: "Catering, hotels, event venues, bakeries" },
  { key: "beauty", label: "Beauty / Salon", description: "Hair salons, barbershops, nail salons, skincare" },
  { key: "other", label: "Other", description: "Any other business niche" },
];

export function StartResearchForm() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [country, setCountry] = useState("United Arab Emirates");
  const [city, setCity] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) => {
    setError(null);
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const submit = () => {
    if (selected.length === 0) {
      setError("Pick at least one niche.");
      return;
    }
    setError(null);
    const market = [city.trim(), country].filter(Boolean).join(", ") || "anywhere";
    start(async () => {
      try {
        const { runId } = await startResearchAction({ market, niches: selected });
        router.push(`/admin/design-research/${runId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the run.");
      }
    });
  };

  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-surface p-5">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--border-strong), transparent)",
        }}
      />
      <h2 className="text-base font-medium text-text">Start a research run</h2>
      <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-text-muted">
        Find ~10 high-performing sites in your target market, screenshot every section,
        and rank them by design quality and traffic.
      </p>

      <div className="mt-4 space-y-5">
        {/* Country + City row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
          <label className="block flex-1">
            <span className="text-xs font-semibold uppercase tracking-[0.10em] text-text-faint">
              Country
            </span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text focus-visible:border-border-strong focus-visible:outline-none"
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="block flex-1">
            <span className="text-xs font-semibold uppercase tracking-[0.10em] text-text-faint">
              City
            </span>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Dubai, Abu Dhabi"
              className="mt-1.5 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-faint focus-visible:border-border-strong focus-visible:outline-none"
            />
            <span className="mt-1 block text-xs text-text-faint">
              Optional — leave blank for country-wide inspiration.
            </span>
          </label>
        </div>

        {/* Niche selection — prominent grid */}
        <div>
          <span className="text-sm font-semibold text-text">
            Select your niche
          </span>
          <p className="mt-0.5 text-xs text-text-muted">
            Pick one or more business niches to focus the research on.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {NICHES.map((n) => {
              const on = selected.includes(n.key);
              return (
                <button
                  key={n.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(n.key)}
                  className={cn(
                    "flex flex-col items-start rounded-lg border px-3.5 py-3 text-left transition",
                    on
                      ? "border-accent bg-accent-tint ring-1 ring-accent/30"
                      : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
                  )}
                >
                  <span className={cn(
                    "text-sm font-medium",
                    on ? "text-accent" : "text-text",
                  )}>
                    {n.label}
                  </span>
                  <span className="mt-0.5 text-xs text-text-faint">{n.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error ? (
          <p className="text-xs text-danger">{error}</p>
        ) : null}

        <div className="flex items-center gap-3 pt-1">
          <PrimaryCta type="button" onClick={submit} disabled={pending}>
            {pending ? "Starting…" : "Start Research"}
          </PrimaryCta>
          {selected.length > 0 ? (
            <span className="text-xs text-text-faint">
              {selected.length} niche{selected.length === 1 ? "" : "s"} selected
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
