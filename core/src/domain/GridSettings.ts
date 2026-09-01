import { Signal } from "../lib/Signal";
import { FrameCount } from "./types";

/**
 * Grid Type
 */
export enum GridType {
  /** 그리드 없음 */
  NO_GRID = "no_grid",

  /** 박자 기반 */
  BEAT_1_32 = "1/32",
  BEAT_1_16 = "1/16",
  BEAT_1_8 = "1/8",
  BEAT_1_4 = "1/4",
  BEAT_1_2 = "1/2",
  BEAT_1 = "1",
  BEAT_2 = "2",
  BEAT_4 = "4",
  BEAT_8 = "8",

  /** 시간 기반 */
  TIMECODE = "timecode",
  MINSEC = "minsec",
  SAMPLES = "samples",

  /** CD 프레임 */
  CD_FRAMES = "cdframes",
}

/**
 * Snap Mode
 */
export enum SnapMode {
  /** Snap 비활성화 */
  NO_SNAP = "no_snap",

  /** Grid에 Snap */
  SNAP_TO_GRID = "snap_to_grid",

  /** 자석 효과 (가까우면 snap) */
  SNAP_MAGNETIC = "snap_magnetic",
}

/**
 * Grid Settings
 *
 * Timeline의 grid와 snap 동작을 관리합니다.
 */
export class GridSettings {
  private _gridType: GridType = GridType.BEAT_1_4;
  private _snapMode: SnapMode = SnapMode.SNAP_TO_GRID;
  private _snapToGrid: boolean = true;

  // Tempo 정보 (향후 Tempo Map 연동)
  private _bpm: number = 120;
  private _timeSignatureNumerator: number = 4;
  private _timeSignatureDenominator: number = 4;

  // Signals
  public readonly changed = new Signal<void>();

  constructor(
    gridType: GridType = GridType.BEAT_1_4,
    snapMode: SnapMode = SnapMode.SNAP_TO_GRID,
    bpm: number = 120,
  ) {
    this._gridType = gridType;
    this._snapMode = snapMode;
    this._bpm = bpm;
  }

  // Getters
  public get gridType(): GridType {
    return this._gridType;
  }

  public get snapMode(): SnapMode {
    return this._snapMode;
  }

  public get snapToGrid(): boolean {
    return this._snapToGrid && this._snapMode !== SnapMode.NO_SNAP;
  }

  public get snapToGridEnabled(): boolean {
    return this._snapToGrid;
  }

  public get bpm(): number {
    return this._bpm;
  }

  public get timeSignatureNumerator(): number {
    return this._timeSignatureNumerator;
  }

  public get timeSignatureDenominator(): number {
    return this._timeSignatureDenominator;
  }

  // Setters
  public setGridType(gridType: GridType): void {
    if (this._gridType !== gridType) {
      this._gridType = gridType;
      this.changed.emit();
    }
  }

  public setSnapMode(snapMode: SnapMode): void {
    if (this._snapMode !== snapMode) {
      this._snapMode = snapMode;
      this.changed.emit();
    }
  }

  public setSnapToGrid(enabled: boolean): void {
    if (this._snapToGrid !== enabled) {
      this._snapToGrid = enabled;
      this.changed.emit();
    }
  }

  public setBPM(bpm: number): void {
    if (bpm > 0 && bpm <= 300) {
      this._bpm = bpm;
      this.changed.emit();
    }
  }

  public setTimeSignature(numerator: number, denominator: number): void {
    this._timeSignatureNumerator = numerator;
    this._timeSignatureDenominator = denominator;
    this.changed.emit();
  }

  /**
   * Grid 간격을 frames로 계산
   *
   * @param sampleRate 샘플 레이트
   * @returns Grid 간격 (frames)
   */
  public getGridIntervalFrames(sampleRate: number): FrameCount {
    if (this._gridType === GridType.NO_GRID) {
      return 0;
    }

    // BPM 기반 계산
    const secondsPerBeat = 60 / this._bpm;
    const framesPerBeat = secondsPerBeat * sampleRate;

    switch (this._gridType) {
      case GridType.BEAT_1_32:
        return Math.floor(framesPerBeat / 8); // 1/32 = 1/4 / 8
      case GridType.BEAT_1_16:
        return Math.floor(framesPerBeat / 4); // 1/16 = 1/4 / 4
      case GridType.BEAT_1_8:
        return Math.floor(framesPerBeat / 2); // 1/8 = 1/4 / 2
      case GridType.BEAT_1_4:
        return Math.floor(framesPerBeat);
      case GridType.BEAT_1_2:
        return Math.floor(framesPerBeat * 2);
      case GridType.BEAT_1:
        return Math.floor(framesPerBeat * 4); // 1 bar = 4 beats
      case GridType.BEAT_2:
        return Math.floor(framesPerBeat * 8);
      case GridType.BEAT_4:
        return Math.floor(framesPerBeat * 16);
      case GridType.BEAT_8:
        return Math.floor(framesPerBeat * 32);

      case GridType.SAMPLES:
        return 1024; // 1024 samples

      case GridType.CD_FRAMES:
        return Math.floor(sampleRate / 75); // CD: 75 frames/sec

      case GridType.TIMECODE:
      case GridType.MINSEC:
        return Math.floor(sampleRate); // 1 second

      default:
        return Math.floor(framesPerBeat);
    }
  }

  /**
   * Frame을 가장 가까운 grid에 snap
   *
   * @param frame 원본 frame
   * @param sampleRate 샘플 레이트
   * @returns Snapped frame
   */
  public snapToGridFrame(frame: FrameCount, sampleRate: number): FrameCount {
    if (!this.snapToGrid || this._gridType === GridType.NO_GRID) {
      return frame;
    }

    const gridInterval = this.getGridIntervalFrames(sampleRate);
    if (gridInterval === 0) {
      return frame;
    }

    // 가장 가까운 grid로 반올림
    const gridIndex = Math.round(frame / gridInterval);
    return gridIndex * gridInterval;
  }

  /**
   * Frame을 grid에 내림 (floor)
   */
  public snapToGridFloor(frame: FrameCount, sampleRate: number): FrameCount {
    if (!this.snapToGrid || this._gridType === GridType.NO_GRID) {
      return frame;
    }

    const gridInterval = this.getGridIntervalFrames(sampleRate);
    if (gridInterval === 0) {
      return frame;
    }

    const gridIndex = Math.floor(frame / gridInterval);
    return gridIndex * gridInterval;
  }

  /**
   * Frame을 grid에 올림 (ceil)
   */
  public snapToGridCeil(frame: FrameCount, sampleRate: number): FrameCount {
    if (!this.snapToGrid || this._gridType === GridType.NO_GRID) {
      return frame;
    }

    const gridInterval = this.getGridIntervalFrames(sampleRate);
    if (gridInterval === 0) {
      return frame;
    }

    const gridIndex = Math.ceil(frame / gridInterval);
    return gridIndex * gridInterval;
  }

  /**
   * DTO 변환
   */
  public toDTO() {
    return {
      gridType: this._gridType,
      snapMode: this._snapMode,
      snapToGrid: this._snapToGrid,
      bpm: this._bpm,
      timeSignature: `${this._timeSignatureNumerator}/${this._timeSignatureDenominator}`,
    };
  }
}
