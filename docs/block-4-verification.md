# Bloque 4: temporadas y progresión

Entrega del 2 de noviembre de 2026. Implementada exclusivamente en `/private/tmp/cheesit-parallel-20261102/block4`, tomando como referencia `/private/tmp/cheesit-parallel-20261102/base`. No se ha modificado el repositorio principal ni la copia del bloque 5. Sin despliegues, generación de arte, cambios de dependencias, `.env` ni acceso a datos reales.

## Resultado funcional

- `seasons.ts` centraliza reloj Madrid, claves YYYY-MM/YYYY, límites civiles, etiquetas, curva y máximo 99. No hay cron ni borrados. `watchSeasonClock` actualiza al segundo con la app abierta y también por foco, `pageshow` y visibilidad, incluyendo saltos de meses/años. El reloj admite inyección para pruebas.
- El mapa muscular usa exclusivamente el mes seleccionado (actual por defecto) para XP, nivel, color, series directas/secundarias, equivalentes, repeticiones, último día y aproximación. Conserva la curva muscular y ponderación 1/0,5 existentes. El historial de series equivalentes se muestra separado. Se elimina el selector 7/14/30 días.
- Personaje anual: cada enero parte de nivel 1 y 0 XP; las sesiones se atribuyen por su fecha civil de entrenamiento. Misiones se atribuyen por su `awardedAt` guardado. Máximo 99, barra completa, texto «Nivel máximo», sin nivel 100 ni división entre cero. El XP excedente sigue siendo estadístico y económico; no se concede una compensación adicional.
- Resumen muestra año, XP anual y próximo reinicio. Cuerpo permite consultar meses anteriores; Ascenso permite consultar años con actividad o premios, con distinción actual/histórico. La consulta histórica no cambia el personaje actual de Cofres/Colección.
- Ascenso y Resumen consumen la misma curva. Se ha eliminado tanto la fórmula independiente como la explicación obsoleta 1.000/+250.

## Curva y simulación reproducible

Umbral de entrada al nivel L, con n = L − 1: `800*n + 30*n*(n-1)`, para L entre 1 y 99. Coste del primer escalón: 800; cada escalón posterior cuesta 60 XP adicionales. Umbrales acumulados: 25 = 35.760; 50 = 109.760; 75 = 221.260; 99 = 363.580.

Comando ejecutado: `node --import tsx scripts/simulate-season-progression.ts`. Resultado completo conservado en [block-4-simulation.json](block-4-simulation.json).

Supuestos: año natural 2026, primera semana completa desde el 5 de enero, días distribuidos a lo largo de la semana; seis ejercicios de tres series de diez repeticiones (18 series por sesión). Banca 50 kg, remo 50, sentadilla 60, militar 25, curl barra 20 y extensión tríceps 20; perfil real predeterminado 70 kg/180 cm/20 años/hombre. Se usan snapshots del catálogo, límites de XP y funciones reales de series, sesión, variedad, objetivos semanales y de trayectoria. Cargas y repeticiones constantes: no hay XP de récord ni de mejora inventado. Objetivo personal igual a la frecuencia simulada. No se presupone equipo con cargas ilimitadas ni habilidades disponibles en cada sesión. Las cargas activas siguen siendo recompensas finitas, verificadas por las pruebas existentes.

Tiempos desde el 5 de enero, en semanas, sin cheesit:

| Sesiones/semana | Sesiones en 2026 | XP anual | Nivel final | A 25 | A 50 | A 75 | A 99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 104 | 226.830 | 76 | 7,0 | 24,4 | 50,4 | No en 2026 |
| 3 | 155 | 309.760 | 90 | 5,0 | 17,3 | 36,3 | No en 2026 |
| 4 | 207 | 393.500 | 99 | 4,0 | 13,7 | 28,4 | 47,4 |
| 5 | 258 | 465.410 | 99 | 3,3 | 11,3 | 24,0 | 40,0 |

Con Vega (+20 XP por sesión mediante snapshot real): XP final 228.910/312.860/397.640/470.570 y niveles 76/91/99/99 respectivamente. Con cuatro sesiones, 99 se alcanza el 30 de noviembre (47 semanas) en lugar del 3 de diciembre. Se simularon también las ocho pasivas actuales a cuatro sesiones: Kira no consigue récord al mantener las cargas, Lúa no cumple peso corporal, Astra e Iris aportan créditos sin XP, Nyx aporta variedad, Sol cumple RPE y Mara aplica su descanso real. Entre ellas, alcanzar 99 varía del 30 de noviembre al 3 de diciembre. No se recalcula ningún historial real para esta simulación.

La meta exige constancia aproximada de cuatro sesiones semanales normales durante casi todo el año; no exige entrenamiento diario ni añadir series por encima de las 18 planteadas. Es una calibración arcade, no una prescripción física. Menos sesiones o perder semanas reduce el nivel final; las pasivas no sustituyen meses de actividad.

## Conservación económica y de datos

Dependencia encontrada: `gameCreditStatus` convertía `gameProgress(...).xp / 5` a créditos. Ahora usa `economicXp`: XP de **todo** el historial más premios de misiones guardados. La curva no modifica los importes de XP de entrenamiento; cambiar de año no modifica saldo, gastos, cobros, créditos de prueba o ajustes pendientes.

Se mantienen las correcciones existentes: editar o borrar actividad recalcula su poder económico, el saldo visible no baja de cero y las ganancias futuras cubren primero un déficit. Inventario, transacciones, premios reservados, cargas, apariencias, cheesits, rutinas y récords no se reinician. `rewardSetIndex` se construye con todo el historial antes de filtrar una temporada: enero no reinicia las referencias de marcas personales.

Los premios de cheesit siguen leyendo únicamente `companionReward`/snapshots ya guardados. No se consulta el cheesit equipado para recalcular sesiones antiguas. Los bonos de habilidades siguen su evento original. Una edición de fecha mueve XP muscular y anual con el entrenamiento; no cambia el evento de pasiva ni permite volver a cobrarlo.

Las misiones tienen IDs semanales con lunes civil e IDs de trayectoria permanentes; `awardedAt` es la fecha explícita del premio. Ya no se conceden misiones automáticamente al hidratar/reabrir la app. Cargar una copia, migrar o entrar en enero no concede objetivos históricos. Las finalizaciones y cambios explícitos conservan la política de premios única existente.

## Cofres y migración

Migración independiente `seasonProgressionVersion: 1`, con `seasonProgressionStartedOn`, `seasonCrateProgress` y, cuando hace falta conservar un claim de una rama descartada, `seasonCrateClaimLocks`. No comparte contador con la migración del bloque 5.

Nuevas identidades: `level:YYYY:N`, `LevelCrate.season` y `GameTransaction.sourceSeason`. Se mantienen `levelCrate(level, season?)` y `openLevelCrate(game, history, level, profile?, choice?, season?)`. No se han cambiado contenido, probabilidades ni opciones de elección. `CrateArtwork` y `CrateOpening` solo cambian la lectura de ese ID para que un año no se interprete como nivel/NaN.

Política:

1. Al adoptar la curva, se fija `baseline` al nivel anual recalculado; `reached` conserva el máximo alcanzado después. El salto de curva no crea cofres ni celebraciones.
2. Los antiguos cofres de trayectoria aún no reclamados se calculan con la curva anterior y se conservan hasta nivel 99, excluyendo **todos** los niveles que el ledger legado ya reclamó. Al no existir un año original del derecho no reservado, quedan adscritos de forma explícita al año de adopción. No se inventa una fecha de premio ni se reescriben transacciones.
3. Un claim legado `level:N` conserva su ID, inventario y timestamp; su año se lee de `createdAt` en Madrid. Los premios ya reservados, incluso legados por encima de 99, no se borran ni se vuelven a sortear. No se generan nuevos cofres por encima de 99; un derecho implícito antiguo superior a 99 no permite una nueva apertura.
4. En un año nuevo el punto de partida es nivel 1. Se desbloquea una vez cada par año+nivel 2..99. Los años históricos no generan premios por ser consultados.
5. El máximo de derechos es monotónico: editar/borrar una sesión mueve o corrige XP, pero conserva cofres ya desbloqueados, abiertos y pendientes. Restituir actividad no repite un claim.
6. El premio se reserva con el ID y transacción originales antes de animar. Abrir un cofre pendiente del año anterior mantiene `sourceSeason` anterior aunque `createdAt` esté en el año actual; recargar o cambiar de año mantiene el mismo objeto.
7. Backup conserva y valida estos campos. Al mezclar una copia antigua con una cuenta estacional se fija primero la línea de partida de la copia antigua, para evitar nuevos derechos por importar XP anterior. Las líneas de partida conservadoras no revocan derechos ya ganados en la otra copia.
8. La economía divergente sigue exigiendo escoger un ledger completo, sin sumar compras o sorteos independientes. Los derechos se conservan aparte de esa elección; los claims de la rama descartada quedan bloqueados para impedir otro sorteo del mismo par año+nivel. El objeto de una rama descartada no se incorpora silenciosamente a la elegida.

La normalización admite el legado y valida las nuevas estructuras. El formato de backup sigue siendo compatible: los metadatos viajan dentro de `game`; importar/exportar repetidamente es idempotente. IndexedDB ya guarda el snapshot íntegro y no necesita cambiar su versión de esquema; la app migra y guarda mediante su canal atómico existente. No se introducen borrados de inventario/historial ni una migración SQL de datos reales.

## Verificación ejecutada

Historia verificada: sesión/fecha o reloj civil → XP y derechos derivados → snapshot completo de IndexedDB → recarga/importación → Resumen, Cuerpo, Ascenso y cofres.

| Frontera | Resultado y evidencia |
| --- | --- |
| Dominio | `npm test`: **169/169**. Base original 152; 17 pruebas adicionales de temporadas. |
| Tipos | `npm run typecheck`: pasa, sin errores. |
| Producción | `npm run build`: pasa; cinco páginas estáticas y manifiesto offline de 82 recursos. |
| Temporadas en navegador | `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3104 npx playwright test tests/seasons.spec.ts --workers=1 --output=test-results/block4-seasons`: **5/5**. |
| Regresión de sesión/objetivos | `... npx playwright test tests/experience.spec.ts tests/objectives.spec.ts tests/dumbbells-v3.spec.ts --workers=1`: **5/5**. |
| Regresión Arcade | `... npx playwright test tests/gamification.spec.ts --grep 'five RPG\|training updates\|crossing a level' --workers=1 --output=test-results/block4-regression`: **3/3**. |
| Simulación | Script anterior completado; 8 escenarios frecuencia/sin-Vega/con-Vega y ocho escenarios de pasiva a cuatro sesiones. |
| Almacenamiento/offline | Fake IndexedDB: snapshot, premio pendiente, saldo, claims y migración sobreviven a guardado/recarga; pruebas previas de escritura fallida y pestañas concurrentes siguen pasando. |
| Sync de sesiones | Queue/RPC simulados: reintento idéntico, receipt, descarga repetida, fechas civiles, revisiones y tombstone. Las pruebas previas de snapshots de pasivas y conflictos remotos siguen pasando. |
| Dos copias/dispositivos simulados | Dos ramas de juego con sorteos independientes, conflicto explícito, elección de cada ledger, unión de derechos y bloqueo de claims descartados; no se suman compras ni inventarios divergentes. |

Cobertura nueva: medianoche Madrid invierno/verano, UTC distinto de la fecha civil, cambio mes/año y exclusión de históricos vacíos, febrero normal y bisiesto, DST, app abierta/timer/foco/pageshow/visibilidad, reapertura tardía y salto de años; 1/98/99/exceso; XP muscular mensual independiente del anual; economía e inventario conservados; referencias de récord fuera del año; snapshots de pasivas; misiones por fecha de premio; cofre del mismo nivel en varios años; cofre antiguo abierto/pendiente; migración repetida y normalización; edición de fecha; importación antigua, copias divergentes y sync simulado.

Chrome se ejecutó en contextos aislados de Playwright, con datos de prueba y reloj controlado. No hubo errores `pageerror` en los recorridos de cambio de temporada. A 390 y 1440 px se comprobaron Resumen, mapa y detalle mensual, consulta histórica, Ascenso, barra al 100%, ausencia de nivel 100 y ausencia de desbordamiento horizontal. Se comprobó además que un año histórico seleccionado no aparece como nivel actual en Cofres/Colección. Capturas finales con transiciones terminadas; inspección visual realizada.

Evidencia conservada:

- [Mapa móvil](block-4-evidence/mobile-month.png), [mes histórico móvil](block-4-evidence/mobile-history.png).
- [Resumen escritorio](block-4-evidence/desktop-summary.png), [Ascenso histórico escritorio](block-4-evidence/desktop-history.png).
- [Máximo móvil](block-4-evidence/mobile-max.png), [máximo escritorio](block-4-evidence/desktop-max.png).

## Límites reales y coordinación

**La sincronización remota existente solo admite `session`, `routine` y `exercise`; no transmite `GameState`, inventario ni claims.** No se ha añadido un protocolo nuevo de economía remota en este bloque. Por tanto, las pruebas de dos dispositivos son simulación de ramas/backup y de la cola remota, no una prueba contra dos cuentas/dispositivos reales. No existe en esta entrega una garantía global de claim único si dos dispositivos gastan cofres independientemente antes de reconciliar sus ledgers. Resolver esa garantía requiere extender el protocolo remoto y su restricción transaccional año+nivel. No se usaron credenciales ni se ejecutaron migraciones contra Supabase real.

No se ha ejecutado toda la suite Playwright ni se ha comprobado iOS/Safari/PWA real o suspensión del sistema operativo real. Offline se verificó en almacenamiento local y pruebas del worker existentes; no se simuló una instalación móvil nueva sin red completa. La curva contempla sesiones representativas, objetivos y pasivas reales; no promete el mismo calendario para toda rutina/carga o actividad irregular.

Para integrar con el bloque 5: conservar estas identidades y metadatos, `economicXp`, curva compartida y lectura del legado. En `RewardChoice` puede eliminarse `gearSlot` según contrato del bloque 5, manteniendo la posición de `season` en `openLevelCrate`. Los cambios de `CrateOpening`/`CrateArtwork` se limitan al parseo de ID anual y deben conservarse al fusionar su UI. `GameHub` utiliza `currentProgress` fuera de Ascenso; no volver a usar el año histórico para el personaje actual.

## Archivos cambiados respecto a base

Código:

- `src/lib/seasons.ts` (nuevo), `dates.ts`, `rewards.ts`, `muscles.ts`, `objectives.ts`, `game.ts`, `backup.ts`.
- `src/components/EntrenosApp.tsx`, `GameHub.tsx`, `CrateOpening.tsx`, `CrateArtwork.tsx`.
- `scripts/simulate-season-progression.ts` (nuevo).

Pruebas:

- `tests/seasons.test.ts` y `tests/seasons.spec.ts` (nuevos).
- `tests/game.test.ts`, `rewards.test.ts`, `strength.test.ts` (expectativas de curva/mes/identidad).
- `tests/experience.spec.ts`, `objectives.spec.ts`, `dumbbells-v3.spec.ts`, `gamification.spec.ts` (expectativas afectadas por curva y selector mensual).

Documentación: este informe, `docs/block-4-simulation.json` y seis capturas en `docs/block-4-evidence/`. Sin cambios en `package.json` ni `package-lock.json`. La copia de trabajo no incluye `.git`; se contrastaron archivos directamente contra la base indicada.
