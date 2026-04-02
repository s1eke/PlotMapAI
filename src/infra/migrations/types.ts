export interface StorageMigration {
  id: string;
  introducedIn: string;
  removeByVersion: string;
  run: () => Promise<void>;
}
