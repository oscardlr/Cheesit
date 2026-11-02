import { createBackup, previewBackup, type BackupConflict, type BackupPreview, type BackupResolution } from '../backup';
import type { AppData } from '../model';
import { same, type AccountDocument } from './document';
export type MigrationPreview = Omit<BackupPreview, 'conflictDetails'> & { conflictDetails: (Omit<BackupConflict, 'kind'> & { kind: string })[] };
/** Uses the existing reviewed importer, with explicit profile/preferences choices
 * and account tombstones. Migration never awards missions or recreates IDs. */
export function previewLegacy(source: AppData, current: AccountDocument, choices: Record<string, BackupResolution> = {}): MigrationPreview {
  const incoming = structuredClone(source);
  for (const kind of ['routines', 'workouts', 'customExercises'] as const) incoming[kind] = incoming[kind].filter(x => !current.tombstones.includes(`${kind}:${x.id}`)) as never;
  let preview: MigrationPreview;
  try { preview = previewBackup(createBackup(incoming), current.data, choices); }
  catch (error) {
    // Some independently spent ability ledgers cannot validate against a mixed
    // history. Offer one explicit activity branch instead of dropping uses or
    // inventing charges. Both original branches stay recoverable.
    const unresolved = previewBackup(createBackup(incoming), current.data);
    if (!unresolved.conflictDetails.some(c => c.kind === 'game')) throw error;
    const structural = (data: AppData): AppData => { const { game: _game, profile: _profile, ...rest } = data; return { ...rest, workouts: [] }; };
    preview = previewBackup(createBackup(structural(incoming)), structural(current.data), choices);
    const key = 'migration:activity';
    const activity = (data: AppData) => ({ workouts: data.workouts, game: data.game, profile: data.profile });
    preview.conflictDetails.push({ key, kind: 'activity', id: 'activity', name: 'Las economías independientes requieren elegir historial y juego juntos. Ambas copias se conservan.', local: activity(current.data), incoming: activity(incoming), choices: ['local','incoming'] });
    if (!choices[key]) preview.conflicts.push(key);
    Object.assign(preview.merged, activity(choices[key] === 'incoming' ? incoming : current.data));
  }
  for (const key of ['profile', 'preferences'] as const) {
    if (key === 'profile' && preview.conflictDetails.some(c => c.kind === 'activity')) continue;
    if (!incoming[key] || !current.data[key] || same(incoming[key], current.data[key])) continue;
    const conflictKey = `migration:${key}`;
    preview.conflictDetails.push({ key: conflictKey, kind: key, id: key, name: key === 'profile' ? 'Perfil y convenciones de carga' : 'Preferencias', local: current.data[key], incoming: incoming[key], choices: ['local','incoming'] });
    if (!choices[conflictKey]) preview.conflicts.push(conflictKey);
    if (choices[conflictKey] === 'incoming') preview.merged[key] = incoming[key] as never;
  }
  return preview;
}
