# Revisión de Cheesit y plan de mejora

Fecha: 28 de octubre de 2026. Código revisado: `9771ec5`, sin cambios iniciales pendientes. Evaluación de la versión local de producción, con créditos de prueba desactivados.

Cheesit tiene una identidad visual reconocible y una capa RPG extensa. Mi valoración como producto para usuarios externos es **6/10**: atrae y recompensa bien, pero todavía necesita más fiabilidad de datos y mejores herramientas para entrenar a diario. La dirección visual está más cerca de un producto terminado que el registro, la recuperación y el seguimiento de progresos. Estas notas son criterio editorial, no una medición científica ni una investigación con usuarios.

La prioridad debería ser poder registrar una sesión rápidamente, conservarla y entender el progreso. Después reforzaría el juego. Añadir más cofres o efectos antes de resolver esos puntos aumentaría el contenido sin solucionar los principales motivos para abandonar la app.

## Alcance y verificación

Se revisaron todas las pantallas y componentes principales, las reglas del entrenamiento y RPG, la persistencia, los respaldos, el service worker y la infraestructura remota existente. Se recorrieron en navegador Resumen, inicio, editor, catálogo, rutinas, calendario, ajustes y los cinco apartados RPG; se registró una sesión ficticia, se abrió y equipó un premio y se reprodujeron los casos de series decimales y borradores ocultos. También se inspeccionó el diseño a 390 y 1440 px.

| Comprobación | Resultado |
| --- | --- |
| Compilación de producción con `NEXT_PUBLIC_TEST_CREDITS=0` | Correcta |
| `npm run typecheck` | Correcto |
| Pruebas de lógica mediante `node --import tsx --test tests/*.test.ts` | 72 de 72 correctas |
| Batería de navegador existente | 33 de 35 correctas en la ejecución conjunta |
| Repetición aislada de las dos pruebas de animación fallidas | 2 de 2 correctas |
| Prueba de ajuste de pantallas a 320, 390, 768 y 1440 px | Correcta en la batería existente |
| Errores o avisos de consola durante el recorrido manual | Ninguno registrado |

La primera prueba fallida perdió el elemento de bienvenida antes de comprobar movimiento reducido; la segunda observó el premio después de una fase transitoria de apertura. Al pasar ambas por separado, la evidencia apunta a fragilidad temporal de los tests. No equivale a una ejecución completa limpia de 35/35 ni prueba que nunca puedan fallar en uso real.

`npm test` encontró una restricción del entorno al abrir el canal IPC de `tsx`; la alternativa con `node --import tsx` ejecutó los mismos 72 tests correctamente. Ese bloqueo no es un error de la aplicación.

No se probaron iPhone/Android físicos, lectores de pantalla reales, teclado móvil, semanas de uso, grandes historiales, cortes durante escrituras, agotamiento de cuota, dos despliegues consecutivos ni un servicio Supabase real. La comparación comercial se basa en funciones publicadas por los propios productos, consultadas el 28 de octubre; no en una prueba práctica de cada competidor. No se modificó la lógica de la app ni se publicaron cambios.

## Inventario de funciones actuales

| Área | Qué existe | Valoración |
| --- | --- | --- |
| Resumen | Estadísticas semanales/mensuales, comparación con tramo anterior, acceso a sesión, rutinas, avatar, nivel y objetivos | Atractivo, pero largo y con mucha información secundaria antes del historial |
| Rutinas | Crear, editar, duplicar, archivar/restaurar, color, ordenar ejercicios y cantidad de series | Base útil; la prescripción del entrenamiento es muy limitada |
| Catálogo | 34 ejercicios, siete grupos, búsqueda sin tildes, filtros y ejercicios propios | Funcional, pequeño y sin fichas técnicas o imágenes específicas |
| Sesión | Vacía o desde rutina, nombre/fecha, borrador, añadir/quitar ejercicios y series, peso/reps, copiar filas previas y confirmar | Permite registrar lo esencial; faltan ayudas de uso diario |
| Historial | Calendario mensual, detalle, editar/eliminar lógicamente y evolución por ejercicio | Consulta básica correcta; faltan búsqueda y tendencias visuales |
| Métricas | Entrenamientos, series, repeticiones, volumen y comparaciones equivalentes de carga/reps | Hay buena intención de comparabilidad, con inconsistencias concretas descritas abajo |
| Perfil | Peso, altura, edad, sexo y compatibilidad con convención antigua de mancuernas | El peso y la convención participan en XP; altura, edad y sexo no tienen utilidad funcional visible |
| Objetivos | 17 semanales y 35 de trayectoria, meta de días y recompensas automáticas | Mucho contenido simultáneo y poca adaptación al plan personal |
| Logros | Seis logros RPG y pequeñas victorias en Resumen | Algunos hitos se solapan con los objetivos |
| Cuerpo | Mapa anterior/posterior, diez músculos, actividad directa/secundaria, 7/14/30 días y nivel muscular | Diferencia correctamente actividad de recuperación; la precisión de ejercicios propios es limitada |
| Economía | XP, nivel, 100 créditos iniciales y conversión de cinco XP por crédito | Explicable, aunque algunos cambios históricos alteran el saldo de forma poco transparente |
| Cofres | Tres comprables, probabilidades visibles, cofre por nivel desde el 2 y apertura pendiente recuperable | Buena conservación del resultado; fricción y accesibilidad mejorables |
| Colección | 20 piezas, cinco ranuras, 15 frases, cuatro compañeras, inventario agrupado y aspectos bloqueados | Bastante desarrollado para el tamaño del núcleo de entrenamiento |
| Habilidades | 20 habilidades de equipo, una activa, una carga por copia y consumo si hay beneficio al completar | Separación sólida entre apariencia y uso funcional; exige explicación y demasiados pasos |
| Celebraciones | Series, récords, sesiones, objetivos, subidas, audio, confeti y preferencias | Motivan; conviene reducir interrupciones y hacer coherente el movimiento reducido |
| Datos/PWA | IndexedDB, JSON de respaldo, importación validada, manifest y caché de recursos | La dependencia de una sola instalación sigue siendo una debilidad importante |
| Cuenta/remoto | Código de autenticación, cola, sincronización y migraciones preparado | No conectado a la app utilizable; no hay cuenta ni sincronización disponible |

## Lo que conservaría

- La combinación de fondo oscuro, violeta y lima, y la ilustración principal. Da personalidad sin necesitar una reconstrucción visual.
- La confirmación explícita de las series y la invalidación de la confirmación cuando se cambia una carga o repetición.
- Las comparaciones entre el mismo ejercicio y modalidad, evitando equivalencias inventadas entre máquinas o movimientos diferentes.
- Las instrucciones de mancuernas y la conservación de registros antiguos con su convención.
- La separación entre aspecto permanente y habilidad consumible, y la congelación de la recompensa aplicada a una sesión.
- El débito y la reserva del premio de un cofre en una actualización, la recuperación de aperturas y el bloqueo de premios aún ocultos.
- Las probabilidades visibles, la identificación de créditos virtuales y la protección contra nuevos duplicados de frases.
- Las etiquetas de controles, foco en modales y alternativas de teclado existentes. Hay una base de accesibilidad aprovechable.
- Las advertencias de que el mapa representa actividad y las referencias de fuerza son del juego. No conviene convertirlas en promesas de recuperación o rendimiento físico.

## Errores que corregiría

P1 significa riesgo para conservar o recuperar datos. P2 afecta al funcionamiento, consistencia o acceso. P3 es un problema menor. La evidencia indica si se comprobó en navegador, mediante ejecución de lógica o por la ruta exacta del código.

### B01 P1 Copias que la propia app no puede restaurar

Un borrador puede conservar repeticiones `0` o `1001`, o un nombre temporalmente vacío. La exportación lo incluye, pero la importación exige valores válidos incluso para series sin confirmar. La ejecución con una serie sin confirmar de cero repeticiones devolvió «Copia no válida: valores de serie».

**Cambio:** separar texto en edición de datos persistidos y definir un esquema restaurable para borradores incompletos. Toda exportación generada por la app debe poder importarse en una instalación vacía sin perder datos válidos.

Evidencia: [entrada de repeticiones](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:49), [autoguardado de borrador](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:94), [validación de respaldo](/Users/oscardlr/Desktop/Cheesit/src/lib/backup.ts:41). Reproducción de dominio.

### B02 P1 Se pueden guardar 2,5 series previstas

La interfaz permite guardar una rutina con `2.5` series; iniciar esa rutina crea dos. El respaldo exige un entero y rechaza la copia. Se reprodujo el guardado en navegador y la incompatibilidad con el importador mediante lógica.

**Cambio:** validar un entero entre 1 y 20 antes de guardar; no depender de los atributos del input. Mostrar el error junto al campo.

Evidencia: [guardar rutina](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:154), [campo de series](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:205), [creación de sesión](/Users/oscardlr/Desktop/Cheesit/src/lib/model.ts:33), [validación](/Users/oscardlr/Desktop/Cheesit/src/lib/backup.ts:36).

### B03 P1 Dos pestañas pueden sobrescribir sus cambios

Se persiste todo el estado y la serialización de escrituras solo funciona dentro de una instancia. Dos pestañas que parten del mismo estado pueden reemplazar el trabajo de la otra. Reproducción con IndexedDB simulado: A guarda «Rutina A», B guarda «Rutina B» y solo queda B. El README lo advierte; la app no lo comunica.

**Cambio:** revisión/versionado del estado y coordinación entre pestañas; si no se implementa todavía, impedir una segunda sesión de edición y explicar cómo volver a la activa.

Evidencia: [persistencia](/Users/oscardlr/Desktop/Cheesit/src/lib/storage.ts:32), [cola de escritura local](/Users/oscardlr/Desktop/Cheesit/src/lib/storage.ts:46).

### B04 P2 Un segundo borrador queda oculto

Se permite crear borradores en dos fechas distintas, pero la aplicación selecciona solo el primero con `find`. Reproducción manual: borrador del 27 de octubre, después otro del 26; al salir, el 26 dice que no hay entrenamientos y no muestra su borrador. «Continuar» abre el del 27. El segundo sigue almacenado, pero queda inaccesible hasta resolver el primero.

**Cambio:** mostrar una lista de borradores y abrir por identificador, o admitir uno solo y bloquear coherentemente la creación de otro.

Evidencia: [selección del borrador](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:86), [creación](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:100), [calendario](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:201).

### B05 P2 Volumen de mancuernas y XP usan convenciones diferentes

En press inclinado, una serie de diez repeticiones con 20 kg por mancuerna muestra volumen 200. La XP sí considera 40 kg de carga bilateral. Si se representa volumen externo total, serían 400 kg × repeticiones. Si se quiere medir sobre la carga registrada, falta identificarlo: mezclar ambas convenciones hace confusa la cifra agregada.

**Cambio:** definir la magnitud y aplicar una convención coherente en resumen, comparaciones y objetivos; conservar el valor introducido. Tratar por separado bilateral, alterno, unilateral y perfiles antiguos. Revisar también la etiqueta «Volumen · kg».

Evidencia: navegador y [métrica actual](/Users/oscardlr/Desktop/Cheesit/src/lib/metrics.ts:11), [carga efectiva](/Users/oscardlr/Desktop/Cheesit/src/lib/strength.ts:72).

### B06 P2 Dos bloques se presentan como dos sesiones

Se puede añadir el mismo ejercicio dos veces a una sesión. Evolución aplana bloques y compara los dos primeros como «Últimas dos sesiones». Una sola sesión con dos bloques puede producir esa comparación con la misma fecha.

**Cambio:** agrupar por sesión y ejercicio antes de comparar; ordenar de forma determinista los entrenamientos de una fecha.

Evidencia: [añadir ejercicio](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:152), [comparación](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:207). Ruta comprobada por código.

### B07 P2 Copiar una serie anterior puede no hacer nada

Si el ejercicio anterior tenía tres filas y el actual solo una, «Copiar» en la segunda o tercera únicamente intenta sustituir un índice inexistente. No añade una serie ni explica que no se haya aplicado.

**Cambio:** crear la fila necesaria, copiar a la siguiente disponible o proporcionar «Copiar todas» con resultado visible.

Evidencia: [copiado por índice](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:204). Ruta comprobada por código.

### B08 P2 Las ediciones de una rutina se pierden sin aviso

Editar una rutina, salir con Volver o navegar y reabrir descarta los cambios. La protección que sí existe para editar entrenamientos históricos no se aplica a rutinas.

**Cambio:** autoguardado claro o detección de cambios con Guardar/Descartar/Seguir editando.

Evidencia: [navegación](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:172), [editor de rutina](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:205).

### B09 P2 La meta de días puede aparecer cumplida y pendiente a la vez

Con tres sesiones importadas del mismo día, Resumen muestra 3/3 conseguido y la misión semanal muestra 1/3 días. El objetivo se configura en días; Resumen cuenta sesiones y la misión cuenta fechas distintas.

**Cambio:** compartir un cálculo único de días válidos y mantener la misma unidad en todos los paneles.

Evidencia: reproducción de lógica; [contador de resumen](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:169), [misión](/Users/oscardlr/Desktop/Cheesit/src/lib/objectives.ts:40).

### B10 P2 La ruleta contradice la promesa de movimiento reducido

Ajustes promete respetar la preferencia del dispositivo. La ruleta sigue moviéndose rápidamente durante cinco segundos mediante `requestAnimationFrame` y `transform`, incluso con efectos desactivados o movimiento reducido. Las reglas CSS no detienen esa animación JavaScript. Es una decisión previa documentada, pero la contradicción de accesibilidad existe.

**Cambio:** revelado estático al reducir movimiento y una opción explícita para revelar directamente. Conservar el sorteo y el premio ya reservado.

Evidencia: [promesa en Ajustes](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:208), [animación](/Users/oscardlr/Desktop/Cheesit/src/components/CrateOpening.tsx:105). La propia batería comprueba que el giro continúa con esas preferencias.

### B11 P3 Duplicar un nombre largo produce un nombre inválido

Una rutina con 80 caracteres genera «Copia de …» con 89. La copia aparece por encima del límite del campo y no se puede guardar hasta corregirla.

**Cambio:** generar un nombre dentro del límite con un sufijo distintivo.

Evidencia: [duplicación](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:202), [límite](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:154).

## Riesgos y limitaciones de datos

Estos puntos no implican que se haya perdido el historial real del usuario. Distinguen condiciones de riesgo y funciones todavía no disponibles.

| ID | Prioridad | Problema | Cambio propuesto y evidencia |
| --- | --- | --- | --- |
| R01 | P2 | Se comunica éxito antes del guardado definitivo. Importar dice «completada» tras cambiar estado, antes del commit; rutinas y finalización navegan antes de confirmar la persistencia. | Esperar commit, indicar fallo y ofrecer reintentar o exportar. [Importación](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:157), [guardado](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:88). Pérdida condicionada a cierre o fallo. |
| R02 | P2 | Los últimos cambios esperan 250 ms sin vaciado en segundo plano o cierre. | Persistencia duradera y recuperación explícita. [Debounce](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:88). No se simuló cierre físico de móvil. |
| R03 | P2 | Importar una versión corregida de un registro conocido aborta por conflicto; no permite elegir versiones. | Vista de diferencias con conservar local, usar copia o duplicar cuando sea válido. [Conflictos](/Users/oscardlr/Desktop/Cheesit/src/lib/backup.ts:121). Limitación comprobada con una sesión cuyo nombre cambió. |
| R04 | P2 | El arranque offline puede no prepararse y el usuario no lo sabe. Se oculta el error de registro. | Estado «Preparando / Disponible sin conexión / Reintentar» y verificación real de caché. [OfflineShell](/Users/oscardlr/Desktop/Cheesit/src/components/OfflineShell.tsx:8). |
| R05 | P2 | Si se publica una app nueva sin cambiar el worker, la copia offline puede seguir antigua. Los assets estables además se sirven primero desde caché. | Versionado automático de precaché y aviso de actualización que proteja borradores. [Worker](/Users/oscardlr/Desktop/Cheesit/public/sw.js:2). Riesgo del proceso de publicación; no ensayo de dos despliegues. |
| R06 | Alta para lanzamiento | No hay cuenta, respaldo remoto ni sincronización entre dispositivos en el producto. Cambiar navegador, origen o instalación exige exportar/importar. | Mantener modo local y añadir sincronización validada con conflictos visibles. El código Supabase preparado no constituye una función terminada. [Ajustes](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:208), [estado remoto](/Users/oscardlr/Desktop/Cheesit/docs/SERVIDOR.md:39). |
| R07 | P3 | No se muestra última copia, espacio o persistencia; no hay recuperación integral ni borrado completo en Ajustes. | Fecha de último backup, aviso de riesgo al borrar navegador, solicitud de persistencia cuando proceda y borrado con confirmación. No se encontró uso de `navigator.storage.persist/estimate`. |
| R08 | P3 | Se puede exportar sin límite, pero importar rechaza más de 20 MB; además la lectura local no valida formalmente todo el esquema. | Alinear límites, detectar copias grandes y disponer de migraciones/cuarentena. [Exportación e importación](/Users/oscardlr/Desktop/Cheesit/src/components/EntrenosApp.tsx:156), [lectura](/Users/oscardlr/Desktop/Cheesit/src/lib/storage.ts:23). Riesgos de escala o datos deteriorados. |
| R09 | P2/P3 | Solo las imágenes precargadas suman 14.073.712 bytes, a los que se añaden HTML, JS y CSS. | Optimizar atlas y tamaños, cargar arte secundario cuando haga falta y medir transferencia móvil. [Precarga](/Users/oscardlr/Desktop/Cheesit/public/sw.js:11). Es tamaño local medido, no una medición de tráfico comprimido o velocidad. |

La infraestructura remota incluye políticas por propietario, RPC, revisiones, idempotencia y cola por cuenta. Es una base razonable, pero no permite afirmar aislamiento o sincronización seguros en producción sin pruebas contra el servicio real. No se identificó una filtración de datos durante esta revisión.

## Cambios de experiencia y diseño

Son decisiones editoriales para mejorar claridad y uso, separadas de los errores anteriores.

| ID | Qué cambiaría | Propuesta concreta |
| --- | --- | --- |
| U01 | El Resumen parece una portada incluso después de haber entrenado. | Primera visita: mantener la ilustración. Visitas posteriores: sesión activa, próxima rutina y últimas marcas antes de la pieza promocional. |
| U02 | La sesión da mucho espacio a eslóganes antes de las filas. | Encabezado compacto, ejercicio actual, última carga, entrada y descanso en el primer tramo visible. El protagonismo de las filas debe crecer con la sesión. |
| U03 | Objetivos muestra 52 tarjetas más seis logros y esconde el perfil al final. | Tres retos próximos, resumen de trayectoria, filtros y completados plegados. Mover perfil a Ajustes o a una pantalla propia. |
| U04 | Hay textos reales de 4–6 px en compañeras/personaje y otros textos de cofre demasiado pequeños. | Eliminar microtexto decorativo cuando compita con información útil; tamaños legibles, revisión con zoom y contraste. [CSS de armario](/Users/oscardlr/Desktop/Cheesit/src/components/wardrobe-v3.css:6), [personaje](/Users/oscardlr/Desktop/Cheesit/src/components/character-avatar.css:6). No se certificó WCAG. |
| U05 | Cheesit, Entrenos y GRIND conviven como si fueran tres marcas. | Elegir una marca visible para app, instalación, título y bienvenida; reservar los otros nombres para elementos concretos del universo si se desean. |
| U06 | Inventario, Aspectos y Habilidades repiten la misma pieza y obligan a entender tres modelos. | Un detalle de objeto con «Usar aspecto» y «Preparar habilidad», cargas claras y acceso directo desde el premio. Mantener su separación lógica. |
| U07 | «Cuenta y ajustes» promete una cuenta que no existe; Ajustes móvil depende de un icono sin texto visible. | Nombrarlo «Ajustes» hasta tener cuenta y mejorar su descubrimiento. |
| U08 | La bienvenida enseña espectáculo, pero apenas enseña a registrar. | Guía breve y opcional: elegir rutina, registrar/confirmar una serie y explicar dónde se guardan los datos. Permitir omitirla. |
| U09 | Abundan nombres ingleses y plurales incorrectos como «1 ejercicios», «1 copias» o «Acumula 1 entrenamientos». | Unificar tono e idioma, corregir singular/plural y hacer que los mensajes describan acciones concretas. |
| U10 | Falta una navegación que pueda recuperarse con URL o recarga. Las pantallas dependen de estado interno. | Rutas o estado navegable para calendario, sesión, rutina y ejercicio; Atrás del navegador coherente y reapertura de la última sesión sin perder cambios. |
| U11 | La evolución está enterrada en los ejercicios del periodo del Resumen. | Entrada «Progreso» con buscador de ejercicios y acceso desde la sesión y el detalle histórico. |
| U12 | «Hoy se entrena», «sin excusas» y objetivos genéricos no reconocen bien el descanso. | Mensajes según el plan elegido, descanso y vuelta tras una pausa; modo de sesión sobrio y celebraciones ajustables en intensidad. |

En escritorio la composición funciona y aprovecha bien una columna lateral; en móvil las pantallas encajan, pero encajar no garantiza legibilidad o eficiencia entre series. Revisaría también el tamaño y separación de los controles pequeños de borrar, la navegación por teclado y el comportamiento con texto ampliado en un teléfono real.

## Funciones de entrenamiento que faltan

La restricción de una sesión por día y varias exclusiones fueron decisiones explícitas del MVP. Aquí se valoran como carencias frente al uso continuado, no como regresiones.

| ID | Función | Prioridad y criterio de utilidad |
| --- | --- | --- |
| T01 | Temporizador de descanso y duración de sesión | Alta. Inicio automático opcional tras confirmar, ajuste rápido, pausa y continuidad al volver a la app. |
| T02 | Última sesión realmente reutilizable | Alta. Ya se muestran filas anteriores; añadir copiar todas, crear filas faltantes y carga inicial opcional sin autoconfirmar. |
| T03 | Rutinas con prescripción | Alta. Reps/rangos, carga objetivo, descanso y notas; no solo nombres y cantidad de filas. |
| T04 | Notas e intensidad | Alta. Notas por ejercicio/sesión y RPE o RIR opcional. No añadir campos obligatorios a quien registra rápido. |
| T05 | Varias sesiones en un día | Media/alta. Mañana/tarde o entrenamiento dividido, con una meta semanal que siga contando días. |
| T06 | Sustituir y reordenar durante la sesión | Alta. Evitar reconstruir el bloque cuando una máquina está ocupada. Añadir repetir sesión y guardar como rutina. |
| T07 | Tipos de serie y agrupación | Media. Calentamiento, trabajo, aproximación, drop set y superseries/circuitos; separar calentamientos de métricas de trabajo. |
| T08 | Gráficos y panel de marcas | Alta. Carga, reps, volumen y 1RM estimado solo donde tenga sentido, con ejercicio y periodo seleccionables. La evolución actual es principalmente texto. |
| T09 | Modos de registro adicionales | Media. Duración, peso corporal con lastre/asistencia y convenciones unilaterales; distancia/cardio solo si encaja en el alcance elegido. |
| T10 | Catálogo útil para aprender y encontrar variantes | Alta. Fichas, técnica, material, alternativas, favoritos y recursos con derechos claros. No basta repetir el icono de mancuerna. |
| T11 | Ejercicios propios completos | Alta. Editar/archivar, modalidad, carga por unidad/pareja y músculos directos/secundarios. Actualmente un gemelo propio del grupo Pierna puede atribuir trabajo a cuádriceps, isquios, glúteos y gemelos; la UI advierte que es aproximado. [Fallback](/Users/oscardlr/Desktop/Cheesit/src/lib/muscles.ts:51). |
| T12 | Planificación y progreso personal | Media. Programas por objetivo/días/material, siguiente sesión, objetivos de rendimiento y evolución de peso/medidas. Empezar con progresión comprensible basada en reglas. |
| T13 | Portabilidad e integración | CSV, importación desde formatos ajenos y compartir rutina o tarjeta de sesión. Apple Health, Health Connect y reloj después de resolver datos y registro; no son requisitos de la primera mejora. |

No añadiría de inicio un contador completo de comida, un feed social amplio ni un entrenador de IA. Son productos grandes dentro del producto. Primero probaría que la gente puede completar varias sesiones seguidas y quiere seguir usándolo.

## Cambios del sistema RPG

Las reglas siguientes suelen estar implementadas tal como se diseñaron. Se cuestionan por comprensión, equilibrio o retención, no se etiquetan automáticamente como fallos de programación.

| ID | Hallazgo | Qué haría |
| --- | --- | --- |
| G01 | Cada serie por encima del récord de días anteriores recibe el bonus. Con banca previa 50×8 y seis series actuales iguales de 55×8 se obtienen seis récords y 450 XP de récord. | Una recompensa por marca de ejercicio/tipo/sesión; distinguir una nueva marca de repetirla. [Reglas](/Users/oscardlr/Desktop/Cheesit/src/lib/rewards.ts:65). |
| G02 | Cambiar el peso del perfil recalcula XP y créditos de todo el historial. En una muestra, pasar de 70 a 100 kg cambió 298 a 284 créditos. | Conservar el perfil relevante por sesión y explicar ajustes excepcionales. Una actualización real de peso no debería sentirse como perder progreso. [Referencia](/Users/oscardlr/Desktop/Cheesit/src/lib/strength.ts:97). |
| G03 | Tras gastar y borrar actividad, el saldo se limita a cero y futuras ganancias pueden absorber un déficit no visible. | Mostrar el efecto antes de borrar y un ajuste económico comprensible, sin deuda opaca. [Saldo](/Users/oscardlr/Desktop/Cheesit/src/lib/game.ts:222). |
| G04 | Cambiar la meta semanal tras cobrarla puede mostrar meta personal 5 y misión ya premiada 3. El objetivo recompensado se congela correctamente para impedir cobrar otra vez. | Separar meta actual y recompensa ya obtenida; explicar cuándo aplica una nueva meta. [Objetivo congelado](/Users/oscardlr/Desktop/Cheesit/src/lib/objectives.ts:61). |
| G05 | Las compañeras duplicadas solo aumentan el contador, sin un nuevo uso, mientras su probabilidad sigue siendo 20 %. | Protección contra repetidos, variantes cosméticas o conversión moderada. Evitar sumar otra moneda sin necesidad. |
| G06 | No existe garantía acumulativa para una recompensa deseada. Astra tiene 2 % por cofre de leyenda: 50 aperturas de media, 25.000 créditos virtuales por esa vía. Esa media no garantiza conseguirla. | Progreso visible hacia elección cosmética o protección acumulativa. No presentar el coste medio como umbral. [Cofres](/Users/oscardlr/Desktop/Cheesit/src/lib/game.ts:40), [compañeras](/Users/oscardlr/Desktop/Cheesit/src/lib/companions.ts:9). |
| G07 | La ruleta decorativa incluye rarezas imposibles para ciertos cofres; por ejemplo, comunes en el de leyenda. El premio real sí usa la tabla correcta. | Mostrar solo resultados admisibles o un efecto de revelado que no parezca representar probabilidades que no sigue. [Secuencia](/Users/oscardlr/Desktop/Cheesit/src/components/CrateOpening.tsx:22). |
| G08 | Las frases vendidas en versiones antiguas quedan ocultas, no equipables y fuera del futuro sorteo. | Migrarlas a una biblioteca permanente de frases obtenidas sin alterar movimientos económicos anteriores. Caso legacy comprobado. [Filtro](/Users/oscardlr/Desktop/Cheesit/src/components/WardrobeV3.tsx:45), [pool](/Users/oscardlr/Desktop/Cheesit/src/lib/game.ts:260). |
| G09 | Las frases que se ganan también rotan gratis diariamente; su utilidad es fijarlas como lema, escasa para un premio presentado como raro. | Hacer explícito ese valor o acompañarlas de un elemento visual distintivo. |
| G10 | Los retos de cuatro días, 50 series y todos los grupos siguen visibles aunque la persona elija un día semanal. | Adaptar el foco al plan personal; dejar retos exigentes como opciones. Evitar que completar más siempre parezca entrenar mejor. |
| G11 | Las aperturas obligatorias y sucesivas se vuelven lentas al acumular cofres; una apertura ocupa unos 5,8 s. | Apertura rápida o por lote y cofres reclamados plegados. Mantener recuperación e idempotencia. |
| G12 | Las habilidades de XP y créditos ofrecen beneficios muy diferentes y la interfaz no permite valorar fácilmente la elección. | Explicar beneficio estimado para la rutina, carga disponible y momento de consumo. Revisar el equilibrio sin añadir complejidad. |
| G13 | Nivel muscular, rangos y XP pueden parecer una medida de condición física aunque dependen de actividad registrada, aproximaciones y reglas del juego. «OTRO NIVEL.» también aparece sin haber subido de nivel. | Nombrar el nivel muscular como actividad registrada; reservar mensajes de ascenso real para ese evento y mostrar entrenamiento completado en el resto. |

La siguiente ampliación del juego debería dar una decisión o una historia al progreso: elegir un objetivo, completar una pequeña campaña o cooperar en un reto. Más objetos aislados no garantizan más motivación. Añadiría más opciones de avatar y acompañantes si se busca ampliar el público más allá de la estética actual.

## Comparación con la competencia

| Referencia | Funciones publicadas relevantes | Situación de Cheesit y lección |
| --- | --- | --- |
| [Hevy](https://www.hevyapp.com/features/) | Descanso automático, notas, valores previos, RPE, superseries, tipos de serie, gráficos/medidas y funciones sociales. | Cheesit cubre el registro básico y tiene una identidad RPG más marcada. La prioridad competitiva es comodidad entre series y seguimiento, antes de un feed social. |
| [Strong](https://www.strong.app/) | Temporizadores, superseries, RPE, calculadora de calentamiento, gráficos, medidas, exportación CSV e integración con Apple Health. | Referencia para quitar fricción al registro. Cheesit necesita más profundidad práctica y portabilidad. |
| [Fitbod](https://fitbod.me/faqs/) | Planes que se adaptan a objetivos, rendimiento y material, referencias de recuperación, demostraciones y alternativas. | Cheesit registra y recompensa; todavía no prescribe un programa adaptativo. La brecha es grande y no se resuelve añadiendo un chatbot. |
| [Liftosaur](https://www.liftosaur.com/features) | Programas con reglas de progresión, superseries/series temporizadas, gráficos, sync/offline y portabilidad JSON/CSV. | Enseña el valor de un plan que evoluciona con los datos. Empezaría por progresión simple y explicable, sin copiar toda su complejidad. |
| [GYM RPG](https://gymrpg.app/) | Registro, planificación, equipo/personaje, grupos, jefes cooperativos, mascotas y nutrición. | Es competencia directa del concepto. XP y equipo ya existen en la categoría; Cheesit debe destacar por claridad, sensación de progreso y calidad del registro. |

Las funciones de competidores pueden depender de plataforma o plan. La tabla compara capacidades anunciadas, no afirma que todas sean gratuitas ni demuestra cuál funciona mejor. Las conclusiones sobre qué debería copiar Cheesit son mi valoración.

La oportunidad que veo es un registro de fuerza rápido, claro y fiable, con progreso RPG que acompañe al entrenamiento. Conservaría la estética de Cheesit, simplificaría sus primeras pantallas y reforzaría tres cosas que el usuario nota en cada sesión: escribir menos, encontrar su última marca y confiar en que el historial permanece.

## Orden recomendado de trabajo

| Fase | Entrega | Condición para pasar a la siguiente |
| --- | --- | --- |
| 1 Datos y coherencia | B01–B10, errores de guardado visibles, recuperación de borradores, importación fiable y actualización offline | Toda copia propia restaura; no se sobrescriben pestañas; todas las sesiones son accesibles; cifras y objetivos coherentes |
| 2 Entrenar mejor | Descanso, última sesión reutilizable, rutinas con objetivos, notas, reordenar/sustituir y varias sesiones por día | Sesión completa con pocas acciones, recarga/segundo plano probados y registro cómodo en teléfonos reales |
| 3 Entender el progreso | Gráficos, marcas, volumen muscular, búsqueda y objetivos personalizados | Las cifras se explican y enlazan con las sesiones que las originan |
| 4 Simplificar RPG y acceso | Foco en pocos retos, equipamiento claro, protección contra duplicados, apertura rápida, cuenta/sync validada | Reglas comprensibles y conservación del historial entre dispositivos, con conflictos resueltos |
| 5 Ampliar con evidencia | Compartir, retos cooperativos, integraciones y nuevas campañas | Pruebas con usuarios justifican la siguiente función |

No usaría estimaciones de calendario sin acordar equipo, alcance y disponibilidad. Para evaluar el resultado mediría tiempo de registrar una serie, sesiones completadas sin errores, éxito de restauración y retorno tras varias semanas, además de recoger observaciones de uso real.

## Criterios de aceptación prioritarios

1. Exportar e importar en una instalación vacía conserva historial, borradores, rutinas, perfil, preferencias, colección, aperturas y cargas.
2. Datos incompletos de un borrador nunca invalidan todo el respaldo; las series confirmadas siguen exigiendo validación estricta.
3. Dos pestañas no producen pérdidas silenciosas y un error de persistencia permite recuperar o exportar lo pendiente.
4. Cada borrador se encuentra desde Resumen y su fecha, o la app impide crear un segundo de forma clara.
5. Los valores de series previstas son enteros y el volumen usa una convención documentada por modalidad.
6. Evolución compara entrenamientos diferentes; copiar valores crea o rellena filas de forma predecible.
7. Las metas usan la misma unidad de días en Resumen y Objetivos, también con varias sesiones importadas.
8. Movimiento reducido ofrece una apertura estática y los textos importantes se leen con zoom en móvil.
9. Se verifica arranque offline después de una visita completa y después de actualizar, manteniendo una sesión pendiente.
10. Pruebas de navegador estables, además de comprobaciones en Safari/iPhone y Android reales antes de afirmar compatibilidad completa.

El prompt de implementación está en [PROMPT-MEJORA-CHEESIT.txt](/Users/oscardlr/Desktop/Cheesit/docs/PROMPT-MEJORA-CHEESIT.txt).
