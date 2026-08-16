# Deploy the AI Website Factory — free, on your own computer

An AI website factory for **any local business niche** — dental clinic, gym, law firm,
restaurant, salon, HVAC, real estate, coffee shop, agency, SaaS, you name it. You tell it your
niche once, and four agents do the rest:

**Design Research → Keyword Research → Content Writing → Site Builder Studio (build & preview).**

You run it on your own laptop (`localhost`) — **no hosting bill, no database server, no cloud.**

---

## What you need (all free)
1. **Node.js 20+** — https://nodejs.org (LTS).
2. **A Claude Code subscription** — runs the agents at **$0 per token** (it's the "worker").
   *(Optional: an Anthropic API key works too, but bills per token.)*
3. That's it. The database is **embedded (PGlite)** — nothing to install.

> **Optional, for even better design** (recommended): the **ui-ux-pro-max** skill ships inside this
> repo (`.claude/skills/ui-ux-pro-max`) and the **Magic MCP** (21st.dev) can generate UI components.
> See "Better design (optional)" at the bottom.

---

## One-time setup (≈5 minutes)

```bash
cd ai-website-factory-starter

npm install                          # install dependencies (~2-3 min)

cp .env.example .env
openssl rand -hex 32                 # paste the output as SESSION_SECRET in .env

npm run db:reset                     # create local DB + your admin login (prints email + password)
```

---

## Run it (two terminals)

**Terminal 1 — the app:**
```bash
npm run dev          # → http://localhost:3001/admin   (log in with the printed admin email/password)
```

**Terminal 2 — the agent worker (the $0 engine):**
```bash
cp .env.worker.example .env.worker
which claude                         # put this path in GYL_CLAUDE_BIN inside .env.worker
npm run worker                       # leave running — it runs every agent job on your Claude Code plan
```

> Prefer an API key instead of the worker? Log in → **Settings** → paste your Anthropic key (bills per token).

---

## Use the factory (any niche)
1. **Build → New project** — enter your **business name, niche/industry** (e.g. "dental clinic",
   "yoga studio", "HVAC contractor"), **city**, and the **services** you offer.
2. **Design Research** — give it your market (e.g. "Austin dentist"); the agent studies top sites
   in *your* niche and captures their best section designs (each card = one real section).
3. **Keyword Research** — the agent returns real, intent-based keywords for your niche; remove any
   you don't want; finalize.
4. **Site Builder Studio** — pick your page designs per page type (tabs), see a **live preview**,
   lock-and-replicate a design across all pages of a type, then **Generate content** — the agent
   writes each page (1,200–1,500 words across real sections) to your niche, design, and keywords.

Everything happens locally and adapts to the niche you entered — nothing is hard-coded to any one
industry.

---

## Troubleshooting
- **Jobs stuck on "pending"** → your worker (Terminal 2) isn't running, or `GYL_CLAUDE_BIN` is wrong (`which claude`).
- **Port 3001 in use** → stop the other process or change `-p` in `package.json`.
- **Reset everything** → `npm run db:reset` (wipes the local DB, re-seeds your admin).
- **`openssl` missing (Windows)** → use any 40+ character random string for `SESSION_SECRET`.

## Better design (optional but recommended)
- **ui-ux-pro-max skill** — already in `.claude/skills/`. When you run the agents through your Claude
  Code worker, they automatically use it (67 styles, 161 palettes, 57 font pairings, 99 UX rules) to
  ground design decisions for your niche.
- **Magic MCP (21st.dev)** — to generate UI components: get a key at https://21st.dev, then
  `cp .mcp.json.example .mcp.json` and set `MAGIC_API_KEY` in your environment.

## Deploy online later (optional, not needed for class)
It's a standard Next.js app — later you can host it on any Node host with a real Postgres URL. For
learning and for building real client sites, **localhost is all you need.**
