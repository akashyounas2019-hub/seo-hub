import { getGoogleAccessToken } from "../src/lib/google/auth.ts";

async function testPropertyReport(propertyId) {
  const token = await getGoogleAccessToken([
    "https://www.googleapis.com/auth/analytics.readonly",
  ]);

  const cleanId = propertyId.replace("properties/", "");
  console.log(`Testing GA4 Property ID: ${cleanId}...`);

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${cleanId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      }),
    },
  );

  const status = res.status;
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log(`✅ SUCCESS for Property ${cleanId}!`);
    console.log("Report Data:", JSON.stringify(data, null, 2));
  } else {
    console.log(`Status ${status}:`, data?.error?.message || data);
  }
}

// Test common property IDs or args
const targetId = process.argv[2] || "342910482";
testPropertyReport(targetId);
