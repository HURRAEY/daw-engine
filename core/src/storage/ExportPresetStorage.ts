import { DAW_DATABASE_NAME } from "../config/product-identifiers";
import {
  ExportPresetSnapshot,
  ExportPreset,
  getBuiltInPresets,
} from "../domain/ExportPreset";

const DB_VERSION = 2;
const PRESETS_STORE = "exportPresets";

/**
 * IndexedDB storage for export presets.
 * Follows the same pattern as SessionStorage.
 */
export class ExportPresetStorage {
  private static instance: ExportPresetStorage;
  private dbPromise: Promise<IDBDatabase> | null = null;

  private constructor() {}

  public static getInstance(): ExportPresetStorage {
    if (!ExportPresetStorage.instance) {
      ExportPresetStorage.instance = new ExportPresetStorage();
    }
    return ExportPresetStorage.instance;
  }

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DAW_DATABASE_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = event.oldVersion;

        // Existing stores from version 1
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains("sessions")) {
            const sessionsStore = db.createObjectStore("sessions", {
              keyPath: "id",
            });
            sessionsStore.createIndex("name", "name", { unique: false });
            sessionsStore.createIndex("modified", "modified", {
              unique: false,
            });
          }
          if (!db.objectStoreNames.contains("snapshots")) {
            const snapshotsStore = db.createObjectStore("snapshots", {
              keyPath: "id",
            });
            snapshotsStore.createIndex("sessionId", "sessionId", {
              unique: false,
            });
            snapshotsStore.createIndex("created", "created", { unique: false });
          }
        }

        // New store for version 2
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(PRESETS_STORE)) {
            const presetsStore = db.createObjectStore(PRESETS_STORE, {
              keyPath: "id",
            });
            presetsStore.createIndex("name", "name", { unique: false });
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Save a user preset.
   */
  public async savePreset(preset: ExportPreset): Promise<void> {
    const db = await this.openDB();
    const record = preset.toJSON();

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PRESETS_STORE, "readwrite");
      tx.objectStore(PRESETS_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Load a preset by ID.
   */
  public async loadPreset(id: string): Promise<ExportPreset | null> {
    const db = await this.openDB();
    return new Promise<ExportPreset | null>((resolve, reject) => {
      const tx = db.transaction(PRESETS_STORE, "readonly");
      const request = tx.objectStore(PRESETS_STORE).get(id);
      request.onsuccess = () => {
        const record = request.result as ExportPresetSnapshot | undefined;
        resolve(record ? ExportPreset.fromJSON(record) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * List all saved user presets.
   */
  public async listPresets(): Promise<ExportPreset[]> {
    const db = await this.openDB();
    return new Promise<ExportPreset[]>((resolve, reject) => {
      const tx = db.transaction(PRESETS_STORE, "readonly");
      const request = tx.objectStore(PRESETS_STORE).getAll();
      request.onsuccess = () => {
        const records = (request.result ?? []) as ExportPresetSnapshot[];
        resolve(records.map((r) => ExportPreset.fromJSON(r)));
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all presets (built-in + user).
   */
  public async getAllPresets(): Promise<ExportPreset[]> {
    const builtIn = getBuiltInPresets();
    const userPresets = await this.listPresets();
    return [...builtIn, ...userPresets];
  }

  /**
   * Delete a user preset by ID.
   */
  public async deletePreset(id: string): Promise<void> {
    const db = await this.openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PRESETS_STORE, "readwrite");
      tx.objectStore(PRESETS_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
