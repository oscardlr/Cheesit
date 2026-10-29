# Personaje y cosméticos: bloque 2

El catálogo mantiene sus 35 identificadores y las reglas de equipamiento existentes. Cada ranura admite una pieza o vacío: cabeza 7+1, torso 8+1, piernas 7+1, mano 7+1 y espalda 6+1. El producto permite 32.256 conjuntos. Las cuatro compañeras existentes y la opción vacía permiten 161.280 composiciones de grupo. El inventario desbloqueado limita las opciones de cada partida; no hay exclusiones entre ranuras.

## Arte y registro

`src/lib/character-art.ts` centraliza el maestro `base-v1`, marco, anclajes, máscaras y orden de dibujo. `character-assets.json` registra recortes y posiciones del atlas transparente `public/assets/character/wardrobe-v2.png`. Las miniaturas y prendas equipadas leen la misma definición.

Se reutiliza el maestro original. Hay 16 ilustraciones nuevas realizadas sobre ese maestro: las ocho prendas de torso, las siete de piernas y el guantelete estelar. Se reutilizan los otros 19 cosméticos y las cuatro compañeras, con recortes aislados y escalado uniforme. No hacen falta variantes conjuntas. El maestro y el atlas son dos PNG en ejecución; agrupar las prendas en un atlas no reduce sus 35 ilustraciones independientes.

Las capas de espalda quedan detrás del cuerpo; las prendas lo cubren; los broches de las capas y las manos sobre los objetos sujetos usan máscaras explícitas. Las prendas nuevas mantienen su escala dibujada 1:1. No se estiran iconos genéricos ni se escala el cuerpo según el nivel. Si falla una prenda se conserva el aspecto básico; si falla el maestro se muestra una silueta estable, sin cambiar el marco.

## Movimiento e inspección

Las cinco opciones conservan sus identificadores y mueven la pose completa con desplazamientos y giros pequeños. El cuerpo y el equipo comparten una única transformación. No se articulan recortes de una ilustración plana. Pausa, efectos desactivados y `prefers-reduced-motion` mantienen una pose estática. Ascenso conserva la ilustración completa y anima su brillo; el banco usa una pose íntegra en lugar del filmstrip desregistrado.

En desarrollo, `/dev/character` permite combinar todas las ranuras y las cuatro compañeras, recorrer los índices de los 32.256 conjuntos, revisar cada prenda y las interacciones de mayor riesgo. Usa fixtures en memoria, sin modificar la partida. En producción devuelve 404.

```sh
npm test
npm run typecheck
npm run build
node --import tsx scripts/verify-character-combinations.ts
```

El verificador compone los 32.256 conjuntos y genera hojas locales bajo `docs/block-two/` para revisar prendas y pares de ranuras. Esos resultados y los originales de generación no son dependencias de ejecución ni se incluyen en la publicación. Las pruebas de navegador relevantes son `character-block-two`, `character-motion`, `character-v2`, `ascent-visual` y `arcade-visual`.

## Futuras etapas físicas

Una etapa nueva necesita su propio cuerpo y geometría de anclajes/máscaras. Las ocho prendas de torso y siete de piernas requieren variantes si cambian cuello, axila, cintura, muslos o rodillas. Los guantes pueden requerir variantes si cambia la mano. Cascos, objetos rígidos y elementos traseros se reutilizan cuando su superficie lo permita; los cuellos y broches de las capas necesitan revisión. No se han generado cuerpos ni prendas para etapas que todavía no existen. Los datos guardados seguirán usando los mismos IDs de cosméticos.
