import { fetchGSCSearchAnalytics, fetchGSCSites } from "../src/lib/google/search-console.ts";
import { getBigQueryStatus } from "../src/lib/google/bigquery.ts";

async function testApiData() {
  console.log("Testing search console and BigQuery backend integration...");
  const siteUrl = "https://safaeewala.com/";
  const startDate = "2026-07-25";
  const endDate = "2026-08-21";

  const [sites, dateRows, queryRows, pageRows, deviceRows, countryRows, bqStatus] = await Promise.all([
    fetchGSCSites(),
    fetchGSCSearchAnalytics(siteUrl, { startDate, endDate, dimensions: ["date"] }),
    fetchGSCSearchAnalytics(siteUrl, { startDate, endDate, dimensions: ["query"], rowLimit: 10 }),
    fetchGSCSearchAnalytics(siteUrl, { startDate, endDate, dimensions: ["page"], rowLimit: 10 }),
    fetchGSCSearchAnalytics(siteUrl, { startDate, endDate, dimensions: ["device"] }),
    fetchGSCSearchAnalytics(siteUrl, { startDate, endDate, dimensions: ["country"], rowLimit: 10 }),
    getBigQueryStatus("gmb-safaeewala"),
  ]);

  console.log("Sites found:", sites.map(s => s.siteUrl));
  console.log(`Date rows count: ${dateRows.length}`);
  let totalClicks = 0;
  let totalImp = 0;
  for (const r of dateRows) {
    totalClicks += r.clicks;
    totalImp += r.impressions;
  }
  console.log(`Total Clicks: ${totalClicks}, Total Impressions: ${totalImp}`);
  console.log("Top Query:", queryRows[0]);
  console.log("Top Page:", pageRows[0]);
  console.log("Devices:", deviceRows);
  console.log("Top Country:", countryRows[0]);
  console.log("BigQuery Status:", bqStatus);
}

testApiData();
