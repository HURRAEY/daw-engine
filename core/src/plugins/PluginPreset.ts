import { PLUGIN_PRESET_STORAGE_KEY } from "../config/product-identifiers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PluginPreset {
  id: string;
  name: string;
  pluginId: string; // Descriptor ID (e.g., 'internal-reverb')
  parameters: Map<string, number>;
}

export interface PluginPresetSnapshot {
  id: string;
  name: string;
  pluginId: string;
  parameters: Record<string, number>;
}

// ─── PresetManager ────────────────────────────────────────────────────────────

/**
 * Singleton that manages built-in and custom plugin presets.
 */
export class PresetManager {
  private static instance: PresetManager;
  private builtInPresets: PluginPreset[] = [];
  private customPresets: PluginPreset[] = [];

  private constructor() {
    this.initBuiltInPresets();
    this.loadCustomPresets();
  }

  public static getInstance(): PresetManager {
    if (!PresetManager.instance) {
      PresetManager.instance = new PresetManager();
    }
    return PresetManager.instance;
  }

  /** For testing – reset singleton */
  public static resetInstance(): void {
    PresetManager.instance = undefined as unknown as PresetManager;
  }

  // ─── Query ────────────────────────────────────────────────────────────────

  /**
   * Get all presets (built-in + custom) for a given plugin descriptor ID.
   */
  public getPresetsForPlugin(pluginId: string): PluginPreset[] {
    return [
      ...this.builtInPresets.filter((p) => p.pluginId === pluginId),
      ...this.customPresets.filter((p) => p.pluginId === pluginId),
    ];
  }

  /**
   * Get a single preset by ID.
   */
  public getPreset(presetId: string): PluginPreset | undefined {
    return (
      this.builtInPresets.find((p) => p.id === presetId) ??
      this.customPresets.find((p) => p.id === presetId)
    );
  }

  // ─── Apply ────────────────────────────────────────────────────────────────

  /**
   * Apply a preset to a plugin processor on a track.
   * The caller is responsible for looking up the correct track / processor.
   * Returns the parameter map so the caller can propagate it.
   */
  public getPresetParameters(presetId: string): Map<string, number> | null {
    const preset = this.getPreset(presetId);
    if (!preset) return null;
    return new Map(preset.parameters);
  }

  // ─── Save / Delete Custom ─────────────────────────────────────────────────

  /**
   * Save a custom preset. Returns the new preset ID.
   */
  public savePreset(
    name: string,
    pluginId: string,
    parameters: Map<string, number>,
  ): string {
    const id = `custom-${crypto.randomUUID()}`;
    const preset: PluginPreset = { id, name, pluginId, parameters };
    this.customPresets.push(preset);
    this.persistCustomPresets();
    return id;
  }

  /**
   * Delete a custom preset by ID.
   */
  public deletePreset(presetId: string): boolean {
    const idx = this.customPresets.findIndex((p) => p.id === presetId);
    if (idx === -1) return false;
    this.customPresets.splice(idx, 1);
    this.persistCustomPresets();
    return true;
  }

  // ─── Built-In Presets ─────────────────────────────────────────────────────

  private initBuiltInPresets(): void {
    // Reverb presets
    this.builtInPresets.push(
      makePreset("preset-reverb-small-room", "Small Room", "internal-reverb", {
        decay: 0.8,
        preDelay: 0.005,
        wet: 0.3,
      }),
      makePreset("preset-reverb-large-hall", "Large Hall", "internal-reverb", {
        decay: 4.0,
        preDelay: 0.03,
        wet: 0.5,
      }),
      makePreset("preset-reverb-plate", "Plate", "internal-reverb", {
        decay: 2.0,
        preDelay: 0.01,
        wet: 0.45,
      }),
    );

    // Delay presets
    this.builtInPresets.push(
      makePreset("preset-delay-slapback", "Slapback", "internal-delay", {
        delayTime: 0.08,
        feedback: 0.1,
        wet: 0.4,
      }),
      makePreset("preset-delay-quarter", "Quarter Note", "internal-delay", {
        delayTime: 0.5,
        feedback: 0.35,
        wet: 0.35,
      }),
      makePreset("preset-delay-long", "Long Echo", "internal-delay", {
        delayTime: 1.0,
        feedback: 0.6,
        wet: 0.3,
      }),
    );

    // EQ presets
    this.builtInPresets.push(
      makePreset("preset-eq3-vocal", "Vocal Presence", "internal-eq3", {
        lowFreq: 150,
        lowGain: -3,
        midFreq: 2500,
        midGain: 4,
        midQ: 1.5,
        highFreq: 8000,
        highGain: 2,
      }),
      makePreset("preset-eq3-bass-cut", "Bass Cut", "internal-eq3", {
        lowFreq: 200,
        lowGain: -12,
        midFreq: 1000,
        midGain: 0,
        midQ: 1,
        highFreq: 5000,
        highGain: 0,
      }),
    );

    // Compressor presets
    this.builtInPresets.push(
      makePreset("preset-comp-gentle", "Gentle", "internal-compressor", {
        threshold: -18,
        ratio: 2,
        attack: 0.01,
        release: 0.2,
        knee: 30,
        makeupGain: 3,
      }),
      makePreset(
        "preset-comp-aggressive",
        "Aggressive",
        "internal-compressor",
        {
          threshold: -30,
          ratio: 8,
          attack: 0.001,
          release: 0.1,
          knee: 10,
          makeupGain: 8,
        },
      ),
      makePreset("preset-comp-limiter", "Limiter", "internal-compressor", {
        threshold: -6,
        ratio: 20,
        attack: 0.0005,
        release: 0.05,
        knee: 0,
        makeupGain: 0,
      }),
    );

    // Chorus presets
    this.builtInPresets.push(
      makePreset("preset-chorus-subtle", "Subtle", "internal-chorus", {
        frequency: 0.5,
        delayTime: 3,
        depth: 0.3,
        wet: 0.3,
      }),
      makePreset("preset-chorus-wide", "Wide", "internal-chorus", {
        frequency: 1.2,
        delayTime: 5,
        depth: 0.8,
        wet: 0.5,
      }),
    );

    // Distortion presets
    this.builtInPresets.push(
      makePreset(
        "preset-distortion-light",
        "Light Overdrive",
        "internal-distortion",
        {
          distortion: 0.15,
          wet: 0.8,
        },
      ),
      makePreset("preset-distortion-heavy", "Heavy", "internal-distortion", {
        distortion: 0.7,
        wet: 1,
      }),
    );

    // Filter presets
    this.builtInPresets.push(
      makePreset("preset-filter-lowpass", "Warm Lowpass", "internal-filter", {
        frequency: 800,
        Q: 0.7,
        type: 0,
      }),
      makePreset("preset-filter-highpass", "High Pass", "internal-filter", {
        frequency: 300,
        Q: 0.7,
        type: 1,
      }),
    );

    // 6-Band EQ presets
    this.builtInPresets.push(
      makePreset("preset-eq6-vocal", "Vocal Clarity", "internal-eq6", {
        band1Freq: 100,
        band1Gain: -3,
        band2Freq: 300,
        band2Gain: -2,
        band2Q: 1.5,
        band3Freq: 2000,
        band3Gain: 3,
        band3Q: 1.2,
        band4Freq: 4000,
        band4Gain: 2,
        band4Q: 1,
        band5Freq: 8000,
        band5Gain: 1,
        band5Q: 0.8,
        band6Freq: 12000,
        band6Gain: 2,
      }),
      makePreset("preset-eq6-bass-boost", "Bass Boost", "internal-eq6", {
        band1Freq: 80,
        band1Gain: 6,
        band2Freq: 200,
        band2Gain: 3,
        band2Q: 1,
        band3Freq: 1000,
        band3Gain: 0,
        band3Q: 1,
        band4Freq: 2500,
        band4Gain: 0,
        band4Q: 1,
        band5Freq: 6300,
        band5Gain: 0,
        band5Q: 1,
        band6Freq: 9000,
        band6Gain: -2,
      }),
      makePreset("preset-eq6-bright", "Bright", "internal-eq6", {
        band1Freq: 160,
        band1Gain: -2,
        band2Freq: 397,
        band2Gain: 0,
        band2Q: 1,
        band3Freq: 1000,
        band3Gain: 0,
        band3Q: 1,
        band4Freq: 3000,
        band4Gain: 2,
        band4Q: 1,
        band5Freq: 8000,
        band5Gain: 4,
        band5Q: 0.7,
        band6Freq: 12000,
        band6Gain: 5,
      }),
    );

    // Gate presets
    this.builtInPresets.push(
      makePreset("preset-gate-gentle", "Gentle", "internal-gate", {
        threshold: -50,
        ratio: 2,
        attack: 10,
        release: 150,
        knee: 6,
        range: -20,
      }),
      makePreset("preset-gate-tight", "Tight", "internal-gate", {
        threshold: -30,
        ratio: 10,
        attack: 1,
        release: 50,
        knee: 0,
        range: -60,
      }),
      makePreset("preset-gate-drum", "Drum Gate", "internal-gate", {
        threshold: -25,
        ratio: 20,
        attack: 0.5,
        release: 50,
        knee: 0,
        range: -90,
      }),
    );

    // Multiband Compressor presets
    this.builtInPresets.push(
      makePreset("preset-mbc-master", "Mastering", "internal-multiband-comp", {
        lowThreshold: -18,
        lowRatio: 2,
        lowAttack: 0.01,
        lowRelease: 0.2,
        midThreshold: -20,
        midRatio: 3,
        midAttack: 0.005,
        midRelease: 0.15,
        highThreshold: -22,
        highRatio: 3,
        highAttack: 0.003,
        highRelease: 0.1,
        lowFrequency: 200,
        highFrequency: 4000,
      }),
      makePreset("preset-mbc-balanced", "Balanced", "internal-multiband-comp", {
        lowThreshold: -24,
        lowRatio: 4,
        lowAttack: 0.003,
        lowRelease: 0.25,
        midThreshold: -24,
        midRatio: 4,
        midAttack: 0.003,
        midRelease: 0.25,
        highThreshold: -24,
        highRatio: 4,
        highAttack: 0.003,
        highRelease: 0.25,
        lowFrequency: 250,
        highFrequency: 4000,
      }),
    );

    // Phaser presets
    this.builtInPresets.push(
      makePreset("preset-phaser-slow", "Slow Sweep", "internal-phaser", {
        frequency: 0.3,
        octaves: 3,
        baseFrequency: 350,
        wet: 0.5,
      }),
      makePreset("preset-phaser-fast", "Fast Phase", "internal-phaser", {
        frequency: 2,
        octaves: 2,
        baseFrequency: 500,
        wet: 0.6,
      }),
    );

    // Tremolo presets
    this.builtInPresets.push(
      makePreset("preset-tremolo-gentle", "Gentle", "internal-tremolo", {
        frequency: 3,
        depth: 0.3,
        type: 0,
        wet: 1,
      }),
      makePreset("preset-tremolo-choppy", "Choppy", "internal-tremolo", {
        frequency: 8,
        depth: 0.8,
        type: 1,
        wet: 1,
      }),
    );

    // Vibrato presets
    this.builtInPresets.push(
      makePreset("preset-vibrato-subtle", "Subtle", "internal-vibrato", {
        frequency: 5,
        depth: 0.05,
        wet: 1,
      }),
      makePreset("preset-vibrato-wide", "Wide", "internal-vibrato", {
        frequency: 6,
        depth: 0.2,
        wet: 0.8,
      }),
    );

    // Auto-Pan presets
    this.builtInPresets.push(
      makePreset("preset-autopan-slow", "Slow Pan", "internal-autopan", {
        frequency: 0.5,
        depth: 0.8,
        wet: 1,
      }),
      makePreset("preset-autopan-fast", "Fast Pan", "internal-autopan", {
        frequency: 4,
        depth: 1,
        wet: 1,
      }),
    );

    // Tape Saturation presets
    this.builtInPresets.push(
      makePreset("preset-tape-warm", "Warm", "internal-tape-sat", {
        drive: 0.35,
        warmth: 0.7,
        saturation: 0.4,
        wet: 0.3,
      }),
      makePreset("preset-tape-hot", "Hot", "internal-tape-sat", {
        drive: 0.7,
        warmth: 0.55,
        saturation: 0.7,
        wet: 0.5,
      }),
      makePreset("preset-tape-saturated", "Saturated", "internal-tape-sat", {
        drive: 0.9,
        warmth: 0.8,
        saturation: 0.85,
        wet: 0.7,
      }),
    );

    // 6-Band Parametric EQ presets (G-1)
    this.builtInPresets.push(
      makePreset("preset-eq6-flat", "Flat", "internal-eq6", {
        band1Freq: 160,
        band1Gain: 0,
        band2Freq: 397,
        band2Gain: 0,
        band2Q: 1,
        band3Freq: 1000,
        band3Gain: 0,
        band3Q: 1,
        band4Freq: 2500,
        band4Gain: 0,
        band4Q: 1,
        band5Freq: 6300,
        band5Gain: 0,
        band5Q: 1,
        band6Freq: 9000,
        band6Gain: 0,
      }),
      makePreset(
        "preset-eq6-vocal-presence",
        "Vocal Presence",
        "internal-eq6",
        {
          band1Freq: 120,
          band1Gain: -4,
          band2Freq: 300,
          band2Gain: -2,
          band2Q: 1.5,
          band3Freq: 2000,
          band3Gain: 3,
          band3Q: 1.2,
          band4Freq: 3500,
          band4Gain: 4,
          band4Q: 1.5,
          band5Freq: 8000,
          band5Gain: 2,
          band5Q: 1,
          band6Freq: 12000,
          band6Gain: 1.5,
        },
      ),
      makePreset("preset-eq6-bass-boost-modern", "Bass Boost", "internal-eq6", {
        band1Freq: 80,
        band1Gain: 6,
        band2Freq: 250,
        band2Gain: 3,
        band2Q: 0.8,
        band3Freq: 1000,
        band3Gain: 0,
        band3Q: 1,
        band4Freq: 2500,
        band4Gain: 0,
        band4Q: 1,
        band5Freq: 6300,
        band5Gain: 0,
        band5Q: 1,
        band6Freq: 9000,
        band6Gain: -2,
      }),
    );

    // Expander / Gate presets (G-3)
    this.builtInPresets.push(
      makePreset("preset-exp-gentle", "Gentle Expansion", "internal-expander", {
        threshold: -30,
        ratio: 2,
        attack: 10,
        release: 100,
        knee: 6,
        range: -20,
      }),
      makePreset("preset-gate-noise", "Noise Gate", "internal-gate", {
        threshold: -40,
        ratio: 20,
        attack: 0.5,
        release: 50,
        knee: 0,
        range: -90,
      }),
      makePreset("preset-gate-drum-tight", "Drum Gate", "internal-gate", {
        threshold: -20,
        ratio: 20,
        attack: 0.1,
        release: 50,
        knee: 0,
        range: -90,
      }),
    );

    // Phaser presets (G-6)
    this.builtInPresets.push(
      makePreset("preset-phaser-subtle", "Subtle Sweep", "internal-phaser", {
        frequency: 0.4,
        octaves: 2,
        baseFrequency: 800,
        wet: 0.35,
      }),
      makePreset("preset-phaser-deep", "Deep Phase", "internal-phaser", {
        frequency: 1.2,
        octaves: 4,
        baseFrequency: 1200,
        wet: 0.6,
      }),
    );

    // Tremolo presets (G-6)
    this.builtInPresets.push(
      makePreset(
        "preset-tremolo-gentle-motion",
        "Gentle Tremolo",
        "internal-tremolo",
        { frequency: 3.0, depth: 0.3, type: 0, wet: 1.0 },
      ),
      makePreset("preset-tremolo-fast", "Fast Chop", "internal-tremolo", {
        frequency: 12.0,
        depth: 0.9,
        type: 1,
        wet: 1.0,
      }),
    );

    // Vibrato presets (G-6)
    this.builtInPresets.push(
      makePreset("preset-vibrato-light", "Light Vibrato", "internal-vibrato", {
        frequency: 4.0,
        depth: 0.05,
        wet: 1.0,
      }),
      makePreset("preset-vibrato-heavy", "Heavy Vibrato", "internal-vibrato", {
        frequency: 6.0,
        depth: 0.2,
        wet: 1.0,
      }),
    );

    // Auto-Pan presets (G-6)
    this.builtInPresets.push(
      makePreset("preset-autopan-slow-wide", "Slow Pan", "internal-autopan", {
        frequency: 0.5,
        depth: 0.8,
        wet: 1.0,
      }),
      makePreset("preset-autopan-fast-wide", "Fast Pan", "internal-autopan", {
        frequency: 4.0,
        depth: 1.0,
        wet: 1.0,
      }),
    );

    // Sync Delay presets (G-7)
    this.builtInPresets.push(
      makePreset(
        "preset-syncdelay-quarter",
        "Quarter Note",
        "internal-sync-delay",
        { sync: 1, divisor: 0, feedback: 0.3, lpf: 8000, wet: 0.4 },
      ),
      makePreset(
        "preset-syncdelay-eighth",
        "Eighth Note",
        "internal-sync-delay",
        { sync: 1, divisor: 1, feedback: 0.35, lpf: 6000, wet: 0.35 },
      ),
      makePreset(
        "preset-syncdelay-dotted",
        "Dotted Eighth",
        "internal-sync-delay",
        { sync: 1, divisor: 3, feedback: 0.4, lpf: 5000, wet: 0.3 },
      ),
    );

    // Convolution Reverb presets (G-8)
    this.builtInPresets.push(
      makePreset("preset-conv-room", "Small Room", "internal-convolver", {
        wet: 0.3,
        preDelay: 5,
        irType: 0,
      }),
      makePreset("preset-conv-hall", "Concert Hall", "internal-convolver", {
        wet: 0.4,
        preDelay: 20,
        irType: 1,
      }),
      makePreset("preset-conv-plate", "Plate Reverb", "internal-convolver", {
        wet: 0.35,
        preDelay: 0,
        irType: 2,
      }),
    );

    // De-Esser presets (I-1)
    this.builtInPresets.push(
      makePreset("preset-deesser-subtle", "Subtle", "internal-deesser", {
        frequency: 6000,
        threshold: -15,
        reduction: 4,
        listenMode: 0,
      }),
      makePreset("preset-deesser-moderate", "Moderate", "internal-deesser", {
        frequency: 6500,
        threshold: -20,
        reduction: 8,
        listenMode: 0,
      }),
      makePreset(
        "preset-deesser-aggressive",
        "Aggressive",
        "internal-deesser",
        { frequency: 7000, threshold: -28, reduction: 14, listenMode: 0 },
      ),
    );

    // Multiband Compressor presets (I-2)
    this.builtInPresets.push(
      makePreset(
        "preset-mbcomp-mastering",
        "Mastering",
        "internal-multiband-comp",
        {
          lowFrequency: 200,
          highFrequency: 4000,
          lowThreshold: -18,
          lowRatio: 2,
          lowAttack: 0.02,
          lowRelease: 0.3,
          midThreshold: -16,
          midRatio: 2,
          midAttack: 0.008,
          midRelease: 0.2,
          highThreshold: -14,
          highRatio: 1.5,
          highAttack: 0.005,
          highRelease: 0.15,
        },
      ),
      makePreset("preset-mbcomp-gentle", "Gentle", "internal-multiband-comp", {
        lowFrequency: 250,
        highFrequency: 3500,
        lowThreshold: -24,
        lowRatio: 1.5,
        lowAttack: 0.03,
        lowRelease: 0.4,
        midThreshold: -22,
        midRatio: 1.5,
        midAttack: 0.015,
        midRelease: 0.3,
        highThreshold: -20,
        highRatio: 1.5,
        highAttack: 0.008,
        highRelease: 0.2,
      }),
    );
  }

  // ─── Persistence (localStorage) ───────────────────────────────────────────

  private persistCustomPresets(): void {
    try {
      if (typeof localStorage === "undefined") return;
      const snapshots: PluginPresetSnapshot[] = this.customPresets.map((p) => ({
        id: p.id,
        name: p.name,
        pluginId: p.pluginId,
        parameters: Object.fromEntries(p.parameters),
      }));
      localStorage.setItem(
        PLUGIN_PRESET_STORAGE_KEY,
        JSON.stringify(snapshots),
      );
    } catch {
      // localStorage unavailable or quota exceeded – silently ignore
    }
  }

  private loadCustomPresets(): void {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(PLUGIN_PRESET_STORAGE_KEY);
      if (!raw) return;
      const snapshots: PluginPresetSnapshot[] = JSON.parse(raw);
      this.customPresets = snapshots.map((s) => ({
        id: s.id,
        name: s.name,
        pluginId: s.pluginId,
        parameters: new Map(Object.entries(s.parameters)),
      }));
    } catch {
      // Corrupted data – start fresh
      this.customPresets = [];
    }
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function makePreset(
  id: string,
  name: string,
  pluginId: string,
  params: Record<string, number>,
): PluginPreset {
  return {
    id,
    name,
    pluginId,
    parameters: new Map(Object.entries(params)),
  };
}
