/**
 * CanvasItem — Base class for all scene graph items.
 *
 * - Lazy bounding box computation with dirty flag
 * - Parent-child hierarchy with coordinate transforms
 * - Visibility and event ignore flags
 * - Change notification for dirty-rect tracking
 */

import type { Point, Rect } from "./types";
import { rectContainsPoint, EMPTY_RECT } from "./types";

export abstract class CanvasItem {
  // ── Identity ──────────────────────────────────────────────────────────
  private static _nextId = 0;
  public readonly id = CanvasItem._nextId++;

  // ── Hierarchy ─────────────────────────────────────────────────────────
  private _parent: CanvasItem | null = null;

  get parent(): CanvasItem | null {
    return this._parent;
  }

  /** @internal Called by CanvasGroup when adding/removing children. */
  _setParent(parent: CanvasItem | null): void {
    this._parent = parent;
  }

  // ── Position (in parent coordinates) ──────────────────────────────────
  private _position: Point = { x: 0, y: 0 };

  get position(): Point {
    return this._position;
  }

  setPosition(p: Point): void {
    if (this._position.x === p.x && this._position.y === p.y) return;
    this.beginChange();
    this._position = { x: p.x, y: p.y };
    this._bboxDirty = true;
    this.endChange();
  }

  // ── Bounding box (item-local coordinates, lazy) ───────────────────────
  private _bbox: Rect = EMPTY_RECT;
  private _bboxDirty = true;

  /**
   * Get the bounding box in item-local coordinates.
   * Computed lazily and cached until invalidated.
   */
  get bbox(): Rect {
    if (this._bboxDirty) {
      this._bbox = this.computeBbox();
      this._bboxDirty = false;
    }
    return this._bbox;
  }

  /** Subclasses must implement: compute bounding box in item-local coords. */
  protected abstract computeBbox(): Rect;

  /** Mark bounding box as needing recomputation. */
  protected invalidateBbox(): void {
    if (this._bboxDirty) return;
    this.beginChange();
    this._bboxDirty = true;
    this.endChange();
  }

  // ── Visibility ────────────────────────────────────────────────────────
  private _visible = true;

  get visible(): boolean {
    return this._visible;
  }

  setVisible(v: boolean): void {
    if (this._visible === v) return;
    this.beginChange();
    this._visible = v;
    this.endChange();
  }

  /** Effective visibility — hidden if self or any ancestor is hidden. */
  get effectivelyVisible(): boolean {
    if (!this._visible) return false;
    if (this._parent) return this._parent.effectivelyVisible;
    return true;
  }

  // ── Events ────────────────────────────────────────────────────────────
  private _ignoreEvents = false;

  get ignoreEvents(): boolean {
    return this._ignoreEvents;
  }
  setIgnoreEvents(v: boolean): void {
    this._ignoreEvents = v;
  }

  // ── User data ─────────────────────────────────────────────────────────
  /** Arbitrary data attached to this item (e.g., domain Region reference). */
  public userData: unknown = null;

  // ── Coordinate transforms ─────────────────────────────────────────────

  /** Convert a point from item-local to parent coordinates. */
  itemToParent(p: Point): Point {
    return { x: p.x + this._position.x, y: p.y + this._position.y };
  }

  /** Convert a point from parent to item-local coordinates. */
  parentToItem(p: Point): Point {
    return { x: p.x - this._position.x, y: p.y - this._position.y };
  }

  /** Convert a point from item-local to canvas (root) coordinates. */
  itemToCanvas(p: Point): Point {
    let result = this.itemToParent(p);
    let ancestor = this._parent;
    while (ancestor) {
      result = ancestor.itemToParent(result);
      ancestor = ancestor.parent;
    }
    return result;
  }

  /** Convert a point from canvas (root) to item-local coordinates. */
  canvasToItem(p: Point): Point {
    // Build the ancestor chain, then apply transforms in reverse
    const chain: CanvasItem[] = [this];
    let ancestor: CanvasItem | null = this._parent;
    while (ancestor) {
      chain.push(ancestor);
      ancestor = ancestor.parent;
    }
    let result = p;
    // Traverse from root to self (reverse order), applying parentToItem
    for (let i = chain.length - 1; i >= 0; i--) {
      result = chain[i].parentToItem(result);
    }
    return result;
  }

  /** Get bounding box in canvas coordinates. */
  get canvasBbox(): Rect {
    const b = this.bbox;
    const origin = this.itemToCanvas({ x: 0, y: 0 });
    return {
      x: origin.x + b.x,
      y: origin.y + b.y,
      width: b.width,
      height: b.height,
    };
  }

  // ── Hit testing ───────────────────────────────────────────────────────

  /**
   * Test if a canvas-space point hits this item.
   * Default: checks against bounding box. Subclasses can override for
   * more precise shape testing.
   */
  covers(canvasPoint: Point): boolean {
    if (!this._visible || this._ignoreEvents) return false;
    const localPoint = this.canvasToItem(canvasPoint);
    return rectContainsPoint(this.bbox, localPoint);
  }

  // ── Change tracking (for dirty rect system) ───────────────────────────
  private _preBbox: Rect | null = null;

  /**
   * Call before modifying visual state.
   * Records the current canvas-space bbox for dirty tracking.
   */
  protected beginChange(): void {
    this._preBbox = this.canvasBbox;
  }

  /**
   * Call after modifying visual state.
   * Notifies the parent (and ultimately the scene graph) of the change.
   */
  protected endChange(): void {
    const postBbox = this.canvasBbox;
    if (this._parent && "_onChildChanged" in this._parent) {
      (
        this._parent as {
          _onChildChanged: (
            item: CanvasItem,
            preBbox: Rect | null,
            postBbox: Rect,
          ) => void;
        }
      )._onChildChanged(this, this._preBbox, postBbox);
    }
    this._preBbox = null;
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  /**
   * Render this item. Called by the scene graph during the paint pass.
   *
   * @param ctx — The 2D context, already translated so (0,0) is the
   *              item's canvas-space origin.
   * @param visibleRect — The visible viewport rect in canvas coordinates.
   *                      Items can use this to skip off-screen work.
   */
  abstract render(ctx: CanvasRenderingContext2D, visibleRect: Rect): void;

  // ── Cleanup ───────────────────────────────────────────────────────────

  dispose(): void {
    this._parent = null;
    this.userData = null;
  }
}
