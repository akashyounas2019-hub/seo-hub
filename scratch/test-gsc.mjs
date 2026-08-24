import { getGoogleAccessToken } from "../src/lib/google/auth.ts";

async function testGSC() {
  try {
    const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/webmasters.readonly"]);
    console.log("Token generated successfully.");

    // 1. Test fetching sites
    const sitesRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Sites HTTP Status:", sitesRes.status);
    const sitesData = await sitesRes.json();
    console.log("Sites Data:", JSON.stringify(sitesData, null, 2));

    // 2. Test search analytics for sc-domain:safaeewala.com and https://safaeewala.com/
    for (const siteUrl of ["sc-domain:safaeewala.com", "https://safaeewala.com/", "http://safaeewala.com/"]) {
      console.log(`\nTesting searchAnalytics for site: ${siteUrl}`);
      const saRes = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          startDate: "2026-07-20",
          endDate: "2026-08-20",
          dimensions: ["date"],
          rowLimit: 10
        })
      });
      console.log(`Status for ${siteUrl}:`, saRes.status);
      const saData = await saRes.json();
      console.log(`Response for ${siteUrl}:`, JSON.stringify(saData, null, 2));
    }
  } catch (err) {
    console.error("Error testing GSC:", err);
  }
}

testGSC();
