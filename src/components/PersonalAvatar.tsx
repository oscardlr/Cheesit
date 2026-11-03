'use client';

import { useState } from 'react';
import { UserRound } from 'lucide-react';
import { isProfilePhoto } from '@/lib/personal-profile';

export function PersonalAvatar({ photo, name }: { photo?: string | null; name: string }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  return <span className="personal-avatar">{photo && photo !== failedPhoto && isProfilePhoto(photo)
    ? <img src={photo} alt={`Foto de perfil de ${name}`} width={384} height={384} onError={() => setFailedPhoto(photo)}/>
    : <UserRound aria-label="Avatar predeterminado" role="img" strokeWidth={1.4}/>}</span>;
}
