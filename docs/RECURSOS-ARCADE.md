# Recursos del atleta

Recurso final: `public/assets/grind-athlete.png`.

Secuencia de banca: `public/assets/grind-bench-frames.png`, cuatro fotogramas de bloqueo, descenso, barra cerca del pecho y ascenso. CSS cambia de región cada cuarto de ciclo, manteniendo la técnica del movimiento visible.

Generado el 27 de octubre de 2026 con la herramienta integrada `image_gen`, mediante la habilidad `imagegen`. PNG con transparencia, utilizado localmente; no requiere llamar a una API al abrir la app. Las animaciones las ejecutan CSS y los componentes de la aplicación a partir de las poses generadas.

Atlas de cuatro poses: banca arriba a la izquierda, victoria arriba a la derecha, ascenso abajo a la izquierda y reposo abajo a la derecha. `PixelAthlete` selecciona la región correspondiente. La pose de banca ocupa una región algo más ancha para mostrar la barra y los pies completos.

## Prompt final utilizado

```text
Create one production-ready pixel-art sprite atlas PNG with genuinely transparent background. EXACT square canvas divided into a strict 2 by 2 grid of four equal square cells. Each sprite must be entirely inside its own cell with generous empty padding, no overlap between cells. Same original muscular adult male gym hero in all cells: short dark hair, strong arms, warm medium skin, black gym tank top, vivid lime green shorts, purple training shoes, clean readable silhouette. Polished retro 32-bit pixel art, hard pixel edges, hand-placed highlights, limited dark purple / lime / warm tan palette, no gradients, no text or lettering or logos or borders or grid lines. TOP LEFT cell: full side view athlete lying on a purple workout bench, performing bench press with dark steel barbell held above his chest, knees bent, entire bench and weights visible. TOP RIGHT cell: standing victorious athlete flexing both arms, lime and purple sparkles near him. BOTTOM LEFT cell: side view athlete stepping upward onto three small purple stairs toward a glowing golden treasure chest, entire staircase and athlete visible. BOTTOM RIGHT cell: front-facing idle strong athlete, hands resting at hips, confident relaxed stance. Four equally important sprites, centered in their cells. This is a videogame UI atlas, not a poster; no background scenery. Save the image as a local file and return its path.
```

## Prompt de la secuencia de banca

Edición con `image_gen`, usando `grind-athlete.png` como referencia y salida separada con transparencia.

```text
Use only the TOP LEFT bench-press scene of this reference image to create a NEW animation sprite sheet. Exact output layout: one wide horizontal image containing FOUR equally-sized SQUARE cells in a single row, 4 columns x 1 row. Same full side view gym hero on a purple bench in EVERY frame, same camera, same character proportions, same bench position, same lime shorts, dark tank, purple shoes, same barbell and weights, same crisp retro pixel art, genuine transparent background. This is a functional animation strip: do not add the victory pose, stairs or standing pose. Keep the whole bench, lifter, bar and weights within each frame with blank transparent padding on ALL sides so no frames overlap. The bench, body, legs and head must stay completely stationary at identical locations in all four frames. Only articulate the arms and move the barbell as a real bench press repetition: frame 1 at lockout arms extended with bar high, frame 2 halfway lowering with elbows bent, frame 3 bar low at chest with elbows bent 90 degrees, frame 4 halfway pushing back up. Use a slightly lighter barbell load than reference so the sides do not overflow each square cell. No text, no letters, no numbers, no grid lines, no decoration. The four frames will be played left to right in a repeating CSS animation to show an actual bench press. Preserve the reference visual character and palette. Return a local output file path.
```

## Audio

Efectos originales sintetizados localmente con Web Audio. No se han descargado audios externos. El motor comparte un contexto de audio y se desbloquea con una interacción. El interruptor de sonido silencia también cajas y celebraciones. Los sonidos y el atlas funcionan sin conexión con la aplicación instalada.
