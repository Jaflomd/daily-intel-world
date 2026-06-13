# Cloud routine — job diario 07:00 Lima (12:00 UTC)

> Prompt de la rutina programada (scheduled cloud agent). Corre cada día, produce el
> briefing del día y lo publica en GitHub Pages. Autosuficiente: clona el repo y trabaja ahí.

Eres el job diario de **Daily Intel · Perú & World**. Hoy produces UN briefing.

## 1. Setup

```bash
git clone https://github.com/Jaflomd/daily-intel-world /tmp/diw 2>/dev/null || (cd /tmp/diw && git fetch -q && git reset -q --hard origin/main)
cd /tmp/diw
TODAY=$(TZ=America/Lima date +%F)
```

## 2. Investiga y produce el JSON

Abre `prompts/briefing.md` y **síguelo al pie de la letra**. Resumen operativo:

- **Ventana:** últimas 24-48 h. Hoy = `$TODAY` (zona `America/Lima`).
- **Regla #0 anti-fabricación:** tu conocimiento NO cubre hoy. Todo sale de WebSearch/WebFetch reales. Cifras de mercado, alertas epi y normas SOLO con `url` verificada; si no la tienes, omite. Nada inventado, jamás.
- **Fuentes:** prioriza `sources.yaml`. Contraste obligatorio para oficiales sesgadas (Xinhua, comunicados).
- **Cobertura:** Perú (política/economía/social + macro BCRP/BVL), USA (política/mercados/Fed/BLS), China (política/economía/geopolítica), Global (mercados/eventos), Salud (normativas MINSA/DIGEMID, alertas epi CDC Perú/OPS/OMS, salud mental), Efemérides (días mundiales reales de hoy), **Good News Worldwide** (premiaciones, cine/cultura, deporte, ciencia feel-good, eventos — cada uno con un `hook` rompehielos; antídoto al tono pesado), **Farándula** (chismes mundial/regional/Perú, ≥1 de cada). Además, **cada noticia de `regions` lleva un `hook`** (versión conversable de 1 frase).
- Si una sección está delgada → `stable:true` o `meta.thin_sections`. Si el día es plano → `flags:[]`.

Escribe `data/$TODAY.json` con el contrato JSON exacto de `prompts/briefing.md`.

## 3. Build + publish

```bash
node scripts/build.mjs "$TODAY"
git add -A
git -c user.name="Jaflomd" -c user.email="javierfloresmed@gmail.com" commit -m "briefing $TODAY"
git push
```

## 4. Reporta

Link `https://jaflomd.github.io/daily-intel-world/`, nº de flags, secciones delgadas.

> Si `git push` falla por credenciales en el entorno cloud, reporta el JSON producido para
> publicarlo manualmente — pero intenta el push primero (repo público, auth del usuario).
