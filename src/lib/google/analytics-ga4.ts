import { getGoogleAccessToken } from "./auth";

const GA4_SCOPE = ["https://www.googleapis.com/auth/analytics.readonly"];

export interface GA4ReportQuery {
  propertyId: string;
  startDate: string;
  endDate: string;
  metrics: string[];
  dimensions?: string[];
}

export async function fetchGA4Report(query: GA4ReportQuery) {
  const token = await getGoogleAccessToken(GA4_SCOPE);
  const propertyId = query.propertyId.replace("properties/", "");

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: query.startDate, endDate: query.endDate }],
        metrics: query.metrics.map((m) => ({ name: m })),
        dimensions: (query.dimensions || []).map((d) => ({ name: d })),
      }),
      signal: AbortSignal.timeout(4000),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GA4 report query failed (${res.status}): ${err}`);
  }

  return res.json();
}
