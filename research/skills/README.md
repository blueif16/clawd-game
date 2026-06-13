# Per-node research records (reusable evidence base)

Each node of the `game-omni` pipeline is designed by its own research sub-agent, which records
its multi-source evidence here BEFORE writing the node's SKILL. These records are the reusable
ground for tuning the skills later — every practice in a skill should trace back to a citation here.

**Sources per record:** deep reads of `reference-repos/` + multi-source online research
(Reddit practitioner sentiment via Apify, Exa semantic web search, YouTube transcripts via yt-rag —
ingesting videos when a topic needs deeper investigation). Only retrieved sources are cited; no
imagination.

| Node | Skill | Research record | Status |
|---|---|---|---|
| W0 Classify | `packages/skills/classify-game/SKILL.md` | [w0-classify-research.md](./w0-classify-research.md) | ✅ done |
| W1 Spec | `packages/skills/write-gdd/SKILL.md` | [w1-spec-research.md](./w1-spec-research.md) | ✅ done |
| W2 Scaffold | `packages/skills/scaffold/SKILL.md` | [w2-scaffold-research.md](./w2-scaffold-research.md) | ✅ done |
| W3 Assets | `packages/skills/assets/SKILL.md` | [w3-assets-research.md](./w3-assets-research.md) | ✅ done |
| W4 Implement | `packages/skills/implement-milestone/SKILL.md` | [w4-implement-research.md](./w4-implement-research.md) | ✅ done |
| W5 Verify+Fix | `packages/skills/verify/SKILL.md` | [w5-verify-research.md](./w5-verify-research.md) | ✅ done |

_Orchestration: built one sub-agent per node, in runtime order; each reads the previous node's
actual committed artifact + skill from disk before designing itself._

---

**Cross-node design foundations:** [`../game-design-foundations.md`](../game-design-foundations.md) — a thorough, cited reference grounding the DESIGN nodes (W0/W1/VERIFY-1) in game-design theory: the game-type→needs taxonomy, scoring philosophy (when to score, MAX-score, IDEMPOTENT rewards — the score-meaning fix), "start higher not a tutorial" + flow/difficulty-floor, scaffold-then-layer level ladders, interesting decisions/risk-reward, win/lose integrity, and an Application Map of how each principle should change the three design skills.
