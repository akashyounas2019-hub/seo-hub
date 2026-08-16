#!/usr/bin/env node
/**
 * GYL Platform — Claude Code worker.
 *
 * Runs on the operator's Mac. Polls the portal for queued claude_jobs,
 * dispatches each job's prompt to the local `claude` CLI, captures the
 * Markdown output, and posts it back.
 *
 * Why this exists: heavy research + design tasks would burn through the
 * Anthropic API budget. Running them locally via Claude Code uses the
 * operator's subscription — effectively unlimited for our purposes.
 *
 * Usage:
 *   GYL_PORTAL_URL=http://localhost:3001 \
 *   GYL_WORKER_SECRET=<from /admin/agent/jobs> \
 *   node worker/claude-worker.mjs
 *
 * Optional env:
 *   GYL_WORKER_ID         — display name in the portal (default: $USER@$HOST)
 *   GYL_POLL_INTERVAL_MS  — default 30000
 *   GYL_CLAUDE_BIN        — path to claude CLI (default: claude on PATH)
 *   GYL_CLAUDE_MAX_TURNS  — default 25
 *   GYL_CLAUDE_TIMEOUT_MS — default 1200000 (20 min)
 */
import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir, hostname, userInfo } from "node:os";
import { join } from "node:path";

const PORTAL = process.env.GYL_PORTAL_URL;
const SECRET = process.env.GYL_WORKER_SECRET;
const POLL_INTERVAL_MS = Number(process.env.GYL_POLL_INTERVAL_MS ?? 30_000);
const WORKER_ID = process.env.GYL_WORKER_ID ?? `${userInfo().username}@${hostname()}`;
const CLAUDE_BIN = process.env.GYL_CLAUDE_BIN ?? "claude";
const MAX_TURNS = Number(process.env.GYL_CLAUDE_MAX_TURNS ?? 25);
const TIMEOUT_MS = Number(process.env.GYL_CLAUDE_TIMEOUT_MS ?? 20 * 60_000);
// Subscription pricing is flat — always use the best model + max effort.
// Override via env if needed. Aliases: "opus" = latest Opus, "sonnet" = latest Sonnet.
const MODEL = process.env.GYL_CLAUDE_MODEL ?? "claude-opus-4-7";
const EFFORT = process.env.GYL_CLAUDE_EFFORT ?? "max";

if (!PORTAL || !SECRET) {
  console.error("[worker] missing required env: GYL_PORTAL_URL and/or GYL_WORKER_SECRET");
  console.error("[worker] generate a secret at /admin/agent/jobs first");
  process.exit(1);
}

const HEADERS = {
  "content-type": "application/json",
  authorization: `Bearer ${SECRET}`,
};

async function api(path, init = {}) {
  const res = await fetch(`${PORTAL}${path}`, {
    ...init,
    headers: { ...HEADERS, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} → ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Prepended to EVERY agent prompt the worker runs. The worker runs `claude`
// (Claude Code) which auto-discovers the ui-ux-pro-max skill (~/.claude/skills)
// and the magic MCP (~/.claude.json / project .mcp.json), so the design + audit
// + build agents can use them — this preamble tells them WHEN and HOW.
const DESIGN_TOOLING_PREAMBLE = [
  "## Design tooling available to you — USE IT for any UI/UX, visual-design, or design-audit work",
  "You are running inside Claude Code with two design tools installed. Whenever the task touches how something LOOKS, FEELS, is laid out, or is interacted with (designing pages, choosing styles/palettes/typography, building or refactoring UI, or AUDITING a site's UI/UX), use them instead of guessing:",
  "",
  "1. **ui-ux-pro-max** skill — a design-intelligence database (67 UI styles, 161 color palettes, 57 font pairings, 99 UX guidelines incl. accessibility/touch/perf, 25 chart types). Query it to ground your decisions/findings in real data:",
  "     cd ~/.claude/skills/ui-ux-pro-max/scripts && python3 search.py \"<query>\" --domain <style|color|typography|ux|product>",
  "   For a full per-project recommendation: `python3 search.py \"<product> <industry> <keywords>\" --design-system`. (Or invoke the ui-ux-pro-max Skill directly.)",
  "2. **magic** MCP (21st.dev) — generate production-grade UI components when building/refactoring interface code.",
  "",
  "3. **Taste & craft skills (REQUIRED on every page/site build — this is how we beat AI-slop).** Before producing ANY layout, section, copy, or CSS, invoke these installed skills and apply their rules:",
  "   - **design-taste-frontend** — anti-slop layout/typography/spacing. Read the brief, set the dials, kill templated patterns (no AI-purple gradients, no eyebrow-on-every-section, no duplicate-CTA-intent, hero ≤2 lines, one accent locked page-wide). This is the primary taste gate.",
  "   - **impeccable** — production-grade craft pass: contrast/readability, font pairing on a contrast axis, tinted (never pure-black) shadows, no cards-in-cards, deterministic anti-pattern detector. Use for `polish`, `audit`, `critique` on what you build.",
  "   - **emil-design-eng** — motion & micro-interaction craft: ease-out (never ease-in) for UI, custom cubic-bezier curves, <300ms durations, scale(0.97) on :active, never animate from scale(0), `prefers-reduced-motion`. Apply to every interactive/animated element.",
  "   - **review-animations** — strict review gate for any animation/motion code you ship; flag-by-default, approval is earned.",
  "   Every site we build MUST pass through design-taste-frontend + impeccable; add emil-design-eng + review-animations whenever the surface moves. These layer ON TOP of the project house standards below — house rules win on conflict (premium SVG icons, locked palette, mobile-first conversion).",
  "",
  "Non-negotiable design rules (the skill enforces these too): premium custom SVG icons only — NEVER emoji as UI icons; text over photos needs a dark scrim; tap targets ≥44×44px; body text ≥16px; contrast ≥4.5:1.",
  "If the task is pure backend / SEO-text / data work with no visual surface, you may skip ALL of the above.",
  "",
  "----",
  "",
].join("\n");

async function runClaude(promptRaw) {
  const prompt = DESIGN_TOOLING_PREAMBLE + promptRaw;
  const dir = await mkdtemp(join(tmpdir(), "gyl-claude-"));
  const promptFile = join(dir, "prompt.txt");
  await writeFile(promptFile, prompt, "utf8");
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const args = [
      "--print",
      "--max-turns", String(MAX_TURNS),
      "--output-format", "text",
      "--model", MODEL,
      "--effort", EFFORT,
      // Headless worker — auto-accept all tool use (WebSearch, WebFetch, Bash, etc.).
      // Prompts are trusted (built by the platform). The worker has no human to
      // approve permissions interactively. Without this, jobs needing web access
      // exit early with a permission-refusal message.
      "--permission-mode", "bypassPermissions",
    ];
    const child = spawn(CLAUDE_BIN, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    const killer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(killer);
      rm(dir, { recursive: true, force: true }).catch(() => {});
      reject(err);
    });
    child.on("close", async (code) => {
      clearTimeout(killer);
      const ms = Date.now() - started;
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve({ output: stdout.trim(), durationMs: ms, stderrTail: stderr.slice(-500) });
    });
    // Feed the prompt via stdin
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function claimOnce() {
  let res;
  try {
    res = await api(`/api/claude-jobs/claim`, {
      method: "POST",
      body: JSON.stringify({
        workerId: WORKER_ID,
        workerKind: "mac",
        workerInfo: { node: process.version, host: hostname(), kind: "mac-claude-code" },
      }),
    });
  } catch (err) {
    console.warn("[worker] claim error:", err.message);
    return null;
  }
  return res.job ?? null;
}

async function heartbeat(jobId) {
  try {
    await api(`/api/claude-jobs/${jobId}/heartbeat`, { method: "POST", body: "{}" });
  } catch (err) {
    console.warn(`[worker] heartbeat ${jobId} failed:`, err.message);
  }
}

async function complete(jobId, output, durationMs) {
  await api(`/api/claude-jobs/${jobId}/complete`, {
    method: "POST",
    body: JSON.stringify({ outputMarkdown: output, durationMs }),
  });
}

async function fail(jobId, error) {
  try {
    await api(`/api/claude-jobs/${jobId}/fail`, {
      method: "POST",
      body: JSON.stringify({ error: String(error).slice(0, 1000) }),
    });
  } catch (err) {
    console.warn(`[worker] fail ${jobId} could not be reported:`, err.message);
  }
}

/**
 * Direct-handler kinds — these jobs don't need a Claude turn at all. The
 * worker runs a shell command directly and posts the result. Used by the
 * G3+ "audit:* / fix:*" pipeline so weekly cron + dashboard buttons can
 * use the same job queue as the rest of the platform without burning
 * Claude tokens on what is effectively a Playwright + curl run.
 */
const DIRECT_HANDLERS = {
  "audit:network_health": runNetworkHealthAudit,
  "fix:retighten_meta":   runFixViaDispatcher,
  "fix:update_schema":    runFixViaDispatcher,
  "fix:image_alt_pass":   runFixViaDispatcher,
  "fix:internal_links":   runFixViaDispatcher,
  "fix:inject_component": runFixViaDispatcher,
  "fix:swap_hero":        runFixViaDispatcher,
  "fix:rewrite_page":     runFixViaDispatcher,
  "fix:plugin_upgrade":   runFixViaDispatcher,
  "build:wp_install":     runBuildWpInstall,
  "build:plugin_push":    runBuildPluginPush,
  "build:content":        runBuildContent,
  "track:keyword_ranks":  runTrackKeywordRanks,
  "gbp:draft_posts":      runGbpDraftPosts,
  "notify:push":          runNotifyPush,
  "research:capture_sections": runDesignCaptureSections,
  "audit:section_watch":  runSectionWatch,
};

async function workOne(job) {
  console.log(`[worker] claimed ${job.id} — ${job.title} (${job.kind})`);
  const hb = setInterval(() => heartbeat(job.id), 60_000);
  await heartbeat(job.id); // initial heartbeat = mark running
  try {
    const handler = DIRECT_HANDLERS[job.kind];
    if (handler) {
      const { output, durationMs } = await handler(job);
      await complete(job.id, output, durationMs);
      console.log(`[worker] done ${job.id} in ${Math.round(durationMs / 1000)}s (direct handler)`);
    } else {
      const { output, durationMs, stderrTail } = await runClaude(job.prompt);
      if (stderrTail) console.warn(`[worker] ${job.id} stderr tail:`, stderrTail);
      await complete(job.id, output, durationMs);
      console.log(`[worker] done ${job.id} in ${Math.round(durationMs / 1000)}s`);
    }
  } catch (err) {
    console.error(`[worker] ${job.id} failed:`, err.message);
    await fail(job.id, err.message);
  } finally {
    clearInterval(hb);
  }
}

/**
 * G4 — fix:* dispatcher.
 *
 * All eight fix:* kinds funnel through one shared dispatch script at
 * ~/.claude/skills/gyl-fix-handlers/scripts/dispatch.mjs. The dispatcher
 * reads the job kind + input, runs the corresponding handler (WP REST,
 * HMAC self-update, etc.), and prints a JSON result the worker forwards
 * back to the platform.
 */
async function runFixViaDispatcher(job) {
  const started = Date.now();
  const dispatchPath = `${process.env.HOME}/.claude/skills/gyl-fix-handlers/scripts/dispatch.mjs`;
  const payload = JSON.stringify({ kind: job.kind, input: job.input ?? {} });
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  // Shell-escape the payload for the command line.
  const escaped = `'${payload.replace(/'/g, `'\\''`)}'`;
  let stdout = "", stderr = "";
  try {
    const r = await execAsync(`node "${dispatchPath}" ${escaped}`, {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
    stdout = r.stdout;
    stderr = r.stderr;
  } catch (e) {
    throw new Error(`fix dispatcher failed: ${e.stderr || e.message}`);
  }
  const result = JSON.parse(stdout.trim());
  if (!result.ok) throw new Error(result.error ?? "fix returned ok=false");
  const output = `# ${job.kind}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
  return { output, durationMs: Date.now() - started };
}

/**
 * G3 — audit:network_health direct handler.
 *
 * Runs the gyl-network-health orchestrator for the sites in job.input.sites,
 * reads the resulting JSON files, and POSTs them to /api/health/ingest-run
 * so the platform DB stays in sync.
 */
async function runNetworkHealthAudit(job) {
  const started = Date.now();
  const sitesArg = job.input?.sites;
  if (!sitesArg || typeof sitesArg !== "string") {
    throw new Error("audit:network_health: missing job.input.sites");
  }
  const orchestratorPath = `${process.env.HOME}/.claude/skills/gyl-network-health/scripts/network-health.mjs`;
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);
  const { stdout, stderr } = await execAsync(`node "${orchestratorPath}" "${sitesArg}"`, {
    cwd: process.env.HOME,
    maxBuffer: 32 * 1024 * 1024, // orchestrator output is small but be safe
    timeout: 30 * 60 * 1000, // 30 min cap (orchestrator usually ~5min for 4 sites)
  });

  const runDate = new Date().toISOString().slice(0, 10);
  const { readFileSync, existsSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const networkDir = resolve(process.env.HOME, "gyl-sites", "_network");
  const matrixPath = resolve(networkDir, `health-matrix-${runDate}.json`);
  if (!existsSync(matrixPath)) {
    throw new Error(`orchestrator did not write ${matrixPath}. stderr: ${stderr.slice(0, 500)}`);
  }
  const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));

  // Collect per-site JSON outputs.
  const perSite = {};
  for (const row of matrix) {
    const slug = row.slug;
    const structureDir = resolve(process.env.HOME, "gyl-sites", slug, "audits", `structure-audit-${runDate}`);
    const designDir = resolve(process.env.HOME, "gyl-sites", slug, "audits", `design-audit-${runDate}`);
    const seoDir = resolve(process.env.HOME, "gyl-sites", slug, "audits", `seo-audit-${runDate}`);
    const readIf = (path) => existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
    perSite[slug] = {
      inventory:      readIf(resolve(structureDir, "inventory.json")),
      chromeParity:   readIf(resolve(designDir, "chrome-parity.json")),
      mobileSweep:    readIf(resolve(designDir, "mobile-sweep.json")),
      heroUniqueness: readIf(resolve(designDir, "hero-uniqueness.json")),
      onpage:         readIf(resolve(seoDir, "onpage.json")),
      indexAudit:     readIf(resolve(seoDir, "index.json")),
    };
  }

  // Post the bundle back to the platform.
  const url = `${PORTAL.replace(/\/+$/, "")}/api/health/ingest-run`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SECRET}`,
    },
    body: JSON.stringify({ runDate, matrix, perSite }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`ingest-run failed ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const result = await resp.json().catch(() => ({}));
  const output = `# Network health · ${runDate}\n\nAudited ${matrix.length} site(s). Imported ${result.sites ?? "?"} site(s) with ${result.issues ?? "?"} issue(s).\n\n` +
    matrix.map((r) => `- **${r.host}** — composite ${r.score?.composite ?? "—"}`).join("\n");
  return { output, durationMs: Date.now() - started };
}

/**
 * G7 — build:wp_install
 *
 * Calls the WP Manager (Hostinger) provisioning API to install a fresh
 * WordPress on the target domain. The Mac worker is the only thing with
 * access to ~/.config/gyl/wp-manager.env (HOSTINGER_API_TOKEN +
 * default plan/server). Stub: prints what would happen until creds are
 * wired. Mark the build's blocker to "needs manual WP install" so the
 * operator can finish the manual install + flip the state from /admin/new-site/[id].
 */
async function runBuildWpInstall(job) {
  const started = Date.now();
  const { domain, slug, buildId, businessName } = job.input ?? {};
  if (!domain || !slug) throw new Error("build:wp_install missing domain/slug");

  const credsPath = `${process.env.HOME}/.config/gyl/wp-manager.env`;
  const { existsSync, readFileSync, mkdirSync, writeFileSync, chmodSync } = await import("node:fs");
  if (!existsSync(credsPath)) {
    const output = [
      `# build:wp_install · ${domain}`,
      ``,
      `MANUAL STEP: WP Manager creds (${credsPath}) not present.`,
      `Install WordPress on ${domain} via the panel + WP Manager plugin, then`,
      `advance the build at /admin/new-site/${buildId} once the site responds.`,
      ``,
      `To wire this up: drop a file at ${credsPath} with:`,
      `  WP_MANAGER_URL=https://manager.<your-hub>/wp-json/wp-manager/v1`,
      `  WP_MANAGER_HMAC_KEY=<hex>`,
    ].join("\n");
    return { output, durationMs: Date.now() - started };
  }

  const env = {};
  for (const line of readFileSync(credsPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const baseUrl = env.WP_MANAGER_URL?.replace(/\/+$/, "");
  const hmacKey = env.WP_MANAGER_HMAC_KEY;
  if (!baseUrl || !hmacKey) {
    throw new Error(`${credsPath} present but WP_MANAGER_URL / WP_MANAGER_HMAC_KEY missing`);
  }

  const body = JSON.stringify({
    domain,
    slug,
    title: businessName || domain,
    admin_email: env.WP_MANAGER_DEFAULT_ADMIN_EMAIL || `admin@${domain}`,
    locale: "en_US",
  });
  const ts = Math.floor(Date.now() / 1000).toString();
  const { createHmac } = await import("node:crypto");
  const sig = createHmac("sha256", hmacKey).update(`${ts}.${body}`).digest("hex");

  const endpoint = `${baseUrl}/install`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GYL-Timestamp": ts,
      "X-GYL-Signature": sig,
    },
    body,
  });
  const text = await resp.text();
  if (!resp.ok) {
    const output = [
      `# build:wp_install · ${domain} · WP Manager call FAILED`,
      ``,
      `${endpoint} returned ${resp.status}:`,
      "```",
      text.slice(0, 800),
      "```",
      ``,
      `Falling back to manual install. Run the WP Manager install flow in the`,
      `hub admin, then advance the build at /admin/new-site/${buildId}.`,
    ].join("\n");
    return { output, durationMs: Date.now() - started };
  }

  // Expected response: { admin_url, app_user, app_password }
  let creds;
  try { creds = JSON.parse(text); } catch { creds = null; }
  if (creds?.app_user && creds?.app_password) {
    const credsDir = `${process.env.HOME}/.config/gyl`;
    mkdirSync(credsDir, { recursive: true });
    const credFile = `${credsDir}/wp-creds-${slug}.env`;
    const fileBody = [
      `WP_URL=https://${domain}`,
      `WP_USER=${creds.app_user}`,
      `WP_APP_PASSWORD=${creds.app_password}`,
      creds.admin_url ? `WP_ADMIN_URL=${creds.admin_url}` : "",
    ].filter(Boolean).join("\n") + "\n";
    writeFileSync(credFile, fileBody);
    try { chmodSync(credFile, 0o600); } catch {}
  }

  const output = [
    `# build:wp_install · ${domain}`,
    ``,
    `WP Manager install ACCEPTED:`,
    "```json",
    text.slice(0, 800),
    "```",
    ``,
    creds?.app_user
      ? `Saved per-site creds to ~/.config/gyl/wp-creds-${slug}.env (0600).`
      : `No app_user in response — operator must drop creds manually before plugin push.`,
    ``,
    `Once DNS resolves, advance the build at /admin/new-site/${buildId}.`,
  ].join("\n");
  return { output, durationMs: Date.now() - started };
}

/**
 * G7 — build:plugin_push
 *
 * Once WP is installed and we have an app password on file, install the
 * gyl-bookings plugin from the latest zip. Reuses publish-plugin.ts on the
 * platform side (it loops sites+drops fix:plugin_upgrade), so this handler
 * just defers to that flow once it can read site_id from new_site_builds.
 */
async function runBuildPluginPush(job) {
  const started = Date.now();
  const { domain, slug, buildId } = job.input ?? {};
  if (!domain || !slug) throw new Error("build:plugin_push missing domain/slug");

  // Auto-build the zip from source so we don't depend on a stale ~/Desktop copy.
  const { execSync } = await import("node:child_process");
  const builder = `${process.env.HOME}/Downloads/tool/gyl-platform/scripts/build-plugin-zip.sh`;
  const { existsSync } = await import("node:fs");
  if (!existsSync(builder)) {
    throw new Error(`zip builder missing: ${builder}`);
  }
  const zipPath = execSync(`bash "${builder}"`, { encoding: "utf8" }).trim();

  // Use the WP Manager plugin's /install-plugin endpoint to push it onto the
  // freshly-installed WP site. WP Manager already runs on the hub and can
  // reach the new site over WP-Cron / direct PHP install.
  const credsPath = `${process.env.HOME}/.config/gyl/wp-manager.env`;
  if (!existsSync(credsPath)) {
    throw new Error(`WP Manager creds not present at ${credsPath} — set WP_MANAGER_URL + WP_MANAGER_HMAC_KEY`);
  }
  const { readFileSync } = await import("node:fs");
  const env = {};
  for (const line of readFileSync(credsPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const baseUrl = env.WP_MANAGER_URL?.replace(/\/+$/, "");
  const hmacKey = env.WP_MANAGER_HMAC_KEY;
  if (!baseUrl || !hmacKey) throw new Error(`${credsPath} missing WP_MANAGER_URL / WP_MANAGER_HMAC_KEY`);

  // POST the zip as multipart so we don't need a file path on the hub server.
  const { createReadStream, statSync } = await import("node:fs");
  const { basename } = await import("node:path");
  const size = statSync(zipPath).size;
  const boundary = `----GYL${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="domain"\r\n\r\n${domain}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="slug"\r\n\r\n${slug}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="plugin"; filename="${basename(zipPath)}"\r\n` +
    `Content-Type: application/zip\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const zipBuf = readFileSync(zipPath);
  const bodyBuf = Buffer.concat([head, zipBuf, tail]);

  const ts = Math.floor(Date.now() / 1000).toString();
  const { createHmac } = await import("node:crypto");
  // Sign over the multipart body so the hub can replay-protect.
  const sig = createHmac("sha256", hmacKey).update(`${ts}.${bodyBuf.toString("binary")}`).digest("hex");

  const resp = await fetch(`${baseUrl}/install-plugin`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "X-GYL-Timestamp": ts,
      "X-GYL-Signature": sig,
    },
    body: bodyBuf,
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`WP Manager install-plugin failed ${resp.status}: ${text.slice(0, 400)}`);
  }
  return {
    output: `# build:plugin_push · ${domain}\n\nPushed ${basename(zipPath)} (${size} B) via WP Manager.\nResponse: \`\`\`json\n${text.slice(0, 600)}\n\`\`\``,
    durationMs: Date.now() - started,
  };
}

/**
 * G7 — build:content
 *
 * Runs the new-site skill via Claude CLI to generate the initial content
 * pack (homepage + 10 base pages + legal). Stub for now: prints the kickoff
 * command. The Mac worker shells out to ~/.claude/skills/new-site/scripts.
 */
async function runBuildContent(job) {
  const started = Date.now();
  const { domain, slug, buildId, businessName, city, vertical, brief } = job.input ?? {};
  if (!domain || !slug) throw new Error("build:content missing domain/slug");

  // Drive the new-site skill via Claude CLI in non-interactive mode. The
  // skill itself owns the content plan (homepage, services, areas, legal)
  // and pushes pages via the gyl-bookings /content/create-page endpoint.
  const briefStr = JSON.stringify(brief ?? {}).replace(/'/g, "'\\''");
  const prompt = [
    `Use the new-site skill to scaffold content for a brand-new GYL site.`,
    ``,
    `Domain: ${domain}`,
    `Slug: ${slug}`,
    `Business name: ${businessName ?? domain}`,
    `City: ${city ?? "Unknown"}`,
    `Vertical: ${vertical ?? "limo"}`,
    `Brief: ${briefStr}`,
    ``,
    `Steps the skill should run:`,
    `1. Read ~/gyl-sites/${slug}/CLAUDE.md if it exists (skip otherwise).`,
    `2. Generate the canonical content set: homepage, 5 services, 8 city/area pages, /privacy/, /terms/, /contact-us/.`,
    `3. Push each page via the platform's deployToWordPress action (HMAC-signed REST to gyl-bookings/v1/content/create-page).`,
    `4. Save a build log at ~/gyl-sites/${slug}/build-log.md.`,
    ``,
    `When all pages are published, output a final JSON summary on one line:`,
    `  {"ok": true, "pages_created": N, "log_path": "..."}`,
  ].join("\n");

  const { output, durationMs, stderrTail } = await runClaude(prompt);
  if (stderrTail) console.warn(`[worker] build:content stderr tail:`, stderrTail);

  // Parse the final JSON line (best-effort).
  let pagesCreated = null;
  const m = output.match(/\{\s*"ok"\s*:\s*true[\s\S]*?"pages_created"\s*:\s*(\d+)/);
  if (m) pagesCreated = parseInt(m[1], 10);

  const summary = pagesCreated != null
    ? `Content skill published ${pagesCreated} page(s) to ${domain}.`
    : `Content skill ran for ${domain}. Check the build log for details.`;
  const out = `# build:content · ${domain}\n\n${summary}\n\n_Build ${buildId} now in content state — health gate will pick up once pages are live._`;
  return { output: out, durationMs: durationMs ?? (Date.now() - started) };
}

/**
 * G8 — track:keyword_ranks
 *
 * For non-GSC sites: real SERP scrape via DuckDuckGo HTML endpoint. Sleeps
 * 1.2s between calls to stay polite. GSC-connected sites are resolved
 * inline by `keyword-rank-sweep.ts` on the platform; they never reach this
 * handler.
 */
async function runTrackKeywordRanks(job) {
  const started = Date.now();
  const { siteId, weekOf, host, keywords } = job.input ?? {};
  if (!siteId || !weekOf || !Array.isArray(keywords)) {
    throw new Error("track:keyword_ranks missing siteId/weekOf/keywords");
  }
  if (!host) {
    throw new Error("track:keyword_ranks missing job.input.host (target domain)");
  }

  const { scrapeRank } = await import("./serp-scrape.mjs");
  const readings = [];
  let success = 0;
  let missed = 0;
  for (const kw of keywords) {
    try {
      const result = await scrapeRank({ keyword: kw.keyword, targetDomain: host });
      if (result.position != null) success++; else missed++;
      readings.push({
        trackedKeywordId: kw.id,
        position: result.position,
        url: result.url,
        source: "scrape",
        raw: result.raw,
      });
    } catch (err) {
      missed++;
      readings.push({
        trackedKeywordId: kw.id,
        position: null,
        url: null,
        source: "scrape",
        raw: { error: err.message },
      });
    }
    // Polite delay between SERP calls.
    await new Promise((r) => setTimeout(r, 1200));
  }

  const url = `${PORTAL.replace(/\/+$/, "")}/api/keyword-ranks/ingest`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SECRET}` },
    body: JSON.stringify({ siteId, weekOf, readings }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`rank ingest failed ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const result = await resp.json().catch(() => ({}));
  const output = `# track:keyword_ranks · ${weekOf} · ${host}\n\nScraped ${keywords.length} keyword(s) via DDG: ${success} ranked, ${missed} not in top 60. Written ${result.written ?? "?"}.`;
  return { output, durationMs: Date.now() - started };
}

/**
 * G9 — gbp:draft_posts
 *
 * Drives the Claude CLI to draft N weeks of GBP posts (mix of update/event/offer)
 * for the site, then POSTs the result to /api/gbp/ingest-drafts so the operator
 * can review + post manually (GBP API integration not yet shipped).
 */
async function runGbpDraftPosts(job) {
  const started = Date.now();
  const { siteId, domain, weekCount = 4 } = job.input ?? {};
  if (!siteId || !domain) throw new Error("gbp:draft_posts missing siteId/domain");

  const prompt = [
    `You are drafting Google Business Profile posts for ${domain}.`,
    `Produce ${weekCount} posts spread one per week starting next Monday.`,
    `Mix kinds (update / event / offer). Each post must be JSON with this exact shape:`,
    `  { "kind": "update"|"event"|"offer", "title": string|null, "body": string (max 1500 chars), "ctaLabel": string|null, "ctaUrl": string|null, "scheduledForIso": "YYYY-MM-DD" }`,
    `Return ONLY a JSON array. No prose, no markdown fences.`,
  ].join("\n");

  const { output, durationMs, stderrTail } = await runClaude(prompt);
  if (stderrTail) console.warn(`[worker] gbp:draft_posts stderr tail:`, stderrTail);

  // Try to extract JSON array from output.
  const m = output.match(/\[\s*[\s\S]*\]/);
  let drafts = [];
  if (m) {
    try { drafts = JSON.parse(m[0]); } catch (e) {
      throw new Error(`could not parse GBP drafts JSON: ${e.message}`);
    }
  } else {
    throw new Error("Claude returned no JSON array for GBP drafts");
  }

  const url = `${PORTAL.replace(/\/+$/, "")}/api/gbp/ingest-drafts`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SECRET}` },
    body: JSON.stringify({ siteId, drafts }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`gbp ingest failed ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const result = await resp.json().catch(() => ({}));
  const out = `# gbp:draft_posts · ${domain}\n\nGenerated ${drafts.length} draft(s). Imported ${result.written ?? "?"}.`;
  return { output: out, durationMs: durationMs ?? (Date.now() - started) };
}

/**
 * Phase 3 — notify:push
 *
 * The platform owns Telegram delivery (uses the org-scoped encrypted bot
 * token from org_settings + per-user telegram_chat_id from user_prefs).
 * Worker just forwards the job payload to /api/push/send and lets the
 * server fan out to every opted-in admin.
 *
 * job.input: { kind, refId, title, body, href }
 */
async function runNotifyPush(job) {
  const started = Date.now();
  const { kind, title, body, href } = job.input ?? {};
  if (!kind || !title) throw new Error("notify:push missing kind/title");

  const url = `${PORTAL.replace(/\/+$/, "")}/api/push/send`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SECRET}`,
    },
    body: JSON.stringify({ title, body, href }),
  });
  const txt = await resp.text();
  if (!resp.ok) {
    throw new Error(`push send failed ${resp.status}: ${txt.slice(0, 300)}`);
  }
  let result;
  try { result = JSON.parse(txt); } catch { result = {}; }
  return {
    output: `# notify:push · ${title}\n\nDelivered to ${result.sent ?? 0} target(s)${result.reason ? ` (${result.reason})` : ""}.`,
    durationMs: Date.now() - started,
  };
}

/** Vision section vocabulary — mirrors VISION_SECTION_TYPES in design-vision.ts. */
const VISION_SECTION_TYPES =
  "hero, booking_form, services, service_detail, fleet, areas, features, process, " +
  "pricing, testimonials, stats, partners, gallery, about, faq, cta, contact, footer, nav, other";

/** Prompt for Claude Code to read a full-page screenshot file + return section bands. */
function buildVisionPrompt(imagePath) {
  return [
    `Use the Read tool to open the image file at this exact path: ${imagePath}`,
    `It is a FULL-PAGE screenshot of a limousine / chauffeur / luxury-car-service marketing page.`,
    `Identify every distinct top-level SECTION, in order from top to bottom.`,
    ``,
    `For EACH section return:`,
    `- "type": one of ${VISION_SECTION_TYPES}`,
    `- "label": the human name (its visible heading if any, e.g. "Our Fleet", "Airports We Serve", "How It Works"; else a short descriptive label).`,
    `- "yStartPct" and "yEndPct": the band's top and bottom as PERCENTAGES (0-100) of the FULL image height. Be accurate — these crop the section.`,
    `- "isValid": true ONLY if it is a real, fully-rendered, useful content section. false for blank/empty space, a cookie/consent banner, an ad, a broken/half-loaded block, or a sliver.`,
    `- "note": if isValid is false, one or two words why.`,
    ``,
    `Rules: cover the whole page with no big gaps; the very top is usually "nav", the very bottom "footer". Merge tiny adjacent slivers into their real section. Do NOT invent sections that aren't visible.`,
    `Output STRICT JSON ONLY — a single array of objects, no prose, no markdown fences.`,
  ].join("\n");
}

/**
 * Research-for-new-design — research:capture_sections.
 *
 * The server-side Playwright capture now produces PRECISE per-section crops
 * (it screenshots each real <section>/<header>/<footer> element individually —
 * see captureRunSections in src/lib/design-capture.ts), so every gallery card
 * is exactly one section. We no longer run an LLM vision pass that eyeballs
 * y-percentage bands on the full-page shot — that drifted and produced blank /
 * wrong-section clips. This step is still $0 (pure Playwright, no Anthropic API);
 * the worker just triggers it and reports the result.
 */
async function runDesignCaptureSections(job) {
  const started = Date.now();
  const runId = job.input?.runId;
  if (!runId) throw new Error("research:capture_sections missing job.input.runId");
  const base = PORTAL.replace(/\/+$/, "");
  const authHeaders = { "Authorization": `Bearer ${SECRET}` };

  // Server-side Playwright capture → full-page shot + a tight per-element crop
  // for every detected section (source: "dom"), written straight to the DB.
  const capResp = await fetch(`${base}/api/design-research/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ runId, force: job.input?.force === true }),
  });
  const capTxt = await capResp.text();
  if (!capResp.ok) throw new Error(`design capture failed ${capResp.status}: ${capTxt.slice(0, 300)}`);
  let cap = {};
  try { cap = JSON.parse(capTxt); } catch { cap = {}; }

  const out = `# research:capture_sections · run ${runId}\n\n` +
    `Captured ${cap.captured ?? 0}/${cap.total ?? 0} site(s) · ${cap.sections ?? 0} section(s) ` +
    `(precise DOM element crops — each card is exactly one section) · ${cap.failed ?? 0} failed.`;
  return { output: out, durationMs: Date.now() - started };
}

/** Tolerant parse of the vision model's JSON array of sections → unique present types. */
function parsePresentSectionTypes(raw) {
  let txt = String(raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = txt.indexOf("[");
  const end = txt.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  txt = txt.slice(start, end + 1);
  let arr;
  try { arr = JSON.parse(txt); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    // A section counts as "present" only if vision didn't flag it invalid.
    if (item.isValid === false || item.is_valid === false) continue;
    const t = String(item.type ?? "").toLowerCase().trim();
    if (t) seen.add(t);
  }
  return Array.from(seen);
}

/**
 * Section Watch — audit:section_watch ($0 vision path).
 *
 * The platform chose ONE representative page per page-type server-side and
 * passed them in job.input.pages = [{url, pageType}]. For each page the worker:
 *   1) POSTs the URL to /api/section-watch/capture → full-page PNG bytes (the
 *      capture runs server-side where Playwright lives).
 *   2) Runs Claude Code VISION on the screenshot (this machine's subscription
 *      — $0, no Anthropic API key) to detect which section TYPES are present.
 *   3) Collects {url, pageType, present[]}.
 * Then POSTs all pages to /api/section-watch/ingest, which compares against the
 * canonical REQUIRED_SECTIONS and flags the missing sections per site.
 */
async function runSectionWatch(job) {
  const started = Date.now();
  const siteId = job.input?.siteId;
  const pages = Array.isArray(job.input?.pages) ? job.input.pages : [];
  if (!siteId) throw new Error("audit:section_watch missing job.input.siteId");
  if (pages.length === 0) throw new Error("audit:section_watch has no pages to audit");
  const base = PORTAL.replace(/\/+$/, "");
  const authHeaders = { "Authorization": `Bearer ${SECRET}` };

  const results = [];
  let ok = 0, failed = 0;
  for (const p of pages) {
    const url = p.url;
    const pageType = p.pageType || "other";
    if (!url) { failed += 1; continue; }
    const dir = await mkdtemp(join(tmpdir(), "gyl-section-"));
    const pngPath = join(dir, "full.png");
    try {
      const cap = await fetch(`${base}/api/section-watch/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ url }),
      });
      if (!cap.ok) {
        const t = await cap.text().catch(() => "");
        throw new Error(`capture ${cap.status}: ${t.slice(0, 200)}`);
      }
      await writeFile(pngPath, Buffer.from(await cap.arrayBuffer()));

      const { output } = await runClaude(buildVisionPrompt(pngPath));
      const present = parsePresentSectionTypes(output);
      results.push({ url, pageType, present });
      ok += 1;
      console.log(`[worker] section-watch page ok · ${url} · ${present.length} sections present`);
    } catch (e) {
      failed += 1;
      console.warn(`[worker] section-watch page failed · ${url} · ${e.message}`);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  const ing = await fetch(`${base}/api/section-watch/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ siteId, pages: results }),
  });
  const ingTxt = await ing.text();
  if (!ing.ok) throw new Error(`ingest ${ing.status}: ${ingTxt.slice(0, 200)}`);
  let ingJson = {};
  try { ingJson = JSON.parse(ingTxt); } catch { ingJson = {}; }

  const siteLabel = job.title?.replace(/^Section watch — /, "") || siteId;
  console.log(`[worker] section-watch ok · ${siteLabel} · ${results.length} pages · $0`);

  const out = `# audit:section_watch · ${siteLabel}\n\n` +
    `Audited ${results.length} page(s) (${ok} ok / ${failed} failed). ` +
    `Missing sections flagged: ${ingJson.missing ?? 0}. Vision via Claude Code ($0).`;
  return { output: out, durationMs: Date.now() - started };
}

async function main() {
  console.log(`[worker] starting · workerId=${WORKER_ID} · portal=${PORTAL}`);
  console.log(`[worker] polling every ${POLL_INTERVAL_MS / 1000}s · model=${MODEL} effort=${EFFORT} max-turns=${MAX_TURNS} via ${CLAUDE_BIN}`);
  // Verify auth + report
  try {
    await api(`/api/health`).catch(() => null); // best-effort
  } catch (err) {
    // not fatal
  }
  while (true) {
    try {
      const job = await claimOnce();
      if (job) {
        await workOne(job);
        continue; // poll again immediately
      }
    } catch (err) {
      console.warn("[worker] loop error:", err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
