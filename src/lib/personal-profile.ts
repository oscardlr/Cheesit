import type { Workout } from './model';

export type PersonalProfile = { displayName: string; bio: string; photo: string | null; gym?: string };
export const EMPTY_PERSONAL_PROFILE: PersonalProfile = { displayName: '', bio: '', photo: null };
export const PROFILE_PHOTO_MAX_LENGTH = 262144;
export const PROFILE_PHOTO_MAX_FILE_SIZE = 8 * 1024 * 1024;

/** Only embedded JPEGs: no public URLs, SVGs, tracking requests or object URLs. */
export function isProfilePhoto(value: unknown): value is string {
  return typeof value === 'string' && value.length <= PROFILE_PHOTO_MAX_LENGTH && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value) && (value.length - 23) % 4 === 0;
}
export function isPersonalProfile(value: unknown): value is PersonalProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return Object.keys(p).every(key => ['displayName', 'bio', 'photo', 'gym'].includes(key)) &&
    typeof p.displayName === 'string' && p.displayName.length <= 80 &&
    typeof p.bio === 'string' && p.bio.length <= 300 && (p.photo === null || isProfilePhoto(p.photo)) &&
    (p.gym === undefined || (typeof p.gym === 'string' && p.gym.length <= 100));
}

export function recentProfileWorkouts(workouts: Workout[], limit = 6): Workout[] {
  return workouts.filter(w => w.status === 'finished').sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, limit);
}

/** Decode and re-encode locally, stripping metadata and limiting stored size.
 * The square preview is exactly the image committed to the account. */
export async function prepareProfilePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Elige una imagen JPG, PNG o WebP.');
  if (!file.size || file.size > PROFILE_PHOTO_MAX_FILE_SIZE) throw new Error('La foto debe ocupar como máximo 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error('No se ha podido leer la imagen. Prueba con otra foto.'); });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('Elige una imagen de hasta 40 megapíxeles.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 384;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se ha podido preparar la foto en este navegador.');
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = '#211c2b';
    context.fillRect(0, 0, 384, 384);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 384, 384);
    const result = canvas.toDataURL('image/jpeg', 0.82);
    if (!isProfilePhoto(result)) throw new Error('No se ha podido reducir la foto. Prueba con otra imagen.');
    return result;
  } finally { URL.revokeObjectURL(url); }
}
