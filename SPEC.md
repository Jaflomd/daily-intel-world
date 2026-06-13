---
title: Daily Intel — Perú & World
level: SPEC
status: active
created: 2026-06-13
owner: Luci (orquestación) · scheduled cloud agent (ejecución)
pillars:
  - research
  - ai-enhancement
  - precision-psychiatry
  - amauta-education
  - kinobody-selfcare
  - content-documentation
pillar_role:
  primary: content-documentation
  secondary:
    - precision-psychiatry
    - amauta-education
---

# SPEC — Daily Intel · Perú & World

## Qué
Briefing diario automatizado de inteligencia geopolítica, económica y sanitaria
(Perú · USA · China · Global) + salud (normativas, alertas epidemiológicas, salud
mental) + efemérides. Render HTML escaneable, publicado en GitHub Pages.

## Por qué
- **content-documentation:** materia prima diaria para contenido (salud mental,
  neurodivergencia, IA, contexto Perú) de los negocios digitales de Javier.
- **precision-psychiatry / amauta-education:** normativas MINSA/DIGEMID, alertas
  epidemiológicas y señales de salud mental tocan directamente su práctica y docencia.
- **Foundation (Mario):** conciencia situacional macro/Perú para decisiones de dinero
  y riesgo, sin costar energía cara (corre solo).

## Done (criterios)
1. Repo `daily-intel-world` vivo en GitHub, Pages activo.
2. `build.mjs` renderiza el schema a un dashboard escaneable (regiones, métricas, flags, salud, efemérides).
3. Prompt diario (`briefing.md`) con whitelist + regla anti-fabricación dura.
4. 1ª edición real publicada (búsqueda en vivo + verificación de cifras/alertas).
5. Scheduled cloud agent cron 12:00 UTC (07:00 Lima).

## Decisiones
- **Repo separado** (no 8º dominio de `jaflo-daily-intel`): el contenido noticioso
  difiere en forma del académico; evita ensuciar la galería de papers y la colisión
  manifest/favoritos. Reusa el patrón del motor (builder determinista, Pages, Actions).
- **Anti-fabricación reforzada:** cifras/alertas/normas solo con URL+fecha verificada.
  Es riesgo Foundation (datos accionables), no estético.
- **Cron 07:00 Lima:** captura cierre USA previo + Asia overnight + apertura Europa.

## No-objetivos
- No es análisis de mercado ni recomendación de inversión.
- No reemplaza el repo académico `jaflo-daily-intel`.
- No cubre nicho académico/papers (eso vive en el repo hermano).

## Riesgos
- Alucinación de datos accionables → mitigado: verificación adversarial + regla #0.
- Fin de semana/feriado sin sesión → reportar último cierre con `asof`.
- Cutoff del modelo < fecha de hoy → WebSearch obligatorio, cero memoria.
