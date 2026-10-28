# Cofres, equipamiento y recompensas por nivel

Documento de la versión 2. La versión actual amplía el botín con compañeras, aspectos permanentes y habilidades: [EQUIPO-V3.md](EQUIPO-V3.md).

Actualización del 27 de octubre de 2026. Amplía la colección de frases sin borrar cartas, ventas ni créditos guardados.

## Recompensas de los cofres

Cada cofre comprado sortea primero la rareza según sus probabilidades visibles y después el tipo de contenido, de forma independiente: **70 % de equipamiento y 30 % de frases**. Todas las rarezas tienen ambos tipos de contenido. Un objeto de la rareza elegida se selecciona uniformemente de su catálogo. Los sorteos usan `crypto.getRandomValues`.

Los tres cofres mantienen los costes de 100, 250 y 500 créditos. Las probabilidades común/rara/épica/legendaria siguen siendo 70/23/6/1 %, 35/43/18/4 % y 0/55/35/10 %. Los valores de venta por rareza son 20/60/150/400 créditos para ambos tipos. Las piezas pueden repetirse; cada copia tiene su propio identificador y puede venderse una vez.

## Apertura sin revelar el contenido antes de tiempo

Una compra guarda de forma atómica el cargo, el objeto sorteado y `pendingOpening`. No hay un segundo sorteo al finalizar la animación. Mientras la apertura esté pendiente, ese objeto no se puede vender ni equipar, y no se permite iniciar otra apertura.

La máquina de estados es:

1. `spinning`: cinco segundos de ruleta de rarezas, con arranque a velocidad extrema y frenada progresiva hasta el marcador. La cinta recorre unas 192 tarjetas con desaceleración cúbica y desenfoque horizontal proporcional a la velocidad, que desaparece al detenerse. El punto de parada varía dentro de la tarjeta ganadora, hasta cerca de sus bordes, y se conserva al recargar. Los clics mecánicos siguen el paso de las tarjetas y terminan con un golpe de llegada; respetan el ajuste de sonido, independientemente de los efectos visuales. `SPIN_DURATION_MS = 5000`. No se muestra contador ni barra de tiempo.
2. `revealing`: la caja se abre automáticamente durante 800 ms antes de descubrir el contenido. `REVEAL_DURATION_MS = 800`. No hace falta pulsar un botón para revelar el premio.
3. `completeOpening` elimina el estado pendiente y permite equipar o vender el premio.

El estado antiguo `rarity` sigue siendo válido al recuperar datos y avanza automáticamente a `revealing`. El giro y el movimiento de apertura se actualizan con `requestAnimationFrame`, de modo que funcionan aunque estén desactivados los efectos generales. Por petición expresa del usuario, el giro y su desenfoque conservan el mismo recorrido rápido de cinco segundos incluso con movimiento reducido del dispositivo. Este ajuste sigue reduciendo el movimiento de la tapa y elimina sacudidas y destellos decorativos.

Los helpers de dominio rechazan avances prematuros. `startedAt` y `revealStartedAt` se guardan como fechas ISO para recuperar la fase después de cerrar o recargar. La interfaz excluye el objeto pendiente de la colección y del personaje, para evitar que navegar entre secciones revele el resultado.

## Personaje y piezas

El personaje base lleva camiseta básica de tirantes y ropa interior; las piezas desbloqueadas se superponen en la misma estética pixel art violeta y lima. Hay cinco ranuras: cabeza, torso, piernas, accesorio de mano y espalda. `equippedGear` guarda identificadores de copias del inventario, no identificadores del catálogo.

Catálogo y posición en el atlas de cuatro columnas y tres filas, en orden de lectura:

| Índice | Objeto | Ranura | Rareza |
| --- | --- | --- | --- |
| 0 | Tirantes neón violeta | Torso | Rara |
| 1 | Pantalones lima GRIND | Piernas | Común |
| 2 | Pantalones furia carmesí | Piernas | Rara |
| 3 | Cabeza del dragón neón | Cabeza | Legendaria |
| 4 | Corona del campeón | Cabeza | Épica |
| 5 | Auriculares de concentración | Cabeza | Común |
| 6 | Espadón del titán | Mano | Épica |
| 7 | Bláster de plasma | Mano | Legendaria |
| 8 | Capa de la constancia | Espalda | Rara |
| 9 | Alas de ascenso neón | Espalda | Legendaria |
| 10 | Armadura del hierro dorado | Torso | Épica |
| 11 | Camiseta de entrenamiento | Torso | Común |

Equipar otra copia de la misma ranura reemplaza la anterior. Vender una pieza equipada vacía su ranura y no afecta a las demás. La espada y el bláster son accesorios ficticios de arcade.

## Un cofre gratuito por nivel

Desde el nivel 2, cada nivel alcanzado desbloquea su propio cofre gratuito, identificado como `level:N`. Estos cofres garantizan una pieza de equipamiento. Las aperturas registran una transacción `level-crate` de importe cero con `sourceLevel`, de forma que recargar, importar una copia, bajar de nivel al eliminar historial y volver a subir no entrega dos veces el mismo cofre.

- Niveles normales: común `máximo(20, 60 − 2 × nivel)`, épica `mínimo(25, 8 + suelo(nivel / 3))`, legendaria `mínimo(10, 1 + suelo(nivel / 8))`; rara completa el 100 %.
- Cada cinco niveles: 0/60/32/8 %, garantizando rareza rara o superior.
- Cada diez niveles: 0/0/70/30 %, garantizando rareza épica o legendaria.

No se puede reclamar un nivel superior al obtenido con el historial y perfil actuales. Una reclamación ya realizada se conserva en el libro de movimientos, incluso al vender el objeto.

## Compatibilidad y pruebas

Las cartas antiguas conservan `quoteId` y pueden no llevar `kind`. Las nuevas piezas usan `kind: 'gear'` y `gearId`; una recompensa no puede contener simultáneamente frase y equipamiento. Los campos de equipo y apertura son opcionales en los datos antiguos y el normalizador los rellena sin resetear el inventario.

La validación comprueba pertenencia al catálogo, rareza, coste, ranura, propiedad de la instancia, venta única, correspondencia del cofre de nivel y reclamaciones repetidas. Las pruebas de dominio cubren ambos tipos por cada rareza, los límites temporales de la apertura, recuperación de pendientes, venta/equipamiento bloqueados antes de revelar, migración de frases, equipo por ranuras y cofres de nivel que no se pueden reclamar dos veces.
