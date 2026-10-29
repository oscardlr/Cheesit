'use client';

import { useState, type CSSProperties } from 'react';
import { COMPANIONS } from '@/lib/companions';
import { RARITIES } from '@/lib/game';
import { CompanionSprite } from './CharacterAvatar';
import CheesitPassive from './CheesitPassive';
import './wardrobe-v3.css';
import './cheesit-inspection.css';

export default function CheesitInspection() {
  const [motion, setMotion] = useState<'idle' | 'celebrate'>('idle');
  const [animated, setAnimated] = useState(true);
  const [equipped, setEquipped] = useState<string | null>('athlete');
  const [allOwned, setAllOwned] = useState(true);
  return <main className="cheesit-inspection">
    <header><a href="/#view=summary">← Volver a Resumen</a><span className="eyebrow">CHEESIT · VISTA LOCAL</span><h1>Los ocho cheesits</h1><p>Catálogo y animaciones. Esta vista usa datos de ejemplo en memoria; tu progreso guardado se conserva.</p></header>
    <div className="cheesit-inspection-controls"><nav aria-label="Animación de los cheesits"><button aria-pressed={motion === 'idle'} onClick={() => setMotion('idle')}>Reposo</button><button aria-pressed={motion === 'celebrate'} onClick={() => setMotion('celebrate')}>Celebración</button></nav><button aria-pressed={!animated} onClick={() => setAnimated(value => !value)}>{animated ? 'Pausar animaciones' : 'Reanudar animaciones'}</button><button aria-pressed={!allOwned} onClick={() => setAllOwned(value => !value)}>{allOwned ? 'Mostrar estados pendientes' : 'Mostrar todos disponibles'}</button></div>
    <section className="cheesit-inspection-grid" aria-label="Catálogo de cheesits">{COMPANIONS.map((companion, index) => {
      const owned = allOwned || index < 2;
      const selected = owned && equipped === companion.id;
      return <article className={`cheesit-inspection-card ${selected ? 'is-equipped' : ''}`} key={companion.id} style={{ '--rarity': RARITIES[companion.rarity].color } as CSSProperties} data-companion-id={companion.id} data-rarity={companion.rarity}>
        <small>{RARITIES[companion.rarity].label}</small><div className="cheesit-inspection-art"><CompanionSprite companionId={companion.id} animated={animated} motion={motion}/></div><h2>{companion.name}</h2><p>{companion.description}</p><CheesitPassive companionId={companion.id} status={selected ? 'equipped' : owned ? 'available' : 'locked'}/><button disabled={!owned} aria-pressed={selected} onClick={() => setEquipped(selected ? null : companion.id)}>{selected ? 'Quitar cheesit' : owned ? 'Equipar cheesit' : 'Pendiente de conseguir'}</button>
      </article>;
    })}</section>
    <p className="cheesit-inspection-note">El movimiento reducido del dispositivo y la pausa mantienen una imagen estática. Las animaciones fuera de pantalla se pausan automáticamente.</p>
  </main>;
}
