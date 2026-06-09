# AI Game Generation — research brief (mid-2026)
_scope: last ~6–12mo (favoring 2025H2–2026H1), generic AI/games lens, deep dive • generated 2026-06-08_
_source tags: **[R]** = Reddit (practitioner sentiment) • **[Y]** = YouTube transcripts via yt-rag (50 curated videos ingested for this run) • **[E]** = Exa web (papers, repos, product pages, blogs). Inline citations name the specific creator/site/subreddit so every claim is traceable._

## How to read this
- This is a **landscape + harness-design** brief, not a one-off answer. It is structured to be reused while building.
- The field splits cleanly into **two paradigms** that get conflated in headlines. Keep them separate; they have different timelines, harnesses, and economics.
- Trust calibration: **world-model specs** ([E], from papers/product pages) are mostly vendor-reported and rarely third-party benchmarked — treat fps/resolution/latency as marketing-adjacent unless from arXiv with a table. **Codegen workflows** ([Y]/[R]) are practitioner-demonstrated and far more reliable as "this actually works." **Benchmarks** (GameDevBench, OpenGame-Bench) are the few apples-to-apples numbers.
- The section you specifically asked for — *"what harness are we deploying, given game-gen ≈ UI-gen?"* — is **§7 (Designing the harness)**. Everything before it is the evidence base.

---

## TL;DR
- **Two non-overlapping paradigms.** (1) **Neural world models / neural game engines** — nets that *generate playable frames* (Genie 3, Decart Oasis/Mirage, NVIDIA Cosmos, Tencent Hunyuan/Matrix-Game). (2) **LLM/agentic code generation** — agents that *write real game source* (Phaser/Three.js/Godot/Unreal) plus asset pipelines. **Only paradigm 2 ships real, shippable games today.** Paradigm 1 ships impressive interactive *video*, not engines. Consensus across [Y] (Gamefromscratch, Bilawal Sidhu, Bijan Bowen) and [E] (Fei-Fei Li taxonomy): world models are "renderers," not game engines — no persistent state, no collision/physics-as-simulation, minute-scale memory, $1–2/user-hour or ~$80k-class machines. [Y][E]
- **Substrate decision (LLM code-gen only): default to WEB / TypeScript** — Phaser (2D) + React-Three-Fiber/Three.js (3D), runs in every browser. It's the most trending *and* most reliable substrate for LLM game-gen (training-data dominance, all-text codebase, trivial browser runtime-verify, instant distribution); OpenGame itself chose Phaser for exactly this reason. Native engines only lead on high-end 3D runtime perf; the one improving engine path is **Godot-via-MCP** (text scenes + strong GDScript prior), kept as an escape hatch. Full analysis in **§8**. [E][Y]
- **Your instinct is correct and it's now the consensus design.** Game-gen ≈ UI-gen but **one level harder** (real-time, stateful, many coupled files). The winning harness is exactly what you described: **templates/skeletons + composable parts (skills/components) + genre scaffolds + multi-agent pipelines + a runtime test/verify loop.** This is independently named by the OpenGame paper [E], Metaplay [E], and every top vibe-coding creator [Y]. See §7.
- **The single biggest stability unlock is *runtime self-testing*** — giving the agent "eyes" to play the game (Playwright MCP / engine path-testing) and fix its own bugs. Static code-tests are provably insufficient because "a game can build and look correct while violating core mechanics" (GameGen-Verifier [E]; echoed by Chong-U, Peter Yang, PixelLab [Y]).
- **Best agentic benchmark reality:** even the best agent solves only **54.5%** of game-dev tasks (GameDevBench, CMU/Princeton [E]); game tasks need **>3× the code/file-changes** of normal SWE-bench tasks; image/video feedback loops jump Claude Sonnet 4.5 from **33.3% → 47.7%**. [E]
- **Practitioner mood is pragmatist-skeptical, not hype** [R]: loudest posts are failure confessions (unmaintainable 800–1000-line slop, "11 missing layers," $417 Claude-Code word game). Wins cluster in **assets/tooling** and **disciplined, technical** codegen — not naive one-shot full games. Same month, r/aigamedev: a non-coder shipped a 100%-AI game ("Slotbound") while r/gamedev's top post is "vibe coding led to my downfall, just learn to code." The difference is **scope discipline**, not tooling. [R]

---

## The two paradigms (the framing that prevents 90% of confusion)

| | **Paradigm 1 — Neural world model / "neural game engine"** | **Paradigm 2 — LLM/agentic CODE generation** |
|---|---|---|
| Output | Pixels/frames generated per-step by a net | Real source code + assets in a real engine |
| Examples | Genie 3, Oasis, Mirage, Cosmos, Hunyuan-GameCraft, Matrix-Game | Claude Code/Codex/Cursor → Phaser/Three.js/Godot/Unreal; Rosebud, Astrocade, Ludus |
| Ships a real game today? | **No** — interactive video / sim / prototyping | **Yes** — with a harness and scope discipline |
| State/save/inventory/logic | None (emergent, drifts) | Yes (it's actual code) |
| Memory horizon | seconds → ~1 minute | whole codebase (with context mgmt) |
| Cost | $1–2/user-hour or big-GPU | LLM tokens ($ tens–hundreds per project) |
| The UI-gen analogy | ~ text-to-image for interactivity | ~ v0/Lovable/Bolt for apps (this is your analogy) |
| Where it's genuinely useful now | robotics/agent sim, world prototyping, restyling, R&D | actual indie/web games, prototypes, asset gen |

The user's mental model ("templates, composable parts, genres, pipelines, stability") maps to **Paradigm 2**. Paradigm 1 is the headline-grabber but is not where a buildable harness lives in mid-2026.

---

## Key findings in depth

### 1. Neural world models / neural game engines (the "generate frames" branch) [E][Y]

**The frontier, mid-2026.** The bar moved from "demo video" to "you can actually play it," but every system is interactive *video*, not a stateful engine.

- **Google DeepMind Genie 3 / Project Genie** — the breadth+consistency leader. Official: **720p, 24fps, real-time**, consistent "a few minutes," **visual memory ~1 minute**, **promptable world events** (change weather, add objects mid-stream), auto-regressive frame-by-frame, consistency is an *emergent* property (no explicit NeRF/Gaussian-splat) [E deepmind.google; Y Bilawal Sidhu]. **Project Genie** shipped Jan 2026 to **Google AI Ultra (US, 18+)** but capped at **60 seconds**, promptable events *not yet* included [E blog.google]. Genie 2's memory "topped out at ~10s" — Genie 3 is a step change. Genie environments can feed DeepMind's **SIMA** agent as training/eval worlds [Y Google DeepMind]. **No official params/fps disclosed**; a secondary "11B / Jan-2026" claim is unverified and contradicts the official page — low confidence.
- **Decart Oasis / Oasis 2.0 / Mirage / Lucy** — the real-time, runs-locally pioneer. Oasis: **first real-time open-world model, 500M open weights**, ViT autoencoder + DiT backbone, **20fps** (one frame/0.04s), trained on "millions of hours of Minecraft," Diffusion Forcing + "dynamic noising" for stability; optimized for the **Etched Sohu** ASIC (vendor claims 4K/100B+/10× users) [E oasis-model.github.io]. Oasis 2.0 **re-skins live Minecraft at 1080p/30fps**; **MirageLSD** = "first infinite real-time gen with zero latency"; cloud-streamed so **no local GPU needed**, 10+ min sessions, ~1–2s input lag, **loses spatial memory** [Y Wes Roth]. Hit **1M users in 3 days**; raised $21M then +$32M.
- **Microsoft Muse / WHAM** (Nature, Feb 2025) — research-grade, single-game. **1.6B decoder-only transformer**, VQGAN tokens, **300×180** native res, trained on **Bleeding Edge** (~500k sessions / 7yr play / 1.4B frames), **98×H100 for 5 days**, **open weights** (3.7GB/18.9GB). Critical caveat in its own model card: **"too slow for real-time."** A **WHAM-RT** real-time variant is "playable in Copilot Labs." It's about *gameplay ideation*, not shipping engine code. [E nature.com, huggingface.co/microsoft/wham]
- **GameNGen** (Google/Tel Aviv, 2024) — the proof-of-concept that started it: **DOOM on Stable Diffusion v1.4 at >20fps on one TPU**, PSNR 29.4, only **3 seconds of history** (so no long-term state). [E gamengen.github.io]
- **NVIDIA Cosmos** — the *physical-AI* world-model leader (robotics/AV more than games). Predict/Transfer/Reason family, 2B/14B, **720p/16fps**, 5s clips, **Apache-2.0 + NVIDIA Open Model License** (commercially usable). **Cosmos 3 launched June 1, 2026** — "open omnimodal, unifies language/images/video/audio/actions." Architecture per [Y Sam Witteveen]: **mixture-of-transformers / dual-tower** (autoregressive *reasoner* 32B + *diffusion* generator, ~8B/tower), reuses the **WAN 2.2 VAE**, ships a local **Nano 8B**, "**pass in a JSON** of what to generate." [E github.com/nvidia-cosmos, Y]
- **Open-weight frontier (the action is here).** Tencent and Skywork are the most capable open families:
  - **Skywork Matrix-Game 1/2/3** — Matrix-Game-1 = 17B image-to-world + the **GameWorld Score** benchmark (beats Oasis/MineWorld on keyboard/mouse/object-consistency). Matrix-Game-3.0 (arXiv 2604.08995): **up to 40fps @ 720p with a 5B model** (scale to 28B for quality), **minute-long memory**, via error-aware self-correction + camera-aware KV-cache memory + DMD distillation + INT8 + pruned VAE; deploys on **8 GPUs (DiT) + 1 (VAE)**. The densest technical page found. [E]
  - **Tencent Hunyuan-GameCraft** — open weights, trained on **1M+ recordings across 100+ AAA games**, unifies keyboard+mouse into a shared camera space, 25fps, distilled real-time; needs ≥24GB VRAM (80GB recommended). **HY-World 1.5/WorldPlay** = "first open-source real-time + long-term geometric-consistent world model," 24fps. **HY-World 2.0** emits **editable 3D assets (mesh/3DGS)** importable to Blender/Unity/Unreal/Isaac — i.e. the "don't re-render every frame" branch. [E github.com/Tencent-Hunyuan]
  - **Overworld Waypoint-1.5** — **1.2B, Apache-2.0, 720p/60fps on an RTX 5090** (56–72fps quantized; ~30fps on a 3090), ~10s/512-frame context, runs on consumer GPUs / 360p tier on Apple Silicon. The most "you can run this at home" engine. [E huggingface.co/blog/waypoint-1-5]
  - **Tencent Yan** — highest *claimed* spec: **1080P/60fps** real-time via 3D-VAE + KV-cache shift-window; distilled Yan-Gen does 12–17fps on 1×H20, 30fps on 4×H20, infinite length. [E arXiv 2508.08601]
  - Others: **MineWorld** (MS, MIT, 4–7fps via Diagonal Decoding), **LingBot-World** (14B, <1s latency @16fps, 4-bit option). Open **training recipes** (the "how to reproduce" tier): **ForgeWM** (Wan2.1-1.3B, keyboard+mouse, Causal Forcing, 8×H20, 4-stage SFT→AR→CD→DMD), **DreamX-World** (AMAP, 5B-Cam, Apache-2.0), **Yume1.5** (CVPR 2026, TSCM + Self-Forcing, infinite duration), plus **Vid2World**, **Solaris** (multiplayer Minecraft), **StableWorld** (validated on Matrix-Game-2.0 / Open-Oasis / Hunyuan-GameCraft-1.0).
- **Odyssey** (closed, physics leader) — Odyssey-1: 5+ min coherent streams, new frame every **40ms**, up to **30fps** from H100 clusters. Odyssey-2 Max: AR DiT on "several hundred B200s," **120s+** real-time, proprietary KV-cache (sequences ~20× longer), **VBench2 physics 58.52 > Odyssey-2 Pro 49.67 > Cosmos-Predict2.5-14B 44.92**, PAI-Bench physics 93.02. Plus **Starchild-1** (joint audio+video AR, ≤24fps streaming) and **Agora-1** (**up to 4 players in a shared world**, GoldenEye-based, decoupled sim/render). $1–2/user-hour. [E odyssey.ml, airstreet]
- **Runway GWM-1 / Characters** — GWM-1 is a variant of Gen-4.5: **30s** real-time rollouts (vs Veo Robotics' 8s), **0.95 sim-real correlation** across 8 robot policies. **Runway Characters** on GWM-1: real-time video agents at **24fps HD, 1.75s end-to-end latency, 37ms model-time/frame** from one image — the "live AI character" frontier. [E runwayml.com, creativeainews]
- **Adjacent proof-points:** **NeuralOS** — a *generative OS* where every screen frame is predicted by RNN(state)+diffusion, **1.8fps on an H100** (shows the paradigm generalizes beyond games but is far from real-time) [R]. A heterogeneous-accelerator paper hits **720×480 @ 26.4fps** on an 8× Ascend 910C cluster with **2.7ms** amortized perceived latency via speculative execution [E arXiv 2602.00608].
- **World Labs / Marble** (Fei-Fei Li) — the *3D-asset* answer: outputs **Gaussian splats + collision meshes** a physics engine can use, exportable to Unity/Unreal, from text/image/video/sketch. Reportedly raising at **$5B valuation**. Fei-Fei's **taxonomy** [E drfeifei.substack.com]: world models are **renderers** (output pixels: Genie 3, World Labs RTFM) vs **simulators** (output state) vs **planners** (output actions) — today's "playable world" models are renderers, which is exactly why they aren't engines.

**Architectural consensus** across the open papers: **causal autoregressive diffusion transformers** + **few-step distillation** (DMD/Self-Forcing/Causal-Forcing) + **KV-cache/memory retrieval** for long-horizon consistency + **action-conditioning in latent space**. The universal failure mode: **temporal drift / error accumulation past the context window**, plus no persistent game state.

**Bottom line on Paradigm 1:** spectacular for **prototyping, robotics/agent sim, restyling, and R&D**; **not a shippable game engine** in 2026. The credible near-term product path is **hybrid**: generate worlds/assets, then *finish in a real engine* — which is the 3D-asset branch (World Labs Marble, HY-World 2.0).

### 2. LLM / agentic game CODE generation — the UI-gen analog (the buildable branch) [E][Y][R]

**The core thesis (now independently stated by research + products + creators):** a raw LLM can't hold a whole real-time stateful game in its head, so you **wrap it in a harness** that supplies *structure (templates), grounding (RAG/MCP/skills), decomposition (multi-agent roles), and runtime feedback (playtesting)*. This is §7.

**Why games are harder than apps (the load-bearing UI-gen comparison):**
- dev.to "Generative UI Is Three Things. Only One Ships." [E]: *"generating code is not the same as generating interfaces… the output [of v0/Claude Code] is a static artifact, a box you build once and reuse."* The from-scratch-every-load variant "produced usable interfaces at a coin-flip rate." Games are the *harder* third thing: a **real-time stateful system across many coupled files**.
- Metaplay [E] names **4 game-specific breakers** absent in web apps: **"What is fun?"** (unclear goals), **no standard architecture** ("speed-run you into the worst tech debt… in a day"), **visual editors agents can't operate** (Unity/Unreal/Godot), **undocumented tribal knowledge**.
- LinkedIn frontend-vs-gamedev [E]: *"almost all systems and subsystems tie-in together… one change in a certain part of the project could affect a completely different part… without us even realizing it."* (This is the stability problem you intuited.)

**This is corroborated bluntly on Reddit** [R]: the webdev PR-audit of ~340 AI PRs — *"plausible-looking code… no human would choose… a try-catch around a console.log… after October every PR started looking the same"*; r/gamedev's +2279 *"800–1000 line slop… makes two new bugs trying to fix the first… just learn to fucking code"*; r/vibecoding's *"shipped a product… 11 missing layers (no RLS, no rate limiting, no error tracking)."* The harness exists precisely to prevent these.

### 3. Asset-generation pipelines (where AI is *already* winning) [R][Y]

This is where practitioners report the cleanest, cheapest wins — and it's a separate, composable layer of the harness.

- **Pixel art / sprites.** The recurring lesson: *naive AI "pixel art" is fake* (smeared, non-grid-aligned, drifts between frames). Two fixes in the corpus: **Retro Diffusion** ("real, grid-aligned, pixel-perfect," 3-yr indie project) [R]; and **Chong-U's pixel-snap pipeline** [Y]: generate at high res → snap **every frame** against an alternating-pixel canvas + a west-facing "anchor" pose → lay into a sheet (256px frames → 1280×512) → normalize. The **16×16 trick**: feed a 16×16 checkerboard upscaled to 1024 as reference, "because most of the time it will just ignore your 16×16 requirement" (Nano Banana 2/Pro) [R]. **AutoSprite**: one character image → playable spritesheet [R].
- **3D models.** **Meshy** and **Hunyuan3D 2.5** repeatedly endorsed for "almost game-ready" text/image→3D with **auto-rig + preset animations** (attack/idle/defeat), export to Blender/Unity/Unreal [R][Y]. **Unity AI 3D Generator** (open beta, Apr 2026): image→3D via 4 backends (Hunyuan 3 Pro/2, Rodin Hyper3D, Gen2); **Hunyuan Pro best mesh but huge triangle counts**, needs LOD; "sides/backs struggle" — **placeholder-grade** [Y Unity]. Universal verdict [Y Unity/Meshy/Roboverse/Sunny Valley]: **generated 3D is prototype/placeholder, to be replaced by human artists.**
- **Animation/characters.** A dev animated **30 characters in one night for $150** via local Stable Diffusion vs **$1,500–$90,000** Live2D quotes [R]. Real-time AI-generated NPC dialogue **and** animation demoed [R].
- **Terrain.** **Landforge.ai**: sketch top-down → geologically-realistic heightmap, "~80% there, hand-sculpt the last 20%." [R]
- **Style-anchoring trick** [Y Roboverse]: keep one style line at the end of every asset prompt (e.g. "Souls-like dark fantasy"); change that one line to **restyle the whole library** consistently — the asset-pipeline equivalent of a design token.

### 4. Commercial product landscape (mid-2026) [E][Y]

| Product | What it actually outputs | Target | Pricing (where known) | Credible critique |
|---|---|---|---|---|
| **Rosebud AI** (Game Maker) | Browser **Three.js** 2D/3D games, hosted+remixable; PixelVibe sprites; World Labs 3D | non-coders, MVP | freemium, free ~20 prompts/wk; commercial rights need Pro/"10x Dev" | **~2,500-LOC context ceiling** per project (their own eng blog); "70k creators/2.4M games" are self-reported [E medium reality-check] |
| **Astrocade** | Text → complete **browser arcade** games; modular engine + gen models; multiplayer/leaderboards/remix | casual/social | hosted, on-platform | prototype-grade, on-platform lock-in [E ai-review] |
| **Ludus.ai** | **In-Unreal copilot**: text→Blueprint/C++ (.h/.cpp w/ UPROPERTY/UFUNCTION), **indexes your real project** | UE devs/studios | indie/pro; raised **$1.3M** | "supercharged intern, not autonomous"; can't author Blueprint logic alone [Y Dog's Dream; E smythos] |
| **Series AI "Rho"** | "AI-native full-stack **meta-engine**," ~20 generators, 300k-word narrative→playthroughs, exports Unity/Unreal | premium studios | proprietary | mostly internal, slow public proof [E series.ai] |
| **Roblox Cube + Assistant** | 3D→**"4D"** functional objects via **schemas** (parts+behaviors; prompt a drivable car in-game); **CubePart** open-vocab part-meshes; **open weights** | Roblox creators/players | platform | beta; next-geometry-token framing (not diffusion) [Y Roblox; E about.roblox.com] |
| **Unity AI / Muse** | In-editor chat/code/texture + **3D & sprite generators** (open beta) | Unity devs | platform | functional today; "prompt full games" framing dismissed as **stock-pump** [Y Gamefromscratch] |
| **Microsoft/Xbox Muse** | Gameplay **ideation** (WHAM), not engine code | research/Xbox | — | not a shipping creator product yet [E] |
| **Meta Horizon "Creator Assistant"** | AI agent in desktop editor: **TypeScript** game logic, SFX/audio, meshes/textures/skyboxes | Horizon creators | platform | in-VR creation deprecated for desktop+agent [E uploadvr] |
| **Sorceress** | 7-primitive stack → playable **Phaser 4.1 / Three.js r184** from one prompt; publish to Arcade/GitHub Pages | indie/hobby | credits | vendor-authored narrative [E sorceress.games; R] |
| **Hytopia** | Voxel MMO SDK, text-to-game + AI-NPC framework (**XML action defs** to cut tokens) | SDK devs | SDK+hosting | early [E blog.hytopia.com] |
| **Convai / Inworld** | Runtime conversational **NPC AI** (not codegen) | studios | SDK | runtime layer, complementary [E] |

### 5. Open-source projects & frameworks worth knowing [E]

- **Donchitos/Claude-Code-Game-Studios** — turns Claude Code into a studio: **49 agents, 72 skills**, **~21,006★**, active. The high-traction productized "agentic studio" pattern.
- **leigest519/OpenGame** — the research framework: **Game Skill** (Template Skill + Debug Skill) + **GameCoder-27B** + **OpenGame-Bench** (Phaser). The cleanest academic articulation of the harness thesis (§7). [arXiv 2604.18394]
- **Pluto156/AutoUE** — multi-agent **Unreal** 3D-game generation w/ RAG over engine docs + auto play-testing. [arXiv 2603.07106]
- **waynchi/gamedevbench** — **GameDevBench** (132 tasks) — the SWE-bench-for-games. [arXiv 2602.11103]
- **0x0funky/agent-game-forge** (120★) — local-first, BYO-agent (Codex/Claude Code) 2D game IDE. **pamirtuna/gamestudio-subagents** (207★) — 12 agents, multi-engine.
- **Roblox/cube** — official open-weights 3D foundation model. **Tencent-Hunyuan/HY-World-2.0** — open 3D-world generator.
- Long tail (single-digit stars, mostly early/learning): GenesisEngine, Zerograft, god-code (Godot agent w/ playtest+MCP), ForgeDNA ("gameDNA" master schema), godogen, game-mcp, robcost/gameforge (Claude Agent SDK + MCP + Nano Banana + Lyria → Phaser3/Three.js).
- **Godot MCP** (the bridge most creators use) — connects Claude Code/Codex to Godot; setup in §8.

### 6. Benchmarks & research (the few hard numbers) [E]

- **GameDevBench** (CMU/Princeton, Feb 2026) — 132 tasks from tutorials; **best agent 54.5%**; tasks need **>3× LOC/file-changes** vs prior SWE benchmarks; **46.9% gameplay vs 31.6% 2D-graphics**; **image/video feedback → Sonnet 4.5 33.3%→47.7%**. Built with Codex + GPT-5 family. **The headline takeaway: agentic game-dev is far from solved.**
- **OpenGame-Bench** — 150 prompts scored on **Build Health / Visual Usability / Intent Alignment** via **headless-browser execution + VLM judging**.
- **GameGen-Verifier / GGV-Harness** — decompose spec into **verifiable keypoints**; patch runtime into a target state, run bounded interaction, assert. Motivation: *"a generated game may build successfully and appear visually correct while violating core mechanics."*
- Others: **V-GameGym** (visual game gen for code LLMs), **WorldCoder-Bench** (physically-grounded 3D world synthesis), **Code World Models for General Game Playing**, **"Distilling Game Code World Model Generation into Lightweight LLMs"** (arXiv 2605.24375), **ProxyWar** (dynamic LLM-codegen assessment in game arenas), **GameGPT** (2023, the early multi-agent gamedev framework), **CreativeGame** (iterative HTML5 w/ mechanic-guided planning + runtime validation + cross-version memory), **"From Code to Play"** (LLM-guided program search / hill-climbing on Atari-minis, Baba Is You levels, Asteroids, maze gen).
- **Synthesis takeaway:** the research has converged on one shape — **generate code/spec → execute in a real runtime → verify against decomposed assertions (often VLM-judged) → feed failures back**. The open problem everyone names is **defining and measuring "fun"/intent**, which no benchmark fully solves yet.

---

## 7. Designing the harness — game-gen ≈ UI-gen, but harder (the part you asked for)

Your hypothesis is right and it's now the field's consensus design. Here are the **5 harness layers** that recur across research ([E] OpenGame, AutoUE, Metaplay, SculptAI, GameGen-Verifier) and practitioner demos ([Y] Chong-U, Peter Yang, PixelLab, JC BuenaVentura). Build these and you get the stability you're after.

**Layer 1 — Templates / skeletons + a growing skill library (your "templates" + "composable parts").**
- OpenGame's core abstraction is **Game Skill = Template Skill (grows reusable project skeletons from experience) + Debug Skill (a living protocol of verified fixes)** [E]. This is *literally* "templates + a self-improving fix database."
- The direct UI-gen parallel: v0 ships **shadcn/ui**; Lovable ships **Vite+React+Supabase** defaults [E webtwizz]. Your game harness ships **engine-specific starter projects + a component/skill library**.
- Practitioner form: **SKILL.md folders** with name/description front-matter + progressive disclosure (Chong-U's `phaser-gamedev` skill, a `Phaser 4` skill to pin the version past the model's knowledge cutoff, a `Playwright testing` skill) [Y]. Productized: Claude-Code-Game-Studios (49 agents/72 skills), YetiClaw (27 SKILL.md agents on local Qwen3-14B) [E].
- **The named failure modes templates prevent** (OpenGame): **Logical Incoherence, Engine-Specific Knowledge Gaps, Cross-File Inconsistencies.**

**Layer 2 — Grounding: RAG over engine docs + MCP context + a per-project index (kills hallucination).**
- AutoUE grounds agents with UE tool docs to "mitigate tool-use hallucinations" and bakes **game-design patterns + engine constraints** into codegen [E].
- Metaplay Fix #1: expose docs/source/APIs via **MCP connectors** + custom skills/index files as "ground truth" so the agent "stops guessing and starts looking things up" [E].
- Ludus's differentiator: **index the actual project** (your variable names, class hierarchy, event structure) [E].
- Practitioner form: **`index.json` / `assets.json`** (Chong-U's ~400-line asset index) so the agent gets exact dimensions every time and **never re-parses the folder after a context clear/compaction** [Y]. `PLAN.md` kept continuously updated (PixelLab) [Y]. This is the cheapest, highest-leverage stability trick in the whole corpus.

**Layer 3 — Genre scaffolds + schema/spec-driven generation (your "genres" + structural stability).**
- **Spec/PRD-first, milestone-based, never one-shot** is unanimous [Y Peter Yang, Chong-U, PixelLab; E]. Peter Yang's pattern: "write a spec with requirements, **three playable milestones**, and links to all assets… use AskUserQuestion if you have questions," then build milestone-by-milestone.
- **Executable schemas constrain generation**: Roblox's **schemas** deconstruct objects into parts+behaviors; ForgeDNA's **`gameDNA`** master schema; **Generative Ontology** "encodes domain knowledge as executable schemas… decompose the ontology into domains and assign a specialized agent to each" (CATAN → mechanisms/components/player-dynamics) [E].
- Genre scaffold = a template (Layer 1) + a genre-specific schema (mechanics, entities, win/lose, control map) + a genre QA checklist (Layer 5). This is the cleanest way to get "stability via genre" you mentioned.

**Layer 4 — Multi-agent role decomposition (your "different parts pieced together").**
- AutoUE: **model-retrieval agent** (embedding DB over **858K 3D models**) + scene-gen (UE PCG) + gameplay-code + interactive-object + **play-test** agents [E].
- SculptAI: **4 agents** routing to GPT-4 (design/narrative), Llama (C# code), Gemini (multimodal art) over a **shared context layer / live relationship map of all game entities & dependencies** — "cut dev time 70%," raised $350k [E].
- Productized: Claude-Code-Game-Studios (49 agents), gamestudio-subagents (12), YetiClaw (27) [E]. QuadCode shipped a game in 3 days with **3 named agents** (dev/designer/motion), Opus, + 2 linked reference games (Bloons mechanics + Mini Motorways visuals) [Y].
- **Codex parallel sub-agents** [Y Chong-U]: literally "use parallel sub agents" spawns 4 background generators for 4 art variations at once — the cheap version of fan-out.

**Layer 5 — Automated playtesting / runtime verification (THE hard part — and the prerequisite for any RL/self-improvement flywheel).**
- This is the layer naive vibe-coding skips and why it rots. **Static code tests are provably insufficient**: "a game can build and appear visually correct while violating core mechanics" [E GameGen-Verifier].
- Research forms: **OpenGame-Bench** = headless-browser execution + VLM judging; **AutoUE** auto-generates+executes runtime test commands; **GGV-Harness** = patch runtime into a target state → bounded interaction → assert keypoints, with concurrency/isolation/fault-recovery; **GameDevBench** image/video feedback (the +14pt jump) [E].
- Practitioner form: **Playwright MCP** so the agent *plays* the game, screenshots, and fixes itself (Chong-U, Peter Yang); **engine path-testing** in Godot (PixelLab, JC); a **"gym level"** with debug toggles for idle/walk/jump/attack and **debug-bounds visualization** to verify hitboxes/attack-frames (e.g. "weapon only hits on frame 4") [Y].
- **Self-improving loop**: when the agent errs, prompt "look at the skill and update it so this never happens again" — but note **skills can introduce regressions**, so the skill library needs maintenance (a `hermes`-style discipline) [Y Chong-U].

**The one extra layer games need that UI-gen mostly skips: "juice"/game-feel.** Creators agree the *feel* can't be one-shotted [Y Chong-U]: screen shake, a **split-second hit-freeze** ("you don't notice it if you don't think about it"), combo gating (attack 2 only fires if attack 1 connected). Budget a dedicated polish pass / agent for this — it's where a generated game stops feeling generated.

> **Net recommendation for a game-gen harness:** pick **one deterministic, all-code engine first** (OpenGame deliberately chose **Phaser** because "a complete game can be expressed entirely in raw JS/TS — highly amenable to LLMs"; Three.js is the 3D analog). Ship **engine starter templates + a SKILL.md library + a per-project `index.json`/`PLAN.md` + genre schemas + a planner/coder/artist/playtester agent split + a Playwright/headless runtime-verify loop.** That is the buildable, stable system — and it's exactly the UI-gen pattern with two extra layers (runtime verification + game-feel).

---

## 8. Substrate decision — web stack vs native game engine (LLM code-gen only) ⭐ DEFAULT TO WEB

> **Scope note:** this section assumes **LLM code-gen games only** (world models excluded by design). It answers the recurring question: *should the agent write web code (TS + Three.js/Phaser, runs in every browser) or drive a native engine (Godot/Unity/Unreal)?*

**Verdict: web/TypeScript is both the most trending and the most reliable substrate for LLM game generation in mid-2026.** It wins on 3 of the 4 axes that matter; native engines only lead on raw high-end 3D runtime performance. This is the field's de-facto consensus, not just a preference.

**Why web wins for *generation* (ranked):**
1. **Training-data dominance** — JS/TS + React + web APIs are the most over-represented code in every frontier model; GDScript/Unity-C#/UE-C++ are far thinner and **Unreal Blueprints are visual graphs, near-impossible to emit as reliable text**. Strongest model prior by a wide margin. [reasoning, corroborated E/Y]
2. **The whole game is text** — `.ts/.js/.html` fits in context, fully diff-able, no binary scene files. Native engines hide state in **binary/visual editors agents can't operate** — Metaplay names this as a core reason agents break on engines. (Godot is the exception: `.tscn` scenes are *text*.) [E Metaplay]
3. **Runtime verification is trivial in a browser — the #1 stability unlock** — headless Chromium + Playwright MCP lets the agent *play → screenshot → fix its own bugs*. OpenGame-Bench scores via "headless browser execution + VLM judging"; top creators rely on Playwright self-testing. You cannot close that loop nearly as cheaply inside Unity/Unreal. [E OpenGame; Y Chong-U, Peter Yang]
4. **Distribution** — runs on every browser, instant deploy, shareable link, no install. Why Rosebud (Three.js), Astrocade (browser arcade), Sorceress (Phaser 4.1 / Three.js r184) all ship to web. [E]

**The headline evidence:** the most credible open research harness, **OpenGame**, deliberately targets **Phaser** because *"a complete Phaser game can be expressed entirely in raw JavaScript or TypeScript… highly amenable to LLMs."* [E arXiv 2604.18394]

**Critical distinction (don't conflate):**
- **Generation stability / reliability** (will the LLM produce working, maintainable code?) → **web wins decisively.**
- **Runtime performance** (fps under heavy 3D, big worlds, console export) → **native engines win at the high end**, but web-3D is far more capable than assumed: an agent built a **Three.js FPS at 144fps, no engine** [Y Red Stapler], and **WebGPU** is closing the gap. For 2D and moderate 3D, web perf is a non-issue.

**3D package choice (stay on web, add a package):**

| Need | Use | Why for LLM-gen |
|---|---|---|
| 2D (start here) | **Phaser** (TS) | OpenGame's pick; pure code; densest LLM knowledge; trivial to verify |
| 3D, declarative + composable | **React-Three-Fiber** (R3F over Three.js) | JSX components = game entities → maps perfectly to "templates + composable parts"; huge React prior |
| 3D, imperative/perf | **Three.js** (raw) | Most examples in training data; what creators actually one-shot [Y] |
| 3D, batteries-included | **Babylon.js** / **PlayCanvas** | Engine-grade features, still web; PlayCanvas has an editor + better perf for bigger scenes |

**The native-engine trend that IS real (where "people see improvements"):** it is **not** Unity/Unreal becoming vibe-codeable — it's specifically **Godot + MCP**. Godot is **open-source, its scene files are text, GDScript is simple, and Claude is notably strong at GDScript** [Y PixelLab: "Claude best for GDScript vs GPT/Gemini"]; the MCP bridge turns the engine into an agent-operable tool (JC BuenaVentura's "Angry Birds in 6 prompts" via `claude mcp add godot`) [Y]. By contrast **Ludus (Unreal)** stays a copilot — "supercharged intern, not autonomous… can't author Blueprint logic alone" [E/Y]; **Unity's** "prompt full games" framing was dismissed as stock-pump theater [Y]; and **Godot maintainers are "drowning in AI-slop PRs"** [Y] — engines are where naive agent output breaks most visibly.

**Standing recommendation for this project (`game-omni`):** **default to web/TypeScript** — Phaser (2D) + React-Three-Fiber/Three.js (3D) — and build the §7 harness on it. React's component model *is* the composability/template layer. Keep **Godot-via-MCP as the single escape hatch** for titles that genuinely need native 3D performance or console export — the only engine path where LLM generation is currently stable. Re-evaluate the engine side as Godot-MCP + agent-skills mature; that's the axis to watch.

---

## What's working (claimed)
- **Asset generation** — sprites (with pixel-snap), 3D placeholders (Meshy/Hunyuan, auto-rig+anim), terrain (Landforge), character animation at ~1000× cost reduction. Cleanest wins. [R][Y]
- **Disciplined codegen of small/medium games** — Phaser/Three.js/Godot via Claude Code/Codex with templates+skills+playtesting; 2D games "20 min to shipped," Three.js FPS "~1hr, 144fps, no engine," 3D multiplayer "~15 min." Real, when scope is bounded. [Y]
- **Agent skills + MCP + per-project index** — the consensus stability stack. [Y][E]
- **Runtime self-testing (Playwright/engine path)** — the unlock that closes the bug loop. [Y][E]
- **Hard-problem codegen** — Claude Code reverse-engineered a 13-yr-old Disney Infinity binary the modding community couldn't crack for a decade; revived a dead 1992 game from invented script + 1998 manual. [R]
- **World models for prototyping/robotics-sim/restyling** — genuinely useful, just not as engines. [E][Y]

## What's broken / contested
- **Naive vibe-coding rots fast** — 800–1000-line slop, "11 missing layers," one codebase "3 different ways to do the same thing," PR-audit homogenization. Velocity is real *and* decay is real, simultaneously. [R]
- **World models ≠ game engines** — no persistent state/collision/save; minute-scale memory; ~$80k machine for "720p jank" (Gamefromscratch); $1–2/user-hour; immersion breaks on zoom-out (Bijan Bowen). [Y][E]
- **AI 3D output is placeholder-grade** — bad backs/sides, heavy triangle counts. [Y]
- **Vendor framing distrusted** — Unity "prompt full games" called stock-pump theater; Rosebud's user/game counts are self-reported marketing; Series AI Rho has slow public proof. [Y][R][E]
- **Ecosystem backlash** — Godot maintainers "drowning in AI-slop PRs" (demoralizing); AI-art association gets indie games refunded/review-bombed (two devs refunded for *human* hand-painted art). [Y][R]
- **Same technique, opposite verdicts** — non-coder ships 100%-AI "Slotbound" vs "vibe coding led to my downfall"; difference is **scope discipline**, not tooling. [R]
- **Echo-chamber risk** — world-model subreddits are mostly link-sharing with little hands-on; weight [E]/[Y] technical sources over [R] hype for Paradigm 1. [R]

## Numbers worth verifying
- Genie 3: **720p / 24fps / "a few minutes" / ~1-min memory**; Project Genie **60s cap**, US AI Ultra 18+ [E]. No official params (unverified "11B").
- Decart Oasis: **500M open weights / 20fps / 0.04s per frame / 460p on H100 / 1M users in 3 days**; funding $21M+$32M [E].
- WHAM: **1.6B / 300×180 / 98×H100 × 5 days / open weights 3.7GB+18.9GB / "too slow for real-time"** [E].
- GameNGen: **DOOM / >20fps / 1 TPU / PSNR 29.4 / 3s history** [E].
- Matrix-Game-3.0: **40fps @ 720p @ 5B (→28B) / 8 GPU DiT + 1 VAE** [E]. Yan: **1080P/60fps** claim [E]. Waypoint-1.5: **1.2B / 720p/60fps on RTX 5090 (56–72fps) / ~30fps on 3090 / Apache-2.0** [E]. Odyssey-2 Max: **VBench2 physics 58.52 vs Cosmos-14B 44.92 / 120s+ / $1–2/user-hr** [E].
- Cosmos: **2B/14B, 720p/16fps, Apache-2.0 + Open Model License; Cosmos 3 = 32B reasoner + ~8B/tower diffusion + Nano 8B; launched 2026-06-01** [E][Y].
- Hunyuan-GameCraft: **1M+ recordings / 100+ AAA games / 25fps / ≥24GB VRAM** [E].
- **GameDevBench: best agent 54.5%; >3× LOC vs SWE-bench; 46.9% gameplay / 31.6% 2D-graphics; image+video feedback → Sonnet 4.5 33.3%→47.7%** [E].
- Rosebud **~2,500-LOC ceiling / ~20 free prompts/wk / 2.4M games / 358k community games** [E]. SculptAI "**70% time cut**, $350k seed, $4.8M val, 4-agent (GPT-4/Llama/Gemini)" [E]. Ludus **$1.3M raised, UE 5.4–5.7** [E]. Claude-Code-Game-Studios **21,006★ / 49 agents / 72 skills**; gamestudio-subagents 207★; agent-game-forge 120★ [E].
- Cost anecdotes [R]: **$417** Claude Code for a word game; **$150** for 30 animated characters (vs $1,500–$90,000 Live2D); local one-shot Pacman — **Gemma 4 31B (3m51s/6,209 tok) beat Qwen 3.6 27B (18m04s/33,946 tok)** on M5 Max.

---

## Ready-to-paste examples / worked scaffolds (reconstructed from the legs)

**A. Canonical 2D Phaser harness** (Chong-U, [Y] https://youtu.be/QPZCMd5REP8?t=531):
```
1. Drop assets → public/assets/
2. Prompt 1: "Study the assets in <folder> and create assets/index.json indexing them —
   account for sprite-sheet animations and tilesets — so Phaser can reference them."
3. Install skills: phaser-gamedev skill + a `Phaser 4` version-pin skill + a Playwright testing skill.
4. Prompt 2 (PLAN MODE): "Build step-by-step: 3 background layers → tileset ground →
   place + animate character." (If no mockup, generate one in Nano Banana Pro from the tilesets.)
5. Let the agent self-test via Playwright (screenshot → play → fix).
```

**B. Spec-with-milestones prompt** (Peter Yang, [Y] https://youtu.be/247Z3jdw_hs?t=275):
```
"Write a spec with requirements, three milestones, and links to all the pixel-art assets we'll use.
Each milestone should be PLAYABLE. Use AskUserQuestion if you have any questions."
→ then build milestone-by-milestone; cut scope rather than one-shot.
```

**C. Godot MCP bridge** (JC BuenaVentura, [Y] https://youtu.be/FR0X4e6dgq8?t=90):
```
git clone <godot-mcp repo> && cd godot-mcp && npm install && npm run build
claude mcp add godot --scope project --node <ABS path>/build/index.js
# Re-run per project, else "the AI will completely hallucinate your codebase."
# Then ~6 iterative debug prompts; the agent fixes its own physics across iterations.
```

**D. Three.js FPS recipe** (Red Stapler, [Y] https://youtu.be/NdBHo7u6vmM?t=107):
```
"Create an FPS game using ONLY three.js, and use the official three.js first-person example
 (<paste URL>) as the base for physics and controls."
Assets: Sketchfab GLB + PolyHaven envmap in /assets.
Pre-step: have Gemini review/enhance the prompt first. Then STOP the agent and test manually.
```

**E. `index.json` stability pattern** (Chong-U, [Y] https://youtu.be/yKyjcbQiar4?t=699): one ~400-line file of exact asset dims so the agent never re-parses the folder after a context clear; build a **"gym level"** with idle/walk/jump/attack debug toggles before real levels.

**F. Pixel-snap sprite pipeline** (Chong-U, [Y] https://youtu.be/nIAIxvNUrdU?t=998): generate a west-facing **anchor** + pass an **alternating-pixel canvas** as reference → **pixel-snap every frame** → lay into sheet (256px frames → 1280×512) → normalize. Fixes fake-pixels, frame-bleed, frame-drift.

**G. Style-anchor token** (Roboverse, [Y] https://youtu.be/AQyYv5gknWs?t=357): keep one style line at the end of every asset prompt; change it once to restyle the whole library; then Meshy 2D→3D.

**H. Self-improving skill loop** (Chong-U, [Y] https://youtu.be/QPZCMd5REP8?t=1513): on a mistake, "look at the skill and update it so this never happens again"; compact at ~37% context to reclaim ~78%. (Watch for skill-induced regressions.)

---

## Practice → source quick-reference

| Practice | Why it works | Source | Leg |
|---|---|---|---|
| Pick one all-code engine (Phaser/Three.js) first | Whole game expressible in raw JS/TS → "highly amenable to LLMs" | OpenGame (arXiv 2604.18394) | [E] |
| Ship template/skeleton + growing skill library | Prevents Logical Incoherence / Engine-Gaps / Cross-File Inconsistency | OpenGame "Game Skill" | [E] |
| Per-project `index.json` + `PLAN.md`, kept updated | Agent gets exact dims, never re-parses after compaction; survives context clears | Chong-U, PixelLab | [Y] |
| RAG over engine docs + MCP "ground truth" | "Stops guessing, starts looking things up"; cuts tool hallucination | Metaplay, AutoUE | [E] |
| Index the actual project (your symbols) | Context-aware gen matches your codebase | Ludus | [E][Y] |
| Spec-first, 3 playable milestones, never one-shot | One-shotting is "just a demo"; milestones bound scope | Peter Yang, Chong-U | [Y] |
| Executable schemas / genre scaffolds | Constrain generation; assign one agent per ontology domain | Generative Ontology, Roblox, ForgeDNA | [E] |
| Multi-agent split (planner/coder/artist/playtester) | Decompose; shared entity-dependency map | AutoUE, SculptAI, CC-Game-Studios | [E][Y] |
| **Runtime playtesting (Playwright/engine path) — the unlock** | Build-success ≠ correct mechanics; agent fixes its own bugs | GameGen-Verifier, Chong-U, Peter Yang | [E][Y] |
| Image/video feedback into the loop | +14pts on GameDevBench (Sonnet 4.5 33→48%) | GameDevBench | [E] |
| Dedicated "juice"/game-feel pass | Hit-freeze/shake/combo-gating can't be one-shot; where it stops feeling generated | Chong-U (+ Vlambeer/GMTK lineage) | [Y] |
| Pixel-snap sprite pipeline / Retro Diffusion | Naive AI "pixel art" isn't grid-aligned, bleeds, drifts | Chong-U; r/aigamedev | [Y][R] |
| Treat AI 3D as placeholder, plan human replace | Bad backs/sides, heavy tris | Unity, Meshy, Roboverse | [Y] |
| Hybrid for world models (gen → finish in engine) | Renderers have no state/physics-sim; 3D-asset branch exports meshes | Fei-Fei taxonomy, HY-World 2.0, World Labs | [E] |
| Scope discipline > tooling choice | Same tools, opposite outcomes by ambition | r/aigamedev vs r/gamedev | [R] |

---

## Next moves
- **Concrete experiment:** stand up the §7 harness on **Phaser (2D) or Three.js (3D)** — engine starter template + 3–4 SKILL.md files (engine, version-pin, testing, asset-index) + a `PLAN.md`/`index.json` convention + a **Playwright/headless runtime-verify** loop + a genre schema (start with one genre, e.g. top-down arena). Measure against an OpenGame-Bench-style rubric (Build Health / Visual Usability / Intent Alignment).
- **Decide your paradigm explicitly:** if "game-omni" wants *shippable* games → Paradigm 2 harness. If it wants *infinite explorable worlds / prototyping* → integrate a world model (Genie/Cosmos/open Waypoint) as a *prototyping* or *asset* stage, not the engine.
- **Steal the verification flywheel:** read **GameGen-Verifier (GGV-Harness)** + **OpenGame** + **GameDevBench** before designing your eval — they're the only rigorous runtime-verification blueprints, and verification is the gate to any RL/self-improvement.
- **Follow-up searches if needed:** (a) hard pricing for Astrocade/Sorceress/Hytopia/Series-AI (gap this run); (b) Series AI Rho 2026 shipped-titles; (c) Hunyuan-GameCraft-2 (arXiv 2511.23429) specs; (d) Decart Mirage/Lucy 2 exact latency/weights (paywalled this run).
- **Corpus is now seeded:** `yt_ai_game_generation` (50 videos) is in the global yt-rag corpus — future runs benefit. Consider ingesting whole channels **@AI-OrientedDev (Chong-U)**, **@bilawalsidhu**, **@AIandGames**, **@JCBuenaVentura** for deeper codegen/world-model coverage.

---

## Sources

### Reddit [R]
- Vibe-coding downfall (+2279) — r/gamedev — https://www.reddit.com/r/gamedev/comments/1q043ym/how_vibe_coding_lead_to_my_projects_downfall/
- 6-month PR audit (+1658) — r/webdev — https://www.reddit.com/r/webdev/comments/1sin68g/i_audited_6_months_of_prs_after_my_team_went/
- "Slotbound" 100%-AI game (non-coder) — r/aigamedev — https://www.reddit.com/r/aigamedev/comments/1tkeg86/im_not_a_developer_and_this_slot_machine/
- "11 missing layers" — r/vibecoding — https://www.reddit.com/r/vibecoding/comments/1tg7v1e/vibe_coding_tricked_me_into_thinking_i_shipped_a/
- Codebase-is-a-disaster — r/vibecoding — https://www.reddit.com/r/vibecoding/comments/1su03dk/vibe_coded_for_6_months_my_codebase_is_a_disaster/
- Local Pacman one-shot (Gemma 4 vs Qwen 3.6) — r/LocalLLaMA — https://www.reddit.com/r/LocalLLaMA/comments/1t0epei/qwen_36_27b_vs_gemma_4_31b_making_packman_game/
- Claude Code Disney Infinity RE — r/ClaudeAI — https://www.reddit.com/r/ClaudeAI/comments/1ru3irp/i_used_claude_code_to_reverse_engineer_a/
- $417 word game — r/ClaudeAI — https://www.reddit.com/r/ClaudeAI/comments/1jpddbf/i_blew_417_on_claude_code_to_build_a_word_game/
- Dead 1992 game revival — r/ClaudeAI — https://www.reddit.com/r/ClaudeAI/comments/1sfsz67/i_gave_claude_my_dead_games_30yearold_files_and/
- Retro Diffusion real pixel art — r/aigamedev — https://www.reddit.com/r/aigamedev/comments/1n6iz15/some_real_pixel_art_sprite_sheets/
- 16×16 pixel-art checkerboard trick — r/aigamedev — https://www.reddit.com/r/aigamedev/comments/1slkwdu/how_to_create_super_low_res_16x16_pixel_art_assets/
- 30 characters for $150 — r/aigamedev — https://www.reddit.com/r/aigamedev/comments/1l0qy0u/how_i_animated_30_characters_in_one_night_for/
- Landforge.ai terrain — r/proceduralgeneration — https://www.reddit.com/r/proceduralgeneration/comments/1oedrnc/i_built_a_tool_that_generates_realistic_3d/
- AutoSprite — r/aigamedev — https://www.reddit.com/r/aigamedev/comments/1ogwg9f/i_built_a_tool_that_converts_one_character_image/
- Vibe-coded app security / CodeRabbit — r/ChatGPTCoding — https://www.reddit.com/r/ChatGPTCoding/comments/1nyuh8b/how_to_actually_make_your_vibe_coded_apps_secure/
- Hunyuan3D World Model 1.0 OSS — r/LocalLLaMA — https://www.reddit.com/r/LocalLLaMA/comments/1mab2i2/tencent_releases_hunyuan3d_world_model_10_first/
- NeuralOS — r/MachineLearning — https://www.reddit.com/r/MachineLearning/comments/1m3v7ll/r_neuralos_a_generative_os_entirely_powered_by/
- Genie 3 reveal — r/singularity — https://www.reddit.com/r/singularity/comments/1mia4sv/deepmind_genie_3_is_our_groundbreaking_world/

### YouTube (yt-rag, namespace `yt_ai_game_generation`) [Y] — deep-links keep MM:SS
- Genie 3 deep-dive — Bilawal Sidhu — https://youtu.be/Ig_lPSAVelI?t=2
- Phaser pipeline + Playwright testing skill — Chong-U AI Oriented Dev — https://youtu.be/QPZCMd5REP8?t=531
- index.json + "gym level" + juice — Chong-U — https://youtu.be/yKyjcbQiar4?t=699 ; https://youtu.be/yKyjcbQiar4?t=1042
- Pixel-snap sprite pipeline — Chong-U — https://youtu.be/nIAIxvNUrdU?t=998
- Codex parallel sub-agents (beat-em-up) — Chong-U — https://youtu.be/NwKZOn3O5oI?t=533
- Angry Birds in 6 prompts + Godot MCP — JC BuenaVentura — https://youtu.be/FR0X4e6dgq8?t=90
- PixelLab MCP + PLAN.md discipline — PixelLab — https://youtu.be/THwZYWuOdZI?t=458
- Zero-to-shipped in 20 min (spec milestones) — Peter Yang — https://youtu.be/247Z3jdw_hs?t=275
- Three.js FPS in ~1hr (no engine) — Red Stapler — https://youtu.be/NdBHo7u6vmM?t=107
- 3D multiplayer in ~15 min — How I AI / Cody De Arkland — https://youtu.be/xW5y2Yv_E2Y?t=727
- Cosmos 3 architecture — Sam Witteveen — https://youtu.be/2zDtIWeyqYs?t=92
- Mirage real-time engine — Wes Roth — https://youtu.be/WmpiI7fmCDM?t=277
- Roblox Cube "4D" assets — Roblox Tech Talks — https://youtu.be/8Djgx0jEyfs?t=735
- Unity AI 3D Generator — Unity — https://youtu.be/y9Ps0OPsiIQ?t=97
- Meshy full workflow — MeshyAI — https://youtu.be/kUa6N-2X4Zo?t=92
- Style-anchor + 2D→3D — Roboverse — https://youtu.be/AQyYv5gknWs?t=357
- Ludus in Unreal — Dog's Dream — https://youtu.be/ySqLAayNmaM?t=370
- Astrocade walkthrough — Letta Corp — https://youtu.be/8JVlGygw4LM?t=183
- Rosebud AI — Rosebud AI — https://youtu.be/Y-iU9ttwzeM?t=109
- "Slop Apocalypse" critique (Godot PRs, Genie cost) — Gamefromscratch — https://youtu.be/T23m4pPrYxw?t=638
- Genie 3 hands-on limits — Bijan Bowen — https://youtu.be/sIu7lMpiqMA?t=1096
- QuadCode 3-agent build — QuadcodeAI — https://youtu.be/L6Vq2YfBS-w?t=3

### Exa web [E]
- Genie 3 — https://deepmind.google/blog/genie-3-a-new-frontier-for-world-models/ ; Project Genie — https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/
- Decart Oasis — https://oasis-model.github.io/ ; https://decart.ai/ ; https://github.com/DecartAI/mirage-minecraft-mod
- Microsoft WHAM (Nature) — https://www.nature.com/articles/s41586-025-08600-3 ; model card — https://huggingface.co/microsoft/wham
- GameNGen — https://gamengen.github.io/
- NVIDIA Cosmos — https://github.com/nvidia-cosmos/cosmos-predict2.5 ; https://huggingface.co/nvidia/Cosmos-Predict2.5-14B
- Matrix-Game 3.0 — https://arxiv.org/html/2604.08995v1 ; family — https://github.com/SkyworkAI/Matrix-Game
- Hunyuan-GameCraft — https://github.com/Tencent-Hunyuan/Hunyuan-GameCraft-1.0 ; HY-WorldPlay — https://github.com/Tencent-Hunyuan/HY-WorldPlay/ ; HY-World 2.0 — https://github.com/Tencent-Hunyuan/HY-World-2.0
- Waypoint-1.5 — https://huggingface.co/blog/waypoint-1-5 ; Yan — https://arxiv.org/abs/2508.08601v1 ; MineWorld — https://github.com/microsoft/MineWorld
- Odyssey — https://odyssey.ml/introducing-odyssey-2-max ; https://press.airstreet.com/p/odyssey-starchild-1-agora-1
- World Labs — https://www.worldlabs.ai/ ; Fei-Fei taxonomy — https://drfeifei.substack.com/p/a-functional-taxonomy-of-world-models
- Runway GWM — https://runwayml.com/research/accelerating-robot-policy-evaluation
- **OpenGame** — https://arxiv.org/abs/2604.18394 ; **GameDevBench** — https://arxiv.org/pdf/2602.11103 ; **AutoUE** — https://arxiv.org/abs/2603.07106v2 ; **GameGen-Verifier** — https://arxiv.org/html/2605.07442v1 ; GameGPT — https://arxiv.org/pdf/2310.08067
- Metaplay (4 breakers/3 fixes) — https://www.metaplay.io/blog/agentic-ai-game-development-what-works-2026
- SculptAI — https://nicchin.com/case-studies/sculptai ; Generative Ontology — https://bennycheung.github.io/generative-ontology-from-game-knowledge-to-game-creation ; YetiClaw — https://yeti-media.com/articles/yeticlaw-studio-ai-game-development
- Rosebud reality-check — https://medium.com/@chuanweipeng5/a-reality-check-on-2026s-most-hyped-ai-game-maker-tools-489a41730e2b
- Astrocade — https://ai-review.com/gaming/astrocade/ ; Ludus — https://ludusengine.com/ ; Series AI Rho — https://series.ai/blog/rho-engine ; Roblox Cube — https://about.roblox.com/newsroom/2026/02/accelerating-creation-powered-roblox-cube-foundation-model ; Sorceress — https://sorceress.games/blog/game-development-ai-the-full-sorceress-stack-2026 ; Hytopia — https://blog.hytopia.com/2025/01/20/
- UI-gen analogy — https://dev.to/joshjhall/generative-ui-is-three-things-only-one-ships-n66 ; under-the-hood — https://webtwizz.com/blog/what-ai-app-builders-actually-use-under-the-hood
- OSS: Claude-Code-Game-Studios — https://github.com/Donchitos/Claude-Code-Game-Studios ; OpenGame — https://github.com/leigest519/OpenGame ; gamestudio-subagents — https://github.com/pamirtuna/gamestudio-subagents ; agent-game-forge — https://github.com/0x0funky/agent-game-forge ; Roblox/cube — https://github.com/Roblox/cube

## Method notes
- Legs run: **A Reddit, C1 Exa (world models), C2 Exa (codegen/harnesses/products), D YouTube-discovery (Exa), B YouTube (yt-rag)**. WebSearch A/B probe skipped (deep dive, overhead).
- **YouTube enrichment performed as requested**: discovered 50 high-signal videos via Exa → ingested into new namespace `yt_ai_game_generation` (**50 videos / 786 chunks**, 2 had no subtitles) → ran the transcript leg scoped to it (+ 2 no-namespace queries that surfaced agent-skills and game-feel material).
- **Empty/weak:** Reddit site-wide call fell back to the scraper's default subs (r/python, r/bittensor_) — unusable, documented. Thin/absent: hard pricing for several products; Buildbox AI, Saga, Crayon, Rosie (low web footprint or naming collisions); Series AI Rho 2026 update; Decart Mirage/Lucy exact latency (paywalled).
- **Trust calibration:** world-model specs are vendor-reported (verify against arXiv tables); codegen workflows are practitioner-demonstrated (high trust); GameDevBench/OpenGame-Bench are the rare apples-to-apples evals. Where a single creator is the only source, it's flagged "lone-wolf."
