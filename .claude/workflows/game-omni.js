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
//   BUILT:  W0 Classify
//   TODO:   W1 Spec -> W2 Scaffold -> [W3 Assets ∥ W4 Implement(M1..Mn)] -> W5 Verify+Fix
//
// Pi-portability: every node is a single agent() call with a forced-JSON schema;
// fan-outs (milestones, asset slots) are discovered-once lists with static
// defaults, never extractor-invisible data-dependent branching.
// ============================================================================

export const meta = {
  name: 'game-omni',
  description: 'Prompt -> verified, playable Phaser 2D web game in one pass. Nodes coordinate through on-disk artifacts; each loads an evidence-grounded skill. Pi-portable.',
  phases: [
    { title: 'W0 Classify', detail: 'Designer: route prompt -> physics-first archetype + one-line core loop + explicit scope-cut. Writes spec/classification.json.' },
    // --- the target shape (built out one sub-agent at a time) ---
    { title: 'W1 Spec', detail: 'Designer: slim GDD + milestone list (2-5) with per-milestone runtime assertions. Writes spec/gdd.json + spec/PLAN.md. (TODO)' },
    { title: 'W2 Scaffold', detail: 'Coder: copy genre template -> running empty project + STRUCTURE.md + index.json (asset slots). (TODO)' },
    { title: 'W3 Assets', detail: 'Artist: fill public/assets/ + ASSETS.md from index.json. Placeholder-first (gemini toggle).' },
    { title: 'W4 Implement', detail: 'Coder: implement each milestone, wiring template juice; populates window.__GAME__ for real; builds green; updates MEMORY.md.' },
    { title: 'W5 Verify+Fix', detail: 'Playtester (bounded self-fix <=3): headless Playwright -> assert vs window.__GAME__ -> VALIDATION_PASSED/FAILED. Writes verify/report.json.' },
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

function nodePrompt(skillPath, body) {
  return `${PREAMBLE}\n\nSKILL TO LOAD AND FOLLOW: ${skillPath}\n\n${body}`
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

Write exactly one file: ${PROJECT}/spec/classification.json (create ${PROJECT}/spec/ if needed), valid against packages/skills/classify-game/classification.schema.json. Then return the same object as your structured result. On a prompt that fits no archetype, pick the closest, set confidence:"low", and explain in reasoning; default to platformer for empty/gibberish. Classify deterministically (low temperature).`),
  { label: 'W0 classify', phase: 'W0 Classify', schema: CLASSIFICATION_SCHEMA }
)

// ----------------------------------------------------------------------------
// W1 — Spec  (skill: packages/skills/write-gdd/SKILL.md)
// Reads:  ${PROJECT}/spec/classification.json  (archetype, coreLoop, coreVerb, physicsProfile, scopeCut)
// Writes: ${PROJECT}/spec/gdd.json + ${PROJECT}/spec/PLAN.md
// Schema inlined from packages/skills/write-gdd/gdd.schema.json — slim gameDNA + 2-5 milestones,
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
      required: ['title', 'archetype', 'coreLoop', 'coreVerb', 'artStyle'],
      properties: {
        title: { type: 'string', minLength: 1 },
        archetype: { type: 'string', enum: ['platformer', 'top_down', 'grid_logic', 'tower_defense', 'ui_heavy'] },
        coreLoop: { type: 'string', minLength: 1 },
        coreVerb: { type: 'string', minLength: 1 },
        coreFantasy: { type: 'string' },
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
      type: 'array', minItems: 2, maxItems: 5,
      description: '2-5 PLAYABLE slices (default 3) in build order. M1 = core loop plays; last includes an end-state.',
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
log('game-omni: writing slim GDD + 2-5 playable milestones with runtime assertions')
const w1 = await agent(
  nodePrompt('packages/skills/write-gdd/SKILL.md', `You are the W1 Spec node (Designer role). Read ${PROJECT}/spec/classification.json from disk (the original prompt is its \`prompt\` field).

Design the slim Game Design Doc CONSTRAINED to the chosen archetype template's capabilities, and decompose classification.coreLoop into 2-5 PLAYABLE milestones (default 3): M1 = the core loop plays at all; the final milestone includes a win and/or lose end-state. For each milestone write acceptance criteria + executable runtime assertions (Given setup -> When input -> Then observe+expect) over the live game object window.__GAME__, 1:1 with the criteria, asserting OBSERVABLE behavior never implementation. Respect classification.scopeCut as a hard boundary; never invent a capability the template lacks; never cut the juice.

Write exactly two files under ${PROJECT}/spec/, valid against packages/skills/write-gdd/gdd.schema.json: gdd.json and PLAN.md. Then return the gdd.json object as your structured result and stop.`),
  { label: 'W1 spec', phase: 'W1 Spec', schema: GDD_SCHEMA }
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
  nodePrompt('packages/skills/scaffold/SKILL.md', `You are W2 Scaffold (Coder). Honor packages/skills/scaffold/template-contract.md exactly. Read ${PROJECT}/spec/gdd.json (written by W1). Then, in order:
1. Copy templates/modules/<gdd.meta.archetype> into ${PROJECT} (recursive, no-clobber). Fallback to platformer if the module is missing; note it in ${PROJECT}/MEMORY.md. Set package.json.name from meta.title.
2. Merge gdd.config into ${PROJECT}/src/gameConfig.json: wrap each flat key as {value,type,description} under the archetype's sub-object (playerConfig/gridConfig/towerDefenseConfig/battleConfig per the skill). MERGE (keep template defaults). NEVER touch screenSize/debugConfig/renderConfig. Drop unknown keys with a note.
3. Derive ${PROJECT}/index.json from gdd.assetList[] UNION gdd.entities[].assetSlot — one slot row each: {slot,type,path,width,height,frames?,entityIds?,description,status:"pending"}, archetype-default dims as hints. Valid against packages/skills/scaffold/index.schema.json. Empty -> slots:[].
4. Write ${PROJECT}/STRUCTURE.md IN FULL per the skill: Controls, Scenes, Entities(file/extends/behaviors/assetSlot), Systems, State/Event map, Test hook, Assets(->index.json), Build, Notes. Mark W4 work as TODO-W4:.
5. Ensure ${PROJECT}/src/main.ts exposes window.__GAME__ per template-contract.md (ready/status/scene/player/score/entities + archetype extras + snapshot()/commands). If absent, add the thin read-only adapter (IDs+primitives, never raw Phaser objects; status normalized; score from registry).
6. Run \`npm run build\` in ${PROJECT}. It MUST exit 0. Fix only scaffold-level breakage; do NOT tighten tsconfig. If it cannot be made green, record the error in MEMORY.md and return status:"failed" — NEVER report success on a red build.
Do not implement game logic, levels, or assets. Return the status receipt.`),
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

Then: (a) write back ONLY each filled slot's path+status into ${PROJECT}/index.json (keys/order untouched, one atomic rewrite, re-validate against packages/skills/scaffold/index.schema.json); (b) write ${PROJECT}/ASSETS.md in full per the skill (valid against packages/skills/assets/assets.schema.json); (c) append quirks/degradation to ${PROJECT}/MEMORY.md. Do NOT write src/**, spec/**, tilemap JSON, or any new slot/key. Empty slots:[] -> write ASSETS.md note and stop. Return the status receipt.`),
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
    failedAssertions: { type: 'array', items: { type: 'string' }, description: 'describe of each failed assertion.' },
    screenshot: { type: 'string' },
    advisoryVlm: { type: 'string', description: 'Advisory canvas/VLM verdict — NEVER blocks the marker.' },
    summary: { type: 'string' },
  },
}

// Discovered-once milestone list (W1) with a Pi-safe static default of 3.
const milestones = (w1 && Array.isArray(w1.milestones) && w1.milestones.length)
  ? w1.milestones
  : [{ id: 'M1' }, { id: 'M2' }, { id: 'M3' }]

const milestoneResults = []
for (const m of milestones) {
  const mid = m && m.id ? m.id : `M${milestoneResults.length + 1}`

  phase('W4 Implement')
  const impl = await agent(
    nodePrompt('packages/skills/implement-milestone/SKILL.md', `You are W4 IMPLEMENT (Coder). Implement ONE milestone (${mid}) — a playable vertical slice — on top of the existing ${PROJECT} project, then make the build green and stop.

ABSORB (from ${PROJECT}): the ${mid} entry in spec/gdd.json (goal, acceptanceCriteria, assertions); STRUCTURE.md (its TODO-W4 points + the scene/entity/system/control map); MEMORY.md (prior quirks); index.json (the FROZEN asset keys); and packages/skills/scaffold/template-contract.md §3 (the window.__GAME__ hook). Read in full ONLY the _Template*/Base*/behaviors/systems files you will touch (3-layer read, not the whole tree). Prior milestones' code already exists — EXTEND it.

IMPLEMENT this slice: COPY a _Template* scene / EXTEND a Base* class / COMPOSE the template behaviors named in gdd.entities[].behaviors; override opt-in hooks (always call super). NEVER edit KEEP files (Base*.ts, behaviors/*, systems/*, ui/*, utils.ts) — create new files. Reference asset KEYS from index.json; never wait on assets (the Preloader placeholder-fills). Wire the template's juice (shake + a short hit-stop + flash + a score/particle pop) to amplify the core verb — wire, don't rebuild, don't over-juice (juice is cosmetic, never a field W5 observes).

POPULATE window.__GAME__ FROM REAL STATE per the contract: score via game.registry.set('score',n); set the normalized status flag at the REAL win/lose point; keep player/entities/extras live. ANTI-REWARD-HACK: implement the REAL mechanic each assertion describes so the observable is genuinely true — NEVER special-case or fake window.__GAME__ to satisfy an assertion.

BUILD-HEALTH: run npm run build in ${PROJECT}; on failure fix the ROOT CAUSE (use the known-failure->fix table in the skill); re-build; bounded ~5 attempts; never delete/stub template files or loosen tsconfig. If it cannot go green with a scoped fix, record the error in MEMORY.md and return status:"failed".

Tick the completed TODO-W4 in STRUCTURE.md and append terse quirks to MEMORY.md. Implement exactly ${mid}, build, stop. Do NOT implement other milestones or chase W5 assertion pass/fail. Return the status receipt.`),
    { label: `W4 implement ${mid}`, phase: 'W4 Implement', schema: IMPLEMENT_RESULT_SCHEMA }
  )

  phase('W5 Verify+Fix')
  const verify = await agent(
    nodePrompt('packages/skills/verify/SKILL.md', `You are W5 VERIFY+FIX (Playtester). Verify ONE milestone (${mid}), already implemented by W4 and building green.

Read from ${PROJECT}: the ${mid} assertions[] in spec/gdd.json ({id,describe,setup?,input?,observe,expect}); packages/skills/scaffold/template-contract.md §3 (the window.__GAME__ accessor + the observe grammar); MEMORY.md (W4 quirks + capability gaps); packages/skills/verify/assertion-execution-grammar.md (the compiler + evaluator + marker).

RUN THE PRE-BUILT VERIFY RUNNER (do NOT re-implement Playwright): the harness lives at packages/verify/ (see packages/verify/README.md for the exact CLI — e.g. verify-milestone ${PROJECT} ${mid}). It builds/serves the game, launches real headless Chromium (swiftshader), advances past the title gate, waits for window.__GAME__.ready, fires each assertion's setup/input, evaluates observe vs the one expect comparator, writes ${PROJECT}/verify/report.json + screenshots, and prints the VERBATIM marker to stdout ("VALIDATION_PASSED: ${mid} all N assertions passed" iff the game booted clean and every assertion passes; else "VALIDATION_FAILED: <describe>; <describe>; ..."; a missing marker = FAILED). Parse the marker.

On VALIDATION_FAILED run a BOUNDED <=3-cycle self-fix: feed yourself {failed describe + observed-vs-expected + console/pageerror + screenshot + MEMORY.md}; diagnose the REAL root cause; EDIT src/** GAME CODE ONLY (reuse the implement-milestone repair discipline); re-run npm run build; re-run the verify harness. STOP on all-pass / a repeated failure signature (stall) / 3 cycles; then re-emit the marker. ANTI-REWARD-HACK (absolute): NEVER edit spec/gdd.json, the assertions, the window.__GAME__ hook, or the verify harness to fake a pass; the oracle is immutable; make the REAL mechanic true. An honest VALIDATION_FAILED after the bound is the correct output.

If you edited src/**, re-run prior milestones' assertions once (regression guard). The harness writes ${PROJECT}/verify/report.json (schema: packages/skills/verify/report.schema.json — per-assertion observed-vs-expected, the marker, screenshots, the advisory canvas-not-blank/VLM verdict that never blocks); ensure the FINAL harness run reflects the milestone's true state. Return the marker receipt. The marker is the gate.`),
    { label: `W5 verify ${mid}`, phase: 'W5 Verify+Fix', schema: VERIFY_RESULT_SCHEMA }
  )

  milestoneResults.push({ milestone: mid, implement: impl, verify })
}

// v1 is DONE when every milestone emits VALIDATION_PASSED.
const allPassed = milestoneResults.length > 0 && milestoneResults.every((r) => r.verify && r.verify.marker === 'VALIDATION_PASSED')

return {
  built: ['W0', 'W1', 'W2', 'W3', 'W4', 'W5'],
  status: allPassed ? 'game-verified' : 'incomplete',
  classification: w0,
  gdd: w1,
  scaffold: w2,
  assets: w3,
  milestones: milestoneResults,
}
