import { Signal } from "../lib/Signal";
import { FrameCount } from "./types";

export type MarkerId = string;

const MIN_MARKER_POSITION = 0;

/**
 * Song Position Marker
 *
 * 타임라인상의 특정 위치를 표시하는 마커입니다.
 * Verse, Chorus, Bridge 등 구간 표시나 북마크 용도로 사용됩니다.
 */
export class Marker {
  public readonly id: MarkerId;
  private _name: string;
  private _position: FrameCount;
  private _color: string;
  private _locked: boolean;

  public readonly changed = new Signal<void>();
  public readonly removed = new Signal<void>();

  constructor(
    id: MarkerId,
    name: string,
    position: FrameCount,
    color: string = "#ffcc00",
    locked: boolean = false,
  ) {
    this.id = id;
    this._name = name;
    this._position = Math.max(MIN_MARKER_POSITION, position);
    this._color = color;
    this._locked = locked;
  }

  public get name(): string {
    return this._name;
  }
  public set name(value: string) {
    if (this._name !== value) {
      this._name = value;
      this.changed.emit();
    }
  }

  public get position(): FrameCount {
    return this._position;
  }
  public set position(value: FrameCount) {
    if (this._locked) return;
    if (this._position !== value) {
      this._position = Math.max(MIN_MARKER_POSITION, value);
      this.changed.emit();
    }
  }

  public get color(): string {
    return this._color;
  }
  public set color(value: string) {
    if (this._color !== value) {
      this._color = value;
      this.changed.emit();
    }
  }

  public get locked(): boolean {
    return this._locked;
  }
  public set locked(value: boolean) {
    if (this._locked !== value) {
      this._locked = value;
      this.changed.emit();
    }
  }

  public move(newPosition: FrameCount): void {
    this.position = newPosition;
  }

  public clone(newId?: MarkerId): Marker {
    return new Marker(
      newId || (crypto.randomUUID() as MarkerId),
      this._name,
      this._position,
      this._color,
      this._locked,
    );
  }
}
