# Evolución arcade V2

## Pedido

1. Apertura de cofres con una ruleta visible de cinco segundos, sin contador ni barra de tiempo. En la cinta solo aparecen rarezas; al detenerse, una apertura automática de 800 ms descubre el premio.
2. Personaje personalizable en Resumen, inicialmente con camiseta básica y bóxer. Las cajas pueden dar tanto frases como prendas y accesorios fantásticos, manteniendo la estética pixel art violeta/lima.
3. Un cofre especial gratuito por cada nivel alcanzado desde el nivel 2, canjeable una sola vez.
4. XP variable por repeticiones, carga relativa y mejora de marcas personales. Perfil inicial: hombre de 20 años, 70 kg y 180 cm.
5. Cada músculo tiene XP y nivel propios, calculados con su participación en el historial completo.

## Aperturas y conservación de premios

El giro dura cinco segundos, arranca a velocidad extrema y frena hasta situar la tarjeta ganadora bajo el marcador central. No hay contador ni barra de tiempo. La caja se abre automáticamente con una animación de 800 ms y después se muestra el contenido, sin una pulsación adicional. No se enseñan frases ni equipo durante la ruleta. El giro y la apertura funcionan también con los efectos generales desactivados; ese interruptor controla destellos y adornos. Por petición expresa del usuario, la velocidad y el desenfoque de la ruleta son iguales con movimiento reducido del dispositivo; la apertura mantiene el movimiento más suave de la tapa, sin sacudidas ni destellos.

El coste, el premio y la apertura pendiente se conservan juntos. Recargar o salir no permite volver a sortear ni revela el objeto antes del paso correspondiente. Las aperturas antiguas guardadas en `rarity` continúan automáticamente con la apertura de la caja. Los objetos pendientes no se pueden vender ni equipar. La colección anterior y las copias antiguas siguen siendo compatibles.

## Personaje y colección

Ranuras de cabeza, torso, piernas, mano y espalda. Se puede equipar una pieza por ranura, quitarla y venderla. El lema motivacional se conserva como opción independiente. Las cajas normales mezclan equipo y frases; las de nivel garantizan equipo. El avatar utiliza arte generado local y capas de equipo.

## Referencias de XP

Los puntos son una regla del juego. El peso corporal y el ejercicio sirven para normalizar las cargas y el historial aporta la comparación personal. La edad, altura y sexo se guardan en el perfil; no se inventan medias ni percentiles de personas con ese perfil exacto. Las fórmulas y fuentes se documentan en [PROGRESION-V2.md](PROGRESION-V2.md).

Los niveles musculares representan progreso del registro y no una medida fisiológica de crecimiento o recuperación. La actividad reciente conserva su selector de período, mientras el nivel usa el historial completo.

## Verificación prevista

- Datos, ventas, equipamiento y copias anteriores conservados.
- Movimiento real durante cinco segundos, sin contador, y apertura automática de 800 ms antes de revelar el contenido.
- Efectos generales desactivados y movimiento reducido conservan el giro; los datos antiguos en `rarity` continúan automáticamente.
- Recarga durante el giro y reapertura sin cobros ni sorteos duplicados.
- Cofres de nivel únicos incluso al borrar, editar o recuperar sesiones.
- Avatar inicial, capas y retirada/venta de equipo.
- XP coherente entre serie, resumen, saldo y músculos.
- TypeScript, pruebas de dominio, compilación y flujos de navegador con efectos activados y desactivados.

## Implementación

- Personaje y doce piezas originales: [recursos y prompts](RECURSOS-ARCADE-V2.md).
- Fórmulas, límites, perfil y fuentes: [progresión adaptativa](PROGRESION-V2.md).
- Probabilidades, valores de venta, estados de apertura y cofres gratuitos por nivel: [reglas de botín](LOOT-V2.md).
- La pregunta sobre mancuernas se resolvió con el usuario: registra el peso de una sola mancuerna. La barra incluye su propio peso y los discos.
- El resumen, los pop-ups, el saldo y los músculos utilizan el mismo cálculo de XP. Las prendas se guardan por copia del inventario y se retiran de su ranura si se venden.
- El perfil y las aperturas pendientes se incluyen en las copias; los movimientos y cartas antiguos se conservan.

## Resultado de la verificación original

Estos resultados corresponden al flujo anterior de once segundos con revelación manual. Los requisitos actuales de cinco segundos y apertura automática se describen arriba.

- 40 pruebas de dominio pasan.
- 13 flujos de navegador pasan; tras corregir la posición del modal se repitieron los cinco flujos de gamificación, todos correctos.
- Giro real cronometrado de al menos 10,5 segundos, contenido oculto tras recargar, marcador alineado a menos de dos píxeles y ventana dentro del viewport comprobados.
- Efectos generales desactivados conservan el giro. Movimiento reducido mantiene once segundos y requiere revelar el contenido.
- Equipar, quitar, vender y recargar conserva las otras ranuras; comprobación visual del personaje inicial y cinco piezas combinadas en móvil y escritorio.
- Perfil, objetivos, XP global y muscular, cofres de nivel, copias y registros anteriores verificados. TypeScript y compilación de producción correctos.
