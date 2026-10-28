# Equipo, compañeras y habilidades V3

## Decisiones acordadas

El usuario eligió una habilidad activa, una carga por entrenamiento finalizado y cuatro compañeras adultas originales: atleta, guerrera, hechicera y reina dragón. La apariencia se conserva para siempre; las cargas funcionales se agotan y los duplicados las suman.

## Aspecto y habilidad son independientes

Revelar una pieza desbloquea su apariencia por identificador de catálogo. Puede usarse aunque se agoten sus cargas. `cosmeticGear` guarda una pieza por ranura de aspecto; la habilidad activa guarda otro identificador y no depende de la ropa visible. Las copias anteriores se migran desde las ranuras antiguas sin borrar inventario ni ventas históricas.

Los desbloqueos se derivan de todos los objetos revelados, incluidas copias vendidas. Un objeto de una apertura pendiente todavía no desbloquea aspecto, compañera ni cargas. No existe un segundo premio al cerrar la animación: se conserva el sorteo original.

Aspectos reúne ropa y compañeras en una sola colección, ordenada de legendario a común y con la compañera antes del equipo de cada rareza. Se puede filtrar por cabeza, torso, piernas, manos, espalda o compañera, además de ver todos los aspectos. Pulsar una ranura del armario abre Aspectos con ese filtro y lleva la vista a la selección; los controles para quitar piezas y cambiar compañera siguen siendo independientes. Las compañeras se equipan desde su tarjeta de aspecto y conservan la misma selección que el inventario y el armario.

Al final de cada filtro se muestra siempre la galería de aspectos pendientes, con su imagen en blanco y negro y el distintivo «Sin desbloquear». Las tarjetas pendientes no se pueden equipar. Los aspectos de ventas históricas siguen disponibles y una recompensa todavía sin revelar permanece bloqueada.

## Inventario y objetos permanentes

Los objetos obtenidos no se pueden vender: equipo, frases y compañeras permanecen en el inventario. Las copias de equipo y compañeras de un mismo identificador de catálogo se muestran en una sola tarjeta con un contador superior (`2x`, `3x`, etc.) cuando hay más de una. Cada frase solo puede obtenerse una vez y nunca muestra contador; sus duplicados históricos se agrupan en una sola tarjeta sin borrar objetos ni transacciones guardadas. La agrupación respeta los filtros de tipo y rareza y permite equipar o quitar el objeto desde su tarjeta. Las frases distintas se mantienen separadas aunque compartan nombre o rareza.

Las cantidades excluyen los objetos de aperturas pendientes y las copias vendidas en versiones anteriores. El historial de esas ventas y sus créditos se conserva al cargar o importar copias antiguas, pero ya no se crean ventas nuevas.

## Cargas y equilibrio

| Rareza | Bonus específico | Límite de XP por sesión | Cargas por copia |
| --- | ---: | ---: | ---: |
| Común | 3 % | 20 XP | 1 |
| Rara | 6 % | 35 XP | 1 |
| Épica | 10 % | 60 XP | 1 |
| Legendaria | 15 % | 100 XP | 1 |

Las habilidades que benefician todos los grupos usan la mitad del porcentaje, porque tienen más oportunidades de activarse. Los pantalones benefician pierna y glúteo; las espadas, martillos y guanteletes benefician bíceps y tríceps; otras piezas se orientan a empuje, tirón o experiencia general. Bláster y manto solar legendarios otorgan 40 créditos extra al terminar una sesión válida.

La habilidad se elige antes de iniciar un entrenamiento y se guarda en esa sesión. Solo se consume una carga cuando se finaliza con al menos una serie válida beneficiada. Un borrador, una sesión sin habilidad o entrenar otros grupos no consume nada. Los bonus de XP se calculan sobre las series válidas, se redondean a puntos enteros con un mínimo de un punto por serie beneficiada y se limitan por sesión.

Cada copia revelada, incluida la primera, añade exactamente una carga, sin diferencias por pieza ni rareza. Las cargas disponibles son `copias reveladas − usos ordinarios`. Las ventas históricas no vuelven a sumar ni restan cargas ya obtenidas. Agrupar copias visualmente conserva sus cargas.

Las partidas anteriores se migran a `abilityChargeVersion: 1`. Los usos extra que fueron válidos con el antiguo reparto de 3, 4 o 5 cargas se conservan por su identificador en `legacyAbilityUseIds`: sus recompensas no se borran ni vuelven a cobrarse y tampoco crean deuda sobre los siguientes duplicados. Cada nueva copia sigue aportando una carga inmediatamente. La validación de partidas actuales impide consumir más cargas ordinarias que copias disponibles.

## Objetivos y experiencia

Hay 52 objetivos: 17 semanales y 35 de trayectoria. Incluyen días de entrenamiento, series, repeticiones, ejercicios distintos y trabajo por grupo muscular, con entre 50 y 1.200 XP por objetivo. «A tu ritmo» solo pregunta por días de entrenamiento a la semana; los retos de series tienen umbrales fijos.

Cada objetivo completado registra una única recompensa en `missionRewards`, con identificador, XP, meta alcanzada y fecha. Los identificadores semanales incluyen el lunes de Europe/Madrid; los de trayectoria son permanentes. Las recompensas se conceden automáticamente al finalizar, editar, cargar o importar actividad válida. Editar, borrar, recargar, cambiar la meta o reimportar una copia no vuelve a conceder la misma recompensa. Un entrenamiento de una semana anterior puede completar sus retos pendientes. La XP de objetivos cuenta para el nivel global, los créditos y los cofres de nivel; la XP muscular sigue procediendo de las series.

Las sesiones nuevas usan automáticamente el verde de la interfaz (`#d8ff3e`), incluso al empezar desde una rutina. El inicio y el editor del entrenamiento ya no incluyen selector de color. Se conservan los colores históricos y la personalización de las rutinas.

## Historial sin premios retroactivos

Al finalizar se guardan juntos la recompensa y un evento de consumo por identificador de entrenamiento. Repetir la finalización, recargar o importar no vuelve a gastar ni cobrar. Cambiar la habilidad activa o la apariencia no modifica entrenamientos anteriores.

El bonus queda congelado en `Workout.abilityReward`; cada serie conserva su porción de XP. Los músculos también reciben ese bonus con su participación primaria o secundaria. Editar o eliminar una serie puede retirarla del XP calculado, pero no devuelve una carga ya utilizada. Eliminar una sesión deja de aportar XP y créditos de esa sesión; el consumo permanece para evitar reutilizarlo indefinidamente. Restaurar la misma sesión recupera el premio original sin otro consumo.

## Catálogo y compañeras

El catálogo conserva las doce piezas originales y añade ocho de atlas mítico: corona del fénix, armadura celestial, tirantes de tormenta, grebas del vacío, pantalones mecánicos, martillo del trueno, guantelete estelar y manto solar.

Los cofres comprados sortean primero la rareza y después el tipo de premio: **55 % equipo, 25 % frases y 20 % compañeras** mientras queden frases nuevas de esa rareza. El sorteo de frases excluye todos los identificadores ya obtenidos, incluidas ventas antiguas, cartas sin campo `kind` y recompensas reservadas. Si ya se han conseguido todas las frases de la rareza sorteada, su 25 % pasa a equipo de esa misma rareza; la rareza y su probabilidad no cambian. Cada rareza tiene su compañera adulta. Las recompensas de nivel siguen garantizando equipo. Las compañeras son cosméticas, tienen una selección independiente y permanecen desbloqueadas para siempre.

## Compatibilidad y validación

Los campos nuevos son opcionales en datos antiguos. Se validan catálogo, ranura, copias reveladas, bonus máximos, mapas de series, identificadores únicos y un solo consumo por entrenamiento. Los usos no pueden superar las cargas que las copias reveladas ya habían aportado en su fecha. Las copias de seguridad deben conservar y reconciliar también los eventos de consumo, evitando mezclar ramas de gasto independientes.

## Pruebas

Las pruebas cubren apariencia permanente, selección de habilidad independiente, bonus por grupo, una carga por finalización, ausencia de consumo sin beneficio, duplicados acumulables, cargas agotadas, XP muscular, créditos al finalizar, exclusión al borrar historial, premios congelados, datos alterados y compañeras pendientes que no se pueden equipar. El inventario se comprueba con copias de equipo, frases y compañeras, filtros, cantidades tras recargar, exclusión de ventas históricas y aperturas pendientes, y ausencia de controles de venta.

Las pruebas cubren también el catálogo pendiente en gris, la carga única por copia, la migración del consumo antiguo, los objetivos con XP permanente y los entrenamientos verdes. El armario vacío y las tres secciones con veinte piezas y cuatro compañeras se comprueban a 320, 390, 768 y 1440 px, junto con TypeScript y la compilación de producción.

El aviso de mancuernas usa la misma tabla de ejecución que el cálculo de XP: pares bilaterales suman ambas cargas; curl alterno, remo y una sola mancuerna no duplican la carga. El E2E registra 20 kg por mancuerna en press inclinado, verifica 57 XP y conserva el dato de 20 kg al recargar.

Arte generado y prompts completos: [RECURSOS-ARCADE-V3.md](RECURSOS-ARCADE-V3.md). Los movimientos y auras son animaciones CSS locales; el modo de movimiento reducido las detiene.
