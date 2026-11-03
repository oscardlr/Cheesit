import { preserveWorkoutPassiveEvent } from '../cheesit-passives';
import { emptyData, type AppData } from '../model';

export type AccountDocument = { data: AppData; tombstones: string[]; migrations: string[] };
export type CloudSnapshot = AccountDocument & { revision: number };
export type MergeConflict = { key: string; label: string; local: unknown; server: unknown };
export const blankDocument = (): AccountDocument => ({ data: emptyData(), tombstones: [], migrations: [] });
export function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const union = (...values: string[][]) => [...new Set(values.flat())].sort();
export function documentAfter(previous: AccountDocument, data: AppData): AccountDocument {
  const removed: string[] = [];
  for (const kind of ['routines', 'customExercises', 'workouts'] as const) {
    for (const item of previous.data[kind]) if (!data[kind].some(next => next.id === item.id)) removed.push(`${kind}:${item.id}`);
    if (kind === 'workouts') for (const item of data.workouts) if (item.status === 'deleted') removed.push(`workouts:${item.id}`);
  }
  return { ...previous, data, tombstones: union(previous.tombstones, removed) };
}
/** Three-way merge. Training, profile and the complete economic ledger form one
 * unit: independently spent charges/rewards can never be combined by accident. */
export function mergeDocuments(base: AccountDocument, local: AccountDocument, server: AccountDocument, choices: Record<string, 'local' | 'server'> = {}) {
  const conflicts: MergeConflict[] = [];
  // A reset starts a new history. Offline devices must not merge an old ledger,
  // draft or newly-created old-history records back into that history.
  const resets = (doc: AccountDocument) => doc.migrations.filter(id => id.startsWith('account-reset:'));
  const localResets = resets(local), serverResets = resets(server);
  if (!same(localResets.slice().sort(), serverResets.slice().sort())) {
    const selected = serverResets.some(id => !localResets.includes(id)) ? server : local;
    const discarded = selected === server ? local : server;
    const deleted = documentAfter(discarded, selected.data);
    return { document: {
      data: structuredClone(selected.data),
      tombstones: union(base.tombstones, local.tombstones, server.tombstones, deleted.tombstones),
      migrations: union(base.migrations, local.migrations, server.migrations),
    }, conflicts, unresolved: [] };
  }
  function choose<T>(key: string, label: string, b: T, l: T, r: T): T {
    if (same(l, r) || same(l, b)) return r;
    if (same(r, b)) return l;
    conflicts.push({ key, label, local: l, server: r });
    return choices[key] === 'local' ? l : r;
  }
  const data = emptyData();
  const activity = (d: AppData) => ({ workouts: d.workouts, game: d.game, profile: d.profile });
  Object.assign(data, choose('activity', 'Historial, perfil y economía del juego', activity(base.data), activity(local.data), activity(server.data)));
  for (const kind of ['routines', 'customExercises'] as const) {
    // The cloud's array order is authoritative; append local additions in their
    // existing order. Sorting UUIDs would reshuffle a migrated routine library
    // and turn an unchanged download into another write.
    const ids = [...new Set([...server.data[kind], ...local.data[kind], ...base.data[kind]].map(x => x.id))];
    // Absence is a versioned deletion, not a request to recreate an old record.
    (data[kind] as { id: string }[]) = ids.flatMap(id => {
      const find = (doc: AccountDocument) => doc.data[kind].find(x => x.id === id);
      const item = choose(`${kind}:${id}`, find(local)?.name ?? find(server)?.name ?? id, find(base), find(local), find(server));
      return item ? [item] : [];
    });
  }
  data.routineDraft = choose('routineDraft', 'Borrador de rutina', base.data.routineDraft, local.data.routineDraft, server.data.routineDraft);
  data.preferences = choose('preferences', 'Preferencias', base.data.preferences, local.data.preferences, server.data.preferences);
  const personalProfile = choose('personalProfile', 'Foto, nombre y biografía', base.data.personalProfile, local.data.personalProfile, server.data.personalProfile);
  if (personalProfile) data.personalProfile = personalProfile;
  const tombstones = union(base.tombstones, local.tombstones, server.tombstones);
  // Tombstones win even over a stale explicit whole-branch choice.
  data.routines = data.routines.filter(x => !tombstones.includes(`routines:${x.id}`));
  data.customExercises = data.customExercises.filter(x => !tombstones.includes(`customExercises:${x.id}`));
  data.workouts = data.workouts.filter(x => !tombstones.includes(`workouts:${x.id}`) || x.status === 'deleted').map(workout => { const authoritative = server.data.workouts.find(x => x.id === workout.id); return authoritative ? preserveWorkoutPassiveEvent(workout, authoritative) : workout; });
  return { document: { data: JSON.parse(JSON.stringify(data)) as AppData, tombstones, migrations: union(base.migrations, local.migrations, server.migrations) }, conflicts, unresolved: conflicts.filter(c => !choices[c.key]) };
}
