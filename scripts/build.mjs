#!/usr/bin/env node
// Daily Intel — Perú & World · build engine
// Renderiza un briefing HTML autocontenido desde data/<date>.json,
// fija index.html a la última edición y reconstruye manifest.json.
//
// Uso:
//   node scripts/build.mjs <date>        # construye el briefing de esa fecha + index + manifest
//   node scripts/build.mjs --latest      # re-renderiza index.html desde el data/ más reciente
//   node scripts/build.mjs --all         # reconstruye todos los data/*.json
//   node scripts/build.mjs --manifest    # solo reconstruye manifest.json
//
// Renderizado determinista: NO inventa nada. Solo pinta lo que trae el JSON.
// Regla dura: cifras de mercado, alertas epi y normas de salud que no traigan
// `url` se renderizan con un aviso "sin fuente" — nunca se maquillan como verificadas.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA = path.join(ROOT, 'data')
const ARCHIVE = path.join(ROOT, 'archive')

// ---- catálogo de regiones (orden y metadatos canónicos) -------------------
const REGIONS = [
  { key: 'peru',   title: 'Perú',   icon: '🇵🇪', color: '#D91023' },
  { key: 'usa',    title: 'USA',    icon: '🇺🇸', color: '#3B6FE0' },
  { key: 'china',  title: 'China',  icon: '🇨🇳', color: '#E0A93B' },
  { key: 'global', title: 'Global', icon: '🌍', color: '#2FB7A3' },
]

const SEVERITY = {
  critical: { label: 'CRÍTICO', color: '#F0476B', bg: 'rgba(240,71,107,0.14)', border: 'rgba(240,71,107,0.45)' },
  high:     { label: 'ALTO',    color: '#EF9F27', bg: 'rgba(239,159,39,0.13)',  border: 'rgba(239,159,39,0.42)' },
  watch:    { label: 'VIGILAR', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.38)' },
}

const CATEGORY = {
  'política':  '#A78BFA',
  'politica':  '#A78BFA',
  'economía':  '#34D399',
  'economia':  '#34D399',
  'social':    '#F472B6',
  'mercados':  '#34D399',
  'geopolítica': '#FBBF24',
  'geopolitica': '#FBBF24',
}

// ---- helpers ---------------------------------------------------------------
const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
function fechaLarga(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const wd = new Date(dateStr + 'T12:00:00').getDay()
  return `${DIAS[wd]} ${d} de ${MESES[m - 1]} de ${y}`
}

function host(url) {
  if (!url) return ''
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function srcTag(item) {
  const src = item.source || host(item.url) || ''
  const date = item.date ? ` · ${esc(item.date)}` : ''
  if (item.url) {
    return `<a class="src" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(src) || 'fuente'}${date} ↗</a>`
  }
  return `<span class="src nosrc" title="Sin URL verificada">${esc(src) || 'sin fuente'}${date} ⚠︎</span>`
}

function arrow(dir) {
  if (dir === 'up') return '▲'
  if (dir === 'down') return '▼'
  return '▬'
}
function dirColor(dir) {
  if (dir === 'up') return '#34D399'
  if (dir === 'down') return '#F0476B'
  return '#8A93A6'
}

// ---- componentes -----------------------------------------------------------
function renderObservances(list = []) {
  if (!list.length) return ''
  const chips = list.map(o => {
    const scope = o.scope ? `<span class="obs-scope">${esc(o.scope)}</span>` : ''
    const note = o.note ? `<span class="obs-note">${esc(o.note)}</span>` : ''
    return `<div class="obs">${scope}<span class="obs-name">${esc(o.name)}</span>${note}</div>`
  }).join('')
  return `<section class="block"><h2 class="h2">📅 Efemérides &amp; días mundiales</h2><div class="obs-row">${chips}</div></section>`
}

function renderMetrics(list = []) {
  if (!list.length) return ''
  const cards = list.map(m => {
    const c = dirColor(m.direction)
    const chg = m.change
      ? `<span class="m-chg" style="color:${c}">${arrow(m.direction)} ${esc(m.change)}</span>` : ''
    const asof = m.asof ? `<span class="m-asof">${esc(m.asof)}</span>` : ''
    const wrap = m.url ? ['<a class="m-card" href="' + esc(m.url) + '" target="_blank" rel="noopener">', '</a>']
      : ['<div class="m-card nosrc">', '</div>']
    return `${wrap[0]}<span class="m-label">${esc(m.label)}</span><span class="m-val">${esc(m.value || '—')}</span>${chg}${asof}${wrap[1]}`
  }).join('')
  return `<section class="block"><h2 class="h2">📊 Métricas clave</h2><div class="metrics">${cards}</div></section>`
}

function renderFlags(list = []) {
  if (!list.length) return ''
  const items = list.map(f => {
    const s = SEVERITY[f.severity] || SEVERITY.watch
    const region = f.region ? `<span class="flag-region">${esc(f.region)}</span>` : ''
    return `<div class="flag" style="--sv:${s.color};--svbg:${s.bg};--svbd:${s.border}">
      <div class="flag-top"><span class="flag-sev">${s.label}</span>${region}</div>
      <div class="flag-title">${esc(f.title)}</div>
      ${f.detail ? `<div class="flag-detail">${esc(f.detail)}</div>` : ''}
      <div class="flag-src">${srcTag(f)}</div>
    </div>`
  }).join('')
  return `<section class="block flags-block"><h2 class="h2">🚩 Alertas del día</h2><div class="flags">${items}</div></section>`
}

function renderItem(it) {
  const cat = it.category ? `<span class="cat" style="--cat:${CATEGORY[(it.category || '').toLowerCase()] || '#8A93A6'}">${esc(it.category)}</span>` : ''
  return `<div class="item">
    <div class="item-head">${cat}${srcTag(it)}</div>
    <div class="item-headline">${esc(it.headline)}</div>
    ${it.summary ? `<div class="item-summary">${esc(it.summary)}</div>` : ''}
  </div>`
}

function renderRegion(data) {
  return REGIONS.map(meta => {
    const r = (data.regions || []).find(x => x.key === meta.key) || {}
    const items = r.items || []
    let body
    if (r.stable || !items.length) {
      body = `<div class="stable">✓ Estable — sin desarrollos significativos en la ventana.</div>`
    } else {
      body = items.map(renderItem).join('')
    }
    return `<section class="region" style="--rg:${meta.color}">
      <h2 class="region-h"><span class="region-ic">${meta.icon}</span>${esc(r.title || meta.title)}
        <span class="region-count">${items.length ? items.length : ''}</span></h2>
      <div class="region-body">${body}</div>
    </section>`
  }).join('')
}

function renderHealthGroup(title, icon, list = [], withSeverity = false) {
  if (!list.length) return ''
  const items = list.map(h => {
    let sev = ''
    if (withSeverity && h.severity) {
      const s = SEVERITY[h.severity] || SEVERITY.watch
      sev = `<span class="cat" style="--cat:${s.color}">${s.label}</span>`
    }
    const region = h.region ? `<span class="cat" style="--cat:#8A93A6">${esc(h.region)}</span>` : ''
    return `<div class="item">
      <div class="item-head">${sev}${region}${srcTag(h)}</div>
      <div class="item-headline">${esc(h.headline)}</div>
      ${h.summary ? `<div class="item-summary">${esc(h.summary)}</div>` : ''}
    </div>`
  }).join('')
  return `<div class="hgroup"><h3 class="h3">${icon} ${esc(title)}</h3>${items}</div>`
}

function renderHealth(h = {}) {
  const norm = renderHealthGroup('Normativas de salud', '⚖️', h.normativas, false)
  const epi = renderHealthGroup('Alertas epidemiológicas', '🦠', h.epi_alerts, true)
  const mh = renderHealthGroup('Salud mental', '🧠', h.mental_health, false)
  if (!norm && !epi && !mh) return ''
  return `<section class="block health"><h2 class="h2">🩺 Salud · Epidemiología · Salud mental</h2>
    <div class="health-grid">${norm}${epi}${mh}</div></section>`
}

function renderFooter(data) {
  const used = (data.meta?.sources_used || [])
  const thin = (data.meta?.thin_sections || [])
  const usedHtml = used.length ? `<div class="foot-sources"><strong>Fuentes consultadas:</strong> ${used.map(esc).join(' · ')}</div>` : ''
  const thinHtml = thin.length ? `<div class="foot-thin">⚠︎ Secciones delgadas: ${thin.map(esc).join(', ')}</div>` : ''
  const notes = data.meta?.notes ? `<div class="foot-notes">${esc(data.meta.notes)}</div>` : ''
  return `<footer class="foot">
    ${usedHtml}${thinHtml}${notes}
    <div class="foot-meta">Generado ${esc(data.generated_at_utc || '')} · Regla anti-fabricación: cifras, alertas y normas solo con fuente verificada.</div>
    <div class="foot-meta">Daily Intel — Perú &amp; World · Jaflo Lab · voz Luci/Fable</div>
  </footer>`
}

// ---- página ----------------------------------------------------------------
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0B0E14; --panel:#121722; --panel2:#171D2A; --line:#222B3A;
  --txt:#E6EAF2; --dim:#8A93A6; --dim2:#5C6677; --accent:#2FB7A3;
}
body{background:var(--bg);color:var(--txt);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:28px 20px 80px}
a{color:inherit;text-decoration:none}
/* header */
.head{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px 16px;padding-bottom:18px;border-bottom:1px solid var(--line);margin-bottom:22px}
.brand{font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:700}
.title{font-size:30px;font-weight:800;letter-spacing:-.02em}
.date{color:var(--dim);font-size:15px;margin-left:auto}
.nav{font-size:13px;color:var(--dim)}
.nav a{color:var(--accent)}
/* blocks */
.block{margin:26px 0}
.h2{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);font-weight:700;margin-bottom:14px}
.h3{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim2);font-weight:700;margin:0 0 10px}
/* observances */
.obs-row{display:flex;flex-wrap:wrap;gap:8px}
.obs{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:6px 13px;font-size:13px}
.obs-scope{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);font-weight:700}
.obs-name{font-weight:600}
.obs-note{color:var(--dim);font-size:12px}
/* metrics */
.metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.m-card{display:flex;flex-direction:column;gap:2px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;transition:border-color .15s}
.m-card:hover{border-color:var(--accent)}
.m-card.nosrc{opacity:.8}
.m-label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
.m-val{font-size:22px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.m-chg{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}
.m-asof{font-size:11px;color:var(--dim2)}
/* flags */
.flags{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.flag{background:var(--svbg);border:1px solid var(--svbd);border-left:4px solid var(--sv);border-radius:12px;padding:13px 15px}
.flag-top{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.flag-sev{font-size:10px;font-weight:800;letter-spacing:.1em;color:var(--sv)}
.flag-region{font-size:11px;color:var(--dim);margin-left:auto}
.flag-title{font-weight:700;font-size:15px;line-height:1.35}
.flag-detail{color:var(--dim);font-size:13px;margin-top:5px}
.flag-src{margin-top:8px}
/* regions */
.regions{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.region{background:var(--panel);border:1px solid var(--line);border-top:3px solid var(--rg);border-radius:14px;padding:16px 18px}
.region-h{display:flex;align-items:center;gap:9px;font-size:18px;font-weight:800;margin-bottom:12px;letter-spacing:-.01em}
.region-ic{font-size:20px}
.region-count{margin-left:auto;font-size:12px;color:var(--dim2);background:var(--panel2);border-radius:999px;padding:2px 9px;font-weight:700}
.item{padding:11px 0;border-top:1px solid var(--line)}
.item:first-child{border-top:0;padding-top:2px}
.item-head{display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap}
.cat{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--cat)}
.item-headline{font-weight:650;font-size:14.5px;line-height:1.4}
.item-summary{color:var(--dim);font-size:13px;margin-top:3px}
.src{font-size:11.5px;color:var(--dim2)}
a.src:hover{color:var(--accent)}
.nosrc{color:#C77;cursor:help}
.stable{color:var(--dim);font-size:13px;padding:8px 0;font-style:italic}
/* health */
.health-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}
.hgroup{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 17px}
/* footer */
.foot{margin-top:46px;padding-top:18px;border-top:1px solid var(--line);color:var(--dim2);font-size:12px;line-height:1.7}
.foot-sources{color:var(--dim)}
.foot-thin{color:#C99}
.foot-notes{color:var(--dim);margin-top:6px;font-style:italic}
.foot-meta{margin-top:4px}
@media(max-width:760px){.regions{grid-template-columns:1fr}.title{font-size:24px}.date{margin-left:0;width:100%}}
`

export function renderPage(data) {
  const dateLong = fechaLarga(data.date)
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Daily Intel — Perú &amp; World · ${esc(data.date)}</title>
<meta name="description" content="Briefing diario de inteligencia: Perú, USA, China, global, salud y epidemiología.">
<style>${CSS}</style>
</head><body><div class="wrap">
  <header class="head">
    <div>
      <div class="brand">Daily Intel · Perú &amp; World</div>
      <div class="title">Briefing del día</div>
    </div>
    <div class="date">${esc(dateLong)}</div>
  </header>
  ${renderFlags(data.flags)}
  ${renderMetrics(data.metrics)}
  <section class="block"><h2 class="h2">🌐 Regiones</h2><div class="regions">${renderRegion(data)}</div></section>
  ${renderHealth(data.health)}
  ${renderObservances(data.observances)}
  ${renderFooter(data)}
  <div class="nav">Archivo: <a href="archive/">ediciones anteriores</a></div>
</div></body></html>`
}

// ---- manifest --------------------------------------------------------------
function rebuildManifest() {
  const files = fs.existsSync(DATA) ? fs.readdirSync(DATA).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)) : []
  const entries = files.map(f => {
    const d = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'))
    return {
      date: d.date,
      flags: (d.flags || []).length,
      regions: (d.regions || []).reduce((a, r) => a + (r.items || []).length, 0),
      thin: (d.meta?.thin_sections || []).length > 0,
      href: `archive/${d.date}.html`,
    }
  }).sort((a, b) => b.date.localeCompare(a.date))
  const manifest = { generated: entries.length, latest: entries[0]?.date || null, editions: entries }
  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}

function latestDate() {
  const files = fs.existsSync(DATA) ? fs.readdirSync(DATA).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)) : []
  return files.map(f => f.replace('.json', '')).sort().pop() || null
}

function buildOne(date) {
  const src = path.join(DATA, `${date}.json`)
  if (!fs.existsSync(src)) { console.error(`✗ no existe ${src}`); process.exit(1) }
  const data = JSON.parse(fs.readFileSync(src, 'utf8'))
  const html = renderPage(data)
  fs.mkdirSync(ARCHIVE, { recursive: true })
  fs.writeFileSync(path.join(ARCHIVE, `${date}.html`), html)
  // index.html = última edición
  if (date === latestDate()) fs.writeFileSync(path.join(ROOT, 'index.html'), html)
  console.log(`✓ briefing ${date} → archive/${date}.html`)
}

// ---- CLI -------------------------------------------------------------------
const args = process.argv.slice(2)
if (args[0] === '--manifest') {
  const m = rebuildManifest(); console.log(`✓ manifest: ${m.generated} ediciones`)
} else if (args[0] === '--latest') {
  const d = latestDate(); if (!d) { console.error('✗ sin data/'); process.exit(1) }
  buildOne(d); rebuildManifest(); console.log('✓ index ←', d)
} else if (args[0] === '--all') {
  const files = fs.readdirSync(DATA).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  files.forEach(f => buildOne(f.replace('.json', ''))); rebuildManifest()
} else if (args[0] && /^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
  buildOne(args[0]); rebuildManifest()
} else {
  console.log('uso: node scripts/build.mjs <YYYY-MM-DD> | --latest | --all | --manifest')
}
