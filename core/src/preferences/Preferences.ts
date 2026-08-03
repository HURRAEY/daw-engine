import { PREFERENCES_STORAGE_KEY } from "../config/product-identifiers";
import { Signal } from "../lib/Signal";

import { logger } from "../utils/Logger";

export interface PreferenceValues {
  audioBufferSize: 128 | 256 | 512 | 1024 | 2048;
  sampleRate: 44100 | 48000 | 96000;
  theme: "dark" | "light";
  autoSaveInterval: number;
  snapToGrid: boolean;
  gridSubdivision: number;
  meterType: "peak" | "rms" | "vu";
  showMinimap: boolean;
  followPlayhead: boolean;
  countInBars: number;
  // Undo history
  historyDepth: number; // 0 = unlimited, max 512
  saveHistory: boolean; // Persist undo metadata with session
  saveHistoryDepth: number; // 0 = all, max 512
}

const DEFAULT_PREFERENCES: PreferenceValues = {
  audioBufferSize: 512,
  sampleRate: 44100,
  theme: "dark",
  autoSaveInterval: 60000,
  snapToGrid: true,
  gridSubdivision: 4,
  meterType: "peak",
  showMinimap: true,
  followPlayhead: true,
  countInBars: 0,
  historyDepth: 0,
  saveHistory: true,
  saveHistoryDepth: 0,
};

/**
 * Singleton preferences system with Signal-based change notification.
 * Persists to localStorage.
 */
export class Preferences {
  private static instance: Preferences;
  private values: PreferenceValues;
  public readonly preferenceChanged = new Signal<{
    key: keyof PreferenceValues;
    value: unknown;
  }>();

  private constructor() {
    this.values = { ...DEFAULT_PREFERENCES };
    this.loadFromStorage();
  }

  public static getInstance(): Preferences {
    if (!Preferences.instance) {
      Preferences.instance = new Preferences();
    }
    return Preferences.instance;
  }

  /**
   * Get a preference value by key.
   */
  public get<K extends keyof PreferenceValues>(key: K): PreferenceValues[K] {
    return this.values[key];
  }

  /**
   * Set a preference value.
   */
  public set<K extends keyof PreferenceValues>(
    key: K,
    value: PreferenceValues[K],
  ): void {
    if (this.values[key] === value) return;
    this.values[key] = value;
    this.saveToStorage();
    this.preferenceChanged.emit({ key, value });
  }

  /**
   * Get all preferences as a plain object.
   */
  public getAll(): Readonly<PreferenceValues> {
    return { ...this.values };
  }

  /**
   * Reset all preferences to defaults.
   */
  public resetToDefaults(): void {
    const keys = Object.keys(DEFAULT_PREFERENCES) as Array<
      keyof PreferenceValues
    >;
    this.values = { ...DEFAULT_PREFERENCES };
    this.saveToStorage();
    keys.forEach((key) => {
      this.preferenceChanged.emit({ key, value: this.values[key] });
    });
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify(this.values),
      );
    } catch {
      logger.warn("Preferences", "Failed to save to localStorage");
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Partial<PreferenceValues>;
        // Merge loaded values with defaults (in case new prefs were added)
        this.values = { ...DEFAULT_PREFERENCES, ...data };
      }
    } catch {
      logger.warn("Preferences", "Failed to load from localStorage");
    }
  }
}
