// Index of Synthetic Games — render the on-disk artifacts as an archival catalogue.
// No framework, no build step. Displays only keys the pipeline already writes.

const $ = (s, el = document) => el.querySelector(s)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
const pad2 = (n) => String(n).padStart(2, '0')
const fmtDate = (ms) => { const d = new Date(ms || Date.now()); return `${pad2(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}` }
const ago = (ms) => {
  if (!ms) return '—'
  const s = (Date.now() - ms) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} hr`
  return `${Math.floor(s / 86400)} d`
}
const plateNo = (i) => pad2(STATE.games.length - i)   // newest carries the highest catalogue number
function dur(ms) {
  if (!ms) return '0s'
  const s = Math.round(ms / 1000)
  if (s < 90) return s + 's'
  const m = Math.round(s / 60)
  return m < 60 ? m + 'm' : `${Math.floor(m / 60)}h ${m % 60}m`
}

let STATE = { games: [], featuredId: null, gamesDir: '' }

async function boot() {
  let data
  try { data = await (await fetch('/api/games')).json() }
  catch { data = { games: [], featuredId: null, gamesDir: '(unreachable)' } }
  Object.assign(STATE, { games: data.games, gamesDir: data.gamesDir, featuredId: data.featuredId })
  if (!STATE.games.length) return renderEmpty()
  renderMasthead()
  renderIndex()
  feature(STATE.featuredId)
}

function feature(id) {
  STATE.featuredId = id
  const i = STATE.games.findIndex((g) => g.id === id)
  renderPlate(STATE.games[i], plateNo(i))
  renderRecord(STATE.games[i])
  renderIndex()
}

// ── masthead ──────────────────────────────────────────────────────────────
function renderMasthead() {
  const newest = STATE.games[0]
  const dir = STATE.gamesDir.replace(/^.*\/(?=[^/]+\/[^/]+$)/, '…/')
  $('#edition').innerHTML = `
    <span>Game·Omni Engine</span><span class="sep">/</span>
    <span>Registry <b>${esc(dir)}</b></span><span class="sep">/</span>
    <span><b>${STATE.games.length}</b> specimens</span><span class="sep">/</span>
    <span>Edition <b>${fmtDate(newest.mtime)}</b></span>`

  const cmp = compare(STATE.games[0], STATE.games[1])
  $('#stat').innerHTML = `
    <div class="n">${pad2(STATE.games.length)}</div>
    <span class="of">specimens catalogued</span>
    ${cmp ? `<div class="delta ${cmp.cls}" title="${esc(cmp.title)}"><span class="car">${cmp.car}</span>${esc(cmp.label)}</div>` : ''}`
}

// "Is the engine improving?" — verify pass-rate when both editions have it; else milestone count.
function compare(cur, prev) {
  if (!cur || !prev) return null
  if (cur.verify.ran && prev.verify.ran) {
    const r = (g) => g.verify.totalAssertions ? g.verify.passedAssertions / g.verify.totalAssertions : 0
    const d = Math.round((r(cur) - r(prev)) * 100)
    return { cls: d > 0 ? 'up' : '', car: d >= 0 ? '▲' : '▼', label: `${d >= 0 ? '+' : ''}${d}% verified vs prior`, title: 'assertion pass-rate vs previous edition' }
  }
  const d = cur.milestones.length - prev.milestones.length
  return { cls: d > 0 ? 'up' : '', car: d > 0 ? '▲' : '·', label: `${d >= 0 ? '+' : ''}${d} milestones vs prior`, title: 'milestone count vs previous edition' }
}

// ── the index (left-margin contents) ───────────────────────────────────────
function renderIndex() {
  const rows = STATE.games.map((g, i) => {
    const v = g.verify, vc = v.ran ? (v.passed === v.milestones && v.milestones ? 'pass' : 'fail') : ''
    const swatch = g.poster
      ? `<div class="swatch" style="background-image:url('/poster/${g.id}')"></div>`
      : `<div class="swatch"><span>${esc((g.coreVerb || g.archetype || '?')[0]).toUpperCase()}</span></div>`
    return `<button class="entry ${g.id === STATE.featuredId ? 'active' : ''} rise" style="--i:${i}" data-id="${g.id}">
      <span class="no">№${plateNo(i)}</span>${swatch}
      <span class="meta"><span class="et">${esc(g.title)}</span>
        <span class="es">${i === 0 ? '<span class="new">newest</span> · ' : ''}${esc(g.archetype)} · ${ago(g.mtime)} ago</span></span>
      <span class="tick ${vc}" title="${v.ran ? 'verified' : 'unverified'}"></span>
    </button>`
  }).join('')
  $('#index').innerHTML = `<div class="index-head"><span class="h">Index</span><span class="label">${STATE.games.length} pl.</span></div>${rows}`
  $('#index').querySelectorAll('.entry').forEach((b) => b.addEventListener('click', () => feature(b.dataset.id)))
}

// ── the plate (featured specimen) ──────────────────────────────────────────
function renderPlate(g, no) {
  const visual = g.playable
    ? `<iframe id="stage-frame" src="/play/${g.id}/" title="${esc(g.title)}" allow="autoplay; gamepad; fullscreen" allowfullscreen tabindex="0"></iframe>
       <div class="playhint">click, then <b>Space</b>/<b>Enter</b> to start — <b>⤢</b> for fullscreen</div>`
    : g.poster
      ? `<img class="poster" src="/poster/${g.id}" alt="${esc(g.title)}" />`
      : `<div class="screen-empty"><div><div class="verb">${esc(g.coreVerb || g.archetype)}</div>
           <div class="hint">no plate drawn yet — run <code>npm run build</code></div></div></div>`

  // pipeline ticks coloured by real node status: ok=ink, error=oxblood, pending=open.
  const lastOk = g.pipeline.reduce((a, p, i) => p.status === 'ok' ? i : a, -1)
  const anyErr = g.pipeline.some((p) => p.status === 'error')
  const dots = g.pipeline.map((p, i) => {
    const cls = p.status === 'error' ? 'err' : p.status === 'ok' ? (!anyErr && i === lastOk ? 'done live' : 'done') : ''
    return `<div class="seg"><div class="mk ${cls}"></div><small>${p.id}</small></div>`
  }).join('')

  const tools = g.playable ? `<div class="tools">
      <span class="tool primary" id="go-fs">⤢ fullscreen</span>
      <a class="tool" href="/play/${g.id}/" target="_blank" rel="noopener">open ↗</a>
      <span class="tool" id="reload">replay</span></div>` : ''

  $('#plate').innerHTML = `
    <div class="plate-head">
      <span class="pl">Plate <b>№ ${no}</b> — ${g.playable ? 'live specimen' : g.poster ? 'pressed sheet' : 'undrawn'}</span>
      <div class="pipeline">${dots}</div>
    </div>
    <div class="mount rise" style="--base:160ms">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      ${tools}${visual}
    </div>
    <div class="caption rise" style="--base:240ms">
      <div><div class="name">${esc(g.title)}</div>
        ${g.coreFantasy ? `<div class="fant">“${esc(g.coreFantasy)}”</div>` : ''}</div>
      ${g.run ? runline(g.run) : ''}
    </div>`

  const frame = $('#stage-frame'), mount = $('#plate .mount')
  const goFs = () => { const fn = frame.requestFullscreen || frame.webkitRequestFullscreen; if (fn) fn.call(frame); }
  if (frame && mount) mount.addEventListener('mousedown', () => frame.focus())   // keys go to the game, not the page
  $('#go-fs')?.addEventListener('click', goFs)
  $('#reload')?.addEventListener('click', () => { if (frame) frame.src = frame.src })
}

// "RUN OK / FAILED · 1h 40m · $1.63 · cp" — the execution verdict on the caption
function runline(r) {
  return `<div class="runline">
    <span class="verdict ${r.ok ? 'ok' : 'no'}">Run ${r.ok ? 'ok' : 'failed'}</span>
    <span class="rmeta">${dur(r.durationMs)} · $${r.cost.toFixed(2)} · ${esc(r.provider || '?')}${r.model ? '/' + esc(r.model) : ''}</span>
  </div>`
}

// ── the record (catalogue entry — ledger panels) ───────────────────────────
function renderRecord(g) {
  const P = []
  let i = 0
  const panel = (cls, w, name, body) =>
    `<div class="panel ${cls} ${w} rise" style="--i:${i}"><div class="hd"><span class="ix">${pad2(++i)}</span><span class="nm">${name}</span></div>${body}</div>`

  // 01 core behaviour (the loop) — hero
  const loop = g.coreVerb
    ? esc(g.coreLoop).replace(new RegExp(`\\b(${g.coreVerb})\\b`, 'i'), '<span class="verb">$1</span>')
    : esc(g.coreLoop)
  P.push(panel('behaviour', 'w12', 'Core behaviour', `<p>${loop || '—'}</p>`))

  // 02 taxonomy
  const p = g.physics || {}
  P.push(panel('', 'w5', 'Taxonomy', `<dl class="defs">
    <dt>order</dt><dd class="big">${esc(g.archetype)}</dd>
    ${p.perspective ? `<dt>view</dt><dd>${esc(p.perspective)}</dd>` : ''}
    ${p.movementType ? `<dt>motion</dt><dd>${esc(p.movementType)}</dd>` : ''}
    ${'hasGravity' in p ? `<dt>gravity</dt><dd>${p.hasGravity ? 'present' : 'absent'}</dd>` : ''}
    ${g.confidence ? `<dt>conf.</dt><dd>${esc(g.confidence)}</dd>` : ''}
    ${g.artStyle ? `<dt>finish</dt><dd>${esc(g.artStyle)}</dd>` : ''}
  </dl>`))

  // 03 controls
  P.push(panel('', 'w4', 'Controls', g.controls.length
    ? `<div class="keys">${g.controls.map((c) => `<div class="row"><span class="cap">${esc(c.input)}</span><span class="act">${esc(c.action)}</span></div>`).join('')}</div>`
    : `<p class="verif"><span class="pend-note">specified at W1</span></p>`))

  // 04 objectives
  P.push(panel('', 'w3', 'Objectives', `<div class="objs">
    ${g.win ? `<div class="o win"><span class="sym">✦</span><span><span class="ot">WIN</span><span class="ov">${esc(g.win)}</span></span></div>` : ''}
    ${g.lose ? `<div class="o lose"><span class="sym">†</span><span><span class="ot">LOSE</span><span class="ov">${esc(g.lose)}</span></span></div>` : ''}
    ${!g.win && !g.lose ? '<span class="pend-note">—</span>' : ''}
  </div>`))

  // 05 milestones
  if (g.milestones.length) {
    const rows = g.milestones.map((m) => {
      const v = m.verify, c = v ? (v.passed ? 'pass' : 'fail') : ''
      return `<div class="mile"><span class="mid">${esc(m.id)}</span>
        <span class="mn" title="${esc(m.goal)}">${esc(m.name)}</span>
        <span class="ma">${m.assertions} assert.</span><span class="mk ${c}"></span></div>`
    }).join('')
    P.push(panel('', 'w5', `Development · ${g.milestones.length} milestones`, `<div class="miles">${rows}</div>`))
  }

  // 06 excluded from study (scope cut)
  if (g.scopeCut.length)
    P.push(panel('', 'w4', 'Excluded from study', `<div class="cuts">${g.scopeCut.map((s) => `<span>${esc(s)}</span>`).join('')}</div>`))

  // 07 verification
  P.push(panel('', 'w3', 'Verification', verif(g)))

  // 08 run record — the execution truth from run-status.json
  P.push(panel('run', 'w12', `Run record${g.run ? ` · ${g.run.nodeCount} nodes` : ''}`, runPanel(g.run)))

  // 09 census — counts without re-listing
  P.push(panel('', 'w12', 'Census', `<div class="census">
    <span class="c"><b>${g.entities.length}</b>entities</span>
    <span class="c"><b>${g.mechanics.length}</b>mechanics</span>
    <span class="c"><b>${g.assets.ready}/${g.assets.total}</b>assets drawn</span>
    <span class="c"><b>${g.milestones.reduce((n, m) => n + m.assertions, 0)}</b>runtime assertions</span>
  </div>`))

  $('#record').innerHTML = P.join('')
}

// the run timeline (proportional node bar) + totals — the most important run facts
function runPanel(r) {
  if (!r) return `<span class="pend-note">no run-status.json on disk</span>`
  const total = r.durationMs || r.nodes.reduce((n, x) => n + x.durationMs, 0) || 1
  const segs = r.nodes.map((n) =>
    `<span class="rseg ${n.status === 'ok' ? 'ok' : 'err'}" style="flex:${n.durationMs || 1} 1 0"
       title="${esc(n.label)} · ${dur(n.durationMs)}${n.reason ? ' · ' + esc(n.reason) : ''}"></span>`
  ).join('')
  const fail = r.failed
    ? `<div class="runfail">✕ halted at <b>${esc(r.failed.label)}</b> — ${esc(r.failed.reason)}</div>`
    : `<div class="runok">✓ all ${r.nodeCount} nodes completed</div>`
  const T = (v, k, cls = '') => `<span class="t ${cls}"><b>${v}</b>${k}</span>`
  return `<div class="runbox">
    <div class="rbar" role="img" aria-label="node timeline">${segs}</div>
    <div class="raxis"><span>W0 classify</span><span class="mid">build ⇄ verify · per milestone</span><span>${dur(total)}</span></div>
    ${fail}
    <div class="rtotals">
      ${T(r.ok ? 'OK' : 'FAILED', 'verdict', r.ok ? 'ok' : 'no')}
      ${T(dur(r.durationMs), 'wall-clock')}
      ${T('$' + r.cost.toFixed(2), 'cost')}
      ${T((r.billable / 1e6).toFixed(1) + 'M', 'tokens')}
      ${T(Math.round(r.peak / 1e3) + 'k', 'peak ctx')}
      ${T(esc(r.provider || '—') + (r.model ? '/' + esc(r.model) : ''), 'provider')}
    </div>
  </div>`
}

function verif(g) {
  const v = g.verify
  if (v.ran) {
    const ok = v.passed === v.milestones && v.milestones > 0
    return `<div class="verif">
      <div class="frac">${v.passedAssertions}<small>/${v.totalAssertions}</small></div>
      <div><div class="res ${ok ? 'ok' : 'no'}">${ok ? 'Verified' : 'Failed'}</div>
        <div class="vsub">${v.passed}/${v.milestones} milestones<br>${v.fixCycles} self-fix cycle${v.fixCycles === 1 ? '' : 's'}</div></div>
    </div>`
  }
  return `<div class="verif"><div><div class="res pend"><span class="pulse"></span>Pending</div>
    <div class="vsub">${g.milestones.reduce((n, m) => n + m.assertions, 0)} assertions await W5 vs <code>__GAME__</code></div></div></div>`

  /* KNOWN-BUT-UNSURE-OF-SHAPE — uncomment once these data models are committed:
   *   Hermes per-skill improvement delta:  g.hermes -> { skill, prevVersion, version, change }
   *     `<div class="vsub">skill ${h.skill} v${h.prevVersion}→v${h.version}: ${h.change}</div>`
   *   Design-doc artifact (spec/PLAN.md / STRUCTURE.md):
   *     `<a class="tool" href="/raw/${g.id}/spec/PLAN.md">field notes ↗</a>`   */
}

function renderEmpty() {
  const tpl = $('#tpl-empty').content.cloneNode(true)
  tpl.querySelector('#empty-dir').textContent = STATE.gamesDir
  $('#plate').innerHTML = ''; $('#plate').appendChild(tpl)
  $('#record').innerHTML = ''; $('#index').innerHTML = ''
  $('#stat').innerHTML = `<div class="n">00</div><span class="of">specimens catalogued</span>`
  $('#edition').innerHTML = `<span>Game·Omni Engine</span><span class="sep">/</span><span>Registry <b>${esc(STATE.gamesDir)}</b></span>`
}

// keep Space / arrows from scrolling the page while the game iframe holds focus
addEventListener('keydown', (e) => {
  if (document.activeElement?.id === 'stage-frame' &&
      [' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) e.preventDefault()
}, { passive: false })

boot()
