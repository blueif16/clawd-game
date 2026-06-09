// Generic node POST-CONDITION GUARD — pure + importable (no side effects on import), so it is
// unit-testable in isolation and shared by the pi driver (run.mjs). It knows NOTHING about games:
// it only answers "did the on-disk EFFECTS the workflow DECLARED for a node actually happen, UNDER
// the project dir it was handed". The workflow DECLARES the contract as data (agent() opts
// `produces:[projectDir-relative files]` / `mutates:'<subdir>'`); the driver ENFORCES it after each
// node, turning a silent false-green (wrote nothing / wrote to the wrong place) into a loud halt.
//
// Why this is the de-hardcoded shape: the engine checks on-disk EFFECTS only; the chain owns the
// per-node truth. No game/genre/path string lives here.

import fs from "node:fs";
import path from "node:path";

// Cheap recursive signature (path:size:mtime per file) — detects "did this node touch the dir at
// all". Skips heavy/derived dirs so only authored source counts toward "work was done".
export function dirSig(absDir) {
  let sig = "";
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else { try { const s = fs.statSync(fp); sig += `${fp}:${s.size}:${Math.floor(s.mtimeMs)}\n`; } catch {} }
    }
  };
  walk(absDir);
  return sig;
}

// Is absPath inside absProject (or equal to it)? Pure path math — no fs.
export function underProject(absProject, absPath) {
  const rel = path.relative(absProject, absPath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

const isNonEmptyFile = (absPath) => { try { return fs.statSync(absPath).size > 0; } catch { return false; } };

// Assess a finished node against its DECLARED contract. Inputs are absolute (caller resolves).
// Returns the three violation lists/flags — all empty/false means the node honored its contract.
//   absProject     the run's project dir (falsy → all checks skip: nothing to anchor to → legacy)
//   artifactsAbs   [{ path, abs }] the node SELF-REPORTED writing (outputArtifacts)
//   produces       [relPath] the workflow says this node MUST write (projectDir-relative)
//   mutatesAbs     absolute sub-dir the node MUST change (null if it didn't declare one)
//   srcSigBefore   dirSig(mutatesAbs) snapshotted BEFORE the node ran (null if not declared)
export function assessProduction({ absProject, artifactsAbs = [], produces = [], mutatesAbs = null, srcSigBefore = null }) {
  if (!absProject) return { outsideProject: [], requiredMissing: [], noMutation: false };
  const outsideProject = artifactsAbs.filter((a) => !underProject(absProject, a.abs)).map((a) => a.path);
  const requiredMissing = produces.filter((rel) => !isNonEmptyFile(path.join(absProject, rel)));
  const noMutation = !!(mutatesAbs && srcSigBefore != null && dirSig(mutatesAbs) === srcSigBefore);
  return { outsideProject, requiredMissing, noMutation };
}
