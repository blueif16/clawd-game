// ============================================================================
// game-omni — the generation engine, as ONE Pi-portable Claude Code Workflow.
//
// SINGLE SOURCE OF TRUTH. One prompt -> a verified, playable Phaser 2D web game
// in one pass. Nodes coordinate ONLY through on-disk artifacts under the project
// dir (the filesystem IS the contract). Each node loads an evidence-grounded
// SKILL (packages/skills/<name>/SKILL.md) authored by its own research sub-agent.
//
// Built INCREMENTALLY, node by node (Hermes discipline: improve a wave by editing
// its SKILL; improve the chain by editing THIS file). Each node is added here only
// after its design sub-agent has researched it, written its SKILL, and committed
// its artifact schema — so what runs is always real, never assumed.
//
//   CHAIN (7 nodes — separation of powers: a DESIGN gate before code, a QA gate after):
//   W0 Classify -> W1 Spec -> VERIFY-1 Design -> W2 Scaffold -> W3 Assets -> (per milestone: W4 Execute -> VERIFY-2 QA)
//
// WHY two verify nodes (2026-06-10 redesign): the old single verify node was graded through state the
// IMPLEMENTER itself populated ("the student grades its own homework") AND it conflated "is the design
// good?" with "is the code correct?". We split those. VERIFY-1 judges + HARDENS the design into a frozen,
// winnable spec/blueprint.json BEFORE any code (static: rubric + kinematic feasibility math + the
// "no undesirable solution" threat-on-path check). W4 EXECUTE then builds that blueprint VERBATIM with
// ZERO design latitude (a missing number => HALT + escalate, never invent). VERIFY-2 checks IMPLEMENTATION
// FIDELITY to the frozen blueprint — explicitly NOT gameness — incl. an isomorphic-perturbation gate that
// catches a build contorted to pass the exact test. The human is steward, not a runtime gate.
//
// Pi-portability: every node is a single agent() call with a forced-JSON schema; fan-outs (milestones,
// asset slots) are discovered-once lists with static defaults; the design verdict + the QA marker are
// parseable on-disk fields, never a result-dependent branch the extractor can't see.
// ============================================================================

export const meta = {
  name: 'game-omni',
  description: 'Prompt -> verified, playable Phaser 2D web game in one pass. Nodes coordinate through on-disk artifacts; each loads an evidence-grounded skill. Pi-portable.',
  phases: [
    { title: 'W0 Classify', detail: 'Designer: route prompt -> physics-first archetype + one-line core loop + explicit scope-cut. Writes spec/classification.json.' },
    { title: 'W1 Spec', detail: 'Designer: slim GDD + milestone list (3-5) with per-milestone runtime assertions. Writes spec/gdd.json + spec/PLAN.md.' },
    { title: 'VERIFY-1 Design', detail: 'Design Critic (pre-code, static): judge + HARDEN the thesis into a winnable, complete, frozen blueprint (rubric + kinematic feasibility + threat-on-path). Writes spec/blueprint.json + spec/DESIGN_REVIEW.md.' },
    { title: 'W2 Scaffold', detail: 'Coder: copy genre template -> running empty project + STRUCTURE.md + index.json (asset slots); merges the blueprint\'s COMPLETE config.' },
    { title: 'W3 Assets', detail: 'Artist: fill public/assets/ + ASSETS.md from index.json. Placeholder-first (gemini toggle).' },
    { title: 'W4 Execute', detail: 'Executor (zero design latitude): build the frozen blueprint VERBATIM (coordinates/routes/respawn flow); populate window.__GAME__ for real; build green; HALT + escalate on any missing number, never invent.' },
    { title: 'VERIFY-2 QA', detail: 'Playtester (bounded self-fix <=3): headless -> user-flow fidelity from known preconditions + completability replay + invariants + ISOMORPHIC PERTURBATION -> VALIDATION_PASSED/FAILED. Writes verify/report.M<id>.json. NOT gameness.' },
  ],
}

// args.prompt    = the raw game idea (string)
// args.projectDir = where the game + artifacts are written (default: out/game)
const PROMPT = args && args.prompt ? String(args.prompt) : ''
const PROJECT = (args && args.projectDir) ? String(args.projectDir) : 'out/game'

// The shared discipline preamble injected into EVERY node (Hermes: the chain's
// constitution lives here, not copied into each skill).
const PREAMBLE = `You are ONE node in the game-omni generation pipeline. Non-negotiable discipline for every node:
- THE FILESYSTEM IS THE CONTRACT. You coordinate with the other nodes ONLY through on-disk files under the project dir "${PROJECT}/". Read your inputs from those files; write your output artifact to disk. Your chat/JSON output is the orchestrator's receipt — the durable truth is the file you wrote.
- LOAD AND FOLLOW YOUR SKILL. Read the SKILL.md named below and do exactly what it instructs. The skill is the evidence-grounded instruction set (it cites its sources); this wiring prompt only tells you which node you are.
- GENERALIZE. Behave correctly for ANY game prompt — never hard-code the specific game in front of you.
- STAY IN YOUR LANE. Do only this node's job and then stop; downstream nodes do theirs.`

function nodePrompt(skillPath, body, contractStr = '') { return `${PREAMBLE}\n\nSKILL TO LOAD AND FOLLOW: ${skillPath}\n\n${body}${contractStr ? '\n\n' + contractStr : ''}` }

// The 4th contract layer (artifact contract) — ONE declaration renders the Definition-of-Done
// prose (the model reads) AND the DRIVER-ARTIFACTS/DRIVER-OWNS/DRIVER-READ-SCOPE markers
// (pi-runner/run.mjs parses, verified independent of the self-report). `artifacts`/`owns` are
// PROJECT-relative (the driver resolves them forgivingly); `readScope` is the node's FULL legitimate
// READ surface — its own project tree PLUS the shared skill/template roots it is pointed at — joined
// AS-IS (repo-relative, matching this workflow's path style; resolved against the repo-root cwd under
// --sandbox, inert otherwise). EVERY producing node declares one, the same tier as artifacts/owns.
// Spec: ~/.claude/skills/transform-workflow-to-pi/reference/artifact-contract.md (+ read-scope-sandbox.md).
function contract({ artifacts = [], owns = [], readScope = [], note = '' }) {
  const abs = (p) => `${PROJECT}/${p}`
  return [
    'OUTPUT CONTRACT — you are DONE only when EVERY file below exists and is non-empty at EXACTLY its path. Write NOTHING outside the owned paths. If you cannot, set status="blocked" and say why — do NOT exit clean (an empty or wrong-path artifact set is a FAILURE, not an ok).',
    artifacts.length ? `DRIVER-ARTIFACTS: ${artifacts.map(abs).join(' ')}` : '',
    `DRIVER-OWNS: ${(owns.length ? owns : artifacts).map(abs).join(' ')}`,
    readScope.length ? `DRIVER-READ-SCOPE: ${readScope.join(' ')}` : '',
    note ? `OWNED-PATH NOTE: ${note}` : '',
  ].filter(Boolean).join('\n')
}

// ----------------------------------------------------------------------------
// W0 — Classify  (skill: packages/skills/classify-game/SKILL.md)
// Artifact: ${PROJECT}/spec/classification.json
// Schema inlined from packages/skills/classify-game/classification.schema.json
// (workflow scripts have no filesystem access at eval time, so the schema lives here).
// ----------------------------------------------------------------------------
const CLASSIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['prompt', 'archetype', 'coreLoop', 'coreVerb', 'physicsProfile', 'reasoning', 'confidence', 'scopeCut'],
  properties: {
    prompt: { type: 'string', minLength: 1, description: 'The raw args.prompt, copied verbatim.' },
    archetype: { type: 'string', enum: ['platformer', 'top_down', 'grid_logic', 'tower_defense', 'ui_heavy'], description: 'Physics-first routing key. W2 scaffolds templates/modules/<archetype>. Closed set.' },
    coreLoop: { type: 'string', minLength: 1, description: 'One self-enclosed sentence: player verb + goal/win + obstacle + fail/reset.' },
    coreVerb: { type: 'string', minLength: 1, description: 'The single central player verb.' },
    physicsProfile: {
      type: 'object', additionalProperties: false,
      required: ['hasGravity', 'perspective', 'movementType'],
      properties: {
        hasGravity: { type: 'boolean' },
        perspective: { type: 'string', enum: ['side', 'top_down', 'none'] },
        movementType: { type: 'string', enum: ['continuous', 'grid', 'path', 'ui_only'] },
      },
    },
    reasoning: { type: 'string', minLength: 1, description: '1-2 sentences: which physics KEY QUESTION decided the archetype.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    scopeCut: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 }, description: 'What is deliberately OUT of v1 (4-8 entries). The anti-slop guardrail.' },
    coreFantasy: { type: 'string', description: 'Optional <=8-word emotional hook.' },
    lowConfidence: { type: 'boolean', description: 'Optional convenience mirror of confidence=="low".' },
  },
}

phase('W0 Classify')
log(`game-omni: classifying prompt -> archetype + core loop + scope-cut`)
const w0 = await agent(
  nodePrompt('packages/skills/classify-game/SKILL.md', `You are the W0 Classify node (Designer role), the FIRST node of the pipeline.

Input: args.prompt = the user's raw game idea:
"""
${PROMPT}
"""

Do exactly three things, then stop:
1. Classify the prompt into ONE physics-first archetype from the closed set {platformer, top_down, grid_logic, tower_defense, ui_heavy} — by PHYSICS and PERSPECTIVE, never by the genre word. Apply the SKILL's three physics questions, disambiguation rules, and tie-break order. Emit the structured physicsProfile.
2. Write the one-line core loop (player verb + goal + obstacle + fail; self-enclosed) and the single coreVerb.
3. Write an explicit scopeCut (4-8 items) of what is deliberately OUT — the anti-slop guardrail. Cut anything not serving the core loop and the standard over-scope traps; NEVER cut game-feel/juice.

Write exactly one file: ${PROJECT}/spec/classification.json (create ${PROJECT}/spec/ if needed), valid against packages/skills/classify-game/classification.schema.json. Then return the same object as your structured result. On a prompt that fits no archetype, pick the closest, set confidence:"low", and explain in reasoning; default to platformer for empty/gibberish. Classify deterministically (low temperature).`,
    contract({ artifacts: ['spec/classification.json'], owns: ['spec/**'], readScope: [PROJECT, 'packages/skills/classify-game'] })),
  { label: 'W0 classify', phase: 'W0 Classify', schema: CLASSIFICATION_SCHEMA }
)

// ----------------------------------------------------------------------------
// W1 — Spec  (skill: packages/skills/write-gdd/SKILL.md)
// Reads:  ${PROJECT}/spec/classification.json  (archetype, coreLoop, coreVerb, physicsProfile, scopeCut)
// Writes: ${PROJECT}/spec/gdd.json + ${PROJECT}/spec/PLAN.md
// Schema inlined from packages/skills/write-gdd/gdd.schema.json — slim gameDNA + 3-5 milestones,
// each carrying executable runtime assertions (Given setup -> When input -> Then observe+expect)
// over window.__GAME__. W2 must EXPOSE that hook; W5 EXECUTES these assertions. (Emergent contract:
// W1 committed the assertion shape; downstream nodes absorb it.)
// ----------------------------------------------------------------------------
const ASSERTION_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['id', 'describe', 'observe', 'expect'],
  properties: {
    id: { type: 'string', pattern: '^M[1-9][0-9]*-A[1-9][0-9]*$' },
    describe: { type: 'string', minLength: 1, description: 'Human-readable predicate = the failure message.' },
    setup: {
      type: 'object', additionalProperties: false,
      properties: { scene: { type: 'string' }, state: { type: 'object' } },
      description: 'GIVEN — optional precondition. Omit if the fresh scene satisfies it.',
    },
    input: {
      type: 'object', additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['keyPress', 'keyHold', 'click', 'event', 'none'] },
        key: { type: 'string', description: 'DOM/Phaser key name; must appear in controls[].' },
        durationMs: { type: 'integer', minimum: 0 },
        target: { type: 'string', description: 'entity id or event name (e.g. "overlap:player,coin").' },
      },
      description: 'WHEN — synthetic input/event. Omit for at-scene-start checks.',
    },
    observe: { type: 'string', minLength: 1, description: 'THEN — the __GAME__ accessor to read (e.g. player.y, score, status).' },
    expect: {
      type: 'object', additionalProperties: false,
      description: 'Expected change/value of observe. Exactly one comparator.',
      properties: {
        decreases: { type: 'boolean' }, increases: { type: 'boolean' }, changes: { type: 'boolean' },
        unchanged: { type: 'boolean' }, equals: {}, atLeast: { type: 'number' }, atMost: { type: 'number' },
      },
    },
  },
}
const GDD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['meta', 'entities', 'mechanics', 'controls', 'winCondition', 'loseCondition', 'assetList', 'milestones'],
  properties: {
    meta: {
      type: 'object', additionalProperties: false,
      required: ['title', 'archetype', 'coreLoop', 'coreVerb', 'artStyle', 'failModel'],
      properties: {
        title: { type: 'string', minLength: 1 },
        archetype: { type: 'string', enum: ['platformer', 'top_down', 'grid_logic', 'tower_defense', 'ui_heavy'] },
        coreLoop: { type: 'string', minLength: 1 },
        coreVerb: { type: 'string', minLength: 1 },
        coreFantasy: { type: 'string' },
        failModel: { type: 'string', enum: ['health', 'lives', 'respawn', 'none'] },
        artStyle: { type: 'string', minLength: 1, description: "Art note feeding W3; 'placeholder' is valid for v1." },
        physicsProfile: {
          type: 'object', additionalProperties: false,
          properties: {
            hasGravity: { type: 'boolean' },
            perspective: { type: 'string', enum: ['side', 'top_down', 'none'] },
            movementType: { type: 'string', enum: ['continuous', 'grid', 'path', 'ui_only'] },
          },
        },
      },
    },
    subMode: { type: 'string', description: 'Optional within-archetype variant hint for W4.' },
    entities: {
      type: 'array', minItems: 1,
      description: 'Every referenced game object. player MUST be entities[0] (role:player).',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'role', 'description'],
        properties: {
          id: { type: 'string', minLength: 1 },
          role: { type: 'string', enum: ['player', 'enemy', 'obstacle', 'collectible', 'goal', 'projectile', 'tower', 'ui'] },
          description: { type: 'string', minLength: 1 },
          behaviors: { type: 'array', items: { type: 'string' }, description: 'Template capabilities to compose — never invent.' },
          assetSlot: { type: 'string' },
        },
      },
    },
    mechanics: {
      type: 'array', minItems: 1,
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'description'],
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          capability: { type: 'string', description: 'Template hook this maps to; must exist when present.' },
        },
      },
    },
    controls: {
      type: 'array', minItems: 1,
      description: 'Desktop keyboard/mouse only. The menu of inputs assertions may fire.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['input', 'action'],
        properties: { input: { type: 'string', minLength: 1 }, action: { type: 'string', minLength: 1 } },
      },
    },
    winCondition: {
      type: 'object', additionalProperties: false,
      required: ['description', 'observable'],
      properties: { description: { type: 'string', minLength: 1 }, observable: { type: 'string', minLength: 1, description: 'Checkable __GAME__ signal for the final win assertion.' } },
    },
    loseCondition: {
      type: 'object', additionalProperties: false,
      required: ['description', 'observable'],
      properties: { description: { type: 'string', minLength: 1 }, observable: { type: 'string', minLength: 1 } },
    },
    config: { type: 'object', additionalProperties: { type: 'number' }, description: 'Flat tuning numbers W2 merges into gameConfig.json.' },
    assetList: {
      type: 'array',
      description: 'Asset slots -> W2 index.json + W3 generation list. Empty array valid (W3 placeholders).',
      items: {
        type: 'object', additionalProperties: false,
        required: ['slot', 'type', 'description'],
        properties: {
          slot: { type: 'string', minLength: 1 },
          type: { type: 'string', enum: ['sprite', 'animation', 'tileset', 'background', 'image', 'audio'] },
          description: { type: 'string', minLength: 1, description: 'Generation prompt incl. view direction.' },
          frames: { type: 'array', items: { type: 'string' } },
          width: { type: 'integer', minimum: 1 },
          height: { type: 'integer', minimum: 1 },
        },
      },
    },
    milestones: {
      type: 'array', minItems: 3, maxItems: 5,
      description: '3-5 PLAYABLE slices (default 3) in build order. M1 = core loop plays; last includes an end-state.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'name', 'goal', 'acceptanceCriteria', 'assertions'],
        properties: {
          id: { type: 'string', pattern: '^M[1-9][0-9]*$' },
          name: { type: 'string', minLength: 1 },
          goal: { type: 'string', minLength: 1, description: 'The PLAYABLE outcome, not a task.' },
          acceptanceCriteria: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 }, description: '1:1 with assertions; observable behavior only.' },
          assertions: { type: 'array', minItems: 1, items: ASSERTION_SCHEMA },
        },
      },
    },
  },
}

phase('W1 Spec')
log('game-omni: writing slim GDD + 3-5 playable milestones with runtime assertions')
const w1 = await agent(
  nodePrompt('packages/skills/write-gdd/SKILL.md', `You are the W1 Spec node (Designer role). Read ${PROJECT}/spec/classification.json from disk (the original prompt is its \`prompt\` field).

Design the slim Game Design Doc CONSTRAINED to the chosen archetype template's capabilities, and decompose classification.coreLoop into 3-5 PLAYABLE milestones (default 3): M1 = the core loop plays at all; the final milestone includes a win and/or lose end-state. For each milestone write acceptance criteria + executable runtime assertions (Given setup -> When input -> Then observe+expect) over the live game object window.__GAME__, 1:1 with the criteria, asserting OBSERVABLE behavior never implementation. Respect classification.scopeCut as a hard boundary; never invent a capability the template lacks; never cut the juice.

Write exactly two files under ${PROJECT}/spec/, valid against packages/skills/write-gdd/gdd.schema.json: gdd.json and PLAN.md. Then return the gdd.json object as your structured result and stop.`,
    contract({ artifacts: ['spec/gdd.json', 'spec/PLAN.md'], owns: ['spec/**'], readScope: [PROJECT, 'packages/skills/write-gdd'] })),
  { label: 'W1 spec', phase: 'W1 Spec', schema: GDD_SCHEMA }
)

// ----------------------------------------------------------------------------
// VERIFY-1 — Design-quality gate  (skill: packages/skills/verify-design/SKILL.md)
// Reads:  spec/gdd.json (W1 thesis) + spec/classification.json (W0) + spec/PLAN.md
// Writes: spec/blueprint.json (the HARDENED, frozen, winnable design — the NEW single source of truth
//         for W2/W4/VERIFY-2) + spec/DESIGN_REVIEW.md (the human-readable verdict + the math trail).
// Runs BEFORE any code: judges gameness STATICALLY (7-criterion rubric + per-archetype kinematic
// feasibility math + the "no undesirable solution" threat-on-reward-path check), HARDENS every tunable/
// coordinate/route/respawn-flow + the declaredRanges perturbation envelope, authors the reference
// INTENDED SOLUTION (proof-by-existence it is winnable) + the Given/When/Then acceptanceCriteria
// (VERIFY-2's fidelity contract), and emits a verdict. Bounded internal <=2 self-revise that IMPROVES
// the design (never weakens it). Pi-safe: ONE static stage, forced-JSON; the verdict
// (blueprint.verdict.result in {DESIGN_PASSED, DESIGN_FAILED}) is a parseable on-disk field — downstream
// runs unconditionally, a DESIGN_FAILED surfaces as an artifact like W5's marker, never a hidden branch.
// Full validator: packages/skills/verify-design/blueprint.schema.json (to author); this inline schema
// forces the load-bearing structure (rich nested parts stay open).
// ----------------------------------------------------------------------------
const BLUEPRINT_SCHEMA = {
  type: 'object', additionalProperties: true,
  required: ['verdict', 'meta', 'milestones', 'config', 'layout', 'referenceSolution', 'acceptanceCriteria', 'declaredRanges'],
  properties: {
    verdict: {
      type: 'object', additionalProperties: true, required: ['result'],
      properties: {
        result: { type: 'string', enum: ['DESIGN_PASSED', 'DESIGN_FAILED'], description: 'The hard gate (criteria 1-4 on the numbers). DESIGN_FAILED routes back to W1.' },
        rubric: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Per-criterion {criterion, verdict, evidence, numbersUsed}.' },
        hardened: { type: 'array', items: { type: 'string' }, description: 'What VERIFY-1 made concrete that W1 left implicit.' },
        reasons: { type: 'array', items: { type: 'string' }, description: 'On DESIGN_FAILED: the specific criterion + numbers.' },
      },
    },
    meta: { type: 'object', additionalProperties: true },
    entities: { type: 'array' }, mechanics: { type: 'array' }, controls: { type: 'array' },
    winCondition: { type: 'object', additionalProperties: true }, loseCondition: { type: 'object', additionalProperties: true },
    config: { type: 'object', additionalProperties: true, description: 'COMPLETE hardened tunables (every key the archetype needs — no missing number for the executor).' },
    layout: { type: 'object', additionalProperties: true, description: 'Concrete placement: playerSpawn, goal, rewards[], threats[] (route + timing), bounds.' },
    coupling: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Threat-on-reward-path per reward/goal (the proven tension).' },
    feasibility: { type: 'object', additionalProperties: true, description: 'The kinematic math with numbersUsed (human-auditable).' },
    referenceSolution: { type: 'object', additionalProperties: true, description: 'The proven winning action-sequence that engages the threat — VERIFY-2 replays it.' },
    acceptanceCriteria: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Given/When/Then over __GAME__ — VERIFY-2 checks these from known preconditions.' },
    declaredRanges: { type: 'object', additionalProperties: true, description: 'Per-tunable/coordinate [min,max] perturbation envelope — VERIFY-2 permutes WITHIN these; every endpoint keeps the design winnable + the threat on path.' },
    milestones: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'object', additionalProperties: true }, description: 'Carried from the gdd, hardened against the concrete numbers; drives the W4/VERIFY-2 fan-out.' },
    assetList: { type: 'array' },
  },
}

phase('VERIFY-1 Design')
log('game-omni: design gate — judge + HARDEN the thesis into a winnable, frozen blueprint (static, before any code)')
const v1 = await agent(
  nodePrompt('packages/skills/verify-design/SKILL.md', `You are VERIFY-1, the DESIGN-QUALITY GATE (Design Critic), inserted BETWEEN W1 and W2. You run BEFORE any code, asset, or scaffold exists — there is nothing to run, so you reason STATICALLY. Read from ${PROJECT}: spec/gdd.json (W1's design thesis), spec/classification.json (W0 — archetype/coreLoop/physicsProfile/scopeCut), and spec/PLAN.md (W1's ## Playability claim).

Do two inseparable things, per the SKILL's fixed rubric:
1. JUDGE the design on the numbers — is there a REAL interesting decision (a risk weighed against a reward); is the threat ON the reward/critical path (NO "undesirable solution": no threat-free path to any reward/goal — statically decidable on the coordinates); is it WINNABLE + FAIR by the per-archetype KINEMATIC FEASIBILITY MATH (every gap/reach/window physically clearable by the documented controls; no soft-lock); is the blueprint COMPLETE.
2. HARDEN it — fill EVERY tunable, coordinate, patrol route+timing, count, and the exact win/lose/RESPAWN flow so the executor (W4) builds it VERBATIM with zero latitude; emit the declaredRanges perturbation envelope (per-tunable/coordinate [min,max] that keeps the design winnable + the threat on path at BOTH endpoints — VERIFY-2 needs this); author the reference INTENDED SOLUTION (a concrete winning action-sequence that ENGAGES the threat — proof-by-existence) and the Given/When/Then acceptanceCriteria over window.__GAME__.

When a hard criterion (1-4) fails, FIX the design (re-place the threat onto the path / adjust the number / fill the missing value) — run the bounded <=2 self-revise; NEVER weaken the design to pass (don't delete the threat, don't relax winCondition). If still failing after 2 revises, emit verdict.result="DESIGN_FAILED" with the criterion + numbers (routes back to W1).

Write exactly two files under ${PROJECT}/spec/: blueprint.json (the hardened, frozen design — the new single source of truth; valid against packages/skills/verify-design/blueprint.schema.json) and DESIGN_REVIEW.md (the human-readable verdict + the math trail). Then return the blueprint object as your structured result (incl. the milestones, hardened) and stop. Reason with LOW temperature — this is feasibility MATH + a fixed rubric, not creativity.`,
    contract({ artifacts: ['spec/blueprint.json', 'spec/DESIGN_REVIEW.md'], owns: ['spec/**'], readScope: [PROJECT, 'packages/skills/verify-design'] })),
  { label: 'VERIFY-1 design', phase: 'VERIFY-1 Design', schema: BLUEPRINT_SCHEMA }
)

// ----------------------------------------------------------------------------
// W2 — Scaffold  (skill: packages/skills/scaffold/SKILL.md + template-contract.md)
// Reads:  ${PROJECT}/spec/gdd.json
// Writes: the running EMPTY project + ${PROJECT}/STRUCTURE.md + ${PROJECT}/index.json (asset slots),
//         merges gdd.config into gameConfig.json, ensures src/main.ts exposes window.__GAME__ per
//         the canonical hook contract, and passes the npm-run-build BUILD-HEALTH gate.
// The structured return is a STATUS RECEIPT — the durable outputs are the files on disk.
// NOTE: depends on the genre-template files (build-plan Phase 1); template-contract.md is the spec
// those templates must satisfy (esp. the window.__GAME__ wiring — the one net-new piece).
// ----------------------------------------------------------------------------
const SCAFFOLD_RESULT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['built', 'failed'], description: 'built = empty project compiles green; failed = could not reach a green build.' },
    reason: { type: 'string', description: 'On failed: the build/scaffold error (also recorded in MEMORY.md).' },
    archetype: { type: 'string', enum: ['platformer', 'top_down', 'grid_logic', 'tower_defense', 'ui_heavy'] },
    indexSlotCount: { type: 'integer', minimum: 0, description: 'Number of asset slots written to index.json (the W3 work-list size).' },
    buildHealth: { type: 'string', enum: ['pass', 'fail'] },
    hookExposed: { type: 'boolean', description: 'True once src/main.ts exposes window.__GAME__ per template-contract.md.' },
    notes: { type: 'string' },
  },
}

phase('W2 Scaffold')
log('game-omni: scaffolding empty project from the genre template + index.json + STRUCTURE.md + the __GAME__ hook')
const w2 = await agent(
  nodePrompt('packages/skills/scaffold/SKILL.md', `You are W2 Scaffold (Coder). Honor packages/skills/scaffold/template-contract.md exactly. Read ${PROJECT}/spec/blueprint.json — the FROZEN design from VERIFY-1 (a superset of the gdd whose .config is now COMPLETE and whose numbers are the hardened, winnable ones); it is the single source of truth (spec/gdd.json remains only as historical provenance). Then, in order:
1. Copy templates/modules/<blueprint.meta.archetype> into ${PROJECT} (recursive, no-clobber). Fallback to platformer if the module is missing; note it in ${PROJECT}/MEMORY.md. Set package.json.name from meta.title.
2. Merge blueprint.config (the COMPLETE hardened tunables — every key the design needs, including enemy/threat speeds) into ${PROJECT}/src/gameConfig.json: wrap each flat key as {value,type,description} under the CORRECT archetype sub-object (playerConfig/enemyConfig/gridConfig/towerDefenseConfig/battleConfig per the skill — an enemy-speed tunable lands in enemyConfig, NOT dropped). MERGE (keep template defaults). NEVER touch screenSize/debugConfig/renderConfig. A key with no schema home is a CONTRACT GAP — record it in MEMORY.md, do NOT silently drop it.
3. Derive ${PROJECT}/index.json from blueprint.assetList[] UNION blueprint.entities[].assetSlot — one slot row each: {slot,type,path,width,height,frames?,entityIds?,description,status:"pending"}, archetype-default dims as hints. Valid against packages/skills/scaffold/index.schema.json. Empty -> slots:[].
4. Write ${PROJECT}/STRUCTURE.md IN FULL per the skill: Controls, Scenes, Entities(file/extends/behaviors/assetSlot), Systems, State/Event map, Test hook, Assets(->index.json), Build, Notes. Mark W4 work as TODO-W4:.
5. Ensure ${PROJECT}/src/main.ts exposes window.__GAME__ per template-contract.md (ready/status/scene/player/score/entities + archetype extras + snapshot()/commands). If absent, add the thin read-only adapter (IDs+primitives, never raw Phaser objects; status normalized; score from registry).
6. Run \`npm run build\` in ${PROJECT}. It MUST exit 0. Fix only scaffold-level breakage; do NOT tighten tsconfig. If it cannot be made green, record the error in MEMORY.md and return status:"failed" — NEVER report success on a red build.
Do not implement game logic, levels, or assets. Return the status receipt.`,
    contract({ artifacts: ['STRUCTURE.md', 'index.json'], owns: ['**'], readScope: [PROJECT, 'packages/skills/scaffold', 'templates'], note: 'W2 scaffolds the whole project under the project dir; it owns everything UNDER it but must write nothing OUTSIDE it.' })),
  { label: 'W2 scaffold', phase: 'W2 Scaffold', schema: SCAFFOLD_RESULT_SCHEMA }
)

// ----------------------------------------------------------------------------
// W3 — Assets  (skill: packages/skills/assets/SKILL.md)
// Reads:  ${PROJECT}/index.json (frozen asset slots) + ${PROJECT}/spec/gdd.json (art style)
// Writes: ${PROJECT}/public/assets/* + ${PROJECT}/ASSETS.md, updates index.json rows' path+status.
// Placeholder-first (v1 default; zero external key); gemini real-sprite generation is a toggle.
// Depends ONLY on index.json — never on game code. pipeline-design §7 specced this as a parallel lane
// (W3 ∥ W4-M1); for v1 we run it SERIALLY before the milestone loop, because both W3 and W4 append to
// MEMORY.md and concurrent whole-file rewrites would lose notes (W5 reads MEMORY.md for known quirks).
// Placeholder mode is fast, so the lost overlap is marginal; revisit the parallel lane once MEMORY.md
// writes are concurrency-safe (per-node note files). Run unconditionally to stay Pi-extractable.
// ----------------------------------------------------------------------------
const ASSETS_RESULT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['status', 'mode'],
  properties: {
    status: { type: 'string', enum: ['done', 'empty', 'failed'], description: 'done = every slot filled; empty = no slots; failed = could not write manifest.' },
    mode: { type: 'string', enum: ['placeholder', 'gemini'], description: 'Effective mode (gemini degrades to placeholder if key/sharp/style unavailable).' },
    slotsFilled: { type: 'integer', minimum: 0 },
    slotsGenerated: { type: 'integer', minimum: 0, description: 'Real (gemini) assets produced.' },
    slotsPlaceholder: { type: 'integer', minimum: 0 },
    degraded: { type: 'boolean', description: 'True if gemini was requested but any slot fell back to placeholder.' },
    notes: { type: 'string' },
  },
}

phase('W3 Assets')
log('game-omni: filling asset slots (placeholder-first) + ASSETS.md manifest — parallel-safe lane')
const w3 = await agent(
  nodePrompt('packages/skills/assets/SKILL.md', `You are W3 (Artist), the parallel asset lane. Read ${PROJECT}/index.json (the frozen asset SLOT manifest from W2) and ${PROJECT}/spec/gdd.json (art style + entity provenance).

Mode = placeholder by DEFAULT. Use gemini ONLY if mode:gemini was requested AND a Gemini API key (GEMINI_API_KEY or GOOGLE_AI_API_KEY) resolves AND sharp is importable AND gdd.meta.artStyle is not 'placeholder'; otherwise stay in placeholder mode and record the reason.

For EVERY slot in index.json.slots[]: produce a correctly-dimensioned file under ${PROJECT}/public/assets/ (sprites/images/tiles/backgrounds/audio by type) per the skill. Placeholder = legible greybox (deterministic color + label + dims, transparent where the type needs it). Gemini = gemini-2.5-flash-image via raw REST with the type+archetype-conditioned prompt, magenta chroma-key + sharp trim/contain-resize for sprites, pixel-snap if pixelArt, style-anchored to the first sprite; degrade any failed slot to a placeholder. NEVER block on audio (placeholder WAV).

Then: (a) write back ONLY each filled slot's path+status into ${PROJECT}/index.json (keys/order untouched, one atomic rewrite, re-validate against packages/skills/scaffold/index.schema.json); (b) write ${PROJECT}/ASSETS.md in full per the skill (valid against packages/skills/assets/assets.schema.json); (c) append quirks/degradation to ${PROJECT}/MEMORY.md. Do NOT write src/**, spec/**, tilemap JSON, or any new slot/key. Empty slots:[] -> write ASSETS.md note and stop. Return the status receipt.`,
    contract({ artifacts: ['ASSETS.md'], owns: ['public/assets/**', 'ASSETS.md', 'index.json', 'MEMORY.md'], readScope: [PROJECT, 'packages/skills/assets', 'packages/skills/scaffold'] })),
  { label: 'W3 assets', phase: 'W3 Assets', schema: ASSETS_RESULT_SCHEMA }
)

// ----------------------------------------------------------------------------
// W4 Implement  +  W5 Verify+Fix  — the milestone spine.
// Skills: packages/skills/implement-milestone/SKILL.md , packages/skills/verify/SKILL.md
// SEQUENTIAL per milestone AND across milestones (NOT pipeline()): W5's bounded <=3 self-fix WRITES
// src/**, so M(k+1)'s implement cannot overlap M(k)'s verify-and-fix without colliding on the source
// tree. Per milestone: W4 implements (builds green, populates window.__GAME__ for real) -> W5 boots
// headless, asserts vs window.__GAME__, emits VALIDATION_PASSED/FAILED, self-fixes <=3, writes report.
// Pi-safe: `milestones` is a discovered-once list with a STATIC DEFAULT of 3 (extractor sees 3 lanes);
// the <=3 self-fix is INTERNAL to the W5 agent — no workflow-result branch the extractor can't see.
// ----------------------------------------------------------------------------
const IMPLEMENT_RESULT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['milestone', 'status'],
  properties: {
    milestone: { type: 'string' },
    status: { type: 'string', enum: ['built', 'failed'], description: 'built = slice compiles green + hook truthful; failed = could not reach a green build.' },
    buildHealth: { type: 'string', enum: ['pass', 'fail'] },
    hookPopulated: { type: 'boolean', description: 'window.__GAME__ reflects the real state for this milestone.' },
    filesWritten: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}
const VERIFY_RESULT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['milestoneId', 'marker', 'passed'],
  properties: {
    milestoneId: { type: 'string' },
    marker: { type: 'string', enum: ['VALIDATION_PASSED', 'VALIDATION_FAILED'], description: 'Verbatim gamedevbench-ported marker. Missing = FAILED.' },
    passed: { type: 'boolean' },
    fixCycles: { type: 'integer', minimum: 0, maximum: 3 },
    failedAssertions: { type: 'array', items: { type: 'string' }, description: 'describe of each failed/diverged check.' },
    perturbationInvariant: { type: 'boolean', description: 'True iff the build stayed invariant under the isomorphic perturbation (§6). False = contorted build => FAILED.' },
    escalation: { type: 'string', description: 'Present iff a genuine DESIGN problem was flagged (routes upstream to VERIFY-1, never the executor).' },
    screenshot: { type: 'string' },
    advisoryVlm: { type: 'string', description: 'Advisory canvas/VLM verdict — NEVER blocks the marker.' },
    summary: { type: 'string' },
  },
}

// Discovered-once milestone list with a Pi-safe static default of 3. Prefer VERIFY-1's HARDENED
// blueprint milestones (the frozen truth); fall back to W1's gdd, then the static default.
const milestones = (v1 && Array.isArray(v1.milestones) && v1.milestones.length)
  ? v1.milestones
  : (w1 && Array.isArray(w1.milestones) && w1.milestones.length)
    ? w1.milestones
    : [{ id: 'M1' }, { id: 'M2' }, { id: 'M3' }]

const milestoneResults = []
for (const m of milestones) {
  const mid = m && m.id ? m.id : `M${milestoneResults.length + 1}`

  phase('W4 Execute')
  const impl = await agent(
    nodePrompt('packages/skills/implement-milestone/SKILL.md', `You are W4 EXECUTE (Executor — ZERO design latitude). Build ONE milestone (${mid}) as a FAITHFUL, VERBATIM realization of VERIFY-1's FROZEN blueprint on top of the existing ${PROJECT} project, then make the build green and stop. You are NOT a designer: every gameplay decision was already made and PROVEN by VERIFY-1. You translate the blueprint into code — you do not improve, reinterpret, or "fix" the design.

ABSORB (from ${PROJECT}): spec/blueprint.json — the FROZEN design (the SINGLE source of truth). For ${mid} read: blueprint.layout (the EXACT coordinates of the player spawn, goal, every reward, every threat + its patrol route + timing — build these positions verbatim), blueprint.config (the COMPLETE tunables — read every value through, never substitute a template default), blueprint.coupling (the threat MUST contest the reward path as specified — never move a threat off the path or disable it), the exact win/lose/RESPAWN flow (build the RESPAWN the blueprint specifies — e.g. respawn-at-entrance with status staying 'playing' — NOT a generic game-over), blueprint.referenceSolution + blueprint.acceptanceCriteria (the behavior VERIFY-2 will check — make it REAL). Also read STRUCTURE.md (the scene/entity/system/control map + TODO-W4 points), MEMORY.md (prior quirks), index.json (the FROZEN asset keys), and packages/skills/scaffold/template-contract.md §3 (the window.__GAME__ hook). Read in full ONLY the _Template*/Base*/behaviors/systems files you will touch. Prior milestones' code already exists — EXTEND it.

BUILD IT VERBATIM: COPY a _Template* scene / EXTEND a Base* class / COMPOSE the template behaviors; override opt-in hooks (always call super). NEVER edit KEEP files (Base*.ts, behaviors/*, systems/*, ui/*, utils.ts) — create new files. Place every entity at the blueprint's coordinates; drive each threat on the blueprint's route at its speed/timing; reference asset KEYS from index.json. Wire the template's juice to amplify the core verb (cosmetic only, never an observed field).

POPULATE window.__GAME__ FROM REAL STATE: score via game.registry.set('score',n); set the normalized status at the blueprint's REAL win/lose/respawn points; player/entities/extras live. ANTI-CONTORTION (absolute): implement the REAL mechanic on the blueprint's REAL relation/distance — NEVER fake/special-case __GAME__, NEVER tune an interaction to the verify driver's reach radius, NEVER disable a threat at a score threshold, NEVER teleport state to make a check pass. Those are the exact td1/val1 cheats VERIFY-2's perturbation gate is built to catch.

THE NO-INVENTION RULE: if the blueprint is MISSING a number you need (a coordinate, a speed, a respawn target) or is internally contradictory, DO NOT invent or guess it — that is a design decision you are forbidden to make. HALT: record the gap in MEMORY.md, write the specifics, and return status:"failed" with reason "blueprint underspecified: <what>" so it routes back to VERIFY-1. Inventing a missing design value is the original sin this redesign removes.

BUILD-HEALTH: run npm run build in ${PROJECT}; on failure fix the ROOT CAUSE (skill's known-failure table); bounded ~5 attempts; never delete/stub template files or loosen tsconfig. Tick the TODO-W4 in STRUCTURE.md, append terse quirks to MEMORY.md. Build exactly ${mid} verbatim, build green, stop. Return the status receipt.`,
      contract({ artifacts: [], owns: ['src/**', 'STRUCTURE.md', 'MEMORY.md'], readScope: [PROJECT, 'packages/skills/implement-milestone', 'packages/skills/scaffold'], note: 'W4 EXECUTE has no fixed required filename (game-specific scenes); DRIVER-OWNS only. Builds the frozen blueprint verbatim; a missing blueprint number => status:"failed" (escalate), never invented.' })),
    { label: `W4 execute ${mid}`, phase: 'W4 Execute', schema: IMPLEMENT_RESULT_SCHEMA }
  )

  phase('VERIFY-2 QA')
  const verify = await agent(
    nodePrompt('packages/skills/verify/SKILL.md', `You are VERIFY-2 (Playtester — implementation-correctness / QA). Prove ONE milestone (${mid}), built VERBATIM by W4 from the frozen blueprint and building green, is a FAITHFUL, BUG-FREE realization of that blueprint. You do EXACTLY ONE job: did the executor build EXACTLY the frozen blueprint, bug-free, with the user flow working? You are NOT a design judge — VERIFY-1 already settled gameness; NEVER re-judge whether the design is good (that conflation is what made the old node game-able).

Read from ${PROJECT}: spec/blueprint.json — its sections .config+.layout+.declaredRanges+.verdict (the FROZEN tunables, coordinates, routes/timings, win/lose/RESPAWN flow, and the per-tunable declaredRanges = your perturbation envelope), .referenceSolution (the proven winning action-sequence), .acceptanceCriteria (the Given/When/Then fidelity contract for ${mid}); the ${mid} assertions[] in spec/gdd.json; packages/skills/scaffold/template-contract.md §3 (the __GAME__ accessor + observe grammar + sanctioned commands); MEMORY.md (W4 quirks); packages/skills/verify/assertion-execution-grammar.md + perturbation-grammar.md (the mechanical how).

Drive the headless harness (packages/verify/, real Chromium). Run the SIX gates, then aggregate: (1) BUILD-HEALTH — boot, reach __GAME__.ready (never sleep), no console errors, canvas not blank. (2) USER-FLOW FIDELITY — each blueprint mechanism as Given/When/Then, driven from a KNOWN precondition YOU place (commands.reset + a short documented-input drive, or commands.setState of ONLY the precondition fields — you have the blueprint coordinates, so you NEVER ask a generic bot to navigate a tense level; NEVER setState the OBSERVED outcome). (3) COMPLETABILITY — replay blueprint.referenceSolution step-by-step and assert it reaches status:'won' through the REAL flow (interim observables through real collection, never injected). (4) INVARIANTS — sample __GAME__ across each drive: monotonicity (score/lives), bounds, no soft-lock, status-legality vs the frozen win/lose/RESPAWN flow. (5) ISOMORPHIC PERTURBATION (load-bearing anti-hack) — re-run the acceptance criteria + completability with blueprint parameters PERMUTED WITHIN declaredRanges (coords/seed/counts/approach-distance/timing); a faithful build is INVARIANT, a contorted/hard-coded build DIVERGES => FAIL. This is how the guard-disable / score-teleport / driver-radius-overfit class is caught. (6) verdict-correctness self-guard.

Emit the VERBATIM marker: "VALIDATION_PASSED: ${mid} all N checks passed (fidelity + completability + invariants + perturbation)" iff ALL gates pass, else "VALIDATION_FAILED: <describe>; ...". A missing marker = FAILED.

On FAILED run the BOUNDED <=3-cycle self-fix (harness-enforced counter): CLASSIFY the failure. An IMPLEMENTATION BUG (build != blueprint: a dropped tunable, status set at the wrong point, a mechanic keyed to a literal or to the driver's radius, a faked RESPAWN) => EDIT src/** GAME CODE ONLY to make the REAL behavior match the frozen blueprint; re-build; re-run ALL gates incl. perturbation. A genuine DESIGN PROBLEM (the frozen blueprint itself is wrong/unwinnable even when built faithfully) => DO NOT fix here: write ${PROJECT}/verify/escalations.${mid}.json and emit "VALIDATION_FAILED: design escalation — <one line>" (routes to VERIFY-1, NOT the executor). ANTI-REWARD-HACK (absolute): the fix touches src/** game code ONLY — NEVER spec/blueprint.json, the referenceSolution, the acceptanceCriteria, spec/gdd.json, the __GAME__ hook, the harness, or perturbation-grammar.md; the oracle is immutable; never widen a declaredRange.

Write ${PROJECT}/verify/report.${mid}.json (PER-MILESTONE, NEVER overwrite a prior milestone — schema packages/skills/verify/report.schema.json, extended: fidelity[]/completability/invariants[]/perturbation/escalation?) + screenshots. If you edited src/**, re-run prior milestones' fidelity once (regression guard). Return the marker receipt. The marker is the gate.`,
      contract({ artifacts: [`verify/report.${mid}.json`], owns: ['src/**', 'verify/**', 'MEMORY.md'], readScope: [PROJECT, 'packages/skills/verify', 'packages/skills/scaffold', 'packages/verify'] })),
    { label: `VERIFY-2 ${mid}`, phase: 'VERIFY-2 QA', schema: VERIFY_RESULT_SCHEMA }
  )

  milestoneResults.push({ milestone: mid, implement: impl, verify })
}

// v1 is DONE when every milestone emits VALIDATION_PASSED.
const allPassed = milestoneResults.length > 0 && milestoneResults.every((r) => r.verify && r.verify.marker === 'VALIDATION_PASSED')

return {
  built: ['W0', 'W1', 'VERIFY-1', 'W2', 'W3', 'W4', 'VERIFY-2'],
  status: allPassed ? 'game-verified' : 'incomplete',
  classification: w0,
  gdd: w1,
  designVerdict: (v1 && v1.verdict && v1.verdict.result) || null,
  blueprint: v1,
  scaffold: w2,
  assets: w3,
  milestones: milestoneResults,
}
