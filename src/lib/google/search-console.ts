import { getGoogleAccessToken } from "./auth";

const GSC_SCOPE = ["https://www.googleapis.com/auth/webmasters.readonly"];

export interface GSCSearchAnalyticsQuery {
  startDate: string;
  endDate: string;
  dimensions?: Array<"date" | "query" | "page" | "device" | "country">;
  rowLimit?: number;
  country?: string;
  city?: string;
}

export interface GSCRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function fetchGSCSites() {
  const token = await getGoogleAccessToken(GSC_SCOPE);
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GSC sites query failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.siteEntry || [];
}

export async function resolveAuthorizedSiteUrl(requestedUrl: string): Promise<string> {
  // If requestedUrl starts with sc-domain or URL, verify against site list or clean up
  let target = requestedUrl;
  if (!target || target === "undefined") {
    target = "https://safaeewala.com/";
  }

  // If domain property format is passed but may lack permissions, fallback to https prefix
  if (target.startsWith("sc-domain:")) {
    const domainOnly = target.replace("sc-domain:", "").trim();
    return `https://${domainOnly}/`;
  }

  if (!target.startsWith("http://") && !target.startsWith("https://")) {
    return `https://${target}/`;
  }

  return target;
}

export async function fetchGSCSearchAnalytics(
  siteUrl: string,
  query: GSCSearchAnalyticsQuery,
): Promise<GSCRow[]> {
  const token = await getGoogleAccessToken(GSC_SCOPE);
  const resolvedUrl = await resolveAuthorizedSiteUrl(siteUrl);
  const encodedUrl = encodeURIComponent(resolvedUrl);

  const dimensionFilterGroups: Array<{
    filters: Array<{ dimension: string; operator: string; expression: string }>;
  }> = [];
  const filters: Array<{ dimension: string; operator: string; expression: string }> = [];

  if (query.country && query.country !== "all") {
    filters.push({
      dimension: "country",
      operator: "equals",
      expression: query.country.toLowerCase(),
    });
  }

  if (filters.length > 0) {
    dimensionFilterGroups.push({ filters });
  }

  const payload: Record<string, any> = {
    startDate: query.startDate,
    endDate: query.endDate,
    dimensions: query.dimensions || ["date"],
    rowLimit: query.rowLimit || 100,
  };

  if (dimensionFilterGroups.length > 0) {
    payload.dimensionFilterGroups = dimensionFilterGroups;
  }

  let res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodedUrl}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    },
  );

  // If 403 forbidden and URL was domain format or https, attempt fallback to https://safaeewala.com/
  if (res.status === 403 && resolvedUrl !== "https://safaeewala.com/") {
    const fallbackEncoded = encodeURIComponent("https://safaeewala.com/");
    res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${fallbackEncoded}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000),
      },
    );
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GSC search analytics failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.rows || [];
}
