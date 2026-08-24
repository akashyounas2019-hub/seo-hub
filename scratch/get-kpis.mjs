import { getGoogleAccessToken } from "../src/lib/google/auth.ts";

function getIsoDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

async function printRanges() {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/webmasters.readonly"]);
  const siteUrl = "https://safaeewala.com/";

  async function queryGSC(startDate, endDate) {
    const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["date"]
      })
    });
    return await res.json();
  }

  const ranges = [
    { id: "7d", label: "7 Days (Aug 15 - Aug 21, 2026)", start: getIsoDate(9), end: getIsoDate(3) },
    { id: "14d", label: "14 Days (Aug 08 - Aug 21, 2026)", start: getIsoDate(16), end: getIsoDate(3) },
    { id: "28d", label: "28 Days (Jul 25 - Aug 21, 2026)", start: getIsoDate(30), end: getIsoDate(3) },
    { id: "last_month", label: "Last Month (Jul 01 - Jul 31, 2026)", start: "2026-07-01", end: "2026-07-31" },
  ];

  for (const r of ranges) {
    const data = await queryGSC(r.start, r.end);
    const rows = data.rows || [];
    let clicks = 0;
    let imp = 0;
    let sumPos = 0;
    for (const row of rows) {
      clicks += row.clicks || 0;
      imp += row.impressions || 0;
      sumPos += (row.position || 0) * (row.impressions || 0);
    }
    const ctr = imp > 0 ? ((clicks / imp) * 100).toFixed(2) : "0.00";
    const pos = imp > 0 ? (sumPos / imp).toFixed(1) : "0.0";
    console.log(JSON.stringify({
      range: r.label,
      start: r.start,
      end: r.end,
      days: rows.length,
      clicks,
      impressions: imp,
      ctr: `${ctr}%`,
      position: pos
    }, null, 2));
  }
}

printRanges();
