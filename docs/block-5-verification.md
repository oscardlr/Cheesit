# Bloque 5 — Cofres sin frases y conversión de legado

Copia de trabajo exclusiva: `/private/tmp/cheesit-parallel-20261102/block5`.
Referencia de integración: `/private/tmp/cheesit-parallel-20261102/base`.
Fecha de comprobación: 2 de noviembre de 2026.

## Resultado implementado

- Ningún sorteo nuevo normal o de nivel puede producir una frase. Se conserva el catálogo histórico para validar y auditar copias antiguas, compras, ventas y resultados ya comprometidos.
- Se eliminan el filtro, las tarjetas y los recuentos visibles de frases. La API antigua para equiparlas ya no permite hacerlo y la normalización retira únicamente `equippedQuoteId`.
- Los cofres de nivel no ofrecen selección de ranura en Cofres ni Ascenso. Un `gearSlot` remitido por un cliente antiguo se ignora en los sorteos nuevos. No se modifica el objeto ya reservado, por lo que una apertura antigua conserva la prenda y ranura elegidas entonces.
- Se reutilizan componentes, ilustraciones y animaciones existentes. El resultado explica el aspecto y las cargas de equipo, mantiene la ficha de pasiva del cheesit y muestra créditos en un resultado histórico de frase.
- No se modifican la curva XP, pasivas, temporadas, precios, rarezas ni arte. No hay despliegue, publicación, nuevas dependencias, cambios en `.env`, SQL o datos reales.

## Probabilidades y categorías

`REWARD_CATEGORY_WEIGHTS`, `GEAR_DROP_CHANCE`, `COMPANION_DROP_CHANCE`, `REWARD_CATEGORY_LABEL` y `rewardPools` en `src/lib/game.ts` centralizan el sorteo y la etiqueta UI. Los IDs se deduplican antes del sorteo, evitando tickets adicionales por pertenecer a varias listas.

| Tipo | Equipo antes | Frase antes | Cheesit antes | Equipo después | Frase después | Cheesit después |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hierro, energía y leyenda | 55% | 25% | 20% | `.55 / .75` | 0% | `.20 / .75` |
| Cofre de nivel | 100% | 0% | 0% | 100% | 0% | 0% |

Los pesos nuevos son exactamente las divisiones anteriores en el código, sin usar el redondeo de la UI: **73,33% / 26,67%**. Antes, si ya se habían obtenido todas las frases de una rareza, el 25% de frase pasaba a equipo (80% equipo y 20% cheesit para esa rareza). Ya no existe esa rama de frase.

| Cofre | Precio conservado | Común | Rara | Épica | Legendaria |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hierro | 100 | 70% | 23% | 6% | 1% |
| Energía | 250 | 35% | 43% | 18% | 4% |
| Leyenda | 500 | 0% | 55% | 35% | 10% |

La rareza se sortea primero con las mismas tablas. Después se selecciona uniformemente un ID de su categoría y rareza. Las cuatro rarezas tienen equipo y dos cheesits válidos. La opción normal `avoidCompanionDuplicates` prioriza cheesits no obtenidos, contando también copias históricas y pendientes. Si no hay cheesits elegibles, su probabilidad pasa explícitamente a equipo **de la misma rareza**, sin resorteo de rareza. Los duplicados de equipo siguen otorgando las cargas preexistentes; este bloque no cambia su cantidad ni consumo.

## Compensación y auditoría

Tabla única, congelada y exportada como `QUOTE_COMPENSATION` en `src/lib/quote-conversion.ts`:

| Rareza | Créditos por copia conservada | Valor de venta histórico (referencia) |
| --- | ---: | ---: |
| Común | 15 | 20 |
| Rara | 40 | 60 |
| Épica | 100 | 150 |
| Legendaria | 250 | 400 |

Son importes inferiores a la venta histórica; una copia común equivale al 15% del cofre básico y una legendaria a la mitad del cofre avanzado. Se compensan las copias realmente existentes, incluidas repeticiones históricas: no se deducen copias a partir del catálogo ni del número de compras. No se concede XP, niveles, pasivas, cargas o cofres adicionales. La política existente de déficit sigue vigente: el abono puede cubrir primero un ajuste económico pendiente.

El registro independiente `quoteConversionVersion: 1` / `quoteConversions` usa el UUID **original** como `itemId`, más `quoteId`, rareza, importe y disposición. No añade transacciones aleatorias al libro de compras. La lista ordenada es determinista en dos dispositivos que migren el mismo estado. Se conserva el inventario original sin cambiar sus IDs, fechas, rarezas, ventas ni cofres de procedencia.

Regla conservadora de ventas: una frase vendida recibe una entrada `previously-sold` con importe cero. Su venta y créditos históricos permanecen. Si un cliente antiguo envía posteriormente una venta de una copia ya convertida, se suprime el abono de conversión; la marca de venta prevalece al unir registros y no puede revertirse con una copia anterior sin vender. Esto evita venta + conversión; si el abono ya se había gastado, se aplica el ajuste/deficit habitual, sin borrar compras u objetos.

El aviso cuenta las copias aún no reconocidas y sus créditos. La acción Entendido persiste los UUIDs en `quoteConversionSeenIds`. Una frase pendiente se excluye del aviso hasta revelarla. La UI histórica muestra `+N créditos`, su rareza original, explicación y Aceptar créditos, sin presentar una frase coleccionable ni botón para equiparla.

## Persistencia, importación y conflicto

- `normalizeGame` valida el modelo histórico y aplica la migración independiente de `abilityChargeVersion` y de cualquier versión de progresión aportada por bloque 4. Incluso con la versión ya presente, nuevos UUIDs de legado recibidos de un cliente antiguo se reconocen individualmente.
- `storage.loadData` hace la normalización y su escritura en una transacción IndexedDB `readwrite` estricta. Dos cargas concurrentes se serializan; la segunda observa la misma revisión y no vuelve a compensar. El guardado normal también normaliza snapshots válidos.
- Se mantienen la revisión optimista, las reservas en memoria y el reintento de la misma instantánea. Se corrigió además la captura de excepciones síncronas en `put`: se aborta la transacción y se conserva lo pendiente, sin excepción de evento no capturada ni falso éxito.
- Exportar conserva el registro. Importar acepta un backup histórico sin campos de conversión, valida antes de migrar y no borra el libro original. Reimportar o unir dos migraciones idénticas no suma créditos de nuevo.
- Se conserva la política real de `backup.mergeGame`: las ramas con compras/consumos independientes exigen elegir un libro completo. Las conversiones se unen por identidad incluso tras elegir local/incoming; registros de copias que no están en el libro elegido son solo auditoría y **no conceden créditos**. Una identidad cuyo contenido difiere entre libros sigue la elección explícita del libro; no se sustituye un equipo por una frase de otra rama.
- Un registro de conversión incompatible en la fusión produce un error de backup; no se acepta un reinicio silencioso del juego.
- Los créditos de compensación siguen la financiación original. Una copia comprada con `testFunded` abona el fondo de pruebas, no crea saldo ganado al retirar ese fondo.

## Aperturas comprometidas

La compra sigue reservando conjuntamente item, transacción y `pendingOpening` antes de animar. La nueva tabla solo participa en compras nuevas. La migración no sustituye ni vuelve a sortear equipo o cheesit pendiente; conserva UUID, rareza, definición, precio, estado y tiempos. En una frase pendiente conserva el mismo item histórico y registra la compensación por ese UUID; revelar solo termina la presentación, sin nuevo cobro ni nuevo pago acumulativo.

Los estados `spinning`, `rarity`, `revealing`, el tiempo de giro, la opción revelar ahora y movimiento reducido se conservan. Cerrar, navegar, recargar, repetir clics o reintentar una escritura usan la misma reserva. Las comprobaciones incluyen una revelación histórica sin red y un arranque frío con recarga completamente offline tras preparar el service worker de producción.

## Alcance real de sincronización y temporadas

La sincronización de cuenta **no sincroniza `game`** en esta base: `src/lib/remote/types.ts` solo admite `session | routine | exercise`; la cola/RPC y `AccountPanel` operan esas entidades. No se añadió un supuesto sincronizador de economía ni se afirmó haber probado Supabase con dos dispositivos reales. La comprobación de dos dispositivos usa copias independientes y la vía real de backup/importación. Las pruebas existentes de cola remota siguen pasando dentro de `npm test`.

Esta copia parte de cofres de nivel legacy, `level:N`. Bloque 4 es dueño de la identidad anual, `sourceSeason`, `LevelCrate.season`, la curva XP y las temporadas. Este bloque conserva campos adicionales existentes mediante spreads y tiene una prueba de conservación de metadatos `sourceSeason` / `season` / `level` en transacciones y pendientes. **Eso no equivale a verificar IDs anuales reales**, cuyo validador y firmas deben integrarse con bloque 4. La integración debe revisar también el parseo legacy de `item.crateId` en `CrateOpening` y `CrateArtwork` para construir correctamente los previews anuales. Se mantienen las firmas legacy de `levelCrate` y `openLevelCrate`; la única retirada es `RewardChoice.gearSlot`.

Puntos de integración compartidos: imports/modelo/validador/normalización/economía y sorteo en `game.ts`; llamada y presentación de `LevelRewards` en `GameHub.tsx`; unión de conversiones después de elegir el libro en `backup.ts`; normalización atómica al cargar/guardar en `storage.ts`. Mantener ambas migraciones independientes y regenerar la build/manifest final tras la integración.

## Comandos ejecutados y resultados

- `npm test`: **163/163** pruebas de dominio pasan. Incluye límites deterministas de pesos/rareza, todas las categorías y pools, todas las ranuras de nivel, ignorar elección antigua, dos cheesits por rareza, duplicados, compensación por cada rareza/copia, frases vendidas, fondos de pruebas, migración repetida, importación de envelope antiguo real, dos migraciones concurrentes, unión de identidades tras conflicto, reenvío legacy, registro acumulado de 100.001 identidades sin reinicio, pendientes de los tres tipos y persistencia/reintento sin duplicar premio.
- `npm run typecheck`: pasa.
- `npm run build`: pasa con Next **16.4.3**, genera cuatro rutas estáticas y el manifest offline de 82 recursos. Build final verificada: `ee07e1015cb3f7bccf8b1fe6`.
- Desarrollo local en `127.0.0.1:3105`: 27/27 pruebas existentes de `inventory`, `gamification`, `arcade-visual`, y posteriormente 4/4 nuevas de `block-five` pasan. Se corrigieron las aserciones antiguas que esperaban frases/selector de ranura.
- Producción local en `127.0.0.1:3105`: **31/31** pasan con `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3105 npx playwright test tests/block-five.spec.ts tests/inventory.spec.ts tests/gamification.spec.ts tests/arcade-visual.spec.ts --workers=1` (1,1 minutos).

- Offline de producción: **5/5** pasan con `PLAYWRIGHT_PRODUCTION=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3105 npx playwright test tests/block-five.spec.ts --workers=1 --output=test-results-block5-offline` (9,6 segundos). Añade el caso de arranque frío offline a los cuatro casos ya comprobados: **32 casos distintos de navegador verificados** entre ambas ejecuciones.

Se usaron Chrome local y fixtures IndexedDB aislados. No se ejecutó toda la colección de specs de bloques anteriores ni se probó Safari, Firefox, un móvil físico o una sesión remota autenticada. Las pruebas offline nuevas cubren la página ya cargada y la recarga sin red mediante el service worker; no se ejecutó la prueba de actualización entre dos builds distintas. No se probaron datos reales ni servicio de despliegue.

## Evidencia visual

Capturas de Playwright en `test-results/` (rutas relativas a esta copia):

- `block-five-block-5-odds-as-7cd21-ice-and-collection-at-390px/`: `cofres-390.png`, `ascenso-390.png`, `coleccion-390.png`.
- `block-five-block-5-odds-as-02d18-ce-and-collection-at-1440px/`: equivalentes de escritorio.
- `block-five-legacy-reserved-fa9a2-version-without-a-new-debit/`: resultado de conversión en móvil y escritorio.
- `block-five-multiple-purcha-6dc50-across-navigation-and-retry/`: resultado nuevo a 390 y 1440 px.
- `gamification-*` / `arcade-visual-*`: giro, apertura y vistas adicionales, incluidas anchuras 320/390/768/1440.

La suite comprueba ausencia de overflow, odds visibles, ausencia de selector en Ascenso, carga de las ilustraciones existentes, ausencia de tarjetas/filtro de frases y persistencia del aviso reconocido. Se inspeccionaron visualmente capturas de producción de Cofres escritorio, Ascenso móvil, colección móvil y resultado nuevo escritorio, además del resultado de conversión móvil. Texto, arte reutilizado y acciones quedan legibles, sin tarjetas de frases ni selector de ranura.

## Archivos de entrega respecto a base

Código:

- `src/lib/game.ts`
- `src/lib/quote-conversion.ts` (nuevo)
- `src/lib/backup.ts`
- `src/lib/storage.ts`
- `src/components/GameHub.tsx`
- `src/components/CrateOpening.tsx`
- `src/components/WardrobeV3.tsx`

Pruebas:

- `tests/block-five.spec.ts` (nuevo)
- `tests/unique-quotes.test.ts` (reescrito para el nuevo contrato y migración)
- `tests/storage.test.ts`
- `tests/game.test.ts`
- `tests/rpg-reliability.test.ts`
- `tests/cheesits-integration.test.ts`
- `tests/backup-v2.test.ts`
- `tests/inventory.spec.ts`
- `tests/gamification.spec.ts`

Informe: `docs/block-5-verification.md`. Generado por build: `public/offline-manifest.json` (82 recursos; regenerar tras integrar). Los artefactos `.next`, `test-results`, `test-results-block5-offline` y `tsconfig.tsbuildinfo` son de verificación, no cambios de producto. El manifest generado debe regenerarse en la copia integrada; no se necesita copiarlo como cambio manual. `package.json`, `package-lock.json`, `.env`, modelos de XP/pasivas y SQL no se han modificado.
