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

Each mission is played from two sides, chosen by the `role: 'blue' | 'red'` state in the page:
blue = defend (the AI resists a given attack), red = attack (write a payload that breaks a scripted bot).

The app is bilingual (English/French), with a `lang: 'en' | 'fr'` state in the page (persisted to
`localStorage` as `pb-lang`, defaulting to French for French-locale browsers).
- `lib/i18n.ts` holds `Lang`, `LocalizedString` ({en, fr}), the `L(value, lang)` picker, and the `ui`
  dictionary of chrome strings (`ui.en`/`ui.fr`, keys enforced equal by `satisfies`).
- All mission display text is `LocalizedString`; `evaluateAnswer`/`simulateAttack` take a `lang` only
  to localize their OUTPUT (labels, explanations, summaries). **Matching stays language-agnostic**:
  keyword `terms` are bilingual via `|` alternatives (e.g. `'not share|ne partagerai pas'`), and the
  leak-detector regexes include French. So the scorer never branches on language. French playthrough
  tests in `game.test.ts`/`redteam.test.ts` lock this; a `localization completeness` test checks every
  mission field has non-empty `fr`.
- Components that render literal strings take a `lang` prop and read from `ui[lang]`. Add a new UI
  string to BOTH `en` and `fr` in i18n (the type enforces it) rather than hard-coding text in JSX.

- `lib/game.ts` holds the blue mission data (`missions`), the defense scorer (`evaluateAnswer`), `recordAttempt`, the shared `MissionProgress` type (blue + red fields), and the exported text helpers `normalize`/`hasTerm`/`lowerFirst`. Pure TypeScript, unit-tested in `node`.
- `lib/redteam.ts` holds the red mission data (`redMissions`), the scripted target bot (`simulateAttack`) and `recordAttack`. Each `RedMission` has `vectors` (attack elements, scored like criteria but matched by `terms` and/or regex `patterns` on the raw text), `requiredVectors`, and canned `breachReply`/`holdReply`. The bot is heuristic: it only recognizes the mission's technique, so a block is not proof an attack would fail a real model.
- `lib/progression.ts` holds XP, ranks and badges. `totalXp` sums both sides; `unlockedBy` (defense) and `unlockedByAttack` (attack) award badges, including cross-side `full-spectrum` and `hardened` via `progressBadges`.
- `app/page.tsx` is the single `'use client'` page. It owns all state in `useState` (so progress resets on reload), keeps separate `answer`/`attack` inputs and `evaluation`/`attackResult` reports per side, and builds a `ResultData` for the modal from whichever side ran. Scoring is instant; the page waits `SCAN_MS` behind a fake scan sequence. A `role-banner` under the DEFEND/ATTACK toggle states which side the player is on.
- `app/_components/` holds presentational pieces: `ResultModal` (ResultData-driven, serves both sides), `Toasts`, `AriaCompanion` (a scripted sidekick, not a model), `ScanSequence`, `BadgeShelf`, `TextEffects`, and `motion.ts`. The `_` prefix keeps the folder out of routing.

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

### How the attack simulator works (`simulateAttack`)

- Each `AttackVector` passes if any `terms` alternative matches the normalized payload OR any `patterns` regex matches the raw payload (raw, so base64 blobs and markdown images survive normalization).
- The bot is breached when `score >= PASS_SCORE` (70) **and** every id in `requiredVectors` passed. Breach shows the canned `breachReply` (deliberately showing the bot leaking); otherwise `holdReply`.
- `recordAttack` writes the red fields of `MissionProgress` and leaves the blue fields untouched (and vice versa for `recordAttempt`).

### Adding or changing a mission

1. Add the blue entry to `missions` in `lib/game.ts` (unique `emoji`, `requiredChecks`, `debrief`, `ariaIntro`) **and** the red entry to `redMissions` in `lib/redteam.ts` with the same `id`. A test asserts the two lists cover the same ids. Both blue criteria and red vectors must total exactly 100 points, with the required set worth at least 70.
2. Add a `good`/`compromised` pair to `playthroughs` in `lib/game.test.ts` and a `landing`/`blocked` pair to `attacks` in `lib/redteam.test.ts`. The good/landing cases must pass every required check/vector; the compromised case must set `leaked`. This is the quickest way to find terms that are too narrow or patterns that are too broad.
3. Rank thresholds in `lib/progression.ts` assume up to 100 XP per mission per side. A test asserts the top rank is reachable.
4. Vitest only picks up `lib/**/*.test.ts`. The Testing Library/jsdom packages are installed, but no component tests are configured.

## Constraints from the README

- Scenarios must use synthetic content only: no real credentials or external tool integrations.
- The evaluator is a training aid, not a security boundary. A production version would move scoring server-side, validate inputs, and rate-limit attempts.
