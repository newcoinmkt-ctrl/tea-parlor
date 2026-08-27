---
name: github-game-importer
description: Use when finding, evaluating, importing, or adapting existing open-source GitHub game projects for Tea Parlor, including doudizhu, Texas Hold'em, mahjong, H5 card-room UI, game engines, rules engines, and demo code. Enforces license, security, and adapter-boundary checks before any code is copied into the project.
---

# GitHub Game Importer

Use this skill before searching GitHub or importing any existing game code into Tea Parlor.

## Required Project Context

Read these first:

1. `AGENTS.md`
2. `docs/03-架构实施/棋牌室游戏开发说明.md`
3. `docs/04-AI开发规则/GitHub现成游戏获取设置.md`
4. Relevant rule docs, especially `docs/02-规则资料/JJ斗地主规则与玩法说明.md` for 斗地主.

## Import Policy

Do not copy code directly into production paths. Use this pipeline:

1. Search candidates.
2. Record candidates in `docs/05-GitHub候选游戏/候选仓库评估表.md`.
3. Verify license, maintenance, tech stack, tests, security risks, and fit.
4. Pull only into an isolated sandbox path, never into `tg/src` or future `apps/*` directly.
5. Extract only allowed pieces:
   - Pure rules engine.
   - Test vectors.
   - Non-branded UI layout ideas.
   - Adapter patterns.
6. Wrap imported logic behind the Tea Parlor Game Adapter contract.
7. Add tests before integration.
8. Run local audit and any H5 Playwright checks.

## License Rules

Prefer: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC.

Quarantine and ask before use: GPL, AGPL, LGPL, unknown, no license, commercial-only, unclear asset license.

Never import:

- QQ/JJ brand assets, logos, sounds, images, or copied visual files.
- Real-money casino/wallet code.
- Obfuscated code or code that fetches remote executable scripts.
- Code requiring closed-source server dependencies.

## Search Targets

Start with engine-first queries:

- 斗地主: `doudizhu javascript rules engine`, `dou dizhu typescript`, `landlord poker h5`, `斗地主 h5 source`.
- Texas Hold'em: `texas holdem engine typescript`, `poker hand evaluator javascript`, `holdem game server node`.
- Mahjong: `mahjong rules engine typescript`, `mahjong h5 source`, `riichi mahjong engine javascript`, `mahjong hand evaluator`.
- H5 UI: `card game lobby h5`, `poker table react`, `board game lobby react`.

## Fit Criteria

Score candidates against:

- License clarity.
- Active maintenance or simple readable code.
- Rules correctness and tests.
- Pure engine boundaries.
- No direct database/wallet coupling.
- H5 mobile fit.
- Low asset/IP risk.
- Ease of adapting to `createRoom`, `joinRoom`, `applyAction`, `getPublicState`, `settleRound`, `replay`.

## Output Requirements

For every candidate, report:

- GitHub URL and commit/tag inspected.
- License.
- What can be reused.
- What must not be reused.
- Security/IP risks.
- Adapter plan.
- Required tests.
- Recommendation: `adopt`, `reference-only`, `quarantine`, or `reject`.

## Validation

After any import or adaptation:

```bash
cd /Users/newcoin/Desktop/棋牌室/tg
npm run audit:local
npm run demo
```

For H5 code, add Playwright mobile and desktop screenshots before calling it demo-ready.
