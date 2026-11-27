/**
 * Demo figures for the admin dashboard (lead KPI cards + "Lead performance" graph).
 *
 * These are illustrative numbers, not data from the backend. They are shown while
 * NEXT_PUBLIC_DEMO_DASHBOARD is not "false" (on by default). Set
 *   NEXT_PUBLIC_DEMO_DASHBOARD=false
 * in the frontend environment and rebuild to show the real workspace counts again.
 */

export const DEMO_DASHBOARD = process.env.NEXT_PUBLIC_DEMO_DASHBOARD !== "false";

/** 1048576 -> "10,48,576" (Indian grouping). */
export const formatCount = (n: number | string | null | undefined) =>
  Number(n || 0).toLocaleString("en-IN");

/** Compact axis label: 1250000 -> "12.5L", 45000 -> "45K". */
export const formatAxis = (n: number) => {
  if (n >= 1e7) return `${+(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${+(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
};

// Small deterministic "noise" so numbers look natural but stay stable between reloads.
const wobble = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x); // 0..1
};

/**
 * KPI card values. Every value is above 10 lakh and they stay consistent:
 * released (all time) > this month > new > today. They creep up through the day and month.
 */
export function demoKpis(now = new Date()) {
  const day = now.getDate();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const today = 10_18_400 + Math.round(minutes * 21.7);              // ~10.2L → ~10.5L during the day
  const thisMonth = 16_42_000 + day * 7_050 + Math.round(minutes * 2.1); // ~16.4L → ~18.6L, in line with the graph
  const newLeads = 12_36_900 + day * 9_420 + Math.round(minutes * 14.2);
  const released = 52_84_316 + day * 41_270 + Math.round(minutes * 21.7);
  return { leadsToday: today, leadsThisMonth: thisMonth, newLeads, releasedLeads: released };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "Lead performance" series for a range (1m / 3m / 6m / 1y / 2y). Monthly points rise every
 * month (with a natural wobble that never dips below the previous month); 1M shows weekly points.
 * `filterKey` (city / business / project) scales the series so switching filters changes it.
 */
export function demoPerformance(range: string, filterKey = "", now = new Date()) {
  let scale = 1;
  if (filterKey) {
    let h = 0;
    for (const ch of filterKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    scale = 0.18 + (h % 1000) / 1000 * 0.32; // a filtered slice: 18% – 50% of the total
  }

  if (range === "1m") {
    // 5 weekly points, ~3.4L → ~4.6L per week, rising.
    const data = [];
    let leads = 3_38_000;
    for (let w = 0; w < 5; w++) {
      leads += 18_000 + Math.round(wobble(w + 7) * 14_000);
      const l = Math.round(leads * scale);
      data.push({ period: `Week ${w + 1}`, leads: l, won: Math.round(l * (0.082 + w * 0.003)) });
    }
    return { data };
  }

  const months = range === "3m" ? 3 : range === "6m" ? 6 : range === "2y" ? 24 : 12;
  const data = [];
  // Ends at this month's level (~18L) and starts lower the further back the range goes.
  const end = 18_60_000;
  const start = end * (months >= 24 ? 0.34 : months >= 12 ? 0.52 : months >= 6 ? 0.72 : 0.86);
  let prev = 0;
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const t = (months - 1 - i) / (months - 1); // 0 → 1 across the range (months >= 3)
    const base = start + (end - start) * Math.pow(t, 1.15);
    let leads = Math.round(base * (0.985 + wobble(d.getFullYear() * 12 + d.getMonth()) * 0.03));
    if (leads <= prev) leads = prev + 9_000 + Math.round(wobble(i + 3) * 6_000); // always upward
    prev = leads;
    const l = Math.round(leads * scale);
    data.push({
      period: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      leads: l,
      won: Math.round(l * (0.074 + t * 0.022)), // win rate improving 7.4% → 9.6%
    });
  }
  return { data };
}
