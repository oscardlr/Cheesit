# Integración de los bloques 4 y 5

Integración local del 2 de noviembre de 2026. Dos chats trabajaron en copias independientes del mismo estado inicial, incluidos los cambios locales de los bloques anteriores. Este informe describe la aplicación conjunta; los informes de cada bloque documentan sus comprobaciones separadas.

## Comportamiento final

Los músculos progresan durante el mes natural seleccionado, por defecto el actual. El mapa, colores, series, detalles y XP usan el mismo mes. Cada enero el personaje empieza en nivel 1 y cero XP anual; su máximo es 99. El reloj civil de Madrid refresca la app abierta, el foco y la reapertura, sin borrar actividad ni ejecutar tareas programadas. El historial permite consultar meses y años con actividad o recompensas. Los años abiertos sin actividad no aparecen como históricos vacíos.

La economía consume el XP histórico, independiente de la curva y del año mostrado. Enero no cambia créditos, inventario, récords, rutinas, pasivas guardadas o cargas. Las correcciones económicas al editar/borrar entrenamientos conservan la política anterior. El XP sobrante después de 99 se registra y sigue la regla económica existente de XP de actividad; no existe una recompensa adicional por superar el máximo.

Nuevos cofres de nivel: identidad `level:YYYY:N`, niveles 2–99 y equipo aleatorio de cualquier ranura. El año y nivel pertenecen al premio reservado y sobreviven a enero. Una preferencia antigua de ranura no afecta a compras nuevas; el objeto ya reservado sigue siendo el original. Los cofres normales conservan la opción de evitar cheesits repetidos.

## Curva anual y simulación

Para entrar en el nivel L: `n = L - 1`, umbral `800*n + 30*n*(n-1)`. El nivel 99 requiere **363.580 XP**. La curva se comparte entre Resumen, Ascenso y derechos a cofres.

Simulación reproducible con las funciones reales: seis ejercicios de tres series, diez repeticiones, cargas constantes, perfil predeterminado, objetivos reales y días distribuidos durante 2026 desde el 5 de enero. Sin progresos/records artificiales ni habilidades ilimitadas. Semanas hasta cada nivel, sin cheesit:

| Sesiones/semana | XP del año | Nivel final | Nivel 25 | Nivel 50 | Nivel 75 | Nivel 99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 226.830 | 76 | 7,0 | 24,4 | 50,4 | No en el año |
| 3 | 309.760 | 90 | 5,0 | 17,3 | 36,3 | No en el año |
| 4 | 393.500 | 99 | 4,0 | 13,7 | 28,4 | 47,4 |
| 5 | 465.410 | 99 | 3,3 | 11,3 | 24,0 | 40,0 |

También se simularon las ocho pasivas actuales. A cuatro sesiones, el máximo llega aproximadamente entre el 30 de noviembre y el 3 de diciembre según pasiva. La simulación no prescribe una rutina ni garantiza el mismo resultado para todas las cargas. Supuestos completos y resultados: [bloque 4](block-4-verification.md), [JSON](block-4-simulation.json), `node --import tsx scripts/simulate-season-progression.ts`.

## Probabilidades y compensación

| Cofre | Equipo antes → después | Frases antes → después | Cheesits antes → después |
| --- | --- | --- | --- |
| Hierro | 55% → 73,33% | 25% → 0% | 20% → 26,67% |
| Energía | 55% → 73,33% | 25% → 0% | 20% → 26,67% |
| Leyenda | 55% → 73,33% | 25% → 0% | 20% → 26,67% |
| Nivel | 100% → 100% | 0% → 0% | 0% → 0% |

Los pesos usados son `.55/.75` y `.20/.75`; solo se redondea la presentación. La antigua rama de frases agotadas cedía su peso a equipo; ya no existe. Los precios 100/250/500 y las probabilidades de rareza se conservan: hierro 70/23/6/1, energía 35/43/18/4, leyenda 0/55/35/10 (común/rara/épica/legendaria). Las probabilidades de rareza de los cofres de nivel tampoco cambian.

| Rareza de frase | Créditos por copia sin vender |
| --- | ---: |
| Común | 15 |
| Rara | 40 |
| Épica | 100 |
| Legendaria | 250 |

Valores moderados, inferiores a las ventas históricas 20/60/150/400. Cada UUID original representa una copia real; no se reconstruyen cantidades. Las frases vendidas conservan su venta y una marca de importe cero. Las conversiones no conceden XP, pasivas, cargas ni cofres. El origen de fondos de pruebas se conserva. Las frases desaparecen de colección y equipamiento; sus registros históricos permanecen para validar premios y evitar repetir pagos.

## Migraciones y unión de datos

- Migraciones independientes `seasonProgressionVersion` y `quoteConversionVersion`, ambas versión 1. Su orden no cambia el resultado y ejecutarlas otra vez no añade premios.
- La curva nueva fija una línea de partida para no generar cofres ni celebraciones por recalibración. Conserva los derechos pendientes permitidos por la curva anterior hasta 99. Los derechos antiguos sin año conocido se adscriben al año de adopción; los claims existentes conservan sus timestamps y su año se interpreta en Madrid. No se inventan fechas ni se borran premios reservados, incluso los legados superiores a 99.
- Los derechos a cofres ya desbloqueados son monotónicos: editar/borrar mueve o corrige XP, sin revocar ni repetir premios. Importar una copia vieja no desbloquea la diferencia entre curvas.
- La compensación se calcula por UUID original, con registros deterministas independientes del libro de compras. Recargar, importar y reconciliar copias no añade pagos acumulativos. Una venta antigua recibida después prevalece sobre la conversión para evitar doble beneficio.
- Las compras, el contenido y la apertura pendiente se guardan juntos antes de animar. Migrar no cobra ni sortea de nuevo; una frase reservada se presenta como su compensación. Fallo de guardado, multiclic, navegación y reintento mantienen el mismo premio.
- Los libros económicos divergentes conservan el conflicto explícito previo: se elige un libro completo. La integración preserva además la unión de derechos/bloqueos anuales y la auditoría de conversiones. Los registros de objetos ausentes del libro elegido no generan créditos y los cofres reclamados en una rama descartada quedan bloqueados. No se suman silenciosamente compras incompatibles.

## Revisión específica de la integración

Se fusionaron y revisaron `game.ts`, `GameHub.tsx`, `backup.ts`, los resultados de apertura y las pruebas compartidas. La fórmula de créditos incorpora simultáneamente `economicXp` histórico y las conversiones; ningún reset consume el XP anual como saldo. La importación conserva tanto `preserveSeasonMetadata` como las conversiones, incluida la elección de un libro divergente. Los previews reconocen IDs anuales, y Cofres/Colección usan el nivel actual aunque Ascenso tenga un año histórico seleccionado.

Se añadieron pruebas cruzadas de orden de migraciones, enero durante una apertura, mismo nivel en dos años, identidad anual durante la conversión y exportación/importación con ambos metadatos. Una primera fusión provisional detectó pérdida de bloqueos anuales al importar; se corrigió antes de aplicar la integración principal.

## Alcance real y limitaciones

La sincronización remota existente solo transmite entrenamientos, rutinas y ejercicios. **No sincroniza el libro del juego, inventario ni claims**. Se probaron la cola remota simulada, IndexedDB, dos copias e importación, pero no una cuenta Supabase en dos dispositivos reales. No hay garantía global de claim único si ambos dispositivos abren cofres independientemente antes de reconciliarse. Para eso hace falta extender el protocolo remoto con una restricción transaccional por año+nivel; no se publicó ni se ejecutó una migración en el servidor.

Chrome usa contextos aislados con fixtures; no se tocaron datos reales. No se comprobó un móvil físico, Safari ni Firefox, y no se ejecutó toda la colección de specs de los bloques anteriores. La prueba de arranque offline usa una instalación ya preparada por el service worker, como requiere el funcionamiento offline existente.

## Verificación de la aplicación integrada

| Comprobación | Resultado |
| --- | --- |
| `npm test` | **182/182** pruebas de dominio pasan. |
| `npm run typecheck` | Pasa, también después del ajuste final de la prueba de interfaz. |
| `npm run build` | Pasa con Next 16.4.3; build `d2886a1af39befcd56a198d6`, manifest regenerado de 82 recursos. |
| Simulación sobre la copia integrada | Ejecutada de nuevo; los 8 escenarios de frecuencia y 8 de pasivas coinciden exactamente con el JSON del bloque 4. |
| Navegador de producción | **42 casos distintos verificados** en las ocho suites indicadas abajo. |
| React y flujo completo | Revisados estado/efectos, listeners con limpieza, reserva síncrona, guardado/reintento, accesibilidad de selectores, fechas, backup y presentación. |
| `git diff --check` | Pasa. |

Servidor local aislado en `127.0.0.1:3106`, Chrome y fixtures propios. Comando principal:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3106 PLAYWRIGHT_PRODUCTION=1 npx playwright test tests/seasons.spec.ts tests/block-five.spec.ts tests/gamification.spec.ts tests/inventory.spec.ts tests/objectives.spec.ts tests/experience.spec.ts tests/dumbbells-v3.spec.ts tests/arcade-visual.spec.ts --workers=2 --output=artifacts/blocks-4-5
```

Primera pasada: 41/42. La restante esperaba «Usar aspecto» cuando el sorteo entregaba un cheesit, cuyo botón correcto es «Equipar cheesit». Se corrigió la aserción para distinguir las categorías, sin cambiar el comportamiento del producto. Se repitió la suite completa `gamification.spec.ts` con un worker: **14/14**. Los otros 28 casos habían pasado en la ejecución principal. No se ocultó ni descartó una prueba funcional fallida.

Se comprobaron visualmente a 390 y 1440 px los niveles, mapa/detalle mensual e histórico, Ascenso máximo, cofres/probabilidades, colección sin frases y resultado de conversión. También hay comprobaciones de anchuras 320/768, ausencia de overflow, movimiento reducido y carga de ilustraciones. La prueba de arranque frío offline pasó contra esta build: worker preparado, red desconectada, recarga y recuperación del premio original sin otro débito. Los contextos de prueba no comparten datos con el navegador del usuario.

Capturas inspeccionadas de la **aplicación integrada**:

- [Cofres escritorio](blocks-4-5-evidence/cofres-desktop.png), [Ascenso móvil](blocks-4-5-evidence/ascenso-mobile.png).
- [Mes histórico móvil](blocks-4-5-evidence/mes-historico-mobile.png), [año histórico escritorio](blocks-4-5-evidence/anual-historico-desktop.png), [máximo 99](blocks-4-5-evidence/maximo-desktop.png).
- [Colección móvil](blocks-4-5-evidence/coleccion-mobile.png), [compensación pendiente](blocks-4-5-evidence/conversion-mobile.png).

Sin despliegue, publicación, modificación de credenciales ni escritura en datos reales. Los informes separados siguen disponibles en [bloque 4](block-4-verification.md) y [bloque 5](block-5-verification.md); sus advertencias de integración se resuelven aquí, salvo el límite explícito de sincronización remota del juego.
