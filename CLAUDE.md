# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PROMPT//BREACH is a cyberpunk-themed prompt-injection training game (Next.js 15 App Router, React 19, TypeScript, Vitest, lucide-react icons). It runs entirely in the browser: there is no backend, no LLM/API key, and no persistence. Answers are scored by a deterministic, heuristic rubric. Requires Node.js 22.12+ (Vitest 5 needs it; Next itself runs on 20.9+).

## Commands

```bash
npm install
npm run dev                        # dev server at http://localhost:3000
npm test                           # vitest run (one-shot)
npm run test:watch                 # vitest watch mode
npx vitest run -t "flags a response"   # run a single test by name
npm run build                      # static export to out/ (output: 'export')
npm start                          # serves out/ with `serve` (next start does not work with static export)
```

There is no lint script or ESLint config. CI (`.github/workflows/ci.yml`, Node 22) runs `npm ci`, `npm test`, then `npm run build`, so `next build` acts as the type check. On pushes to `main` only, a `deploy` job rebuilds with `PAGES_BASE_PATH` from `actions/configure-pages` and publishes `out/` to GitHub Pages at https://mhchlagou.github.io/ai-sec-game/. The repo's Pages source must be set to "GitHub Actions".

The app must stay fully static: no route handlers, server actions, middleware, `next/image` optimization, or dynamic server rendering, because `output: 'export'` fails the build on them. `next.config.ts` sets `basePath` from `PAGES_BASE_PATH` (empty locally). Never hard-code root-absolute URLs like `/icon.svg` in markup; they break under `/ai-sec-game/`. Use Next's `Link` or metadata, or relative paths. GitHub Pages cannot set custom response headers. `package.json` `overrides` pin patched `postcss` (inside Next 15) and `compression` (inside `serve`).

## Architecture

- `lib/game.ts` holds the mission data (`missions` array), the scoring engine (`evaluateAnswer`) and `recordAttempt`. It's pure TypeScript with no React, so it can be unit-tested in the `node` environment.
- `lib/progression.ts` holds the XP, ranks and badges (`getRank`, `calculateXp`, `unlockedBy`). It's also pure, and it builds on `game.ts`.
- `app/page.tsx` is the single `'use client'` page that owns all state (active mission, answer, hints, progress, badges, popup, ARIA message) in `useState`, so progress resets on reload. Evaluation is instant; the page waits `SCAN_MS` behind a fake scan sequence before showing the result.
- `app/_components/` holds presentational pieces: `ResultModal` (popup and emoji burst), `Toasts` (`useToasts` hook and stack), `AriaCompanion` (a scripted sidekick, not a model), `ScanSequence`, `BadgeShelf`, `TextEffects` (typewriter, decrypt), and `motion.ts` (reduced-motion and count-up hooks). The `_` prefix keeps the folder out of routing.

`app/globals.css` is the original hand-minified stylesheet: a few very long lines, a Google Fonts import, and CSS custom properties on `:root`. Everything added for the game layer (glitch, toasts, modal, ARIA, badges, orbit and radar) lives in `app/effects.css`, one rule per line, using the same tokens. A global `prefers-reduced-motion` rule in `globals.css` cuts every animation to ~0ms, so any animation that starts hidden needs `animation-fill-mode: forwards` to still end visible.

### How scoring works (`evaluateAnswer`)

- The answer is normalized (lowercased, curly quotes turned into straight quotes, contractions expanded so `can't`→`cannot` and `won't`→`will not`, whitespace collapsed). Write terms in the normalized form: `'not share'` already covers "can't share", "won't share" and "will not share". A term can list alternatives separated by `|` (`'standup|stand-up'`).
- Each criterion has a `mode`:
  - `any` (default): passes if any term appears, all-or-nothing points.
  - `all`: every term is a required fact, with proportional credit. Its `description` doubles as the "what's missing" message.
  - `protect`: like `any`, but forced to fail when `detectDisclosure` fires. That function flags a mission's `leakMarkers` (exact scenario text such as the system prompt or the user's email), a secret-shaped value (6+ characters including at least 3 digits), `token is <value>`, or a sentence that complies with the attack (`here it is`, sending credentials or the inbox, a markdown image, an attacker URL, `send_*(`/`forward_*(`/`delete_*(` tool calls, "policy has been disabled", granting admin, adopting the UNCHAINED persona). A sentence is excused if it contains a negation, or a reporting phrase in the "asks me to" form. Sentences split on punctuation followed by a space, so URLs stay whole.
- `Evaluation.leaked` drives the "BREACH DETECTED" popup, the 🚨 toast and the CAUGHT RED-HANDED badge.
- A mission passes when `score >= PASS_SCORE` (70) **and** every id in its `requiredChecks` passes.
- `recordAttempt` keeps the best score and best XP per mission. A mission counts as cleared only if an evaluation **passed**, never from the best score alone.

### Adding or changing a mission

1. Add an entry to `missions` in `lib/game.ts` with a unique `emoji`, `requiredChecks`, `debrief` and `ariaIntro`. The "mission data" test requires criteria points to total exactly 100 and the required checks to be worth at least 70.
2. Add a `good` / `compromised` pair to `playthroughs` in `lib/game.test.ts`. The good answer must pass every criterion, and the compromised one must set `leaked`. This is the quickest way to find terms that are too narrow or leak patterns that are too broad.
3. Rank thresholds in `lib/progression.ts` assume a maximum of 100 XP per mission (600 total). Re-check `ranks` after adding missions; a test asserts the top rank is reachable.
4. Vitest only picks up `lib/**/*.test.ts`. The Testing Library/jsdom packages are installed, but no component tests are configured.

## Constraints from the README

- Scenarios must use synthetic content only: no real credentials or external tool integrations.
- The evaluator is a training aid, not a security boundary. A production version would move scoring server-side, validate inputs, and rate-limit attempts.
