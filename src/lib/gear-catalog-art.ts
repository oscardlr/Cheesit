/** Original unequipped artwork. Independent of the registered worn layers in character-art.ts.
 * Source viewports retained from the original atlas metadata; never garment masks or body crops. */
export type CatalogArt = { src: string; width: number; height: number; source: readonly number[]; clip?: string };
export const GEAR_CATALOG_ART: Record<string, CatalogArt> = {
  "purple-tank": {
    "src": "/assets/grind-gear.png",
    "width": 1448,
    "height": 1086,
    "source": [
      54,
      66,
      288,
      317
    ]
  },
  "lime-shorts": {
    "src": "/assets/grind-gear.png",
    "width": 1448,
    "height": 1086,
    "source": [
      391,
      120,
      333,
      230
    ]
  },
  "crimson-shorts": {
    "src": "/assets/grind-gear.png",
    "width": 1448,
    "height": 1086,
    "source": [
      748,
      119,
      313,
      231
    ]
  },
  "dragon-head": {
    "src": "/assets/grind-gear.png",
    "width": 1448,
    "height": 1086,
    "source": [
      1098,
      19,
      339,
      368
    ]
  },
  "champion-crown": {
    "src": "/assets/grind-gear.png",
    "width": 1448,
    "height": 1086,
    "source": [
      45,
      449,
      311,
      224
    ]
  },
  "headphones": {
    "src": "/assets/grind-gear.png",
    "width": 1448,
    "height": 1086,
    "source": [
      411,
      448,
      305,
      251
    ]
  },
  "titan-sword": {
    "src": "/assets/grind-gear.png",
    "width": 1448,
    "height": 1086,
    "source": [
      819,
      350,
      164,
      418
    ]
  },
  "plasma-blaster": {
    "src": "/assets/grind-gear.png",
    "width": 1448,
    "height": 1086,
    "source": [
      1052,
      484,
      395,
      197
    ]
  },
  "violet-cape": {
    "src": "/assets/grind-gear.png",
    "width": 1448,
    "height": 1086,
    "source": [
      12,
      746,
      375,
      312
    ]
  },
  "neon-wings": {
    "src": "/assets/grind-gear.png",
    "width": 1448,
    "height": 1086,
    "source": [
      367,
      760,
      411,
      267
    ],
    "clip": "M367 760H780V1027H440L421 1004L397 979L380 953L367 928Z"
  },
  "golden-armor": {
    "src": "/assets/grind-gear.png",
    "width": 1448,
    "height": 1086,
    "source": [
      802,
      774,
      291,
      298
    ]
  },
  "training-tank": {
    "src": "/assets/grind-gear.png",
    "width": 1448,
    "height": 1086,
    "source": [
      1144,
      766,
      284,
      290
    ]
  },
  "phoenix-crown": {
    "src": "/assets/grind-gear-mythic.png",
    "width": 1774,
    "height": 887,
    "source": [
      27,
      48,
      395,
      341
    ]
  },
  "celestial-armor": {
    "src": "/assets/grind-gear-mythic.png",
    "width": 1774,
    "height": 887,
    "source": [
      480,
      40,
      377,
      386
    ]
  },
  "storm-tank": {
    "src": "/assets/grind-gear-mythic.png",
    "width": 1774,
    "height": 887,
    "source": [
      938,
      51,
      341,
      376
    ]
  },
  "void-greaves": {
    "src": "/assets/grind-gear-mythic.png",
    "width": 1774,
    "height": 887,
    "source": [
      1352,
      57,
      387,
      348
    ]
  },
  "mecha-shorts": {
    "src": "/assets/grind-gear-mythic.png",
    "width": 1774,
    "height": 887,
    "source": [
      20,
      479,
      405,
      330
    ]
  },
  "thunder-hammer": {
    "src": "/assets/grind-gear-mythic.png",
    "width": 1774,
    "height": 887,
    "source": [
      490,
      446,
      353,
      409
    ]
  },
  "starlight-gauntlet": {
    "src": "/assets/grind-gear-mythic.png",
    "width": 1774,
    "height": 887,
    "source": [
      926,
      444,
      324,
      410
    ]
  },
  "solar-cape": {
    "src": "/assets/grind-gear-mythic.png",
    "width": 1774,
    "height": 887,
    "source": [
      1325,
      454,
      447,
      403
    ]
  },
  "ronin-head": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      18,
      17,
      326,
      312
    ]
  },
  "ronin-top": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      379,
      21,
      287,
      304
    ]
  },
  "ronin-bottom": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      689,
      51,
      323,
      261
    ]
  },
  "ronin-hand": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      1098,
      8,
      127,
      352
    ],
    "clip": "M1096 7H1227V333H1185V362H1135V333H1096Z"
  },
  "ronin-back": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      1324,
      7,
      280,
      334
    ]
  },
  "glacier-head": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      23,
      365,
      321,
      244
    ]
  },
  "glacier-top": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      380,
      352,
      288,
      285
    ]
  },
  "glacier-bottom": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      695,
      352,
      311,
      276
    ]
  },
  "glacier-hand": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      1033,
      335,
      251,
      335
    ],
    "clip": "M1032 334H1135V360H1185V334H1286V672H1032Z"
  },
  "glacier-back": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      1288,
      349,
      329,
      308
    ]
  },
  "cosmic-head": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      17,
      696,
      328,
      207
    ]
  },
  "cosmic-top": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      364,
      649,
      317,
      307
    ]
  },
  "cosmic-bottom": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      689,
      680,
      323,
      263
    ]
  },
  "cosmic-hand": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      1048,
      679,
      212,
      263
    ]
  },
  "cosmic-back": {
    "src": "/assets/grind-gear-pixel-expansion.png",
    "width": 1619,
    "height": 971,
    "source": [
      1291,
      667,
      325,
      289
    ]
  }
};
