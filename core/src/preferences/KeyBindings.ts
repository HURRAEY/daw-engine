import { KEY_BINDINGS_STORAGE_KEY } from "../config/product-identifiers";
import { Signal } from "../lib/Signal";

import { logger } from "../utils/Logger";

/**
 * Manages custom keyboard shortcut bindings that override defaults.
 * Persists to localStorage.
 */
export class KeyBindings {
  private static instance: KeyBindings;
  private customBindings: Map<string, string> = new Map();
  public readonly bindingsChanged = new Signal<{
    actionId: string;
    keyCombo: string | undefined;
  }>();

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): KeyBindings {
    if (!KeyBindings.instance) {
      KeyBindings.instance = new KeyBindings();
    }
    return KeyBindings.instance;
  }

  /**
   * Set a custom key binding for an action, overriding the default.
   */
  public setBinding(actionId: string, keyCombo: string): void {
    this.customBindings.set(actionId, keyCombo);
    this.saveToStorage();
    this.bindingsChanged.emit({ actionId, keyCombo });
  }

  /**
   * Get the custom key binding for an action (undefined if using default).
   */
  public getBinding(actionId: string): string | undefined {
    return this.customBindings.get(actionId);
  }

  /**
   * Remove a custom binding, reverting to default.
   */
  public removeBinding(actionId: string): void {
    this.customBindings.delete(actionId);
    this.saveToStorage();
    this.bindingsChanged.emit({ actionId, keyCombo: undefined });
  }

  /**
   * Clear all custom bindings, reverting everything to defaults.
   */
  public resetToDefaults(): void {
    this.customBindings.clear();
    this.saveToStorage();
    this.bindingsChanged.emit({ actionId: "*", keyCombo: undefined });
  }

  /**
   * Get all custom bindings as a Map of actionId -> keyCombo.
   */
  public getAllBindings(): Map<string, string> {
    return new Map(this.customBindings);
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage === "undefined") return;
      const data = Object.fromEntries(this.customBindings);
      localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage may be unavailable (SSR, private browsing)
      logger.warn("KeyBindings", "Failed to save to localStorage");
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(KEY_BINDINGS_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Record<string, string>;
        this.customBindings = new Map(Object.entries(data));
      }
    } catch {
      // localStorage may be unavailable (SSR, private browsing)
      logger.warn("KeyBindings", "Failed to load from localStorage");
    }
  }
}
