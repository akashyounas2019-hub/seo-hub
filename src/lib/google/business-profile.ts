import { getGoogleAccessToken } from "./auth";

const GBP_SCOPE = [
  "https://www.googleapis.com/auth/business.manage",
];

export async function fetchGBPAccounts() {
  const token = await getGoogleAccessToken(GBP_SCOPE);
  const res = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GBP accounts query failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.accounts || [];
}

export async function fetchGBPLocations(accountId: string) {
  const token = await getGoogleAccessToken(GBP_SCOPE);
  const cleanAccountId = accountId.startsWith("accounts/") ? accountId : `accounts/${accountId}`;
  const res = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${cleanAccountId}/locations?readMask=name,title,storefrontAddress,websiteUri,phoneNumbers`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GBP locations query failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.locations || [];
}

// Real customer reviews via the (legacy but still-live) Google My Business
// API v4 -- the newer Business Profile APIs split out account/location
// management but reviews still live here. Requires the service account's
// GCP project to have "My Business API" enabled and the account to have
// granted it access; if not, this throws and the caller shows an honest
// "not available" state instead of inventing reviewer names.
export async function fetchGBPReviews(accountId: string, locationId: string) {
  const token = await getGoogleAccessToken(GBP_SCOPE);
  const cleanAccountId = accountId.startsWith("accounts/") ? accountId : `accounts/${accountId}`;
  const cleanLocationId = locationId.includes("/") ? locationId.split("/").pop() : locationId;
  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/${cleanAccountId}/locations/${cleanLocationId}/reviews?pageSize=20`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GBP reviews query failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return {
    reviews: data.reviews || [],
    averageRating: data.averageRating,
    totalReviewCount: data.totalReviewCount,
  };
}

const PERFORMANCE_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_DIRECTION_REQUESTS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
];

// Real Business Profile Performance API -- daily metric time series for the
// last N days. Requires "Business Profile Performance API" enabled on the
// service account's GCP project.
export async function fetchGBPPerformance(locationId: string, days = 84) {
  const token = await getGoogleAccessToken(GBP_SCOPE);
  const cleanLocationId = locationId.includes("/") ? locationId.split("/").pop() : locationId;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);

  const params = new URLSearchParams();
  for (const m of PERFORMANCE_METRICS) params.append("dailyMetrics", m);
  params.set("dailyRange.start_date.year", String(start.getFullYear()));
  params.set("dailyRange.start_date.month", String(start.getMonth() + 1));
  params.set("dailyRange.start_date.day", String(start.getDate()));
  params.set("dailyRange.end_date.year", String(end.getFullYear()));
  params.set("dailyRange.end_date.month", String(end.getMonth() + 1));
  params.set("dailyRange.end_date.day", String(end.getDate()));

  const res = await fetch(
    `https://businessprofileperformance.googleapis.com/v1/locations/${cleanLocationId}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GBP performance query failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.multiDailyMetricTimeSeries || [];
}

// Real top search queries the business showed up for -- Business Profile
// Performance API's search-keywords endpoint (separate from the metrics
// time series above, monthly granularity only).
export async function fetchGBPSearchKeywords(locationId: string) {
  const token = await getGoogleAccessToken(GBP_SCOPE);
  const cleanLocationId = locationId.includes("/") ? locationId.split("/").pop() : locationId;
  const now = new Date();
  const monthsAgo = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const params = new URLSearchParams();
  params.set("monthlyRange.start_month.year", String(monthsAgo.getFullYear()));
  params.set("monthlyRange.start_month.month", String(monthsAgo.getMonth() + 1));
  params.set("monthlyRange.end_month.year", String(now.getFullYear()));
  params.set("monthlyRange.end_month.month", String(now.getMonth() + 1));

  const res = await fetch(
    `https://businessprofileperformance.googleapis.com/v1/locations/${cleanLocationId}/searchkeywords/impressions/monthly?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GBP search keywords query failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.searchKeywordsCounts || [];
}
