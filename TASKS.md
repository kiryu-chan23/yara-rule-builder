# YARA Rule Builder — task order

Stack: Flask API + Vite/React/Tailwind (built to static, served by Flask),
yara-x for compile/scan, CodeMirror 6 editor, Docker for deploy.

**Milestone 1:** POST rule text → compile → return success, or the syntax
error with its line number, rendered in the editor gutter.

Every file in this repo opens with a header comment containing its task,
its contract, and a "DONE WHEN" section. Work in the order below.

**Workflow: finish one task, then come back to Claude for a code review
before starting the next.** Don't stack three tasks and review them all
at once — the point is catching a bad decision before you build on it.

---

## Order of work

| # | Task | File | Why this order |
|---|------|------|----------------|
| 0 | .gitignore | `.gitignore` | Before the first commit |
| B1 | Dependencies + yara-x recon | `backend/requirements.txt` | B3 depends on what you learn here |
| B3 | Error → `RuleError` | `backend/services/errors.py` | The line number is the whole milestone |
| B2 | `compile_rule()` | `backend/services/compiler.py` | Needs RuleError to exist |
| B5a | Config | `backend/config.py` | Small; B2/B5 both read it |
| B4 | `POST /api/compile` | `backend/api/rules.py` | Wraps the service |
| B5 | App factory + static | `backend/app.py` | Makes B4 reachable |
| B6 | Tests | `backend/tests/test_compiler.py` | Lock the line numbers down |
| F1 | Scaffold frontend | see below | Nothing to build against until now |
| F2 | API client | `frontend/src/api/client.js` | |
| F3 | CodeMirror component | `frontend/src/components/RuleEditor.jsx` | |
| F4 | **Gutter markers** | `frontend/src/editor/errorGutter.js` | The milestone |
| F5 | Status bar | `frontend/src/components/CompileStatus.jsx` | |
| F6 | Wire it up | `frontend/src/App.jsx` | **Milestone 1 done here** |
| F7 | Syntax highlighting | `frontend/src/editor/yaraLanguage.js` | Polish, last |
| D1 | Docker | `docker/Dockerfile` | Ship it |

B3 before B2 is deliberate: find out what yara-x actually gives you
before you design the thing that consumes it.

---

## TASK F1 — Scaffold the frontend

JSON files can't hold comments, so this task lives here instead.

```
cd frontend
npm create vite@latest . -- --template react
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install @codemirror/state @codemirror/view @codemirror/commands @codemirror/language
```

Then:

1. **Tailwind v4** is a Vite plugin now — add `tailwindcss()` to the
   `plugins` array in `vite.config.js` and put `@import "tailwindcss";`
   at the top of `src/index.css`. There is no `tailwind.config.js` and no
   PostCSS config in v4. If a tutorial tells you to run
   `npx tailwindcss init`, it's written for v3 — check which version npm
   actually installed before you follow it.
2. **Dev proxy.** In `vite.config.js`, proxy `/api` to
   `http://localhost:5000`. This is what lets F2 use relative URLs, so
   dev and prod share one code path.
3. **Build output.** Confirm `npm run build` writes to `frontend/dist` —
   that's the path `backend/config.py` expects for `STATIC_DIR`.
4. Delete the Vite demo content from `App.jsx` and `index.css`, but keep
   the task comment at the top of `App.jsx`.
5. `main.jsx` and `index.html` come from the template — leave them alone
   apart from the page title.

**Done when:** `npm run dev` serves a blank Tailwind-styled page on
:5173, and `fetch('/api/health')` from the browser console reaches Flask
through the proxy.

---

## Not in Milestone 1

Parked deliberately. Don't build these yet; note them so they don't feel
like omissions during review.

- Scanning a sample file against the compiled rule (`yara_x.Scanner`)
- Rule templates / snippet library
- Import an existing `.yar` file, export the current rule
- Rule metadata form (author, date, hash, reference) → generated `meta:` block
- Performance warnings (short atoms, unanchored regexes)
- Persistence — there is no database and no auth in Milestone 1, and
  adding either changes the threat model. Decide consciously, later.

---

## Milestone 2 — public hosting

The app will be hosted publicly and monetised with ads. Both change the
threat model, so these are tasks, not afterthoughts.

### Hosting

| # | Task | Where |
|---|------|-------|
| H1 | `MAX_CONTENT_LENGTH` in the Flask config | `backend/app.py` |
| H2 | Rate limit `/api/compile` per IP | `backend/app.py` |
| H3 | Security headers: CSP, `X-Content-Type-Options`, `Referrer-Policy` | `backend/app.py` |
| H4 | Log lengths and error codes — never rule bodies | `backend/api/rules.py` |

**H1 is the one that matters first.** `compile_rule`'s 64 KB guard runs
*after* Flask has read and JSON-parsed the entire request body into
memory. `MAX_CONTENT_LENGTH` rejects oversized bodies at the transport
layer. Keep both: transport cap, then application cap.

**H4:** rules carry IOCs, internal hostnames, and unreleased detection
logic. Logging `source` turns your log file into a data-exposure
incident waiting to happen.

### Ads

| # | Task | Where |
|---|------|-------|
| A1 | Ad slot inside a **cross-origin iframe** | `frontend/src/components/` |
| A2 | CSP allowlist naming the ad domains explicitly | `backend/app.py` |
| A3 | Cookie consent banner — consent *before* any ad cookie is set | `frontend/src/` |
| A4 | Privacy policy page | `frontend/src/` |
| A5 | README note disclosing the third-party script | `README.md` |

**A1 is the whole game.** A `<script>` tag on your page can read the
editor's contents — including whatever rule the user just pasted. A
cross-origin iframe cannot. If your ad network only supplies script
tags, host the ad on a separate origin and iframe that. Never place ad
script on the same origin as the editor.

**A2:** allowlist specific domains in `frame-src`, keep `script-src`
tight, no wildcards. Write down which domains you allowed and why.

**A3/A4:** UK/EU law requires consent before setting ad cookies, and
Google requires it for AdSense in the UK/EEA. A banner and a privacy
policy are prerequisites for serving ads at all, not polish.

**A5:** state plainly that the page loads third-party ad script and
that users shouldn't paste sensitive rules. Honest disclosure beats a
security section that quietly omits it — and a reviewer will check.

Note: AdSense often rejects single-purpose tool sites as thin content.
Budget for a rejection and a docs section to answer it.

---

## Milestone 3 — make it look like a real product

Milestone 1 proved the engineering works. None of the below is hard;
all of it is the difference between a demo and something a stranger
trusts enough to paste a real rule into.

### Tier 1 — do these first, they cost minutes

| # | Task | Where |
|---|------|-------|
| P1 | Page title, favicon, meta description, Open Graph tags | `frontend/index.html` |
| P2 | Replace the "MILESTONE STABLE" badge with a real tagline | `frontend/src/App.jsx` |
| P3 | Copy to clipboard + download `.yar` | `frontend/src/components/` |
| P4 | `git init`, `.gitignore` (Task 0), first commit, push to GitHub | repo root |

**P1 is the single biggest credibility win in the project.** The tab
currently reads `frontend` and the favicon is Vite's default. That
string appears in browser tabs, bookmarks, search results and every
link preview. Without OG tags, sharing the URL renders a bare link with
no card.

**P2:** a cold visitor sees an editor and no explanation. One sentence —
what it does, and that nothing leaves their browser except the rule
text. `MILESTONE STABLE` is a note to yourself; it reads as unfinished.

**P3:** right now the only way to get a rule out is to select the text
by hand. A tool you can't export from is a demo.

**P4 is a blocker for deploying** — Render builds from a GitHub repo,
not from your laptop. Write `.gitignore` BEFORE the first commit.

### Tier 2 — content and discoverability

| # | Task | Where |
|---|------|-------|
| P5 | About page — what it is, who built it, what it doesn't do | `frontend/src/` |
| P6 | Privacy policy (**required** before ads — see A4) | `frontend/src/` |
| P7 | Terms + contact route | `frontend/src/` |
| P8 | `robots.txt` and `sitemap.xml` | `frontend/public/` |
| P9 | A few starter rule templates in a dropdown | `frontend/src/` |

P5–P7 are also the answer to AdSense's "thin content" rejection: a
single tool page with no supporting material is the classic reason.

### Tier 2b — the things a "real site" checklist catches

| # | Task | Where |
|---|------|-------|
| P13 | Footer with privacy / terms / contact / GitHub links | `frontend/src/` |
| P14 | JSON-LD `SoftwareApplication` structured data | `frontend/index.html` |
| P15 | Test on an actual phone, fix what's broken | `frontend/src/` |
| P16 | Cookieless analytics (Plausible / GoatCounter) | `frontend/index.html` |
| P17 | Accessibility audit with WAVE or axe | whole app |

**P13:** the footer is where people look for legal pages. You currently
have none, so P6/P7 have nowhere to live.

**P14:** ten lines, and it gets you a richer search result. Describe the
app, its category, and that it's free.

**P15:** the layout has `md:` breakpoints, but CodeMirror on a phone is a
different problem — small tap targets and the on-screen keyboard covering
the editor. Resizing the desktop browser will not reveal either. Use a
real device.

**P16 — read this before picking a tool.** Google Analytics sets cookies,
which drags you into consent-banner territory (A3) for analytics as well
as ads. Plausible and GoatCounter are cookieless and stay outside PECR
consent requirements. Given you're adding a banner for ads anyway, the
choice is about how much you have to disclose, not whether you have a
banner.

**P17:** you've done `aria-live` and keyboard handling on the error rows.
An audit finds the rest — heading order, focus visibility, contrast
ratios against the new palette. Do this AFTER the palette settles, since
contrast is the most likely failure.

### Tier 3 — product depth

| # | Task | Where |
|---|------|-------|
| P10 | F7 syntax highlighting | `frontend/src/editor/yaraLanguage.js` |
| P11 | Import an existing `.yar` file | `frontend/src/` |
| P12 | Scan a sample file against the compiled rule (`yara_x.Scanner`) | new backend endpoint |

**P10:** a code editor rendering monochrome text looks unfinished, and
it's the first thing a YARA user notices.

**P12 is the biggest genuine feature gap.** "Does my rule actually match
this file?" is the first question any real user asks. It also changes
the threat model — you'd be accepting uploaded binaries — so treat it as
its own milestone with its own review, not a bolt-on.

---

## Standing constraints

These apply to every task; the reviewer will check them each time.

- The compile endpoint parses **untrusted input**. Size caps before
  parsing, no unbounded work per request.
- Error text is **user-controlled**. It goes into the DOM as text, never
  as HTML.
- No secrets in the repo. No sample binaries in git.
- Never log rule source. Lengths and error codes only.
- No urgency marketing — countdown timers, "Act now" CTAs, fake scarcity.
  Standard advice for retail sites; for a security tool it is the fastest
  way to make an analyst distrust you and close the tab.
- No third-party script on the editor's origin. Ads live in a
  cross-origin iframe.
- Anything you decided against, write down *why* in a comment. A
  reviewer reading "not enforced yet, because X" trusts the code more
  than one that quietly omits it.
