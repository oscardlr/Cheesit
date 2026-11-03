import { isAthleteProfile, type AthleteProfile } from './strength';

export const USERNAME_TAKEN = 'Este nombre de usuario ya está ocupado. Elige otro.';
export const USERNAME_HINT = 'Entre 3 y 30 caracteres: letras sin tildes, números, puntos y guiones bajos.';
export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}
export function validUsername(value: string): boolean {
  return /^[a-z0-9_][a-z0-9._]{2,29}$/.test(value);
}
export function validateIdentity(displayName: string, username: string): void {
  if (!displayName.trim() || displayName.trim().length > 80) throw new Error('Introduce un nombre visible de entre 1 y 80 caracteres.');
  if (!validUsername(normalizeUsername(username))) throw new Error(USERNAME_HINT);
}
export function validateInitialProfile(profile: AthleteProfile): void {
  if (!isAthleteProfile(profile)) throw new Error('Revisa los datos: peso entre 30 y 300 kg, altura entre 100 y 250 cm, edad entera entre 16 y 100 años y sexo.');
}
