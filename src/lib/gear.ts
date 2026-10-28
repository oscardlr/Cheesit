import type { Rarity } from './game';

export type GearSlot = 'head' | 'top' | 'bottom' | 'hand' | 'back';
export type Gear = { id: string; name: string; slot: GearSlot; rarity: Rarity; sprite: number; description: string; atlas?: 'core' | 'mythic'; artwork?: 'forge'; collection?: string; abilityName?: string };

/** Sprite indices are stable: saves refer to IDs and the UI uses a shared 4×3 atlas. */
export const GEAR: Gear[] = [
  { id: 'purple-tank', name: 'Tirantes neón violeta', slot: 'top', rarity: 'rare', sprite: 0, description: 'Un clásico del hierro, con energía violeta.' },
  { id: 'lime-shorts', name: 'Pantalones lima GRIND', slot: 'bottom', rarity: 'common', sprite: 1, description: 'El verde de tu siguiente repetición.' },
  { id: 'crimson-shorts', name: 'Pantalones furia carmesí', slot: 'bottom', rarity: 'rare', sprite: 2, description: 'Para aparecer con toda la actitud.' },
  { id: 'dragon-head', name: 'Cabeza del dragón neón', slot: 'head', rarity: 'legendary', sprite: 3, description: 'La criatura más legendaria de la sala de pesas.' },
  { id: 'champion-crown', name: 'Corona del campeón', slot: 'head', rarity: 'epic', sprite: 4, description: 'La corona de quien vuelve a intentarlo.' },
  { id: 'headphones', name: 'Auriculares de concentración', slot: 'head', rarity: 'common', sprite: 5, description: 'Tu playlist. Tu zona. Tu siguiente serie.' },
  { id: 'titan-sword', name: 'Espadón del titán', slot: 'hand', rarity: 'epic', sprite: 6, description: 'Una espada descomunal para un héroe de arcade.' },
  { id: 'plasma-blaster', name: 'Bláster de plasma', slot: 'hand', rarity: 'legendary', sprite: 7, description: 'Un arma de ciencia ficción cargada de luz lima.' },
  { id: 'violet-cape', name: 'Capa de la constancia', slot: 'back', rarity: 'rare', sprite: 8, description: 'La épica también se lleva a la espalda.' },
  { id: 'neon-wings', name: 'Alas de ascenso neón', slot: 'back', rarity: 'legendary', sprite: 9, description: 'Cada nuevo nivel te hace volar un poco más alto.' },
  { id: 'golden-armor', name: 'Armadura del hierro dorado', slot: 'top', rarity: 'epic', sprite: 10, description: 'El brillo de quien se ha ganado su progreso.' },
  { id: 'training-tank', name: 'Camiseta de entrenamiento', slot: 'top', rarity: 'common', sprite: 11, description: 'Una camiseta básica para seguir construyendo.' },
  { id: 'phoenix-crown', name: 'Corona del fénix eterno', slot: 'head', rarity: 'legendary', sprite: 0, atlas: 'mythic', description: 'Una corona de fuego violeta que nunca pierde su brillo.' },
  { id: 'celestial-armor', name: 'Armadura celestial', slot: 'top', rarity: 'legendary', sprite: 1, atlas: 'mythic', description: 'Forjada con luz de estrellas y voluntad de hierro.' },
  { id: 'storm-tank', name: 'Tirantes de la tormenta', slot: 'top', rarity: 'epic', sprite: 2, atlas: 'mythic', description: 'Cada costura lleva un relámpago de energía arcade.' },
  { id: 'void-greaves', name: 'Grebas del vacío', slot: 'bottom', rarity: 'legendary', sprite: 3, atlas: 'mythic', description: 'Un paso firme incluso al borde del universo.' },
  { id: 'mecha-shorts', name: 'Pantalones del coloso mecánico', slot: 'bottom', rarity: 'epic', sprite: 4, atlas: 'mythic', description: 'Placas de titanio para una estética fuera de serie.' },
  { id: 'thunder-hammer', name: 'Martillo del trueno', slot: 'hand', rarity: 'legendary', sprite: 5, atlas: 'mythic', description: 'Un martillo gigante cargado de rayos lima.' },
  { id: 'starlight-gauntlet', name: 'Guantelete estelar', slot: 'hand', rarity: 'rare', sprite: 6, atlas: 'mythic', description: 'Concentra la energía de tu próxima repetición.' },
  { id: 'solar-cape', name: 'Manto del sol violeta', slot: 'back', rarity: 'legendary', sprite: 7, atlas: 'mythic', description: 'Un eclipse brillante que acompaña cada movimiento.' },
  { id: 'ronin-head', name: 'Kabuto del alba roja', slot: 'head', rarity: 'epic', sprite: 0, artwork: 'forge', collection: 'Ronin Carmesí', abilityName: 'Concentración del ronin', description: 'Cuernos de oro, acero violeta y una gema lima para encarar tu siguiente desafío.' },
  { id: 'ronin-top', name: 'Coraza de las mil series', slot: 'top', rarity: 'rare', sprite: 0, artwork: 'forge', collection: 'Ronin Carmesí', abilityName: 'Empuje de acero', description: 'Placas entrelazadas, cordones de oro y la disciplina de volver.' },
  { id: 'ronin-bottom', name: 'Hakama de paso firme', slot: 'bottom', rarity: 'common', sprite: 0, artwork: 'forge', collection: 'Ronin Carmesí', abilityName: 'Raíces del guerrero', description: 'Pliegues amplios y vendas claras para una postura inamovible.' },
  { id: 'ronin-hand', name: 'Katana del último esfuerzo', slot: 'hand', rarity: 'legendary', sprite: 0, artwork: 'forge', collection: 'Ronin Carmesí', abilityName: 'Corte del alba', description: 'Una hoja de energía lima sobre acero violeta, lista para cerrar tu mejor serie.' },
  { id: 'ronin-back', name: 'Estandarte de la disciplina', slot: 'back', rarity: 'rare', sprite: 0, artwork: 'forge', collection: 'Ronin Carmesí', abilityName: 'Juramento carmesí', description: 'El emblema neón de tu clan brilla entre pliegues violetas y bordados de oro.' },
  { id: 'glacier-head', name: 'Diadema del hielo eterno', slot: 'head', rarity: 'rare', sprite: 0, artwork: 'forge', collection: 'Guardián glacial', abilityName: 'Mente cristalina', description: 'Cristales violetas y lima sobre una diadema de oro para mantener la cabeza fría.' },
  { id: 'glacier-top', name: 'Peto de la aurora polar', slot: 'top', rarity: 'epic', sprite: 0, artwork: 'forge', collection: 'Guardián glacial', abilityName: 'Muro polar', description: 'Una armadura de cristal violeta, oro y energía lima que deja libres los brazos.' },
  { id: 'glacier-bottom', name: 'Grebas de la avalancha', slot: 'bottom', rarity: 'legendary', sprite: 0, artwork: 'forge', collection: 'Guardián glacial', abilityName: 'Avalancha', description: 'Rodilleras de gema lima, bordes de oro y tela oscura para avanzar sin ceder.' },
  { id: 'glacier-hand', name: 'Hacha del cero absoluto', slot: 'hand', rarity: 'epic', sprite: 0, artwork: 'forge', collection: 'Guardián glacial', abilityName: 'Tracción del glaciar', description: 'Una doble hoja de cristal violeta con filos lima sobre un mango de acero oscuro.' },
  { id: 'glacier-back', name: 'Manto de copos errantes', slot: 'back', rarity: 'common', sprite: 0, artwork: 'forge', collection: 'Guardián glacial', abilityName: 'Reserva invernal', description: 'Una capa violeta de pliegues profundos, forro lima y un collar de plumas doradas.' },
  { id: 'cosmic-head', name: 'Visor del horizonte orbital', slot: 'head', rarity: 'common', sprite: 0, artwork: 'forge', collection: 'Explorador cósmico', abilityName: 'Rumbo estelar', description: 'Un visor de luz lima, auriculares violetas y antenas doradas para tu próximo objetivo.' },
  { id: 'cosmic-top', name: 'Chaleco de núcleo astral', slot: 'top', rarity: 'legendary', sprite: 0, artwork: 'forge', collection: 'Explorador cósmico', abilityName: 'Propulsión de supernova', description: 'Placas violetas, metal dorado y un reactor de energía lima en el centro del pecho.' },
  { id: 'cosmic-bottom', name: 'Pantalones de órbita libre', slot: 'bottom', rarity: 'rare', sprite: 0, artwork: 'forge', collection: 'Explorador cósmico', abilityName: 'Gravedad cero', description: 'Bolsillos violetas, tela carbón y circuitos lima para explorar a tu ritmo.' },
  { id: 'cosmic-hand', name: 'Guante de polvo de estrellas', slot: 'hand', rarity: 'rare', sprite: 0, artwork: 'forge', collection: 'Explorador cósmico', abilityName: 'Pulso de cometa', description: 'Un guantelete violeta con nudillos dorados y una gema lima de energía orbital.' },
  { id: 'cosmic-back', name: 'Propulsor de doble cometa', slot: 'back', rarity: 'epic', sprite: 0, artwork: 'forge', collection: 'Explorador cósmico', abilityName: 'Órbita de fortuna', description: 'Dos motores violetas con aros de oro dejan una estela de fuego lima y energía neón.' },
];

export const GEAR_SLOTS: Record<GearSlot, string> = { head: 'Cabeza', top: 'Torso', bottom: 'Piernas', hand: 'Accesorio', back: 'Espalda' };
