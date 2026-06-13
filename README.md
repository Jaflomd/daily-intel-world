# Daily Intel — Perú & World

Briefing **diario** de inteligencia geopolítica, económica y sanitaria para Javier
Flores-Cohaila. Barre Perú, USA, China y el mundo cada mañana (07:00 Lima), más
**salud** (normativas, alertas epidemiológicas, salud mental) y **efemérides**.
Se renderiza como un dashboard HTML escaneable y se publica en GitHub Pages.

🔗 **En vivo:** https://jaflomd.github.io/daily-intel-world/

## Qué cubre

| Sección | Contenido | Fuentes ancla |
|---|---|---|
| 🚩 Alertas | Lo crítico del día (mercados, política, geo, epi) | cross-región |
| 📊 Métricas | S&P/Nasdaq/Dow/VIX, USD/PEN, UST10y, Brent, oro, IGBVL, BTC | Reuters/Bloomberg/BCRP/BVL |
| 🇵🇪 Perú | política · economía · social | Gestión, El Comercio, RPP, Andina, BCRP |
| 🇺🇸 USA | política · economía · mercados | Reuters, AP, CNBC, Fed, BLS |
| 🇨🇳 China | política · economía · geopolítica | Reuters, SCMP, Caixin (+ contraste) |
| 🌍 Global | mercados · shifts · eventos | Reuters, FT, Bloomberg |
| 🩺 Salud | normativas · alertas epi · salud mental | MINSA, DIGEMID, CDC Perú, OPS, OMS |
| 📅 Efemérides | días mundiales / internacionales reales | ONU, OMS |

Whitelist completa y editable en [`sources.yaml`](sources.yaml).

## Cómo funciona

```
prompts/briefing.md  →  agente investiga (WebSearch, whitelist, 24-48h)  →  data/<fecha>.json
                        node scripts/build.mjs <fecha>                    →  archive/<fecha>.html
                                                                          +  index.html (última edición)
                                                                          +  manifest.json
                        git push  →  GitHub Pages
```

- **`prompts/`** — prompt diario (`briefing.md`) + rutina cloud (`CLOUD-ROUTINE.md`).
- **`sources.yaml`** — whitelist de fuentes confiables (single source of truth).
- **`data/`** — JSON estructurado por fecha (lo produce el agente; cero fabricación).
- **`scripts/build.mjs`** — renderizador determinista JSON → HTML + manifest. No inventa: solo pinta el JSON.
- **`index.html`** — última edición. **`archive/`** — ediciones anteriores. **`manifest.json`** — registro.

## Correr hoy a mano

```bash
TODAY=$(TZ=America/Lima date +%F)
# 1) un agente sigue prompts/briefing.md y deja data/$TODAY.json
node scripts/build.mjs "$TODAY"
git add -A && git commit -m "briefing $TODAY" && git push
```

Comandos de `build.mjs`: `<fecha>` · `--latest` · `--all` · `--manifest`.

## Automatización

Scheduled cloud agent, cron **12:00 UTC = 07:00 Lima** (captura cierre USA previo +
Asia overnight + apertura Europa), corriendo `prompts/CLOUD-ROUTINE.md`. El GitHub
Action ([`.github/workflows/build.yml`](.github/workflows/build.yml)) regenera el
manifest en cada push.

## Regla anti-fabricación

Nunca se inventan titulares, cifras de mercado, alertas epidemiológicas ni normas.
Toda cifra/alerta/norma va con **fuente y fecha verificables, o se omite**. Un dato
inventado aquí no es ruido: es algo sobre lo que se podría actuar. Si una sección
está delgada, se marca *estable* o *delgada* — jamás se rellena.

## Prior art (proyectos similares)

Escaneo de repos públicos comparables (jun-2026). Confirman el patrón y aportan ideas:

- **[koala73/worldmonitor](https://github.com/koala73/worldmonitor)** (★56k) — dashboard de inteligencia global en tiempo real, agregación con IA, 23 fuentes. El más cercano y maduro.
- **[hipcityreg/situation-monitor](https://github.com/hipcityreg/situation-monitor)** (★4.1k) — dashboard de noticias + mercados + geopolítica.
- **[simplifaisoul/osiris](https://github.com/simplifaisoul/osiris)** (★5.3k) — OSINT dashboard estilo Palantir.
- **[leiting-eric/DailyBrief](https://github.com/leiting-eric/DailyBrief)** (★255) — brief diario con LLM, deploy por GitHub Actions (patrón idéntico al nuestro).
- **[zakirkun/blossom-terminal](https://github.com/zakirkun/blossom-terminal)** — terminal estilo Bloomberg; **[kevinho/clawfeed](https://github.com/kevinho/clawfeed)** — digest de noticias con IA.

**Diferenciador de este repo:** foco Perú (BCRP/BVL/MINSA/DIGEMID/CDC Perú), capa de **salud + epidemiología + salud mental**, personalización a Javier, y regla anti-fabricación dura sobre datos accionables.

---
*Parte del Jaflo Lab. Voz: Luci/Fable. Hermano del repo `jaflo-daily-intel` (inteligencia académica).*
