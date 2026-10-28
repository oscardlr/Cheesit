# Arte de personalización V2

Herramienta: `image_gen` integrada, siguiendo la habilidad `imagegen`. Ambas imágenes son PNG con transparencia y se guardan dentro del proyecto. No se necesitan servicios de generación en tiempo de ejecución.

- Base: `public/assets/grind-avatar-base.png`.
- Equipo: `public/assets/grind-gear.png`, atlas de cuatro columnas y tres filas con doce piezas.
- Referencias anteriores: `public/assets/grind-athlete.png`; su identidad y colores se conservan.

`CharacterAvatar` superpone prendas por ranura sobre la base. `GearSprite` selecciona celdas del atlas para las capas, miniaturas y premios. Los recortes CSS eliminan restos de celdas vecinas sin modificar las imágenes originales.

## Prompt final de la base

Referencia: `grind-athlete.png`. Salida nueva y transparente.

```text
Create a NEW standalone full-body front-facing neutral player avatar for a gym RPG, preserving the muscular adult male hero identity and polished retro pixel-art style from the bottom right of the reference: same short dark hair, tan skin, strong build, chunky crisp pixel clusters, rich dark purple shadows, lime and violet highlights. The adult hero now wears ONLY a plain fitted black tank top, simple modest charcoal-gray boxer shorts, and plain purple trainers, no green shorts, no accessories, no weapons. Nonsexual game character equipment screen. Pose: standing straight front view, legs slightly apart, arms lowered naturally and a little away from body so gear overlays can fit; hands relaxed next to hips, both arms symmetric, neutral confident face. Full body including shoes fits inside the canvas with 10% transparent empty margin all around. Character vertical center axis exactly middle of canvas. The character will have paper-doll equipment layered over head, torso, pelvis and right hand. Genuine transparent background, no glow aura, no pedestal, no shadows on floor, no text, no panel, no other characters. Portrait composition, pixel art original professional video-game asset. Return a local PNG file.
```

## Prompt final del equipo

Referencia: `grind-avatar-base.png`. Salida nueva y transparente.

```text
Create a NEW pixel art paper-doll equipment sprite atlas to dress the muscular adult male gym RPG avatar in the reference. Exactly TWELVE separate objects on one transparent image, strict 4 COLUMNS x 3 ROWS evenly spaced rectangular grid. One object in each cell, centered and fully contained with generous transparent padding. No text, labels, numbers, panel backgrounds, grid lines, bodies, arms or faces. Same polished retro pixel art as reference, crisp hard pixel clusters, deep dark purple outlines, lime-green and violet palette with gold and cyan accents. The clothing is front-facing, empty with no mannequin, shaped to fit the reference muscular wide chest and thighs. All headgear faces directly forward. Top row left-to-right: (0) sleeveless violet gym tank top with lime piping; (1) iconic bright lime gym shorts with black seams matching original GRIND hero; (2) scarlet-black combat gym shorts; (3) outrageous lime-green dragon-head helmet with horns and open dragon jaw as a wearable hood. Middle row left-to-right: (4) ornate golden crown with amethyst gems; (5) purple-and-lime over-ear gaming headphones; (6) huge upright magical violet sword with neon-lime glowing edge, handle at bottom; (7) playful futuristic arcade machine-gun-like blaster, horizontal compact purple toy sci-fi weapon with lime energy cells, no logos. Bottom row left-to-right: (8) flowing purple cape with lime inside lining, front view; (9) pair of spectacular purple dragon wings with lime translucent membranes, symmetric spread to each side; (10) golden sleeveless chest armor with violet and lime gems, shaped like a muscular vest; (11) simple black fitted gym tank top with a single tiny lime lightning symbol. Treat these as modular wearable videogame sprites, not illustrations or collectible trading cards. Keep each object isolated and no cell overlap. Genuine transparent background. Return local PNG.
```
