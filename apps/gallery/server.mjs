// ============================================================================
// game-omni gallery — a zero-dependency local server that turns the on-disk
// artifacts of generated games into a playable gallery.
//
// It INVENTS NO DATA MODEL. It only READS the artifacts game-omni already writes
// (spec/classification.json, spec/gdd.json, index.json, verify/report*.json) and
// projects a thin VIEW of the few most important keys. The durable truth stays
// on disk; this is just a window onto it.
//
//   Run:   node apps/gallery/server.mjs            (serves http://localhost:4321)
//   Env:   GAMES_DIR=/abs/path  PORT=4321
//
// A "game" = any directory (depth <= 3 under GAMES_DIR) that contains
// spec/classification.json. So it works whether a run wrote to out/game,
// out/games/<name>/, or anywhere else — point GAMES_DIR at the parent.
// ============================================================================

import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, 'public')
const REPO_ROOT = path.resolve(__dirname, '..', '..')          // apps/gallery -> repo root
const GAMES_DIR = path.resolve(process.env.GAMES_DIR || path.join(REPO_ROOT, 'out'))
const PORT = Number(process.env.PORT || 4321)
const SCAN_DEPTH = 3

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.map': 'application/json', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
}
const mime = (p) => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream'

// id <-> relative-path codec (ids are flat & url-safe; relpaths can be nested).
const idOf = (relPath) => Buffer.from(relPath).toString('base64url')
const pathOf = (id) => Buffer.from(String(id), 'base64url').toString('utf8')

const readJSON = async (p) => { try { return JSON.parse(await fsp.readFile(p, 'utf8')) } catch { return null } }
const exists = (p) => { try { fs.accessSync(p); return true } catch { return false } }

// ---- discovery: every dir holding spec/classification.json is one game --------
async function scanGames() {
  const found = []
  async function walk(dir, depth) {
    if (depth > SCAN_DEPTH) return
    let entries
    try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }
    if (exists(path.join(dir, 'spec', 'classification.json'))) { found.push(dir); return } // a game owns its subtree
    for (const e of entries) {
      if (!e.isDirectory()) continue
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue
      await walk(path.join(dir, e.name), depth + 1)
    }
  }
  await walk(GAMES_DIR, 0)
  return found
}

// ---- view-model: only the keys that matter, de-duplicated --------------------
async function readGame(dir) {
  const rel = path.relative(GAMES_DIR, dir) || path.basename(dir)
  const id = idOf(rel)
  const cls = await readJSON(path.join(dir, 'spec', 'classification.json'))
  const gdd = await readJSON(path.join(dir, 'spec', 'gdd.json'))
  const index = await readJSON(path.join(dir, 'index.json'))

  // verify reports (W5): may be report.json or per-milestone report.M2.json. Optional today.
  let reports = []
  if (exists(path.join(dir, 'verify'))) {
    for (const f of await fsp.readdir(path.join(dir, 'verify')).catch(() => [])) {
      if (/^report.*\.json$/.test(f)) { const r = await readJSON(path.join(dir, 'verify', f)); if (r) reports.push(r) }
    }
  }

  // prefer gdd values, fall back to classification — never show the same fact twice.
  const meta = (gdd && gdd.meta) || {}
  const title = meta.title || rel.split(path.sep).pop()
  const archetype = meta.archetype || cls?.archetype || 'unknown'

  // pipeline / sync status, derived purely from artifact presence on disk.
  const slots = index?.slots || []
  const generated = slots.filter((s) => s.status === 'generated' || s.status === 'placeholder').length
  const distReady = exists(path.join(dir, 'dist', 'index.html'))
  const pipeline = [
    { id: 'W0', label: 'Classify', done: !!cls },
    { id: 'W1', label: 'Spec',     done: !!gdd },
    { id: 'W2', label: 'Scaffold', done: !!index || exists(path.join(dir, 'STRUCTURE.md')) },
    { id: 'W3', label: 'Assets',   done: exists(path.join(dir, 'ASSETS.md')) || (slots.length > 0 && generated === slots.length) },
    { id: 'W4', label: 'Implement', done: distReady },
    { id: 'W5', label: 'Verify',   done: reports.length > 0 },
  ]

  // poster: first sprite from the slot manifest, else first image under public/assets.
  let poster = null
  const spriteSlot = slots.find((s) => (s.type === 'sprite' || s.type === 'image') && s.path)
  if (spriteSlot) poster = `assets/${spriteSlot.path}`.replace(/\/+/g, '/')
  if (!poster) {
    const adir = path.join(dir, 'public', 'assets')
    const firstImg = exists(adir) ? findFirst(adir, /\.(png|jpe?g|webp|gif)$/i) : null
    if (firstImg) poster = path.relative(path.join(dir, 'public'), firstImg).split(path.sep).join('/')
  }

  // verify roll-up across milestones (the "is it improving?" signal). Empty until W5.
  const verify = summarizeVerify(reports)

  const stat = await fsp.stat(path.join(dir, 'spec', 'classification.json')).catch(() => null)
  const mtime = stat ? stat.mtimeMs : 0

  return {
    id, rel, title, archetype, mtime,
    coreFantasy: meta.coreFantasy || cls?.coreFantasy || '',
    coreLoop: meta.coreLoop || cls?.coreLoop || '',
    coreVerb: meta.coreVerb || cls?.coreVerb || '',
    artStyle: meta.artStyle || '',
    confidence: cls?.confidence || null,
    physics: meta.physicsProfile || cls?.physicsProfile || null,
    scopeCut: cls?.scopeCut || [],
    entities: (gdd?.entities || []).map((e) => ({ id: e.id, role: e.role })),
    mechanics: (gdd?.mechanics || []).map((m) => m.name),
    controls: (gdd?.controls || []).map((c) => ({ input: c.input, action: c.action })),
    win: gdd?.winCondition?.description || '',
    lose: gdd?.loseCondition?.description || '',
    milestones: (gdd?.milestones || []).map((m) => ({
      id: m.id, name: m.name, goal: m.goal,
      assertions: (m.assertions || []).length,
      verify: verify.byMilestone[m.id] || null,
    })),
    assets: { total: slots.length, ready: generated },
    verify,                  // { ran, milestones, passed, totalAssertions, passedAssertions, fixCycles }
    pipeline, poster,
    playable: distReady,
  }
}

function summarizeVerify(reports) {
  if (!reports.length) return { ran: false, milestones: 0, passed: 0, totalAssertions: 0, passedAssertions: 0, fixCycles: 0, byMilestone: {} }
  const byMilestone = {}
  let passed = 0, totalA = 0, passA = 0, fixes = 0
  for (const r of reports) {
    const a = r.assertions || []
    const p = a.filter((x) => x.status === 'pass').length
    byMilestone[r.milestoneId] = { passed: !!r.passed, marker: r.marker, assertions: a.length, passedAssertions: p }
    if (r.passed) passed++
    totalA += a.length; passA += p; fixes += r.fixCycles || 0
  }
  return { ran: true, milestones: reports.length, passed, totalAssertions: totalA, passedAssertions: passA, fixCycles: fixes, byMilestone }
}

function findFirst(dir, re) {
  let stack = [dir]
  while (stack.length) {
    const d = stack.pop()
    let entries
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (re.test(e.name)) return full
    }
  }
  return null
}

// ---- static file send, scoped to a root (no path traversal) ------------------
async function sendFile(res, absPath, rootGuard) {
  const resolved = path.resolve(absPath)
  if (rootGuard && !resolved.startsWith(path.resolve(rootGuard))) { res.writeHead(403).end('forbidden'); return true }
  try {
    const data = await fsp.readFile(resolved)
    res.writeHead(200, { 'content-type': mime(resolved), 'cache-control': 'no-cache' })
    res.end(data); return true
  } catch { return false }
}

// ---- request router ----------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  let pathname = decodeURIComponent(url.pathname)

  // API: all games as view-models, newest first.
  if (pathname === '/api/games') {
    const dirs = await scanGames()
    const games = (await Promise.all(dirs.map(readGame))).sort((a, b) => b.mtime - a.mtime)
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' })
    res.end(JSON.stringify({ gamesDir: GAMES_DIR, count: games.length, featuredId: games[0]?.id || null, games }))
    return
  }

  // Play the built game: /play/<id>/...  ->  <gameDir>/dist/...
  let m = pathname.match(/^\/play\/([^/]+)(\/.*)?$/)
  if (m) {
    const dir = path.join(GAMES_DIR, pathOf(m[1]))
    const distRoot = path.join(dir, 'dist')
    let rest = m[2] && m[2] !== '/' ? m[2].slice(1) : 'index.html'
    if (await sendFile(res, path.join(distRoot, rest), distRoot)) return
    res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><meta charset=utf-8><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0c0e;color:#6b6f76;font:14px ui-monospace,monospace">no build yet — run <code style="color:#c6f24e;margin:0 .4em">npm&nbsp;run&nbsp;build</code> in the game dir</body>')
    return
  }

  // Poster image: /poster/<id>  ->  <gameDir>/public/<poster>
  m = pathname.match(/^\/poster\/([^/]+)$/)
  if (m) {
    const dir = path.join(GAMES_DIR, pathOf(m[1]))
    const g = await readGame(dir)
    if (g.poster && await sendFile(res, path.join(dir, 'public', g.poster), path.join(dir, 'public'))) return
    res.writeHead(404).end('no poster'); return
  }

  // Gallery's own static assets.
  if (pathname === '/') pathname = '/index.html'
  if (await sendFile(res, path.join(PUBLIC_DIR, pathname.replace(/^\/+/, '')), PUBLIC_DIR)) return

  // Fallback for absolute-base ('/assets/..') requests from an iframed game:
  // disambiguate by the Referer's /play/<id>/ prefix and resolve inside its dist.
  const ref = req.headers.referer
  if (ref) {
    const rm = new URL(ref, 'http://localhost').pathname.match(/^\/play\/([^/]+)\//)
    if (rm) {
      const distRoot = path.join(GAMES_DIR, pathOf(rm[1]), 'dist')
      if (await sendFile(res, path.join(distRoot, pathname.replace(/^\/+/, '')), distRoot)) return
    }
  }

  res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
})

server.listen(PORT, () => {
  console.log(`\n  game-omni gallery  ->  http://localhost:${PORT}`)
  console.log(`  reading games from  ->  ${GAMES_DIR}\n`)
})
