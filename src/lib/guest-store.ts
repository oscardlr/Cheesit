import { createStorageClient } from './storage';
import type { AccountStore } from './remote/account-store';
import { resetAccountData } from './account-reset';

export type AppStore = Pick<AccountStore, 'loadData' | 'saveData' | 'stageData' | 'flushData' | 'resetData' | 'hasPendingData' | 'subscribeStorageChanges' | 'status' | 'synchronize' | 'hasUnsynced' | 'recoverTab'>;

/** Guest activity stays in a separate browser database. Never calls Auth or the cloud. */
export function guestStore(): AppStore {
  const storage = createStorageClient(undefined, 'cheesit-guest');
  return { ...storage, status: 'synced', resetData: async () => {
    await storage.flushData();
    const data = resetAccountData(await storage.loadData());
    await storage.saveData(data);
    return data;
  }, recoverTab: async () => { await storage.loadData(); }, subscribeStorageChanges: () => () => {}, synchronize: async () => false, hasUnsynced: storage.hasPendingData };
}
