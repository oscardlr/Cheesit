# GRIND: gimnasio en modo RPG

Esta es la especificación de la primera versión. La actualización de cofres, personaje y XP variable está en [EVOLUCION-ARCADE-V2.md](EVOLUCION-ARCADE-V2.md).

Documento del pedido, escrito antes de la implementación. Fecha: 27 de octubre de 2026.

## 1. Dirección visual y sensaciones

Mantener la identidad oscura, lima y violeta de GRIND. Añadir una capa arcade pixel art: atleta fuerte, press de banca al entrar, ascenso por escaleras, cofres y frases como cartas coleccionables. Animar navegación, botones, selección, barras de progreso, confirmación de series, logros y recompensas. Las acciones deben responder al instante.

## 2. Sonidos para las acciones

Sonidos distintos para pulsación, confirmación, error, XP, récord, subida de nivel y apertura de caja. Usar síntesis local con Web Audio para que funcionen sin conexión. Activar audio tras una interacción del usuario, con interruptor global persistente. Mantener control independiente de efectos y respetar movimiento reducido.

## 3. XP y niveles mejorados

El progreso se calcula a partir de series válidas confirmadas y entrenamientos guardados. Base: 50 XP por serie y 200 XP al terminar una sesión. Añadir bonificaciones por récords y variedad de grupos entrenados. Los niveles necesitan progresivamente más XP: primer nivel 1.000 XP y 250 XP más por cada nivel siguiente. Mostrar rango, XP actual, siguiente nivel y camino de ascenso con cofres.

La recompensa nunca depende de introducir kilos desproporcionados. Editar o volver a confirmar una misma serie no permite cobrar dos veces. Las sesiones y series eliminadas dejan de contribuir al XP calculado. Los créditos gastados y cartas obtenidas se conservan como transacciones locales.

## 4. Celebración de cada serie

Al confirmar repeticiones y carga válidas: confirmación visual, XP que cuenta hacia arriba, combo de series, pulso, partículas y sonido breve. Si es récord comparable con una sesión anterior, destacar el récord. No impedir seguir introduciendo series. Un error de validación también debe tener respuesta visual y sonora.

## 5. Final de entrenamiento: jackpot

Ventana de victoria con contador ascendente, desglose de XP de la sesión y bonificaciones, créditos obtenidos, animación del atleta, zoom de entrada, destellos, confeti y fanfarria. Diferenciar XP ya ganado en las series del nuevo bonus de finalizar para que el total sea comprensible. Permitir cerrar inmediatamente.

## 6. Subidas de nivel

Detectar los niveles cruzados al confirmar series y terminar sesiones. Mostrar el nuevo nivel, rango y una escena del atleta ascendiendo escaleras hacia un cofre. El camino de niveles debe seguir accesible desde el centro de progreso.

## 7. Objetivos y logros

Sección de misiones con progreso real: constancia semanal, series, variedad muscular y primeras sesiones. Permitir definir objetivos personales semanales de sesiones y series. Añadir logros persistentes o calculados desde el historial, hitos y una vista de actividad. Celebrar el cumplimiento sin incentivar entrenar un músculo fatigado ni penalizar el descanso.

## 8. Mapa del cuerpo

Apartado propio con silueta anterior y posterior y músculos seleccionables. Colorear según las series confirmadas recientes, con selector de período. Detalle de series, repeticiones y última sesión por zona. Distinguir pecho, espalda, hombros, bíceps, tríceps, abdominales, cuádriceps, isquiotibiales, glúteos y gemelos. Los ejercicios conocidos se asignan de forma explícita; los personalizados usan su grupo como aproximación indicada.

El color representa actividad registrada, no crecimiento muscular ni un diagnóstico de recuperación. Acompañar color con números y leyenda.

## 9. Motivación diaria

Una frase diferente según el día de Madrid, estable al recargar. Mostrarla en el resumen y permitir destacar una frase de la colección. Incluir mensajes de técnica, constancia y descanso.

## 10. Créditos, cajas y colección

El XP también genera créditos virtuales. Abrir cofres con una ruleta horizontal, desaceleración, marcador central y revelación de carta. Coleccionar frases originales con rarezas común, rara, épica y legendaria; mostrar probabilidades y valor de venta. Vender cartas por créditos y volver a comprar cofres. Posibilidad de destacar una carta como lema.

Economía solo dentro de la app, sin compras ni dinero real. Saldo calculado y validado; no permitir saldo negativo ni vender dos veces una carta. Cobrar y adjudicar la carta en una sola actualización antes de reproducir la animación, para que recargar no duplique ni pierda premios.

## 11. Personaje e imágenes generadas

Generar arte raster original de un atleta musculoso en pixel art con poses de banca, victoria y ascenso. Guardar los recursos en public/assets y reutilizarlos en introducción, recompensas y escalera. Animar las imágenes con transformaciones y secuencias CSS. Documentar herramienta y prompts utilizados.

## 12. Persistencia y compatibilidad

Conservar entrenos, rutinas, ejercicios y copias actuales. Añadir estado de juego opcional al formato local para aceptar datos antiguos. Incluir economía, colección, objetivos y preferencias en las copias compatibles. No modificar credenciales, sincronización remota ni publicar cambios como parte de este pedido.

## 13. Criterios de aceptación

- Entrenar, confirmar series, guardar y recargar funciona con los datos existentes.
- Cada acción interactiva ofrece feedback; sonido y efectos se pueden desactivar.
- El XP, los niveles y los créditos coinciden con las reglas documentadas.
- Confirmar, editar y recargar no permite duplicar recompensas.
- Las ventanas de XP cuentan hacia arriba y las subidas de nivel muestran la escalera.
- Objetivos, mapa corporal, motivación, cofres, inventario y ventas funcionan con datos reales.
- Las cajas indican coste, probabilidades y saldo; persisten antes de animarse.
- La interfaz funciona en móvil y escritorio, con teclado y movimiento reducido.
- Verificar TypeScript, pruebas de dominio, compilación y flujos de navegador.

## Registro de implementación

Implementado en la app local. Acceso desde «Arcade», el saldo de créditos o la insignia de nivel. Recursos y prompts exactos: [RECURSOS-ARCADE.md](RECURSOS-ARCADE.md).

### Dominio y reglas definitivas

- XP: 50 por serie válida confirmada, incluyendo borradores; al terminar, 200 adicionales, 100 por trabajar al menos tres grupos principales y 75 por cada serie que supere una marca comparable de una fecha anterior. Varias series de récord en la misma sesión pueden dar 75 cada una; cada serie figura una sola vez en el cálculo. No se premia un primer intento sin referencia. Editar o eliminar recalcula todo el progreso.
- Niveles: para pasar del nivel `n` al siguiente se necesitan `1.000 + 250 × (n − 1)` XP. Los inicios de niveles son 0, 1.000, 2.250 y 3.750 XP. El cálculo de récords indexa máximos históricos por ejercicio, modalidad y condición comparable; no compara una sesión con otra de la misma fecha.
- Créditos virtuales: `máximo(0, 100 de bienvenida + suelo(XP total / 5) + movimientos de compras y ventas)`. Los 100 de bienvenida se aplican una sola vez en la fórmula, sin transacción repetible al recargar o importar. Si se elimina XP después de gastar, se conserva el gasto y el saldo visible queda en cero; las ganancias siguientes compensan primero la diferencia pendiente.
- Cofres: hierro cuesta 100 créditos, energía 250 y leyenda 500. Probabilidades común/rara/épica/legendaria: 70/23/6/1 %, 35/43/18/4 % y 0/55/35/10 %, respectivamente. La aleatoriedad usa `crypto.getRandomValues`. Venta por rareza: 20, 60, 150 y 400 créditos. No hay compras con dinero real ni conversión de créditos a dinero.
- Cada apertura produce una carta identificada y su cargo en una misma actualización de estado. Cada venta produce una sola transacción asociada a la carta; volver a venderla no cambia el saldo. La última copia vendida de un lema destacado lo desactiva.
- Persistencia: `AppData.game` es opcional y los datos anteriores siguen siendo válidos. Las copias incluyen inventario, movimientos, lema y objetivos. La validación exige costes y valores de venta exactos, identificadores únicos, correspondencia entre cartas y compras y ausencia de ventas duplicadas. Importar la misma copia es idempotente. Importar una copia antigua conserva el juego actual. Dos ramas con gastos independientes generan un conflicto explícito y no se mezclan automáticamente.
- Objetivos: días de entrenamiento terminado distintos (1–7 por semana), series terminadas (1–200 por semana) y cuatro grupos principales. Los logros se calculan desde el historial: primera sesión, diez y cincuenta sesiones, cien series, siete grupos y nivel cinco.
- Mapa muscular: cada serie primaria cuenta una unidad y cada participación secundaria, media unidad. Se incluyen series válidas confirmadas de sesiones terminadas y borradores dentro del período. El catálogo tiene asignaciones explícitas; un ejercicio personalizado utiliza su grupo como aproximación marcada. Las cifras representan actividad registrada y no recuperación ni crecimiento.
- Pruebas de dominio añadidas: progresión y récords, cargo y premio juntos, venta idempotente, saldo tras borrar historial, compensación con XP futuro, probabilidades, frase diaria, misiones, mapa, restauración y conflictos de economía.
- Preferencias en copias: `AppData.preferences` conserva los booleanos de efectos y sonido. Al restaurar una copia con preferencias, se aplican las importadas; una copia antigua sin ellas conserva las actuales. Se rechazan valores de otro tipo.

### Experiencia y comprobación

- Intro de banca con cuatro fotogramas generados y poses de victoria, reposo y ascenso. Recursos locales incluidos en la caché PWA.
- Audio arcade local en las acciones, partículas, confeti, zoom, XP ascendente y créditos. Los nuevos logros y misiones aparecen también en la victoria de sesión. Sonido y efectos se pueden desactivar.
- El bonus de finalizar se muestra separado del XP de series ya ganado. Añadir una sesión retroactiva puede recalcular récords posteriores; el popup explica ese ajuste y muestra el cambio real de créditos con su signo.
- La compra reserva el saldo inmediatamente, guarda carta y cargo antes de animar y no reaplica copias antiguas de los entrenos después de esperar al disco. Salir de la pantalla durante el guardado no revierte otros cambios.
- Verificados TypeScript, compilación de producción, 22 pruebas de dominio y 10 pruebas de navegador. Los flujos cubren guardar/recargar entrenos, secuencia de banca y movimiento reducido, silencio y efectos, objetivos, mapa muscular, subir de nivel, interrumpir una ruleta y vender una carta una sola vez.
- Revisión visual de móvil y escritorio; 24 combinaciones de pantalla y tamaño entre 320 y 1440 px sin desbordamiento horizontal.
