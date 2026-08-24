import { getGoogleAccessToken } from "../src/lib/google/auth.ts";

async function queryBigQueryTables() {
  const token = await getGoogleAccessToken([
    "https://www.googleapis.com/auth/bigquery",
    "https://www.googleapis.com/auth/cloud-platform"
  ]);
  const projectId = "gmb-safaeewala";

  async function runQuery(sql) {
    const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: sql,
        useLegacySql: false
      })
    });
    return await res.json();
  }

  console.log("=== EXPORT LOG ===");
  const exportLogRes = await runQuery("SELECT * FROM `gmb-safaeewala.searchconsole.ExportLog` LIMIT 10");
  console.log("ExportLog rows:", exportLogRes.rows ? exportLogRes.rows.map(r => r.f.map(c => c.v)) : exportLogRes);

  console.log("\n=== DATA DATE SUMMARY (searchdata_site_impression) ===");
  const dateSummaryRes = await runQuery(`
    SELECT
      data_date,
      COUNT(*) as rows_count,
      SUM(clicks) as total_clicks,
      SUM(impressions) as total_impressions,
      ROUND(AVG(sum_top_position / impressions), 1) as avg_position
    FROM \`gmb-safaeewala.searchconsole.searchdata_site_impression\`
    GROUP BY data_date
    ORDER BY data_date DESC
    LIMIT 30
  `);
  if (dateSummaryRes.rows) {
    console.table(dateSummaryRes.rows.map(r => ({
      Date: r.f[0].v,
      Rows: r.f[1].v,
      Clicks: r.f[2].v,
      Impressions: r.f[3].v,
      AvgPos: r.f[4].v
    })));
  } else {
    console.log("Date summary res:", JSON.stringify(dateSummaryRes, null, 2));
  }

  console.log("\n=== TOP QUERIES IN BIGQUERY ===");
  const topKwRes = await runQuery(`
    SELECT
      query,
      SUM(clicks) as clicks,
      SUM(impressions) as impressions,
      ROUND(SUM(clicks) / NULLIF(SUM(impressions), 0) * 100, 2) as ctr,
      ROUND(AVG(sum_top_position / impressions), 1) as avg_pos
    FROM \`gmb-safaeewala.searchconsole.searchdata_site_impression\`
    GROUP BY query
    ORDER BY clicks DESC, impressions DESC
    LIMIT 15
  `);
  if (topKwRes.rows) {
    console.table(topKwRes.rows.map(r => ({
      Query: r.f[0].v,
      Clicks: r.f[1].v,
      Impressions: r.f[2].v,
      CTR: r.f[3].v + "%",
      Pos: r.f[4].v
    })));
  }

  console.log("\n=== URL IMPRESSIONS SAMPLE ===");
  const urlRes = await runQuery(`
    SELECT
      url,
      SUM(clicks) as clicks,
      SUM(impressions) as impressions
    FROM \`gmb-safaeewala.searchconsole.searchdata_url_impression\`
    GROUP BY url
    ORDER BY clicks DESC
    LIMIT 10
  `);
  if (urlRes.rows) {
    console.table(urlRes.rows.map(r => ({
      URL: r.f[0].v,
      Clicks: r.f[1].v,
      Impressions: r.f[2].v
    })));
  }
}

queryBigQueryTables();
