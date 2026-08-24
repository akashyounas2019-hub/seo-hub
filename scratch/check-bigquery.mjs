import { getGoogleAccessToken } from "../src/lib/google/auth.ts";

async function checkBigQuery() {
  try {
    const token = await getGoogleAccessToken([
      "https://www.googleapis.com/auth/bigquery",
      "https://www.googleapis.com/auth/bigquery.readonly",
      "https://www.googleapis.com/auth/cloud-platform"
    ]);
    const projectId = "gmb-safaeewala";

    console.log(`=== CHECKING BIGQUERY FOR PROJECT: ${projectId} ===`);

    // 1. List datasets
    const datasetsRes = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Datasets HTTP Status:", datasetsRes.status);
    const datasetsData = await datasetsRes.json();
    console.log("Datasets Response:", JSON.stringify(datasetsData, null, 2));

    if (datasetsData.datasets && datasetsData.datasets.length > 0) {
      for (const ds of datasetsData.datasets) {
        const datasetId = ds.datasetReference.datasetId;
        console.log(`\n--- Dataset: ${datasetId} ---`);
        const tablesRes = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const tablesData = await tablesRes.json();
        console.log("Tables in dataset:", JSON.stringify(tablesData, null, 2));
      }
    } else {
      console.log("No datasets found in project 'gmb-safaeewala'.");
    }

    // 2. Check scheduled queries / data transfer services
    const transferRes = await fetch(`https://bigquerydatatransfer.googleapis.com/v1/projects/${projectId}/locations/us/transferConfigs`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("\nData Transfer Configs Status (us):", transferRes.status);
    const transferData = await transferRes.json().catch(() => ({}));
    console.log("Transfer Configs (us):", JSON.stringify(transferData, null, 2));

    // Also check other regions or EU
    const transferResEu = await fetch(`https://bigquerydatatransfer.googleapis.com/v1/projects/${projectId}/locations/eu/transferConfigs`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("\nData Transfer Configs Status (eu):", transferResEu.status);
    const transferDataEu = await transferResEu.json().catch(() => ({}));
    console.log("Transfer Configs (eu):", JSON.stringify(transferDataEu, null, 2));

  } catch (err) {
    console.error("BigQuery Check Error:", err);
  }
}

checkBigQuery();
