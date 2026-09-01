import { Signal } from "../lib/Signal";
import { TrackId } from "./types";
import { Track } from "./Track";

/**
 * VCA (Voltage Controlled Amplifier) Track
 * Virtual fader that controls multiple assigned tracks.
 * Adjusting the VCA fader changes gain on all slave tracks
 * while maintaining their relative volume differences.
 *
 * VCA master logic includes:
 * - Proportional gain application to slave tracks
 * - Mute/solo propagation to slave tracks
 * - Automation enable/disable
 */
export class VCATrack {
  public readonly id: string;
  public name: string;
  private _gain: number = 1.0; // Linear gain (1.0 = 0dB)
  private _slaveTrackIds: Set<TrackId> = new Set();

  // Mute/Solo state
  private _muted: boolean = false;
  private _soloed: boolean = false;

  // Automation
  private _automationEnabled: boolean = false;

  public readonly gainChanged = new Signal<number>();
  public readonly slaveAdded = new Signal<TrackId>();
  public readonly slaveRemoved = new Signal<TrackId>();
  public readonly muteChanged = new Signal<boolean>();
  public readonly soloChanged = new Signal<boolean>();
  public readonly automationEnabledChanged = new Signal<boolean>();

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  public get gain(): number {
    return this._gain;
  }

  /**
   * Set VCA gain.
   * Returns the gain delta that should be applied to slave tracks.
   */
  public setGain(gain: number): number {
    const oldGain = this._gain;
    this._gain = Math.max(0, gain);
    // If oldGain is 0, we can't compute a meaningful ratio, so return 1.0 (no change)
    const delta = oldGain === 0 ? 1.0 : this._gain / oldGain;
    this.gainChanged.emit(this._gain);
    return delta;
  }

  /**
   * Set VCA gain in dB.
   */
  public setGainDb(db: number): number {
    return this.setGain(Math.pow(10, db / 20));
  }

  /**
   * Get current gain in dB.
   */
  public getGainDb(): number {
    return 20 * Math.log10(this._gain || 0.0001);
  }

  public addSlave(trackId: TrackId): void {
    if (!this._slaveTrackIds.has(trackId)) {
      this._slaveTrackIds.add(trackId);
      this.slaveAdded.emit(trackId);
    }
  }

  public removeSlave(trackId: TrackId): void {
    if (this._slaveTrackIds.has(trackId)) {
      this._slaveTrackIds.delete(trackId);
      this.slaveRemoved.emit(trackId);
    }
  }

  public hasSlave(trackId: TrackId): boolean {
    return this._slaveTrackIds.has(trackId);
  }

  public get slaveTrackIds(): ReadonlyArray<TrackId> {
    return Array.from(this._slaveTrackIds);
  }

  public get slaveCount(): number {
    return this._slaveTrackIds.size;
  }

  // ── VCA Master Control Logic ────────────────────────────────────────────

  /**
   * Apply the current VCA gain as a delta to all slave tracks.
   *
   * Each slave track's fader volume is multiplied by the VCA's current
   * linear gain. This preserves relative volume differences between
   * slave tracks while allowing group-level control.
   *
   * @param getTrack Function to look up a Track by its ID.
   * @returns Map of trackId -> the gain delta that was applied.
   */
  public applyGainToSlaves(
    getTrack: (id: TrackId) => Track | undefined,
  ): Map<TrackId, number> {
    const appliedGains = new Map<TrackId, number>();

    for (const slaveId of this._slaveTrackIds) {
      const track = getTrack(slaveId);
      if (!track) continue;

      // The VCA gain is the linear multiplier applied on top of
      // each slave's own fader setting. We convert the VCA linear
      // gain to dB and add it to the slave's route volume (which
      // is already in dB).
      const vcaGainDb = this.getGainDb();
      const currentVolume = track.route.volume;
      const newVolume = currentVolume + vcaGainDb;

      track.route.volume = newVolume;
      appliedGains.set(slaveId, vcaGainDb);
    }

    return appliedGains;
  }

  // ── Mute / Solo ─────────────────────────────────────────────────────────

  /**
   * Set the VCA mute state.
   * When a VCA is muted, all slave tracks are considered muted
   * regardless of their individual mute state.
   */
  public setMuted(muted: boolean): void {
    if (this._muted !== muted) {
      this._muted = muted;
      this.muteChanged.emit(muted);
    }
  }

  public get muted(): boolean {
    return this._muted;
  }

  /**
   * Set the VCA solo state.
   * When a VCA is soloed, all slave tracks are treated as soloed.
   */
  public setSoloed(soloed: boolean): void {
    if (this._soloed !== soloed) {
      this._soloed = soloed;
      this.soloChanged.emit(soloed);
    }
  }

  public get soloed(): boolean {
    return this._soloed;
  }

  /**
   * Check if a slave should be audible considering VCA state.
   *
   * A slave is NOT audible if:
   * - The VCA is muted (overrides individual track state)
   * - The slave is not actually assigned to this VCA
   *
   * A slave IS audible if:
   * - The VCA is not muted, or
   * - The VCA is soloed (solo overrides mute for slaves)
   *
   * @param trackId The slave track ID to check.
   * @returns true if the slave should produce audio.
   */
  public isSlaveAudible(trackId: TrackId): boolean {
    if (!this._slaveTrackIds.has(trackId)) {
      // Not our slave -- we have no opinion; return true
      return true;
    }

    // Solo overrides mute at VCA level
    if (this._soloed) {
      return true;
    }

    // If VCA is muted, slave is not audible
    if (this._muted) {
      return false;
    }

    return true;
  }

  /**
   * Remove all slave tracks from this VCA.
   */
  public clearSlaves(): void {
    const slaveIds = Array.from(this._slaveTrackIds);
    for (const id of slaveIds) {
      this._slaveTrackIds.delete(id);
      this.slaveRemoved.emit(id);
    }
  }

  // ── Automation ───────────────────────────────────────────────────────────

  /**
   * Enable or disable automation playback for this VCA.
   * When enabled, the VCA gain may be driven by an automation lane.
   */
  public setAutomationEnabled(enabled: boolean): void {
    if (this._automationEnabled === enabled) return;

    this._automationEnabled = enabled;
    this.automationEnabledChanged.emit(enabled);
  }

  public get automationEnabled(): boolean {
    return this._automationEnabled;
  }

  // ── Serialization ───────────────────────────────────────────────────────

  public toJSON(): VCATrackSnapshot {
    return {
      id: this.id,
      name: this.name,
      gain: this._gain,
      slaveTrackIds: Array.from(this._slaveTrackIds),
      muted: this._muted,
      soloed: this._soloed,
      automationEnabled: this._automationEnabled,
    };
  }

  public static fromJSON(data: VCATrackSnapshot): VCATrack {
    const vca = new VCATrack(data.id, data.name);
    vca._gain = data.gain;
    for (const id of data.slaveTrackIds) {
      vca._slaveTrackIds.add(id as TrackId);
    }
    vca._muted = data.muted ?? false;
    vca._soloed = data.soloed ?? false;
    vca._automationEnabled = data.automationEnabled ?? false;
    return vca;
  }
}

export interface VCATrackSnapshot {
  id: string;
  name: string;
  gain: number;
  slaveTrackIds: string[];
  muted?: boolean;
  soloed?: boolean;
  automationEnabled?: boolean;
}
