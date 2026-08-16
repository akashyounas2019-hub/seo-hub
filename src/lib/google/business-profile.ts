import { getGoogleAccessToken } from "./auth";

const GBP_SCOPE = [
  "https://www.googleapis.com/auth/business.manage",
];

export async function fetchGBPAccounts() {
  const token = await getGoogleAccessToken(GBP_SCOPE);
  const res = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
    headers: { Authorization: `Bearer ${token}` },
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
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GBP locations query failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.locations || [];
}
