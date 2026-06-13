#!/usr/bin/env node
// Daily Intel — Perú & World · build engine (command-center edition)
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
// Datos sin `url` se marcan visualmente como "sin fuente" — nunca se maquillan.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA = path.join(ROOT, 'data')
const ARCHIVE = path.join(ROOT, 'archive')

// ---- catálogo de regiones (orden y metadatos canónicos) -------------------
const REGIONS = [
  { key: 'peru',   title: 'Perú',   icon: '🇵🇪', color: '#E0455F', aliases: ['perú', 'peru', 'puno', 'lima', 'callao', 'arequipa', 'cusco'] },
  { key: 'usa',    title: 'USA',    icon: '🇺🇸', color: '#4B8BF5', aliases: ['usa', 'ee.uu', 'eeuu', 'estados unidos', 'washington'] },
  { key: 'china',  title: 'China',  icon: '🇨🇳', color: '#E0A93B', aliases: ['china', 'taiwán', 'taiwan', 'beijing', 'pekín', 'mar de china'] },
  { key: 'global', title: 'Global', icon: '🌍', color: '#35D0B6', aliases: ['global', 'europa', 'mundial', 'áfrica', 'africa', 'medio oriente'] },
]

const SEVERITY = {
  critical: { label: 'CRÍTICO', color: '#FF4D6D', bg: 'rgba(255,77,109,0.10)',  border: 'rgba(255,77,109,0.42)', rank: 3 },
  high:     { label: 'ALTO',    color: '#FFA92E', bg: 'rgba(255,169,46,0.09)',  border: 'rgba(255,169,46,0.40)', rank: 2 },
  watch:    { label: 'VIGILAR', color: '#5BC8FF', bg: 'rgba(91,200,255,0.08)',  border: 'rgba(91,200,255,0.36)', rank: 1 },
}

const CATEGORY = {
  'política': '#B79CFF', 'politica': '#B79CFF',
  'economía': '#37E0A8', 'economia': '#37E0A8',
  'mercados': '#37E0A8', 'commodities': '#37E0A8',
  'social': '#FF8FB6',
  'geopolítica': '#FFC24B', 'geopolitica': '#FFC24B',
  'salud': '#5BC8FF',
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
  if (item.url) return `<a class="src" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(src) || 'fuente'}${date} ↗</a>`
  return `<span class="src nosrc" title="Sin URL verificada">${esc(src) || 'sin fuente'}${date} ⚠︎</span>`
}

const arrow = d => d === 'up' ? '▲' : d === 'down' ? '▼' : '▬'
const dirColor = d => d === 'up' ? '#37E0A8' : d === 'down' ? '#FF4D6D' : '#7A879B'

// severidad máxima que toca una región (por el texto libre de flag.region)
function regionThreat(meta, flags = []) {
  let rank = 0
  for (const f of flags) {
    const t = (f.region || '').toLowerCase()
    if (meta.aliases.some(a => t.includes(a))) {
      const r = (SEVERITY[f.severity] || {}).rank || 0
      if (r > rank) rank = r
    }
  }
  return rank // 0 none, 1 watch, 2 high, 3 critical
}
const THREAT_DOT = ['#37E0A8', '#5BC8FF', '#FFA92E', '#FF4D6D']

// ---- componentes -----------------------------------------------------------
function renderTopbar(data) {
  return `<header class="topbar">
    <div class="tb-left">
      <span class="live"><span class="live-dot"></span>LIVE</span>
      <span class="tb-brand">DAILY INTEL <span class="tb-sep">//</span> PERÚ &amp; WORLD</span>
    </div>
    <div class="tb-right">
      <span class="tb-clock" id="clk">--:--:--</span><span class="tb-tz">LIM</span>
      <button class="tb-theme" id="theme" aria-label="Tema" title="Cambiar tema">◑</button>
    </div>
  </header>`
}

function renderTicker(metrics = []) {
  if (!metrics.length) return ''
  const cell = m => {
    const c = dirColor(m.direction)
    const chg = m.change ? `<span style="color:${c}"> ${arrow(m.direction)} ${esc(m.change)}</span>` : ''
    return `<span class="tk-item"><span class="tk-lbl">${esc(m.label)}</span> <span class="tk-val">${esc(m.value || '—')}</span>${chg}</span>`
  }
  const row = metrics.map(cell).join('<span class="tk-div">·</span>')
  return `<div class="ticker"><div class="ticker-track">${row}<span class="tk-div">·</span>${row}</div></div>`
}

function renderThreatBar(flags = []) {
  const counts = { critical: 0, high: 0, watch: 0 }
  flags.forEach(f => { if (counts[f.severity] != null) counts[f.severity]++ })
  const level = counts.critical ? 'CRÍTICO' : counts.high ? 'ELEVADO' : counts.watch ? 'MODERADO' : 'NOMINAL'
  const lvColor = counts.critical ? SEVERITY.critical.color : counts.high ? SEVERITY.high.color : counts.watch ? SEVERITY.watch.color : '#37E0A8'
  const chip = (k) => `<span class="tl-chip" style="--c:${SEVERITY[k].color}">${counts[k]} ${SEVERITY[k].label}</span>`
  return `<div class="threatline">
    <span class="tl-label">NIVEL DE AMENAZA</span>
    <span class="tl-level" style="--c:${lvColor}">${level}</span>
    <span class="tl-chips">${chip('critical')}${chip('high')}${chip('watch')}</span>
  </div>`
}

function renderNav() {
  const links = [
    ['señales', '🚩 Señales'], ['mercados', '📊 Mercados'], ['regiones', '🌐 Regiones'],
    ['salud', '🩺 Salud'], ['agenda', '📅 Agenda'],
  ]
  return `<nav class="nav"><div class="nav-in">${links.map(([h, t]) => `<a href="#${h}" data-sec="${h}">${t}</a>`).join('')}</div></nav>`
}

function renderMetrics(list = []) {
  if (!list.length) return ''
  const cards = list.map(m => {
    const c = dirColor(m.direction)
    const chg = m.change ? `<span class="m-chg" style="color:${c}">${arrow(m.direction)} ${esc(m.change)}</span>` : ''
    const asof = m.asof ? `<span class="m-asof">${esc(m.asof)}</span>` : ''
    const wrap = m.url ? ['<a class="m-card" href="' + esc(m.url) + '" target="_blank" rel="noopener">', '</a>'] : ['<div class="m-card nosrc">', '</div>']
    return `${wrap[0]}<span class="m-label">${esc(m.label)}</span><span class="m-val">${esc(m.value || '—')}</span>${chg}${asof}${wrap[1]}`
  }).join('')
  return `<section id="mercados" class="block"><h2 class="h2">📊 Mercados &amp; métricas</h2><div class="metrics">${cards}</div></section>`
}

function renderFlags(list = []) {
  if (!list.length) return `<section id="señales" class="block"><h2 class="h2">🚩 Señales</h2><div class="stable">✓ Sin alertas significativas en la ventana.</div></section>`
  const order = [...list].sort((a, b) => ((SEVERITY[b.severity] || {}).rank || 0) - ((SEVERITY[a.severity] || {}).rank || 0))
  const items = order.map(f => {
    const s = SEVERITY[f.severity] || SEVERITY.watch
    const region = f.region ? `<span class="flag-region">${esc(f.region)}</span>` : ''
    return `<div class="flag" style="--sv:${s.color};--svbg:${s.bg};--svbd:${s.border}">
      <div class="flag-top"><span class="flag-sev">▮ ${s.label}</span>${region}</div>
      <div class="flag-title">${esc(f.title)}</div>
      ${f.detail ? `<div class="flag-detail">${esc(f.detail)}</div>` : ''}
      <div class="flag-src">${srcTag(f)}</div>
    </div>`
  }).join('')
  return `<section id="señales" class="block flags-block"><h2 class="h2">🚩 Señales <span class="h2-n">${list.length}</span></h2><div class="flags">${items}</div></section>`
}

function renderItem(it) {
  const cat = it.category ? `<span class="cat" style="--cat:${CATEGORY[(it.category || '').toLowerCase()] || '#7A879B'}">${esc(it.category)}</span>` : ''
  return `<div class="item">
    <div class="item-head">${cat}${srcTag(it)}</div>
    <div class="item-headline">${esc(it.headline)}</div>
    ${it.summary ? `<div class="item-summary">${esc(it.summary)}</div>` : ''}
  </div>`
}

function renderRegions(data) {
  const flags = data.flags || []
  const cards = REGIONS.map(meta => {
    const r = (data.regions || []).find(x => x.key === meta.key) || {}
    const items = r.items || []
    const dot = THREAT_DOT[regionThreat(meta, flags)]
    const body = (r.stable || !items.length)
      ? `<div class="stable">✓ Estable — sin desarrollos significativos.</div>`
      : items.map(renderItem).join('')
    return `<section class="region" style="--rg:${meta.color}">
      <h2 class="region-h"><span class="region-ic">${meta.icon}</span>${esc(r.title || meta.title)}
        <span class="region-dot" style="--d:${dot}" title="nivel regional"></span>
        <span class="region-count">${items.length || '0'}</span></h2>
      <div class="region-body">${body}</div>
    </section>`
  }).join('')
  return `<section id="regiones" class="block"><h2 class="h2">🌐 Regiones</h2><div class="regions">${cards}</div></section>`
}

function renderHealthGroup(title, icon, list = [], withSeverity = false) {
  if (!list.length) return ''
  const items = list.map(h => {
    let sev = ''
    if (withSeverity && h.severity) { const s = SEVERITY[h.severity] || SEVERITY.watch; sev = `<span class="cat" style="--cat:${s.color}">${s.label}</span>` }
    const region = h.region ? `<span class="cat" style="--cat:#7A879B">${esc(h.region)}</span>` : ''
    return `<div class="item"><div class="item-head">${sev}${region}${srcTag(h)}</div>
      <div class="item-headline">${esc(h.headline)}</div>
      ${h.summary ? `<div class="item-summary">${esc(h.summary)}</div>` : ''}</div>`
  }).join('')
  return `<div class="hgroup"><h3 class="h3">${icon} ${esc(title)}</h3>${items}</div>`
}

function renderHealth(h = {}) {
  const norm = renderHealthGroup('Normativas de salud', '⚖️', h.normativas, false)
  const epi = renderHealthGroup('Alertas epidemiológicas', '🦠', h.epi_alerts, true)
  const mh = renderHealthGroup('Salud mental', '🧠', h.mental_health, false)
  if (!norm && !epi && !mh) return ''
  return `<section id="salud" class="block"><h2 class="h2">🩺 Salud · Epidemiología · Salud mental</h2><div class="health-grid">${norm}${epi}${mh}</div></section>`
}

function renderObservances(list = []) {
  const chips = (list || []).map(o => {
    const scope = o.scope ? `<span class="obs-scope">${esc(o.scope)}</span>` : ''
    const note = o.note ? `<span class="obs-note">${esc(o.note)}</span>` : ''
    return `<div class="obs">${scope}<span class="obs-name">${esc(o.name)}</span>${note}</div>`
  }).join('')
  const body = chips || `<div class="stable">Sin efemérides destacadas hoy.</div>`
  return `<section id="agenda" class="block"><h2 class="h2">📅 Efemérides &amp; días mundiales</h2><div class="obs-row">${body}</div></section>`
}

function renderFooter(data) {
  const used = data.meta?.sources_used || []
  const thin = data.meta?.thin_sections || []
  const usedHtml = used.length ? `<div class="foot-sources"><span class="foot-k">FEED //</span> ${used.map(esc).join(' · ')}</div>` : ''
  const thinHtml = thin.length ? `<div class="foot-thin">⚠︎ delgado: ${thin.map(esc).join(', ')}</div>` : ''
  const notes = data.meta?.notes ? `<div class="foot-notes">${esc(data.meta.notes)}</div>` : ''
  return `<footer class="foot">${usedHtml}${thinHtml}${notes}
    <div class="foot-meta">Generado ${esc(data.generated_at_utc || '')} · Regla anti-fabricación: cifras, alertas y normas solo con fuente verificada · <a href="archive/">archivo</a></div>
    <div class="foot-meta">Daily Intel — Perú &amp; World · Jaflo Lab · voz Luci/Fable</div></footer>`
}

// ---- CSS -------------------------------------------------------------------
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#070A0F; --bg2:#0B1018; --panel:#0E141E; --panel2:#131B27; --line:#1B2533; --line2:#243245;
  --txt:#E7ECF3; --dim:#8C97A8; --dim2:#56616F; --accent:#35D0B6; --accent-glow:rgba(53,208,182,.35);
  --mono:ui-monospace,"SF Mono","JetBrains Mono","Roboto Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
[data-theme="light"]{
  --bg:#F4F6FA; --bg2:#EDF1F7; --panel:#FFFFFF; --panel2:#F2F5FA; --line:#DCE3ED; --line2:#C7D2E0;
  --txt:#10151D; --dim:#5A6675; --dim2:#8A96A6; --accent:#0E9C86; --accent-glow:rgba(14,156,134,.18);
}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--txt);font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased;
  background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
  background-size:46px 46px;background-position:center;background-attachment:fixed}
body::before{content:"";position:fixed;inset:0;background:radial-gradient(120% 80% at 50% -10%,var(--accent-glow),transparent 60%);opacity:.5;pointer-events:none;z-index:0}
a{color:inherit;text-decoration:none}
.wrap{max-width:1240px;margin:0 auto;padding:0 18px 80px;position:relative;z-index:1}
/* topbar */
.topbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:10px 18px;margin:0 -18px;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.tb-left,.tb-right{display:flex;align-items:center;gap:12px}
.live{display:inline-flex;align-items:center;gap:6px;font:700 11px/1 var(--mono);letter-spacing:.12em;color:var(--accent)}
.live-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 0 var(--accent-glow);animation:pulse 2s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 var(--accent-glow)}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}
.tb-brand{font:700 13px/1 var(--mono);letter-spacing:.14em;color:var(--txt)}
.tb-sep{color:var(--accent)}
.tb-clock{font:700 13px/1 var(--mono);letter-spacing:.08em;color:var(--txt);font-variant-numeric:tabular-nums}
.tb-tz{font:600 10px/1 var(--mono);color:var(--dim2);letter-spacing:.1em}
.tb-theme{background:var(--panel);border:1px solid var(--line2);color:var(--dim);border-radius:8px;width:30px;height:26px;cursor:pointer;font-size:14px}
.tb-theme:hover{color:var(--accent);border-color:var(--accent)}
/* ticker */
.ticker{overflow:hidden;border-bottom:1px solid var(--line);margin:0 -18px;background:var(--bg2)}
.ticker-track{display:inline-flex;white-space:nowrap;padding:8px 0;animation:scroll 60s linear infinite;will-change:transform}
.ticker:hover .ticker-track{animation-play-state:paused}
@keyframes scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.tk-item{padding:0 16px;font:600 12.5px/1 var(--mono);color:var(--dim);letter-spacing:.02em}
.tk-lbl{color:var(--dim2);text-transform:uppercase;font-size:11px}
.tk-val{color:var(--txt);font-variant-numeric:tabular-nums}
.tk-div{color:var(--line2)}
@media(prefers-reduced-motion:reduce){.ticker-track{animation:none}}
/* hero */
.hero{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 18px;padding:26px 0 14px}
.hero-title{font:800 30px/1.05 var(--sans);letter-spacing:-.02em}
.hero-sub{font:600 12px/1 var(--mono);color:var(--accent);letter-spacing:.16em;text-transform:uppercase;margin-bottom:6px}
.hero-date{margin-left:auto;font:600 13px/1 var(--mono);color:var(--dim);letter-spacing:.04em}
/* threatline */
.threatline{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:11px 14px;margin:6px 0 4px;
  background:var(--panel);border:1px solid var(--line2);border-radius:12px}
.tl-label{font:700 10px/1 var(--mono);letter-spacing:.14em;color:var(--dim2)}
.tl-level{font:800 14px/1 var(--mono);letter-spacing:.1em;color:var(--c);text-shadow:0 0 14px color-mix(in srgb,var(--c) 50%,transparent)}
.tl-chips{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}
.tl-chip{font:700 11px/1 var(--mono);color:var(--c);border:1px solid color-mix(in srgb,var(--c) 45%,transparent);
  background:color-mix(in srgb,var(--c) 10%,transparent);border-radius:999px;padding:5px 10px}
/* nav */
.nav{position:sticky;top:41px;z-index:20;margin:14px -18px 0;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(10px);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.nav-in{display:flex;gap:4px;overflow-x:auto;padding:8px 18px;max-width:1240px;margin:0 auto}
.nav a{flex:0 0 auto;font:600 12px/1 var(--mono);letter-spacing:.04em;color:var(--dim);padding:7px 12px;border-radius:8px;border:1px solid transparent;white-space:nowrap}
.nav a:hover{color:var(--txt);background:var(--panel)}
.nav a.on{color:var(--accent);border-color:var(--line2);background:var(--panel)}
/* blocks */
.block{margin:26px 0;scroll-margin-top:96px}
.h2{display:flex;align-items:center;gap:9px;font:700 12px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-bottom:14px}
.h2-n{font-size:11px;color:var(--accent);border:1px solid var(--line2);border-radius:999px;padding:2px 8px}
.h3{font:700 11px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--dim2);margin:0 0 10px}
/* flags */
.flags{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.flag{position:relative;background:var(--svbg);border:1px solid var(--svbd);border-left:3px solid var(--sv);border-radius:12px;padding:14px 16px;transition:transform .12s,box-shadow .12s}
.flag:hover{transform:translateY(-2px);box-shadow:0 10px 30px -12px color-mix(in srgb,var(--sv) 50%,transparent)}
.flag-top{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.flag-sev{font:800 10px/1 var(--mono);letter-spacing:.1em;color:var(--sv)}
.flag-region{font:600 10.5px/1 var(--mono);color:var(--dim);margin-left:auto;text-align:right}
.flag-title{font-weight:700;font-size:15px;line-height:1.34}
.flag-detail{color:var(--dim);font-size:13px;margin-top:6px;line-height:1.5}
.flag-src{margin-top:9px}
/* metrics */
.metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:10px}
.m-card{display:flex;flex-direction:column;gap:3px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:13px 14px;transition:border-color .14s,box-shadow .14s}
.m-card:hover{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent-glow)}
.m-card.nosrc{opacity:.78}
.m-label{font:600 10.5px/1.2 var(--mono);letter-spacing:.04em;text-transform:uppercase;color:var(--dim)}
.m-val{font:800 22px/1.1 var(--mono);letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.m-chg{font:700 13px/1 var(--mono);font-variant-numeric:tabular-nums}
.m-asof{font:500 10.5px/1.3 var(--mono);color:var(--dim2)}
/* regions */
.regions{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.region{background:var(--panel);border:1px solid var(--line);border-top:3px solid var(--rg);border-radius:14px;padding:16px 18px}
.region-h{display:flex;align-items:center;gap:9px;font:800 18px/1 var(--sans);margin-bottom:12px;letter-spacing:-.01em}
.region-ic{font-size:20px}
.region-dot{width:9px;height:9px;border-radius:50%;background:var(--d);box-shadow:0 0 9px var(--d)}
.region-count{margin-left:auto;font:700 12px/1 var(--mono);color:var(--dim2);background:var(--panel2);border-radius:999px;padding:3px 9px}
.item{padding:11px 0;border-top:1px solid var(--line)}
.item:first-child{border-top:0;padding-top:2px}
.item-head{display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap}
.cat{font:800 10px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--cat)}
.item-headline{font-weight:650;font-size:14.5px;line-height:1.4}
.item-summary{color:var(--dim);font-size:13px;margin-top:3px;line-height:1.5}
.src{font:500 11.5px/1 var(--mono);color:var(--dim2)}
a.src:hover{color:var(--accent)}
.nosrc{color:#D08A8A;cursor:help}
.stable{color:var(--dim);font-size:13px;padding:8px 0;font-style:italic}
/* health */
.health-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px}
.hgroup{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 17px}
/* observances */
.obs-row{display:flex;flex-wrap:wrap;gap:8px}
.obs{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:7px 14px;font-size:13px}
.obs-scope{font:700 9.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.obs-name{font-weight:650}
.obs-note{color:var(--dim);font-size:12px}
/* footer */
.foot{margin-top:46px;padding-top:18px;border-top:1px solid var(--line);color:var(--dim2);font:500 12px/1.7 var(--mono)}
.foot-k{color:var(--accent)}
.foot-sources{color:var(--dim)}
.foot-thin{color:#C99}
.foot-notes{color:var(--dim);margin-top:6px;font-style:italic;font-family:var(--sans)}
.foot-meta{margin-top:5px}
.foot a{color:var(--accent)}
@media(max-width:760px){.regions{grid-template-columns:1fr}.hero-title{font-size:24px}.hero-date{margin-left:0;width:100%}.nav{top:41px}}
`

// ---- client JS (reloj Lima, tema, nav activa) ------------------------------
const JS = `
(function(){
  // reloj hora Lima
  var c=document.getElementById('clk');
  function tick(){try{c.textContent=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())}catch(e){}}
  tick();setInterval(tick,1000);
  // tema
  var t=document.getElementById('theme'),root=document.documentElement;
  var saved=localStorage.getItem('diw-theme');if(saved)root.setAttribute('data-theme',saved);
  t.addEventListener('click',function(){var n=root.getAttribute('data-theme')==='light'?'':'light';if(n)root.setAttribute('data-theme',n);else root.removeAttribute('data-theme');localStorage.setItem('diw-theme',n)});
  // nav activa por sección
  var links=[].slice.call(document.querySelectorAll('.nav a'));
  var map={};links.forEach(function(a){var id=a.getAttribute('href').slice(1);var s=document.getElementById(id);if(s)map[id]=a});
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){links.forEach(function(a){a.classList.remove('on')});var a=map[e.target.id];if(a)a.classList.add('on')}})},{rootMargin:'-45% 0px -50% 0px'});
    Object.keys(map).forEach(function(id){io.observe(document.getElementById(id))});
  }
})();
`

// ---- página ----------------------------------------------------------------
export function renderPage(data) {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Daily Intel — Perú &amp; World · ${esc(data.date)}</title>
<meta name="description" content="Briefing diario de inteligencia: Perú, USA, China, global, salud y epidemiología.">
<style>${CSS}</style>
</head><body>
${renderTopbar(data)}
${renderTicker(data.metrics)}
<div class="wrap">
  <div class="hero">
    <div><div class="hero-sub">Briefing de inteligencia</div><div class="hero-title">Perú &amp; World</div></div>
    <div class="hero-date">${esc(fechaLarga(data.date))}</div>
  </div>
  ${renderThreatBar(data.flags)}
  ${renderNav()}
  ${renderFlags(data.flags)}
  ${renderMetrics(data.metrics)}
  ${renderRegions(data)}
  ${renderHealth(data.health)}
  ${renderObservances(data.observances)}
  ${renderFooter(data)}
</div>
<script>${JS}</script>
</body></html>`
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
