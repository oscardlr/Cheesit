# Entrenos — especificación de producto y construcción

**Estado:** propuesta para implementación, 27 de octubre de 2026. **Idioma:** español de España. **Plataforma:** web adaptable y PWA instalable; móvil primero. Este documento describe decisiones y pruebas pendientes: no certifica que exista una implementación ni que se hayan ejecutado las pruebas.

## 1. Visión, usuario y problema

Entrenos es un registro personal de fuerza para quien necesita anotar lo que realmente hace entre series, repetir sus rutinas sin quedar atado a un calendario y consultar su evolución con datos fiables. El recorrido más importante es iniciar una sesión, confirmar cada serie con pocos toques y recuperarla en otro dispositivo. La sensación buscada es la claridad de una app de iOS con una identidad propia.

**Prioridades:** 1) no perder datos, 2) registrar sin fricción, 3) recuperar y entender el historial, 4) calidad visual. El producto no prescribe entrenamiento ni pretende diagnosticar fuerza o salud.

### Procedencia de requisitos

- **Solicitud actual:** web/PWA en Vercel, español, kg, fechas civiles de Madrid, rutinas independientes, series confirmadas, calendario con número dentro del círculo, evolución comparable, cuenta y recuperación, trabajo intermitentemente sin conexión, importación/exportación y catálogo con PNG reales. La solicitud actual prevalece sobre cualquier propuesta antigua de app nativa.
- **Prototipo:** sus características se consideran solo las que pueda acreditar la auditoría de la sección 13; su presencia en código no demuestra que funcionen. No se presupone que su estructura, diseño o datos constituyan requisitos.
- **Decisiones nuevas de esta propuesta:** arquitectura, selección de cuenta, reglas de confirmación y conflicto, límites de validación, fórmulas y diseño concretos que siguen. Son parámetros de implementación, no afirmaciones sobre el prototipo.

## 2. Alcance del MVP y exclusiones

Incluye cuenta personal, rutinas, catálogo inicial y ejercicios propios, registro de fuerza por carga y repeticiones, borradores recuperables, sesiones finalizadas editables, calendario, resumen semanal/mensual, progreso por ejercicio, sincronización, respaldo y migración. No hay obligación de entrenar un día concreto.

Quedan fuera la red social, nutrición, pagos, entrenadores, consejos con IA, gamificación compleja, planificación futura, temporizadores y funciones nativas. La modalidad ordinaria es **carga externa en kg + repeticiones**; para ejercicios de peso corporal se anota 0 kg de carga externa y repeticiones. Duración, lastre y asistencia no se ofrecen para nuevos registros en el MVP. Si un respaldo antiguo contiene tales modalidades, se conservan tipadas como **compatibilidad histórica**, se muestran en una vista de solo lectura y se excluyen de los cálculos ordinarios. Una edición no debe convertirlas ni borrar sus datos; su edición completa es una mejora posterior. No se inventa una equivalencia entre peso corporal, carga externa, asistencia o tiempo.

## 3. Requisitos funcionales y trazabilidad

P0 bloquea el lanzamiento; P1 forma parte del MVP después de P0. Los identificadores CA remiten a pruebas de la sección 11.

| ID | Prioridad | Requisito | Aceptación |
|---|---|---|---|
| RF-01 | P0 | Cuenta personal, recuperación de acceso y aislamiento por usuario | CA-01, CA-18 |
| RF-02 | P0 | Crear, editar, duplicar y archivar rutinas ordenadas | CA-02, CA-04 |
| RF-03 | P0 | Iniciar desde rutina o vacío; copia independiente de plantilla | CA-02, CA-03, CA-04 |
| RF-04 | P0 | Registrar series con carga y repeticiones; confirmar cada una | CA-05, CA-06 |
| RF-05 | P0 | Consultar y copiar valores anteriores sin confirmarlos | CA-06 |
| RF-06 | P0 | Borrador local, recuperación y estados de guardado veraces | CA-07, CA-08, CA-09 |
| RF-07 | P0 | Trabajo sin conexión tras preparación, sincronización idempotente y conflictos | CA-08, CA-09, CA-10 |
| RF-08 | P0 | Fecha civil, no futuro y protección ante más de una sesión diaria | CA-11, CA-12 |
| RF-09 | P0 | Editar y eliminar con confirmación, sin cálculos obsoletos | CA-13 |
| RF-10 | P0 | Calendario mensual y número dentro del círculo correcto | CA-14 |
| RF-11 | P0 | Cuenta, series, repeticiones y volumen calculados con reglas explícitas | CA-15, CA-16 |
| RF-12 | P0 | Progreso por ejercicio con comparaciones equivalentes | CA-16 |
| RF-13 | P0 | Catálogo buscable de al menos 25 ejercicios con PNG verificables y ejercicios propios | CA-17 |
| RF-14 | P0 | Exportar/importar JSON con validación y prevención de duplicados | CA-19, CA-20 |
| RF-15 | P0 | Navegación móvil, teclado decimal, accesibilidad y movimiento reducido | CA-21, CA-22 |
| RF-16 | P1 | Gráficos consultables, legibles y con valores accesibles | CA-16, CA-22 |
| RF-17 | P0 | Despliegue reproducible, migraciones, respaldo y recuperación | CA-23 |

## 4. Pantallas y flujos principales

**Navegación:** barra inferior fija con Resumen, Calendario, botón central azul `+` y Rutinas. Cuenta y ajustes aparecen en el encabezado de Resumen mediante un botón con nombre accesible. La barra respeta el área segura; se oculta o desplaza cuando el teclado tapa el formulario y el contenido conserva espacio inferior suficiente.

1. **Primer uso:** registro/inicio de sesión → confirmar correo si está configurado → pantalla inicial → descarga de recursos básicos → indicar «Disponible sin conexión en este dispositivo» solo tras terminar la preparación. La recuperación de contraseña comienza por correo y termina en un enlace seguro de un solo uso con caducidad.
2. **Entrenar:** `+` → elegir rutina activa o «Entrenamiento vacío» → confirmar fecha, nombre y color → editor → confirmar series → «Finalizar entrenamiento» → guardar en servidor o conservar operación pendiente → resumen y calendario muestran la sesión finalizada local con estado de sincronización explícito.
3. **Retomar:** si hay un borrador, mostrar «Continuar entrenamiento» en Resumen y al pulsar `+`. Se puede abandonar el borrador con confirmación. Un borrador no se suma al calendario ni a estadísticas.
4. **Consultar o corregir:** Calendario → día → sesión → editar o eliminar. La edición conserva la versión anterior hasta que el cambio se guarda; los cálculos se regeneran desde el estado efectivo visible y muestran el estado pendiente si aún no está sincronizado.
5. **Rutinas:** lista → crear/editar/duplicar/archivar; seleccionar una al empezar crea copia. Las archivadas se consultan en una sección separada y pueden desarchivarse.
6. **Recuperar:** Ajustes → exportar o importar; seleccionar JSON → validar y previsualizar → confirmar importación → ver resultado y posibles conflictos. El flujo de migración desde el prototipo se detalla en §9.

## 5. Especificación de pantallas

### Acceso y ajustes

Correo y contraseña; alta, acceso y «He olvidado mi contraseña». Mostrar errores comprensibles, sin revelar si una dirección existe. En ajustes: cuenta, cerrar sesión, exportar/importar, información de almacenamiento, accesibilidad y estado de sincronización. Antes de cerrar sesión con cambios pendientes, avisar y ofrecer seguir sincronizando o conservarlos cifrados según las garantías reales del dispositivo; el MVP no promete cifrado local propio: el aviso debe indicar que permanecen en el almacenamiento del navegador de ese dispositivo y pueden ser visibles a quien acceda a su perfil. No borrar pendientes automáticamente. No sincronizar datos locales de una cuenta con otra.

### Resumen

Encabezado con saludo neutro y acceso a ajustes; tarjeta de borrador cuando exista. Selector Semana/Mes y navegación de periodo, con fechas exactas de ambos intervalos. Mostrar entrenamientos, series confirmadas, repeticiones y volumen elegible; variación absoluta y, si procede, porcentaje. Una lista de ejercicios abre su evolución y detalle tabular. «Sin datos suficientes» sustituye una comparación sin registros válidos. Señalar si los datos incluyen operaciones locales pendientes o un conflicto. El selector permite periodos anteriores y volver al actual.

### Calendario

Cuadrícula mensual lunes–domingo con encabezado de mes, flechas anterior/siguiente y nombres cortos de día. Los días de otros meses pueden aparecer atenuados y seleccionar su mes. Una sesión finalizada aparece con el **número dentro de un círculo relleno** del color guardado en la sesión; no se sustituye por un punto. El día actual tiene un contorno exterior y etiqueta accesible «Hoy»; el día seleccionado tiene un segundo contorno de selección y texto accesible, incluso si coincide con hoy. Día sin sesión: número sin relleno; fecha futura desactivada para registro, pero navegable. La combinación mantiene el texto legible y no depende solo del color.

Tocar un día finalizado abre detalle y permite editar. Tocar un día pasado o el actual vacío ofrece crear. Si hay varias sesiones importadas, el círculo muestra el color de la primera por `(created_at, id)` y una insignia «+N»; al tocar se listan todas, con sus nombres y colores. No se descarta ninguna. Un borrador se señala aparte mediante texto «Borrador», sin convertir el día en entrenamiento realizado.

### Rutinas

Lista con nombre, color y número de ejercicios. Crear/editar solicita nombre, color, ejercicios ordenables y series previstas por ejercicio; cada ejercicio tiene acciones accesibles de subir/bajar además de arrastrar. Duplicar abre una copia editable con nombre «Copia de …». Archivar pide confirmación, oculta de las opciones de inicio y permite desarchivar. Los nombres de rutina no necesitan ser únicos.

### Inicio y editor de entrenamiento

El panel de inicio muestra primero borrador existente, rutinas activas y «Entrenamiento vacío». Pide fecha civil por defecto hoy en Madrid, nombre y color editables. Detecta una sesión o borrador existente en esa fecha y aplica §7.

El editor muestra nombre/fecha/color, tarjetas ordenadas de ejercicios, última sesión comparable y filas de series con número, carga, repeticiones y botón «Confirmar serie». Añadir/quitar o sustituir ejercicio solo afecta a la sesión; quitar una fila confirmada pide confirmación. Añadir serie crea fila vacía. Copiar una serie anterior rellena valores **sin confirmar**. Una fila confirmada muestra un icono y texto «Realizada»; si se cambia cualquier valor, vuelve a «Sin confirmar» hasta confirmarla de nuevo. «Finalizar» muestra cuántas filas incompletas o sin confirmar se excluirán y exige confirmación antes de descartarlas. Debe conservarse al menos una serie confirmada válida. Al finalizar, los campos pendientes no se convierten en resultados; se descartan tras el aviso, no se incluyen como series históricas. No hay guardado implícito de una serie como realizada al escribir.

Al editar una sesión finalizada se trabaja sobre una copia local: las series confirmadas originales siguen siendo realizadas; al modificar una vuelve a no confirmada. Guardar cambios requiere al menos una serie confirmada; avisa antes de excluir filas sin confirmar. Cancelar restaura la versión previa. Eliminar exige diálogo con nombre y fecha y acción destructiva inequívoca; si queda pendiente de sincronización, se indica. Las sesiones históricas con modos no editables conservan esas filas intactas.

### Catálogo e imágenes

La búsqueda ignora mayúsculas, tildes y espacios repetidos; filtra por grupo muscular y nombre. Resultado con miniatura, nombre y grupo. Crear ejercicio propio pide nombre, grupo y modalidad ordinaria; no requiere imagen. Si no hay imagen propia, usar tarjeta con iniciales y pictograma genérico claramente distinto de una foto; texto alternativo «Ejercicio personalizado: [nombre]». Los recursos integrados deben entregarse con la aplicación y funcionar en primer uso, también tras la preparación offline. Las fichas llevan alt descriptivo, no texto incrustado imprescindible.

**Catálogo mínimo de lanzamiento — 33 entradas**, cada una con un PNG propio que represente el movimiento correspondiente y manifiesto de procedencia:

| Grupo | Ejercicios |
|---|---|
| Pecho | Press de banca con barra; press inclinado con mancuernas; aperturas con mancuernas; aperturas en polea; flexiones. |
| Espalda | Jalón al pecho; remo con barra; remo en polea baja; remo con mancuerna; dominadas. |
| Pierna y glúteo | Sentadilla con barra; prensa de piernas; peso muerto convencional; peso muerto rumano; hip thrust; extensión de cuádriceps; curl femoral; elevación de gemelos; zancadas con mancuernas. |
| Hombro | Press militar; press de hombros con mancuernas; elevaciones laterales; elevaciones frontales; pájaros con mancuernas. |
| Bíceps | Curl con barra; curl alterno con mancuernas; curl martillo; curl en polea. |
| Tríceps | Extensión de tríceps en polea; extensión por encima de la cabeza con mancuerna; press francés. |
| Abdominales | Crunch abdominal; elevación de piernas; crunch en polea. |

Son 33 entradas. Flexiones, dominadas, crunch y elevación de piernas usan peso corporal: 0 kg de carga externa y repeticiones; se excluyen del volumen para no sugerir que su trabajo real es cero. Las demás usan carga externa. Cada variante tiene identidad propia. Una imagen por entrada puede ser ilustración estática, no una guía de ejecución ni consejo de seguridad.

**Entrega de recursos:** preparar un manifiesto versionado por ejercicio con `exercise_key`, ruta PNG, descripción, autor/origen, licencia o autorización expresa, URL o referencia de prueba y fecha de revisión. Utilizar ilustraciones originales con derechos documentados o recursos cuya licencia permita uso y redistribución en la app; no asumir que una imagen localizada en internet es libre. Cada archivo será realmente PNG decodificable, 512 × 512 px, sRGB, composición y encuadre consistentes, y optimizado; archivo en `public/exercises/<clave>.png`. El pipeline verificará firma, dimensiones, correspondencia visual, manifiesto y respuesta HTTP. La auditoría del prototipo determinará si hay material reutilizable; cambiar una extensión nunca convierte un archivo. No existe en esta fase una colección de PNG ya entregada: obtenerla y revisar sus derechos es una dependencia y un criterio de lanzamiento, no una función terminada.

## 6. Sistema visual y movimiento

**Dirección:** superficies claras, tipografía cuidada y acento azul eléctrico; contenido denso pero respirable. Usar fuente del sistema (`-apple-system`, BlinkMacSystemFont, Segoe UI, sans-serif), sin descarga obligatoria. Tamaños: título 28/34 px semibold, título de pantalla 22/28, sección 18/24, cuerpo 16/24, apoyo 14/20; entrada de formulario al menos 16 px para evitar zoom automático de Safari. Números tabulares cuando estén disponibles.

**Paleta propuesta:** fondo `#F5F7FB`; superficie `#FFFFFF`; texto principal `#152033`; texto secundario `#4A5568`; borde `#CBD5E1`; azul de acción `#0057C2` con texto blanco; error `#A61B29`; éxito `#176B43`; advertencia `#805500`. Paleta limitada para rutinas: azul `#0057C2`, morado `#6638A6`, verde `#176B43`, rojo `#A61B29`, naranja oscuro `#8B4500`, gris `#475569`. Elegir blanco o negro por contraste calculado para cada relleno; exigir al menos 4,5:1 para texto normal y 3:1 para componentes y foco. No usar el color como única señal. Verificar los valores efectivos con herramienta de contraste en implementación.

Escala de espacio 4, 8, 12, 16, 24 y 32 px; radio 12 px en campos, 16 px en tarjetas, círculo para fecha y `+`; borde 1 px en separadores y campos; sombra suave solo para barra/panel flotante (`0 6px 20px` con negro al 10 %). Iconos de trazo uniforme con etiquetas visibles en navegación y nombre accesible; no depender de iconos para acciones destructivas. Imágenes cuadradas sobre fondo neutro con `object-fit: contain`, sin recortar el ejercicio; mostrar esqueleto y sustituto accesible si falla una carga.

Formularios con etiquetas persistentes, errores junto al campo y área táctil mínima 44 × 44 CSS px; campos kg y repeticiones separados. `inputmode="decimal"` para peso y teclado numérico para repeticiones; aceptar coma/punto y normalizar internamente. No impedir pegar valores. Las tarjetas de series tienen filas amplias y orden de foco lógico. Los gráficos usan líneas y puntos de alto contraste, ejes con unidades, etiquetas abreviadas y alternativa tabular; tocar o enfocar un punto presenta fecha y valor. Nada esencial depende de una interacción hover.

Estado vacío: explicación breve y acción concreta; carga: esqueleto sin saltos; error: causa comprensible, mantener entrada y ofrecer reintento; guardado local, pendiente, sincronizado y error de sincronización siempre con texto y símbolo. Foco visible, lector de pantalla con mensajes de estado no intrusivos, asociación de errores a entradas y respeto a `prefers-reduced-motion`. Adaptación de escritorio: ancho de lectura hasta 1120 px, columnas para resumen y detalle, navegación lateral o inferior equivalente; sin restringir funciones.

| Transición | Finalidad y duración orientativa |
|---|---|
| Cambio de pantalla | Continuidad, opacidad/desplazamiento leve 120–160 ms; navegación y entrada responden inmediatamente. |
| Panel inferior | Orientación espacial, 180–220 ms, cierre inmediato cuando la acción lo requiera. |
| Pulsación | Escala hasta 0,98 o cambio de color 80–100 ms; sin bloquear. |
| Añadir serie | Aparición 120–160 ms, foco en el nuevo campo solo cuando se solicita. |
| Guardado | Cambio inmediato del texto de estado; confirmación visual discreta 150–200 ms sin retrasar salida. |
| Gráfico | Interpolación de hasta 200 ms solo cuando ya hay datos; nunca inventar puntos. |

Con movimiento reducido se eliminan desplazamientos y escalas y se usan cambios instantáneos o fundidos de hasta 80 ms. Respetar `env(safe-area-inset-*)`, desplazamiento del formulario, teclado y cambios de orientación; ningún control fijo tapa el campo enfocado ni la acción de guardar.

## 7. Modelo de datos y reglas de negocio

Todos los identificadores son UUID generados en cliente. Todas las tablas privadas tienen `owner_id` y control tanto en API como en base de datos. Las marcas `created_at`/`updated_at` son instantes UTC; `training_date` es una fecha civil SQL `DATE`/cadena `AAAA-MM-DD`, jamás un instante convertido con UTC. «Hoy» se calcula con `Europe/Madrid` en cliente y servidor. Viajar no cambia la fecha elegida. El servidor rechaza fecha posterior a hoy en Madrid; si el reloj local estaba mal, se conserva el borrador y se solicita corregirla. Lunes–domingo define la semana.

| Entidad | Campos esenciales y relación |
|---|---|
| Usuario | ID de Auth; configuración privada de idioma, zona inicial, preferencias y versión. |
| Ejercicio | ID estable, clave de catálogo o propietario, nombre, grupo, variante, modalidad (`external_load_reps`, `bodyweight_reps` o tipo histórico), imagen/manifiesto; archivado en lugar de borrar. Catálogo global de solo lectura; propios visibles solo al dueño. |
| Rutina | ID, propietario, nombre, color, estado activa/archivada, versión y fechas. |
| Ejercicio de rutina | ID, rutina, ejercicio, posición única por rutina, series previstas. |
| Sesión | ID, propietario, fecha civil, nombre y color copiados, estado borrador/finalizada/eliminada o `legacy_planned` para una sesión futura importada, origen y ID opcional de rutina, copia de su nombre y color al iniciar, revisión entera, fechas de creación y cambio. El origen es informativo y puede desaparecer sin afectar a la sesión. |
| Ejercicio de sesión | ID, sesión, identidad estable del ejercicio, copia de nombre, grupo y modalidad, posición y series previstas al inicio. Conserva los valores aunque se edite la rutina o el catálogo. |
| Serie | ID, ejercicio de sesión, orden, modalidad tipada, carga decimal kg, repeticiones enteras, estado confirmada; en borrador se admiten campos nulos y filas sin confirmar. Las modalidades históricas conservan su estructura y unidades de origen por separado. |
| Operación | ID de idempotencia, propietario, dispositivo, entidad, revisión base, payload tipado, resultado y momento. Registrar el ID y aplicar cambio en una transacción. |
| Importación | ID, origen/formato y versión, identificadores originales y huellas, informe de advertencias y decisiones; no sobrescribir por coincidencia dudosa. |

**Instantánea:** al iniciar, copiar nombre/color de sesión, identificación y nombre/color de la rutina de origen, orden, identidad/nombre/grupo/modalidad de cada ejercicio y número previsto de series. Los valores de las series pertenecen únicamente a la sesión. Editar o archivar la plantilla, un ejercicio o su imagen no altera esos datos históricos. Para un ejercicio sustituido en la sesión se conserva la nueva identidad y su instantánea; no se mezcla con la anterior en estadísticas.

**Validación:** nombre recortado de 1–80 caracteres para rutina, sesión y ejercicio; grupo y color de listas conocidas; 1–20 series previstas por ejercicio; hasta 50 ejercicios por sesión y 50 filas por ejercicio. Peso numérico 0–1.000 kg, máximo dos decimales, coma o punto, sin separadores de miles ni números negativos; repeticiones enteras 1–1.000. `0 kg` es válido; para peso corporal debe ser 0 y su volumen queda excluido. Se rechazan `NaN`, infinito y notación ambigua. Son límites de protección ajustables mediante migración, no recomendaciones de entrenamiento. Validar también en servidor. Borrador admite valores incompletos, nunca se contabiliza. Una sesión finalizada exige fecha válida no futura, nombre/color válidos y al menos una serie confirmada válida. Un ejercicio sin series confirmadas se elimina de la sesión finalizada salvo que contenga datos históricos preservados.

**Una sesión al día:** al crear se consulta el estado local y, si hay red, el servidor. Si existe sesión finalizada, abrirla o elegir otra fecha; si existe borrador, continuar o descartarlo explícitamente. No sobrescribir. El servidor serializa la creación/finalización por `(owner_id, training_date)` y deniega otra sesión normal; los borradores concurrentes de dispositivos se detectan al sincronizar. Importación permite explícitamente varias sesiones históricas en una misma fecha y las conserva; después no se permite una nueva sesión normal en ese día. Cambiar una fecha existente a otra ocupada también requiere elegir otra fecha. Una sesión en conflicto permanece recuperable y se resuelve como en §9.

**Anterior:** para cada ejercicio, usar la sesión finalizada más reciente anterior por fecha civil; si hay varias el mismo día, ordenar por `created_at` y UUID. Mostrar fecha y modalidad; no tomar la misma sesión ni un borrador. Los valores copiados nunca se marcan realizados. Las variantes con identidad distinta nunca se agrupan por coincidencia de nombre.

## 8. Métricas y ejemplos

Solo cuentan sesiones finalizadas no eliminadas y series confirmadas válidas. Una sesión cuenta una vez, aunque haya varias importadas el mismo día. `Series = número de series confirmadas`; `repeticiones = suma de repeticiones`; `volumen (kg·rep) = Σ carga externa en kg × repeticiones` de modalidad `external_load_reps`. Se excluyen peso corporal, duración, lastre y asistencia, y la UI indica cuántas series se excluyeron. Carga 0 en un ejercicio de carga externa aporta volumen 0 y sigue contando como serie. Volumen describe trabajo registrado, no fuerza directa. Calcular con decimales exactos, no flotantes binarios; redondear solo al mostrar.

**Periodos:** semana completa lunes–domingo, mes completo del primer al último día, ambos inclusivos. En semana actual comparar desde el lunes hasta hoy con los mismos días de la semana anterior, con ambas fechas visibles: lunes 12–miércoles 14 frente a lunes 5–miércoles 7, por ejemplo. Para el mes en curso del día 1 al día D, comparar con día 1 a `min(D, último día del mes anterior)` e indicar número de días y si difieren; no extrapolar. Al comparar meses completos de diferente duración se muestran totales y días de cada mes y se añade promedio por día natural (`total / días`), etiquetado, para contextualizar; nunca presentar totales como si tuvieran igual duración. Periodos anteriores completos se comparan con el inmediatamente anterior completo.

Una variación absoluta es actual − anterior. Variación porcentual `(actual − anterior) / anterior × 100` solo si anterior > 0 y ambos periodos contienen datos válidos para la métrica; con denominador 0, o si no hay datos, mostrar «Sin datos suficientes», con totales disponibles sin porcentaje. Un periodo sin sesiones tiene total 0, pero no se interpreta como progreso en un ejercicio. No generar puntos ficticios.

**Comparación por ejercicio:** seleccionar ejercicio/variante y modalidad idénticas. Para cada periodo, agrupar series confirmadas por número de repeticiones y tomar la mayor carga de cada grupo; comparar cargas solo en grupos de repeticiones presentes en ambos periodos. De forma paralela agrupar por carga exacta en kg y tomar el mayor número de repeticiones; comparar repeticiones solo para cargas presentes en ambos. Mostrar cada pareja comparable con fechas y diferencias; si hay varias, ordenar por fecha más reciente y permitir ver todas. Sin coincidencia, «Sin datos suficientes para una comparación equivalente» y mostrar datos sin etiqueta de mejora. No reducir el progreso a una cifra global ambigua. Gráfico por modo elegido: carga frente a fecha para un número de repeticiones seleccionado, o repeticiones frente a fecha para una carga seleccionada; cada punto representa el máximo de esa condición por sesión, y se puede consultar fecha, valor y condición. La tabla ofrece los mismos datos.

Ejemplos verificables:

- 50 kg × 8 y 55 kg × 8: mismas repeticiones; carga +5 kg, +10 %. 50 kg × 8 y 50 kg × 10: misma carga; +2 repeticiones, +25 %. 50 kg × 8 y 55 kg × 3: ningún eje fijo común; sin mejora comparable automática.
- Dos series 50 × 8 y 55 × 8: 2 series, 16 repeticiones, volumen 840 kg·rep. Una serie corporal de 10 repeticiones añade una serie y 10 repeticiones, pero no volumen elegible.
- Semana lunes 12–miércoles 14: 3 sesiones frente a lunes 5–miércoles 7: 2 sesiones implica +1 y +50 %, si ambos tienen datos. En un mes completo de 31 días con 8 sesiones frente a uno de 30 días con 6, mostrar 8 y 6 y promedios 0,258 y 0,200 sesiones/día; no extrapolar.

Las cifras se derivan de la fuente de verdad de sesiones: invalidar/recalcular tras guardar, editar, eliminar, importar o resolver conflicto, tanto en vista local como tras confirmación de servidor. No almacenar un resumen como única fuente de verdad.

## 9. Persistencia, sincronización y migración

### Funcionamiento local

La aplicación se prepara **con conexión en cada contexto de uso**: abrir por HTTPS, iniciar sesión y completar la descarga del shell, catálogo, imágenes y datos necesarios antes de desconectar. Safari y la app añadida a pantalla de inicio pueden tener almacenamientos separados: instalarla no garantiza que aparezca un borrador creado antes en Safari; sincronizar primero y volver a iniciar sesión en la app instalada. La primera autenticación, recuperación de contraseña, alta y descarga inicial requieren red. El shell genérico disponible offline no depende de HTML SSR autenticado ni contiene datos privados compartidos.

Usar IndexedDB por cuenta para copia local, borradores, sesiones, rutinas y cola de operaciones; el service worker mantiene recursos de aplicación y catálogo versionados en Cache Storage. No guardar tokens o datos privados en caché HTTP compartida. Los cambios de borrador se confirman en una transacción local tras cada cambio con debounce máximo de 300 ms; al salir de un campo o poner en segundo plano, intentar escritura inmediata. El indicador solo dice que está guardado cuando IndexedDB confirma. Si falla por cuota o permisos, mantener formulario en memoria, indicar el riesgo y ofrecer reintentar/exportar; no darlo por guardado. Los borradores también se encolan para sincronización cuando el usuario está autenticado, por lo que otro dispositivo puede recuperarlos una vez confirmados por el servidor.

Las cuatro etiquetas, siempre acompañadas de texto:

1. **Guardado en este dispositivo:** escritura local confirmada; aún no implica una copia remota.
2. **Pendiente de sincronizar:** existe una operación local válida sin acuse remoto; también se utiliza sin conexión o si se necesita autenticar de nuevo.
3. **Sincronizado:** el servidor confirmó la revisión correspondiente y no quedan cambios locales posteriores para esa entidad.
4. **Error: requiere atención:** cuota, credenciales caducadas, validación, conflicto u otro error no solucionable con reintento automático; explicar y mantener los datos.

El navegador puede retirar almacenamiento por cuota, presión de espacio o políticas de inactividad; solicitar almacenamiento persistente cuando el navegador lo admita no garantiza que lo conceda. Una PWA instalada tiene políticas de almacenamiento propias que no eliminan todos los riesgos. Borrar datos del sitio, cambiar de navegador, perder el dispositivo o desinstalar puede hacer inaccesibles cambios solo locales. La sincronización en segundo plano no está garantizada en iOS: reintentar al abrir, al recuperar foco y al detectar conexión mientras está abierta, con retroceso exponencial ante errores; no prometer sincronización con la app cerrada. Fuentes: [política de almacenamiento WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/) y [API de sincronización en segundo plano](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API).

### Protocolo de sincronización

Cada operación persistida en la cola contiene `operation_id` UUID estable, `owner_id`, `device_id`, `entity_id`, acción, contenido, huella, `base_revision` y orden local. Persistir primero la operación y el cambio visible en una transacción local. Procesar en orden por entidad; al recibir acuse, actualizar revisión e incorporar esa revisión como base de la siguiente operación pendiente de la misma entidad, sin perder otros cambios. Distintas entidades pueden avanzar de forma independiente. Un reintento usa el mismo UUID y contenido, nunca genera una segunda operación para la misma pulsación. Deshabilitar temporalmente el botón ayuda, pero la garantía real es la transacción del servidor.

El endpoint autenticado o RPC transaccional valida propiedad, esquema y fecha; comprueba si ya existe `(owner_id, operation_id)`: si existe con la misma huella devuelve exactamente el resultado previo; con distinta huella rechaza. Si no existe, comprueba `base_revision`, aplica el cambio y guarda resultado e ID de operación en la misma transacción. Responde con revisión, entidad canónica y estado; solo ese acuse permite retirar de la cola y mostrar sincronización. Las operaciones y tombstones se conservan como mínimo mientras puedan existir clientes o respaldos antiguos; no purgarlos sin protocolo de vencimiento y revalidación. Tras error transitorio se reintenta; errores 401 piden acceso de nuevo sin borrar datos; errores 4xx de validación requieren corrección.

Si otra instancia modificó la misma entidad, el servidor responde `409` con revisión y copia actual. Se conservan las dos versiones; se bloquea solo esa entidad y se muestran fecha, valores y diferencias. Opciones: conservar versión del servidor, aplicar versión local sobre la revisión actual tras confirmación, o crear una copia con nueva identidad y fecha permitida. No fusionar series automáticamente ni ignorar la regla de una sesión diaria. Si el conflicto es con un borrado, ofrecer conservar borrado o restaurar explícitamente; una marca de borrado impide que un cliente antiguo resucite datos en silencio. Una sesión creada offline en fecha que otro dispositivo ocupó queda intacta en conflicto; se puede abrir la existente o cambiar la fecha de la pendiente. La resolución produce una nueva operación con revisión actual. El resto de la cola sigue funcionando.

### Exportación, importación y recuperación

Exportación JSON UTF-8 versionada con `format`, `schema_version`, `export_id`, fecha de exportación, origen, unidades, IDs y revisiones, entidades y relaciones, datos históricos tipados y metadatos de borrado. No incluir contraseña ni tokens. Por defecto se exporta una instantánea coherente de servidor más cambios locales propios; si hay pendientes o conflictos, indicar exactamente qué versión se incluye, advertir que puede diferir del servidor y ofrecer sincronizar primero. La descarga debe poder usarse sin red si los datos están disponibles localmente. Identificar en el archivo y en la pantalla si la copia local cubre todo el historial confirmado o solo una parte; nunca presentar una exportación parcial como respaldo completo. El archivo contiene datos personales: recomendar guardarlo en lugar privado.

Importar solo tras conexión/autenticación: limitar archivo a 20 MB y cantidades razonables, analizar como datos JSON sin ejecutar nada; verificar versión, tipos, fechas civiles, IDs, límites, unidades, relaciones, propiedad reasignada a la cuenta actual y modos históricos. Rechazar el archivo completo si tiene estructura incompatible y ofrecer informe; para registros individuales de formatos antiguos ambiguos, conservar el original en una zona de importación y mostrar advertencias sin inventar valores. Antes de confirmar, mostrar recuentos de nuevos, ya presentes, conflictos, fechas con múltiples sesiones, futuras y registros históricos. El usuario confirma explícitamente. IDs estables de origen más ID original y huella/revisión permiten detectar duplicados: mismo ID y contenido se omite, mismo ID con contenido distinto exige elegir conservar actual o importar copia; valores iguales por sí solos no prueban duplicidad. Reimportar el mismo archivo no añade duplicados. La aplicación nunca borra datos existentes para importar y conserva las múltiples sesiones del legado.

Importación atómica en servidor por lote validado: todas las altas y su registro de idempotencia se confirman en una transacción; si alguna falla, no se aplica ninguna y se conserva el archivo para reintentar. La excepción de múltiples sesiones por día solo se concede a la ruta de importación validada, no a creación normal. Las sesiones futuras antiguas se preservan como `legacy_planned` separadas, sin aparecer como realizadas ni contar en métricas; se listan con aviso en ajustes/importación y no se convierten en entrenamientos finalizados automáticamente. Los borrados del respaldo no eliminan registros presentes; restaurar uno requiere acción explícita. Las series de duración, lastre y asistencia mantienen modalidad y unidades de origen; campos ambiguos como `legacyUnit` se muestran como desconocidos y no se convierten.

**Desde el prototipo:** 1) abrir la versión original en el mismo navegador, perfil y origen donde se registraron los datos; no asumir que abrir otra copia del HTML accede al mismo almacenamiento. 2) Usar su opción de exportación JSON si funciona en ese contexto, incluyendo borradores si se ofrecen, y guardar el archivo original sin modificar. 3) En Entrenos abrir Ajustes → Importar → seleccionar respaldo → revisar advertencias y recuentos → confirmar. 4) Comparar sesiones, fechas, ejercicios y registros ambiguos con la versión original; conservar el respaldo hasta validar. El código inspeccionado contempla esquemas 5, 4 y antiguos/v3 y claves `entrenos-local-v5`, `entrenos-local-v4`, `entrenos-local-v3`; el adaptador deberá basarse en muestras reales y pruebas de cada esquema antes de declararse compatible. La existencia de exportación en el código no demuestra que funcione. Si no existe exportación utilizable o no hay acceso al origen/perfil, no afirmar que los datos se puedan recuperar a partir del HTML; será necesaria una extracción específica revisada o el respaldo previo del usuario.

Para recuperar una cuenta: restablecer contraseña con el correo, iniciar sesión y descargar datos del servidor; si faltan datos, comparar con el último JSON y previsualizar importación. Un borrador nunca sincronizado solo se puede recuperar desde el contexto local que aún lo conserve o una exportación que lo incluyera.

## 10. Arquitectura y despliegue

### Propuesta principal y compromisos

- **Frontend y backend web:** Next.js con App Router y TypeScript en Vercel; componentes cliente para editor offline y rutas de servidor para la API autenticada. Versiones exactas fijadas en lockfile tras comprobar compatibilidad y soporte al iniciar implementación, no inventadas aquí. Una compilación de shell estático genérico debe abrir offline; las páginas privadas no se cachean en CDN ni en caché de service worker. Alternativa más simple en cliente: SPA estática con API separada; se elige Next.js por integración de frontend, rutas y manifest, aceptando el trabajo extra para evitar dependencia de SSR sin red. [Guía PWA de Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps).
- **Datos y autenticación:** Supabase PostgreSQL y Supabase Auth con correo y contraseña, confirmación y recuperación mediante correo. Usar flujo de sesión y cookies según documentación vigente, con verificación en servidor; evaluar estado de `@supabase/ssr` al fijar la dependencia, pues su documentación lo identifica como beta. Configurar SMTP propio para producción: el servicio de correo predeterminado no está pensado como garantía de entrega de producción. [Auth en servidor](https://supabase.com/docs/guides/auth/server-side), [contraseñas y recuperación](https://supabase.com/docs/guides/auth/passwords).
- **Alojamiento frente a persistencia:** Vercel sirve frontend, funciones y recursos del despliegue; PostgreSQL externo conserva datos entre ejecuciones y despliegues. Nunca usar el sistema de archivos de funciones ni memoria de proceso como almacenamiento duradero. Elegir regiones de función y base de datos cercanas. [Funciones de Vercel](https://vercel.com/docs/functions).
- **Imágenes:** PNG iniciales versionados con código y servidos como recursos estáticos; activos propios inicialmente no admiten subida y muestran el sustituto. Si se añade subida más adelante, usar almacenamiento de objetos con control de acceso, validación de formato y límites. No depender de URLs externas para el catálogo inicial.
- **Local/offline:** IndexedDB y service worker con shell, manifest e imágenes precargadas; sincronización y conflictos según §9. Las credenciales vencidas no borran los borradores; un nuevo acceso puede ser necesario para subirlos. Offline se permite continuar solo en el contexto del último usuario autenticado, sin cambiar de cuenta hasta verificarla en línea. Al cambiar de cuenta, aislar por `owner_id` y jamás enviar la cola anterior con credenciales nuevas.
- **Estadísticas:** función compartida y pura de TypeScript, alimentada por copia local para respuesta inmediata; el servidor puede entregar sesiones filtradas por fecha/usuario y verificar resultados para exportaciones. Idénticas reglas y fixtures en ambos lados. Sin caché agregada como única verdad. Índices por `(owner_id, training_date)`, identidad de ejercicio y relaciones.
- **PWA:** HTTPS, manifest con nombre, `start_url`, `scope`, `display: standalone`, colores e iconos PNG de 192 y 512 px; icono Apple y metaetiquetas pertinentes. Service worker versionado y actualización compatible con borradores; actualización no puede borrar IndexedDB. En iPhone explicar Compartir → Añadir a pantalla de inicio; no depender de un diálogo automático de instalación. El service worker debe cachear realmente shell y catálogo y comprobar su disponibilidad después de instalarlo.

### API, integridad y seguridad

API versionada con lecturas paginadas de catálogo, rutinas y sesiones; endpoint de cambios idempotentes según §9; previsualización y confirmación de importación; exportación. El servidor obtiene el usuario de la sesión verificada, nunca confía en `owner_id` enviado. Cada tabla privada tiene RLS y permisos explícitos para lectura/inserción/actualización/borrado; para hijos se verifica además que su padre pertenece al mismo dueño y claves foráneas compuestas impiden cruzar propietarios. Vistas y RPC se revisan para que no eviten RLS accidentalmente; funciones privilegiadas mínimas, con `search_path` fijado y verificación explícita del usuario. La clave `service_role` o secreta nunca llega al navegador. Pruebas con dos cuentas para cada operación y con llamadas directas a la API. [Políticas RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

Exigir HTTPS, cookies seguras y protección CSRF cuando corresponda, validación de datos en servidor, dependencias bloqueadas y revisadas, y no registrar contraseñas, tokens ni contenido personal en logs. Borrado es lógico mediante tombstone hasta que pueda gestionarse de forma segura; el producto puede ofrecer eliminación definitiva en una fase posterior con política explícita de retención.

### Entornos y operación

Separar proyectos Supabase y credenciales de desarrollo/pruebas y producción; previews apuntan solo a datos sintéticos de pruebas. Variables indicativas: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_ORIGIN`, `DATABASE_URL` solo en proceso seguro de migración, y credenciales SMTP en el proveedor de autenticación. Solo las variables con prefijo público son visibles en cliente; la clave publicable no equivale a una clave secreta ni sustituye RLS. Secretos en el gestor del entorno, sin valores reales en repositorio ni documentación.

Migraciones SQL versionadas, revisadas y probadas en base vacía y sobre copia de esquema/datos de prueba; aplicar antes de desplegar código dependiente, con cambios compatibles hacia atrás mientras convivan versiones. CI ejecuta pruebas, build y verificaciones de recursos; el despliegue preview se valida antes de producción. Un rollback de frontend no revierte automáticamente la base: preparar migración correctora compatible y copia previa a cambios destructivos. El service worker actualiza sin interrumpir un entrenamiento, posponiendo la activación hasta que el borrador esté guardado localmente.

En producción seleccionar plan con copias gestionadas adecuadas y verificar retención vigente; adicionalmente generar una copia cifrada independiente de PostgreSQL al menos diaria, almacenada fuera del proyecto, con acceso restringido y retención de 30 días. Revisar alertas de fallo diariamente y ensayar restauración en entorno aislado al menos cada trimestre; registrar momento de copia, integridad y duración. Los PNG versionados se recuperan desde el repositorio/despliegue. Como objetivo operativo inicial, **RPO ≤ 24 h** para cambios ya sincronizados y **RTO ≤ 4 h** tras detectar una pérdida; no son garantías hasta que se prueben. Copias de base de datos no recuperan datos que solo existían en un navegador; los backups de base de Supabase tampoco incluyen los objetos de Storage. [Documentación de backups de Supabase](https://supabase.com/docs/guides/platform/backups).

## 11. Criterios de aceptación y plan de pruebas

### Criterios verificables

| ID | Dado / Cuando / Entonces |
|---|---|
| CA-01 | Dada una cuenta creada y correo accesible, cuando el usuario restablece contraseña y entra desde otro dispositivo, entonces ve las sesiones ya sincronizadas de su cuenta. |
| CA-02 | Dada una rutina con dos ejercicios y tres series previstas, cuando se inicia una sesión, entonces contiene copias ordenadas de los dos ejercicios y sus series previstas. Duplicar crea una rutina independiente; archivar la oculta de inicio y permite desarchivar. |
| CA-03 | Dada una sesión iniciada desde rutina, cuando se cambian color, ejercicios o series de la sesión, entonces la rutina conserva su contenido y color originales. |
| CA-04 | Dada una sesión finalizada desde una rutina, cuando se edita o archiva la rutina, entonces el detalle histórico conserva nombres, color, orden y datos de la sesión. |
| CA-05 | Dado un editor con una serie escrita sin confirmar, cuando se finaliza, entonces se avisa de que no contará; si no existe otra serie confirmada válida se impide finalizar. Cambiar una serie confirmada la devuelve a sin confirmar. |
| CA-06 | Dada una serie anterior de 50 kg y 8 repeticiones, cuando se copia, entonces aparecen ambos valores sin marcar como realizada y solo cuentan tras confirmarla. |
| CA-07 | Dado un borrador con escritura local confirmada, cuando se cierra y reabre el mismo contexto del navegador, entonces se recupera con sus campos y estado de confirmación. |
| CA-08 | Dado un dispositivo preparado con conexión y usuario verificado, cuando se desconecta, registra y finaliza una sesión y vuelve a abrir con red, entonces la sesión persiste localmente, se envía una vez y solo muestra «Sincronizado» tras el acuse. |
| CA-09 | Dada una sesión en edición, cuando la red falla o el servidor no responde, entonces los campos y la cola permanecen locales, se muestra pendiente/error y el reintento no los borra. Ante fallo de cuota se informa sin afirmar que se guardó. |
| CA-10 | Dadas dos pulsaciones o reintentos con el mismo ID y contenido, cuando llegan al servidor, entonces existe una única operación aplicada. Si dos dispositivos editan la misma revisión, el segundo recibe conflicto y ambas versiones se conservan hasta resolución. |
| CA-11 | Dada una sesión del 27 de octubre en Madrid, cuando cambia la zona horaria del dispositivo o se recupera en otro, entonces su fecha civil sigue siendo 27 de octubre. Si el reloj offline produjo una fecha futura, se conserva el borrador y se solicita corrección. |
| CA-12 | Dada una sesión existente en una fecha, cuando se intenta crear otra normal, entonces se ofrece abrirla o elegir otra fecha sin sobrescribirla; sesiones antiguas múltiples importadas se conservan y muestran. El servidor resuelve la carrera entre dispositivos. |
| CA-13 | Dada una sesión finalizada, cuando se edita una serie confirmada o se elimina tras confirmar, entonces detalle, calendario y estadísticas reflejan el nuevo estado y su sincronización; una edición cancelada no cambia el original. |
| CA-14 | Dada una sesión finalizada de color morado, cuando se abre su mes, entonces el número del día está dentro de un círculo morado legible; hoy y selección son distinguibles sin depender solo del color. Un día con varias sesiones abre una lista completa. |
| CA-15 | Dadas series 50 × 8 y 55 × 8 más una corporal de 10 repeticiones, cuando se calcula resumen, entonces hay 3 series, 26 repeticiones y 840 kg·rep de volumen elegible, con una serie excluida del volumen. |
| CA-16 | Dados 50 × 8 y 55 × 8 en periodos comparables, cuando se consulta evolución, entonces se indica +5 kg/+10 %; 50 × 8 frente a 50 × 10 muestra +2/+25 %; 50 × 8 frente a 55 × 3 no muestra mejora equivalente. Fechas y duración se muestran, y con denominador cero no hay porcentaje. Cada punto del gráfico ofrece su valor y tabla equivalente. |
| CA-17 | Dada una instalación limpia online y otra ya preparada offline, cuando se abre cada uno de los 33 ejercicios, entonces su PNG real decodifica, corresponde visualmente y tiene alt y licencia registrada. Los personalizados sin imagen muestran sustituto. |
| CA-18 | Dadas cuentas A y B, cuando B solicita por API, vista o RPC un registro o archivo privado de A, entonces no puede leerlo ni modificarlo, incluso cambiando IDs en la petición. |
| CA-19 | Dado un JSON válido con varias sesiones de una fecha, cuando se previsualiza e importa, entonces se conservan todas; una segunda importación idéntica no duplica datos ni elimina los existentes. |
| CA-20 | Dado un JSON corrupto, una unidad histórica ambigua o un ID existente con contenido distinto, cuando se importa, entonces se muestran los errores o conflictos, no se ejecuta contenido ni se sobrescribe silenciosamente y se conserva la fuente. |
| CA-21 | Dado un iPhone, cuando se navega por Resumen, Calendario, Rutinas, `+` y Ajustes, entonces todas las acciones son alcanzables, el teclado no tapa campos o guardado y `12,5` y `12.5` se aceptan como 12,5 kg. |
| CA-22 | Dada la preferencia de movimiento reducido y un lector de pantalla o navegación por teclado, cuando se usan formularios, calendario y gráficos, entonces no hay movimiento esencial, el foco y los estados son claros, los objetivos miden al menos 44 × 44 px CSS y los valores están disponibles sin depender de color. |
| CA-23 | Dado un despliegue nuevo y un respaldo operativo, cuando se actualiza la app o se ensaya restauración en un proyecto aislado, entonces se conservan los registros sincronizados y se cumplen los objetivos medidos de recuperación, sin usar archivos locales de funciones. |

### Automatización y pruebas manuales

- **Unitarias:** validación decimal y límites, fechas de Madrid/cambio horario/año bisiesto, semanas y meses de distinta duración, fórmulas con datos y ceros, comparación de variantes, filtros de modalidades, deduplicación y adaptadores de esquemas conocidos. Fijar relojes en pruebas y comprobar ejemplos de CA-15/16.
- **Integración:** PostgreSQL real de pruebas, RLS con dos cuentas, serialización de fecha, transacciones de importación, idempotencia con peticiones simultáneas, edición frente a borrado, revisión y conflictos, tombstones, migraciones hacia delante y restauración; contrastar cálculo local con el del servidor. Fallar deliberadamente red, cuota simulada y respuesta después de aplicar pero antes de recibir acuse.
- **E2E automatizadas:** flujos de rutina, registro, calendario, edición, exportación e importación; verificar estado de UI, navegación, foco y accesibilidad automatizable. La emulación permite comprobar tamaños de viewport, eventos, cortes de red y comportamiento aproximado de teclado y service worker; no demuestra la experiencia real de Safari/iOS.
- **Manual en iPhone físico:** Safari y PWA instalada por separado, instalación, área segura, teclado real y coma decimal, rotación, accesibilidad/VoiceOver, movimiento reducido, contraste y dianas; tras preparación, modo avión, cerrar/reabrir y sincronizar al recuperar red; bloqueo/desbloqueo y suspensión de la app; caducidad de sesión, falta de espacio cuando sea practicable y actualización de service worker con borrador. Documentar modelo, versión iOS, contexto, pasos y resultado. No prometer que una única versión emulada cubra todos los dispositivos.
- **Manual de recursos:** abrir los 33 PNG en el despliegue final y offline tras preparación; revisar correspondencia del ejercicio y derechos, texto alternativo, composición y legibilidad. Inspección visual profesional separada de una comprobación automática de firma y HTTP.

**Objetivos iniciales medibles:** en iPhone de referencia definido para la prueba y red 4G simulada, percentil 75 de primera presentación útil ≤ 2,5 s en visita online y ≤ 1,5 s para shell ya preparado offline; pulsación hasta respuesta visual ≤ 100 ms en el percentil 95; confirmación de escritura local ≤ 500 ms en percentil 95 para borradores de hasta 50 ejercicios; error de sincronización visible en ≤ 5 s desde fallo detectado; primer uso y precarga total ≤ 15 MB transferidos comprimidos en el catálogo inicial. Medir con build de producción, 30 repeticiones, dispositivo/red/versión registrados, caché fría o caliente según se indica; estos son objetivos, no resultados.

**Definición de terminado:** todos los P0 implementados y CA aplicables aprobados; P1 del MVP completado; pruebas unitarias, integración y E2E en CI; comprobaciones reales en Safari y PWA documentadas; 33 PNG y derechos validados; recuperación probada; métricas de rendimiento medidas frente a objetivos y defectos bloqueantes corregidos; migraciones y despliegue reproducibles; manual de operación y respaldo listos. Las pruebas aquí especificadas no se han ejecutado en esta fase.

## 12. Fases de implementación y dependencias

1. **Base y contratos:** repositorio, entornos de prueba, esquema, fechas civiles, RLS, contratos de sincronización y fixtures de importación. Dependencia: elección y configuración de servicios. Entrega: migraciones y pruebas de aislamiento.
2. **Catálogo y sistema visual:** licencias, preparación y revisión de los 33 PNG; componentes accesibles, navegación y shell PWA. Depende de disponer de recursos aprobados; no bloquear diseño con recursos sin licencia.
3. **Rutinas y editor local:** plantillas, instantáneas, series confirmadas, persistencia IndexedDB y recuperación; depende del modelo y catálogo. Completar validación y flujos de errores locales antes de estadísticas.
4. **Cuenta y sincronización:** autenticación, operaciones idempotentes, resolución de conflictos y regla de fecha en servidor; depende de modelo, políticas y cola local. Probar carreras y red intermitente antes de ofrecer sincronización como fiable.
5. **Calendario y evolución:** sesiones finalizadas, filtros y métricas compartidas; depende del significado estable de serie, fecha y modalidad. Pruebas numéricas y accesibilidad de gráficos.
6. **Respaldo y migración:** exportación/importación versionada, adaptadores y previsualización; depende de muestras reales de los esquemas antiguos y protocolo de IDs. Probar reimportación, fechas múltiples y unidades desconocidas.
7. **Endurecimiento y lanzamiento:** CI, imágenes definitivas, seguridad, restauración, rendimiento y pruebas reales de iPhone/Safari/PWA. Aplicar migraciones y publicar solo tras superar la definición de terminado.

## 13. Supuestos, decisiones pendientes y riesgos concretos

### Auditoría del material disponible

Se localizó `C:\Users\Betaco\Downloads\entrenos-mejorado (2).html`. Se hizo inspección estática del archivo y revisión visual de sus recursos, no una ejecución funcional. No consta en el contexto facilitado el chat original completo, por lo que no se atribuyen a él requisitos adicionales.

- El HTML contiene **28 ejercicios** y 28 recursos incrustados: **27 JPEG de 800 × 533** y un SVG de dominadas de `viewBox 560 × 330`; no son PNG. Las ilustraciones JPEG comparten personaje y fondo azul claro. El SVG tiene otro estilo. La inspección visual sugiere correspondencia con los nombres, pero no certifica técnica ni precisión; peso muerto convencional y rumano requieren revisión especial.
- El código atribuye los JPEG a «Colección Entrenos · Ilustración creada con IA» y el SVG a «Entrenos · Esquema del movimiento», sin acreditar procedencia, autoría ni licencia. **Propuesta:** si el titular acredita derechos suficientes y se valida cada ejercicio, decodificar los JPEG y exportarlos como PNG reales con composición consistente; rasterizar el SVG o rehacer dominadas en el mismo estilo. Adaptar encuadre sin estirar ni recortar el movimiento. Reemplazar cualquier recurso no autorizado o incorrecto y crear imágenes originales para entradas restantes. Hasta entonces ningún recurso se considera aprobado para el MVP.
- El prototipo contiene modalidades `reps`, `duration`, `bodyweight`, `weighted` y `assisted`, plancha, crunch y dominadas; también código para varias sesiones por día, futuras planificadas, importación y exportación. Son funciones observadas en código, no comportamiento probado ni nuevas exigencias. La solicitud actual manda: modos adicionales solo como compatibilidad histórica; futuras solo como legado separado; varias sesiones solo en importación.
- Usa `localStorage` y el esquema v5 con `routines`, `workouts` por fecha y `assets`, además de referencias a esquemas anteriores y copia previa a importación. Advierte que algunas planchas antiguas tienen unidad ambigua y usa `legacyUnit`: preservar esa incertidumbre. Los datos personales pueden estar en el origen del navegador, no en el HTML.

### Riesgos y decisiones por resolver durante la construcción

1. **Derechos e imágenes:** falta prueba de licencia y revisión técnica de las 28 ilustraciones; conseguirla o sustituir recursos es bloqueante para CA-17. La lista de 33 no presupone que los activos ya existan.
2. **Muestras de respaldo:** no se dispone de archivos exportados reales para todos los esquemas; implementar y verificar adaptadores con muestras anonimizadas, especialmente modalidades ambiguas, antes de prometer compatibilidad. El origen del navegador antiguo puede no estar disponible.
3. **Durabilidad local:** el navegador puede expulsar datos, el usuario puede borrar almacenamiento y iOS puede suspender la app; ni service worker ni reintento garantizan ejecución con la app cerrada. La única garantía de recuperación remota es el acuse de servidor y la estrategia de copias probada.
4. **Coste y operación:** el plan de Supabase, SMTP, almacenamiento externo de copias y Vercel deben revisarse antes de aprovisionar; costes, cuotas y retenciones pueden cambiar. El plan gratuito no equivale al objetivo de recuperación definido.
5. **Seguridad física:** el almacenamiento local no está cifrado por la aplicación; un dispositivo compartido puede exponer datos. Diseñar un bloqueo local es mejora futura y no sustituye seguridad del sistema.
6. **Compatibilidad:** fijar versiones concretas tras ejecutar build y pruebas; validar especialmente la integración SSR/Auth y el service worker de Next.js. El objetivo de soporte inicial es Safari iOS y PWA en una versión actual de iOS disponible al ejecutar las pruebas, y navegadores modernos de escritorio; registrar versiones reales antes del lanzamiento.
7. **Elecciones de producto:** los límites numéricos, paleta y nombre son propuestas modificables; cualquier cambio debe mantener las reglas de datos y actualizar criterios. No hay pregunta imprescindible para iniciar la implementación con estos supuestos.
