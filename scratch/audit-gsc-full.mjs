import { getGoogleAccessToken } from "../src/lib/google/auth.ts";

function getIsoDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

async function runComprehensiveAudit() {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/webmasters.readonly"]);
  const siteUrl = "https://safaeewala.com/";

  async function queryGSC(startDate, endDate, dimensions = ["date"], dimensionFilterGroups = []) {
    const payload = {
      startDate,
      endDate,
      dimensions,
      rowLimit: 100
    };
    if (dimensionFilterGroups.length > 0) {
      payload.dimensionFilterGroups = dimensionFilterGroups;
    }
    const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return await res.json();
  }

  console.log("=== COMPREHENSIVE GSC DATA AUDIT FOR https://safaeewala.com/ ===");

  // Today is 2026-08-24. GSC typically has 2-3 days data lag.
  // Let's test different date ranges:
  // 7 days: 2026-08-15 to 2026-08-21 (or last 7 days available)
  // 14 days: 2026-08-08 to 2026-08-21
  // 28 days: 2026-07-25 to 2026-08-21
  // Last month (July 2026): 2026-07-01 to 2026-07-31

  const ranges = [
    { label: "Last 7 Days (Aug 15 - Aug 21, 2026)", start: getIsoDate(9), end: getIsoDate(3) },
    { label: "Last 14 Days (Aug 08 - Aug 21, 2026)", start: getIsoDate(16), end: getIsoDate(3) },
    { label: "Last 28 Days (Jul 25 - Aug 21, 2026)", start: getIsoDate(30), end: getIsoDate(3) },
    { label: "Last Month (Jul 01 - Jul 31, 2026)", start: "2026-07-01", end: "2026-07-31" },
  ];

  for (const r of ranges) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Range: ${r.label} [${r.start} to ${r.end}]`);
    const dateData = await queryGSC(r.start, r.end, ["date"]);
    const rows = dateData.rows || [];
    let totalClicks = 0;
    let totalImp = 0;
    let sumPos = 0;
    for (const row of rows) {
      totalClicks += row.clicks || 0;
      totalImp += row.impressions || 0;
      sumPos += (row.position || 0) * (row.impressions || 0);
    }
    const avgCtr = totalImp > 0 ? ((totalClicks / totalImp) * 100).toFixed(2) + "%" : "0.00%";
    const avgPos = totalImp > 0 ? (sumPos / totalImp).toFixed(1) : "0.0";
    console.log(`Summary: Total Clicks: ${totalClicks} | Total Impressions: ${totalImp} | Avg CTR: ${avgCtr} | Avg Position: ${avgPos} | (Days with data: ${rows.length})`);
  }

  // Top Queries in Last 28 Days
  console.log(`\n=== TOP QUERIES (Last 28 Days: ${getIsoDate(30)} to ${getIsoDate(3)}) ===`);
  const queryData = await queryGSC(getIsoDate(30), getIsoDate(3), ["query"]);
  const topQueries = (queryData.rows || []).slice(0, 15);
  console.table(topQueries.map(q => ({
    Query: q.keys[0],
    Clicks: q.clicks,
    Impressions: q.impressions,
    CTR: (q.ctr * 100).toFixed(2) + "%",
    Position: q.position.toFixed(1)
  })));

  // Top Pages in Last 28 Days
  console.log(`\n=== TOP PAGES (Last 28 Days) ===`);
  const pageData = await queryGSC(getIsoDate(30), getIsoDate(3), ["page"]);
  const topPages = (pageData.rows || []).slice(0, 10);
  console.table(topPages.map(p => ({
    Page: p.keys[0],
    Clicks: p.clicks,
    Impressions: p.impressions,
    CTR: (p.ctr * 100).toFixed(2) + "%",
    Position: p.position.toFixed(1)
  })));

  // Countries
  console.log(`\n=== TOP COUNTRIES (Last 28 Days) ===`);
  const countryData = await queryGSC(getIsoDate(30), getIsoDate(3), ["country"]);
  const topCountries = (countryData.rows || []).slice(0, 10);
  console.table(topCountries.map(c => ({
    Country: c.keys[0],
    Clicks: c.clicks,
    Impressions: c.impressions,
    CTR: (c.ctr * 100).toFixed(2) + "%",
    Position: c.position.toFixed(1)
  })));

  // Devices
  console.log(`\n=== DEVICES (Last 28 Days) ===`);
  const deviceData = await queryGSC(getIsoDate(30), getIsoDate(3), ["device"]);
  const devices = (deviceData.rows || []);
  console.table(devices.map(d => ({
    Device: d.keys[0],
    Clicks: d.clicks,
    Impressions: d.impressions,
    CTR: (d.ctr * 100).toFixed(2) + "%",
    Position: d.position.toFixed(1)
  })));
}

runComprehensiveAudit();
