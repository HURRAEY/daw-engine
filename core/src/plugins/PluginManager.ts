import { Plugin, PluginId, PluginType } from "./Plugin";
import { GenericPlugin } from "./impl/GenericPlugin";
import { initParametricEQParameters } from "./impl/ParametricEQPlugin";
import {
  initExpanderParameters,
  EXPANDER_DEFAULTS,
  GATE_DEFAULTS,
} from "./impl/ExpanderPlugin";
import { SyncDelayPlugin } from "./impl/SyncDelayPlugin";
import { ConvolutionReverbPlugin } from "./impl/ConvolutionReverbPlugin";

export interface PluginDescriptor {
  id: string; // Type ID (e.g., 'reverb', 'delay')
  name: string;
  type: PluginType;
}

export interface PluginSnapshotIdentity {
  descriptorId: string;
  instanceId: PluginId;
  name: string;
  type: PluginType;
}

export class PluginManager {
  private static instance: PluginManager;
  private availablePlugins: PluginDescriptor[] = [
    { id: "internal-reverb", name: "Reverb", type: PluginType.EFFECT },
    { id: "internal-delay", name: "Delay", type: PluginType.EFFECT },
    { id: "internal-eq3", name: "3-Band EQ", type: PluginType.EFFECT },
    { id: "internal-compressor", name: "Compressor", type: PluginType.EFFECT },
    { id: "internal-gain", name: "Gain (Utility)", type: PluginType.EFFECT },
    { id: "internal-chorus", name: "Chorus", type: PluginType.EFFECT },
    { id: "internal-distortion", name: "Distortion", type: PluginType.EFFECT },
    { id: "internal-filter", name: "Filter", type: PluginType.EFFECT },
    {
      id: "internal-eq6",
      name: "6-Band Parametric EQ",
      type: PluginType.EFFECT,
    },
    { id: "internal-expander", name: "Expander", type: PluginType.EFFECT },
    { id: "internal-gate", name: "Gate", type: PluginType.EFFECT },
    { id: "internal-deesser", name: "De-Esser", type: PluginType.EFFECT },
    {
      id: "internal-multiband-comp",
      name: "Multiband Compressor",
      type: PluginType.EFFECT,
    },
    { id: "internal-phaser", name: "Phaser", type: PluginType.EFFECT },
    { id: "internal-tremolo", name: "Tremolo", type: PluginType.EFFECT },
    { id: "internal-vibrato", name: "Vibrato", type: PluginType.EFFECT },
    { id: "internal-autopan", name: "Auto-Pan", type: PluginType.EFFECT },
    {
      id: "internal-tape-sat",
      name: "Tape Saturation",
      type: PluginType.EFFECT,
    },
    { id: "internal-sync-delay", name: "Sync Delay", type: PluginType.EFFECT },
    {
      id: "internal-convolver",
      name: "Convolution Reverb",
      type: PluginType.EFFECT,
    },
  ];

  private constructor() {}

  public static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  public getAvailablePlugins(): ReadonlyArray<PluginDescriptor> {
    return this.availablePlugins;
  }

  public createPlugin(
    descriptorId: string,
    instanceId?: PluginId,
  ): Plugin | null {
    const desc = this.availablePlugins.find((p) => p.id === descriptorId);
    if (!desc) return null;

    const plugin = new GenericPlugin(
      instanceId ?? (crypto.randomUUID() as PluginId),
      desc.name,
      desc.type,
    );
    // Store the descriptor ID for backend node creation
    (plugin as GenericPlugin & { descriptorId: string }).descriptorId =
      descriptorId;

    // Initialize default parameters based on type
    switch (descriptorId) {
      case "internal-reverb":
        plugin.addParameter({
          id: "decay",
          name: "Decay",
          value: 1.5,
          min: 0.1,
          max: 10,
          step: 0.1,
        });
        plugin.addParameter({
          id: "preDelay",
          name: "Pre-Delay",
          value: 0.01,
          min: 0,
          max: 0.1,
          step: 0.01,
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 0.5,
          min: 0,
          max: 1,
          step: 0.01,
        });
        break;

      case "internal-delay":
        plugin.addParameter({
          id: "delayTime",
          name: "Time",
          value: 0.5,
          min: 0,
          max: 2,
          step: 0.01,
        });
        plugin.addParameter({
          id: "feedback",
          name: "Feedback",
          value: 0.3,
          min: 0,
          max: 0.95,
          step: 0.01,
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 0.5,
          min: 0,
          max: 1,
          step: 0.01,
        });
        break;

      case "internal-eq3":
        // 3-Band Parametric EQ
        plugin.addParameter({
          id: "lowFreq",
          name: "Low Freq",
          value: 200,
          min: 20,
          max: 500,
          step: 1,
        });
        plugin.addParameter({
          id: "lowGain",
          name: "Low Gain",
          value: 0,
          min: -24,
          max: 24,
          step: 0.5,
        });
        plugin.addParameter({
          id: "midFreq",
          name: "Mid Freq",
          value: 1000,
          min: 200,
          max: 5000,
          step: 1,
        });
        plugin.addParameter({
          id: "midGain",
          name: "Mid Gain",
          value: 0,
          min: -24,
          max: 24,
          step: 0.5,
        });
        plugin.addParameter({
          id: "midQ",
          name: "Mid Q",
          value: 1,
          min: 0.1,
          max: 10,
          step: 0.1,
        });
        plugin.addParameter({
          id: "highFreq",
          name: "High Freq",
          value: 5000,
          min: 2000,
          max: 20000,
          step: 1,
        });
        plugin.addParameter({
          id: "highGain",
          name: "High Gain",
          value: 0,
          min: -24,
          max: 24,
          step: 0.5,
        });
        break;

      case "internal-compressor":
        // DynamicsCompressor
        plugin.addParameter({
          id: "threshold",
          name: "Threshold",
          value: -24,
          min: -60,
          max: 0,
          step: 0.5,
        });
        plugin.addParameter({
          id: "ratio",
          name: "Ratio",
          value: 4,
          min: 1,
          max: 20,
          step: 0.5,
        });
        plugin.addParameter({
          id: "attack",
          name: "Attack",
          value: 0.003,
          min: 0,
          max: 1,
          step: 0.001,
        });
        plugin.addParameter({
          id: "release",
          name: "Release",
          value: 0.25,
          min: 0,
          max: 1,
          step: 0.001,
        });
        plugin.addParameter({
          id: "knee",
          name: "Knee",
          value: 30,
          min: 0,
          max: 40,
          step: 1,
        });
        plugin.addParameter({
          id: "makeupGain",
          name: "Makeup Gain",
          value: 0,
          min: 0,
          max: 24,
          step: 0.5,
        });
        break;

      case "internal-gain":
        // Simple Gain Utility
        plugin.addParameter({
          id: "gain",
          name: "Gain",
          value: 0,
          min: -60,
          max: 24,
          step: 0.5,
        });
        break;

      case "internal-chorus":
        plugin.addParameter({
          id: "frequency",
          name: "Rate",
          value: 1.5,
          min: 0.1,
          max: 10,
          step: 0.1,
        });
        plugin.addParameter({
          id: "delayTime",
          name: "Delay",
          value: 3.5,
          min: 2,
          max: 20,
          step: 0.5,
        });
        plugin.addParameter({
          id: "depth",
          name: "Depth",
          value: 0.7,
          min: 0,
          max: 1,
          step: 0.01,
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 0.5,
          min: 0,
          max: 1,
          step: 0.01,
        });
        break;

      case "internal-distortion":
        plugin.addParameter({
          id: "distortion",
          name: "Drive",
          value: 0.4,
          min: 0,
          max: 1,
          step: 0.01,
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 1,
          min: 0,
          max: 1,
          step: 0.01,
        });
        break;

      case "internal-filter":
        plugin.addParameter({
          id: "frequency",
          name: "Frequency",
          value: 1000,
          min: 20,
          max: 20000,
          step: 1,
        });
        plugin.addParameter({
          id: "Q",
          name: "Resonance",
          value: 1,
          min: 0.1,
          max: 20,
          step: 0.1,
        });
        plugin.addParameter({
          id: "type",
          name: "Type",
          value: 0,
          min: 0,
          max: 3,
          step: 1,
        }); // 0=lowpass, 1=highpass, 2=bandpass, 3=notch
        break;

      case "internal-eq6":
        initParametricEQParameters(plugin);
        break;

      case "internal-expander":
        initExpanderParameters(plugin, EXPANDER_DEFAULTS);
        break;

      case "internal-gate":
        initExpanderParameters(plugin, GATE_DEFAULTS);
        break;

      case "internal-deesser":
        plugin.addParameter({
          id: "frequency",
          name: "Frequency",
          value: 6000,
          min: 2000,
          max: 12000,
          step: 100,
        });
        plugin.addParameter({
          id: "threshold",
          name: "Threshold",
          value: -20,
          min: -40,
          max: 0,
          step: 0.5,
        });
        plugin.addParameter({
          id: "reduction",
          name: "Reduction",
          value: 6,
          min: 0,
          max: 20,
          step: 0.5,
        });
        plugin.addParameter({
          id: "listenMode",
          name: "Listen",
          value: 0,
          min: 0,
          max: 1,
          step: 1,
        });
        break;

      case "internal-multiband-comp":
        // Low band
        plugin.addParameter({
          id: "lowThreshold",
          name: "Low Threshold",
          value: -24,
          min: -60,
          max: 0,
          step: 0.5,
        });
        plugin.addParameter({
          id: "lowRatio",
          name: "Low Ratio",
          value: 4,
          min: 1,
          max: 20,
          step: 0.5,
        });
        plugin.addParameter({
          id: "lowAttack",
          name: "Low Attack",
          value: 0.003,
          min: 0,
          max: 1,
          step: 0.001,
        });
        plugin.addParameter({
          id: "lowRelease",
          name: "Low Release",
          value: 0.25,
          min: 0,
          max: 1,
          step: 0.001,
        });
        // Mid band
        plugin.addParameter({
          id: "midThreshold",
          name: "Mid Threshold",
          value: -24,
          min: -60,
          max: 0,
          step: 0.5,
        });
        plugin.addParameter({
          id: "midRatio",
          name: "Mid Ratio",
          value: 4,
          min: 1,
          max: 20,
          step: 0.5,
        });
        plugin.addParameter({
          id: "midAttack",
          name: "Mid Attack",
          value: 0.003,
          min: 0,
          max: 1,
          step: 0.001,
        });
        plugin.addParameter({
          id: "midRelease",
          name: "Mid Release",
          value: 0.25,
          min: 0,
          max: 1,
          step: 0.001,
        });
        // High band
        plugin.addParameter({
          id: "highThreshold",
          name: "High Threshold",
          value: -24,
          min: -60,
          max: 0,
          step: 0.5,
        });
        plugin.addParameter({
          id: "highRatio",
          name: "High Ratio",
          value: 4,
          min: 1,
          max: 20,
          step: 0.5,
        });
        plugin.addParameter({
          id: "highAttack",
          name: "High Attack",
          value: 0.003,
          min: 0,
          max: 1,
          step: 0.001,
        });
        plugin.addParameter({
          id: "highRelease",
          name: "High Release",
          value: 0.25,
          min: 0,
          max: 1,
          step: 0.001,
        });
        // Crossover frequencies
        plugin.addParameter({
          id: "lowFrequency",
          name: "Low Crossover",
          value: 250,
          min: 20,
          max: 500,
          step: 1,
        });
        plugin.addParameter({
          id: "highFrequency",
          name: "High Crossover",
          value: 4000,
          min: 2000,
          max: 16000,
          step: 1,
        });
        break;

      case "internal-phaser":
        plugin.addParameter({
          id: "frequency",
          name: "Rate",
          value: 0.5,
          min: 0.1,
          max: 10,
          step: 0.1,
        });
        plugin.addParameter({
          id: "octaves",
          name: "Octaves",
          value: 3,
          min: 1,
          max: 6,
          step: 1,
        });
        plugin.addParameter({
          id: "baseFrequency",
          name: "Base Freq",
          value: 350,
          min: 100,
          max: 3000,
          step: 1,
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 0.5,
          min: 0,
          max: 1,
          step: 0.01,
        });
        break;

      case "internal-tremolo":
        plugin.addParameter({
          id: "frequency",
          name: "Rate",
          value: 4,
          min: 0.1,
          max: 20,
          step: 0.1,
        });
        plugin.addParameter({
          id: "depth",
          name: "Depth",
          value: 0.5,
          min: 0,
          max: 1,
          step: 0.01,
        });
        plugin.addParameter({
          id: "type",
          name: "Type",
          value: 0,
          min: 0,
          max: 3,
          step: 1,
        }); // 0=sine, 1=square, 2=triangle, 3=sawtooth
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 1,
          min: 0,
          max: 1,
          step: 0.01,
        });
        break;

      case "internal-vibrato":
        plugin.addParameter({
          id: "frequency",
          name: "Rate",
          value: 5,
          min: 0.1,
          max: 20,
          step: 0.1,
        });
        plugin.addParameter({
          id: "depth",
          name: "Depth",
          value: 0.1,
          min: 0,
          max: 1,
          step: 0.01,
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 1,
          min: 0,
          max: 1,
          step: 0.01,
        });
        break;

      case "internal-autopan":
        plugin.addParameter({
          id: "frequency",
          name: "Rate",
          value: 1,
          min: 0.1,
          max: 20,
          step: 0.1,
        });
        plugin.addParameter({
          id: "depth",
          name: "Depth",
          value: 1,
          min: 0,
          max: 1,
          step: 0.01,
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 1,
          min: 0,
          max: 1,
          step: 0.01,
        });
        break;

      case "internal-tape-sat":
        plugin.addParameter({
          id: "drive",
          name: "Drive",
          value: 0.3,
          min: 0,
          max: 1,
          step: 0.01,
        });
        plugin.addParameter({
          id: "warmth",
          name: "Warmth",
          value: 0.4,
          min: 0,
          max: 1,
          step: 0.01,
        });
        plugin.addParameter({
          id: "saturation",
          name: "Saturation",
          value: 0.3,
          min: 0,
          max: 1,
          step: 0.01,
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 0.5,
          min: 0,
          max: 1,
          step: 0.01,
        });
        break;

      case "internal-sync-delay": {
        const syncDelay = new SyncDelayPlugin(
          instanceId ?? (crypto.randomUUID() as PluginId),
          desc.name,
          desc.type,
        );
        (syncDelay as SyncDelayPlugin & { descriptorId: string }).descriptorId =
          descriptorId;
        return syncDelay;
      }

      case "internal-convolver": {
        const convolver = new ConvolutionReverbPlugin(
          instanceId ?? (crypto.randomUUID() as PluginId),
          desc.name,
          desc.type,
        );
        (
          convolver as ConvolutionReverbPlugin & { descriptorId: string }
        ).descriptorId = descriptorId;
        return convolver;
      }
    }

    return plugin;
  }

  public createPluginFromSnapshot(snapshot: PluginSnapshotIdentity): Plugin {
    const registeredPlugin = this.createPlugin(
      snapshot.descriptorId,
      snapshot.instanceId,
    );
    if (registeredPlugin?.type === snapshot.type) {
      return registeredPlugin;
    }

    const fallbackPlugin = new GenericPlugin(
      snapshot.instanceId,
      snapshot.name,
      snapshot.type,
    );
    (fallbackPlugin as GenericPlugin & { descriptorId: string }).descriptorId =
      snapshot.descriptorId;
    return fallbackPlugin;
  }
}
