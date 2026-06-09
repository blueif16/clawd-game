// Unit test for pi-runner/guard.mjs — pure, no external deps.
// Each case is self-contained; a temp project dir is built once and torn down in finally.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

import { dirSig, underProject, assessProduction } from "./guard.mjs";

let passed = 0;
let failed = 0;

function result(label, ok, detail = "") {
  if (ok) { console.log(`PASS  ${label}`); passed++; }
  else     { console.log(`FAIL  ${label}${detail ? " — " + detail : ""}`); failed++; }
}

// --- fixture helpers -------------------------------------------------------

function writeFile(absPath, content = "x") {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
}

// ---------------------------------------------------------------------------

let proj;
try {
  proj = fs.mkdtempSync(path.join(os.tmpdir(), "guard-"));

  // Build a realistic project skeleton.
  writeFile(path.join(proj, "spec/gdd.json"),     JSON.stringify({ title: "TestGame", milestones: [1, 2] }));
  writeFile(path.join(proj, "STRUCTURE.md"),      "# Structure\n- src/\n- public/");
  writeFile(path.join(proj, "index.json"),        JSON.stringify({ archetype: "platformer" }));
  writeFile(path.join(proj, "src/Scene.ts"),      "export class Scene {}");
  writeFile(path.join(proj, "src/index.ts"),      "import './Scene';");

  const srcDir = path.join(proj, "src");

  // -------------------------------------------------------------------------
  // Case (f) — direct underProject unit checks
  // -------------------------------------------------------------------------
  try {
    assert.equal(underProject(proj, path.join(proj, "src/Scene.ts")), true);
    assert.equal(underProject(proj, proj), true);
    assert.equal(underProject(proj, path.join(proj, "../escape")), false);
    assert.equal(underProject(proj, "/tmp/unrelated"), false);
    result("underProject: inside/equal=true, escape/unrelated=false", true);
  } catch (e) { result("underProject: inside/equal=true, escape/unrelated=false", false, e.message); }

  // -------------------------------------------------------------------------
  // Case (a) — CLEAN: produced files present, src mutated
  // -------------------------------------------------------------------------
  try {
    const sigBefore = dirSig(srcDir);
    // Simulate a mutation by writing a new file in src.
    writeFile(path.join(srcDir, "Enemy.ts"), "export class Enemy {}");
    const r = assessProduction({
      absProject:   proj,
      artifactsAbs: [
        { path: "spec/gdd.json",  abs: path.join(proj, "spec/gdd.json") },
        { path: "STRUCTURE.md",   abs: path.join(proj, "STRUCTURE.md") },
        { path: "src/Enemy.ts",   abs: path.join(proj, "src/Enemy.ts") },
      ],
      produces:    ["spec/gdd.json", "STRUCTURE.md"],
      mutatesAbs:  srcDir,
      srcSigBefore: sigBefore,
    });
    assert.deepEqual(r.outsideProject, []);
    assert.deepEqual(r.requiredMissing, []);
    assert.equal(r.noMutation, false);
    result("(a) CLEAN — all good", true);
  } catch (e) { result("(a) CLEAN — all good", false, e.message); }

  // -------------------------------------------------------------------------
  // Case (b) — MISSING DECLARED OUTPUT (W2 missing-STRUCTURE.md class)
  // -------------------------------------------------------------------------
  try {
    const r = assessProduction({
      absProject:   proj,
      artifactsAbs: [
        { path: "STRUCTURE.md", abs: path.join(proj, "STRUCTURE.md") },
        // index.json IS on disk from fixture, but we declare a missing file to trigger the check.
        { path: "STRUCTURE.md", abs: path.join(proj, "STRUCTURE.md") },
      ],
      produces:    ["STRUCTURE.md", "index.json", "MISSING_FILE.md"],  // MISSING_FILE.md absent
      mutatesAbs:  null,
      srcSigBefore: null,
    });
    assert.ok(r.requiredMissing.includes("MISSING_FILE.md"), `requiredMissing=${JSON.stringify(r.requiredMissing)}`);
    // index.json exists on disk — should NOT be missing.
    assert.ok(!r.requiredMissing.includes("index.json"), "index.json should not be missing");
    result("(b) MISSING DECLARED OUTPUT — requiredMissing populated", true);
  } catch (e) { result("(b) MISSING DECLARED OUTPUT — requiredMissing populated", false, e.message); }

  // -------------------------------------------------------------------------
  // Case (c) — OUTSIDE PROJECT (W3 wrote-to-out-game/ class)
  // -------------------------------------------------------------------------
  try {
    const outsideAbs = path.join(os.tmpdir(), "out-game", "assets", "sprite.png");
    // Ensure the outside file exists so only path-math is tested (guard uses underProject, not stat).
    const insideAbs  = path.join(proj, "public/sprite.png");
    writeFile(insideAbs, "PNG_DATA");

    const r = assessProduction({
      absProject:   proj,
      artifactsAbs: [
        { path: "public/sprite.png",          abs: insideAbs  },   // inside — clean
        { path: "../out-game/assets/sprite.png", abs: outsideAbs }, // outside — flagged
      ],
      produces:    [],
      mutatesAbs:  null,
      srcSigBefore: null,
    });
    assert.ok(r.outsideProject.length > 0, "should flag the outside artifact");
    assert.ok(r.outsideProject.includes("../out-game/assets/sprite.png"), "flagged path should be the outside one");
    // The inside artifact must NOT appear in outsideProject.
    assert.ok(!r.outsideProject.includes("public/sprite.png"), "inside artifact should not be flagged");
    result("(c) OUTSIDE PROJECT — outsideProject populated", true);
  } catch (e) { result("(c) OUTSIDE PROJECT — outsideProject populated", false, e.message); }

  // -------------------------------------------------------------------------
  // Case (d) — NO MUTATION (W4 wrote-nothing class) + mutation makes it false
  // -------------------------------------------------------------------------
  try {
    const checkDir = path.join(proj, "src");
    const sigBefore = dirSig(checkDir);

    // (d1) No change → noMutation should be true.
    const r1 = assessProduction({
      absProject:   proj,
      artifactsAbs: [],
      produces:    [],
      mutatesAbs:  checkDir,
      srcSigBefore: sigBefore,
    });
    assert.equal(r1.noMutation, true, "expected noMutation:true before any write");

    // (d2) Write a file → sig differs → noMutation should be false.
    writeFile(path.join(checkDir, "NewSystem.ts"), "export class NewSystem {}");
    const r2 = assessProduction({
      absProject:   proj,
      artifactsAbs: [],
      produces:    [],
      mutatesAbs:  checkDir,
      srcSigBefore: sigBefore,   // still the old sig
    });
    assert.equal(r2.noMutation, false, "expected noMutation:false after write");

    // Sanity: confirm dirSig itself differs.
    const sigAfter = dirSig(checkDir);
    assert.notEqual(sigBefore, sigAfter, "dirSig must differ after file added");

    result("(d) NO MUTATION / mutation detection — both branches correct", true);
  } catch (e) { result("(d) NO MUTATION / mutation detection — both branches correct", false, e.message); }

  // -------------------------------------------------------------------------
  // Case (e) — NO-OP: absProject:null → all clean (legacy behavior)
  // -------------------------------------------------------------------------
  try {
    const r = assessProduction({
      absProject:   null,
      artifactsAbs: [{ path: "/tmp/rogue.txt", abs: "/tmp/rogue.txt" }],
      produces:    ["MISSING.md"],
      mutatesAbs:  srcDir,
      srcSigBefore: "anything",
    });
    assert.deepEqual(r.outsideProject, []);
    assert.deepEqual(r.requiredMissing, []);
    assert.equal(r.noMutation, false);
    result("(e) NO-OP absProject:null — all clean", true);
  } catch (e) { result("(e) NO-OP absProject:null — all clean", false, e.message); }

} finally {
  if (proj) fs.rmSync(proj, { recursive: true, force: true });
}

// --- summary ---------------------------------------------------------------
console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
