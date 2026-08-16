/**
 * G6 — Network-wide plugin upgrade. Fully automatic.
 *
 * Usage:
 *   npm run plugin:publish                              # build from source, version-gate, publish to all sites
 *   npm run plugin:publish -- --site=example.com
 *   npm run plugin:publish -- --zip=<path> --force      # override auto-build + skip version gate
 *
 * Default flow (nightly cron-friendly):
 *  1. Run scripts/build-plugin-zip.sh → writes ~/Desktop/gyl-bookings-vX.Y.Z.zip
 *  2. Compare X.Y.Z against ~/.config/gyl/last-published-version
 *  3. If unchanged → exit 0 silently. If newer → queue fix:plugin_upgrade for
 *     every site, then record the new version.
 *  4. Worker drains the queue via the plugin's HMAC self-update endpoint.
 *
 * Zero API spend. Zero human action after `git commit` on the plugin.
 */
import { ensureSchema, db } from "../db/client";
import { apiKeys, claudeJobs, sites } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execSync } from "node:child_process";

const STATE_FILE = `${process.env.HOME ?? ""}/.config/gyl/last-published-version`;

function readLastPublishedVersion(): string | null {
  if (!existsSync(STATE_FILE)) return null;
  return readFileSync(STATE_FILE, "utf8").trim() || null;
}

function writeLastPublishedVersion(v: string): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, v + "\n");
}

function buildZip(): { zipPath: string; version: string } {
  // npm run sets cwd to the project root.
  const builder = resolve(process.cwd(), "scripts", "build-plugin-zip.sh");
  if (!existsSync(builder)) {
    throw new Error(`zip builder not found: ${builder}`);
  }
  const zipPath = execSync(`bash "${builder}"`, { encoding: "utf8" }).trim();
  const m = zipPath.match(/gyl-bookings-v([\d.]+)\.zip$/);
  if (!m) throw new Error(`could not parse version from output: ${zipPath}`);
  return { zipPath, version: m[1] };
}

async function main() {
  await ensureSchema();

  const args = process.argv.slice(2);
  let zip = (args.find((a) => a.startsWith("--zip="))?.split("=")[1] ?? "").replace(/^~/, process.env.HOME ?? "");
  const siteFilter = args.find((a) => a.startsWith("--site="))?.split("=")[1] ?? null;
  const force = args.includes("--force");
  let version: string | null = null;

  if (!zip) {
    // No --zip: auto-build from source.
    const built = buildZip();
    zip = built.zipPath;
    version = built.version;
    console.log(`[publish-plugin] auto-built ${zip} (v${version})`);
  }
  if (!existsSync(zip)) {
    console.error(`[publish-plugin] zip not found: ${zip}`);
    process.exit(1);
  }
  // Parse version from explicit zip path if we didn't build.
  if (!version) {
    const m = zip.match(/gyl-bookings-v?([\d.]+)\.zip$/);
    version = m?.[1] ?? null;
  }

  // Version gate: skip publish when nothing changed.
  if (version && !force && !siteFilter) {
    const last = readLastPublishedVersion();
    if (last === version) {
      console.log(`[publish-plugin] v${version} already published network-wide — nothing to do`);
      process.exit(0);
    }
    console.log(`[publish-plugin] last=${last ?? "(none)"} → new=${version}`);
  }

  const sha256 = createHash("sha256").update(readFileSync(resolve(zip))).digest("hex");
  console.log(`[publish-plugin] zip=${zip} sha256=${sha256.slice(0, 16)}…`);

  const all = await db().select().from(sites);
  const targets = siteFilter ? all.filter((s) => s.domain === siteFilter) : all;
  if (targets.length === 0) {
    console.error("[publish-plugin] no matching sites");
    process.exit(1);
  }

  let queued = 0;
  for (const s of targets) {
    const [key] = await db()
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.siteId, s.id), eq(apiKeys.active, true)))
      .limit(1);
    if (!key) {
      console.warn(`[publish-plugin] ${s.domain}: no active HMAC key — SKIP`);
      continue;
    }
    await db().insert(claudeJobs).values({
      kind: "fix:plugin_upgrade",
      title: `Plugin upgrade · ${s.name}`,
      input: {
        siteSlug: s.slug,
        zipPath: zip,
        sha256,
        hmacKeyId: key.keyId,
        hmacSecret: key.secret,
        idempotencyKey: randomUUID(),
      },
      status: "pending",
      priority: "high",
      preferWorker: "mac",
      createdBy: null,
    });
    queued++;
    console.log(`[publish-plugin] ${s.domain}: queued`);
  }

  console.log(`[publish-plugin] done — queued ${queued}/${targets.length}`);

  // Record the published version so nightly runs become no-ops once landed.
  if (version && !siteFilter && queued > 0) {
    writeLastPublishedVersion(version);
    console.log(`[publish-plugin] recorded last-published-version=${version}`);
  }
}

main().catch((err) => {
  console.error("[publish-plugin] fatal:", err);
  process.exit(1);
});
