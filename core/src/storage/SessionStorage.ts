import { DAW_DATABASE_NAME } from "../config/product-identifiers";
import { SessionSnapshot } from "../domain/Session";

const DB_VERSION = 1;
const SESSIONS_STORE = "sessions";
const SNAPSHOTS_STORE = "snapshots";

/**
 * Metadata stored alongside each session entry.
 */
export interface SessionMeta {
  id: string;
  name: string;
  modified: Date;
}

/**
 * A named snapshot of a session.
 */
export interface SnapshotEntry {
  id: string;
  sessionId: string;
  name: string;
  created: Date;
  snapshot: SessionSnapshot;
}

/**
 * IndexedDB-based session storage.
 *
 * Stores full session snapshots and named snapshots (point-in-time saves)
 * in the browser's IndexedDB.
 */
export class SessionStorage {
  private static instance: SessionStorage;
  private dbPromise: Promise<IDBDatabase> | null = null;

  private constructor() {}

  public static getInstance(): SessionStorage {
    if (!SessionStorage.instance) {
      SessionStorage.instance = new SessionStorage();
    }
    return SessionStorage.instance;
  }

  // ─── Database Initialisation ─────────────────────────────────────────────

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DAW_DATABASE_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const sessionsStore = db.createObjectStore(SESSIONS_STORE, {
            keyPath: "id",
          });
          sessionsStore.createIndex("name", "name", { unique: false });
          sessionsStore.createIndex("modified", "modified", { unique: false });
        }

        if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
          const snapshotsStore = db.createObjectStore(SNAPSHOTS_STORE, {
            keyPath: "id",
          });
          snapshotsStore.createIndex("sessionId", "sessionId", {
            unique: false,
          });
          snapshotsStore.createIndex("created", "created", { unique: false });
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

  // ─── Session CRUD ────────────────────────────────────────────────────────

  /**
   * Save (insert or update) a session snapshot to IndexedDB.
   */
  public async saveSession(session: {
    id: string;
    name: string;
    toJSON(): SessionSnapshot;
  }): Promise<void> {
    const db = await this.openDB();
    const snapshot = session.toJSON();
    const record = {
      id: snapshot.id,
      name: snapshot.name,
      modified: new Date().toISOString(),
      snapshot,
    };

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, "readwrite");
      tx.objectStore(SESSIONS_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Load a session snapshot by ID.
   */
  public async loadSession(id: string): Promise<SessionSnapshot | null> {
    const db = await this.openDB();
    return new Promise<SessionSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, "readonly");
      const request = tx.objectStore(SESSIONS_STORE).get(id);
      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? record.snapshot : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * List all saved sessions (lightweight metadata only).
   */
  public async listSessions(): Promise<SessionMeta[]> {
    const db = await this.openDB();
    return new Promise<SessionMeta[]>((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, "readonly");
      const request = tx.objectStore(SESSIONS_STORE).getAll();
      request.onsuccess = () => {
        const records = request.result ?? [];
        resolve(
          records.map((r: { id: string; name: string; modified: string }) => ({
            id: r.id,
            name: r.name,
            modified: new Date(r.modified),
          })),
        );
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a session and all its snapshots.
   */
  public async deleteSession(id: string): Promise<void> {
    const db = await this.openDB();

    // Delete associated snapshots first
    const snapshots = await this.listSnapshots(id);

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction([SESSIONS_STORE, SNAPSHOTS_STORE], "readwrite");
      tx.objectStore(SESSIONS_STORE).delete(id);
      for (const snap of snapshots) {
        tx.objectStore(SNAPSHOTS_STORE).delete(snap.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ─── Named Snapshots ─────────────────────────────────────────────────────

  /**
   * Save a named snapshot of the given session.
   * Returns the snapshot ID.
   */
  public async saveSnapshot(
    sessionId: string,
    name: string,
    snapshot: SessionSnapshot,
  ): Promise<string> {
    const db = await this.openDB();
    const id = crypto.randomUUID();
    const entry: SnapshotEntry = {
      id,
      sessionId,
      name,
      created: new Date(),
      snapshot,
    };

    return new Promise<string>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readwrite");
      // Store with ISO date string for serialisation safety
      tx.objectStore(SNAPSHOTS_STORE).put({
        ...entry,
        created: entry.created.toISOString(),
      });
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * List all snapshots for a given session.
   */
  public async listSnapshots(
    sessionId: string,
  ): Promise<{ id: string; name: string; created: Date }[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readonly");
      const index = tx.objectStore(SNAPSHOTS_STORE).index("sessionId");
      const request = index.getAll(sessionId);
      request.onsuccess = () => {
        const records = request.result ?? [];
        resolve(
          records.map((r: { id: string; name: string; created: string }) => ({
            id: r.id,
            name: r.name,
            created: new Date(r.created),
          })),
        );
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Load a specific snapshot by ID.
   */
  public async loadSnapshot(
    snapshotId: string,
  ): Promise<SessionSnapshot | null> {
    const db = await this.openDB();
    return new Promise<SessionSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readonly");
      const request = tx.objectStore(SNAPSHOTS_STORE).get(snapshotId);
      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? record.snapshot : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a specific snapshot.
   */
  public async deleteSnapshot(snapshotId: string): Promise<void> {
    const db = await this.openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readwrite");
      tx.objectStore(SNAPSHOTS_STORE).delete(snapshotId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
