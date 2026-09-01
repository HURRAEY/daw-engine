import { AudioProvider } from "./AudioProvider";
import { Session, SessionSnapshot } from "../domain/Session";
import { Track, TrackType } from "../domain/Track";
import { Region } from "../domain/Region";
import { MidiRegion } from "../domain/MidiRegion";
import { MidiNote } from "../domain/MidiNote";
import { RegionDTO, MidiRegionDTO } from "./dto";
import { RegionId } from "../domain/types";
import { ExportConfig } from "../domain/ExportConfig";
import { ExportStatus } from "../domain/ExportStatus";
import { MeterData } from "../domain/MeterData";
import {
  MidiInput,
  MidiNoteOnEvent,
  MidiNoteOffEvent,
} from "../midi/MidiInput";
import { Processor } from "../processing/Processor";
import { GainProcessor } from "../processing/GainProcessor";
import { PanProcessor } from "../processing/PanProcessor";
import { Panner } from "../processing/Panner";
import { PolarityProcessor } from "../processing/PolarityProcessor";
import { SendProcessor } from "../processing/SendProcessor";
import { PluginInsert } from "../processing/PluginInsert";
import { AutomationList } from "../automation/AutomationList";
import { SendBus } from "../domain/SendBus";
import { Source } from "../domain/Source";
import { MonitorMode } from "../domain/MonitorMode";
import { logger } from "../utils/Logger";
import {
  createRoutingSnapshot,
  getProcessorRuntimeType,
} from "./engine/RoutingSnapshot";

interface StopBackendRequest {
  readonly session: Session;
  readonly backend: AudioProvider;
  readonly pendingStart: Promise<void> | null;
}

export class AudioEngine {
  private static instance: AudioEngine | undefined;
  private backend: AudioProvider;
  public session: Session;
  private disposed = false;
  private isBackendTransportRunning = false;
  private transportStartPromise: Promise<void> | null = null;
  private transportStopPromise: Promise<void> | null = null;

  // MIDI Recording State
  private midiInput: MidiInput;
  private midiRecordingNotes: Map<
    string,
    { pitch: number; velocity: number; channel: number; startFrame: number }
  > = new Map();
  private midiRecordedNotes: MidiNote[] = [];
  private midiNoteOnSub: { dispose: () => void } | null = null;
  private midiNoteOffSub: { dispose: () => void } | null = null;

  /** Signal disconnect handles for cleanup on dispose */
  private signalDisposers: Array<{ dispose: () => void }> = [];
  /** Per-track signal disposers — cleaned up when a track is removed */
  private trackDisposers: Map<string, Array<{ dispose: () => void }>> =
    new Map();
  private masterProcessorDisposers: Map<
    string,
    Array<{ dispose: () => void }>
  > = new Map();
  /** Per-SendBus signal disposers — cleaned up when a send bus is removed */
  private sendBusDisposers: Map<string, Array<{ dispose: () => void }>> =
    new Map();

  private constructor(backend: AudioProvider) {
    this.session = new Session("Untitled Session");
    this.backend = backend;
    this.midiInput = MidiInput.getInstance();

    // backend가 현재 Session 전체를 먼저 구성한 뒤 이후 변경만 signal로 전달한다.
    this.syncSessionGraphToBackend();
    this.setupSessionListeners();
  }

  public static getInstance(backend?: AudioProvider): AudioEngine {
    if (!AudioEngine.instance) {
      if (!backend)
        throw new Error(
          "AudioEngine requires a backend on first initialization",
        );
      AudioEngine.instance = new AudioEngine(backend);
    }
    return AudioEngine.instance;
  }

  /**
   * 호출자가 생명주기를 소유하는 독립 엔진을 만듭니다.
   *
   * 브라우저 앱은 격리된 Composition Root를 둘 이상 만들 수 있으므로
   * getInstance()가 반환하는 프로세스 전역 인스턴스를 공유하지 않습니다.
   */
  public static create(backend: AudioProvider): AudioEngine {
    return new AudioEngine(backend);
  }

  /** Reset the singleton instance. For testing only. */
  public static resetInstance(): void {
    if (AudioEngine.instance) {
      AudioEngine.instance.dispose();
    }
    AudioEngine.instance = undefined;
  }

  /** Dispose all listeners and internal state to prevent memory leaks. */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stopMidiRecording();
    if (this.syncId !== null) {
      this.cancelFrame(this.syncId);
      this.syncId = null;
    }
    this.disconnectSessionSignals();
  }

  private disconnectSessionSignals(): void {
    this.signalDisposers.forEach((disposer) => disposer.dispose());
    this.signalDisposers = [];
    this.trackDisposers.forEach((disposers) =>
      disposers.forEach((disposer) => disposer.dispose()),
    );
    this.trackDisposers.clear();
    this.masterProcessorDisposers.forEach((disposers) =>
      disposers.forEach((disposer) => disposer.dispose()),
    );
    this.masterProcessorDisposers.clear();
    this.sendBusDisposers.forEach((disposers) =>
      disposers.forEach((disposer) => disposer.dispose()),
    );
    this.sendBusDisposers.clear();
  }

  public async setBackend(backend: AudioProvider): Promise<void> {
    this.backend = backend;
    this.isBackendTransportRunning = false;
    if (this.session.sources.size > 0) {
      await this.addSessionSourcesToBackend(this.session);
    }
    this.syncSessionGraphToBackend();
  }

  /**
   * Pre-cache a decoded AudioBuffer so subsequent addSource/getAudioBuffer
   * calls for the same URL hit the cache instead of re-fetching.
   * Useful when the source was loaded from a blob URL that will be revoked.
   */
  public precacheAudioBuffer(url: string, buffer: AudioBuffer): void {
    this.backend.addAudioBuffer(url, buffer);
  }

  public getEngineType(): "Worklet" | "ToneFallback" {
    return this.backend.getEngineType();
  }

  public getCurrentTime(): number {
    return this.backend.getCurrentTime();
  }

  public getCurrentFrame(): number {
    return this.backend.getCurrentFrame();
  }

  public seek(time: number): void {
    this.backend.seek(time);
    // Sync session transport frame immediately
    // This ensures that commands (like SplitAtPlayhead) relying on session.transportFrame
    // have the correct position even when the transport is paused.
    const frame = Math.floor(time * this.session.sampleRate);
    this.session.locateTransport(frame);
  }

  /**
   * Convert a Region domain object to a plain RegionDTO safe for postMessage.
   * Only copies the properties defined in the RegionDTO interface, avoiding
   * non-serialisable fields like Signal instances that would cause DataCloneError.
   */
  private static toRegionDTO(r: Region): RegionDTO {
    return {
      id: r.id,
      sourceId: r.sourceId,
      start: r.start,
      length: r.length,
      end: r.end,
      sourceStart: r.sourceStart,
      name: r.name,
      gain: r.gain,
      muted: r.muted,
      layer: r.layer,
      opaque: r.opaque,
      fadeIn: r.fadeIn,
      fadeOut: r.fadeOut,
      playbackRate: r.playbackRate,
      stretch: r.stretch,
      pitchSemitones: r.pitchSemitones,
      timeDomain: r.timeDomain,
    };
  }

  public updateRegion(trackId: string, _region: RegionDTO | Region) {
    const track = this.session.getTrack(trackId);
    if (track) {
      const regions = track.playlist.getRegions();
      const regionsDTO: RegionDTO[] = regions.map((r) =>
        AudioEngine.toRegionDTO(r),
      );
      this.backend.updateRegions(trackId, regionsDTO);
    }
  }

  private syncSessionGraphToBackend(): void {
    const { masterBus } = this.session;
    this.backend.registerMasterIO(masterBus.input.id, masterBus.output.id);
    masterBus.processors.forEach((processor, index) => {
      this.backend.addMasterProcessor(
        processor.id,
        getProcessorRuntimeType(processor),
        index,
      );
      this.syncMasterProcessorState(processor);
    });

    this.backend.setTempo(this.session.tempo);
    void this.backend.enableMetronome(this.session.metronomeEnabled);
    this.backend.setMetronomeVolume(this.session.metronomeVolume);
    this.backend.enableLoop(this.session.loopEnabled);
    this.syncLoopRange();
    this.backend.enablePunchRecording(this.session.punchEnabled);
    this.syncPunchRange();
    this.backend.seek(this.session.transportFrame / this.session.sampleRate);

    this.session.tracks.forEach((track) => this.syncTrackToBackend(track));
    this.session.sendBuses.forEach((sendBus) =>
      this.syncSendBusToBackend(sendBus),
    );
    this.syncRoutingSnapshot();
  }

  private async addSessionSourcesToBackend(session: Session): Promise<void> {
    await Promise.all(
      Array.from(session.sources.values(), (source) =>
        this.backend.addSource(source),
      ),
    );
  }

  private syncRoutingSnapshot(): void {
    this.backend.applyRoutingSnapshot(createRoutingSnapshot(this.session));
  }

  private syncLoopRange(): void {
    const range = this.session.getLoopRange();
    if (!range) {
      return;
    }
    this.backend.setLoopRange(
      range.start / this.session.sampleRate,
      range.end / this.session.sampleRate,
    );
  }

  private syncPunchRange(): void {
    const range = this.session.getPunchRange();
    if (!range) {
      return;
    }
    this.backend.setPunchRange(range.start, range.end);
  }

  private syncTrackToBackend(track: Track): void {
    this.createBackendTrack(track);
    track.route.processors.forEach((processor, index) => {
      this.backend.addProcessor(
        track.id,
        processor.id,
        getProcessorRuntimeType(processor),
        index,
      );
      this.syncProcessorState(track.id, processor);
    });
    track.playlist.getRegions().forEach((region) => {
      this.backend.scheduleRegion(track.id, AudioEngine.toRegionDTO(region));
    });
    track.playlist.getMidiRegions().forEach((midiRegion) => {
      this.backend.scheduleMidiRegion(
        track.id,
        AudioEngine.toMidiRegionDTO(midiRegion),
      );
    });
    this.backend.setMonitor(track.id, track.monitor);
    this.backend.setTrackMute(track.id, track.mute);
    this.backend.setTrackSolo(track.id, track.solo);
    this.backend.setTrackSoloIsolate(track.id, track.soloIsolate);
    this.backend.setTrackSoloSafe(track.id, track.soloSafe);
    this.backend.setMonitorMode(track.id, track.monitorMode);
    this.syncIOConnections(track);
  }

  private createBackendTrack(track: Track): void {
    const trackArguments = [
      track.id,
      track.name,
      track.route.input.id,
      track.route.output.id,
    ] as const;
    if (track.type === TrackType.AUX) {
      this.backend.createAuxTrack(...trackArguments);
      return;
    }
    if (track.type === TrackType.BUS) {
      this.backend.createBusTrack(...trackArguments);
      return;
    }
    if (track.type === TrackType.MIDI) {
      this.backend.createMidiTrack(...trackArguments);
      return;
    }
    this.backend.createTrack(...trackArguments);
  }

  private syncProcessorState(trackId: string, processor: Processor): void {
    const setParameter = (parameter: string, value: number): void => {
      this.backend.setProcessorParameter(
        trackId,
        processor.id,
        parameter,
        value,
      );
    };
    if (processor instanceof GainProcessor) {
      setParameter("gain", processor.gain);
    } else if (processor instanceof Panner) {
      setParameter("pan", processor.azimuth);
      setParameter("width", processor.width);
    } else if (processor instanceof PanProcessor) {
      setParameter("pan", processor.pan);
      setParameter("width", processor.width);
    } else if (processor instanceof PolarityProcessor) {
      setParameter("polarity", processor.inverted ? 1 : 0);
    } else if (processor instanceof SendProcessor) {
      setParameter("level", processor.level);
      setParameter("preFader", processor.preFader ? 1 : 0);
      setParameter("muted", processor.muted ? 1 : 0);
    }

    if (processor instanceof PluginInsert) {
      processor.plugin.getParameters().forEach((parameter) => {
        setParameter(parameter.id, parameter.value);
      });
    }
    processor.automations.forEach((automation, parameter) => {
      this.backend.setProcessorAutomation(
        trackId,
        processor.id,
        parameter,
        automation.getPoints(),
      );
    });
  }

  private syncMasterProcessorState(processor: Processor): void {
    const setParameter = (parameter: string, value: number): void => {
      this.backend.setMasterProcessorParameter(processor.id, parameter, value);
    };
    setParameter("active", processor.active ? 1 : 0);
    if (processor instanceof GainProcessor) {
      setParameter("gain", processor.gain);
    } else if (processor instanceof Panner) {
      setParameter("pan", processor.azimuth);
      setParameter("width", processor.width);
    } else if (processor instanceof PanProcessor) {
      setParameter("pan", processor.pan);
      setParameter("width", processor.width);
    } else if (processor instanceof PolarityProcessor) {
      setParameter("polarity", processor.inverted ? 1 : 0);
    } else if (processor instanceof SendProcessor) {
      setParameter("level", processor.level);
      setParameter("preFader", processor.preFader ? 1 : 0);
      setParameter("muted", processor.muted ? 1 : 0);
    } else if (processor instanceof PluginInsert) {
      processor.plugin.getParameters().forEach((parameter) => {
        setParameter(parameter.id, parameter.value);
      });
    }
    processor.automations.forEach((automation, parameter) => {
      this.backend.setMasterProcessorAutomation(
        processor.id,
        parameter,
        automation.getPoints(),
      );
    });
  }

  private syncIOConnections(track: Track): void {
    track.route.input.connections.forEach((destinationId) => {
      this.backend.connectIO(track.route.input.id, destinationId);
    });
    track.route.output.connections.forEach((destinationId) => {
      this.backend.connectIO(track.route.output.id, destinationId);
    });
  }

  private syncSendBusToBackend(sendBus: SendBus): void {
    this.backend.addSendBus(
      sendBus.id,
      sendBus.sourceTrackId,
      sendBus.destId,
      sendBus.level,
      sendBus.preFader,
    );
    this.backend.setSendBusActive(sendBus.id, sendBus.active);
  }

  private clearSessionFromBackend(): void {
    this.session.sendBuses.forEach((sendBus) => {
      this.backend.removeSendBus(sendBus.id);
    });
    this.session.tracks.forEach((track) => {
      this.backend.deleteTrack(track.id);
    });
    this.session.masterBus.processors.forEach((processor) => {
      this.backend.removeMasterProcessor(processor.id);
    });
  }

  private setupSessionListeners() {
    const masterBus = this.session.masterBus;
    masterBus.processors.forEach((processor) =>
      this.connectMasterProcessorSignals(processor),
    );

    this.signalDisposers.push(
      masterBus.processorAdded.connect((proc: Processor) => {
        const index = masterBus.processors.indexOf(proc);
        const type = getProcessorRuntimeType(proc);
        this.backend.addMasterProcessor(proc.id, type, index);
        this.syncMasterProcessorState(proc);
        this.connectMasterProcessorSignals(proc);
        this.syncRoutingSnapshot();
      }),
    );

    this.signalDisposers.push(
      masterBus.processorRemoved.connect((procId: string) => {
        this.disposeMasterProcessorSignals(procId);
        this.backend.removeMasterProcessor(procId);
        this.syncRoutingSnapshot();
      }),
      masterBus.processorReordered.connect(() => {
        this.syncRoutingSnapshot();
      }),
      masterBus.coreProcessorsRestored.connect(
        ({ previousProcessors, currentProcessors }) => {
          previousProcessors.forEach((processor) => {
            this.disposeMasterProcessorSignals(processor.id);
            this.backend.removeMasterProcessor(processor.id);
          });
          currentProcessors.forEach((processor) => {
            const index = masterBus.processors.indexOf(processor);
            this.backend.addMasterProcessor(
              processor.id,
              getProcessorRuntimeType(processor),
              index,
            );
            this.syncMasterProcessorState(processor);
            this.connectMasterProcessorSignals(processor);
          });
          this.syncRoutingSnapshot();
        },
      ),
    );

    this.signalDisposers.push(
      masterBus.ioChanged.connect(({ inputId, outputId }) => {
        this.backend.registerMasterIO(inputId, outputId);
      }),
      this.session.restored.connect(() => {
        this.backend.registerMasterIO(masterBus.input.id, masterBus.output.id);
        this.syncRoutingSnapshot();
      }),
    );

    // L-1: Sync loop state to backend (worklet + Tone Transport)
    this.signalDisposers.push(
      this.session.loopEnabledChanged.connect((enabled: boolean) => {
        this.backend.enableLoop(enabled);
        // Also sync loop range when enabling
        if (enabled) {
          const range = this.session.getLoopRange();
          if (range) {
            const startSec = range.start / this.session.sampleRate;
            const endSec = range.end / this.session.sampleRate;
            this.backend.setLoopRange(startSec, endSec);
          }
        }
      }),
    );

    this.signalDisposers.push(
      this.session.loopRangeChanged.connect((rangeId) => {
        if (rangeId) {
          const range = this.session.getLoopRange();
          if (range) {
            const startSec = range.start / this.session.sampleRate;
            const endSec = range.end / this.session.sampleRate;
            this.backend.setLoopRange(startSec, endSec);
          }
        }
      }),
    );

    // Track Added: Sync backend and subscribe to processor signals
    this.signalDisposers.push(
      this.session.trackAdded.connect((track: Track) => {
        this.syncTrackToBackend(track);

        const disposers: Array<{ dispose: () => void }> = [];

        track.route.processors.forEach((proc: Processor) => {
          this.connectProcessorSignals(track.id, proc, disposers);
        });

        this.bindTrackRuntimeSignals(track, disposers);
        this.trackDisposers.set(track.id, disposers);
        this.syncRoutingSnapshot();
      }),
    );

    // Track Removed: Sync backend & clean up subscriptions
    this.signalDisposers.push(
      this.session.trackRemoved.connect((trackId: string) => {
        const disposers = this.trackDisposers.get(trackId);
        if (disposers) {
          disposers.forEach((d) => d.dispose());
          this.trackDisposers.delete(trackId);
        }
        this.backend.deleteTrack(trackId);
        this.syncRoutingSnapshot();
      }),
    );

    // Metronome Signals
    this.signalDisposers.push(
      this.session.metronomeChanged.connect((enabled: boolean) => {
        this.backend.enableMetronome(enabled);
      }),
    );

    this.signalDisposers.push(
      this.session.metronomeVolumeChanged.connect((volume: number) => {
        this.backend.setMetronomeVolume(volume);
      }),
    );

    // Tempo Signal
    this.signalDisposers.push(
      this.session.tempoChanged.connect((bpm: number) => {
        this.backend.setTempo(bpm);

        // Update all regions on all tracks with new DTO (includes playbackRate)
        this.session.tracks.forEach((track) => {
          const regions = track.playlist.getRegions();
          const regionsDTO: RegionDTO[] = regions.map((r) =>
            AudioEngine.toRegionDTO(r),
          );
          this.backend.updateRegions(track.id, regionsDTO);
        });
      }),
    );

    // Source Added
    this.signalDisposers.push(
      this.session.sourceAdded.connect((source: Source) => {
        void Promise.resolve(this.backend.addSource(source)).catch(
          (error: unknown) =>
            logger.error("AudioEngine", "Failed to add source:", error),
        );
      }),
    );

    // Send Bus Signals
    this.signalDisposers.push(
      this.session.sendBusAdded.connect((sendBus: SendBus) => {
        this.syncSendBusToBackend(sendBus);
        const disposers: Array<{ dispose: () => void }> = [];
        this.bindSendBusSignals(sendBus, disposers);
        this.sendBusDisposers.set(sendBus.id, disposers);
        this.syncRoutingSnapshot();
      }),
    );

    this.signalDisposers.push(
      this.session.sendBusRemoved.connect((sendBusId: string) => {
        const disposers = this.sendBusDisposers.get(sendBusId);
        if (disposers) {
          disposers.forEach((d) => d.dispose());
          this.sendBusDisposers.delete(sendBusId);
        }
        this.backend.removeSendBus(sendBusId);
        this.syncRoutingSnapshot();
      }),
    );

    this.signalDisposers.push(
      this.session.sidechainConfigChanged.connect(() => {
        this.syncRoutingSnapshot();
      }),
    );

    this.session.tracks.forEach((track) => {
      const disposers: Array<{ dispose: () => void }> = [];
      // Session 교체 전부터 있던 Track도 이후 변경을 backend에 전달할 수 있도록 signal을 다시 연결한다.
      track.route.processors.forEach((processor) => {
        this.connectProcessorSignals(track.id, processor, disposers);
      });
      this.bindTrackRuntimeSignals(track, disposers);
      if (disposers.length > 0) {
        const existing = this.trackDisposers.get(track.id);
        if (existing) {
          existing.push(...disposers);
        } else {
          this.trackDisposers.set(track.id, disposers);
        }
      }
    });
    this.session.sendBuses.forEach((sendBus) => {
      const disposers: Array<{ dispose: () => void }> = [];
      this.bindSendBusSignals(sendBus, disposers);
      this.sendBusDisposers.set(sendBus.id, disposers);
    });
  }

  private bindSendBusSignals(
    sendBus: SendBus,
    disposers: Array<{ dispose: () => void }>,
  ): void {
    disposers.push(
      sendBus.levelChanged.connect((levelDb: number) => {
        this.backend.setSendBusLevel(sendBus.id, levelDb);
      }),
      sendBus.preFaderChanged.connect((preFader: boolean) => {
        this.backend.setSendBusPreFader(sendBus.id, preFader);
      }),
      sendBus.activeChanged.connect((active: boolean) => {
        this.backend.setSendBusActive(sendBus.id, active);
        this.syncRoutingSnapshot();
      }),
    );
  }

  private bindTrackRuntimeSignals(
    track: Track,
    disposers: Array<{ dispose: () => void }>,
  ): void {
    disposers.push(
      track.route.processorAdded.connect((processor: Processor) => {
        const index = track.route.processors.indexOf(processor);
        const type = getProcessorRuntimeType(processor);
        this.backend.addProcessor(track.id, processor.id, type, index);
        this.connectProcessorSignals(track.id, processor, disposers);
        this.syncRoutingSnapshot();
      }),
      track.route.processorRemoved.connect((processorId: string) => {
        this.backend.removeProcessor(track.id, processorId);
        this.syncRoutingSnapshot();
      }),
      track.route.processorReordered.connect(() => {
        this.syncRoutingSnapshot();
      }),
      track.playlist.regionAdded.connect((region: Region) => {
        this.backend.scheduleRegion(track.id, AudioEngine.toRegionDTO(region));
      }),
      track.playlist.regionRemoved.connect((regionId: string) => {
        this.backend.removeRegion(track.id, regionId);
      }),
      track.playlist.regionChanged.connect((region: Region) => {
        this.updateRegion(track.id, region);
      }),
      track.playlist.midiRegionAdded.connect((midiRegion: MidiRegion) => {
        this.backend.scheduleMidiRegion(
          track.id,
          AudioEngine.toMidiRegionDTO(midiRegion),
        );
      }),
      track.playlist.midiRegionRemoved.connect((regionId: string) => {
        this.backend.removeMidiRegion(track.id, regionId);
      }),
    );
    this.bindTrackSignals(track, disposers);
  }

  private static toMidiRegionDTO(midiRegion: MidiRegion): MidiRegionDTO {
    return {
      id: midiRegion.id,
      name: midiRegion.name,
      start: midiRegion.start,
      length: midiRegion.length,
      end: midiRegion.end,
      muted: midiRegion.muted,
      notes: midiRegion.getNotes().map((note) => ({
        id: note.id,
        pitch: note.pitch,
        velocity: note.velocity,
        startFrame: note.startFrame,
        durationFrames: note.durationFrames,
        channel: note.channel,
      })),
    };
  }

  private bindTrackSignals(
    track: Track,
    disposers: Array<{ dispose: () => void }> = [],
  ) {
    if (track.monitorChanged) {
      disposers.push(
        track.monitorChanged.connect((enabled: boolean) => {
          this.backend.setMonitor(track.id, enabled);
        }),
      );
    }

    // Mute / Solo
    disposers.push(
      track.muteChanged.connect((muted: boolean) => {
        this.backend.setTrackMute(track.id, muted);
      }),
    );
    disposers.push(
      track.soloChanged.connect((soloed: boolean) => {
        this.backend.setTrackSolo(track.id, soloed);
      }),
    );

    // Solo Isolate / Solo Safe
    disposers.push(
      track.soloIsolateChanged.connect((isolate: boolean) => {
        this.backend.setTrackSoloIsolate(track.id, isolate);
      }),
    );
    disposers.push(
      track.soloSafeChanged.connect((safe: boolean) => {
        this.backend.setTrackSoloSafe(track.id, safe);
      }),
    );

    // Monitor Mode
    disposers.push(
      track.monitorModeChanged.connect((mode: MonitorMode) => {
        this.backend.setMonitorMode(track.id, mode);
      }),
    );

    // IO Signals
    if (track.route) {
      const route = track.route;

      if (route.output && route.output.connected) {
        disposers.push(
          route.output.connected.connect((destId: string) => {
            this.backend.connectIO(route.output.id, destId);
            this.syncRoutingSnapshot();
          }),
        );
        disposers.push(
          route.output.disconnected.connect((destId: string) => {
            this.backend.disconnectIO(route.output.id, destId);
            this.syncRoutingSnapshot();
          }),
        );
      }

      if (route.input && route.input.connected) {
        disposers.push(
          route.input.connected.connect((destId: string) => {
            this.backend.connectIO(route.input.id, destId);
            this.syncRoutingSnapshot();
          }),
        );
        disposers.push(
          route.input.disconnected.connect((destId: string) => {
            this.backend.disconnectIO(route.input.id, destId);
            this.syncRoutingSnapshot();
          }),
        );
      }
    }
  }

  private connectMasterProcessorSignals(proc: Processor): void {
    this.disposeMasterProcessorSignals(proc.id);
    const disposers: Array<{ dispose: () => void }> = [];
    this.bindProcessorSnapshotSignals(proc, disposers);
    disposers.push(
      proc.activeChanged.connect((active: boolean) => {
        this.backend.setMasterProcessorParameter(
          proc.id,
          "active",
          active ? 1 : 0,
        );
      }),
    );
    if (proc instanceof GainProcessor) {
      disposers.push(
        proc.gainChanged.connect((val: number) => {
          this.backend.setMasterProcessorParameter(proc.id, "gain", val);
        }),
      );
    }
    if (proc instanceof Panner) {
      disposers.push(
        proc.azimuthChanged.connect((val: number) => {
          this.backend.setMasterProcessorParameter(proc.id, "pan", val);
        }),
        proc.widthChanged.connect((val: number) => {
          this.backend.setMasterProcessorParameter(proc.id, "width", val);
        }),
      );
    } else if (proc instanceof PanProcessor) {
      disposers.push(
        proc.panChanged.connect((val: number) => {
          this.backend.setMasterProcessorParameter(proc.id, "pan", val);
        }),
        proc.widthChanged.connect((val: number) => {
          this.backend.setMasterProcessorParameter(proc.id, "width", val);
        }),
      );
    }
    if (proc instanceof PolarityProcessor) {
      disposers.push(
        proc.polarityChanged.connect((inverted: boolean) => {
          this.backend.setMasterProcessorParameter(
            proc.id,
            "polarity",
            inverted ? 1 : 0,
          );
        }),
      );
    }
    if (
      proc instanceof PluginInsert &&
      proc.plugin &&
      proc.plugin.parameterChanged
    ) {
      disposers.push(
        proc.plugin.parameterChanged.connect(
          ({ id, value }: { id: string; value: number }) => {
            this.backend.setMasterProcessorParameter(proc.id, id, value);
          },
        ),
      );
    }
    proc.automations.forEach((list, parameter) => {
      this.bindMasterAutomationList(proc.id, parameter, list, disposers);
    });
    disposers.push(
      proc.automationAdded.connect(({ paramName, list }) => {
        this.bindMasterAutomationList(proc.id, paramName, list, disposers);
      }),
    );
    this.masterProcessorDisposers.set(proc.id, disposers);
  }

  private bindMasterAutomationList(
    processorId: string,
    parameter: string,
    list: AutomationList,
    disposers: Array<{ dispose: () => void }>,
  ): void {
    disposers.push(
      list.changed.connect(() => {
        this.backend.setMasterProcessorAutomation(
          processorId,
          parameter,
          list.getPoints(),
        );
      }),
    );
  }

  private disposeMasterProcessorSignals(processorId: string): void {
    this.masterProcessorDisposers
      .get(processorId)
      ?.forEach((disposer) => disposer.dispose());
    this.masterProcessorDisposers.delete(processorId);
  }

  private connectProcessorSignals(
    trackId: string,
    proc: Processor,
    disposers: Array<{ dispose: () => void }>,
  ): void {
    this.bindProcessorSnapshotSignals(proc, disposers);
    if (proc instanceof GainProcessor) {
      disposers.push(
        proc.gainChanged.connect((val: number) => {
          this.backend.setProcessorParameter(trackId, proc.id, "gain", val);
        }),
      );
    }
    if (proc instanceof Panner) {
      disposers.push(
        proc.azimuthChanged.connect((val: number) => {
          this.backend.setProcessorParameter(trackId, proc.id, "pan", val);
        }),
        proc.widthChanged.connect((val: number) => {
          this.backend.setProcessorParameter(trackId, proc.id, "width", val);
        }),
      );
    } else if (proc instanceof PanProcessor) {
      disposers.push(
        proc.panChanged.connect((val: number) => {
          this.backend.setProcessorParameter(trackId, proc.id, "pan", val);
        }),
        proc.widthChanged.connect((val: number) => {
          this.backend.setProcessorParameter(trackId, proc.id, "width", val);
        }),
      );
    }
    if (proc instanceof PolarityProcessor) {
      disposers.push(
        proc.polarityChanged.connect((inverted: boolean) => {
          this.backend.setProcessorParameter(
            trackId,
            proc.id,
            "polarity",
            inverted ? 1 : 0,
          );
        }),
      );
    }
    if (proc instanceof SendProcessor) {
      disposers.push(
        proc.levelChanged.connect((val: number) => {
          this.backend.setProcessorParameter(trackId, proc.id, "level", val);
        }),
        proc.preFaderChanged.connect((preFader: boolean) => {
          this.backend.setProcessorParameter(
            trackId,
            proc.id,
            "preFader",
            preFader ? 1 : 0,
          );
        }),
        proc.muteChanged.connect((muted: boolean) => {
          this.backend.setProcessorParameter(
            trackId,
            proc.id,
            "muted",
            muted ? 1 : 0,
          );
        }),
      );
    }

    // Plugin Signals
    if (
      proc instanceof PluginInsert &&
      proc.plugin &&
      proc.plugin.parameterChanged
    ) {
      disposers.push(
        proc.plugin.parameterChanged.connect(
          ({ id, value }: { id: string; value: number }) => {
            this.backend.setProcessorParameter(trackId, proc.id, id, value);
          },
        ),
      );
    }

    // Listen for Automation Changes
    if (proc.automations) {
      proc.automations.forEach((list: AutomationList, param: string) => {
        this.bindAutomationList(trackId, proc.id, param, list, disposers);
      });
    }

    // Listen for future automations (Lazy creation)
    if (proc.automationAdded) {
      disposers.push(
        proc.automationAdded.connect(
          ({
            paramName,
            list,
          }: {
            paramName: string;
            list: AutomationList;
          }) => {
            this.bindAutomationList(
              trackId,
              proc.id,
              paramName,
              list,
              disposers,
            );
          },
        ),
      );
    }
  }

  private bindProcessorSnapshotSignals(
    processor: Processor,
    disposers: Array<{ dispose: () => void }>,
  ): void {
    const syncSnapshot = (): void => this.syncRoutingSnapshot();
    disposers.push(
      processor.activeChanged.connect(syncSnapshot),
      processor.latencyChanged.connect(syncSnapshot),
      processor.tailLengthChanged.connect(syncSnapshot),
    );
  }

  private bindAutomationList(
    trackId: string,
    procId: string,
    param: string,
    list: AutomationList,
    disposers: Array<{ dispose: () => void }>,
  ): void {
    if (list.changed) {
      disposers.push(
        list.changed.connect(() => {
          logger.debug(
            "AudioEngine",
            `Automation changed for ${trackId}:${procId}:${param}`,
          );
          const points = list.getPoints();
          this.backend.setProcessorAutomation(trackId, procId, param, points);
        }),
      );

      // Initial sync if not empty
      const points = list.getPoints();
      if (points.length > 0) {
        this.backend.setProcessorAutomation(trackId, procId, param, points);
      }
    }
  }

  public async initialize() {
    await this.backend.initialize();
  }

  // Pre-roll state: frame-based check replaces setTimeout
  private preRollTargetFrame: number | null = null;
  private preRollArmedTracks: Track[] = [];
  private preRollWasMetronomeEnabled = false;

  // Transport
  public start(): Promise<void> {
    if (this.transportStartPromise) {
      return this.transportStartPromise;
    }
    if (
      this.isBackendTransportRunning &&
      this.session.transportFSM.isRolling()
    ) {
      return Promise.resolve();
    }

    this.session.startTransport();
    const sessionAtRequest = this.session;
    const pendingStop = this.transportStopPromise;
    const operation = this.startBackendWhenReady(sessionAtRequest, pendingStop);
    this.transportStartPromise = operation;
    operation.then(
      () => this.clearTransportStartPromise(operation),
      () => this.clearTransportStartPromise(operation),
    );
    return operation;
  }

  private async startBackendWhenReady(
    sessionAtRequest: Session,
    pendingStop: Promise<void> | null,
  ): Promise<void> {
    if (pendingStop) {
      try {
        // Declick 중 입력된 재생은 backend 정지가 끝난 뒤 상태 머신의 재처리 결과를 따른다.
        await pendingStop;
      } catch (error) {
        logger.warn(
          "AudioEngine",
          "Previous transport stop failed before restart",
          error,
        );
      }
    }
    if (
      this.disposed ||
      this.session !== sessionAtRequest ||
      !sessionAtRequest.transportFSM.isRolling()
    ) {
      return;
    }

    this.scheduleAutomations();
    this.backend.setTempo(this.session.tempo);
    await this.backend.start();
    this.isBackendTransportRunning = true;
    if (
      this.session === sessionAtRequest &&
      sessionAtRequest.transportFSM.isRolling()
    ) {
      this.startTransportSync();
    }
  }

  private clearTransportStartPromise(operation: Promise<void>): void {
    if (this.transportStartPromise === operation) {
      this.transportStartPromise = null;
    }
  }

  private syncId: number | null = null;

  private requestFrame(cb: FrameRequestCallback): number {
    if (typeof requestAnimationFrame !== "undefined") {
      return requestAnimationFrame(cb);
    }
    return setTimeout(cb, 16) as unknown as number;
  }

  private cancelFrame(id: number) {
    if (typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(id);
    } else {
      clearTimeout(id);
    }
  }

  private startTransportSync() {
    if (this.syncId) this.cancelFrame(this.syncId);

    const loop = () => {
      if (!this.session.isPlaying) return;

      // Get current time from Backend
      const currentFrame = this.backend.getCurrentFrame();

      // Pre-roll check: frame-based instead of setTimeout
      if (
        this.preRollTargetFrame !== null &&
        currentFrame >= this.preRollTargetFrame
      ) {
        this.preRollArmedTracks.forEach((t) =>
          this.backend.setRecordingMuted(t.id, false),
        );
        if (!this.preRollWasMetronomeEnabled) {
          this.backend.enableMetronome(false);
        }
        this.session.recordingStartFrame = currentFrame;
        logger.info("AudioEngine", "Pre-roll complete, recording active");
        this.preRollTargetFrame = null;
        this.preRollArmedTracks = [];
      }

      // Check punch range during recording
      if (
        this.session.isRecording &&
        this.session.punchEnabled &&
        this.session.punchRangeId
      ) {
        const punchRange = this.session.getPunchRange();
        if (punchRange) {
          const isInPunchRange =
            currentFrame >= punchRange.start && currentFrame < punchRange.end;
          const armedTracks = this.session.tracks.filter((t) => t.armed);

          // Mute/unmute recording based on whether we are inside the punch range
          armedTracks.forEach((t) => {
            this.backend.setRecordingMuted(t.id, !isInPunchRange);
          });
        }
      }

      // Check loop
      if (this.session.loopEnabled && this.session.loopRangeId) {
        const loopRange = this.session.getLoopRange();
        if (loopRange && currentFrame >= loopRange.end) {
          // Handle loop recording: save current take before looping
          if (this.session.isRecording && this.session.loopRecordingEnabled) {
            this.handleLoopRecordingTake(currentFrame).catch((err) => {
              logger.error(
                "AudioEngine",
                "Error handling loop recording take:",
                err,
              );
            });
          }

          // Loop back to start
          logger.debug(
            "AudioEngine",
            `Loop: ${currentFrame} >= ${loopRange.end}, seeking to ${loopRange.start}`,
          );
          this.backend.seek(loopRange.start / this.session.sampleRate);
          this.session.locateTransport(loopRange.start);
        } else {
          this.session.locateTransport(currentFrame);
        }
      } else {
        this.session.locateTransport(currentFrame);
      }

      this.syncId = this.requestFrame(loop);
    };
    this.syncId = this.requestFrame(loop);
  }

  private scheduleAutomations() {
    this.session.tracks.forEach((track) => {
      track.route.processors.forEach((proc: Processor) => {
        if (proc.automations) {
          proc.automations.forEach(
            (automationList: AutomationList, paramName: string) => {
              const points = automationList.getPoints();
              if (points.length > 0) {
                this.backend.setProcessorAutomation(
                  track.id,
                  proc.id,
                  paramName,
                  points,
                );
              }
            },
          );
        }
      });
    });
  }

  public stop(): Promise<void> {
    if (this.transportStopPromise) {
      return this.transportStopPromise;
    }

    this.session.stopTransport();
    const sessionAtRequest = this.session;
    const backendAtRequest = this.backend;
    const pendingStart = this.transportStartPromise;
    const operation = this.stopBackendAfterStart({
      session: sessionAtRequest,
      backend: backendAtRequest,
      pendingStart,
    });
    this.transportStopPromise = operation;
    operation.then(
      () => this.clearTransportStopPromise(operation),
      () => this.clearTransportStopPromise(operation),
    );
    return operation;
  }

  private async stopBackendAfterStart({
    session: sessionAtRequest,
    backend: backendAtRequest,
    pendingStart,
  }: StopBackendRequest): Promise<void> {
    if (pendingStart) {
      try {
        await pendingStart;
      } catch {
        // 재생 시작 실패와 관계없이 backend 정지와 FSM 완료 처리는 계속한다.
      }
    }

    try {
      if (backendAtRequest.stopWithDeclick) {
        await backendAtRequest.stopWithDeclick();
      } else {
        // 기존 Provider는 동기 stop을 사용하고 Declick 전환을 즉시 완료한다.
        backendAtRequest.stop();
      }
    } finally {
      if (this.backend === backendAtRequest) {
        this.isBackendTransportRunning = false;
      }
      if (this.session === sessionAtRequest) {
        sessionAtRequest.completeTransportStop();
      }
    }
  }

  private clearTransportStopPromise(operation: Promise<void>): void {
    if (this.transportStopPromise === operation) {
      this.transportStopPromise = null;
    }
  }

  public pause() {
    this.session.isPlaying = false;
    this.backend.pause();
    this.isBackendTransportRunning = false;
  }

  // Punch Recording
  public enablePunchRecording(enabled: boolean): void {
    this.session.setPunchEnabled(enabled);

    // Sync punch range to backend
    if (enabled && this.session.punchRangeId) {
      const punchRange = this.session.getPunchRange();
      if (punchRange) {
        this.backend.enablePunchRecording(true);
        this.backend.setPunchRange(punchRange.start, punchRange.end);
      }
    } else {
      this.backend.enablePunchRecording(false);
    }
  }

  // Monitor with effects
  public setMonitorWithEffects(trackId: string, enabled: boolean): void {
    this.backend.setMonitorWithEffects(trackId, enabled);
  }

  // Input Latency
  public getInputLatencyMs(): number {
    return this.backend.getInputLatencyMs();
  }

  /**
   * Handle loop recording take: stop current recording, save take as a region on a new layer,
   * then restart recording for the next pass.
   */
  private async handleLoopRecordingTake(_endFrame: number): Promise<void> {
    const armedTracks = this.session.tracks.filter((t) => t.armed);
    const takeNumber = this.session.incrementTakeCount();
    const loopRange = this.session.getLoopRange();
    if (!loopRange) return;

    logger.info("AudioEngine", `Loop recording: completing take ${takeNumber}`);

    for (const track of armedTracks) {
      // Stop current recording and collect blob
      const blob = await this.backend.stopRecording(track.id);
      if (blob.size > 0) {
        const url = URL.createObjectURL(blob);
        await this.backend.cacheBlob(url, blob);

        const startFrame = loopRange.start;
        const durationFrames = loopRange.end - loopRange.start;

        if (durationFrames > 0) {
          const regionId = crypto.randomUUID() as RegionId;
          // Each take goes on a different layer
          const region = new Region(
            regionId,
            url,
            startFrame,
            durationFrames,
            0,
            `Take ${takeNumber}`,
            takeNumber, // layer = take number
          );
          track.playlist.addRegion(region);
          logger.debug(
            "AudioEngine",
            `Loop take ${takeNumber}: Region created on layer ${takeNumber}`,
          );
        }
      }

      // Restart recording for next take
      await this.backend.prepareRecording(track.id);
      this.backend.startRecording(track.id);
    }
  }

  // ─── MIDI Input ─────────────────────────────────────────────────────────

  /**
   * Initialize MIDI input subsystem.
   */
  public async initializeMidiInput(): Promise<boolean> {
    return this.midiInput.initialize();
  }

  /**
   * Get available MIDI input devices.
   */
  public getMidiInputDevices(): MIDIInput[] {
    return this.midiInput.getInputDevices();
  }

  /**
   * Set the active MIDI input device.
   */
  public setMidiInputDevice(inputId: string | null): void {
    this.midiInput.setActiveInput(inputId);
  }

  /**
   * Get the MidiInput singleton for external consumers.
   */
  public getMidiInput(): MidiInput {
    return this.midiInput;
  }

  // ─── MIDI Recording Helpers ──────────────────────────────────────────────

  private startMidiRecording(): void {
    this.midiRecordingNotes.clear();
    this.midiRecordedNotes = [];

    // Subscribe to MIDI note events
    this.midiNoteOnSub = this.midiInput.noteOn.connect(
      (event: MidiNoteOnEvent) => {
        if (!this.session.isRecording) return;
        const currentFrame = this.backend.getCurrentFrame();
        const key = `${event.channel}-${event.pitch}`;
        this.midiRecordingNotes.set(key, {
          pitch: event.pitch,
          velocity: event.velocity,
          channel: event.channel,
          startFrame: currentFrame,
        });
      },
    );

    this.midiNoteOffSub = this.midiInput.noteOff.connect(
      (event: MidiNoteOffEvent) => {
        if (!this.session.isRecording) return;
        const currentFrame = this.backend.getCurrentFrame();
        const key = `${event.channel}-${event.pitch}`;
        const pending = this.midiRecordingNotes.get(key);
        if (pending) {
          const durationFrames = Math.max(1, currentFrame - pending.startFrame);
          const note = new MidiNote(
            crypto.randomUUID(),
            pending.pitch,
            pending.velocity,
            pending.startFrame,
            durationFrames,
            pending.channel,
          );
          this.midiRecordedNotes.push(note);
          this.midiRecordingNotes.delete(key);
        }
      },
    );
  }

  private stopMidiRecording(): void {
    // Close any still-held notes at the current position
    const currentFrame = this.backend.getCurrentFrame();
    for (const [_key, pending] of this.midiRecordingNotes) {
      const durationFrames = Math.max(1, currentFrame - pending.startFrame);
      const note = new MidiNote(
        crypto.randomUUID(),
        pending.pitch,
        pending.velocity,
        pending.startFrame,
        durationFrames,
        pending.channel,
      );
      this.midiRecordedNotes.push(note);
    }
    this.midiRecordingNotes.clear();

    // Unsubscribe
    this.midiNoteOnSub?.dispose();
    this.midiNoteOffSub?.dispose();
    this.midiNoteOnSub = null;
    this.midiNoteOffSub = null;
  }

  private finalizeMidiRecording(): void {
    if (this.midiRecordedNotes.length === 0) return;

    const armedMidiTracks = this.session.tracks.filter(
      (t) => t.armed && t.type === TrackType.MIDI,
    );

    for (const track of armedMidiTracks) {
      const startFrame = this.session.recordingStartFrame;
      // Find the extent of recorded notes
      let minStart = Infinity;
      let maxEnd = 0;
      for (const note of this.midiRecordedNotes) {
        if (note.startFrame < minStart) minStart = note.startFrame;
        if (note.endFrame > maxEnd) maxEnd = note.endFrame;
      }

      const regionStart = Math.min(startFrame, minStart);
      const regionLength = maxEnd - regionStart;

      if (regionLength <= 0) continue;

      const regionId = crypto.randomUUID() as RegionId;
      const region = new MidiRegion(
        regionId,
        "MIDI Recording",
        regionStart,
        regionLength,
      );

      // Make note positions relative to region start
      for (const note of this.midiRecordedNotes) {
        const relativeNote = new MidiNote(
          note.id,
          note.pitch,
          note.velocity,
          note.startFrame - regionStart,
          note.durationFrames,
          note.channel,
        );
        region.addNote(relativeNote);
      }

      track.playlist.addMidiRegion(region);
      logger.info(
        "AudioEngine",
        `MIDI recording finalized: ${this.midiRecordedNotes.length} notes in region ${regionId}`,
      );
    }

    this.midiRecordedNotes = [];
  }

  // Recording
  public async startRecording(): Promise<void> {
    const armedTracks = this.session.tracks.filter((t) => t.armed);
    logger.info(
      "AudioEngine",
      `Starting recording. Armed tracks: ${armedTracks.length}`,
    );

    // Setup punch recording if enabled
    if (this.session.punchEnabled && this.session.punchRangeId) {
      const punchRange = this.session.getPunchRange();
      if (punchRange) {
        logger.info(
          "AudioEngine",
          `Punch recording enabled: ${punchRange.name} (${punchRange.start} - ${punchRange.end})`,
        );
        this.backend.enablePunchRecording(true);
        this.backend.setPunchRange(punchRange.start, punchRange.end);
      }
    }

    // Reset loop recording take count
    if (this.session.loopRecordingEnabled) {
      this.session.loopRecordingTakeCount = 0;
      logger.info("AudioEngine", "Loop recording mode active");
    }

    // Prepare audio recording for non-MIDI armed tracks
    const armedAudioTracks = armedTracks.filter(
      (t) => t.type !== TrackType.MIDI,
    );
    await Promise.all(
      armedAudioTracks.map((t) => this.backend.prepareRecording(t.id)),
    );

    // Start all prepared audio tracks
    armedAudioTracks.forEach((t) => this.backend.startRecording(t.id));

    // Start MIDI recording if any armed MIDI tracks
    const armedMidiTracks = armedTracks.filter(
      (t) => t.type === TrackType.MIDI,
    );
    if (armedMidiTracks.length > 0) {
      this.startMidiRecording();
    }

    this.session.startRecording();

    // Handle pre-roll: if pre-roll is set, start playback with metronome first
    if (this.session.preRollBars > 0) {
      const preRollSeconds = this.session.getPreRollDurationSeconds();
      logger.info(
        "AudioEngine",
        `Pre-roll: ${this.session.preRollBars} bars (${preRollSeconds.toFixed(
          2,
        )}s)`,
      );

      // Enable metronome for pre-roll if not already enabled
      this.preRollWasMetronomeEnabled = this.session.metronomeEnabled;
      if (!this.preRollWasMetronomeEnabled) {
        this.backend.enableMetronome(true);
      }

      // Mute recording during pre-roll
      armedTracks.forEach((t) => this.backend.setRecordingMuted(t.id, true));

      // Compute the frame at which pre-roll ends (checked in transport sync loop)
      const currentFrame = this.backend.getCurrentFrame();
      this.preRollTargetFrame =
        currentFrame + Math.floor(preRollSeconds * this.session.sampleRate);
      this.preRollArmedTracks = armedTracks;

      // Start transport — the sync loop will unmute recording at preRollTargetFrame
      await this.start();
    } else {
      // No pre-roll, start immediately
      await this.start();
    }
  }

  public async stopRecording(): Promise<void> {
    const armedTracks = this.session.tracks.filter((t) => t.armed);
    logger.info(
      "AudioEngine",
      `Stopping recording. Armed tracks: ${armedTracks.length}`,
    );

    // Capture end frame BEFORE stopping transport (which resets to 0)
    // using backend for precision or session for consistency.
    // Backend is the source of truth for time.
    const endFrame = this.backend.getCurrentFrame();

    // Stop MIDI recording first (before transport stop resets frame)
    this.stopMidiRecording();
    this.finalizeMidiRecording();

    // Stop Transport
    await this.stop();

    // Stop all audio armed tracks and collect blobs
    const armedAudioTracks = armedTracks.filter(
      (t) => t.type !== TrackType.MIDI,
    );
    for (const track of armedAudioTracks) {
      const blob = await this.backend.stopRecording(track.id);
      if (blob.size > 0) {
        // Create Region
        logger.debug(
          "AudioEngine",
          `Recorded blob for track ${track.id}, size: ${blob.size}`,
        );

        const url = URL.createObjectURL(blob);

        // Cache the blob as AudioBuffer immediately for Waveform rendering
        await this.backend.cacheBlob(url, blob);

        // Calculate duration
        const startFrame = this.session.recordingStartFrame;
        const durationFrames = endFrame - startFrame;

        // Create Region in Playlist
        if (durationFrames > 0) {
          const regionId = crypto.randomUUID() as RegionId;
          const region = new Region(
            regionId,
            url,
            startFrame,
            durationFrames,
            0,
            "Recording",
          );
          track.playlist.insertRecordedRegion(region, track.recordMode);
          logger.debug(
            "AudioEngine",
            `Created Region: ${url}, Start: ${startFrame}, Dur: ${durationFrames}`,
          );
        }
      }
    }

    this.session.stopRecording();
  }

  // Track Management - Proxy to Session
  public addTrack(
    name: string,
    type: TrackType = TrackType.AUDIO,
    id?: string,
  ) {
    return this.session.addTrack(name, type, id);
  }

  public removeTrack(trackId: string) {
    this.session.removeTrack(trackId);
  }

  // Direct Parameter Control - Now updates Domain, which signals Backend
  public setTrackGain(trackId: string, gain: number) {
    const track = this.session.getTrack(trackId);
    if (track) {
      track.route.volume = gain; // Updates Route -> Signal -> Backend
    }
  }

  public setTrackPan(trackId: string, pan: number) {
    const track = this.session.getTrack(trackId);
    if (track) {
      track.route.pan = pan; // Updates Route -> Signal -> Backend
    }
  }

  // Export
  public getExportConfig(): ExportConfig {
    return this.session.getExportConfig();
  }

  public getExportStatus(): ExportStatus {
    return this.session.getExportStatus();
  }

  public async exportAudio(
    config: ExportConfig,
    _status: ExportStatus,
  ): Promise<void> {
    const trackIds = config.exportMasterOnly
      ? this.session.tracks.map((t) => t.id)
      : config.trackIds;

    const _buffer = await this.backend.exportAudio(
      config.startFrame,
      config.endFrame,
      config.sampleRate,
      trackIds,
    );

    // This is now handled by OfflineExporter in ExportCommand
    // But we keep this method for potential direct use
    return;
  }

  public async renderRegionsToBuffer(
    trackId: string,
    regionIds: string[],
  ): Promise<AudioBuffer> {
    return this.backend.renderRegionsToBuffer(trackId, regionIds);
  }

  // Metering
  public getMeterData(trackId: string): MeterData {
    return this.backend.getMeterData(trackId);
  }

  public getMasterMeterData(): MeterData {
    return this.backend.getMasterMeterData();
  }

  public getAnalyserNode(trackId?: string): AnalyserNode | null {
    return this.backend.getAnalyserNode(trackId);
  }

  // Region Audition
  public auditionRegion(trackId: string, regionId: string): void {
    this.backend.auditionRegion(trackId, regionId);
  }

  public stopAudition(): void {
    this.backend.stopAudition();
  }

  // MIDI Instrument
  public setMidiInstrument(trackId: string, instrumentType: string): void {
    this.backend.setMidiInstrument(trackId, instrumentType);
  }

  // Strip Silence
  public async stripSilence(
    trackId: string,
    regionId: string,
    thresholdDb: number,
    minLengthFrames: number,
  ): Promise<Array<{ start: number; length: number }>> {
    return this.backend.stripSilence(
      trackId,
      regionId,
      thresholdDb,
      minLengthFrames,
    );
  }

  // Normalize Region
  public async normalizeRegion(
    trackId: string,
    regionId: string,
    targetDb: number,
  ): Promise<number> {
    return this.backend.normalizeRegion(trackId, regionId, targetDb);
  }

  // MIDI Panic
  public midiPanic(): void {
    this.backend.midiPanic();
  }

  // Stereo Master Metering
  public getMasterStereoMeterData(): { left: MeterData; right: MeterData } {
    return this.backend.getMasterStereoMeterData();
  }

  // Region Reverse
  public async reverseRegionBuffer(
    trackId: string,
    regionId: string,
  ): Promise<void> {
    return this.backend.reverseRegionBuffer(trackId, regionId);
  }

  // Session Management
  public async loadSession(newSession: Session): Promise<void> {
    this.stopImmediately();
    if (newSession.sources.size > 0) {
      await this.addSessionSourcesToBackend(newSession);
    }
    // 기존 backend graph를 제거해야 교체된 Session의 Track과 Processor만 남는다.
    this.clearSessionFromBackend();
    this.disconnectSessionSignals();
    this.session = newSession;
    this.syncSessionGraphToBackend();
    this.setupSessionListeners();
  }

  public async loadSessionFromSnapshot(
    snapshot: SessionSnapshot,
  ): Promise<void> {
    await this.loadSession(Session.fromJSON(snapshot));
  }

  public async restoreSessionFromSnapshot(
    snapshot: SessionSnapshot,
  ): Promise<void> {
    this.stopImmediately();
    const restoredSession = Session.fromJSON(snapshot);
    if (restoredSession.sources.size > 0) {
      await this.addSessionSourcesToBackend(restoredSession);
    }
    this.clearSessionFromBackend();
    this.disconnectSessionSignals();
    this.session.restoreFromJSON(snapshot);
    this.syncSessionGraphToBackend();
    this.setupSessionListeners();
  }

  private stopImmediately(): void {
    this.transportStartPromise = null;
    this.transportStopPromise = null;
    this.backend.stop();
    this.isBackendTransportRunning = false;
    this.session.stopTransport();
    this.session.completeTransportStop();
  }
}
