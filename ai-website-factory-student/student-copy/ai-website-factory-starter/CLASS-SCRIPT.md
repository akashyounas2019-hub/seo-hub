# Class Runsheet — "Build an AI Website Factory for YOUR Niche (Free, on Your Laptop)"
**Length:** ~60 minutes · **Goal:** every student has the factory running on `localhost` and watches
it research **their own niche**, pick designs, find keywords, and write content — at **$0** using
their Claude Code subscription.

> Teacher prep: have the repo zipped/shared, `node -v` ≥ 20, and your own copy already running so the
> live demo can't stall. Keep both terminals visible. Pick a demo niche that ISN'T limo (e.g. a
> dental clinic or a gym) to prove it's niche-agnostic.

---

## 0:00 – 0:08 · What we're building (8 min)
- Show the dashboard at `localhost:3001/admin`. "This is an AI website factory. You tell it your
  **niche** — dentist, gym, lawyer, restaurant, plumber — and it builds a real local-SEO site for it.
  Runs on your computer. No hosting bill. No monthly SaaS."
- The four agents: **Design Research → Keyword Research → Content → Site Builder Studio** (the
  drag-and-drop composer with a live page preview).
- The one big idea: **the worker runs on YOUR Claude Code subscription → the agents cost $0 per token.**
- Every site is built through bundled, best-in-class **design-taste skills** so it looks designed, not templated.

## 0:08 – 0:23 · Get it running on localhost (15 min)
Walk through `DEPLOY.md` live; students type along:
```bash
cd ai-website-factory-starter
npm install
cp .env.example .env
openssl rand -hex 32          # → paste as SESSION_SECRET
npm run db:reset              # prints admin email + password
npm run dev                   # → http://localhost:3001/admin
```
**Checkpoint: hands up when you see the dashboard.** Point out: the DB is embedded — *"we never
installed a database or signed up for anything."*

## 0:23 – 0:33 · Connect the $0 engine (10 min)
Second terminal:
```bash
cp .env.worker.example .env.worker
which claude                  # copy into GYL_CLAUDE_BIN
npm run worker
```
*"This worker is the bridge to your Claude Code plan. Leave it running — every agent job runs here,
free."* Mention the paid alternative (Settings → Anthropic key) for anyone without Claude Code.
**Checkpoint: worker says it's polling for jobs.**

## 0:33 – 0:40 · Enter YOUR niche (7 min)
- **Build → New project.** Each student enters **their own** business: name, **niche/industry**
  (this is the key field — "dental clinic", "yoga studio", "law firm", "coffee roaster"…), city, and
  services. *"Everything downstream adapts to whatever you typed here — the factory is not tied to any
  one industry."*

## 0:40 – 0:55 · Live build for that niche (15 min) — the payoff
Do it once on the projector (your dental/gym demo); students follow on their own niche.
1. **Design Research** → enter the market (e.g. "Austin dental clinic") → run. When it finishes, open
   the gallery: **each captured card is one real section** of a top site in *that* niche (hero, about,
   services, gallery, testimonials, FAQ…). Pick the section designs you like.
2. **Keyword Research** → run for the business → real keywords come back → **remove** weak ones →
   **finalize**. (Note they're intent-based and specific to the student's niche.)
3. **Site Builder Studio** (the composer) → pick a page type from the top tabs (Home · Service area ·
   Service · Hub · About · Reservation). Left rail = that page's sections incl. **Header** and **Footer**;
   right = a **live preview canvas**. Demo the four moves:
   - **Drag** a section's design from the left and **drop** it on the canvas → it appears live.
   - **◀ ▶ arrows** on a section **cycle through the researched design variants** right in the preview.
   - **🌐 globe toggle** makes a section **global** — choose the header/hero/fleet/areas design once and it
     applies to that slot on **every** page (the local-SEO repeat-everywhere pattern).
   - **View full page** → full-screen preview of the composed page. Then **Lock** the design → it
     replicates to every page of that type.
4. **Generate content** → the agent writes each page (1,200–1,500 words across real sections) to the
   student's niche + chosen design + finalized keywords. Watch the animated agent panel.
- **Taste gate:** every page the factory builds is automatically run through the bundled design skills
  (**design-taste-frontend + impeccable + emil-design-eng**) so the output dodges generic "AI-slop" —
  point out the result looks designed, not templated.
- Narrate cost throughout: *"every one of these ran on your Claude Code plan — zero dollars."*

## 0:55 – 1:00 · Recap, free-deploy, Q&A (5 min)
- The loop: **pick niche → research → design → keywords → content → connect & ship.**
- "You ran a real AI agency tool on your laptop for free, for *your* niche. Keep `npm run dev` +
  `npm run worker` running and build a site for a real local business."
- Optional: it's a standard Next.js app you can host online later; not needed for learning.
- Q&A + troubleshooting (see `DEPLOY.md`).

---

### Common student blockers (have these ready)
| Symptom | Fix |
|---|---|
| Jobs stuck "pending" | Worker (Terminal 2) not running, or `GYL_CLAUDE_BIN` wrong → `which claude` |
| Can't log in | Re-run `npm run db:reset`, use the printed email/password |
| Port 3001 busy | Close the other process, or change the port in `package.json` |
| `openssl` missing (Windows) | Use any long random string for `SESSION_SECRET` |
| No Claude Code subscription | Settings → paste Anthropic API key (paid), or pair up |
| Preview/keywords look generic | Make sure the project's **niche** field is filled in — that's what every agent reads |

### Design skills bundled (the anti-slop edge)
The starter ships four design skills in `.claude/skills/`, auto-invoked by the worker on every build so
students' sites don't look AI-generated:
- **design-taste-frontend** — anti-slop layout/typography/spacing (no purple gradients, no eyebrow on
  every section, hero ≤2 lines, one locked accent).
- **impeccable** — production craft pass: contrast, font pairing, tinted shadows, no cards-in-cards.
- **emil-design-eng** + **review-animations** — motion craft (ease-out, <300ms, press feedback) and a
  strict animation review gate.
- Plus **ui-ux-pro-max** (design-intelligence DB) and an optional **Magic MCP** config
  (`.mcp.json.example` + a free 21st.dev key) for UI-component generation.

### Optional power-up (mention, don't require)
It's a standard Next.js app — students can later host it online, but nothing here requires that.
