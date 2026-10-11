# PROMPT//BREACH

A cyberpunk prompt-injection training game. Every mission is played from **both sides**: attack a scripted target bot (🔴 red team) to see how an injection lands, then defend against the same technique (🔵 blue team). It runs entirely in the browser with a deterministic rubric—no model API key, live tools, external systems, or real secrets required.

## Missions

| # | Mission | Attack | Difficulty |
|---|---|---|---|
| 01 | 🔐 **The Vault** | Direct prompt injection and instruction hierarchy | Initiate |
| 02 | 📄 **Trojan Document** | Indirect injection hidden in untrusted document content | Operative |
| 03 | 🎭 **Mirror Mask** | Role-play jailbreak / persona swap | Operative |
| 04 | 👻 **Ghost Pixel** | Data exfiltration through a markdown image URL | Operative |
| 05 | 🧬 **Cipher Drop** | Obfuscated (base64) instruction in a support ticket | Elite |
| 06 | 🤖 **Rogue Agent** | Tool-using email agent hijacked by an injected email | Elite |

Each mission includes a scenario, progressive hints, a free-text response, and criterion-by-criterion scoring. A score of 70/100 clears a mission, and each mission also requires its critical security checks to pass. Answers that leak protected data or carry out the attacker's request are flagged as a breach.

## Languages

The game ships in **English and French**, switchable with the EN/FR toggle in the header. It defaults to French for French-locale browsers and remembers the choice (localStorage). Everything is translated — UI, mission scenarios, hints, debriefs — and the scorer accepts answers in either language: keyword lists are bilingual and the leak detector recognizes French, so a French player reads French and types French.

## Red team + blue team

Each mission has two sides, chosen with the **DEFEND / ATTACK** toggle:

- 🔵 **Defend (blue):** you are the AI under attack. The hostile prompt is given; write the response that resists it.
- 🔴 **Attack (red):** you are the attacker. Write a prompt that breaks a scripted target bot. The bot is a deliberately weak stand-in that only falls for the mission's technique — it is **not** a real model, so a creative attack it wasn't written to recognize is scored as blocked even if it would work on a live LLM. Clearing both sides earns the ☯️ Full Spectrum badge.

## Game features

- XP and operator ranks (🐣 Script Kiddie → 🧠 Prompt Architect), plus six unlockable badges.
- Result popups with score count-up, debrief, and an emoji burst on success; toasts for hints, badges, and rank-ups.
- ARIA 🤖, a scripted sidekick that reacts to your answers. It is not a model: every line is canned, so no API key is needed.
- Typewriter scenarios, decrypting hints, glitch titles, and a radar hero. All motion respects `prefers-reduced-motion`.
- Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> (or <kbd>⌘</kbd> + <kbd>Enter</kbd>) to run the evaluation.

## Requirements

- Node.js 22.12 or later (the test runner, Vitest 5, requires it)
- npm

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Test

```bash
npm test
```

## Build

```bash
npm run build   # static export to out/
npm start       # serves out/ at http://localhost:3000
```

The site is a fully static export (`output: 'export'`): there is no server code, so `out/` can be hosted on any static host.

## Deploy (GitHub Pages)

Live site: **https://mhchlagou.github.io/ai-sec-game/**

`.github/workflows/ci.yml` tests and builds on every push and pull request. On pushes to `main`, it rebuilds with the Pages base path (`/ai-sec-game`, supplied by `actions/configure-pages`) and deploys to GitHub Pages. Other branches and pull requests are only verified.

One-time setup: in the GitHub repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. No secrets are needed.

To preview the Pages build locally:

```bash
PAGES_BASE_PATH=/ai-sec-game npm run build   # then serve out/ under /ai-sec-game/
npm run build                                # rebuild for root before using npm start again
```

## Security notes

- Scenarios use synthetic content only. There are no real credentials or external tool integrations.
- The scoring engine is deterministic and intentionally heuristic so it is easy to test and understand.
- The evaluator is a training aid, **not** a production security boundary or a guarantee that an AI system is safe.
- Progress is kept in page state only and is reset when the page is reloaded. No account or backend is required.
- For a production version, move authoritative evaluation and scoring to a server, validate all inputs, rate-limit attempts, and never put secrets in prompts or client-side bundles.

## Tech stack

Next.js App Router, React, TypeScript, CSS, Vitest, and Lucide icons. The application structure follows the [Next.js App Router conventions](https://nextjs.org/docs/app).
