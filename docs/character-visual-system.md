# Personaje y cosméticos: bloque 2

El catálogo mantiene sus 35 identificadores y las reglas de equipamiento existentes. Cada ranura admite una pieza o vacío: cabeza 7+1, torso 8+1, piernas 7+1, mano 7+1 y espalda 6+1. El producto permite 32.256 conjuntos. Las cuatro compañeras existentes y la opción vacía permiten 161.280 composiciones de grupo. El inventario desbloqueado limita las opciones de cada partida; no hay exclusiones entre ranuras.

## Arte y registro

`src/lib/character-art.ts` centraliza el maestro `base-v1`, marco, anclajes, máscaras y orden de dibujo. `character-assets.json` registra recortes y posiciones del atlas transparente `public/assets/character/wardrobe-v3.png`. Las miniaturas y prendas equipadas leen la misma definición. El atlas V2 se conserva para compatibilidad con versiones anteriores; el renderizador actual usa V3.

Se reutiliza el maestro original. Hay 29 ilustraciones adaptadas activas: ocho prendas de torso, siete de piernas, siete piezas de cabeza y siete de mano. La corrección posterior aporta 14 ilustraciones finales para cabeza/mano y sustituye el guante estelar anterior. Se reutilizan las seis espaldas y las cuatro compañeras originales, con recortes aislados y escalado uniforme. No hacen falta variantes conjuntas. El maestro y el atlas son dos PNG en ejecución; agrupar las prendas en un atlas no reduce sus 35 ilustraciones independientes.

Las capas de espalda quedan detrás del cuerpo; las prendas lo cubren; los broches de las capas usan máscaras explícitas. Las piezas de mano incluyen sus propios dedos alrededor de la empuñadura y sustituyen la mano abierta del maestro, únicamente después de cargar correctamente el atlas. Si falla la imagen o se quita el objeto, se conserva la mano original completa. Las cabezas siguen el pelo, cráneo y cara del maestro; el visor conserva los ojos originales bajo su lente. Las prendas nuevas mantienen su escala dibujada 1:1. No se estiran iconos genéricos ni se escala el cuerpo según el nivel. Si falla el maestro se muestra una silueta estable, sin cambiar el marco.

## Movimiento e inspección

Las cinco opciones conservan sus identificadores y mueven la pose completa con desplazamientos y giros perceptibles: reposo, balanceo, preparación, victoria y poder. El cuerpo y el equipo comparten una única transformación, sin escalado no uniforme. No se articulan recortes de una ilustración plana. Pausa, efectos desactivados y `prefers-reduced-motion` mantienen una pose estática y explican su estado. Ascenso conserva la ilustración completa y anima su brillo; el banco usa una pose íntegra en lugar del filmstrip desregistrado. El inspector móvil mantiene la vista del personaje junto a los controles al cambiar de movimiento.

En desarrollo, `/dev/character` permite combinar todas las ranuras y las cuatro compañeras, recorrer los índices de los 32.256 conjuntos, revisar cada prenda y las interacciones de mayor riesgo. Usa fixtures en memoria, sin modificar la partida. En producción devuelve 404.

```sh
npm test
npm run typecheck
npm run build
node --import tsx scripts/verify-character-combinations.ts
```

El verificador compone los 32.256 conjuntos y genera hojas locales bajo `docs/block-two/` para revisar prendas, los 639 pares entre ranuras y los 64 cruces de cabeza/mano. Esos resultados y los originales de generación no son dependencias de ejecución ni se incluyen en la publicación. Las pruebas de navegador relevantes son `character-block-two`, `character-motion`, `character-motion-visible`, `character-v2`, `ascent-visual` y `arcade-visual`. La última añade mediciones de amplitud y vídeos de ciclos completos a 390, 477 y 1440 px.

## Futuras etapas físicas

Una etapa nueva necesita su propio cuerpo y geometría de anclajes/máscaras. Las ocho prendas de torso y siete de piernas requieren variantes si cambian cuello, axila, cintura, muslos o rodillas. Las piezas de cabeza deben seguir el pelo y la cara de cada etapa. Las piezas de mano incluyen el agarre dibujado y necesitan variantes si cambia la muñeca o los dedos. Los elementos traseros se reutilizan cuando su superficie lo permita; los cuellos y broches de las capas necesitan revisión. No se han generado cuerpos ni prendas para etapas que todavía no existen. Los datos guardados seguirán usando los mismos IDs de cosméticos.
