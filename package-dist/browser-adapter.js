// core/src/lib/Signal.ts
var Signal = class {
  constructor() {
    this.slots = [];
  }
  /**
   * Connect a listener (slot) to this signal.
   * @returns A subscription object with a dispose method to unsubscribe.
   */
  connect(slot) {
    this.slots.push(slot);
    return {
      dispose: () => this.disconnect(slot)
    };
  }
  /**
   * Disconnect a listener from this signal.
   */
  disconnect(slot) {
    this.slots = this.slots.filter((s) => s !== slot);
  }
  /**
   * Emit the signal, notifying all connected listeners.
   */
  emit(data) {
    this.slots.forEach((slot) => slot(data));
  }
  /**
   * Clear all listeners.
   */
  clear() {
    this.slots = [];
  }
};

// core/src/automation/AutomationCurve.ts
var AutomationCurve = class _AutomationCurve {
  constructor() {
    /** Cached spline coefficients, one per segment (points.length - 1). */
    this._splineCoeffs = [];
    /** The points array snapshot used to compute the current coefficients. */
    this._splinePoints = [];
  }
  /**
   * Calculates the interpolated value between two points at a given time.
   * For non-spline interpolation types, this static method is sufficient.
   * @param start The starting automation point
   * @param end The ending automation point
   * @param time The time to calculate the value for (must be between start.time and end.time)
   * @param _curvature Optional tension/curvature parameter (not yet implemented fully)
   */
  static getValueAt(start, end, time, _curvature = 0.5) {
    if (time <= start.time) return start.value;
    if (time >= end.time) return end.value;
    const t = (time - start.time) / (end.time - start.time);
    switch (start.interpolation) {
      case "Hold" /* Hold */:
        return start.value;
      case "Linear" /* Linear */:
        return start.value + t * (end.value - start.value);
      case "Exponential" /* Exponential */:
        if (start.value > 1e-4 && end.value > 1e-4) {
          return start.value * Math.pow(end.value / start.value, t);
        }
        const curveT = t * t;
        return start.value + curveT * (end.value - start.value);
      case "Logarithmic" /* Logarithmic */:
        const logT = Math.sqrt(t);
        return start.value + logT * (end.value - start.value);
      default:
        return start.value + t * (end.value - start.value);
    }
  }
  /**
   * Recomputes CJC Kruger constrained cubic spline coefficients for the
   * given set of points. Must be called whenever points change if Curved
   * interpolation is in use.
   *
   * The CJC Kruger variant constrains tangent slopes so that the spline
   * is monotone between consecutive data points, preventing overshoot
   * and oscillation artifacts common with natural cubic splines.
   *
   * @param points Sorted automation points array
   */
  computeSplineCoefficients(points) {
    this._splinePoints = points;
    this._splineCoeffs = [];
    const n = points.length;
    if (n < 2) return;
    const delta = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      const dx = points[i + 1].time - points[i].time;
      delta[i] = dx === 0 ? 0 : (points[i + 1].value - points[i].value) / dx;
    }
    const m = new Array(n);
    m[0] = delta[0];
    m[n - 1] = delta[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (delta[i - 1] * delta[i] <= 0) {
        m[i] = 0;
      } else {
        m[i] = 2 / (1 / delta[i - 1] + 1 / delta[i]);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      if (delta[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      if (delta[i] !== 0) {
        const alpha = m[i] / delta[i];
        const beta = m[i + 1] / delta[i];
        const mag = Math.sqrt(alpha * alpha + beta * beta);
        if (mag > 3) {
          const tau = 3 / mag;
          m[i] = tau * alpha * delta[i];
          m[i + 1] = tau * beta * delta[i];
        }
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const h = points[i + 1].time - points[i].time;
      const y0 = points[i].value;
      const y1 = points[i + 1].value;
      const m0 = m[i];
      const m1 = m[i + 1];
      if (h === 0) {
        this._splineCoeffs.push({ a: y0, b: 0, c: 0, d: 0 });
        continue;
      }
      const a = y0;
      const b = m0;
      const c = (3 * (y1 - y0) / h - 2 * m0 - m1) / h;
      const d = (2 * (y0 - y1) / h + m0 + m1) / (h * h);
      this._splineCoeffs.push({ a, b, c, d });
    }
  }
  /**
   * Returns the spline-interpolated value at the given time.
   * Falls back to the static getValueAt for non-Curved interpolation types.
   *
   * @param points The sorted automation points
   * @param time The time to evaluate
   * @returns The interpolated value, or null if no points exist
   */
  getValueAt(points, time) {
    const n = points.length;
    if (n === 0) return null;
    if (time <= points[0].time) return points[0].value;
    if (time >= points[n - 1].time) return points[n - 1].value;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi - 1) {
      const mid = lo + hi >> 1;
      if (points[mid].time <= time) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    const start = points[lo];
    const end = points[hi];
    if (start.interpolation !== "Curved" /* Curved */) {
      return _AutomationCurve.getValueAt(start, end, time);
    }
    if (this._splineCoeffs.length === 0 || this._splinePoints !== points) {
      this.computeSplineCoefficients(points);
    }
    if (lo < this._splineCoeffs.length) {
      const coeff = this._splineCoeffs[lo];
      const x = time - start.time;
      return coeff.a + coeff.b * x + coeff.c * x * x + coeff.d * x * x * x;
    }
    return _AutomationCurve.getValueAt(start, end, time);
  }
  /**
   * Invalidates cached spline coefficients. Call this when points change.
   */
  invalidateSpline() {
    this._splineCoeffs = [];
    this._splinePoints = [];
  }
  /**
   * Returns a copy of the current spline coefficients (for inspection/testing).
   */
  getSplineCoefficients() {
    return [...this._splineCoeffs];
  }
};

// core/src/automation/PointThinning.ts
function triangleArea(a, b, c) {
  return Math.abs(
    (a.time * (b.value - c.value) + b.time * (c.value - a.value) + c.time * (a.value - b.value)) / 2
  );
}
function thinPoints(points, factor) {
  if (points.length <= 2) return [...points];
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    const area = triangleArea(prev, curr, next);
    if (area >= factor) {
      result.push(curr);
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

// core/src/automation/AutomationList.ts
var AutomationList = class _AutomationList {
  constructor() {
    this.points = [];
    this._mode = "read" /* READ */;
    /** Signals */
    this.changed = new Signal();
    this.modeChanged = new Signal();
    // --- B-1: Spline support ---
    this._curve = new AutomationCurve();
    // --- B-2: Touch state tracking ---
    this._touching = false;
    // --- B-3: Write pass tracking ---
    this._writePass = null;
    // --- B-4: Lookup cache ---
    this._lookupCache = null;
  }
  // =========================================================================
  // Mode
  // =========================================================================
  get mode() {
    return this._mode;
  }
  set mode(m) {
    if (this._mode !== m) {
      this._mode = m;
      this.modeChanged.emit(m);
    }
  }
  // =========================================================================
  // Point management
  // =========================================================================
  /**
   * Adds a new automation point at the given time/value.
   * Points are kept sorted by time.
   * @param time The point time in seconds
   * @param value The point value
   * @param interpolation The interpolation type for the segment starting at this point
   * @param id Optional explicit ID
   * @returns The created AutomationPoint
   */
  addPoint(time, value, interpolation = "Linear" /* Linear */, id) {
    const point = {
      id: id || crypto.randomUUID(),
      time,
      value,
      interpolation
    };
    const index = this.points.findIndex((p) => p.time > time);
    if (index === -1) {
      this.points.push(point);
    } else {
      this.points.splice(index, 0, point);
    }
    this._invalidateCache();
    this.changed.emit();
    return point;
  }
  /**
   * Updates an existing point's time and value.
   * Re-sorts the list if the time changes.
   * @param id The point ID
   * @param time New time
   * @param value New value
   * @returns true if the point was found and updated
   */
  updatePoint(id, time, value) {
    const index = this.points.findIndex((p) => p.id === id);
    if (index === -1) return false;
    const point = this.points[index];
    if (point.time !== time) {
      this.points.splice(index, 1);
      point.time = time;
      point.value = value;
      const newIndex = this.points.findIndex((p) => p.time > time);
      if (newIndex === -1) {
        this.points.push(point);
      } else {
        this.points.splice(newIndex, 0, point);
      }
    } else {
      point.value = value;
    }
    this._invalidateCache();
    this.changed.emit();
    return true;
  }
  /**
   * Removes a point by ID.
   * @param id The point ID
   * @returns true if the point was found and removed
   */
  removePoint(id) {
    const index = this.points.findIndex((p) => p.id === id);
    if (index !== -1) {
      this.points.splice(index, 1);
      this._invalidateCache();
      this.changed.emit();
      return true;
    }
    return false;
  }
  /**
   * Returns the sorted array of automation points (read-only view).
   */
  getPoints() {
    return this.points;
  }
  // =========================================================================
  // B-2: Touch state tracking
  // =========================================================================
  /**
   * Returns whether a user is currently touching (interacting with) this
   * automation parameter.
   */
  isTouching() {
    return this._touching;
  }
  /**
   * Begin a touch interaction at the given transport time.
   * In Touch/Latch modes this starts overwriting the existing curve.
   * @param when The transport time when the touch begins
   */
  startTouch(when) {
    this._touching = true;
    if (this._mode === "touch" /* TOUCH */ || this._mode === "latch" /* LATCH */) {
      this.startWritePass(when);
    }
  }
  /**
   * End a touch interaction at the given transport time.
   * In Touch mode the parameter returns to following the existing curve.
   * In Latch mode the last written value is held until playback stops.
   * @param when The transport time when the touch ends
   */
  stopTouch(when) {
    this._touching = false;
    if (this._writePass) {
      this.writePassFinished(when);
    }
  }
  /**
   * Returns true if automation playback should be active — i.e. the
   * parameter value should be read from the automation curve.
   *
   * - READ mode: always true
   * - WRITE mode: always false (manual control)
   * - TOUCH mode: true when NOT touching (follow curve), false when touching
   * - LATCH mode: true when NOT touching (follow curve), false when touching
   * - OFF mode: always false
   */
  automationPlayback() {
    switch (this._mode) {
      case "read" /* READ */:
        return true;
      case "write" /* WRITE */:
        return false;
      case "touch" /* TOUCH */:
      case "latch" /* LATCH */:
        return !this._touching;
      case "off" /* OFF */:
      default:
        return false;
    }
  }
  /**
   * Returns true if automation writing should be active — i.e. parameter
   * changes should be recorded into the automation curve.
   *
   * - READ mode: always false
   * - WRITE mode: always true
   * - TOUCH mode: true when touching
   * - LATCH mode: true when touching
   * - OFF mode: always false
   */
  automationWrite() {
    switch (this._mode) {
      case "read" /* READ */:
        return false;
      case "write" /* WRITE */:
        return true;
      case "touch" /* TOUCH */:
      case "latch" /* LATCH */:
        return this._touching;
      case "off" /* OFF */:
      default:
        return false;
    }
  }
  // =========================================================================
  // B-3: Write pass & point thinning
  // =========================================================================
  /**
   * Begins a write pass at the given time. Points written during the pass
   * will be tracked for later thinning.
   * @param when The transport time at the start of the write pass
   */
  startWritePass(when) {
    this._writePass = { startTime: when, endTime: when };
  }
  /**
   * Finishes the current write pass and optionally applies point thinning
   * to the points recorded during the pass.
   *
   * @param when The transport time at the end of the write pass
   * @param thinningFactor Optional area threshold for the triangle-area
   *   thinning algorithm. If provided and > 0, points in the write pass
   *   range with triangle area below this value are removed.
   */
  writePassFinished(when, thinningFactor) {
    if (!this._writePass) return;
    this._writePass.endTime = when;
    if (thinningFactor !== void 0 && thinningFactor > 0) {
      const start = this._writePass.startTime;
      const end = this._writePass.endTime;
      const before = [];
      const inRange = [];
      const after = [];
      for (const p of this.points) {
        if (p.time < start) {
          before.push(p);
        } else if (p.time > end) {
          after.push(p);
        } else {
          inRange.push(p);
        }
      }
      if (inRange.length > 2) {
        const thinned = thinPoints(inRange, thinningFactor);
        this.points = [...before, ...thinned, ...after];
        this._invalidateCache();
        this.changed.emit();
      }
    }
    this._writePass = null;
  }
  /**
   * Adds a guard point that preserves the current curve value just before
   * or after a write pass boundary. This prevents the write pass from
   * unintentionally altering automation outside its range.
   *
   * @param when The boundary time
   * @param offset A small time offset. Negative places the guard point
   *   before `when`, positive places it after.
   * @returns The created guard point, or null if no value could be determined
   */
  addGuardPoint(when, offset) {
    const guardTime = when + offset;
    const value = this.getValueAt(guardTime);
    if (value === null) return null;
    return this.addPoint(guardTime, value);
  }
  // =========================================================================
  // Value evaluation (B-1 spline + B-4 lookup cache)
  // =========================================================================
  /**
   * Calculates the value at a given time based on points and interpolation.
   * Uses the lookup cache (B-4) to accelerate sequential lookups and the
   * spline engine (B-1) for Curved interpolation.
   *
   * @param time The time in seconds
   * @returns The interpolated value, or null if no points exist
   */
  getValueAt(time) {
    if (this.points.length === 0) return null;
    const hasCurved = this.points.some(
      (p) => p.interpolation === "Curved" /* Curved */
    );
    if (hasCurved) {
      return this._curve.getValueAt(this.points, time);
    }
    if (time <= this.points[0].time) return this.points[0].value;
    if (time >= this.points[this.points.length - 1].time) {
      return this.points[this.points.length - 1].value;
    }
    let prevIndex;
    let nextIndex;
    if (this._lookupCache && time >= this._lookupCache.left && this._lookupCache.rightIndex < this.points.length && time < this.points[this._lookupCache.rightIndex].time) {
      prevIndex = this._lookupCache.leftIndex;
      nextIndex = this._lookupCache.rightIndex;
    } else {
      let lo = 0;
      let hi = this.points.length - 1;
      while (lo < hi - 1) {
        const mid = lo + hi >> 1;
        if (this.points[mid].time <= time) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      prevIndex = lo;
      nextIndex = hi;
      this._lookupCache = {
        left: this.points[lo].time,
        leftIndex: lo,
        rightIndex: hi
      };
    }
    const prevPoint = this.points[prevIndex];
    const nextPoint = this.points[nextIndex];
    return AutomationCurve.getValueAt(prevPoint, nextPoint, time);
  }
  // =========================================================================
  // B-6: Range operations
  // =========================================================================
  /**
   * Cuts (removes) all points in the time range [start, end] and returns
   * them as a new AutomationList. The original list is modified in place.
   *
   * @param start Start of the range (inclusive)
   * @param end End of the range (inclusive)
   * @returns A new AutomationList containing the cut points (times
   *   are preserved as-is)
   */
  cut(start, end) {
    const result = new _AutomationList();
    const kept = [];
    for (const p of this.points) {
      if (p.time >= start && p.time <= end) {
        result.addPoint(p.time, p.value, p.interpolation, p.id);
      } else {
        kept.push(p);
      }
    }
    this.points = kept;
    this._invalidateCache();
    this.changed.emit();
    return result;
  }
  /**
   * Copies all points in the time range [start, end] into a new
   * AutomationList without modifying the original.
   *
   * @param start Start of the range (inclusive)
   * @param end End of the range (inclusive)
   * @returns A new AutomationList containing copies of the points
   */
  copy(start, end) {
    const result = new _AutomationList();
    for (const p of this.points) {
      if (p.time >= start && p.time <= end) {
        result.addPoint(p.time, p.value, p.interpolation);
      }
    }
    return result;
  }
  /**
   * Pastes the points from a source AutomationList into this list,
   * offsetting their times so that the earliest source point lands
   * at the given position.
   *
   * @param source The AutomationList to paste from
   * @param position The target time for the earliest point
   */
  paste(source, position) {
    const sourcePoints = source.getPoints();
    if (sourcePoints.length === 0) return;
    const sourceStart = sourcePoints[0].time;
    const offset = position - sourceStart;
    for (const p of sourcePoints) {
      this.addPoint(p.time + offset, p.value, p.interpolation);
    }
  }
  /**
   * Removes all points in the time range [start, end].
   *
   * @param start Start of the range (inclusive)
   * @param end End of the range (inclusive)
   */
  eraseRange(start, end) {
    const before = this.points.length;
    this.points = this.points.filter((p) => p.time < start || p.time > end);
    if (this.points.length !== before) {
      this._invalidateCache();
      this.changed.emit();
    }
  }
  /**
   * Scales the time axis of all points by the given ratio.
   * A ratio of 2.0 stretches time to double, 0.5 compresses to half.
   *
   * @param ratio The time scaling ratio (must be > 0)
   */
  xScale(ratio) {
    if (ratio <= 0) return;
    for (const p of this.points) {
      p.time *= ratio;
    }
    this._invalidateCache();
    this.changed.emit();
  }
  /**
   * Transforms all point values through the given callback function.
   * Useful for operations like normalizing, inverting, or applying gain.
   *
   * @param fn A function that receives the current value and returns the
   *   transformed value
   */
  yTransform(fn) {
    for (const p of this.points) {
      p.value = fn(p.value);
    }
    this._invalidateCache();
    this.changed.emit();
  }
  // =========================================================================
  // Internal helpers
  // =========================================================================
  /**
   * Invalidates the lookup cache and spline coefficients.
   * Must be called whenever points are added, removed, or moved.
   */
  _invalidateCache() {
    this._lookupCache = null;
    this._curve.invalidateSpline();
  }
};

// core/src/processing/Processor.ts
var Processor = class {
  constructor(id, name) {
    // Parameter name -> AutomationList
    this.automations = /* @__PURE__ */ new Map();
    this._active = true;
    this.activeChanged = new Signal();
    this.stateChanged = new Signal();
    this.automationAdded = new Signal();
    // ── Tail length ─────────────────────────────────────────────────────────
    /**
     * The number of frames of audio "tail" this processor produces after
     * input ceases (e.g. reverb decay, delay feedback).  Used by the engine
     * to know how long to keep processing after playback stops.
     */
    this._tailLength = 0;
    this.tailLengthChanged = new Signal();
    // ── Latency ─────────────────────────────────────────────────────────────
    /**
     * Processing latency in samples.  Subclasses that introduce latency
     * (e.g. look-ahead limiters, linear-phase EQs) should call
     * {@link setLatency} rather than overriding {@link getLatency}.
     */
    this._latency = 0;
    this.latencyChanged = new Signal();
    this.id = id;
    this.name = name;
  }
  getAutomation(paramName) {
    if (!this.automations.has(paramName)) {
      const list = new AutomationList();
      this.automations.set(paramName, list);
      this.automationAdded.emit({ paramName, list });
    }
    return this.automations.get(paramName);
  }
  get active() {
    return this._active;
  }
  set active(value) {
    if (this._active !== value) {
      this._active = value;
      this.activeChanged.emit(value);
    }
  }
  // ── Tail length API ─────────────────────────────────────────────────────
  /**
   * Returns the tail length in frames.
   */
  getTailLength() {
    return this._tailLength;
  }
  /**
   * Set the tail length in frames.
   * @param frames Number of frames (>= 0).
   */
  setTailLength(frames) {
    const clamped = Math.max(0, frames);
    if (this._tailLength !== clamped) {
      this._tailLength = clamped;
      this.tailLengthChanged.emit(clamped);
    }
  }
  // ── Latency API ─────────────────────────────────────────────────────────
  /**
   * Returns the processing latency introduced by this processor, in samples.
   *
   * Subclasses that introduce latency (e.g. look-ahead limiters, linear-phase
   * EQs) should override this method.  The route uses the aggregate latency
   * of all its processors to compute automatic delay compensation
   * (see {@link Route.getProcessorLatency}).
   *
   * @returns Latency in samples (default 0).
   */
  getLatency() {
    return this._latency;
  }
  /**
   * Set the processing latency in samples.
   * @param samples Latency in samples (>= 0).
   */
  setLatency(samples) {
    const clamped = Math.max(0, samples);
    if (this._latency !== clamped) {
      this._latency = clamped;
      this.latencyChanged.emit(clamped);
    }
  }
  // ── Effective tail length ───────────────────────────────────────────────
  /**
   * Returns the effective tail length, which is the maximum of this
   * processor's own tail length and any child processor tail lengths.
   *
   * Subclasses that contain child processors (e.g. processor chains,
   * plugin wrappers) should override this to include their children.
   *
   * @returns Effective tail length in frames.
   */
  getEffectiveTailLength() {
    return this._tailLength;
  }
};

// core/src/processing/GainProcessor.ts
var GainProcessor = class extends Processor {
  constructor(id, name = "Fader") {
    super(id, name);
    this._gain = 0;
    // dB, default 0dB unity gain
    this.gainChanged = new Signal();
  }
  get gain() {
    return this._gain;
  }
  set gain(db) {
    if (this._gain !== db) {
      this._gain = db;
      this.gainChanged.emit(db);
      this.stateChanged.emit();
    }
  }
};

// core/src/processing/Panner.ts
function panLawCenterGain(law) {
  switch (law) {
    case "-3dB" /* MINUS_3DB */:
      return Math.pow(10, -3 / 20);
    // ~0.7071
    case "-4.5dB" /* MINUS_4_5DB */:
      return Math.pow(10, -4.5 / 20);
    // ~0.5957
    case "-6dB" /* MINUS_6DB */:
      return Math.pow(10, -6 / 20);
    // ~0.5012
    case "0dB" /* ZERO_DB */:
      return 1;
  }
}
var Panner = class extends Processor {
  constructor(id, name = "Panner", type = "equal_power" /* EQUAL_POWER */, panLaw = "-3dB" /* MINUS_3DB */) {
    super(id, name);
    /** Azimuth position: -1.0 (hard left) to 1.0 (hard right). */
    this._azimuth = 0;
    /** Stereo width: 0.0 (mono) to 1.0 (normal) to 2.0 (extra wide). */
    this._width = 1;
    /** Elevation: -1.0 to 1.0 (reserved for future 3-D / Atmos support). */
    this._elevation = 0;
    // ── Signals ─────────────────────────────────────────────────────────────
    this.azimuthChanged = new Signal();
    this.widthChanged = new Signal();
    this.typeChanged = new Signal();
    this._type = type;
    this._panLaw = panLaw;
  }
  // ── Getters ─────────────────────────────────────────────────────────────
  get type() {
    return this._type;
  }
  get panLaw() {
    return this._panLaw;
  }
  get azimuth() {
    return this._azimuth;
  }
  get width() {
    return this._width;
  }
  get elevation() {
    return this._elevation;
  }
  // ── Setters ─────────────────────────────────────────────────────────────
  /**
   * Set the pan position (azimuth).
   * @param value -1.0 (hard left) to 1.0 (hard right).
   */
  setAzimuth(value) {
    const clamped = Math.max(-1, Math.min(1, value));
    if (this._azimuth !== clamped) {
      this._azimuth = clamped;
      this.azimuthChanged.emit(clamped);
      this.stateChanged.emit();
    }
  }
  /**
   * Set the stereo width.
   * @param value 0.0 (mono) through 1.0 (normal) to 2.0 (extra wide).
   */
  setWidth(value) {
    const clamped = Math.max(0, Math.min(2, value));
    if (this._width !== clamped) {
      this._width = clamped;
      this.widthChanged.emit(clamped);
      this.stateChanged.emit();
    }
  }
  /**
   * Set the elevation (reserved for 3-D panning).
   * @param value -1.0 to 1.0.
   */
  setElevation(value) {
    const clamped = Math.max(-1, Math.min(1, value));
    this._elevation = clamped;
  }
  /**
   * Set the pan law.
   */
  setPanLaw(law) {
    this._panLaw = law;
    this.stateChanged.emit();
  }
  /**
   * Set the panner type (algorithm).
   */
  setType(type) {
    if (this._type !== type) {
      this._type = type;
      this.typeChanged.emit(type);
      this.stateChanged.emit();
    }
  }
  // ── Core computation ────────────────────────────────────────────────────
  /**
   * Compute the left and right gain coefficients for the current pan
   * position, width, type and pan law.
   *
   * @returns `[leftGain, rightGain]` — linear gain values.
   */
  computeGains() {
    switch (this._type) {
      case "equal_power" /* EQUAL_POWER */:
        return this._computeEqualPower();
      case "linear" /* LINEAR */:
        return this._computeLinear();
      case "stereo_balance" /* STEREO_BALANCE */:
        return this._computeStereoBalance();
      case "stereo_width" /* STEREO_WIDTH */:
        return this._computeStereoWidth();
    }
  }
  /**
   * Equal-power panning: left = cos(theta), right = sin(theta)
   * where theta = normalizedPan * PI/2.
   */
  _computeEqualPower() {
    const normalized = (this._azimuth + 1) / 2;
    const angle = normalized * Math.PI / 2;
    let leftGain = Math.cos(angle);
    let rightGain = Math.sin(angle);
    const compensation = this._centerCompensation("-3dB" /* MINUS_3DB */);
    leftGain *= compensation;
    rightGain *= compensation;
    return [leftGain, rightGain];
  }
  /**
   * Linear panning: left = 1 - pan, right = pan (pan 0..1).
   */
  _computeLinear() {
    const normalized = (this._azimuth + 1) / 2;
    let leftGain = 1 - normalized;
    let rightGain = normalized;
    const compensation = this._centerCompensation("-6dB" /* MINUS_6DB */);
    leftGain *= compensation;
    rightGain *= compensation;
    return [leftGain, rightGain];
  }
  /**
   * Stereo balance: attenuates the opposite channel rather than boosting.
   * At center both channels pass at unity; panning left attenuates right.
   */
  _computeStereoBalance() {
    const normalized = (this._azimuth + 1) / 2;
    let leftGain;
    let rightGain;
    if (normalized <= 0.5) {
      leftGain = 1;
      rightGain = normalized * 2;
    } else {
      leftGain = (1 - normalized) * 2;
      rightGain = 1;
    }
    return [leftGain, rightGain];
  }
  /**
   * Stereo width via mid/side (MS) encoding.
   *
   * Mid  = (L + R) / 2
   * Side = (L - R) / 2
   *
   * Recombine with width factor w:
   *   L' = Mid + w * Side
   *   R' = Mid - w * Side
   *
   * width = 0 -> mono, 1 -> normal stereo, 2 -> extra wide.
   *
   * Azimuth is applied on top as equal-power balance of the result.
   */
  _computeStereoWidth() {
    const normalized = (this._azimuth + 1) / 2;
    const angle = normalized * Math.PI / 2;
    let leftGain = Math.cos(angle);
    let rightGain = Math.sin(angle);
    const mid = 1;
    const side = this._width;
    const lScale = (mid + side) / 2;
    const rScale = (mid + side) / 2;
    leftGain *= lScale;
    rightGain *= rScale;
    const compensation = this._centerCompensation("-3dB" /* MINUS_3DB */);
    leftGain *= compensation;
    rightGain *= compensation;
    return [leftGain, rightGain];
  }
  /**
   * Compute the gain multiplier that compensates between the raw algorithm's
   * inherent center level and the user-selected pan law.
   *
   * @param rawLaw The pan law inherent to the raw algorithm.
   * @returns A linear gain multiplier (>= 1 if boosting center, <= 1 if cutting).
   */
  _centerCompensation(rawLaw) {
    const rawCenter = panLawCenterGain(rawLaw);
    const targetCenter = panLawCenterGain(this._panLaw);
    return targetCenter / rawCenter;
  }
  // ── Normalized / automation helpers ──────────────────────────────────────
  /**
   * Get the azimuth as a normalized 0..1 value (for automation lanes).
   * 0 = hard left, 0.5 = center, 1 = hard right.
   */
  getNormalizedAzimuth() {
    return (this._azimuth + 1) / 2;
  }
  /**
   * Set azimuth from a normalized 0..1 value.
   */
  setNormalizedAzimuth(normalized) {
    const clamped = Math.max(0, Math.min(1, normalized));
    this.setAzimuth(clamped * 2 - 1);
  }
  // ── Display ─────────────────────────────────────────────────────────────
  /**
   * Human-readable string for the current pan position.
   *
   * Examples: `"L 30"`, `"C"`, `"R 45"`, `"L 100"`.
   */
  valueAsString() {
    if (this._azimuth === 0) {
      return "C";
    }
    const pct = Math.round(Math.abs(this._azimuth) * 100);
    const dir = this._azimuth < 0 ? "L" : "R";
    return `${dir} ${pct}`;
  }
};

// core/src/processing/PolarityProcessor.ts
var PolarityProcessor = class extends Processor {
  constructor(id, name = "Polarity") {
    super(id, name);
    this._inverted = false;
    /** Emitted whenever the polarity state changes. */
    this.polarityChanged = new Signal();
  }
  /** Whether the signal is phase-inverted. */
  get inverted() {
    return this._inverted;
  }
  /**
   * Set the polarity inversion state.
   * @param inverted `true` to invert (multiply samples by -1), `false` for normal.
   */
  setInverted(inverted) {
    if (this._inverted !== inverted) {
      this._inverted = inverted;
      this.polarityChanged.emit(inverted);
      this.stateChanged.emit();
    }
  }
};

// core/src/processing/IO.ts
var IO = class {
  constructor(id, name, dataType = "audio") {
    // Connected IOs (Output -> Input)
    // If this is an Output, `connections` lists the Inputs it feeds.
    // If this is an Input, `connections` implies source Outputs (though usually tracked by Output).
    // For simplicity, we model: Output knows its destinations.
    this._connections = [];
    this._latency = 0;
    this.connected = new Signal();
    this.disconnected = new Signal();
    this.latencyChanged = new Signal();
    this.id = id;
    this.name = name;
    this.dataType = dataType;
  }
  get latency() {
    return this._latency;
  }
  set latency(value) {
    if (this._latency !== value) {
      this._latency = value;
      this.latencyChanged.emit(value);
    }
  }
  get bundleName() {
    return this._bundleName;
  }
  set bundleName(value) {
    this._bundleName = value;
  }
  /**
   * Returns the maximum latency across all connected IOs.
   * Accepts a resolver function that maps an IOId to its latency value.
   */
  getConnectedLatency(resolveLatency) {
    if (this._connections.length === 0) {
      return 0;
    }
    return Math.max(...this._connections.map(resolveLatency));
  }
  connect(targetId) {
    if (!this._connections.includes(targetId)) {
      this._connections.push(targetId);
      this.connected.emit(targetId);
    }
  }
  disconnect(targetId) {
    const index = this._connections.indexOf(targetId);
    if (index !== -1) {
      this._connections.splice(index, 1);
      this.disconnected.emit(targetId);
    }
  }
  get connections() {
    return this._connections;
  }
  isConnectedTo(targetId) {
    return this._connections.includes(targetId);
  }
};

// core/src/audio/engine/LatencyCompensator.ts
var LatencyCompensator = class {
  constructor(channels = 2, maxDelay = 8192) {
    this._delaySamples = 0;
    // per-channel ring buffers
    this._writePos = 0;
    this._channels = channels;
    this._maxDelay = maxDelay;
    this._buffer = [];
    for (let ch = 0; ch < channels; ch++) {
      this._buffer.push(new Float32Array(maxDelay));
    }
  }
  /** Current delay in samples. */
  get delaySamples() {
    return this._delaySamples;
  }
  /**
   * Set the compensation delay.
   * @param samples Delay in samples (clamped to 0 .. maxDelay - 1).
   */
  setDelay(samples) {
    this._delaySamples = Math.max(0, Math.min(samples, this._maxDelay - 1));
  }
  /**
   * Process a block of audio through the delay buffer.
   *
   * For each sample in the block the method writes the input into the ring
   * buffer at `_writePos` and reads the output from `_writePos - delay`
   * (wrapped).  This introduces an exact `_delaySamples` latency.
   *
   * If `_delaySamples` is 0 the input is copied directly to the output
   * with no ring-buffer overhead.
   *
   * @param input  Per-channel input arrays (length >= blockSize each).
   * @param output Per-channel output arrays (length >= blockSize each).
   *               May alias the same arrays as `input`.
   * @param blockSize Number of samples to process.
   */
  process(input, output, blockSize) {
    const delay = this._delaySamples;
    if (delay === 0) {
      for (let ch = 0; ch < this._channels; ch++) {
        if (input[ch] !== output[ch]) {
          output[ch].set(input[ch].subarray(0, blockSize));
        }
      }
      return;
    }
    const maxDelay = this._maxDelay;
    for (let i = 0; i < blockSize; i++) {
      const wp = this._writePos;
      let rp = wp - delay;
      if (rp < 0) rp += maxDelay;
      for (let ch = 0; ch < this._channels; ch++) {
        this._buffer[ch][wp] = input[ch][i];
        output[ch][i] = this._buffer[ch][rp];
      }
      this._writePos = (wp + 1) % maxDelay;
    }
  }
  /**
   * Reset all ring buffers to silence and rewind the write pointer.
   * Call after a transport locate or when the delay amount changes to
   * avoid stale audio leaking through.
   */
  reset() {
    this._writePos = 0;
    for (let ch = 0; ch < this._channels; ch++) {
      this._buffer[ch].fill(0);
    }
  }
};

// core/src/domain/Route.ts
var Route = class {
  constructor(id, name) {
    this._preFaderProcessors = [];
    this._postFaderProcessors = [];
    this.processorAdded = new Signal();
    this.processorRemoved = new Signal();
    this._active = true;
    // ── Latency Compensation (D-5) ──────────────────────────────────────────
    /**
     * Auto-computed compensation delay (in samples) applied to this route
     * so that all routes in the session are time-aligned.
     */
    this._compensationDelay = 0;
    /**
     * Delay buffer that applies `_compensationDelay` samples of latency to
     * this route's audio so all routes stay time-aligned at the summing bus.
     */
    this.latencyCompensator = new LatencyCompensator();
    /**
     * Emitted whenever the total processor latency of this route changes,
     * carrying the new total latency in samples.  The session listens to
     * this signal to know when to recompute global compensation.
     */
    this.latencyChanged = new Signal();
    /** Disposers for processor latency-change subscriptions. */
    this._latencySubscriptions = /* @__PURE__ */ new Map();
    this.id = id;
    this.name = name;
    this.input = new IO(crypto.randomUUID(), `${name} Input`);
    this.output = new IO(crypto.randomUUID(), `${name} Output`);
    this._trim = new GainProcessor(crypto.randomUUID(), "Trim");
    this._fader = new GainProcessor(crypto.randomUUID());
    this._polarity = new PolarityProcessor(crypto.randomUUID());
    this._panner = new Panner(crypto.randomUUID());
  }
  /**
   * Adds a processor to the chain.
   * @param processor The processor to add
   * @param position 'pre' (before fader) or 'post' (after fader)
   * @param index Index within the specific chain (not global index)
   */
  addProcessor(processor, position = "pre", index) {
    const targetList = position === "pre" ? this._preFaderProcessors : this._postFaderProcessors;
    if (index !== void 0 && index >= 0 && index <= targetList.length) {
      targetList.splice(index, 0, processor);
    } else {
      targetList.push(processor);
    }
    this._subscribeToProcessorLatency(processor);
    this.processorAdded.emit(processor);
    this.updateLatencyCompensation();
  }
  removeProcessor(id) {
    let index = this._preFaderProcessors.findIndex((p) => p.id === id);
    if (index !== -1) {
      this._preFaderProcessors.splice(index, 1);
      this._unsubscribeFromProcessorLatency(id);
      this.processorRemoved.emit(id);
      this.updateLatencyCompensation();
      return;
    }
    index = this._postFaderProcessors.findIndex((p) => p.id === id);
    if (index !== -1) {
      this._postFaderProcessors.splice(index, 1);
      this._unsubscribeFromProcessorLatency(id);
      this.processorRemoved.emit(id);
      this.updateLatencyCompensation();
      return;
    }
  }
  /**
   * Reorder a processor within the same chain (pre or post fader).
   */
  reorderProcessor(id, newIndex) {
    let idx = this._preFaderProcessors.findIndex((p) => p.id === id);
    if (idx !== -1) {
      const [proc] = this._preFaderProcessors.splice(idx, 1);
      const clampedIdx = Math.max(
        0,
        Math.min(newIndex, this._preFaderProcessors.length)
      );
      this._preFaderProcessors.splice(clampedIdx, 0, proc);
      return;
    }
    idx = this._postFaderProcessors.findIndex((p) => p.id === id);
    if (idx !== -1) {
      const [proc] = this._postFaderProcessors.splice(idx, 1);
      const clampedIdx = Math.max(
        0,
        Math.min(newIndex, this._postFaderProcessors.length)
      );
      this._postFaderProcessors.splice(clampedIdx, 0, proc);
      return;
    }
  }
  /**
   * Full ordered processor chain.
   *
   * Order: Trim -> [Pre-fader] -> Fader -> Polarity -> [Post-fader] -> Panner
   */
  get processors() {
    return [
      this._trim,
      ...this._preFaderProcessors,
      this._fader,
      this._polarity,
      ...this._postFaderProcessors,
      this._panner
    ];
  }
  get preFaderProcessors() {
    return this._preFaderProcessors;
  }
  get postFaderProcessors() {
    return this._postFaderProcessors;
  }
  // ── Legacy / Convenience Accessors ───────────────────────────────────────
  get volume() {
    return this._fader.gain;
  }
  set volume(db) {
    this._fader.gain = db;
  }
  get pan() {
    return this._panner.azimuth;
  }
  set pan(val) {
    this._panner.setAzimuth(val);
  }
  /**
   * Input trim gain in dB.
   * Used for pre-fader level correction (e.g. mic preamp adjustment).
   */
  get trim() {
    return this._trim.gain;
  }
  set trim(db) {
    this._trim.gain = db;
  }
  get active() {
    return this._active;
  }
  set active(value) {
    this._active = value;
  }
  // ── Direct access to core processors ─────────────────────────────────────
  /** Input trim gain processor. */
  get trimProcessor() {
    return this._trim;
  }
  /** Main channel fader. */
  get fader() {
    return this._fader;
  }
  /** Polarity (phase inversion) processor. */
  get polarity() {
    return this._polarity;
  }
  /** Channel panner. */
  get panner() {
    return this._panner;
  }
  // ── Latency Compensation (D-5) ──────────────────────────────────────────
  /**
   * Sum of latencies (in samples) introduced by all processors in this route.
   *
   * This represents the total processing delay that audio experiences as it
   * passes through the signal chain.  Used by the session to compute
   * per-route compensation delays so that all routes stay time-aligned.
   */
  getProcessorLatency() {
    let total = 0;
    for (const proc of this.processors) {
      total += proc.getLatency();
    }
    return total;
  }
  /**
   * Alias for {@link getProcessorLatency} — returns the total latency
   * (in samples) across every processor in the chain.
   */
  getTotalLatency() {
    return this.getProcessorLatency();
  }
  /**
   * Returns the maximum tail length (in frames) across all processors in
   * this route.
   *
   * The tail length represents the duration of audio "tail" that persists
   * after input ceases (e.g. reverb decay, delay feedback).  The engine
   * uses this value to know how long to keep processing after playback
   * stops.
   */
  getTotalTailLength() {
    let maxTail = 0;
    for (const proc of this.processors) {
      const tail = proc.getEffectiveTailLength();
      if (tail > maxTail) {
        maxTail = tail;
      }
    }
    return maxTail;
  }
  /**
   * The current compensation delay applied to this route (in samples).
   *
   * The value is set by the session / engine after evaluating all routes.
   * A route with lower inherent latency gets a larger compensation delay
   * so that every route's effective latency equals the session maximum.
   */
  get compensationDelay() {
    return this._compensationDelay;
  }
  /**
   * Recalculate the route-level latency total and emit {@link latencyChanged}
   * when it differs from the previous value.  Also syncs the
   * {@link latencyCompensator} delay with {@link _compensationDelay}.
   *
   * Called automatically whenever a processor is added / removed or any
   * processor's latency changes.
   */
  updateLatencyCompensation() {
    const total = this.getProcessorLatency();
    this.latencyCompensator.setDelay(this._compensationDelay);
    this.latencyChanged.emit(total);
  }
  /**
   * Directly set the compensation delay for this route.
   * @param samples Delay in samples (>= 0).
   */
  setCompensationDelay(samples) {
    this._compensationDelay = Math.max(0, samples);
    this.latencyCompensator.setDelay(this._compensationDelay);
  }
  /**
   * Compute the compensation delay needed for this route given the
   * maximum latency across the entire session.
   *
   * Call this once per route after determining `maxLatency` via
   * `Math.max(...routes.map(r => r.getProcessorLatency()))`.
   *
   * @param maxLatency The highest processor latency among all routes (in samples).
   */
  computeLatencyCompensation(maxLatency) {
    if (maxLatency !== void 0) {
      const ownLatency = this.getTotalLatency();
      this._compensationDelay = Math.max(0, maxLatency - ownLatency);
    } else {
      this._compensationDelay = this.getTotalLatency();
    }
    this.latencyCompensator.setDelay(this._compensationDelay);
  }
  // ── Private: processor latency subscriptions ────────────────────────────
  _subscribeToProcessorLatency(processor) {
    const sub = processor.latencyChanged.connect(() => {
      this.updateLatencyCompensation();
    });
    this._latencySubscriptions.set(processor.id, sub);
  }
  _unsubscribeFromProcessorLatency(id) {
    const sub = this._latencySubscriptions.get(id);
    if (sub) {
      sub.dispose();
      this._latencySubscriptions.delete(id);
    }
  }
};

// core/src/domain/temporal/types.ts
var TICKS_PER_BEAT = 1920;
var Beats = class _Beats {
  // Internal representation in ticks
  constructor(beats = 0) {
    this._ticks = Math.round(beats * TICKS_PER_BEAT);
  }
  static fromTicks(ticks) {
    const b = new _Beats();
    b._ticks = Math.round(ticks);
    return b;
  }
  toNumber() {
    return this._ticks / TICKS_PER_BEAT;
  }
  toTicks() {
    return this._ticks;
  }
  add(other) {
    return _Beats.fromTicks(this._ticks + other._ticks);
  }
  subtract(other) {
    return _Beats.fromTicks(this._ticks - other._ticks);
  }
  multiply(factor) {
    return _Beats.fromTicks(Math.round(this._ticks * factor));
  }
  equals(other) {
    return this._ticks === other._ticks;
  }
  lessThan(other) {
    return this._ticks < other._ticks;
  }
  greaterThan(other) {
    return this._ticks > other._ticks;
  }
};

// core/src/domain/Region.ts
var Region = class _Region {
  constructor(id, sourceId, start, length, sourceStart, name, layer = 0) {
    // Source usage
    this.sourceStart = 0;
    // Playback properties
    this.gain = 1;
    this.muted = false;
    this.layer = 0;
    this.opaque = true;
    this.fadeIn = 0;
    this.fadeOut = 0;
    this.fadeInShape = 1 /* EQUAL_POWER */;
    this.fadeOutShape = 1 /* EQUAL_POWER */;
    this.playbackRate = 1;
    /** Pitch-preserving time stretch ratio (1.0 = normal, 0.5 = half speed, 2.0 = double speed) */
    this.stretch = 1;
    /** Pitch shift in semitones (0 = no shift, positive = higher, negative = lower) */
    this.pitchSemitones = 0;
    // Sync point (offset from region start, used for snap alignment)
    this.syncPosition = null;
    // Transient positions (frame offsets from region start / source)
    this.transients = [];
    // Lock state
    this.locked = false;
    /** Time domain for this region (default: AudioTime for backward compatibility) */
    this.timeDomain = 0 /* AudioTime */;
    // Region FX (per-region plugin chain)
    this._regionFx = [];
    // Enhanced lock types
    this._positionLocked = false;
    this._videoLocked = false;
    // Signals
    this.lockedChanged = new Signal();
    this.regionFxAdded = new Signal();
    this.regionFxRemoved = new Signal();
    this.id = id;
    this.sourceId = sourceId;
    this.start = start;
    this.length = length;
    this.sourceStart = sourceStart;
    this.name = name;
    this.layer = layer;
  }
  get end() {
    return this.start + this.length;
  }
  /** Get position as TimePosition */
  getPosition() {
    return { domain: this.timeDomain, value: this.start };
  }
  /** Get duration as TimePosition */
  getDuration() {
    return { domain: this.timeDomain, value: this.length };
  }
  /** Set position from TimePosition (converts if needed) */
  setPosition(pos, tempoMap, bpm) {
    this.start = tempoMap.toFrames(pos, bpm);
    this.timeDomain = pos.domain;
  }
  /** Set duration from TimePosition (converts if needed) */
  setDuration(duration, tempoMap, bpm) {
    this.length = tempoMap.toFrames(duration, bpm);
    this.timeDomain = duration.domain;
  }
  setLocked(locked) {
    if (this.locked === locked) return;
    this.locked = locked;
    this.lockedChanged.emit(locked);
  }
  resize(newLength) {
    if (newLength < 0) return;
    this.length = newLength;
  }
  move(newStart) {
    if (newStart < 0) newStart = 0;
    this.start = newStart;
  }
  static {
    // ─── Trim Operations ──────────────────────────────────────────────────
    /** Minimum region length in frames (1 sample) */
    this.MIN_LENGTH = 1;
  }
  /**
   * Trim the front of the region by an amount (delta-based).
   * Positive amount moves start forward (shortens region).
   * Negative amount moves start backward (extends region, if source allows).
   */
  trimFront(amount) {
    if (amount >= this.length) return;
    if (this.sourceStart + amount < 0) {
      amount = -this.sourceStart;
    }
    if (amount === 0) return;
    this.start += amount;
    this.sourceStart += amount;
    this.length -= amount;
    if (this.transients.length > 0) {
      this.transients = this.transients.map((t) => t - amount).filter((t) => t >= 0 && t < this.length);
    }
  }
  /**
   * Trim the back of the region by an amount (delta-based).
   * Positive amount extends region, negative shortens it.
   */
  trimBack(amount) {
    if (-amount >= this.length) return;
    this.length += amount;
    if (this.transients.length > 0) {
      this.transients = this.transients.filter((t) => t < this.length);
    }
  }
  /**
   * Trim front to a new absolute timeline position.
   * Adjusts start, sourceStart, and length so the end stays fixed.
   * @param newPosition - The new timeline start position
   * @param sourceDuration - Optional source duration for boundary constraint
   */
  trimFrontTo(newPosition, sourceDuration) {
    if (this.locked || this._positionLocked) return;
    if (newPosition < 0) newPosition = 0;
    const currentEnd = this.end;
    if (newPosition >= currentEnd) return;
    const delta = newPosition - this.start;
    const newSourceStart = this.sourceStart + delta;
    if (newSourceStart < 0) return;
    const newLength = currentEnd - newPosition;
    if (sourceDuration !== void 0 && newSourceStart + newLength > sourceDuration)
      return;
    if (newLength < _Region.MIN_LENGTH) return;
    this.start = newPosition;
    this.sourceStart = newSourceStart;
    this.length = newLength;
    if (this.fadeIn + this.fadeOut > this.length) {
      this.fadeIn = Math.max(0, this.length - this.fadeOut);
    }
    if (this.transients.length > 0) {
      this.transients = this.transients.map((t) => t - delta).filter((t) => t >= 0 && t < this.length);
    }
  }
  /**
   * Trim end to a new absolute timeline endpoint.
   * Adjusts length while keeping start and sourceStart fixed.
   * @param newEndpoint - The new timeline end position
   * @param sourceDuration - Optional source duration for boundary constraint
   */
  trimEndTo(newEndpoint, sourceDuration) {
    if (this.locked || this._positionLocked) return;
    if (newEndpoint <= this.start) return;
    const newLength = newEndpoint - this.start;
    if (sourceDuration !== void 0 && this.sourceStart + newLength > sourceDuration)
      return;
    if (newLength < _Region.MIN_LENGTH) return;
    this.length = newLength;
    if (this.fadeIn + this.fadeOut > this.length) {
      this.fadeOut = Math.max(0, this.length - this.fadeIn);
    }
    if (this.transients.length > 0) {
      this.transients = this.transients.filter((t) => t < this.length);
    }
  }
  /**
   * Trim both position and length atomically.
   * @param position - New timeline position
   * @param length - New length
   * @param sourceDuration - Optional source duration for constraint
   */
  trimTo(position, length, sourceDuration) {
    if (this.locked || this._positionLocked) return;
    if (position < 0 || length < _Region.MIN_LENGTH) return;
    const delta = position - this.start;
    const newSourceStart = this.sourceStart + delta;
    if (newSourceStart < 0) return;
    if (sourceDuration !== void 0 && newSourceStart + length > sourceDuration) {
      length = sourceDuration - newSourceStart;
      if (length < _Region.MIN_LENGTH) return;
    }
    this.start = position;
    this.sourceStart = newSourceStart;
    this.length = length;
    if (this.fadeIn + this.fadeOut > this.length) {
      this.fadeIn = Math.min(this.fadeIn, this.length);
      this.fadeOut = Math.max(0, this.length - this.fadeIn);
    }
    if (this.transients.length > 0) {
      this.transients = this.transients.map((t) => t - delta).filter((t) => t >= 0 && t < this.length);
    }
  }
  /**
   * Check if this region can trim its start before the source's beginning.
   * Audio regions cannot (they'd read silence); MIDI regions can.
   */
  canTrimStartBeforeSourceStart() {
    return false;
  }
  /**
   * Verify and clamp start + length to source boundaries.
   * @returns true if the values were valid (or clamped successfully)
   */
  verifyStartAndLength(sourceDuration) {
    if (sourceDuration === void 0) return true;
    if (this.sourceStart < 0) {
      this.sourceStart = 0;
    }
    const maxLength = sourceDuration - this.sourceStart;
    if (maxLength <= 0) return false;
    if (this.length > maxLength) {
      this.length = maxLength;
    }
    return true;
  }
  setFadeIn(amount) {
    if (amount < 0) amount = 0;
    if (amount + this.fadeOut > this.length) {
      amount = this.length - this.fadeOut;
    }
    this.fadeIn = amount;
  }
  setFadeOut(amount) {
    if (amount < 0) amount = 0;
    if (this.fadeIn + amount > this.length) {
      amount = this.length - this.fadeIn;
    }
    this.fadeOut = amount;
  }
  // ─── C-2: Advanced Fade System ────────────────────────────────────────────
  /** Set the fade-in curve shape. */
  setFadeInShape(shape) {
    this.fadeInShape = shape;
  }
  /** Set the fade-out curve shape. */
  setFadeOutShape(shape) {
    this.fadeOutShape = shape;
  }
  // ─── C-1: Region Overlap & Coverage Detection ────────────────────────────
  /**
   * Determine how a query range [start, end) relates to this region.
   */
  coverage(start, end) {
    const rStart = this.start;
    const rEnd = this.end;
    if (start >= rEnd || end <= rStart) {
      return 0 /* NONE */;
    }
    if (start <= rStart && end >= rEnd) {
      return 4 /* EXTERNAL */;
    }
    if (start >= rStart && end <= rEnd) {
      return 1 /* INTERNAL */;
    }
    if (start < rStart) {
      return 2 /* START */;
    }
    return 3 /* END */;
  }
  /**
   * Does this region cover the given frame position?
   */
  covers(frame) {
    return frame >= this.start && frame < this.end;
  }
  // ─── C-3: Sync Point ─────────────────────────────────────────────────────
  /** Set the sync point as an offset from the region start. */
  setSyncPosition(offset) {
    this.syncPosition = offset;
  }
  /** Clear the sync point. */
  clearSyncPosition() {
    this.syncPosition = null;
  }
  /**
   * Get the sync offset. Returns 0 if no sync point is set.
   */
  getSyncOffset() {
    return this.syncPosition ?? 0;
  }
  /**
   * Adjust a frame position by the sync offset.
   * Useful for snap-to-grid alignment: if the region has a sync point,
   * the snap target should account for this offset.
   */
  adjustToSync(frame) {
    return frame - this.getSyncOffset();
  }
  // ─── C-4: Region Equivalence & Grouping ──────────────────────────────────
  /**
   * True if both regions reference the same source, have the same position,
   * length, and source start.
   */
  exactEquivalent(other) {
    return this.sourceId === other.sourceId && this.start === other.start && this.length === other.length && this.sourceStart === other.sourceStart;
  }
  /** True if both regions reference the same source file. */
  sourceEquivalent(other) {
    return this.sourceId === other.sourceId;
  }
  /** True if the two regions overlap in time. */
  overlapEquivalent(other) {
    return this.start < other.end && other.start < this.end;
  }
  /** True if the two regions share the same layer and overlap in time. */
  layerAndTimeEquivalent(other) {
    return this.layer === other.layer && this.overlapEquivalent(other);
  }
  // ─── C-6: Transient helpers ──────────────────────────────────────────────
  /** Add a transient at the given frame position. Keeps the list sorted. */
  addTransient(frame) {
    if (this.transients.includes(frame)) return;
    this.transients.push(frame);
    this.transients.sort((a, b) => a - b);
  }
  /** Remove the transient at the given frame position (if present). */
  removeTransient(frame) {
    const idx = this.transients.indexOf(frame);
    if (idx !== -1) {
      this.transients.splice(idx, 1);
    }
  }
  /** Get a readonly copy of the transient positions. */
  getTransients() {
    return this.transients;
  }
  /** Whether this region has any detected/manual transients. */
  hasTransients() {
    return this.transients.length > 0;
  }
  // ─── Region FX (Per-Region Plugin Chain) ────────────────────────────────
  /** Add a processor to the region's FX chain. */
  addRegionFx(processor) {
    this._regionFx.push(processor);
    this.regionFxAdded.emit(processor);
  }
  /** Remove a processor from the region's FX chain by its ID. */
  removeRegionFx(processorId) {
    const idx = this._regionFx.findIndex((p) => p.id === processorId);
    if (idx === -1) return;
    const [removed] = this._regionFx.splice(idx, 1);
    this.regionFxRemoved.emit(removed);
  }
  /** Get a readonly copy of the region's FX chain. */
  getRegionFx() {
    return [...this._regionFx];
  }
  /** Move a processor to a new index in the FX chain. */
  moveRegionFx(processorId, newIndex) {
    const idx = this._regionFx.findIndex((p) => p.id === processorId);
    if (idx === -1) return;
    const clamped = Math.max(0, Math.min(newIndex, this._regionFx.length - 1));
    const [processor] = this._regionFx.splice(idx, 1);
    this._regionFx.splice(clamped, 0, processor);
  }
  /** Remove all processors from the region's FX chain. */
  clearRegionFx() {
    const removed = [...this._regionFx];
    this._regionFx = [];
    for (const processor of removed) {
      this.regionFxRemoved.emit(processor);
    }
  }
  /** Whether this region has any FX processors. */
  hasRegionFx() {
    return this._regionFx.length > 0;
  }
  // ─── Ancestral Tracking (Undo) ──────────────────────────────────────────
  /** Get the ancestral start position (before any edits). */
  getAncestralStart() {
    return this._ancestralStart;
  }
  /** Get the ancestral length (before any edits). */
  getAncestralLength() {
    return this._ancestralLength;
  }
  /** Set the ancestral data for undo tracking. */
  setAncestralData(start, length) {
    this._ancestralStart = start;
    this._ancestralLength = length;
  }
  // ─── Enhanced Lock Types ────────────────────────────────────────────────
  /** Whether the region's position is locked (cannot be moved). */
  isPositionLocked() {
    return this._positionLocked;
  }
  /** Set the position lock state. */
  setPositionLocked(locked) {
    this._positionLocked = locked;
  }
  /** Whether the region is video-locked (synced to video timeline). */
  isVideoLocked() {
    return this._videoLocked;
  }
  /** Set the video lock state. */
  setVideoLocked(locked) {
    this._videoLocked = locked;
  }
};

// core/src/domain/Crossfade.ts
function computeFadeInGain(t, curve) {
  const s = Math.max(0, Math.min(1, t));
  switch (curve) {
    case "linear" /* LINEAR */:
      return s;
    case "equal_power" /* EQUAL_POWER */:
      return Math.sqrt(s);
    case "s_curve" /* S_CURVE */:
      return s * s * (3 - 2 * s);
    case "exponential" /* EXPONENTIAL */:
      return s === 0 ? 0 : Math.pow(2, 10 * (s - 1));
    case "logarithmic" /* LOGARITHMIC */:
      return Math.log1p(s * (Math.E - 1)) / Math.log(Math.E);
    case "constant_power" /* CONSTANT_POWER */:
      return Math.sin(s * Math.PI * 0.5);
    default:
      return s;
  }
}
function computeFadeOutGain(t, curve) {
  const s = Math.max(0, Math.min(1, t));
  switch (curve) {
    case "linear" /* LINEAR */:
      return 1 - s;
    case "equal_power" /* EQUAL_POWER */:
      return Math.sqrt(1 - s);
    case "s_curve" /* S_CURVE */: {
      const inv = 1 - s;
      return inv * inv * (3 - 2 * inv);
    }
    case "exponential" /* EXPONENTIAL */:
      return s >= 1 ? 0 : Math.pow(2, -10 * s);
    case "logarithmic" /* LOGARITHMIC */:
      return 1 - Math.log1p(s * (Math.E - 1)) / Math.log(Math.E);
    case "constant_power" /* CONSTANT_POWER */:
      return Math.cos(s * Math.PI * 0.5);
    default:
      return 1 - s;
  }
}
var Crossfade = class {
  constructor(id, inRegionId, outRegionId, position, length, type = "full" /* FULL */, fadeInCurve = "equal_power" /* EQUAL_POWER */, fadeOutCurve = "equal_power" /* EQUAL_POWER */) {
    // Signals
    this.changed = new Signal();
    this.id = id;
    this._inRegionId = inRegionId;
    this._outRegionId = outRegionId;
    this._position = position;
    this._length = length;
    this._type = type;
    this._fadeInCurve = fadeInCurve;
    this._fadeOutCurve = fadeOutCurve;
    this._active = true;
  }
  // ─── Getters ─────────────────────────────────────────────────────────────
  get inRegionId() {
    return this._inRegionId;
  }
  get outRegionId() {
    return this._outRegionId;
  }
  get length() {
    return this._length;
  }
  get position() {
    return this._position;
  }
  get end() {
    return this._position + this._length;
  }
  get fadeInCurve() {
    return this._fadeInCurve;
  }
  get fadeOutCurve() {
    return this._fadeOutCurve;
  }
  get type() {
    return this._type;
  }
  get active() {
    return this._active;
  }
  // ─── Setters / Mutators ──────────────────────────────────────────────────
  setLength(length) {
    if (length < 0) length = 0;
    this._length = length;
    this.changed.emit();
  }
  setPosition(position) {
    if (position < 0) position = 0;
    this._position = position;
    this.changed.emit();
  }
  setCurves(fadeIn, fadeOut) {
    this._fadeInCurve = fadeIn;
    this._fadeOutCurve = fadeOut;
    this.changed.emit();
  }
  setType(type) {
    this._type = type;
    this.changed.emit();
  }
  setActive(active) {
    this._active = active;
    this.changed.emit();
  }
  // ─── Gain Calculation ────────────────────────────────────────────────────
  /**
   * Calculate the gain value at a given frame for either the fade-in or
   * fade-out side of the crossfade.
   *
   * @param frame  The absolute timeline frame.
   * @param isIn   True for the fade-in region, false for the fade-out region.
   * @returns Gain value in the range [0, 1]. Returns 1 if the frame is
   *          outside the crossfade range (no attenuation).
   */
  getGainAt(frame, isIn) {
    if (!this._active || this._length === 0) return 1;
    if (frame < this._position || frame >= this.end) {
      return 1;
    }
    const t = (frame - this._position) / this._length;
    if (isIn) {
      return computeFadeInGain(t, this._fadeInCurve);
    } else {
      return computeFadeOutGain(t, this._fadeOutCurve);
    }
  }
  // ─── Bulk Gain Computation ───────────────────────────────────────────────
  /**
   * Pre-compute gain curves for efficient real-time use.
   *
   * @param numSamples  Number of samples to compute (typically the crossfade
   *                    length, but can be any resolution).
   * @returns An object containing Float32Arrays for both curves.
   */
  computeGainCurve(numSamples) {
    const fadeIn = new Float32Array(numSamples);
    const fadeOut = new Float32Array(numSamples);
    if (numSamples <= 1) {
      if (numSamples === 1) {
        fadeIn[0] = 0.5;
        fadeOut[0] = 0.5;
      }
      return { fadeIn, fadeOut };
    }
    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      fadeIn[i] = computeFadeInGain(t, this._fadeInCurve);
      fadeOut[i] = computeFadeOutGain(t, this._fadeOutCurve);
    }
    return { fadeIn, fadeOut };
  }
  // ─── Static Helpers ──────────────────────────────────────────────────────
  /**
   * Calculate the overlap between two regions. Returns null if there is no
   * overlap. The convention is that regionA is the earlier (fade-out) region
   * and regionB is the later (fade-in) region, but the method handles
   * either ordering.
   */
  static calculateOverlap(regionA, regionB) {
    const overlapStart = Math.max(regionA.start, regionB.start);
    const overlapEnd = Math.min(regionA.end, regionB.end);
    if (overlapStart >= overlapEnd) {
      return null;
    }
    const outRegionId = regionA.start <= regionB.start ? regionA.id : regionB.id;
    const inRegionId = regionA.start <= regionB.start ? regionB.id : regionA.id;
    return {
      position: overlapStart,
      length: overlapEnd - overlapStart,
      outRegionId,
      inRegionId
    };
  }
};

// core/src/domain/ThawList.ts
var ThawList = class {
  constructor() {
    this._frozen = false;
    this._pendingEmissions = [];
    this._changeCount = 0;
  }
  // ─── Freeze / Thaw ──────────────────────────────────────────────────────
  /** Freeze: begin collecting emissions instead of firing them immediately. */
  freeze() {
    this._frozen = true;
  }
  /**
   * Thaw: emit all pending signals that were queued while frozen,
   * then reset to the unfrozen state.
   */
  thaw() {
    this._frozen = false;
    const pending = [...this._pendingEmissions];
    this._pendingEmissions = [];
    for (const { signal, data } of pending) {
      signal.emit(data);
    }
  }
  /** Whether the ThawList is currently frozen. */
  isFrozen() {
    return this._frozen;
  }
  // ─── Emission Queuing ───────────────────────────────────────────────────
  /**
   * Queue an emission. If frozen, the emission is stored and will be
   * fired when {@link thaw} is called. If not frozen, the signal is
   * emitted immediately.
   */
  queueEmission(signal, data) {
    this._changeCount++;
    if (this._frozen) {
      this._pendingEmissions.push({ signal, data });
    } else {
      signal.emit(data);
    }
  }
  // ─── Inspection ─────────────────────────────────────────────────────────
  /** Get the number of pending emissions queued while frozen. */
  getPendingCount() {
    return this._pendingEmissions.length;
  }
  /** Discard all pending emissions without firing them. */
  discard() {
    this._pendingEmissions = [];
  }
  // ─── Batch Helper ───────────────────────────────────────────────────────
  /**
   * Execute a callback within a freeze/thaw block.
   * The thawList is frozen before fn() runs and thawed after it completes,
   * even if fn() throws.
   */
  static batch(fn, thawList) {
    thawList.freeze();
    try {
      fn();
    } finally {
      thawList.thaw();
    }
  }
};

// core/src/domain/Playlist.ts
var Playlist = class {
  constructor(id, name) {
    this.regions = [];
    this.midiRegions = [];
    this._crossfades = /* @__PURE__ */ new Map();
    this._thawList = new ThawList();
    // Signals (Audio Regions)
    this.regionAdded = new Signal();
    this.regionRemoved = new Signal();
    this.regionChanged = new Signal();
    // Signals (MIDI Regions)
    this.midiRegionAdded = new Signal();
    this.midiRegionRemoved = new Signal();
    this.midiRegionChanged = new Signal();
    // Signals (Crossfades)
    this.crossfadeAdded = new Signal();
    this.crossfadeRemoved = new Signal();
    this.crossfadeChanged = new Signal();
    this.id = id;
    this.name = name;
  }
  addRegion(region) {
    this.regions.push(region);
    this.sortRegions();
    this._thawList.queueEmission(this.regionAdded, region);
    const overlapping = this.getOverlappingRegions(region);
    for (const other of overlapping) {
      if (other.layer === region.layer) {
        this.autoCreateCrossfade(region, other);
      }
    }
  }
  removeRegion(regionId) {
    const relatedCrossfades = this.getCrossfadesForRegion(regionId);
    for (const xfade of relatedCrossfades) {
      this.removeCrossfade(xfade.id);
    }
    this.regions = this.regions.filter((r) => r.id !== regionId);
    this._thawList.queueEmission(this.regionRemoved, regionId);
  }
  getRegions() {
    return this.regions;
  }
  getRegion(regionId) {
    return this.regions.find((r) => r.id === regionId);
  }
  getTopLayer() {
    if (this.regions.length === 0) {
      return -1;
    }
    return Math.max(...this.regions.map((region) => region.layer));
  }
  setRegionLayer(regionId, layer) {
    const region = this.getRegion(regionId);
    if (!region) {
      throw new Error(`Region ${regionId} not found`);
    }
    region.layer = Math.max(0, Math.trunc(layer));
    this.notifyRegionChanged(region);
  }
  setRegionOpaque(regionId, opaque) {
    const region = this.getRegion(regionId);
    if (!region) {
      throw new Error(`Region ${regionId} not found`);
    }
    region.opaque = opaque;
    this.notifyRegionChanged(region);
  }
  insertRecordedRegion(region, mode) {
    region.layer = this.getTopLayer() + 1;
    region.opaque = mode !== "sound_on_sound" /* SOUND_ON_SOUND */;
    if (mode === "non_layered" /* NON_LAYERED */) {
      this.replaceOverlappingRegions(region);
    }
    this.addRegion(region);
  }
  getRegionsInRange(start, end) {
    return this.regions.filter((r) => r.end > start && r.start < end);
  }
  /**
   * Shift all regions whose start >= afterFrame by deltaFrames.
   * Used for ripple editing.
   */
  rippleShift(afterFrame, deltaFrames) {
    for (const region of this.regions) {
      if (region.start >= afterFrame) {
        const newStart = Math.max(0, region.start + deltaFrames);
        region.move(newStart);
        this._thawList.queueEmission(this.regionChanged, region);
      }
    }
    this.sortRegions();
  }
  notifyRegionChanged(region) {
    this.sortRegions();
    this.updateCrossfadesForRegion(region.id);
    this._thawList.queueEmission(this.regionChanged, region);
  }
  replaceOverlappingRegions(recordedRegion) {
    const overlappingRegions = [...this.getOverlappingRegions(recordedRegion)];
    for (const existingRegion of overlappingRegions) {
      this.replaceOverlap(existingRegion, recordedRegion);
    }
  }
  replaceOverlap(existingRegion, recordedRegion) {
    const existingEnd = existingRegion.end;
    const coversExisting = recordedRegion.start <= existingRegion.start && recordedRegion.end >= existingEnd;
    if (coversExisting) {
      this.removeRegion(existingRegion.id);
      return;
    }
    const splitsExisting = existingRegion.start < recordedRegion.start && existingEnd > recordedRegion.end;
    if (splitsExisting) {
      this.splitAroundRecordedRegion(existingRegion, recordedRegion);
      return;
    }
    if (existingRegion.start < recordedRegion.start) {
      this.trimExistingRegionEnd(existingRegion, recordedRegion.start);
      return;
    }
    this.trimExistingRegionStart(existingRegion, recordedRegion.end);
  }
  trimExistingRegionEnd(region, end) {
    region.length = end - region.start;
    region.fadeOut = 0;
    region.transients = region.transients.filter((position) => {
      return position < region.length;
    });
    this.notifyRegionChanged(region);
  }
  trimExistingRegionStart(region, start) {
    const trimLength = start - region.start;
    const oldEnd = region.end;
    region.start = start;
    region.sourceStart += trimLength;
    region.length = oldEnd - start;
    region.fadeIn = 0;
    region.transients = region.transients.map((position) => position - trimLength).filter((position) => position >= 0 && position < region.length);
    this.notifyRegionChanged(region);
  }
  splitAroundRecordedRegion(region, recordedRegion) {
    const rightRegion = this.createRightSegment(region, recordedRegion.end);
    this.trimExistingRegionEnd(region, recordedRegion.start);
    this.addRegion(rightRegion);
  }
  createRightSegment(region, start) {
    const timelineOffset = start - region.start;
    const rightRegion = new Region(
      crypto.randomUUID(),
      region.sourceId,
      start,
      region.end - start,
      region.sourceStart + timelineOffset,
      `${region.name}-R`,
      region.layer
    );
    rightRegion.gain = region.gain;
    rightRegion.muted = region.muted;
    rightRegion.opaque = region.opaque;
    rightRegion.fadeIn = 0;
    rightRegion.fadeOut = region.fadeOut;
    rightRegion.fadeInShape = region.fadeInShape;
    rightRegion.fadeOutShape = region.fadeOutShape;
    rightRegion.playbackRate = region.playbackRate;
    rightRegion.stretch = region.stretch;
    rightRegion.pitchSemitones = region.pitchSemitones;
    rightRegion.syncPosition = region.syncPosition;
    rightRegion.transients = region.transients.filter((position) => position >= timelineOffset).map((position) => position - timelineOffset);
    rightRegion.locked = region.locked;
    rightRegion.timeDomain = region.timeDomain;
    return rightRegion;
  }
  sortRegions() {
    this.regions.sort((a, b) => a.start - b.start);
  }
  // ─── MIDI Region Management ──────────────────────────────────────────────
  addMidiRegion(region) {
    this.midiRegions.push(region);
    this.sortMidiRegions();
    this._thawList.queueEmission(this.midiRegionAdded, region);
  }
  removeMidiRegion(regionId) {
    this.midiRegions = this.midiRegions.filter((r) => r.id !== regionId);
    this._thawList.queueEmission(this.midiRegionRemoved, regionId);
  }
  getMidiRegions() {
    return this.midiRegions;
  }
  getMidiRegion(regionId) {
    return this.midiRegions.find((r) => r.id === regionId);
  }
  getMidiRegionsInRange(start, end) {
    return this.midiRegions.filter((r) => r.end > start && r.start < end);
  }
  sortMidiRegions() {
    this.midiRegions.sort((a, b) => a.start - b.start);
  }
  // ─── C-1: Overlap & Coverage Detection ───────────────────────────────────
  /**
   * Return all audio regions that overlap with the given region's time span.
   * The query region itself is excluded from results.
   */
  getOverlappingRegions(region) {
    return this.regions.filter(
      (r) => r.id !== region.id && r.start < region.end && region.start < r.end
    );
  }
  /**
   * Return all audio regions that are audible (not muted) at a given frame.
   * Results are sorted by layer (highest first) so the top-most region is first.
   */
  audibleRegionsAt(frame) {
    return this.regions.filter((r) => !r.muted && r.covers(frame)).sort((a, b) => b.layer - a.layer);
  }
  // ─── C-5: Playlist Query Enhancement ─────────────────────────────────────
  /** All regions (muted or not) that cover the given frame. */
  regionsAt(frame) {
    return this.regions.filter((r) => r.covers(frame));
  }
  /** Highest-layer region at a given frame (may be muted). */
  topRegionAt(frame) {
    const matching = this.regionsAt(frame);
    if (matching.length === 0) return null;
    return matching.reduce((top, r) => r.layer > top.layer ? r : top);
  }
  /** Highest-layer unmuted region at a given frame. */
  topUnmutedRegionAt(frame) {
    const audible = this.audibleRegionsAt(frame);
    return audible.length > 0 ? audible[0] : null;
  }
  /**
   * Find the next region start or end boundary in the given direction.
   *
   * @param frame      The reference frame.
   * @param direction  1 for forward, -1 for backward.
   * @returns The nearest region whose start is strictly in the given
   *          direction, or null if none found.
   */
  findNextRegion(frame, direction) {
    if (direction === 1) {
      for (const r of this.regions) {
        if (r.start > frame) return r;
      }
      return null;
    } else {
      for (let i = this.regions.length - 1; i >= 0; i--) {
        if (this.regions[i].start < frame) return this.regions[i];
      }
      return null;
    }
  }
  /**
   * Find the next region boundary (start or end) in the given direction.
   *
   * @param frame      The reference frame.
   * @param direction  1 for forward, -1 for backward.
   * @returns The nearest boundary frame, or null if none found.
   */
  findNextRegionBoundary(frame, direction) {
    const boundaries = /* @__PURE__ */ new Set();
    for (const r of this.regions) {
      boundaries.add(r.start);
      boundaries.add(r.end);
    }
    const sorted = Array.from(boundaries).sort((a, b) => a - b);
    if (direction === 1) {
      for (const b of sorted) {
        if (b > frame) return b;
      }
      return null;
    } else {
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i] < frame) return sorted[i];
      }
      return null;
    }
  }
  /**
   * Is the region with the given id actually audible at the specified frame?
   *
   * A region is audible if it is not muted and is the top-layer region at
   * that frame (i.e., no higher-layer unmuted region occludes it).
   */
  regionIsAudibleAt(regionId, frame) {
    const region = this.regions.find((r) => r.id === regionId);
    if (!region || region.muted || !region.covers(frame)) {
      return false;
    }
    for (const r of this.regions) {
      if (r.id === regionId) continue;
      if (!r.muted && r.opaque && r.covers(frame) && r.layer > region.layer) {
        return false;
      }
    }
    return true;
  }
  /**
   * Get the bounding box (earliest start, latest end) of all audio regions.
   * Returns { start: 0, end: 0 } if there are no regions.
   */
  getExtent() {
    if (this.regions.length === 0) {
      return { start: 0, end: 0 };
    }
    let earliest = Infinity;
    let latest = -Infinity;
    for (const r of this.regions) {
      if (r.start < earliest) earliest = r.start;
      if (r.end > latest) latest = r.end;
    }
    return { start: earliest, end: latest };
  }
  // ─── Crossfade Management ────────────────────────────────────────────────
  /**
   * Add a crossfade to the playlist. Subscribes to its changed signal
   * so the playlist can re-emit crossfadeChanged.
   */
  addCrossfade(crossfade) {
    this._crossfades.set(crossfade.id, crossfade);
    crossfade.changed.connect(() => {
      this._thawList.queueEmission(this.crossfadeChanged, crossfade);
    });
    this._thawList.queueEmission(this.crossfadeAdded, crossfade);
  }
  /**
   * Remove a crossfade by its ID.
   */
  removeCrossfade(id) {
    const crossfade = this._crossfades.get(id);
    if (!crossfade) return;
    crossfade.changed.clear();
    this._crossfades.delete(id);
    this._thawList.queueEmission(this.crossfadeRemoved, id);
  }
  /**
   * Get a crossfade by its ID.
   */
  getCrossfade(id) {
    return this._crossfades.get(id);
  }
  /**
   * Get all crossfades in the playlist.
   */
  getCrossfades() {
    return Array.from(this._crossfades.values());
  }
  /**
   * Get all crossfades that involve the given region (as either the
   * fade-in or fade-out side).
   */
  getCrossfadesForRegion(regionId) {
    const result = [];
    for (const xfade of this._crossfades.values()) {
      if (xfade.inRegionId === regionId || xfade.outRegionId === regionId) {
        result.push(xfade);
      }
    }
    return result;
  }
  /**
   * Auto-detect the overlap between two regions and create a crossfade if
   * they overlap. Returns the created crossfade, or null if there is no
   * overlap.
   *
   * @param regionA       First region.
   * @param regionB       Second region.
   * @param defaultLength Optional: override the crossfade length instead of
   *                      using the actual overlap length.
   */
  autoCreateCrossfade(regionA, regionB, defaultLength) {
    const overlap = Crossfade.calculateOverlap(regionA, regionB);
    if (!overlap) return null;
    for (const xfade of this._crossfades.values()) {
      const ids = [xfade.inRegionId, xfade.outRegionId];
      if (ids.includes(regionA.id) && ids.includes(regionB.id)) {
        xfade.setPosition(overlap.position);
        xfade.setLength(defaultLength ?? overlap.length);
        return xfade;
      }
    }
    const length = defaultLength ?? overlap.length;
    const id = crypto.randomUUID();
    const crossfade = new Crossfade(
      id,
      overlap.inRegionId,
      overlap.outRegionId,
      overlap.position,
      length,
      "full" /* FULL */,
      "equal_power" /* EQUAL_POWER */,
      "equal_power" /* EQUAL_POWER */
    );
    this.addCrossfade(crossfade);
    return crossfade;
  }
  /**
   * Recalculate all crossfades that involve a given region. Call this after
   * a region is moved, resized, or trimmed so that the crossfade positions
   * and lengths stay in sync with the actual overlap.
   *
   * Crossfades whose regions no longer overlap are automatically removed.
   */
  updateCrossfadesForRegion(regionId) {
    const region = this.getRegion(regionId);
    if (!region) return;
    const relatedCrossfades = this.getCrossfadesForRegion(regionId);
    for (const xfade of relatedCrossfades) {
      const otherRegionId = xfade.inRegionId === regionId ? xfade.outRegionId : xfade.inRegionId;
      const otherRegion = this.getRegion(otherRegionId);
      if (!otherRegion) {
        this.removeCrossfade(xfade.id);
        continue;
      }
      if (otherRegion.layer !== region.layer) {
        this.removeCrossfade(xfade.id);
        continue;
      }
      const overlap = Crossfade.calculateOverlap(region, otherRegion);
      if (!overlap) {
        this.removeCrossfade(xfade.id);
      } else {
        xfade.setPosition(overlap.position);
        xfade.setLength(overlap.length);
      }
    }
    for (const otherRegion of this.getOverlappingRegions(region)) {
      if (otherRegion.layer === region.layer) {
        this.autoCreateCrossfade(region, otherRegion);
      }
    }
  }
  // ─── Batch Editing (ThawList Integration) ───────────────────────────────
  /** Freeze signal emissions; all signals are queued until thaw(). */
  freeze() {
    this._thawList.freeze();
  }
  /** Thaw and emit all queued signals. */
  thaw() {
    this._thawList.thaw();
  }
  // ─── Partition ──────────────────────────────────────────────────────────
  /**
   * Split all regions at a given frame position.
   * Regions that span the frame are split into two: one ending at the frame
   * and one starting at the frame. Regions that don't cover the frame are
   * left untouched.
   */
  partition(frame) {
    const toSplit = this.regions.filter(
      (r) => r.covers(frame) && r.start !== frame
    );
    for (const region of toSplit) {
      const originalEnd = region.end;
      const originalSourceStart = region.sourceStart;
      const offsetIntoRegion = frame - region.start;
      region.resize(offsetIntoRegion);
      this._thawList.queueEmission(this.regionChanged, region);
      const rightId = crypto.randomUUID();
      const rightLength = originalEnd - frame;
      const rightSourceStart = originalSourceStart + offsetIntoRegion;
      const rightRegion = new Region(
        rightId,
        region.sourceId,
        frame,
        rightLength,
        rightSourceStart,
        region.name + "-R",
        region.layer
      );
      rightRegion.gain = region.gain;
      rightRegion.muted = region.muted;
      rightRegion.opaque = region.opaque;
      rightRegion.fadeOut = region.fadeOut;
      rightRegion.fadeOutShape = region.fadeOutShape;
      region.fadeOut = 0;
      this.addRegion(rightRegion);
    }
  }
  // ─── Duplicate ──────────────────────────────────────────────────────────
  /**
   * Duplicate a single region with a time offset.
   * Returns the new region, or null if the source region was not found.
   */
  duplicateRegion(regionId, offset) {
    const source = this.getRegion(regionId);
    if (!source) return null;
    const newId = crypto.randomUUID();
    const newRegion = new Region(
      newId,
      source.sourceId,
      source.start + offset,
      source.length,
      source.sourceStart,
      source.name + " (copy)",
      source.layer
    );
    newRegion.gain = source.gain;
    newRegion.muted = source.muted;
    newRegion.opaque = source.opaque;
    newRegion.fadeIn = source.fadeIn;
    newRegion.fadeOut = source.fadeOut;
    newRegion.fadeInShape = source.fadeInShape;
    newRegion.fadeOutShape = source.fadeOutShape;
    newRegion.playbackRate = source.playbackRate;
    newRegion.stretch = source.stretch;
    newRegion.pitchSemitones = source.pitchSemitones;
    this.addRegion(newRegion);
    return newRegion;
  }
  /**
   * Duplicate multiple regions with a time offset.
   * Returns an array of the newly created regions.
   */
  duplicateRegions(regionIds, offset) {
    const results = [];
    for (const id of regionIds) {
      const dup = this.duplicateRegion(id, offset);
      if (dup) results.push(dup);
    }
    return results;
  }
  // ─── Nudge ──────────────────────────────────────────────────────────────
  /** Nudge all regions by the given number of frames (positive or negative). */
  nudge(frames) {
    for (const region of this.regions) {
      const newStart = Math.max(0, region.start + frames);
      region.move(newStart);
      this._thawList.queueEmission(this.regionChanged, region);
    }
    this.sortRegions();
  }
  /** Nudge a single region by the given number of frames. */
  nudgeRegion(regionId, frames) {
    const region = this.getRegion(regionId);
    if (!region) return;
    const newStart = Math.max(0, region.start + frames);
    region.move(newStart);
    this._thawList.queueEmission(this.regionChanged, region);
    this.sortRegions();
  }
};

// core/src/domain/Track.ts
var TrackType = /* @__PURE__ */ ((TrackType2) => {
  TrackType2["AUDIO"] = "AUDIO";
  TrackType2["MIDI"] = "MIDI";
  TrackType2["AUX"] = "AUX";
  TrackType2["BUS"] = "BUS";
  TrackType2["FOLDER"] = "FOLDER";
  TrackType2["VCA"] = "VCA";
  return TrackType2;
})(TrackType || {});
var Track = class {
  constructor(id, name, type) {
    this.armed = false;
    this.monitor = false;
    this.mute = false;
    this.solo = false;
    this.color = "#4a9eff";
    // Default track color
    // Phase 15: Solo system enhancement
    this.soloIsolate = false;
    this.soloSafe = false;
    // Phase 15: Monitor mode
    this.monitorMode = "auto" /* AUTO */;
    // Phase 15: Trim gain (dB, pre-fader input level correction)
    this.trimGain = 0;
    // Phase 15: Track comment
    this.comment = "";
    // Freeze state
    this.frozen = false;
    this.frozenSourceId = null;
    // Track Groups / Folders (Phase 10)
    this.parentTrackId = null;
    this.groupId = null;
    this.isCollapsed = false;
    // Alignment style (for recording)
    this._alignStyle = "existing_material";
    // Track mode
    this._trackMode = "normal";
    this._recordMode = "layered" /* LAYERED */;
    // Enhanced bounce/freeze state
    this._bounceProgress = 0;
    // Signals
    this.armChanged = new Signal();
    this.monitorChanged = new Signal();
    this.muteChanged = new Signal();
    this.soloChanged = new Signal();
    this.soloIsolateChanged = new Signal();
    this.soloSafeChanged = new Signal();
    this.monitorModeChanged = new Signal();
    this.trimGainChanged = new Signal();
    this.colorChanged = new Signal();
    this.frozenChanged = new Signal();
    this.alignStyleChanged = new Signal();
    this.trackModeChanged = new Signal();
    this.recordModeChanged = new Signal();
    this.bounceProgressChanged = new Signal();
    this.bounceCompleted = new Signal();
    this.id = id;
    this.name = name;
    this.type = type;
    this.route = new Route(crypto.randomUUID(), name);
    this.playlist = new Playlist(crypto.randomUUID(), name);
  }
  rename(newName) {
    this.name = newName;
    this.route.name = newName;
    this.playlist.name = newName;
  }
  setArmed(armed) {
    if (this.armed !== armed) {
      this.armed = armed;
      this.armChanged.emit(armed);
    }
  }
  setMonitor(monitor) {
    if (this.monitor !== monitor) {
      this.monitor = monitor;
      this.monitorChanged.emit(monitor);
    }
  }
  setMute(mute) {
    if (this.mute !== mute) {
      this.mute = mute;
      this.muteChanged.emit(mute);
    }
  }
  setSolo(solo) {
    if (this.solo !== solo) {
      this.solo = solo;
      this.soloChanged.emit(solo);
    }
  }
  setColor(color) {
    if (this.color !== color) {
      this.color = color;
      this.colorChanged.emit(color);
    }
  }
  setFrozen(frozen) {
    if (this.frozen !== frozen) {
      this.frozen = frozen;
      this.frozenChanged.emit(frozen);
    }
  }
  setSoloIsolate(isolate) {
    if (this.soloIsolate !== isolate) {
      this.soloIsolate = isolate;
      this.soloIsolateChanged.emit(isolate);
    }
  }
  setSoloSafe(safe) {
    if (this.soloSafe !== safe) {
      this.soloSafe = safe;
      this.soloSafeChanged.emit(safe);
    }
  }
  setMonitorMode(mode) {
    if (this.monitorMode !== mode) {
      this.monitorMode = mode;
      this.monitorModeChanged.emit(mode);
    }
  }
  setTrimGain(db) {
    const clamped = Math.max(-20, Math.min(20, db));
    if (this.trimGain !== clamped) {
      this.trimGain = clamped;
      this.route.trim = clamped;
      this.trimGainChanged.emit(clamped);
    }
  }
  // ─── Bounce / Freeze Configuration ──────────────────────────────────────
  /**
   * Whether the track can be frozen. Returns false if already frozen.
   */
  canFreeze() {
    return !this.frozen;
  }
  /**
   * Whether the track can be bounced.
   * Audio and MIDI tracks can be bounced; AUX, BUS, FOLDER, and VCA cannot.
   */
  canBounce() {
    return this.type === "AUDIO" /* AUDIO */ || this.type === "MIDI" /* MIDI */;
  }
  /**
   * Get the default bounce configuration for this track.
   */
  getBounceConfig() {
    const extent = this.playlist.getExtent();
    return {
      startFrame: extent.start,
      endFrame: extent.end,
      includePlugins: true,
      includeAutomation: true
    };
  }
  /**
   * Get a bounce configuration for a specific frame range.
   *
   * @param startFrame The start frame of the bounce range.
   * @param endFrame   The end frame of the bounce range.
   * @returns A BounceConfig with the specified range.
   */
  getBounceRangeConfig(startFrame, endFrame) {
    return {
      startFrame,
      endFrame,
      includePlugins: true,
      includeAutomation: true
    };
  }
  /**
   * Freeze the track, storing a reference to the rendered source.
   *
   * Freezing renders the track's output (including all plugins and
   * automation) to a new audio source. The original playlist is preserved
   * so it can be restored on unfreeze. While frozen, the track plays
   * back from the rendered source and plugins are bypassed.
   *
   * @param sourceId Identifier of the rendered audio source.
   */
  freeze(sourceId) {
    if (this.frozen) return;
    this.frozen = true;
    this.frozenSourceId = sourceId;
    this.frozenChanged.emit(true);
  }
  /**
   * Unfreeze the track, restoring the original playlist and plugins.
   * Discards the frozen source reference.
   */
  unfreeze() {
    if (!this.frozen) return;
    this.frozen = false;
    this.frozenSourceId = null;
    this.frozenChanged.emit(false);
  }
  /**
   * Update the bounce progress.
   * Used by the engine to report rendering progress to the UI.
   *
   * @param progress A value between 0 (not started) and 1 (complete).
   */
  setBounceProgress(progress) {
    const clamped = Math.max(0, Math.min(1, progress));
    if (this._bounceProgress !== clamped) {
      this._bounceProgress = clamped;
      this.bounceProgressChanged.emit(clamped);
    }
  }
  /** Current bounce progress (0 to 1). */
  get bounceProgress() {
    return this._bounceProgress;
  }
  /**
   * Signal that a bounce operation has completed.
   * Resets bounce progress to 0 and emits the bounceCompleted signal.
   *
   * @param sourceId Identifier of the newly created audio source.
   */
  completeBounce(sourceId) {
    this._bounceProgress = 0;
    this.bounceProgressChanged.emit(0);
    this.bounceCompleted.emit({ sourceId });
  }
  // ─── Alignment Style ────────────────────────────────────────────────────
  /** Get the current alignment style for recording. */
  getAlignStyle() {
    return this._alignStyle;
  }
  /** Set the alignment style for recording. */
  setAlignStyle(style) {
    if (this._alignStyle !== style) {
      this._alignStyle = style;
      this.alignStyleChanged.emit(style);
    }
  }
  // ─── Track Mode ─────────────────────────────────────────────────────────
  /** Get the current track mode. */
  getTrackMode() {
    return this._trackMode;
  }
  /**
   * Set the track mode.
   * - 'normal': standard layered playback (default)
   * - 'non_layered': only one region plays at a time (highest layer wins)
   * - 'tape': destructive recording, new audio replaces old
   */
  setTrackMode(mode) {
    if (this._trackMode !== mode) {
      this._trackMode = mode;
      this.trackModeChanged.emit(mode);
    }
  }
  get recordMode() {
    return this._recordMode;
  }
  setRecordMode(mode) {
    if (this._recordMode === mode) {
      return;
    }
    this._recordMode = mode;
    this.recordModeChanged.emit(mode);
  }
};

// core/src/domain/Range.ts
var Range = class _Range {
  constructor(id, name, start, end, color) {
    // Signals
    this.changed = new Signal();
    this.removed = new Signal();
    this.id = id;
    this.name = name;
    this.start = start;
    this.end = end;
    this.color = color;
  }
  setName(name) {
    this.name = name;
    this.changed.emit();
  }
  setRange(start, end) {
    if (end <= start) {
      throw new Error("Range end must be greater than start");
    }
    this.start = start;
    this.end = end;
    this.changed.emit();
  }
  setColor(color) {
    this.color = color;
    this.changed.emit();
  }
  get length() {
    return this.end - this.start;
  }
  contains(frame) {
    return frame >= this.start && frame < this.end;
  }
  overlaps(other) {
    return this.start < other.end && this.end > other.start;
  }
  clone() {
    return new _Range(
      crypto.randomUUID(),
      this.name,
      this.start,
      this.end,
      this.color
    );
  }
  toDTO() {
    return {
      id: this.id,
      name: this.name,
      start: this.start,
      end: this.end,
      length: this.length,
      color: this.color
    };
  }
};

// core/src/domain/MidiNote.ts
var MidiNote = class _MidiNote {
  constructor(id, pitch, velocity, startFrame, durationFrames, channel = 0) {
    // 0-15
    // Signals
    this.changed = new Signal();
    this.id = id;
    this.pitch = Math.max(0, Math.min(127, Math.round(pitch)));
    this.velocity = Math.max(0, Math.min(127, Math.round(velocity)));
    this.startFrame = startFrame;
    this.durationFrames = durationFrames;
    this.channel = Math.max(0, Math.min(15, Math.round(channel)));
  }
  get endFrame() {
    return this.startFrame + this.durationFrames;
  }
  setPitch(pitch) {
    const clamped = Math.max(0, Math.min(127, Math.round(pitch)));
    if (this.pitch !== clamped) {
      this.pitch = clamped;
      this.changed.emit(this);
    }
  }
  setVelocity(velocity) {
    const clamped = Math.max(0, Math.min(127, Math.round(velocity)));
    if (this.velocity !== clamped) {
      this.velocity = clamped;
      this.changed.emit(this);
    }
  }
  move(newStartFrame) {
    if (newStartFrame < 0) newStartFrame = 0;
    if (this.startFrame !== newStartFrame) {
      this.startFrame = newStartFrame;
      this.changed.emit(this);
    }
  }
  resize(newDuration) {
    if (newDuration < 1) newDuration = 1;
    if (this.durationFrames !== newDuration) {
      this.durationFrames = newDuration;
      this.changed.emit(this);
    }
  }
  transpose(semitones) {
    const newPitch = Math.max(0, Math.min(127, this.pitch + semitones));
    if (this.pitch !== newPitch) {
      this.pitch = newPitch;
      this.changed.emit(this);
    }
  }
  /**
   * Get MIDI note name (e.g., "C4", "A#3")
   */
  getNoteName() {
    const noteNames = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B"
    ];
    const octave = Math.floor(this.pitch / 12) - 1;
    const noteName = noteNames[this.pitch % 12];
    return `${noteName}${octave}`;
  }
  /**
   * Convert pitch to frequency in Hz
   */
  getFrequency() {
    return 440 * Math.pow(2, (this.pitch - 69) / 12);
  }
  toJSON() {
    return {
      id: this.id,
      pitch: this.pitch,
      velocity: this.velocity,
      startFrame: this.startFrame,
      durationFrames: this.durationFrames,
      channel: this.channel
    };
  }
  static fromJSON(data) {
    return new _MidiNote(
      data.id,
      data.pitch,
      data.velocity,
      data.startFrame,
      data.durationFrames,
      data.channel
    );
  }
};

// core/src/domain/MidiRegion.ts
var MidiRegion = class _MidiRegion {
  constructor(id, name, start, length, layer = 0) {
    // Notes
    this._notes = [];
    // Playback properties
    this.muted = false;
    this.layer = 0;
    this.locked = false;
    /** Time domain for this region */
    this.timeDomain = 1 /* BeatTime */;
    // Signals
    this.noteAdded = new Signal();
    this.noteRemoved = new Signal();
    this.noteChanged = new Signal();
    this.lockedChanged = new Signal();
    this.id = id;
    this.name = name;
    this.start = start;
    this.length = length;
    this.layer = layer;
  }
  get end() {
    return this.start + this.length;
  }
  get notes() {
    return this._notes;
  }
  addNote(note) {
    this._notes.push(note);
    this.sortNotes();
    note.changed.connect((n) => {
      this.noteChanged.emit(n);
    });
    this.noteAdded.emit(note);
  }
  removeNote(noteId) {
    const index = this._notes.findIndex((n) => n.id === noteId);
    if (index === -1) return void 0;
    const removed = this._notes.splice(index, 1)[0];
    this.noteRemoved.emit(noteId);
    return removed;
  }
  getNote(noteId) {
    return this._notes.find((n) => n.id === noteId);
  }
  getNotes() {
    return this._notes;
  }
  /**
   * Get notes that overlap with the given frame range (relative to region start)
   */
  getNotesInRange(startFrame, endFrame) {
    return this._notes.filter(
      (n) => n.endFrame > startFrame && n.startFrame < endFrame
    );
  }
  move(newStart) {
    if (newStart < 0) newStart = 0;
    this.start = newStart;
  }
  resize(newLength) {
    if (newLength < 0) return;
    this.length = newLength;
  }
  setLocked(locked) {
    if (this.locked === locked) return;
    this.locked = locked;
    this.lockedChanged.emit(locked);
  }
  /** Get position as TimePosition */
  getPosition() {
    return { domain: this.timeDomain, value: this.start };
  }
  /** Get duration as TimePosition */
  getDuration() {
    return { domain: this.timeDomain, value: this.length };
  }
  /** Set position from TimePosition (converts if needed) */
  setPosition(pos, tempoMap, bpm) {
    this.start = tempoMap.toFrames(pos, bpm);
    this.timeDomain = pos.domain;
  }
  /** Set duration from TimePosition (converts if needed) */
  setDuration(duration, tempoMap, bpm) {
    this.length = tempoMap.toFrames(duration, bpm);
    this.timeDomain = duration.domain;
  }
  sortNotes() {
    this._notes.sort((a, b) => a.startFrame - b.startFrame);
  }
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      start: this.start,
      length: this.length,
      muted: this.muted,
      layer: this.layer,
      locked: this.locked,
      timeDomain: this.timeDomain,
      notes: this._notes.map((n) => n.toJSON())
    };
  }
  static fromJSON(data) {
    const region = new _MidiRegion(
      data.id,
      data.name,
      data.start,
      data.length,
      data.layer
    );
    region.muted = data.muted;
    region.locked = data.locked ?? false;
    region.timeDomain = data.timeDomain ?? 1 /* BeatTime */;
    for (const noteData of data.notes) {
      const note = MidiNote.fromJSON(noteData);
      region.addNote(note);
    }
    return region;
  }
};

// core/src/domain/SendBus.ts
var SendBus = class {
  constructor(id, sourceTrackId, destId, level = 0, preFader = false) {
    this.levelChanged = new Signal();
    this.preFaderChanged = new Signal();
    this.activeChanged = new Signal();
    this.id = id;
    this.sourceTrackId = sourceTrackId;
    this.destId = destId;
    this._level = level;
    this._preFader = preFader;
    this._active = true;
  }
  get level() {
    return this._level;
  }
  setLevel(db) {
    this._level = db;
    this.levelChanged.emit(db);
  }
  get preFader() {
    return this._preFader;
  }
  setPreFader(value) {
    this._preFader = value;
    this.preFaderChanged.emit(value);
  }
  get active() {
    return this._active;
  }
  setActive(value) {
    this._active = value;
    this.activeChanged.emit(value);
  }
};

// core/src/domain/Marker.ts
var MIN_MARKER_POSITION = 0;
var Marker = class _Marker {
  constructor(id, name, position, color = "#ffcc00", locked = false) {
    this.changed = new Signal();
    this.removed = new Signal();
    this.id = id;
    this._name = name;
    this._position = Math.max(MIN_MARKER_POSITION, position);
    this._color = color;
    this._locked = locked;
  }
  get name() {
    return this._name;
  }
  set name(value) {
    if (this._name !== value) {
      this._name = value;
      this.changed.emit();
    }
  }
  get position() {
    return this._position;
  }
  set position(value) {
    if (this._locked) return;
    if (this._position !== value) {
      this._position = Math.max(MIN_MARKER_POSITION, value);
      this.changed.emit();
    }
  }
  get color() {
    return this._color;
  }
  set color(value) {
    if (this._color !== value) {
      this._color = value;
      this.changed.emit();
    }
  }
  get locked() {
    return this._locked;
  }
  set locked(value) {
    if (this._locked !== value) {
      this._locked = value;
      this.changed.emit();
    }
  }
  move(newPosition) {
    this.position = newPosition;
  }
  clone(newId) {
    return new _Marker(
      newId || crypto.randomUUID(),
      this._name,
      this._position,
      this._color,
      this._locked
    );
  }
};

// core/src/domain/RegionGroup.ts
var RegionGroup = class {
  constructor(id, name, regionIds) {
    this._regionIds = /* @__PURE__ */ new Set();
    // Signals
    this.changed = new Signal();
    this.id = id;
    this.name = name;
    if (regionIds) {
      for (const rid of regionIds) {
        this._regionIds.add(rid);
      }
    }
  }
  get regionIds() {
    return this._regionIds;
  }
  addRegion(regionId) {
    this._regionIds.add(regionId);
    this.changed.emit(this);
  }
  removeRegion(regionId) {
    this._regionIds.delete(regionId);
    this.changed.emit(this);
  }
  hasRegion(regionId) {
    return this._regionIds.has(regionId);
  }
  get size() {
    return this._regionIds.size;
  }
  getRegionIds() {
    return Array.from(this._regionIds);
  }
};

// core/src/domain/ExportConfig.ts
var ExportConfig = class _ExportConfig {
  constructor(id) {
    // Format Settings
    this.format = "wav" /* WAV */;
    this.sampleFormat = "float32" /* FLOAT32 */;
    this.sampleRate = 44100;
    // If set, use named range
    this.startFrame = 0;
    this.endFrame = 0;
    // File Settings
    this.filename = "export";
    this.folder = "";
    this.filenameTemplate = "%s";
    // Channel Settings
    this.exportMasterOnly = true;
    this.trackIds = [];
    // If not master only, specific track IDs
    // Stem Export
    this.stemExport = false;
    // Split Mono (Phase 5B)
    this.splitMono = false;
    // Dithering
    this.ditherType = "none" /* NONE */;
    // Normalize
    this.normalize = false;
    this.normalizeMode = "peak";
    this.targetLufs = -14;
    // Phase 2A
    // True Peak Limiter (Phase 2B)
    this.truePeakLimit = false;
    this.truePeakCeiling = -1;
    // dBTP
    // Multi-Timespan (Phase 5A)
    this.timespans = [];
    // Silence Padding (Phase 5C)
    this.silencePaddingStart = 0;
    // frames
    this.silencePaddingEnd = 0;
    // frames
    this.trimSilence = false;
    // CD Markers (Phase 5D)
    this.exportCdMarkers = false;
    this.cdMarkerFormat = "cue";
    // BWF Metadata (Phase 5E)
    this.bwfMetadata = false;
    // Post-Export (Phase 6)
    this.reimportAfterExport = false;
    // Signals
    this.changed = new Signal();
    this.id = id || crypto.randomUUID();
  }
  setFormat(format) {
    this.format = format;
    this.changed.emit();
  }
  setSampleFormat(sampleFormat) {
    this.sampleFormat = sampleFormat;
    this.changed.emit();
  }
  setRange(startFrame, endFrame) {
    this.rangeId = void 0;
    this.startFrame = startFrame;
    this.endFrame = endFrame;
    this.changed.emit();
  }
  setRangeById(rangeId) {
    this.rangeId = rangeId;
    this.changed.emit();
  }
  setFilename(filename) {
    this.filename = filename;
    this.changed.emit();
  }
  setFolder(folder) {
    this.folder = folder;
    this.changed.emit();
  }
  setFilenameTemplate(template) {
    this.filenameTemplate = template;
    this.changed.emit();
  }
  setNormalize(normalize, targetPeakDb) {
    this.normalize = normalize;
    this.targetPeakDb = targetPeakDb;
    this.changed.emit();
  }
  setNormalizeMode(mode) {
    this.normalizeMode = mode;
    this.changed.emit();
  }
  setTargetLufs(lufs) {
    this.targetLufs = lufs;
    this.changed.emit();
  }
  setTruePeakLimit(enabled, ceiling) {
    this.truePeakLimit = enabled;
    if (ceiling !== void 0) this.truePeakCeiling = ceiling;
    this.changed.emit();
  }
  setStemExport(stemExport) {
    this.stemExport = stemExport;
    this.changed.emit();
  }
  setSplitMono(splitMono) {
    this.splitMono = splitMono;
    this.changed.emit();
  }
  setQuality(quality) {
    this.quality = Math.max(0, Math.min(1, quality));
    this.changed.emit();
  }
  setDitherType(ditherType) {
    this.ditherType = ditherType;
    this.changed.emit();
  }
  setExportMasterOnly(masterOnly) {
    this.exportMasterOnly = masterOnly;
    this.changed.emit();
  }
  setTrackIds(trackIds) {
    this.trackIds = trackIds;
    this.changed.emit();
  }
  setTimespans(timespans) {
    this.timespans = timespans;
    this.changed.emit();
  }
  setSilencePadding(startFrames, endFrames) {
    this.silencePaddingStart = startFrames;
    this.silencePaddingEnd = endFrames;
    this.changed.emit();
  }
  setTrimSilence(trim) {
    this.trimSilence = trim;
    this.changed.emit();
  }
  setCdMarkerExport(enabled, format) {
    this.exportCdMarkers = enabled;
    if (format) this.cdMarkerFormat = format;
    this.changed.emit();
  }
  setBwfMetadata(enabled, data) {
    this.bwfMetadata = enabled;
    if (data) this.bwfData = data;
    this.changed.emit();
  }
  setPresetId(presetId) {
    this.presetId = presetId;
    this.changed.emit();
  }
  validate() {
    if (this.endFrame <= this.startFrame) return false;
    if (!this.filename) return false;
    if (this.sampleRate <= 0) return false;
    if (this.format === "ogg" /* OGG */ && this.quality !== void 0 && (this.quality < 0 || this.quality > 1))
      return false;
    return true;
  }
  getDuration() {
    return this.endFrame - this.startFrame;
  }
  getFullPath() {
    const ext = this.format;
    const folder = this.folder || "exports";
    return `${folder}/${this.filename}.${ext}`;
  }
  /**
   * Serialize to JSON for preset storage.
   */
  toJSON() {
    return {
      id: this.id,
      format: this.format,
      sampleFormat: this.sampleFormat,
      sampleRate: this.sampleRate,
      bitrate: this.bitrate,
      quality: this.quality,
      rangeId: this.rangeId,
      startFrame: this.startFrame,
      endFrame: this.endFrame,
      filename: this.filename,
      folder: this.folder,
      filenameTemplate: this.filenameTemplate,
      presetId: this.presetId,
      exportMasterOnly: this.exportMasterOnly,
      trackIds: [...this.trackIds],
      stemExport: this.stemExport,
      splitMono: this.splitMono,
      ditherType: this.ditherType,
      normalize: this.normalize,
      normalizeMode: this.normalizeMode,
      targetPeakDb: this.targetPeakDb,
      targetLufs: this.targetLufs,
      truePeakLimit: this.truePeakLimit,
      truePeakCeiling: this.truePeakCeiling,
      timespans: this.timespans.map((ts) => ({ ...ts })),
      silencePaddingStart: this.silencePaddingStart,
      silencePaddingEnd: this.silencePaddingEnd,
      trimSilence: this.trimSilence,
      exportCdMarkers: this.exportCdMarkers,
      cdMarkerFormat: this.cdMarkerFormat,
      bwfMetadata: this.bwfMetadata,
      bwfData: this.bwfData ? { ...this.bwfData } : void 0,
      reimportAfterExport: this.reimportAfterExport
    };
  }
  /**
   * Restore from JSON snapshot.
   */
  static fromJSON(data) {
    const config = new _ExportConfig(data.id);
    config.format = data.format;
    config.sampleFormat = data.sampleFormat;
    config.sampleRate = data.sampleRate;
    config.bitrate = data.bitrate;
    config.quality = data.quality;
    config.rangeId = data.rangeId;
    config.startFrame = data.startFrame;
    config.endFrame = data.endFrame;
    config.filename = data.filename;
    config.folder = data.folder ?? "";
    config.filenameTemplate = data.filenameTemplate ?? "%s";
    config.presetId = data.presetId;
    config.exportMasterOnly = data.exportMasterOnly;
    config.trackIds = data.trackIds ? [...data.trackIds] : [];
    config.stemExport = data.stemExport;
    config.splitMono = data.splitMono ?? false;
    config.ditherType = data.ditherType;
    config.normalize = data.normalize;
    config.normalizeMode = data.normalizeMode ?? "peak";
    config.targetPeakDb = data.targetPeakDb;
    config.targetLufs = data.targetLufs ?? -14;
    config.truePeakLimit = data.truePeakLimit ?? false;
    config.truePeakCeiling = data.truePeakCeiling ?? -1;
    config.timespans = data.timespans ? data.timespans.map((ts) => ({ ...ts })) : [];
    config.silencePaddingStart = data.silencePaddingStart ?? 0;
    config.silencePaddingEnd = data.silencePaddingEnd ?? 0;
    config.trimSilence = data.trimSilence ?? false;
    config.exportCdMarkers = data.exportCdMarkers ?? false;
    config.cdMarkerFormat = data.cdMarkerFormat ?? "cue";
    config.bwfMetadata = data.bwfMetadata ?? false;
    config.bwfData = data.bwfData ? { ...data.bwfData } : void 0;
    config.reimportAfterExport = data.reimportAfterExport ?? false;
    return config;
  }
};

// core/src/domain/ExportStatus.ts
var ExportStatus = class {
  constructor() {
    // Status
    this._progress = "idle" /* IDLE */;
    this._running = false;
    this._aborted = false;
    this._errors = false;
    this._errorMessage = "";
    // Progress Info
    this.totalFrames = 0;
    this.processedFrames = 0;
    this.currentFilename = "";
    // Signals
    this.progressChanged = new Signal();
    this.frameProcessed = new Signal();
    this.finished = new Signal();
    // success: true/false
    this.errorOccurred = new Signal();
  }
  get progress() {
    return this._progress;
  }
  get running() {
    return this._running;
  }
  get aborted() {
    return this._aborted;
  }
  get errors() {
    return this._errors;
  }
  get errorMessage() {
    return this._errorMessage;
  }
  get percentComplete() {
    if (this.totalFrames === 0) return 0;
    return this.processedFrames / this.totalFrames * 100;
  }
  init(totalFrames, filename) {
    this._progress = "rendering" /* RENDERING */;
    this._running = true;
    this._aborted = false;
    this._errors = false;
    this._errorMessage = "";
    this.totalFrames = totalFrames;
    this.processedFrames = 0;
    this.currentFilename = filename;
    this.resultBlob = void 0;
    this.resultUrl = void 0;
    this.progressChanged.emit(this._progress);
  }
  setProgress(progress) {
    if (this._progress !== progress) {
      this._progress = progress;
      this.progressChanged.emit(progress);
    }
  }
  updateProcessedFrames(frames) {
    this.processedFrames = frames;
    this.frameProcessed.emit(frames);
  }
  abort(errorOccurred = false) {
    this._aborted = true;
    this._running = false;
    if (errorOccurred) {
      this._errors = true;
    }
    this._progress = "aborted" /* ABORTED */;
    this.progressChanged.emit(this._progress);
    this.finished.emit(false);
  }
  setError(message) {
    this._errors = true;
    this._errorMessage = message;
    this._progress = "failed" /* FAILED */;
    this._running = false;
    this.progressChanged.emit(this._progress);
    this.errorOccurred.emit(message);
    this.finished.emit(false);
  }
  complete(blob, url) {
    this._progress = "completed" /* COMPLETED */;
    this._running = false;
    this.resultBlob = blob;
    this.resultUrl = url;
    this.processedFrames = this.totalFrames;
    this.progressChanged.emit(this._progress);
    this.finished.emit(true);
  }
  cleanup() {
    if (this.resultUrl) {
      URL.revokeObjectURL(this.resultUrl);
      this.resultUrl = void 0;
    }
    this.resultBlob = void 0;
  }
};

// core/src/domain/GridSettings.ts
var GridSettings = class {
  constructor(gridType = "1/4" /* BEAT_1_4 */, snapMode = "snap_to_grid" /* SNAP_TO_GRID */, bpm = 120) {
    this._gridType = "1/4" /* BEAT_1_4 */;
    this._snapMode = "snap_to_grid" /* SNAP_TO_GRID */;
    this._snapToGrid = true;
    // Tempo 정보 (향후 Tempo Map 연동)
    this._bpm = 120;
    this._timeSignatureNumerator = 4;
    this._timeSignatureDenominator = 4;
    // Signals
    this.changed = new Signal();
    this._gridType = gridType;
    this._snapMode = snapMode;
    this._bpm = bpm;
  }
  // Getters
  get gridType() {
    return this._gridType;
  }
  get snapMode() {
    return this._snapMode;
  }
  get snapToGrid() {
    return this._snapToGrid && this._snapMode !== "no_snap" /* NO_SNAP */;
  }
  get bpm() {
    return this._bpm;
  }
  get timeSignatureNumerator() {
    return this._timeSignatureNumerator;
  }
  get timeSignatureDenominator() {
    return this._timeSignatureDenominator;
  }
  // Setters
  setGridType(gridType) {
    if (this._gridType !== gridType) {
      this._gridType = gridType;
      this.changed.emit();
    }
  }
  setSnapMode(snapMode) {
    if (this._snapMode !== snapMode) {
      this._snapMode = snapMode;
      this.changed.emit();
    }
  }
  setSnapToGrid(enabled) {
    if (this._snapToGrid !== enabled) {
      this._snapToGrid = enabled;
      this.changed.emit();
    }
  }
  setBPM(bpm) {
    if (bpm > 0 && bpm <= 300) {
      this._bpm = bpm;
      this.changed.emit();
    }
  }
  setTimeSignature(numerator, denominator) {
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
  getGridIntervalFrames(sampleRate) {
    if (this._gridType === "no_grid" /* NO_GRID */) {
      return 0;
    }
    const secondsPerBeat = 60 / this._bpm;
    const framesPerBeat = secondsPerBeat * sampleRate;
    switch (this._gridType) {
      case "1/32" /* BEAT_1_32 */:
        return Math.floor(framesPerBeat / 8);
      // 1/32 = 1/4 / 8
      case "1/16" /* BEAT_1_16 */:
        return Math.floor(framesPerBeat / 4);
      // 1/16 = 1/4 / 4
      case "1/8" /* BEAT_1_8 */:
        return Math.floor(framesPerBeat / 2);
      // 1/8 = 1/4 / 2
      case "1/4" /* BEAT_1_4 */:
        return Math.floor(framesPerBeat);
      case "1/2" /* BEAT_1_2 */:
        return Math.floor(framesPerBeat * 2);
      case "1" /* BEAT_1 */:
        return Math.floor(framesPerBeat * 4);
      // 1 bar = 4 beats
      case "2" /* BEAT_2 */:
        return Math.floor(framesPerBeat * 8);
      case "4" /* BEAT_4 */:
        return Math.floor(framesPerBeat * 16);
      case "8" /* BEAT_8 */:
        return Math.floor(framesPerBeat * 32);
      case "samples" /* SAMPLES */:
        return 1024;
      // 1024 samples
      case "cdframes" /* CD_FRAMES */:
        return Math.floor(sampleRate / 75);
      // CD: 75 frames/sec
      case "timecode" /* TIMECODE */:
      case "minsec" /* MINSEC */:
        return Math.floor(sampleRate);
      // 1 second
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
  snapToGridFrame(frame, sampleRate) {
    if (!this.snapToGrid || this._gridType === "no_grid" /* NO_GRID */) {
      return frame;
    }
    const gridInterval = this.getGridIntervalFrames(sampleRate);
    if (gridInterval === 0) {
      return frame;
    }
    const gridIndex = Math.round(frame / gridInterval);
    return gridIndex * gridInterval;
  }
  /**
   * Frame을 grid에 내림 (floor)
   */
  snapToGridFloor(frame, sampleRate) {
    if (!this.snapToGrid || this._gridType === "no_grid" /* NO_GRID */) {
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
  snapToGridCeil(frame, sampleRate) {
    if (!this.snapToGrid || this._gridType === "no_grid" /* NO_GRID */) {
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
  toDTO() {
    return {
      gridType: this._gridType,
      snapMode: this._snapMode,
      snapToGrid: this._snapToGrid,
      bpm: this._bpm,
      timeSignature: `${this._timeSignatureNumerator}/${this._timeSignatureDenominator}`
    };
  }
};

// core/src/domain/temporal/TempoMap.ts
function findSegmentIndex(events, frame) {
  let lo = 0;
  let hi = events.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = lo + hi >>> 1;
    if (events[mid].frame <= frame) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
function findExactIndex(events, frame) {
  let lo = 0;
  let hi = events.length - 1;
  while (lo <= hi) {
    const mid = lo + hi >>> 1;
    if (events[mid].frame === frame) {
      return mid;
    } else if (events[mid].frame < frame) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return -1;
}
var TempoMap = class {
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.events = [];
    this._meterEvents = [];
    /** Fires after any modification to the tempo map (add/remove tempo or meter changes). */
    this.changed = new Signal();
    /**
     * Fires after a tempo value has been modified, providing the frame at which the change occurred.
     * Useful for repositioning regions or cursors after a tempo edit.
     */
    this.onTempoChanged = new Signal();
    this.events.push({ frame: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 });
    this._meterEvents.push({ frame: 0, beatsPerBar: 4, beatValue: 4 });
  }
  // ─── Tempo Events ────────────────────────────────────────────────────────
  /**
   * Add or update a tempo change at the given frame position.
   * If a tempo change already exists at the exact frame, it is updated.
   */
  addTempoChange(frame, bpm, timeSigNum, timeSigDen) {
    if (bpm <= 0) return;
    const idx = findExactIndex(this.events, frame);
    if (idx !== -1) {
      const oldBpm = this.events[idx].bpm;
      this.events[idx].bpm = bpm;
      if (timeSigNum !== void 0) this.events[idx].timeSigNum = timeSigNum;
      if (timeSigDen !== void 0) this.events[idx].timeSigDen = timeSigDen;
      this.changed.emit();
      if (oldBpm !== bpm) {
        this.onTempoChanged.emit({ frame, oldBpm, newBpm: bpm });
      }
    } else {
      this.events.push({ frame, bpm, timeSigNum, timeSigDen });
      this.events.sort((a, b) => a.frame - b.frame);
      this.changed.emit();
      this.onTempoChanged.emit({
        frame,
        oldBpm: this.getTempoAtFrame(frame),
        newBpm: bpm
      });
    }
  }
  /**
   * Remove a tempo change at the given frame.
   * The initial event at frame 0 cannot be removed.
   */
  removeTempoChange(frame) {
    if (frame === 0) return;
    const index = findExactIndex(this.events, frame);
    if (index !== -1) {
      this.events.splice(index, 1);
      this.changed.emit();
    }
  }
  /**
   * Get the tempo (BPM) at a given frame position.
   * Uses binary search for efficient lookup.
   */
  getTempoAtFrame(frame) {
    const idx = findSegmentIndex(this.events, frame);
    return idx >= 0 ? this.events[idx].bpm : this.events[0].bpm;
  }
  /**
   * Get the time signature at a given frame position.
   * Returns [numerator, denominator].
   * Walks through tempo events that carry time signature overrides.
   */
  getTimeSignatureAtFrame(frame) {
    let num = 4;
    let den = 4;
    const idx = findSegmentIndex(this.events, frame);
    for (let i = 0; i <= idx; i++) {
      if (this.events[i].timeSigNum !== void 0)
        num = this.events[i].timeSigNum;
      if (this.events[i].timeSigDen !== void 0)
        den = this.events[i].timeSigDen;
    }
    return [num, den];
  }
  /**
   * Get all tempo events, sorted by frame.
   */
  getAllEvents() {
    return [...this.events];
  }
  // ─── Meter Events ────────────────────────────────────────────────────────
  /**
   * Add or update a meter (time signature) change at the given frame position.
   * If a meter change already exists at the exact frame, it is updated.
   *
   * @param frame - Frame position of the meter change
   * @param beatsPerBar - Number of beats per bar (time signature numerator)
   * @param beatValue - Note value that gets one beat (time signature denominator, e.g. 4 = quarter)
   */
  addMeterChange(frame, beatsPerBar, beatValue) {
    if (beatsPerBar <= 0 || beatValue <= 0) return;
    const idx = findExactIndex(this._meterEvents, frame);
    if (idx !== -1) {
      this._meterEvents[idx].beatsPerBar = beatsPerBar;
      this._meterEvents[idx].beatValue = beatValue;
    } else {
      this._meterEvents.push({ frame, beatsPerBar, beatValue });
      this._meterEvents.sort((a, b) => a.frame - b.frame);
    }
    this.changed.emit();
  }
  /**
   * Remove a meter change at the given frame.
   * The initial meter event at frame 0 cannot be removed.
   *
   * @param frame - Frame position of the meter change to remove
   */
  removeMeterChange(frame) {
    if (frame === 0) return;
    const idx = findExactIndex(this._meterEvents, frame);
    if (idx !== -1) {
      this._meterEvents.splice(idx, 1);
      this.changed.emit();
    }
  }
  /**
   * Get the meter (time signature) at a given frame position.
   * Uses binary search for efficient lookup.
   *
   * @param frame - Frame position to query
   * @returns The active MeterEvent at the given frame
   */
  getMeterAt(frame) {
    const idx = findSegmentIndex(this._meterEvents, frame);
    if (idx >= 0) {
      return { ...this._meterEvents[idx] };
    }
    return { ...this._meterEvents[0] };
  }
  /**
   * Get all meter events, sorted by frame.
   */
  getAllMeterEvents() {
    return [...this._meterEvents];
  }
  /**
   * Get combined tempo and meter information at a given frame position.
   * Convenience method that returns both BPM and time signature data.
   *
   * @param frame - Frame position to query
   * @returns Combined tempo and meter data
   */
  getTempoAndMeterAt(frame) {
    const bpm = this.getTempoAtFrame(frame);
    const meter = this.getMeterAt(frame);
    return {
      bpm,
      beatsPerBar: meter.beatsPerBar,
      beatValue: meter.beatValue
    };
  }
  // ─── Frame / Seconds Conversion ──────────────────────────────────────────
  /**
   * Convert frames to seconds, accounting for tempo changes across the timeline.
   * Integrates the duration of each tempo segment.
   */
  framesToSeconds(frames, sampleRate) {
    const sr = sampleRate ?? this.sampleRate;
    if (this.events.length <= 1) {
      return frames / sr;
    }
    let remaining = frames;
    let seconds = 0;
    for (let i = 0; i < this.events.length && remaining > 0; i++) {
      const segmentStart = this.events[i].frame;
      const segmentEnd = i + 1 < this.events.length ? this.events[i + 1].frame : Infinity;
      const segmentFrames = Math.min(remaining, segmentEnd - segmentStart);
      if (segmentFrames <= 0) continue;
      seconds += segmentFrames / sr;
      remaining -= segmentFrames;
    }
    return seconds;
  }
  /**
   * Convert seconds to frames, accounting for tempo changes across the timeline.
   */
  secondsToFrames(seconds, sampleRate) {
    const sr = sampleRate ?? this.sampleRate;
    return Math.round(seconds * sr);
  }
  // ─── Absolute Beat / Frame Conversion ────────────────────────────────────
  /**
   * Convert a frame position to an absolute beat count from the start of the timeline,
   * accounting for ALL tempo changes along the way.
   *
   * For each tempo segment, the number of beats is calculated as:
   *   beats = (segmentFrames / sampleRate) * (bpm / 60)
   *
   * @param frame - Frame position to convert
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns Absolute beat count from frame 0
   */
  framesToBeatsAbsolute(frame, sampleRate) {
    const sr = sampleRate ?? this.sampleRate;
    let remaining = frame;
    let totalBeats = 0;
    for (let i = 0; i < this.events.length && remaining > 0; i++) {
      const segmentEnd = i + 1 < this.events.length ? this.events[i + 1].frame - this.events[i].frame : Infinity;
      const segmentFrames = Math.min(remaining, segmentEnd);
      if (segmentFrames <= 0) continue;
      const bpm = this.events[i].bpm;
      const segmentSeconds = segmentFrames / sr;
      totalBeats += segmentSeconds * (bpm / 60);
      remaining -= segmentFrames;
    }
    return totalBeats;
  }
  /**
   * Convert an absolute beat count from the start of the timeline to a frame position,
   * accounting for ALL tempo changes along the way.
   *
   * Inverse of `framesToBeatsAbsolute`.
   *
   * @param beats - Absolute beat count from the start
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns Frame position
   */
  beatsToFramesAbsolute(beats, sampleRate) {
    const sr = sampleRate ?? this.sampleRate;
    let remainingBeats = beats;
    let totalFrames = 0;
    for (let i = 0; i < this.events.length && remainingBeats > 0; i++) {
      const bpm = this.events[i].bpm;
      const segmentEnd = i + 1 < this.events.length ? this.events[i + 1].frame - this.events[i].frame : Infinity;
      const segmentMaxBeats = segmentEnd / sr * (bpm / 60);
      const beatsInSegment = Math.min(remainingBeats, segmentMaxBeats);
      const framesForBeats = beatsInSegment / (bpm / 60) * sr;
      totalFrames += framesForBeats;
      remainingBeats -= beatsInSegment;
    }
    return Math.round(totalFrames);
  }
  // ─── BBT (Bar/Beat/Tick) Conversion ──────────────────────────────────────
  /**
   * Convert a frame position to Bar/Beat/Tick notation.
   *
   * Walks through tempo and meter segments to calculate the cumulative
   * bar, beat, and tick position. Uses 1920 ticks per beat.
   *
   * @param frame - Frame position to convert
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns BBT position (bars and beats are 1-based, ticks are 0-based)
   */
  framesToBBT(frame, sampleRate) {
    const sr = sampleRate ?? this.sampleRate;
    const totalBeats = this.framesToBeatsAbsolute(frame, sr);
    let remainingBeats = totalBeats;
    let bar = 1;
    const meterBeatStarts = this._computeMeterBeatStarts(sr);
    for (let i = 0; i < this._meterEvents.length; i++) {
      const meter = this._meterEvents[i];
      const meterStart = meterBeatStarts[i];
      const meterEnd = i + 1 < meterBeatStarts.length ? meterBeatStarts[i + 1] : Infinity;
      const quarterBeatsPerBar = meter.beatsPerBar * (4 / meter.beatValue);
      const beatsInThisSegment = Math.min(
        remainingBeats,
        meterEnd - meterStart
      );
      if (beatsInThisSegment <= 0) continue;
      const fullBars = Math.floor(beatsInThisSegment / quarterBeatsPerBar);
      const leftover = beatsInThisSegment - fullBars * quarterBeatsPerBar;
      if (remainingBeats <= meterEnd - meterStart) {
        bar += fullBars;
        const beatInBar = Math.floor(leftover) + 1;
        const fractionalBeat = leftover - Math.floor(leftover);
        const tick = Math.round(fractionalBeat * TICKS_PER_BEAT);
        return { bar, beat: beatInBar, tick };
      }
      bar += fullBars;
      remainingBeats -= beatsInThisSegment;
    }
    return { bar: 1, beat: 1, tick: 0 };
  }
  /**
   * Convert Bar/Beat/Tick notation to a frame position.
   *
   * @param bar - Bar number (1-based)
   * @param beat - Beat within bar (1-based)
   * @param tick - Tick within beat (0-based, 0..1919)
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns Frame position
   */
  bbtToFrames(bar, beat, tick, sampleRate) {
    const sr = sampleRate ?? this.sampleRate;
    const meterBeatStarts = this._computeMeterBeatStarts(sr);
    let targetBeats = 0;
    let currentBar = 1;
    for (let i = 0; i < this._meterEvents.length; i++) {
      const meter = this._meterEvents[i];
      const meterEnd = i + 1 < meterBeatStarts.length ? meterBeatStarts[i + 1] : Infinity;
      const segmentBeats = meterEnd - meterBeatStarts[i];
      const quarterBeatsPerBar = meter.beatsPerBar * (4 / meter.beatValue);
      const fullBarsInSegment = isFinite(segmentBeats) ? Math.floor(segmentBeats / quarterBeatsPerBar) : Infinity;
      const barsNeeded = bar - currentBar;
      if (barsNeeded < fullBarsInSegment || !isFinite(fullBarsInSegment)) {
        targetBeats = meterBeatStarts[i] + barsNeeded * quarterBeatsPerBar + (beat - 1) + tick / TICKS_PER_BEAT;
        return this.beatsToFramesAbsolute(targetBeats, sr);
      }
      currentBar += fullBarsInSegment;
      targetBeats = meterBeatStarts[i] + fullBarsInSegment * quarterBeatsPerBar;
    }
    return this.beatsToFramesAbsolute(targetBeats, sr);
  }
  /**
   * Compute the absolute beat position at which each meter event begins.
   * This integrates tempo across the timeline to find beat offsets for each meter point.
   */
  _computeMeterBeatStarts(sr) {
    const starts = [];
    for (let i = 0; i < this._meterEvents.length; i++) {
      starts.push(this.framesToBeatsAbsolute(this._meterEvents[i].frame, sr));
    }
    return starts;
  }
  // ─── Grid Points & Snapping ──────────────────────────────────────────────
  /**
   * Returns the number of quarter-note beats per subdivision unit.
   * For example, 'eighth' = 0.5 beats, 'bar' depends on current meter.
   */
  _subdivisionToBeats(subdivisionType, beatsPerBar, beatValue) {
    const quarterBeatsPerBar = beatsPerBar * (4 / beatValue);
    switch (subdivisionType) {
      case "bar":
        return quarterBeatsPerBar;
      case "beat":
        return 1;
      case "half":
        return 2;
      case "quarter":
        return 1;
      case "eighth":
        return 0.5;
      case "sixteenth":
        return 0.25;
      case "triplet":
        return 1 / 3;
      case "dotted":
        return 1.5;
      default:
        return 1;
    }
  }
  /**
   * Generate grid points between two frame positions for a given subdivision type.
   *
   * Walks through tempo and meter segments, generating evenly spaced grid points
   * according to the active tempo and subdivision at each point.
   *
   * @param startFrame - Start of the range (inclusive)
   * @param endFrame - End of the range (inclusive)
   * @param subdivisionType - Grid subdivision type
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns Array of frame positions for grid points within the range
   */
  getGridPoints(startFrame, endFrame, subdivisionType, sampleRate) {
    const sr = sampleRate ?? this.sampleRate;
    const points = [];
    if (startFrame >= endFrame) return points;
    const startBeats = this.framesToBeatsAbsolute(startFrame, sr);
    const meter = this.getMeterAt(startFrame);
    const subBeats = this._subdivisionToBeats(
      subdivisionType,
      meter.beatsPerBar,
      meter.beatValue
    );
    const firstGridBeat = Math.ceil(startBeats / subBeats) * subBeats;
    let currentBeat = firstGridBeat;
    const maxIterations = 1e6;
    let iterations = 0;
    while (iterations++ < maxIterations) {
      const frame = this.beatsToFramesAbsolute(currentBeat, sr);
      if (frame > endFrame) break;
      if (frame >= startFrame) {
        points.push(frame);
      }
      const currentMeter = this.getMeterAt(frame);
      const currentSubBeats = this._subdivisionToBeats(
        subdivisionType,
        currentMeter.beatsPerBar,
        currentMeter.beatValue
      );
      currentBeat += currentSubBeats;
    }
    return points;
  }
  /**
   * Snap a frame position to the nearest grid point for the given subdivision type.
   *
   * @param frame - Frame position to snap
   * @param subdivisionType - Grid subdivision type
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns The nearest grid-aligned frame position
   */
  snapToGrid(frame, subdivisionType, sampleRate) {
    const sr = sampleRate ?? this.sampleRate;
    const meter = this.getMeterAt(frame);
    const subBeats = this._subdivisionToBeats(
      subdivisionType,
      meter.beatsPerBar,
      meter.beatValue
    );
    const beats = this.framesToBeatsAbsolute(frame, sr);
    const snappedBeats = Math.round(beats / subBeats) * subBeats;
    return this.beatsToFramesAbsolute(snappedBeats, sr);
  }
  /**
   * Generate a swing grid between two frame positions.
   *
   * Swing offsets every other grid point by shifting it forward in time.
   * A `swingAmount` of 0 produces a straight grid; 1 pushes the off-beat
   * to the maximum position (the next grid point).
   *
   * @param startFrame - Start of the range (inclusive)
   * @param endFrame - End of the range (inclusive)
   * @param subdivision - Grid subdivision type
   * @param swingAmount - Swing amount between 0 (straight) and 1 (max swing)
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns Array of frame positions for the swing-adjusted grid
   */
  getSwingGrid(startFrame, endFrame, subdivision, swingAmount, sampleRate) {
    const sr = sampleRate ?? this.sampleRate;
    const clampedSwing = Math.max(0, Math.min(1, swingAmount));
    const straightPoints = this.getGridPoints(
      startFrame,
      endFrame,
      subdivision,
      sr
    );
    if (clampedSwing === 0 || straightPoints.length < 2) {
      return straightPoints;
    }
    const result = [];
    for (let i = 0; i < straightPoints.length; i++) {
      if (i % 2 === 0) {
        result.push(straightPoints[i]);
      } else {
        const prev = straightPoints[i - 1];
        const next = i + 1 < straightPoints.length ? straightPoints[i + 1] : straightPoints[i] + (straightPoints[i] - prev);
        const interval = next - prev;
        const swungOffset = (0.5 + clampedSwing * 0.5) * interval;
        const swungFrame = Math.round(prev + swungOffset);
        result.push(Math.min(swungFrame, endFrame));
      }
    }
    return result;
  }
  // ─── Region Repositioning ────────────────────────────────────────────────
  /**
   * Recalculate a frame position after a tempo change, preserving its musical position.
   *
   * When tempo changes from `oldTempo` to `newTempo`, a region that was at a certain
   * beat position should move to maintain the same musical position. This method
   * calculates the new frame position.
   *
   * @param frame - Original frame position
   * @param oldTempo - Previous tempo in BPM
   * @param newTempo - New tempo in BPM
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns Recalculated frame position
   */
  repositionFrameForTempoChange(frame, oldTempo, newTempo, sampleRate) {
    if (oldTempo <= 0 || newTempo <= 0) return frame;
    const sr = sampleRate ?? this.sampleRate;
    const seconds = frame / sr;
    const beats = seconds * oldTempo / 60;
    const newSeconds = beats * 60 / newTempo;
    return Math.round(newSeconds * sr);
  }
  // ─── Frame / Seconds (Legacy) ────────────────────────────────────────────
  // ─── Legacy API (backward-compatible with constant-tempo callers) ─────────
  /** Convert beats to frames at given BPM */
  beatsToFrames(beats, bpm) {
    const seconds = beats.toNumber() / bpm * 60;
    return Math.round(seconds * this.sampleRate);
  }
  /** Convert frames to beats at given BPM */
  framesToBeats(frames, bpm) {
    const seconds = frames / this.sampleRate;
    const beatCount = seconds / 60 * bpm;
    return new Beats(beatCount);
  }
  /** Convert TimePosition to frames */
  toFrames(pos, bpm) {
    if (pos.domain === 0 /* AudioTime */) {
      return pos.value;
    } else {
      return this.beatsToFrames(Beats.fromTicks(pos.value), bpm);
    }
  }
  /** Convert TimePosition to beats */
  toBeats(pos, bpm) {
    if (pos.domain === 1 /* BeatTime */) {
      return Beats.fromTicks(pos.value);
    } else {
      return this.framesToBeats(pos.value, bpm);
    }
  }
};

// core/src/processing/PluginInsert.ts
var DEFAULT_SAMPLE_RATE = 44100;
var PluginInsert = class extends Processor {
  constructor(id, plugin, sampleRate = DEFAULT_SAMPLE_RATE) {
    super(id, `Insert: ${plugin.name}`);
    this._plugin = plugin;
    this._sampleRate = sampleRate;
    this.updateLatencyFromPlugin();
    this.updateTailFromPlugin();
    this._parameterSubscription = this._plugin.parameterChanged.connect(
      (_change) => {
        this.updateLatencyFromPlugin();
        this.updateTailFromPlugin();
      }
    );
  }
  get plugin() {
    return this._plugin;
  }
  /** The sample rate used for time-to-sample conversions in tail estimation. */
  get sampleRate() {
    return this._sampleRate;
  }
  set sampleRate(rate) {
    if (rate > 0 && rate !== this._sampleRate) {
      this._sampleRate = rate;
      this.updateLatencyFromPlugin();
      this.updateTailFromPlugin();
    }
  }
  // Proxy active state to plugin bypass if supported
  set active(value) {
    super.active = value;
    if (!value) {
      this.setLatency(0);
      this.setTailLength(0);
    } else {
      this.updateLatencyFromPlugin();
      this.updateTailFromPlugin();
    }
  }
  get active() {
    return super.active;
  }
  // ── Latency Estimation ──────────────────────────────────────────────────
  /**
   * Estimate latency (in samples) based on plugin name / type heuristics.
   *
   * Real-world plugins would report their exact latency; here we use
   * conservative estimates for common processor categories:
   *
   * - Linear-phase EQ: ~512 samples (FIR filter latency)
   * - Compressor / Limiter: ~64-256 samples (look-ahead)
   * - De-esser: ~64 samples
   * - Other effects / instruments / analyzers: 0
   */
  updateLatencyFromPlugin() {
    if (!this.active) return;
    const nameLower = this._plugin.name.toLowerCase();
    let latency = 0;
    if (nameLower.includes("linear")) {
      latency = 512;
    } else if (nameLower.includes("comp") || nameLower.includes("limit")) {
      const lookaheadParam = this._plugin.getParameter(
        "lookahead"
      );
      if (lookaheadParam) {
        latency = Math.round(64 + lookaheadParam.value * (256 - 64));
      } else {
        latency = 64;
      }
    } else if (nameLower.includes("de-ess") || nameLower.includes("deess")) {
      latency = 64;
    }
    this.setLatency(latency);
  }
  // ── Tail Time Estimation ────────────────────────────────────────────────
  /**
   * Estimate the tail length (in frames / samples) based on plugin name and
   * parameter state.
   *
   * - Reverb / convolution: 2-5 seconds, scaled by decay / wet parameters.
   * - Delay: delay-time * estimated feedback-loop count.
   * - Everything else: 0.
   */
  updateTailFromPlugin() {
    if (!this.active) return;
    const nameLower = this._plugin.name.toLowerCase();
    let tailSeconds = 0;
    if (nameLower.includes("reverb") || nameLower.includes("convol")) {
      tailSeconds = this._estimateReverbTail();
    } else if (nameLower.includes("delay")) {
      tailSeconds = this._estimateDelayTail();
    }
    const tailFrames = Math.ceil(tailSeconds * this._sampleRate);
    this.setTailLength(tailFrames);
  }
  // ── Private helpers ─────────────────────────────────────────────────────
  /**
   * Estimate reverb tail between 2 and 5 seconds.
   * Uses 'decay' or 'time' parameters for the base, and 'wet' / 'mix' to
   * scale down when the effect is barely audible.
   */
  _estimateReverbTail() {
    const baseTail = 2;
    const maxTail = 5;
    const decayParam = this._plugin.getParameter("decay") ?? this._plugin.getParameter("time");
    let tail;
    if (decayParam) {
      const norm = (decayParam.value - decayParam.min) / (decayParam.max - decayParam.min || 1);
      tail = baseTail + norm * (maxTail - baseTail);
    } else {
      tail = baseTail;
    }
    const wetParam = this._plugin.getParameter("wet") ?? this._plugin.getParameter("mix");
    if (wetParam) {
      const wetNorm = (wetParam.value - wetParam.min) / (wetParam.max - wetParam.min || 1);
      tail *= wetNorm;
    }
    return tail;
  }
  /**
   * Estimate delay tail based on delay-time and feedback.
   *
   * The effective tail is roughly `delayTime * loops` where loops is
   * derived from the feedback amount:  loops ≈ log(threshold) / log(feedback).
   * We cap at a sensible maximum (10 s).
   */
  _estimateDelayTail() {
    const MAX_TAIL = 10;
    const timeParam = this._plugin.getParameter("time") ?? this._plugin.getParameter("delay");
    const feedbackParam = this._plugin.getParameter("feedback");
    let delayTime = 0.5;
    if (timeParam) {
      if (timeParam.max <= 1) {
        delayTime = timeParam.value * 2;
      } else {
        delayTime = timeParam.value;
      }
    }
    let loops = 1;
    if (feedbackParam) {
      const fbNorm = (feedbackParam.value - feedbackParam.min) / (feedbackParam.max - feedbackParam.min || 1);
      const fb = Math.min(fbNorm, 0.99);
      if (fb > 0.01) {
        const threshold = 1e-3;
        loops = Math.ceil(Math.log(threshold) / Math.log(fb));
      }
    }
    return Math.min(delayTime * loops, MAX_TAIL);
  }
  /**
   * Dispose of internal subscriptions.  Call when removing the insert from
   * the processing chain.
   */
  dispose() {
    this._parameterSubscription.dispose();
  }
};

// core/src/domain/MixerScene.ts
var MixerScene = class _MixerScene {
  constructor(id, name, tracks, createdAt) {
    this.id = id;
    this.name = name;
    this.tracks = tracks;
    this.createdAt = createdAt ?? Date.now();
  }
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      createdAt: this.createdAt,
      tracks: this.tracks
    };
  }
  static fromJSON(data) {
    return new _MixerScene(data.id, data.name, data.tracks, data.createdAt);
  }
};
var MixerSceneManager = class {
  constructor() {
    this._scenes = /* @__PURE__ */ new Map();
    this.sceneAdded = new Signal();
    this.sceneRemoved = new Signal();
    this.sceneRecalled = new Signal();
  }
  /**
   * Capture the current mixer state from the session and save as a scene.
   */
  saveScene(name, session) {
    const id = crypto.randomUUID();
    const trackStates = [];
    for (const track of session.tracks) {
      const pluginParams = {};
      for (const proc of track.route.processors) {
        if (proc instanceof PluginInsert) {
          const paramMap = {};
          for (const param of proc.plugin.getParameters()) {
            paramMap[param.id] = param.value;
          }
          pluginParams[proc.id] = paramMap;
        }
      }
      trackStates.push({
        trackId: track.id,
        volume: track.route.volume,
        pan: track.route.pan,
        mute: track.mute,
        solo: track.solo,
        pluginParameters: pluginParams
      });
    }
    const scene = new MixerScene(id, name, trackStates);
    this._scenes.set(id, scene);
    this.sceneAdded.emit(scene);
    return id;
  }
  /**
   * Recall (restore) a saved mixer scene, applying volumes/pans/mutes/solos/plugin params.
   */
  recallScene(sceneId, session) {
    const scene = this._scenes.get(sceneId);
    if (!scene) return false;
    for (const trackState of scene.tracks) {
      const track = session.getTrack(trackState.trackId);
      if (!track) continue;
      track.route.volume = trackState.volume;
      track.route.pan = trackState.pan;
      track.setMute(trackState.mute);
      track.setSolo(trackState.solo);
      for (const [procId, paramMap] of Object.entries(
        trackState.pluginParameters
      )) {
        const proc = track.route.processors.find((p) => p.id === procId);
        if (proc instanceof PluginInsert) {
          for (const [paramId, value] of Object.entries(paramMap)) {
            proc.plugin.setParameter(paramId, value);
          }
        }
      }
    }
    this.sceneRecalled.emit(sceneId);
    return true;
  }
  /**
   * Delete a scene by ID.
   */
  deleteScene(sceneId) {
    if (!this._scenes.has(sceneId)) return false;
    this._scenes.delete(sceneId);
    this.sceneRemoved.emit(sceneId);
    return true;
  }
  /**
   * Get all saved scenes.
   */
  get scenes() {
    return Array.from(this._scenes.values());
  }
  /**
   * Get a specific scene.
   */
  getScene(sceneId) {
    return this._scenes.get(sceneId);
  }
  // ─── Serialization ───────────────────────────────────────────────────────
  toJSON() {
    return Array.from(this._scenes.values()).map((s) => s.toJSON());
  }
  loadFromJSON(snapshots) {
    this._scenes.clear();
    for (const snap of snapshots) {
      const scene = MixerScene.fromJSON(snap);
      this._scenes.set(scene.id, scene);
    }
  }
};

// core/src/domain/TrackGroup.ts
var TrackGroup = class _TrackGroup {
  constructor(id, name) {
    this._memberTrackIds = /* @__PURE__ */ new Set();
    // Linked properties
    this.gainLinked = true;
    this.muteLinked = true;
    this.soloLinked = true;
    this.colorLinked = false;
    /** When true, selecting a region on one member track auto-selects equivalent regions on siblings. */
    this.regionSelectLinked = false;
    // Signals
    this.memberAdded = new Signal();
    this.memberRemoved = new Signal();
    this.changed = new Signal();
    this.id = id;
    this.name = name;
  }
  addMember(trackId) {
    if (!this._memberTrackIds.has(trackId)) {
      this._memberTrackIds.add(trackId);
      this.memberAdded.emit(trackId);
      this.changed.emit();
    }
  }
  removeMember(trackId) {
    if (this._memberTrackIds.has(trackId)) {
      this._memberTrackIds.delete(trackId);
      this.memberRemoved.emit(trackId);
      this.changed.emit();
    }
  }
  hasMember(trackId) {
    return this._memberTrackIds.has(trackId);
  }
  get memberTrackIds() {
    return Array.from(this._memberTrackIds);
  }
  get size() {
    return this._memberTrackIds.size;
  }
  setLinked(property, linked) {
    switch (property) {
      case "gain":
        this.gainLinked = linked;
        break;
      case "mute":
        this.muteLinked = linked;
        break;
      case "solo":
        this.soloLinked = linked;
        break;
      case "color":
        this.colorLinked = linked;
        break;
      case "regionSelect":
        this.regionSelectLinked = linked;
        break;
    }
    this.changed.emit();
  }
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      memberTrackIds: Array.from(this._memberTrackIds),
      gainLinked: this.gainLinked,
      muteLinked: this.muteLinked,
      soloLinked: this.soloLinked,
      colorLinked: this.colorLinked,
      regionSelectLinked: this.regionSelectLinked
    };
  }
  static fromJSON(data) {
    const group = new _TrackGroup(data.id, data.name);
    for (const trackId of data.memberTrackIds) {
      group._memberTrackIds.add(trackId);
    }
    group.gainLinked = data.gainLinked;
    group.muteLinked = data.muteLinked;
    group.soloLinked = data.soloLinked;
    group.colorLinked = data.colorLinked;
    group.regionSelectLinked = data.regionSelectLinked ?? false;
    return group;
  }
};

// core/src/domain/CDMarker.ts
var CDMarker = class _CDMarker {
  constructor(id, index, title, position, performer = "", isrc = "") {
    this.changed = new Signal();
    this.removed = new Signal();
    this.id = id;
    this.index = index;
    this.title = title;
    this.position = position;
    this.performer = performer;
    this.isrc = isrc;
  }
  setTitle(title) {
    if (this.title !== title) {
      this.title = title;
      this.changed.emit(this);
    }
  }
  setPosition(position) {
    if (this.position !== position) {
      this.position = Math.max(0, position);
      this.changed.emit(this);
    }
  }
  setPerformer(performer) {
    this.performer = performer;
    this.changed.emit(this);
  }
  setISRC(isrc) {
    this.isrc = isrc;
    this.changed.emit(this);
  }
  toJSON() {
    return {
      id: this.id,
      index: this.index,
      title: this.title,
      performer: this.performer,
      isrc: this.isrc,
      position: this.position
    };
  }
  static fromJSON(data) {
    return new _CDMarker(
      data.id,
      data.index,
      data.title,
      data.position,
      data.performer,
      data.isrc
    );
  }
};

// core/src/domain/VCATrack.ts
var VCATrack = class _VCATrack {
  constructor(id, name) {
    this._gain = 1;
    // Linear gain (1.0 = 0dB)
    this._slaveTrackIds = /* @__PURE__ */ new Set();
    // Mute/Solo state
    this._muted = false;
    this._soloed = false;
    // Automation
    this._automationEnabled = false;
    this.gainChanged = new Signal();
    this.slaveAdded = new Signal();
    this.slaveRemoved = new Signal();
    this.muteChanged = new Signal();
    this.soloChanged = new Signal();
    this.id = id;
    this.name = name;
  }
  get gain() {
    return this._gain;
  }
  /**
   * Set VCA gain.
   * Returns the gain delta that should be applied to slave tracks.
   */
  setGain(gain) {
    const oldGain = this._gain;
    this._gain = Math.max(0, gain);
    const delta = oldGain === 0 ? 1 : this._gain / oldGain;
    this.gainChanged.emit(this._gain);
    return delta;
  }
  /**
   * Set VCA gain in dB.
   */
  setGainDb(db) {
    return this.setGain(Math.pow(10, db / 20));
  }
  /**
   * Get current gain in dB.
   */
  getGainDb() {
    return 20 * Math.log10(this._gain || 1e-4);
  }
  addSlave(trackId) {
    if (!this._slaveTrackIds.has(trackId)) {
      this._slaveTrackIds.add(trackId);
      this.slaveAdded.emit(trackId);
    }
  }
  removeSlave(trackId) {
    if (this._slaveTrackIds.has(trackId)) {
      this._slaveTrackIds.delete(trackId);
      this.slaveRemoved.emit(trackId);
    }
  }
  hasSlave(trackId) {
    return this._slaveTrackIds.has(trackId);
  }
  get slaveTrackIds() {
    return Array.from(this._slaveTrackIds);
  }
  get slaveCount() {
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
  applyGainToSlaves(getTrack) {
    const appliedGains = /* @__PURE__ */ new Map();
    for (const slaveId of this._slaveTrackIds) {
      const track = getTrack(slaveId);
      if (!track) continue;
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
  setMuted(muted) {
    if (this._muted !== muted) {
      this._muted = muted;
      this.muteChanged.emit(muted);
    }
  }
  get muted() {
    return this._muted;
  }
  /**
   * Set the VCA solo state.
   * When a VCA is soloed, all slave tracks are treated as soloed.
   */
  setSoloed(soloed) {
    if (this._soloed !== soloed) {
      this._soloed = soloed;
      this.soloChanged.emit(soloed);
    }
  }
  get soloed() {
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
  isSlaveAudible(trackId) {
    if (!this._slaveTrackIds.has(trackId)) {
      return true;
    }
    if (this._soloed) {
      return true;
    }
    if (this._muted) {
      return false;
    }
    return true;
  }
  /**
   * Remove all slave tracks from this VCA.
   */
  clearSlaves() {
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
  setAutomationEnabled(enabled) {
    this._automationEnabled = enabled;
  }
  get automationEnabled() {
    return this._automationEnabled;
  }
  // ── Serialization ───────────────────────────────────────────────────────
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      gain: this._gain,
      slaveTrackIds: Array.from(this._slaveTrackIds),
      muted: this._muted,
      soloed: this._soloed,
      automationEnabled: this._automationEnabled
    };
  }
  static fromJSON(data) {
    const vca = new _VCATrack(data.id, data.name);
    vca._gain = data.gain;
    for (const id of data.slaveTrackIds) {
      vca._slaveTrackIds.add(id);
    }
    vca._muted = data.muted ?? false;
    vca._soloed = data.soloed ?? false;
    vca._automationEnabled = data.automationEnabled ?? false;
    return vca;
  }
};

// core/src/domain/TransportMode.ts
var ScrubState = class {
  constructor() {
    this.mode = "normal" /* NORMAL */;
    this.shuttleSpeed = 1;
    // -4.0 to 4.0 (negative = reverse)
    this.scrubPosition = 0;
  }
  // in seconds
  setScrubMode() {
    this.mode = "scrub" /* SCRUB */;
  }
  setShuttleMode(speed) {
    this.mode = "shuttle" /* SHUTTLE */;
    this.shuttleSpeed = Math.max(-4, Math.min(4, speed));
  }
  setNormalMode() {
    this.mode = "normal" /* NORMAL */;
    this.shuttleSpeed = 1;
  }
  isActive() {
    return this.mode !== "normal" /* NORMAL */;
  }
  updateScrubPosition(positionSeconds) {
    this.scrubPosition = Math.max(0, positionSeconds);
  }
};

// core/src/domain/TransportFSM.ts
var MAX_SPEED = 8;
var MIN_SPEED = 0.0625;
var TransportFSM = class {
  constructor() {
    // ─── State ──────────────────────────────────────────────────────────────
    this._motionState = "STOPPED" /* STOPPED */;
    this._directionState = "FORWARDS" /* FORWARDS */;
    this._speed = 1;
    /**
     * Frame to locate to when a Locate event is being processed through declick.
     * Only valid when motionState is DECLICK_TO_LOCATE or WAITING_FOR_LOCATE.
     */
    this._pendingLocateTarget = 0;
    /**
     * Whether the transport should resume rolling after a pending locate completes.
     */
    this._rollAfterLocate = false;
    /**
     * Speed to apply after a direction-reversal declick completes.
     * Only valid when _directionState is REVERSING.
     */
    this._pendingSpeed = null;
    // ─── Deferred Event Queue ───────────────────────────────────────────────
    /**
     * Events that arrive during a declick phase. They are stored and
     * replayed (in order) once the declick completes.
     */
    this._deferredEvents = [];
    // ─── Signals ────────────────────────────────────────────────────────────
    /**
     * Emitted whenever the motion state changes.
     * Payload is the new MotionState.
     */
    this.stateChanged = new Signal();
    /**
     * Emitted when the FSM determines a locate operation should be performed.
     * The audio engine should reposition the playhead to the given frame.
     */
    this.locateRequested = new Signal();
    /**
     * Emitted when the playback speed changes.
     * Payload is the new speed value (can be negative for reverse).
     */
    this.speedChanged = new Signal();
    /**
     * Emitted when the direction changes.
     * Payload is the new DirectionState.
     */
    this.directionChanged = new Signal();
  }
  // ─── Public Accessors ───────────────────────────────────────────────────
  /** Current motion state of the transport. */
  get motionState() {
    return this._motionState;
  }
  /** Current direction state of the transport. */
  get directionState() {
    return this._directionState;
  }
  /**
   * Current playback speed.
   * Positive = forward, negative = reverse.
   * Range: -8.0 to +8.0 (absolute minimum 0.0625).
   * Default: 1.0.
   */
  get speed() {
    return this._speed;
  }
  /** Whether the transport is currently rolling (playing). */
  isRolling() {
    return this._motionState === "ROLLING" /* ROLLING */;
  }
  /** Whether the transport is fully stopped. */
  isStopped() {
    return this._motionState === "STOPPED" /* STOPPED */;
  }
  /** Whether the transport is in a declick transition. */
  isDeclicking() {
    return this._motionState === "DECLICK_TO_STOP" /* DECLICK_TO_STOP */ || this._motionState === "DECLICK_TO_LOCATE" /* DECLICK_TO_LOCATE */;
  }
  /** Whether the transport is waiting for a locate to complete. */
  isWaitingForLocate() {
    return this._motionState === "WAITING_FOR_LOCATE" /* WAITING_FOR_LOCATE */;
  }
  // ─── Event Processing ───────────────────────────────────────────────────
  /**
   * Enqueue a transport event for processing.
   *
   * If the FSM is in a declick state, events are deferred and replayed
   * after the declick completes. Otherwise, events are processed immediately.
   */
  enqueue(event) {
    if (this.isDeclicking()) {
      if (event.type === "DeclickDone") {
        this.processEvent(event);
      } else {
        this._deferredEvents.push(event);
      }
    } else {
      this.processEvent(event);
    }
  }
  /**
   * Process a single transport event based on the current state.
   * Implements the full state transition logic.
   */
  processEvent(event) {
    switch (event.type) {
      case "StartTransport":
        this.handleStartTransport();
        break;
      case "StopTransport":
        this.handleStopTransport();
        break;
      case "Locate":
        this.handleLocate(event);
        break;
      case "DeclickDone":
        this.handleDeclickDone();
        break;
      case "SetSpeed":
        this.handleSetSpeed(event);
        break;
      case "LocateComplete":
        this.handleLocateComplete();
        break;
    }
  }
  // ─── Speed Control (A-3) ────────────────────────────────────────────────
  /**
   * Set the playback speed.
   *
   * - Clamps to [-MAX_SPEED, +MAX_SPEED] range.
   * - Absolute values below MIN_SPEED are snapped to zero (effectively stop).
   * - If the sign changes while rolling, a declick + direction reversal is initiated.
   *
   * @param newSpeed The desired playback speed.
   */
  setSpeed(newSpeed) {
    this.enqueue({ type: "SetSpeed", speed: newSpeed });
  }
  /**
   * Get the current playback speed.
   */
  getSpeed() {
    return this._speed;
  }
  // ─── Private: Event Handlers ────────────────────────────────────────────
  handleStartTransport() {
    switch (this._motionState) {
      case "STOPPED" /* STOPPED */:
        this.setMotionState("ROLLING" /* ROLLING */);
        break;
      case "ROLLING" /* ROLLING */:
        break;
      case "DECLICK_TO_STOP" /* DECLICK_TO_STOP */:
      case "DECLICK_TO_LOCATE" /* DECLICK_TO_LOCATE */:
        break;
      case "WAITING_FOR_LOCATE" /* WAITING_FOR_LOCATE */:
        this._rollAfterLocate = true;
        break;
    }
  }
  handleStopTransport() {
    switch (this._motionState) {
      case "STOPPED" /* STOPPED */:
        break;
      case "ROLLING" /* ROLLING */:
        this.setMotionState("DECLICK_TO_STOP" /* DECLICK_TO_STOP */);
        break;
      case "DECLICK_TO_STOP" /* DECLICK_TO_STOP */:
      case "DECLICK_TO_LOCATE" /* DECLICK_TO_LOCATE */:
        this._rollAfterLocate = false;
        break;
      case "WAITING_FOR_LOCATE" /* WAITING_FOR_LOCATE */:
        this._rollAfterLocate = false;
        break;
    }
  }
  handleLocate(event) {
    switch (this._motionState) {
      case "STOPPED" /* STOPPED */:
        this._pendingLocateTarget = event.target;
        this._rollAfterLocate = event.rollAfterLocate;
        this.locateRequested.emit(event.target);
        if (event.rollAfterLocate) {
          this.setMotionState("ROLLING" /* ROLLING */);
        }
        break;
      case "ROLLING" /* ROLLING */:
        this._pendingLocateTarget = event.target;
        this._rollAfterLocate = event.rollAfterLocate;
        this.setMotionState("DECLICK_TO_LOCATE" /* DECLICK_TO_LOCATE */);
        break;
      case "DECLICK_TO_STOP" /* DECLICK_TO_STOP */:
      case "DECLICK_TO_LOCATE" /* DECLICK_TO_LOCATE */:
        this._pendingLocateTarget = event.target;
        this._rollAfterLocate = event.rollAfterLocate;
        if (this._motionState === "DECLICK_TO_STOP" /* DECLICK_TO_STOP */) {
          this.setMotionState("DECLICK_TO_LOCATE" /* DECLICK_TO_LOCATE */);
        }
        break;
      case "WAITING_FOR_LOCATE" /* WAITING_FOR_LOCATE */:
        this._pendingLocateTarget = event.target;
        this._rollAfterLocate = event.rollAfterLocate;
        this.locateRequested.emit(event.target);
        break;
    }
  }
  handleDeclickDone() {
    switch (this._motionState) {
      case "DECLICK_TO_STOP" /* DECLICK_TO_STOP */:
        if (this._directionState === "REVERSING" /* REVERSING */ && this._pendingSpeed !== null) {
          this.applySpeed(this._pendingSpeed);
          this._pendingSpeed = null;
          this.setMotionState("ROLLING" /* ROLLING */);
        } else {
          this.setMotionState("STOPPED" /* STOPPED */);
        }
        break;
      case "DECLICK_TO_LOCATE" /* DECLICK_TO_LOCATE */:
        this.setMotionState("WAITING_FOR_LOCATE" /* WAITING_FOR_LOCATE */);
        this.locateRequested.emit(this._pendingLocateTarget);
        break;
      default:
        break;
    }
    this.processDeferredEvents();
  }
  handleSetSpeed(event) {
    const newSpeed = this.clampSpeed(event.speed);
    const oldSpeed = this._speed;
    if (newSpeed === oldSpeed) {
      return;
    }
    const signChanged = Math.sign(newSpeed) !== Math.sign(oldSpeed) && newSpeed !== 0 && oldSpeed !== 0;
    switch (this._motionState) {
      case "STOPPED" /* STOPPED */:
        this.applySpeed(newSpeed);
        break;
      case "ROLLING" /* ROLLING */:
        if (signChanged) {
          this._pendingSpeed = newSpeed;
          this._directionState = "REVERSING" /* REVERSING */;
          this.directionChanged.emit("REVERSING" /* REVERSING */);
          this.setMotionState("DECLICK_TO_STOP" /* DECLICK_TO_STOP */);
        } else {
          this.applySpeed(newSpeed);
        }
        break;
      case "DECLICK_TO_STOP" /* DECLICK_TO_STOP */:
      case "DECLICK_TO_LOCATE" /* DECLICK_TO_LOCATE */:
        this._pendingSpeed = newSpeed;
        break;
      case "WAITING_FOR_LOCATE" /* WAITING_FOR_LOCATE */:
        this.applySpeed(newSpeed);
        break;
    }
  }
  handleLocateComplete() {
    switch (this._motionState) {
      case "WAITING_FOR_LOCATE" /* WAITING_FOR_LOCATE */:
        if (this._rollAfterLocate) {
          this.setMotionState("ROLLING" /* ROLLING */);
        } else {
          this.setMotionState("STOPPED" /* STOPPED */);
        }
        break;
      default:
        break;
    }
  }
  // ─── Private: Helpers ───────────────────────────────────────────────────
  /**
   * Transition to a new motion state and emit the stateChanged signal.
   */
  setMotionState(newState) {
    if (this._motionState === newState) return;
    this._motionState = newState;
    this.stateChanged.emit(newState);
  }
  /**
   * Apply a speed value, updating direction state and emitting signals.
   */
  applySpeed(newSpeed) {
    this._speed = newSpeed;
    const newDirection = newSpeed >= 0 ? "FORWARDS" /* FORWARDS */ : "BACKWARDS" /* BACKWARDS */;
    if (this._directionState !== newDirection) {
      this._directionState = newDirection;
      this.directionChanged.emit(newDirection);
    }
    this.speedChanged.emit(newSpeed);
  }
  /**
   * Clamp a speed value to the valid range.
   * Absolute values below MIN_SPEED are snapped to zero.
   * Absolute values above MAX_SPEED are clamped.
   */
  clampSpeed(speed) {
    const absSpeed = Math.abs(speed);
    if (absSpeed < MIN_SPEED) {
      return 0;
    }
    if (absSpeed > MAX_SPEED) {
      return Math.sign(speed) * MAX_SPEED;
    }
    return speed;
  }
  /**
   * Process all deferred events that accumulated during a declick phase.
   * Events are processed in FIFO order.
   */
  processDeferredEvents() {
    const events = this._deferredEvents.slice();
    this._deferredEvents = [];
    for (const event of events) {
      this.enqueue(event);
    }
  }
};

// core/src/domain/SidechainConfig.ts
var SidechainConfig = class _SidechainConfig {
  constructor(id, targetTrackId, targetProcessorId) {
    this._sourceTrackId = null;
    this.enabled = false;
    /** Whether a high-pass filter is applied to the sidechain signal. */
    this._sidechainFilterEnabled = false;
    /** HPF cutoff frequency in Hz (20 - 500 Hz, default 80). */
    this._sidechainFilterFrequency = SIDECHAIN_FILTER_FREQ_DEFAULT;
    this.sourceChanged = new Signal();
    this.enabledChanged = new Signal();
    this.filterChanged = new Signal();
    this.id = id;
    this.targetTrackId = targetTrackId;
    this.targetProcessorId = targetProcessorId;
  }
  get sourceTrackId() {
    return this._sourceTrackId;
  }
  setSource(trackId) {
    if (this._sourceTrackId !== trackId) {
      this._sourceTrackId = trackId;
      this.sourceChanged.emit(trackId);
    }
  }
  setEnabled(enabled) {
    if (this.enabled !== enabled) {
      this.enabled = enabled;
      this.enabledChanged.emit(enabled);
    }
  }
  // ─── Sidechain Filter (HPF) ───────────────────────────────────────────────
  get sidechainFilterEnabled() {
    return this._sidechainFilterEnabled;
  }
  get sidechainFilterFrequency() {
    return this._sidechainFilterFrequency;
  }
  setSidechainFilter(enabled, frequency) {
    const freq = frequency !== void 0 ? Math.max(
      SIDECHAIN_FILTER_FREQ_MIN,
      Math.min(SIDECHAIN_FILTER_FREQ_MAX, frequency)
    ) : this._sidechainFilterFrequency;
    const changed = this._sidechainFilterEnabled !== enabled || this._sidechainFilterFrequency !== freq;
    this._sidechainFilterEnabled = enabled;
    this._sidechainFilterFrequency = freq;
    if (changed) {
      this.filterChanged.emit({ enabled, frequency: freq });
    }
  }
  toJSON() {
    return {
      id: this.id,
      targetTrackId: this.targetTrackId,
      targetProcessorId: this.targetProcessorId,
      sourceTrackId: this._sourceTrackId,
      enabled: this.enabled,
      sidechainFilterEnabled: this._sidechainFilterEnabled,
      sidechainFilterFrequency: this._sidechainFilterFrequency
    };
  }
  static fromJSON(data) {
    const config = new _SidechainConfig(
      data.id,
      data.targetTrackId,
      data.targetProcessorId
    );
    config._sourceTrackId = data.sourceTrackId;
    config.enabled = data.enabled;
    config._sidechainFilterEnabled = data.sidechainFilterEnabled ?? false;
    config._sidechainFilterFrequency = data.sidechainFilterFrequency ?? SIDECHAIN_FILTER_FREQ_DEFAULT;
    return config;
  }
};
var SIDECHAIN_FILTER_FREQ_MIN = 20;
var SIDECHAIN_FILTER_FREQ_MAX = 500;
var SIDECHAIN_FILTER_FREQ_DEFAULT = 80;

// core/src/domain/Take.ts
var Take = class _Take {
  constructor(id, takeNumber, regionId, trackId, startFrame, endFrame) {
    this.selected = false;
    this.selectionChanged = new Signal();
    this.id = id;
    this.takeNumber = takeNumber;
    this.regionId = regionId;
    this.trackId = trackId;
    this.startFrame = startFrame;
    this.endFrame = endFrame;
    this.timestamp = Date.now();
  }
  get duration() {
    return this.endFrame - this.startFrame;
  }
  setSelected(selected) {
    if (this.selected !== selected) {
      this.selected = selected;
      this.selectionChanged.emit(selected);
    }
  }
  toJSON() {
    return {
      id: this.id,
      takeNumber: this.takeNumber,
      regionId: this.regionId,
      trackId: this.trackId,
      startFrame: this.startFrame,
      endFrame: this.endFrame,
      selected: this.selected,
      timestamp: this.timestamp
    };
  }
  static fromJSON(data) {
    const take = new _Take(
      data.id,
      data.takeNumber,
      data.regionId,
      data.trackId,
      data.startFrame,
      data.endFrame
    );
    take.selected = data.selected;
    return take;
  }
};
var TakeLane = class {
  constructor(id, trackId) {
    this._takes = [];
    this.takeAdded = new Signal();
    this.takeRemoved = new Signal();
    this.activeChanged = new Signal();
    this.id = id;
    this.trackId = trackId;
  }
  addTake(take) {
    this._takes.push(take);
    this.takeAdded.emit(take);
  }
  removeTake(takeId) {
    this._takes = this._takes.filter((t) => t.id !== takeId);
    this.takeRemoved.emit(takeId);
  }
  getTake(takeId) {
    return this._takes.find((t) => t.id === takeId);
  }
  get takes() {
    return this._takes;
  }
  get takeCount() {
    return this._takes.length;
  }
  /**
   * Select a specific take (deselects all others).
   */
  selectTake(takeId) {
    let activeTake = null;
    for (const take of this._takes) {
      const shouldSelect = take.id === takeId;
      take.setSelected(shouldSelect);
      if (shouldSelect) activeTake = take;
    }
    this.activeChanged.emit(activeTake);
  }
  /**
   * Get the currently selected (active) take.
   */
  getActiveTake() {
    return this._takes.find((t) => t.selected);
  }
  /**
   * Comp: merge selected portions from multiple takes into one.
   * Returns the regionIds of selected takes.
   */
  getSelectedTakeRegionIds() {
    return this._takes.filter((t) => t.selected).map((t) => t.regionId);
  }
};

// core/src/lib/DisposableGroup.ts
var DisposableGroup = class {
  constructor() {
    this._disposables = [];
    this._disposed = false;
  }
  /** Number of active subscriptions. */
  get size() {
    return this._disposables.length;
  }
  /** Whether this group has already been disposed. */
  get disposed() {
    return this._disposed;
  }
  /**
   * Add a disposable to the group.
   * If the group is already disposed, the disposable is immediately disposed.
   */
  add(disposable) {
    if (this._disposed) {
      disposable.dispose();
      return;
    }
    this._disposables.push(disposable);
  }
  /**
   * Dispose all collected subscriptions and prevent further additions.
   * Safe to call multiple times.
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    const disposables = this._disposables;
    this._disposables = [];
    for (const d of disposables) {
      d.dispose();
    }
  }
};

// core/src/domain/TrackGroupLinkingService.ts
var TrackGroupLinkingService = class {
  constructor(session) {
    this._trackSubs = /* @__PURE__ */ new Map();
    this._propagating = false;
    this._session = session;
    for (const track of session.tracks) {
      this.subscribeTrack(track);
    }
    session.trackAdded.connect((track) => this.subscribeTrack(track));
    session.trackRemoved.connect(
      (trackId) => this.unsubscribeTrack(trackId)
    );
  }
  dispose() {
    for (const subs of this._trackSubs.values()) {
      subs.dispose();
    }
    this._trackSubs.clear();
  }
  subscribeTrack(track) {
    const group = new DisposableGroup();
    group.add(
      track.muteChanged.connect((muted) => {
        this.propagate(track.id, "mute", () => {
          this.forEachLinkedSibling(track.id, "mute", (sibling) => {
            sibling.setMute(muted);
          });
        });
      })
    );
    group.add(
      track.soloChanged.connect((soloed) => {
        this.propagate(track.id, "solo", () => {
          this.forEachLinkedSibling(track.id, "solo", (sibling) => {
            sibling.setSolo(soloed);
          });
        });
      })
    );
    group.add(
      track.colorChanged.connect((color) => {
        this.propagate(track.id, "color", () => {
          this.forEachLinkedSibling(track.id, "color", (sibling) => {
            sibling.setColor(color);
          });
        });
      })
    );
    group.add(
      track.route.fader.gainChanged.connect((db) => {
        this.propagate(track.id, "gain", () => {
          this.forEachLinkedSibling(track.id, "gain", (sibling) => {
            sibling.route.volume = db;
          });
        });
      })
    );
    this._trackSubs.set(track.id, group);
  }
  unsubscribeTrack(trackId) {
    const subs = this._trackSubs.get(trackId);
    if (subs) {
      subs.dispose();
      this._trackSubs.delete(trackId);
    }
  }
  /**
   * Execute `fn` only if we are not already inside a propagation cycle.
   */
  propagate(_sourceTrackId, _property, fn) {
    if (this._propagating) return;
    this._propagating = true;
    try {
      fn();
    } finally {
      this._propagating = false;
    }
  }
  /**
   * Call `fn` for every sibling track in the same TrackGroup that has
   * the specified property linked.
   */
  forEachLinkedSibling(trackId, property, fn) {
    const group = this._session.getTrackGroupForTrack(trackId);
    if (!group) return;
    const linked = this.isLinked(group, property);
    if (!linked) return;
    for (const memberId of group.memberTrackIds) {
      if (memberId === trackId) continue;
      const sibling = this._session.getTrack(memberId);
      if (sibling) fn(sibling);
    }
  }
  isLinked(group, property) {
    switch (property) {
      case "gain":
        return group.gainLinked;
      case "mute":
        return group.muteLinked;
      case "solo":
        return group.soloLinked;
      case "color":
        return group.colorLinked;
    }
  }
};

// core/src/utils/Logger.ts
var Logger = class {
  constructor() {
    this.level = 2 /* WARN */;
  }
  setLevel(level) {
    this.level = level;
  }
  getLevel() {
    return this.level;
  }
  debug(tag, ...args) {
    if (this.level <= 0 /* DEBUG */) console.debug(`[${tag}]`, ...args);
  }
  info(tag, ...args) {
    if (this.level <= 1 /* INFO */) console.info(`[${tag}]`, ...args);
  }
  warn(tag, ...args) {
    if (this.level <= 2 /* WARN */) console.warn(`[${tag}]`, ...args);
  }
  error(tag, ...args) {
    if (this.level <= 3 /* ERROR */) console.error(`[${tag}]`, ...args);
  }
};
var logger = new Logger();

// core/src/domain/Session.ts
var Session = class _Session {
  constructor(name, id, sampleRate = 44100) {
    // Transport State
    this.tempo = 120;
    this.timeSignature = [4, 4];
    this.timecodeFps = 30;
    this.transportFrame = 0;
    this.recordingStartFrame = 0;
    /**
     * Transport Finite State Machine.
     * Manages transport motion state (stopped/rolling/declick), direction,
     * and variable-speed playback. See TransportFSM.ts for full documentation.
     */
    this.transportFSM = new TransportFSM();
    /**
     * Backwards-compatible `isPlaying` accessor.
     * Delegates to `transportFSM.isRolling()` for reads.
     * Writing `true` enqueues a StartTransport event;
     * writing `false` triggers an immediate stop (for legacy callers
     * like AudioEngine.pause that bypass the FSM lifecycle).
     */
    this._isPlaying = false;
    this.loopEnabled = false;
    this.punchEnabled = false;
    // Loop Recording
    this.loopRecordingEnabled = false;
    this.loopRecordingTakeCount = 0;
    // Pre-roll / Count-in
    this.preRollBars = 0;
    // Editing Mode
    this.rippleEdit = false;
    // Structure
    this._tracks = /* @__PURE__ */ new Map();
    this._ranges = /* @__PURE__ */ new Map();
    this._sendBuses = /* @__PURE__ */ new Map();
    this._markers = /* @__PURE__ */ new Map();
    this._markerChangeSubscriptions = /* @__PURE__ */ new Map();
    this._regionGroups = /* @__PURE__ */ new Map();
    // Selection State
    this._selectedRegionIds = /* @__PURE__ */ new Set();
    this.selectionChanged = new Signal();
    // Region Group Selection
    /** When true, selecting a region auto-selects its group members. */
    this.groupSelectEnabled = true;
    /** Reverse index: RegionId → RegionGroupId for O(1) lookup. */
    this._regionToGroupIndex = /* @__PURE__ */ new Map();
    // Signals
    this.trackAdded = new Signal();
    this.trackRemoved = new Signal();
    this.rangeAdded = new Signal();
    this.rangeRemoved = new Signal();
    this.loopRangeChanged = new Signal();
    this.loopEnabledChanged = new Signal();
    this.punchRangeChanged = new Signal();
    this.punchEnabledChanged = new Signal();
    this.playingChanged = new Signal();
    this.recordingChanged = new Signal();
    this.loopRecordingChanged = new Signal();
    this.preRollChanged = new Signal();
    this.metronomeChanged = new Signal();
    this.metronomeVolumeChanged = new Signal();
    this.transportPositionChanged = new Signal();
    this.tempoChanged = new Signal();
    this.timeSignatureChanged = new Signal();
    this.sendBusAdded = new Signal();
    this.sendBusRemoved = new Signal();
    this.markerAdded = new Signal();
    this.markerRemoved = new Signal();
    this.markerChanged = new Signal();
    this.trackReordered = new Signal();
    this.rippleEditChanged = new Signal();
    this.regionGroupAdded = new Signal();
    this.regionGroupRemoved = new Signal();
    this.isRecording = false;
    this.metronomeEnabled = false;
    this.metronomeVolume = 1;
    // Grid & Snap settings
    this.gridSettings = new GridSettings();
    // Mixer Scenes
    this.mixerSceneManager = new MixerSceneManager();
    // Track Groups (Phase 10)
    this._trackGroups = /* @__PURE__ */ new Map();
    this.trackGroupAdded = new Signal();
    this.trackGroupRemoved = new Signal();
    // CD Markers (Phase 12)
    this._cdMarkers = /* @__PURE__ */ new Map();
    this.cdMarkerAdded = new Signal();
    this.cdMarkerRemoved = new Signal();
    // VCA Tracks (Phase 10-4)
    this._vcaTracks = /* @__PURE__ */ new Map();
    this.vcaTrackAdded = new Signal();
    this.vcaTrackRemoved = new Signal();
    // Scrub/Shuttle (Phase 10-2)
    this.scrubState = new ScrubState();
    // Sidechain Configs (Phase 12-3)
    this._sidechainConfigs = /* @__PURE__ */ new Map();
    this._sidechainSubscriptions = /* @__PURE__ */ new Map();
    this.sidechainConfigChanged = new Signal();
    // ── Latency Compensation ────────────────────────────────────────────────
    /**
     * Emitted after {@link computeLatencyCompensation} recalculates the
     * per-route compensation delays for the session.
     */
    this.latencyCompensationChanged = new Signal();
    /** Disposers for per-route latencyChanged subscriptions. */
    this._routeLatencySubs = /* @__PURE__ */ new Map();
    // Take Lanes (Phase 9-4)
    this._takeLanes = /* @__PURE__ */ new Map();
    // Track Group Linking (mute/solo/gain/color propagation)
    this._linkingService = null;
    // Source Management
    this._sources = /* @__PURE__ */ new Map();
    this.sourceAdded = new Signal();
    this.id = id || crypto.randomUUID();
    this.name = name;
    this.sampleRate = sampleRate;
    this.gridSettings = new GridSettings(void 0, void 0, this.tempo);
    this.gridSettings.setTimeSignature(
      this.timeSignature[0],
      this.timeSignature[1]
    );
    this.tempoMap = new TempoMap(sampleRate);
    this.masterBus = new Route(crypto.randomUUID(), "Master");
    this.transportFSM.stateChanged.connect((state) => {
      const rolling = state === "ROLLING" /* ROLLING */;
      if (this._isPlaying !== rolling) {
        this._isPlaying = rolling;
        this.playingChanged.emit(rolling);
      }
    });
    this.transportFSM.locateRequested.connect((frame) => {
      this.locateTransport(frame);
    });
    this._subscribeToRouteLatency(this.masterBus);
    this._linkingService = new TrackGroupLinkingService(this);
  }
  get isPlaying() {
    return this._isPlaying;
  }
  set isPlaying(value) {
    if (this._isPlaying !== value) {
      this._isPlaying = value;
      this.playingChanged.emit(value);
    }
  }
  addTrack(name, type = "AUDIO" /* AUDIO */, id) {
    const trackId = id || crypto.randomUUID();
    const track = new Track(trackId, name, type);
    this._tracks.set(trackId, track);
    this._subscribeToRouteLatency(track.route);
    this.trackAdded.emit(track);
    return track;
  }
  addAuxTrack(name, id) {
    return this.addTrack(name, "AUX" /* AUX */, id);
  }
  addBusTrack(name, id) {
    return this.addTrack(name, "BUS" /* BUS */, id);
  }
  removeTrack(id) {
    if (this._tracks.has(id)) {
      const track = this._tracks.get(id);
      this._unsubscribeFromRouteLatency(track.route.id);
      this._tracks.delete(id);
      this.trackRemoved.emit(id);
    }
  }
  getTrack(id) {
    return this._tracks.get(id);
  }
  get tracks() {
    return Array.from(this._tracks.values());
  }
  // Range Management
  addRange(name, start, end, id, color) {
    const rangeId = id || crypto.randomUUID();
    const range = new Range(rangeId, name, start, end, color);
    this._ranges.set(rangeId, range);
    this.rangeAdded.emit(range);
    return range;
  }
  removeRange(id) {
    const range = this._ranges.get(id);
    if (range) {
      range.removed.emit();
      this._ranges.delete(id);
      this.rangeRemoved.emit(id);
    }
  }
  getRange(id) {
    return this._ranges.get(id);
  }
  getRangeByName(name) {
    return Array.from(this._ranges.values()).find((r) => r.name === name);
  }
  get ranges() {
    return Array.from(this._ranges.values());
  }
  // Loop Range Management
  setLoopRange(rangeId) {
    const range = this.getRange(rangeId);
    if (!range) {
      throw new Error(`Range not found: ${rangeId}`);
    }
    this.loopRangeId = rangeId;
    this.loopRangeChanged.emit(rangeId);
  }
  clearLoopRange() {
    this.loopRangeId = void 0;
    this.loopEnabled = false;
    this.loopRangeChanged.emit(void 0);
    this.loopEnabledChanged.emit(false);
  }
  getLoopRange() {
    return this.loopRangeId ? this.getRange(this.loopRangeId) : void 0;
  }
  setLoopEnabled(enabled) {
    if (!this.loopRangeId && enabled) {
      throw new Error("Cannot enable loop without setting loop range first");
    }
    this.loopEnabled = enabled;
    this.loopEnabledChanged.emit(enabled);
  }
  toggleLoop() {
    if (this.loopRangeId) {
      this.setLoopEnabled(!this.loopEnabled);
    }
  }
  // Punch Range Management
  setPunchRange(rangeId) {
    const range = this.getRange(rangeId);
    if (!range) {
      throw new Error(`Range not found: ${rangeId}`);
    }
    this.punchRangeId = rangeId;
    this.punchRangeChanged.emit(rangeId);
  }
  clearPunchRange() {
    this.punchRangeId = void 0;
    this.punchRangeChanged.emit(void 0);
  }
  getPunchRange() {
    return this.punchRangeId ? this.getRange(this.punchRangeId) : void 0;
  }
  setPunchEnabled(enabled) {
    if (!this.punchRangeId && enabled) {
      throw new Error("Cannot enable punch without setting punch range first");
    }
    this.punchEnabled = enabled;
    this.punchEnabledChanged.emit(enabled);
  }
  // Loop Recording
  setLoopRecording(enabled) {
    this.loopRecordingEnabled = enabled;
    if (!enabled) {
      this.loopRecordingTakeCount = 0;
    }
    this.loopRecordingChanged.emit(enabled);
  }
  incrementTakeCount() {
    this.loopRecordingTakeCount++;
    return this.loopRecordingTakeCount;
  }
  // Pre-roll / Count-in
  setPreRollBars(bars) {
    this.preRollBars = Math.max(0, Math.floor(bars));
    this.preRollChanged.emit(this.preRollBars);
  }
  /**
   * Calculate pre-roll duration in seconds based on current tempo and time signature.
   */
  getPreRollDurationSeconds() {
    if (this.preRollBars <= 0) return 0;
    const beatsPerBar = this.timeSignature[0];
    const totalBeats = this.preRollBars * beatsPerBar;
    const secondsPerBeat = 60 / this.tempo;
    return totalBeats * secondsPerBeat;
  }
  /**
   * Calculate pre-roll duration in frames.
   */
  getPreRollDurationFrames() {
    return Math.floor(this.getPreRollDurationSeconds() * this.sampleRate);
  }
  // Transport Control (Domain Level)
  // These methods only update the 'Truth' state.
  // The AudioProvider will observe these changes.
  setTempo(bpm) {
    if (bpm <= 0 || bpm === this.tempo) return;
    logger.debug(
      "Session.setTempo",
      `Changing tempo from ${this.tempo} to ${bpm}`
    );
    const oldBpm = this.tempo;
    const ratio = bpm / oldBpm;
    this.tempo = bpm;
    this.gridSettings.setBPM(bpm);
    this.tracks.forEach((track) => {
      const regions = track.playlist.getRegions();
      logger.debug(
        "Session.setTempo",
        `Track ${track.name} has ${regions.length} region(s)`
      );
      regions.forEach((region) => {
        logger.debug(
          "Session.setTempo",
          `Region "${region.name}": timeDomain=${region.timeDomain} (0=Audio, 1=Beat)`
        );
        if (region.timeDomain === 1 /* BeatTime */) {
          logger.debug(
            "Session.setTempo",
            `Updating Musical Mode region "${region.name}"`
          );
          const startBeats = this.tempoMap.framesToBeats(region.start, oldBpm);
          const lengthBeats = this.tempoMap.framesToBeats(
            region.length,
            oldBpm
          );
          logger.debug(
            "Session.setTempo",
            `- Old: start=${region.start} frames, length=${region.length} frames`
          );
          logger.debug(
            "Session.setTempo",
            `- Beats: start=${startBeats.toNumber()}, length=${lengthBeats.toNumber()}`
          );
          const newStart = this.tempoMap.beatsToFrames(startBeats, bpm);
          const newLength = this.tempoMap.beatsToFrames(lengthBeats, bpm);
          logger.debug(
            "Session.setTempo",
            `- New: start=${newStart} frames, length=${newLength} frames`
          );
          logger.debug("Session.setTempo", `- Playback rate: ${ratio}`);
          region.move(newStart);
          region.resize(newLength);
          region.playbackRate = ratio;
          logger.debug(
            "Session.setTempo",
            `Emitting regionChanged signal for "${region.name}"`
          );
          track.playlist.regionChanged.emit(region);
        } else {
          logger.debug(
            "Session.setTempo",
            `Skipping Audio Mode region "${region.name}" (stays fixed)`
          );
        }
      });
    });
    logger.debug(
      "Session.setTempo",
      `Emitting tempoChanged signal with bpm=${bpm}`
    );
    this.tempoChanged.emit(bpm);
  }
  setTimeSignature(numerator, denominator) {
    if (numerator > 0 && denominator > 0) {
      this.timeSignature = [numerator, denominator];
      this.gridSettings.setTimeSignature(numerator, denominator);
      this.timeSignatureChanged.emit(this.timeSignature);
    }
  }
  startTransport() {
    this.transportFSM.enqueue({ type: "StartTransport" });
    this.isPlaying = true;
  }
  stopTransport() {
    this.transportFSM.enqueue({ type: "StopTransport" });
  }
  /** AudioProvider가 실제 정지를 끝낸 뒤 transport 전환을 완료한다. */
  completeTransportStop() {
    this.transportFrame = 0;
    this.transportPositionChanged.emit(0);
    this.transportFSM.enqueue({ type: "DeclickDone" });
  }
  locateTransport(frame) {
    this.transportFrame = frame;
    this.transportPositionChanged.emit(frame);
  }
  /**
   * Locate via the FSM with proper declick handling.
   * Use this when you want declick-aware relocation (e.g. from the timeline ruler).
   *
   * @param frame Target frame position.
   * @param rollAfterLocate Whether to resume playback after the locate completes.
   */
  locateTransportViaFSM(frame, rollAfterLocate = false) {
    this.transportFSM.enqueue({
      type: "Locate",
      target: frame,
      rollAfterLocate
    });
  }
  /**
   * Get the current playback speed from the transport FSM.
   * Positive = forward, negative = reverse.
   * Range: -8.0 to +8.0 (absolute minimum 0.0625 when non-zero).
   */
  getSpeed() {
    return this.transportFSM.getSpeed();
  }
  /**
   * Set the playback speed via the transport FSM.
   * If the sign changes while rolling, the FSM will handle
   * the declick and direction reversal automatically.
   *
   * @param speed Desired speed. Negative = reverse. Range: -8.0 to +8.0.
   */
  setSpeed(speed) {
    this.transportFSM.setSpeed(speed);
  }
  startRecording() {
    this.isRecording = true;
    this.recordingStartFrame = this.transportFrame;
    this.recordingChanged.emit(true);
    this.startTransport();
  }
  stopRecording() {
    this.isRecording = false;
    this.recordingChanged.emit(false);
    this.stopTransport();
  }
  // Metronome
  toggleMetronome() {
    this.metronomeEnabled = !this.metronomeEnabled;
    this.metronomeChanged.emit(this.metronomeEnabled);
  }
  setMetronomeVolume(volume) {
    this.metronomeVolume = Math.max(0, Math.min(1, volume));
    this.metronomeVolumeChanged.emit(this.metronomeVolume);
  }
  addSource(source) {
    if (!this._sources.has(source.id)) {
      this._sources.set(source.id, source);
      this.sourceAdded.emit(source);
    }
  }
  removeSource(id) {
    if (this._sources.has(id)) {
      this._sources.delete(id);
    }
  }
  getSource(id) {
    return this._sources.get(id);
  }
  get sources() {
    return this._sources;
  }
  getIO(id) {
    if (this.masterBus.input.id === id) return this.masterBus.input;
    if (this.masterBus.output.id === id) return this.masterBus.output;
    for (const track of this._tracks.values()) {
      if (track.route.input.id === id) return track.route.input;
      if (track.route.output.id === id) return track.route.output;
    }
    return void 0;
  }
  getExportConfig() {
    if (!this._exportConfig) {
      this._exportConfig = new ExportConfig();
      this._exportConfig.sampleRate = this.sampleRate;
    }
    return this._exportConfig;
  }
  getExportStatus() {
    if (!this._exportStatus) {
      this._exportStatus = new ExportStatus();
    }
    return this._exportStatus;
  }
  getSessionDuration() {
    let maxEnd = 0;
    this.tracks.forEach((track) => {
      track.playlist.getRegions().forEach((region) => {
        maxEnd = Math.max(maxEnd, region.end);
      });
      track.playlist.getMidiRegions().forEach((midiRegion) => {
        maxEnd = Math.max(maxEnd, midiRegion.end);
      });
    });
    return maxEnd;
  }
  // Region Selection
  selectRegion(regionId, addToSelection = false) {
    if (!addToSelection) {
      this._selectedRegionIds.clear();
    }
    const expanded = this.expandSelection([regionId]);
    for (const id of expanded) {
      this._selectedRegionIds.add(id);
    }
    this.selectionChanged.emit(new Set(this._selectedRegionIds));
  }
  selectRegions(regionIds, addToSelection = false) {
    if (!addToSelection) {
      this._selectedRegionIds.clear();
    }
    const expanded = this.expandSelection(regionIds);
    for (const id of expanded) {
      this._selectedRegionIds.add(id);
    }
    this.selectionChanged.emit(new Set(this._selectedRegionIds));
  }
  deselectRegion(regionId) {
    this._selectedRegionIds.delete(regionId);
    this.selectionChanged.emit(new Set(this._selectedRegionIds));
  }
  clearSelection() {
    this._selectedRegionIds.clear();
    this.selectionChanged.emit(new Set(this._selectedRegionIds));
  }
  getSelectedRegionIds() {
    return this._selectedRegionIds;
  }
  isRegionSelected(regionId) {
    return this._selectedRegionIds.has(regionId);
  }
  // ─── Region Group Selection Expansion ────────────────────────────────────
  /**
   * Find the track that owns a region. Returns undefined if not found.
   */
  findTrackForRegion(regionId) {
    for (const track of this._tracks.values()) {
      if (track.playlist.getRegion(regionId)) return track;
    }
    return void 0;
  }
  /**
   * Expand a set of region IDs by including group members.
   *
   * Tier 1 — Explicit: regions in the same RegionGroup.
   * Tier 2 — Implicit: equivalent regions on sibling tracks in the same
   *          TrackGroup (when regionSelectLinked is enabled).
   */
  expandSelection(regionIds) {
    if (!this.groupSelectEnabled) return regionIds;
    const result = new Set(regionIds);
    for (const regionId of regionIds) {
      const groupId = this._regionToGroupIndex.get(regionId);
      if (groupId) {
        const group = this._regionGroups.get(groupId);
        if (group) {
          for (const rid of group.getRegionIds()) {
            result.add(rid);
          }
        }
      }
      const track = this.findTrackForRegion(regionId);
      if (!track) continue;
      const trackGroup = this.getTrackGroupForTrack(track.id);
      if (!trackGroup || !trackGroup.regionSelectLinked) continue;
      const region = track.playlist.getRegion(regionId);
      if (!region) continue;
      for (const siblingTrackId of trackGroup.memberTrackIds) {
        if (siblingTrackId === track.id) continue;
        const siblingTrack = this.getTrack(siblingTrackId);
        if (!siblingTrack) continue;
        for (const siblingRegion of siblingTrack.playlist.getRegions()) {
          if (region.layerAndTimeEquivalent(siblingRegion)) {
            result.add(siblingRegion.id);
          }
        }
      }
    }
    return Array.from(result);
  }
  // ─── Send Bus Management ──────────────────────────────────────────────────
  addSendBus(sourceTrackId, destId, level = 0, preFader = false, id) {
    const sendBusId = id ?? crypto.randomUUID();
    const sendBus = new SendBus(
      sendBusId,
      sourceTrackId,
      destId,
      level,
      preFader
    );
    this._sendBuses.set(sendBusId, sendBus);
    this.sendBusAdded.emit(sendBus);
    return sendBus;
  }
  removeSendBus(sendBusId) {
    if (this._sendBuses.has(sendBusId)) {
      this._sendBuses.delete(sendBusId);
      this.sendBusRemoved.emit(sendBusId);
    }
  }
  getSendBus(sendBusId) {
    return this._sendBuses.get(sendBusId);
  }
  getSendBusesForTrack(sourceTrackId) {
    return Array.from(this._sendBuses.values()).filter(
      (sendBus) => sendBus.sourceTrackId === sourceTrackId
    );
  }
  get sendBuses() {
    return Array.from(this._sendBuses.values());
  }
  // ─── Marker Management ─────────────────────────────────────────────────────
  addMarker(name, position, color, id) {
    const markerId = id ?? crypto.randomUUID();
    const marker = new Marker(markerId, name, position, color);
    return this.registerMarker(marker, true);
  }
  removeMarker(markerId) {
    const marker = this._markers.get(markerId);
    if (marker) {
      marker.removed.emit();
      this._markerChangeSubscriptions.get(markerId)?.dispose();
      this._markerChangeSubscriptions.delete(markerId);
      this._markers.delete(markerId);
      this.markerRemoved.emit(markerId);
    }
  }
  registerMarker(marker, emitAdded) {
    this._markerChangeSubscriptions.get(marker.id)?.dispose();
    this._markers.set(marker.id, marker);
    this._markerChangeSubscriptions.set(
      marker.id,
      marker.changed.connect(() => {
        this.markerChanged.emit(marker);
      })
    );
    if (emitAdded) {
      this.markerAdded.emit(marker);
    }
    return marker;
  }
  getMarker(markerId) {
    return this._markers.get(markerId);
  }
  get markers() {
    return Array.from(this._markers.values()).sort(
      (a, b) => a.position - b.position
    );
  }
  /**
   * Find the next marker after the given position.
   */
  getNextMarker(position) {
    const sorted = this.markers;
    return sorted.find((m) => m.position > position);
  }
  /**
   * Find the previous marker before the given position.
   */
  getPreviousMarker(position) {
    const sorted = this.markers;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].position < position) return sorted[i];
    }
    return void 0;
  }
  // ─── Track Reorder ────────────────────────────────────────────────────────
  reorderTrack(trackId, newIndex) {
    const trackEntries = Array.from(this._tracks.entries());
    const currentIndex = trackEntries.findIndex(([id]) => id === trackId);
    if (currentIndex === -1) {
      throw new Error(`Track not found: ${trackId}`);
    }
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= trackEntries.length) newIndex = trackEntries.length - 1;
    if (currentIndex === newIndex) return;
    const [entry] = trackEntries.splice(currentIndex, 1);
    trackEntries.splice(newIndex, 0, entry);
    this._tracks.clear();
    for (const [id, track] of trackEntries) {
      this._tracks.set(id, track);
    }
    this.trackReordered.emit({ trackId, newIndex });
  }
  getTrackIndex(trackId) {
    const keys = Array.from(this._tracks.keys());
    return keys.indexOf(trackId);
  }
  // ─── Ripple Edit ──────────────────────────────────────────────────────────
  setRippleEdit(enabled) {
    if (this.rippleEdit === enabled) return;
    this.rippleEdit = enabled;
    this.rippleEditChanged.emit(enabled);
  }
  // ─── Region Grouping ────────────────────────────────────────────────────
  groupRegions(regionIds, name, id) {
    const groupId = id ?? crypto.randomUUID();
    const groupName = name ?? `Group ${this._regionGroups.size + 1}`;
    const group = new RegionGroup(groupId, groupName, regionIds);
    this._regionGroups.set(groupId, group);
    for (const rid of regionIds) {
      this._regionToGroupIndex.set(rid, groupId);
    }
    this.regionGroupAdded.emit(group);
    return groupId;
  }
  ungroupRegions(groupId) {
    const group = this._regionGroups.get(groupId);
    if (group) {
      for (const rid of group.getRegionIds()) {
        this._regionToGroupIndex.delete(rid);
      }
      this._regionGroups.delete(groupId);
      this.regionGroupRemoved.emit(groupId);
    }
  }
  getRegionGroup(groupId) {
    return this._regionGroups.get(groupId);
  }
  getRegionGroupForRegion(regionId) {
    const groupId = this._regionToGroupIndex.get(regionId);
    if (groupId) return this._regionGroups.get(groupId);
    return void 0;
  }
  get regionGroups() {
    return Array.from(this._regionGroups.values());
  }
  // ─── Track Groups ────────────────────────────────────────────────────────
  addTrackGroup(name, id) {
    const groupId = id ?? crypto.randomUUID();
    const group = new TrackGroup(groupId, name);
    this._trackGroups.set(groupId, group);
    this.trackGroupAdded.emit(group);
    return group;
  }
  removeTrackGroup(groupId) {
    const group = this._trackGroups.get(groupId);
    if (group) {
      for (const trackId of group.memberTrackIds) {
        const track = this.getTrack(trackId);
        if (track) track.groupId = null;
      }
      this._trackGroups.delete(groupId);
      this.trackGroupRemoved.emit(groupId);
    }
  }
  getTrackGroup(groupId) {
    return this._trackGroups.get(groupId);
  }
  getTrackGroupForTrack(trackId) {
    for (const group of this._trackGroups.values()) {
      if (group.hasMember(trackId)) return group;
    }
    return void 0;
  }
  get trackGroups() {
    return Array.from(this._trackGroups.values());
  }
  // ─── Folder Track Helpers ────────────────────────────────────────────────
  getChildTracks(parentId) {
    return this.tracks.filter((t) => t.parentTrackId === parentId);
  }
  setTrackParent(trackId, parentId) {
    const track = this.getTrack(trackId);
    if (track) {
      track.parentTrackId = parentId;
    }
  }
  // ─── VCA Tracks ──────────────────────────────────────────────────────────
  addVCATrack(name, id) {
    const vcaId = id ?? crypto.randomUUID();
    const vca = new VCATrack(vcaId, name);
    this._vcaTracks.set(vcaId, vca);
    this.vcaTrackAdded.emit(vca);
    return vca;
  }
  removeVCATrack(vcaId) {
    if (this._vcaTracks.has(vcaId)) {
      this._vcaTracks.delete(vcaId);
      this.vcaTrackRemoved.emit(vcaId);
    }
  }
  getVCATrack(vcaId) {
    return this._vcaTracks.get(vcaId);
  }
  get vcaTracks() {
    return Array.from(this._vcaTracks.values());
  }
  // ─── Sidechain Configs ──────────────────────────────────────────────────
  addSidechainConfig(targetTrackId, targetProcessorId, id) {
    const configId = id ?? crypto.randomUUID();
    const config = new SidechainConfig(
      configId,
      targetTrackId,
      targetProcessorId
    );
    this.registerSidechainConfig(config, true);
    return config;
  }
  removeSidechainConfig(configId) {
    if (!this._sidechainConfigs.delete(configId)) {
      return;
    }
    this._sidechainSubscriptions.get(configId)?.forEach((subscription) => subscription.dispose());
    this._sidechainSubscriptions.delete(configId);
    this.sidechainConfigChanged.emit();
  }
  getSidechainConfig(configId) {
    return this._sidechainConfigs.get(configId);
  }
  getSidechainConfigsForTrack(trackId) {
    return Array.from(this._sidechainConfigs.values()).filter(
      (c) => c.targetTrackId === trackId
    );
  }
  get sidechainConfigs() {
    return Array.from(this._sidechainConfigs.values());
  }
  registerSidechainConfig(config, emitChange) {
    this._sidechainConfigs.set(config.id, config);
    const notifyRoutingChange = () => {
      this.sidechainConfigChanged.emit();
    };
    this._sidechainSubscriptions.set(config.id, [
      config.sourceChanged.connect(notifyRoutingChange),
      config.enabledChanged.connect(notifyRoutingChange)
    ]);
    if (emitChange) {
      this.sidechainConfigChanged.emit();
    }
  }
  // ─── Latency Compensation ────────────────────────────────────────────────
  /**
   * Recompute per-route latency compensation for the entire session.
   *
   * Finds the maximum processor latency across every track route and the
   * master bus, then calls {@link Route.computeLatencyCompensation} on
   * each route so that they all align to the slowest path.
   *
   * This is automatically invoked when any route emits `latencyChanged`,
   * but can also be called manually after bulk route / processor changes.
   */
  computeLatencyCompensation() {
    const allRoutes = this._getAllRoutes();
    let maxLatency = 0;
    for (const route of allRoutes) {
      const lat = route.getProcessorLatency();
      if (lat > maxLatency) maxLatency = lat;
    }
    for (const route of allRoutes) {
      route.computeLatencyCompensation(maxLatency);
    }
    this.latencyCompensationChanged.emit();
  }
  /**
   * Subscribe to a route's {@link Route.latencyChanged} signal so that
   * global compensation is recalculated automatically.
   */
  _subscribeToRouteLatency(route) {
    const sub = route.latencyChanged.connect(() => {
      this.computeLatencyCompensation();
    });
    this._routeLatencySubs.set(route.id, sub);
  }
  /**
   * Unsubscribe from a route's latency-changed signal.
   */
  _unsubscribeFromRouteLatency(routeId) {
    const sub = this._routeLatencySubs.get(routeId);
    if (sub) {
      sub.dispose();
      this._routeLatencySubs.delete(routeId);
    }
  }
  /**
   * Collect every Route in the session (track routes + master bus).
   */
  _getAllRoutes() {
    const routes = [this.masterBus];
    for (const track of this._tracks.values()) {
      routes.push(track.route);
    }
    return routes;
  }
  // ─── Take Lanes ─────────────────────────────────────────────────────────
  addTakeLane(trackId, id) {
    const laneId = id ?? crypto.randomUUID();
    const lane = new TakeLane(laneId, trackId);
    this._takeLanes.set(laneId, lane);
    return lane;
  }
  removeTakeLane(laneId) {
    this._takeLanes.delete(laneId);
  }
  getTakeLane(laneId) {
    return this._takeLanes.get(laneId);
  }
  getTakeLanesForTrack(trackId) {
    return Array.from(this._takeLanes.values()).filter(
      (l) => l.trackId === trackId
    );
  }
  // ─── CD Markers ─────────────────────────────────────────────────────────
  addCDMarker(index, title, position, performer, isrc, id) {
    const markerId = id ?? crypto.randomUUID();
    const marker = new CDMarker(
      markerId,
      index,
      title,
      position,
      performer,
      isrc
    );
    this._cdMarkers.set(markerId, marker);
    this.cdMarkerAdded.emit(marker);
    return marker;
  }
  removeCDMarker(markerId) {
    if (this._cdMarkers.has(markerId)) {
      this._cdMarkers.delete(markerId);
      this.cdMarkerRemoved.emit(markerId);
    }
  }
  getCDMarker(markerId) {
    return this._cdMarkers.get(markerId);
  }
  get cdMarkers() {
    return Array.from(this._cdMarkers.values()).sort(
      (a, b) => a.index - b.index
    );
  }
  // ─── Serialization ────────────────────────────────────────────────────────
  /**
   * 세션 전체 상태를 JSON-직렬화 가능한 객체로 변환합니다.
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      sampleRate: this.sampleRate,
      tempo: this.tempo,
      timeSignature: this.timeSignature,
      transportFrame: this.transportFrame,
      tracks: this.tracks.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        armed: t.armed,
        mute: t.mute,
        solo: t.solo,
        color: t.color,
        soloIsolate: t.soloIsolate,
        soloSafe: t.soloSafe,
        monitorMode: t.monitorMode,
        trimGain: t.trimGain,
        comment: t.comment,
        recordMode: t.recordMode,
        regions: t.playlist.getRegions().map((r) => ({
          id: r.id,
          sourceId: r.sourceId,
          name: r.name,
          start: r.start,
          length: r.length,
          sourceStart: r.sourceStart,
          gain: r.gain,
          muted: r.muted,
          layer: r.layer,
          opaque: r.opaque,
          fadeIn: r.fadeIn,
          fadeOut: r.fadeOut,
          playbackRate: r.playbackRate,
          timeDomain: r.timeDomain,
          locked: r.locked
        })),
        midiRegions: t.playlist.getMidiRegions().map((mr) => mr.toJSON())
      })),
      ranges: Array.from(this._ranges.values()).map((r) => ({
        id: r.id,
        name: r.name,
        start: r.start,
        end: r.end
      })),
      sendBuses: Array.from(this._sendBuses.values()).map((sb) => ({
        id: sb.id,
        sourceTrackId: sb.sourceTrackId,
        destId: sb.destId,
        level: sb.level,
        preFader: sb.preFader,
        active: sb.active
      })),
      markers: Array.from(this._markers.values()).map((m) => ({
        id: m.id,
        name: m.name,
        position: m.position,
        color: m.color,
        locked: m.locked
      })),
      loopRangeId: this.loopRangeId,
      loopEnabled: this.loopEnabled,
      punchRangeId: this.punchRangeId,
      punchEnabled: this.punchEnabled,
      preRollBars: this.preRollBars,
      loopRecordingEnabled: this.loopRecordingEnabled,
      rippleEdit: this.rippleEdit,
      regionGroups: Array.from(this._regionGroups.values()).map((g) => ({
        id: g.id,
        name: g.name,
        regionIds: g.getRegionIds()
      })),
      tempoMapEvents: this.tempoMap.getAllEvents().map((e) => ({
        frame: e.frame,
        bpm: e.bpm,
        timeSigNum: e.timeSigNum,
        timeSigDen: e.timeSigDen
      })),
      mixerScenes: this.mixerSceneManager.toJSON(),
      trackGroups2: Array.from(this._trackGroups.values()).map(
        (g) => g.toJSON()
      ),
      cdMarkers: Array.from(this._cdMarkers.values()).map((m) => m.toJSON()),
      vcaTracks: Array.from(this._vcaTracks.values()).map((v) => v.toJSON()),
      sidechainConfigs: Array.from(this._sidechainConfigs.values()).map(
        (c) => c.toJSON()
      ),
      takeLanes: Array.from(this._takeLanes.values()).map((lane) => ({
        id: lane.id,
        trackId: lane.trackId,
        takes: lane.takes.map((t) => t.toJSON())
      }))
    };
  }
  /**
   * JSON 스냅샷으로부터 Session을 복원합니다.
   * 트랙, 리전, Range, SendBus를 복원하지만 Signal 연결(AudioEngine)은 별도로 처리해야 합니다.
   */
  static fromJSON(snapshot) {
    const session = new _Session(
      snapshot.name,
      snapshot.id,
      snapshot.sampleRate
    );
    session.tempo = snapshot.tempo;
    session.timeSignature = snapshot.timeSignature;
    session.transportFrame = snapshot.transportFrame;
    for (const trackData of snapshot.tracks) {
      const track = session.addTrack(
        trackData.name,
        trackData.type,
        trackData.id
      );
      track.armed = trackData.armed;
      track.mute = trackData.mute;
      track.solo = trackData.solo;
      if (trackData.color) track.color = trackData.color;
      if (trackData.soloIsolate) track.setSoloIsolate(trackData.soloIsolate);
      if (trackData.soloSafe) track.setSoloSafe(trackData.soloSafe);
      if (trackData.monitorMode)
        track.setMonitorMode(trackData.monitorMode);
      if (trackData.trimGain !== void 0)
        track.setTrimGain(trackData.trimGain);
      if (trackData.comment !== void 0) track.comment = trackData.comment;
      if (trackData.recordMode !== void 0) {
        track.setRecordMode(trackData.recordMode);
      }
      for (const regionData of trackData.regions) {
        const region = new Region(
          regionData.id,
          regionData.sourceId,
          regionData.start,
          regionData.length,
          regionData.sourceStart,
          regionData.name,
          regionData.layer
        );
        region.gain = regionData.gain;
        region.muted = regionData.muted;
        region.opaque = regionData.opaque ?? true;
        region.fadeIn = regionData.fadeIn;
        region.fadeOut = regionData.fadeOut;
        region.playbackRate = regionData.playbackRate;
        region.timeDomain = regionData.timeDomain;
        if (regionData.locked) region.locked = regionData.locked;
        track.playlist.addRegion(region);
      }
      if (trackData.midiRegions) {
        for (const midiRegionData of trackData.midiRegions) {
          const midiRegion = MidiRegion.fromJSON(midiRegionData);
          track.playlist.addMidiRegion(midiRegion);
        }
      }
    }
    for (const rangeData of snapshot.ranges) {
      const range = new Range(
        rangeData.id,
        rangeData.name,
        rangeData.start,
        rangeData.end
      );
      session._ranges.set(range.id, range);
    }
    for (const sbData of snapshot.sendBuses) {
      const sb = new SendBus(
        sbData.id,
        sbData.sourceTrackId,
        sbData.destId,
        sbData.level,
        sbData.preFader
      );
      session._sendBuses.set(sb.id, sb);
    }
    if (snapshot.markers) {
      for (const markerData of snapshot.markers) {
        const marker = new Marker(
          markerData.id,
          markerData.name,
          markerData.position,
          markerData.color,
          markerData.locked
        );
        session.registerMarker(marker, false);
      }
    }
    session.loopRangeId = snapshot.loopRangeId;
    session.loopEnabled = snapshot.loopEnabled;
    session.punchRangeId = snapshot.punchRangeId;
    session.punchEnabled = snapshot.punchEnabled ?? false;
    session.preRollBars = snapshot.preRollBars ?? 0;
    session.loopRecordingEnabled = snapshot.loopRecordingEnabled ?? false;
    session.rippleEdit = snapshot.rippleEdit ?? false;
    if (snapshot.regionGroups) {
      for (const groupData of snapshot.regionGroups) {
        const group = new RegionGroup(
          groupData.id,
          groupData.name,
          groupData.regionIds
        );
        session._regionGroups.set(group.id, group);
        for (const rid of groupData.regionIds) {
          session._regionToGroupIndex.set(rid, group.id);
        }
      }
    }
    if (snapshot.tempoMapEvents) {
      for (const eventData of snapshot.tempoMapEvents) {
        session.tempoMap.addTempoChange(
          eventData.frame,
          eventData.bpm,
          eventData.timeSigNum,
          eventData.timeSigDen
        );
      }
    }
    if (snapshot.mixerScenes) {
      session.mixerSceneManager.loadFromJSON(snapshot.mixerScenes);
    }
    if (snapshot.trackGroups2) {
      for (const groupData of snapshot.trackGroups2) {
        const group = TrackGroup.fromJSON(groupData);
        session._trackGroups.set(group.id, group);
      }
    }
    if (snapshot.cdMarkers) {
      for (const markerData of snapshot.cdMarkers) {
        const cdMarker = CDMarker.fromJSON(markerData);
        session._cdMarkers.set(cdMarker.id, cdMarker);
      }
    }
    if (snapshot.vcaTracks) {
      for (const vcaData of snapshot.vcaTracks) {
        const vca = VCATrack.fromJSON(vcaData);
        session._vcaTracks.set(vca.id, vca);
      }
    }
    if (snapshot.sidechainConfigs) {
      for (const scData of snapshot.sidechainConfigs) {
        const config = SidechainConfig.fromJSON(scData);
        session.registerSidechainConfig(config, false);
      }
    }
    if (snapshot.takeLanes) {
      for (const laneData of snapshot.takeLanes) {
        const lane = new TakeLane(laneData.id, laneData.trackId);
        for (const takeData of laneData.takes) {
          const take = Take.fromJSON(takeData);
          lane.addTake(take);
        }
        session._takeLanes.set(lane.id, lane);
      }
    }
    return session;
  }
};

// core/src/midi/MidiInput.ts
var MidiInput = class _MidiInput {
  constructor() {
    this.midiAccess = null;
    this.activeInput = null;
    this._initialized = false;
    // Signals
    this.noteOn = new Signal();
    this.noteOff = new Signal();
    this.controlChange = new Signal();
    this.deviceListChanged = new Signal();
  }
  static getInstance() {
    if (!_MidiInput.instance) {
      _MidiInput.instance = new _MidiInput();
    }
    return _MidiInput.instance;
  }
  /** For testing – reset singleton */
  static resetInstance() {
    if (_MidiInput.instance) {
      _MidiInput.instance.dispose();
    }
    _MidiInput.instance = void 0;
  }
  get initialized() {
    return this._initialized;
  }
  /**
   * Request MIDI access from the browser.
   * Must be called before using any other methods.
   */
  async initialize() {
    if (this._initialized) return true;
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      logger.warn("MidiInput", "Web MIDI API not available");
      return false;
    }
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this._initialized = true;
      this.midiAccess.onstatechange = () => {
        this.deviceListChanged.emit();
      };
      logger.debug("MidiInput", "MIDI access granted");
      return true;
    } catch (err) {
      logger.warn("MidiInput", "Failed to get MIDI access:", err);
      return false;
    }
  }
  /**
   * List all available MIDI input devices.
   */
  getInputDevices() {
    if (!this.midiAccess) return [];
    return Array.from(this.midiAccess.inputs.values());
  }
  /**
   * Get the currently active MIDI input device ID.
   */
  getActiveInputId() {
    return this.activeInput?.id ?? null;
  }
  /**
   * Select an active MIDI input device by ID.
   * Pass null to deselect.
   */
  setActiveInput(inputId) {
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
      this.activeInput = null;
    }
    if (!inputId || !this.midiAccess) return;
    const input = this.midiAccess.inputs.get(inputId);
    if (!input) {
      logger.warn("MidiInput", `MIDI input device not found: ${inputId}`);
      return;
    }
    this.activeInput = input;
    this.activeInput.onmidimessage = (event) => {
      this.handleMidiMessage(event);
    };
    logger.debug("MidiInput", `Active input set: ${input.name} (${inputId})`);
  }
  /**
   * Parse raw MIDI messages and emit appropriate signals.
   */
  handleMidiMessage(event) {
    const data = event.data;
    if (!data || data.length < 2) return;
    const statusByte = data[0];
    const messageType = statusByte & 240;
    const channel = statusByte & 15;
    switch (messageType) {
      case 144: {
        const pitch = data[1];
        const velocity = data.length > 2 ? data[2] : 0;
        if (velocity === 0) {
          this.noteOff.emit({ pitch, channel });
        } else {
          this.noteOn.emit({ pitch, velocity, channel });
        }
        break;
      }
      case 128: {
        const pitch = data[1];
        this.noteOff.emit({ pitch, channel });
        break;
      }
      case 176: {
        const controller = data[1];
        const value = data.length > 2 ? data[2] : 0;
        this.controlChange.emit({ controller, value, channel });
        break;
      }
    }
  }
  /**
   * Clean up resources.
   */
  dispose() {
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
      this.activeInput = null;
    }
    this.noteOn.clear();
    this.noteOff.clear();
    this.controlChange.clear();
    this.deviceListChanged.clear();
    this._initialized = false;
    this.midiAccess = null;
  }
};

// core/src/processing/PanProcessor.ts
var PanProcessor = class extends Processor {
  constructor(id) {
    super(id, "Panner");
    this._pan = 0;
    // -1 (Left) to 1 (Right)
    this._width = 1;
    // 0 (mono) to 2 (wide stereo), 1 = normal
    this.panChanged = new Signal();
    this.widthChanged = new Signal();
  }
  get pan() {
    return this._pan;
  }
  set pan(value) {
    const clamped = Math.max(-1, Math.min(1, value));
    if (this._pan !== clamped) {
      this._pan = clamped;
      this.panChanged.emit(clamped);
      this.stateChanged.emit();
    }
  }
  /** Stereo width: 0 = mono, 1 = normal, 2 = wide */
  get width() {
    return this._width;
  }
  set width(value) {
    const clamped = Math.max(0, Math.min(2, value));
    if (this._width !== clamped) {
      this._width = clamped;
      this.widthChanged.emit(clamped);
      this.stateChanged.emit();
    }
  }
};

// core/src/processing/SendProcessor.ts
var SendProcessor = class extends Processor {
  /**
   * @param id        Unique processor identifier.
   * @param targetId  The ID of the destination track or bus.
   * @param level     Initial send level in dB (default 0 dB -- unity).
   * @param preFader  Whether this send taps the signal before the fader.
   * @param pannable  Whether the send has its own pan control.
   */
  constructor(id, targetId, level = 0, preFader = false, pannable = false) {
    super(id, "Send");
    // destination track/bus ID
    this._muted = false;
    /** Emitted when the send level changes. */
    this.levelChanged = new Signal();
    /** Emitted when the pre/post-fader placement changes. */
    this.preFaderChanged = new Signal();
    /** Emitted when the mute state changes. */
    this.muteChanged = new Signal();
    this._targetId = targetId;
    this._level = level;
    this._preFader = preFader;
    this._pannable = pannable;
  }
  // ── Level ────────────────────────────────────────────────────────────────
  /** Send level in dB. */
  get level() {
    return this._level;
  }
  set level(value) {
    const clamped = value === -Infinity ? -Infinity : Math.min(Math.max(value, -100), 12);
    if (this._level !== clamped) {
      this._level = clamped;
      this.levelChanged.emit(clamped);
      this.stateChanged.emit();
    }
  }
  // ── Pre/Post Fader ───────────────────────────────────────────────────────
  /** Whether this send taps the signal before the channel fader. */
  get preFader() {
    return this._preFader;
  }
  set preFader(value) {
    if (this._preFader !== value) {
      this._preFader = value;
      this.preFaderChanged.emit(value);
      this.stateChanged.emit();
    }
  }
  // ── Target ───────────────────────────────────────────────────────────────
  /** The destination track or bus ID. */
  get targetId() {
    return this._targetId;
  }
  // ── Pannable ─────────────────────────────────────────────────────────────
  /** Whether this send has its own panning control. */
  get pannable() {
    return this._pannable;
  }
  // ── Mute ─────────────────────────────────────────────────────────────────
  /** Whether this send is muted. */
  get muted() {
    return this._muted;
  }
  set muted(value) {
    if (this._muted !== value) {
      this._muted = value;
      this.muteChanged.emit(value);
      this.stateChanged.emit();
    }
  }
  // ── Metering ─────────────────────────────────────────────────────────────
  /**
   * Returns the current meter data for this send.
   * In a full implementation the audio backend would feed real values;
   * here we return sensible defaults so consumers always get a valid object.
   */
  getMeterData() {
    return {
      peak: -Infinity,
      rms: -Infinity,
      peakHold: -Infinity,
      clipping: false
    };
  }
};

// core/src/processing/MeterProcessor.ts
var MeterProcessor = class extends Processor {
  /**
   * @param id          Unique processor identifier.
   * @param meterPoint  Initial placement in the signal chain.
   * @param channels    Number of audio channels (default 2 for stereo).
   */
  constructor(id, meterPoint = "post_fader" /* POST_FADER */, channels = 2) {
    super(id, "Meter");
    /** Peak-hold decay rate in dB per frame callback. */
    this.decayRate = 0.3;
    /** Emitted when meter data is updated. */
    this.meterUpdated = new Signal();
    /** Emitted when the meter point changes. */
    this.meterPointChanged = new Signal();
    this._meterPoint = meterPoint;
    this.channelCount = channels;
    this.peakValues = new Array(channels).fill(-Infinity);
    this.rmsValues = new Array(channels).fill(-Infinity);
    this.peakHold = new Array(channels).fill(-Infinity);
  }
  // ── Meter Point ──────────────────────────────────────────────────────────
  /**
   * Set the meter position in the signal chain.
   * @param point The new meter point.
   */
  setMeterPoint(point) {
    if (this._meterPoint !== point) {
      this._meterPoint = point;
      this.meterPointChanged.emit(point);
      this.stateChanged.emit();
    }
  }
  /** Get the current meter point. */
  getMeterPoint() {
    return this._meterPoint;
  }
  // ── DSP Helpers ──────────────────────────────────────────────────────────
  /**
   * Calculate a K-meter value from raw samples.
   *
   * K-metering (Bob Katz) applies a reference offset so that the meter's
   * 0 dB mark corresponds to the chosen reference level (e.g. -14 dBFS
   * for K-14, -20 dBFS for K-20).
   *
   * @param samples   Raw audio samples for a single channel.
   * @param reference Reference level in dBFS (e.g. -14 for K-14, -20 for K-20).
   * @returns The K-meter value in dB (relative to the reference).
   */
  calculateKMeter(samples, reference) {
    if (samples.length === 0) return -Infinity;
    let sumOfSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumOfSquares += samples[i] * samples[i];
    }
    const rmsLinear = Math.sqrt(sumOfSquares / samples.length);
    if (rmsLinear === 0) return -Infinity;
    const rmsDb = 20 * Math.log10(rmsLinear);
    return rmsDb - reference;
  }
  /**
   * Calculate a VU meter value from raw samples.
   *
   * A traditional VU meter has a 300 ms integration time (ballistic).
   * This method computes the RMS over the provided sample block, which
   * should ideally represent ~300 ms of audio for authentic behaviour.
   *
   * @param samples Raw audio samples for a single channel.
   * @returns VU level in dB (0 VU ~ -14 dBFS by convention, but we return
   *          raw dBFS here -- the UI layer can apply the VU offset).
   */
  calculateVUMeter(samples) {
    if (samples.length === 0) return -Infinity;
    let sumOfSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumOfSquares += samples[i] * samples[i];
    }
    const rmsLinear = Math.sqrt(sumOfSquares / samples.length);
    if (rmsLinear === 0) return -Infinity;
    return 20 * Math.log10(rmsLinear);
  }
  // ── State Update ─────────────────────────────────────────────────────────
  /**
   * Feed new sample data into the meter.
   *
   * Intended to be called by the audio backend once per process cycle.
   * Updates peak, RMS, and peak-hold values for each channel.
   *
   * @param channelData Array of Float32Array, one per channel.
   */
  process(channelData) {
    for (let ch = 0; ch < Math.min(channelData.length, this.channelCount); ch++) {
      const samples = channelData[ch];
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        const abs = Math.abs(samples[i]);
        if (abs > peak) peak = abs;
      }
      const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
      this.peakValues[ch] = peakDb;
      let sumOfSquares = 0;
      for (let i = 0; i < samples.length; i++) {
        sumOfSquares += samples[i] * samples[i];
      }
      const rmsLinear = Math.sqrt(sumOfSquares / samples.length);
      const rmsDb = rmsLinear > 0 ? 20 * Math.log10(rmsLinear) : -Infinity;
      this.rmsValues[ch] = rmsDb;
      if (peakDb > this.peakHold[ch]) {
        this.peakHold[ch] = peakDb;
      } else {
        this.peakHold[ch] = Math.max(
          this.peakHold[ch] - this.decayRate,
          -Infinity
        );
      }
    }
    this.meterUpdated.emit(this.getMeterData());
  }
  // ── Output ───────────────────────────────────────────────────────────────
  /**
   * Get the current aggregated meter data (stereo or mono).
   *
   * Returns the maximum peak/RMS across all channels, matching the
   * existing {@link MeterData} interface used throughout the application.
   */
  getMeterData() {
    let maxPeak = -Infinity;
    let maxRms = -Infinity;
    let maxPeakHold = -Infinity;
    for (let ch = 0; ch < this.channelCount; ch++) {
      if (this.peakValues[ch] > maxPeak) maxPeak = this.peakValues[ch];
      if (this.rmsValues[ch] > maxRms) maxRms = this.rmsValues[ch];
      if (this.peakHold[ch] > maxPeakHold) maxPeakHold = this.peakHold[ch];
    }
    return {
      peak: maxPeak,
      rms: maxRms,
      peakHold: maxPeakHold,
      clipping: maxPeak >= 0
    };
  }
  /**
   * Get per-channel meter data.
   *
   * @returns An array of MeterData, one per channel.
   */
  getChannelMeterData() {
    const result = [];
    for (let ch = 0; ch < this.channelCount; ch++) {
      result.push({
        peak: this.peakValues[ch],
        rms: this.rmsValues[ch],
        peakHold: this.peakHold[ch],
        clipping: this.peakValues[ch] >= 0
      });
    }
    return result;
  }
  /**
   * Reset all peak-hold values to -Infinity.
   */
  resetPeakHold() {
    this.peakHold.fill(-Infinity);
  }
  /**
   * Set the peak-hold decay rate.
   * @param rate Decay rate in dB per frame callback.
   */
  setDecayRate(rate) {
    this.decayRate = Math.max(0, rate);
  }
};

// core/src/audio/engine/RoutingGraph.ts
var RoutingGraph = class {
  constructor() {
    this._nodes = /* @__PURE__ */ new Map();
    this.graphChanged = new Signal();
    this.feedbackDetected = new Signal();
  }
  // ─── Node management ────────────────────────────────────────────────────
  /**
   * Add a node to the graph.
   * If a node with the same ID already exists, it is updated in place.
   */
  addNode(id, name, type) {
    const existing = this._nodes.get(id);
    if (existing) {
      existing.name = name;
      existing.type = type;
    } else {
      this._nodes.set(id, {
        id,
        name,
        type,
        inputs: /* @__PURE__ */ new Set(),
        outputs: /* @__PURE__ */ new Set(),
        processed: false,
        depth: 0
      });
    }
    this.graphChanged.emit();
  }
  /**
   * Remove a node and all edges that reference it.
   */
  removeNode(id) {
    const node = this._nodes.get(id);
    if (!node) return;
    for (const outputId of node.outputs) {
      const target = this._nodes.get(outputId);
      if (target) target.inputs.delete(id);
    }
    for (const inputId of node.inputs) {
      const source = this._nodes.get(inputId);
      if (source) source.outputs.delete(id);
    }
    this._nodes.delete(id);
    this.graphChanged.emit();
  }
  // ─── Edge management ────────────────────────────────────────────────────
  /**
   * Add a directed edge from one node to another.
   * Both nodes must already exist in the graph.
   */
  addEdge(fromId, toId) {
    const from = this._nodes.get(fromId);
    const to = this._nodes.get(toId);
    if (!from || !to) return;
    from.outputs.add(toId);
    to.inputs.add(fromId);
    this.graphChanged.emit();
  }
  /**
   * Remove a directed edge between two nodes.
   */
  removeEdge(fromId, toId) {
    const from = this._nodes.get(fromId);
    const to = this._nodes.get(toId);
    if (!from || !to) return;
    from.outputs.delete(toId);
    to.inputs.delete(fromId);
    this.graphChanged.emit();
  }
  // ─── Bulk rebuild ───────────────────────────────────────────────────────
  /**
   * Rebuild the entire graph from session state.
   * Clears all existing nodes/edges and reconstructs from the provided
   * track descriptors. Typically called after bulk routing changes.
   */
  rebuild(tracks) {
    this._nodes.clear();
    for (const track of tracks) {
      this._nodes.set(track.id, {
        id: track.id,
        name: track.name,
        type: track.type,
        inputs: /* @__PURE__ */ new Set(),
        outputs: /* @__PURE__ */ new Set(),
        processed: false,
        depth: 0
      });
    }
    for (const track of tracks) {
      const from = this._nodes.get(track.id);
      if (!from) continue;
      if (track.outputTarget && this._nodes.has(track.outputTarget)) {
        from.outputs.add(track.outputTarget);
        this._nodes.get(track.outputTarget).inputs.add(track.id);
      }
      for (const sendTarget of track.sendTargets) {
        if (this._nodes.has(sendTarget)) {
          from.outputs.add(sendTarget);
          this._nodes.get(sendTarget).inputs.add(track.id);
        }
      }
    }
    this._computeDepths();
    const loops = this.detectFeedback();
    for (const loop of loops) {
      this.feedbackDetected.emit(loop);
    }
    this.graphChanged.emit();
  }
  // ─── Topological sort (Kahn's algorithm) ────────────────────────────────
  /**
   * Compute a valid processing order using Kahn's algorithm for
   * topological sorting. Leaf nodes (no inputs) are processed first,
   * working upward to the master bus.
   *
   * If cycles exist, the returned order will be incomplete (nodes
   * involved in cycles are omitted). Use detectFeedback() to identify
   * those cycles.
   *
   * @returns An array of node IDs in processing order.
   */
  getProcessingOrder() {
    const inDegree = /* @__PURE__ */ new Map();
    for (const [id, node] of this._nodes) {
      inDegree.set(id, node.inputs.size);
    }
    const queue = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }
    const order = [];
    while (queue.length > 0) {
      const current = queue.shift();
      order.push(current);
      const node = this._nodes.get(current);
      if (!node) continue;
      for (const outputId of node.outputs) {
        const deg = inDegree.get(outputId);
        if (deg === void 0) continue;
        const newDeg = deg - 1;
        inDegree.set(outputId, newDeg);
        if (newDeg === 0) {
          queue.push(outputId);
        }
      }
    }
    return order;
  }
  // ─── Feedback detection (DFS cycle detection) ───────────────────────────
  /**
   * Detect all feedback loops (cycles) in the graph using DFS.
   * Returns an array of FeedbackLoop descriptors, each containing the
   * ordered path of node IDs that form the cycle.
   */
  detectFeedback() {
    const loops = [];
    const state = /* @__PURE__ */ new Map();
    for (const id of this._nodes.keys()) {
      state.set(id, "unvisited");
    }
    const pathStack = [];
    const pathSet = /* @__PURE__ */ new Set();
    const dfs = (nodeId) => {
      state.set(nodeId, "visiting");
      pathStack.push(nodeId);
      pathSet.add(nodeId);
      const node = this._nodes.get(nodeId);
      if (node) {
        for (const neighborId of node.outputs) {
          const neighborState = state.get(neighborId);
          if (neighborState === "visiting" && pathSet.has(neighborId)) {
            const cycleStartIdx = pathStack.indexOf(neighborId);
            const cyclePath = pathStack.slice(cycleStartIdx);
            cyclePath.push(neighborId);
            const nodeNames = cyclePath.map((id) => {
              const n = this._nodes.get(id);
              return n ? n.name : id;
            });
            loops.push({
              path: cyclePath,
              description: `Feedback loop: ${nodeNames.join(" -> ")}`
            });
          } else if (neighborState === "unvisited") {
            dfs(neighborId);
          }
        }
      }
      pathStack.pop();
      pathSet.delete(nodeId);
      state.set(nodeId, "visited");
    };
    for (const id of this._nodes.keys()) {
      if (state.get(id) === "unvisited") {
        dfs(id);
      }
    }
    return loops;
  }
  // ─── Reachability queries ───────────────────────────────────────────────
  /**
   * Check whether route A feeds (directly or indirectly) into route B.
   * Uses BFS from A, following output edges, to determine reachability.
   */
  feeds(fromId, toId) {
    if (fromId === toId) return false;
    if (!this._nodes.has(fromId) || !this._nodes.has(toId)) return false;
    const visited = /* @__PURE__ */ new Set();
    const queue = [fromId];
    visited.add(fromId);
    while (queue.length > 0) {
      const current = queue.shift();
      const node = this._nodes.get(current);
      if (!node) continue;
      for (const outputId of node.outputs) {
        if (outputId === toId) return true;
        if (!visited.has(outputId)) {
          visited.add(outputId);
          queue.push(outputId);
        }
      }
    }
    return false;
  }
  /**
   * Check whether route A directly feeds into route B (single hop).
   */
  directFeeds(fromId, toId) {
    const from = this._nodes.get(fromId);
    if (!from) return false;
    return from.outputs.has(toId);
  }
  /**
   * Get all routes that feed (directly or indirectly) into the given route.
   * Traverses backward from the target, following input edges via BFS.
   */
  getUpstream(nodeId) {
    if (!this._nodes.has(nodeId)) return [];
    const visited = /* @__PURE__ */ new Set();
    const queue = [nodeId];
    visited.add(nodeId);
    const upstream = [];
    while (queue.length > 0) {
      const current = queue.shift();
      const node = this._nodes.get(current);
      if (!node) continue;
      for (const inputId of node.inputs) {
        if (!visited.has(inputId)) {
          visited.add(inputId);
          upstream.push(inputId);
          queue.push(inputId);
        }
      }
    }
    return upstream;
  }
  /**
   * Get all routes that the given route feeds (directly or indirectly) into.
   * Traverses forward from the source, following output edges via BFS.
   */
  getDownstream(nodeId) {
    if (!this._nodes.has(nodeId)) return [];
    const visited = /* @__PURE__ */ new Set();
    const queue = [nodeId];
    visited.add(nodeId);
    const downstream = [];
    while (queue.length > 0) {
      const current = queue.shift();
      const node = this._nodes.get(current);
      if (!node) continue;
      for (const outputId of node.outputs) {
        if (!visited.has(outputId)) {
          visited.add(outputId);
          downstream.push(outputId);
          queue.push(outputId);
        }
      }
    }
    return downstream;
  }
  // ─── Parallel processing groups ─────────────────────────────────────────
  /**
   * Find groups of nodes that can be processed in parallel.
   * Nodes at the same depth in the topological ordering have no
   * dependencies on each other and can safely run concurrently.
   *
   * Uses a BFS-based level assignment: leaf nodes (in-degree 0) are
   * at level 0, their consumers at level 1, and so on. Nodes at the
   * same level form a parallel group.
   *
   * @returns An array of groups, where each group is an array of node IDs
   *          that can be processed simultaneously. Groups are returned in
   *          processing order (group 0 first, then group 1, etc.).
   */
  getParallelGroups() {
    const inDegree = /* @__PURE__ */ new Map();
    const level = /* @__PURE__ */ new Map();
    for (const [id, node] of this._nodes) {
      inDegree.set(id, node.inputs.size);
      level.set(id, 0);
    }
    const queue = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
        level.set(id, 0);
      }
    }
    const visited = /* @__PURE__ */ new Set();
    let maxLevel = 0;
    while (queue.length > 0) {
      const current = queue.shift();
      visited.add(current);
      const currentLevel = level.get(current);
      const node = this._nodes.get(current);
      if (!node) continue;
      for (const outputId of node.outputs) {
        const newLevel = currentLevel + 1;
        if (newLevel > (level.get(outputId) ?? 0)) {
          level.set(outputId, newLevel);
        }
        if (newLevel > maxLevel) {
          maxLevel = newLevel;
        }
        const deg = inDegree.get(outputId);
        if (deg === void 0) continue;
        const newDeg = deg - 1;
        inDegree.set(outputId, newDeg);
        if (newDeg === 0) {
          queue.push(outputId);
        }
      }
    }
    const groups = [];
    for (let i = 0; i <= maxLevel; i++) {
      groups.push([]);
    }
    for (const [id, lvl] of level) {
      if (visited.has(id)) {
        groups[lvl].push(id);
      }
    }
    return groups.filter((g) => g.length > 0);
  }
  // ─── Accessors ──────────────────────────────────────────────────────────
  /**
   * Get a single node by ID.
   */
  getNode(id) {
    return this._nodes.get(id);
  }
  /**
   * Get all nodes as a read-only array.
   */
  get nodes() {
    return Array.from(this._nodes.values());
  }
  /**
   * Clear all nodes and edges, resetting the graph to an empty state.
   */
  clear() {
    this._nodes.clear();
    this.graphChanged.emit();
  }
  // ─── Private helpers ────────────────────────────────────────────────────
  /**
   * Compute the depth of each node (longest path from any leaf to this node).
   * Leaf nodes (no inputs) have depth 0. Used for parallel group assignment
   * and rendering the graph visualization.
   */
  _computeDepths() {
    for (const node of this._nodes.values()) {
      node.depth = 0;
    }
    const order = this.getProcessingOrder();
    for (const id of order) {
      const node = this._nodes.get(id);
      if (!node) continue;
      for (const outputId of node.outputs) {
        const target = this._nodes.get(outputId);
        if (target) {
          target.depth = Math.max(target.depth, node.depth + 1);
        }
      }
    }
  }
};

// core/src/audio/engine/RoutingSnapshot.ts
var ROUTING_SNAPSHOT_SCHEMA_VERSION = 1;
function getProcessorRuntimeType(processor) {
  if (processor instanceof GainProcessor) {
    return processor.name === "Trim" ? "Trim" : "Fader";
  }
  if (processor instanceof Panner || processor instanceof PanProcessor) {
    return "Panner";
  }
  if (processor instanceof PolarityProcessor) {
    return "Polarity";
  }
  if (processor instanceof SendProcessor) {
    return "Send";
  }
  if (processor instanceof MeterProcessor) {
    return "Meter";
  }
  if (processor instanceof PluginInsert) {
    return `Insert: ${processor.plugin.name}`;
  }
  return "Unknown";
}
function createRoutingSnapshot(session) {
  const graph = new RoutingGraph();
  const nodes = createNodes(session);
  nodes.forEach((node) => graph.addNode(node.id, node.name, node.type));
  const edges = createEdges(session);
  edges.forEach((edge) => graph.addEdge(edge.sourceId, edge.targetId));
  const feedbackLoops = graph.detectFeedback();
  const frozenNodes = Object.freeze(
    nodes.map(
      (node) => Object.freeze({
        ...node,
        processors: Object.freeze(
          node.processors.map((processor) => Object.freeze(processor))
        )
      })
    )
  );
  const frozenEdges = Object.freeze(edges.map((edge) => Object.freeze(edge)));
  return Object.freeze({
    schemaVersion: ROUTING_SNAPSHOT_SCHEMA_VERSION,
    sessionId: session.id,
    nodes: frozenNodes,
    edges: frozenEdges,
    processingOrder: Object.freeze(graph.getProcessingOrder()),
    feedbackPaths: Object.freeze(
      feedbackLoops.map((loop) => Object.freeze([...loop.path]))
    )
  });
}
function createNodes(session) {
  return [
    createRouteNode({
      id: session.masterBus.id,
      name: session.masterBus.name,
      type: "master",
      inputId: session.masterBus.input.id,
      outputId: session.masterBus.output.id,
      compensationDelaySamples: session.masterBus.compensationDelay,
      processors: session.masterBus.processors
    }),
    ...session.tracks.map((track) => createTrackNode(track))
  ];
}
function createTrackNode(track) {
  return createRouteNode({
    id: track.id,
    name: track.name,
    type: getRoutingNodeType(track.type),
    inputId: track.route.input.id,
    outputId: track.route.output.id,
    compensationDelaySamples: track.route.compensationDelay,
    processors: track.route.processors
  });
}
function createRouteNode(source) {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    inputId: source.inputId,
    outputId: source.outputId,
    compensationDelaySamples: source.compensationDelaySamples,
    processors: source.processors.map((processor, index) => ({
      id: processor.id,
      type: getProcessorRuntimeType(processor),
      index,
      active: processor.active,
      latencySamples: processor.getLatency(),
      tailFrames: processor.getEffectiveTailLength()
    }))
  };
}
function createEdges(session) {
  const routeByInputId = new Map(
    [session.masterBus, ...session.tracks.map((track) => track.route)].map(
      (route) => [route.input.id, route]
    )
  );
  const nodeIdByRouteId = new Map([
    [session.masterBus.id, session.masterBus.id],
    ...session.tracks.map(
      (track) => [track.route.id, track.id]
    )
  ]);
  const edges = [];
  session.tracks.forEach((track) => {
    const explicitTargets = track.route.output.connections.map((inputId) => routeByInputId.get(inputId)).filter((route) => route !== void 0);
    if (explicitTargets.length === 0) {
      edges.push({
        sourceId: track.id,
        targetId: session.masterBus.id,
        sourcePortId: track.route.output.id,
        targetPortId: session.masterBus.input.id,
        type: "direct",
        dataType: track.type === "MIDI" /* MIDI */ ? "midi" : "audio"
      });
      return;
    }
    explicitTargets.forEach((targetRoute) => {
      const targetId = nodeIdByRouteId.get(targetRoute.id);
      if (!targetId) {
        return;
      }
      edges.push({
        sourceId: track.id,
        targetId,
        sourcePortId: track.route.output.id,
        targetPortId: targetRoute.input.id,
        type: "direct",
        dataType: track.type === "MIDI" /* MIDI */ ? "midi" : "audio"
      });
    });
  });
  session.sendBuses.forEach((sendBus) => {
    const targetRoute = routeByInputId.get(sendBus.destId);
    const targetId = targetRoute ? nodeIdByRouteId.get(targetRoute.id) : void 0;
    if (!targetId || !sendBus.active) {
      return;
    }
    const sourceTrack = session.getTrack(sendBus.sourceTrackId);
    if (!sourceTrack) {
      return;
    }
    edges.push({
      sourceId: sourceTrack.id,
      targetId,
      sourcePortId: sourceTrack.route.output.id,
      targetPortId: sendBus.destId,
      type: "send",
      dataType: "audio",
      sendBusId: sendBus.id
    });
  });
  session.sidechainConfigs.forEach((sidechain) => {
    if (!sidechain.enabled || !sidechain.sourceTrackId) {
      return;
    }
    const sourceTrack = session.getTrack(sidechain.sourceTrackId);
    const targetTrack = session.getTrack(sidechain.targetTrackId);
    if (!sourceTrack || !targetTrack) {
      return;
    }
    edges.push({
      sourceId: sourceTrack.id,
      targetId: targetTrack.id,
      sourcePortId: sourceTrack.route.output.id,
      targetPortId: targetTrack.route.input.id,
      type: "sidechain",
      dataType: "audio",
      targetProcessorId: sidechain.targetProcessorId
    });
  });
  return edges;
}
function getRoutingNodeType(trackType) {
  switch (trackType) {
    case "MIDI" /* MIDI */:
      return "midi";
    case "AUX" /* AUX */:
      return "aux";
    case "BUS" /* BUS */:
      return "bus";
    case "FOLDER" /* FOLDER */:
      return "folder";
    case "VCA" /* VCA */:
      return "vca";
    case "AUDIO" /* AUDIO */:
      return "audio";
  }
}

// core/src/audio/AudioEngine.ts
var AudioEngine = class _AudioEngine {
  constructor(backend) {
    this.disposed = false;
    this.isBackendTransportRunning = false;
    this.transportStartPromise = null;
    this.transportStopPromise = null;
    this.midiRecordingNotes = /* @__PURE__ */ new Map();
    this.midiRecordedNotes = [];
    this.midiNoteOnSub = null;
    this.midiNoteOffSub = null;
    /** Signal disconnect handles for cleanup on dispose */
    this.signalDisposers = [];
    /** Per-track signal disposers — cleaned up when a track is removed */
    this.trackDisposers = /* @__PURE__ */ new Map();
    /** Per-SendBus signal disposers — cleaned up when a send bus is removed */
    this.sendBusDisposers = /* @__PURE__ */ new Map();
    // Pre-roll state: frame-based check replaces setTimeout
    this.preRollTargetFrame = null;
    this.preRollArmedTracks = [];
    this.preRollWasMetronomeEnabled = false;
    this.syncId = null;
    this.session = new Session(crypto.randomUUID(), "Untitled Session");
    this.backend = backend;
    this.midiInput = MidiInput.getInstance();
    this.syncSessionToBackend();
    this.setupSessionListeners();
  }
  static getInstance(backend) {
    if (!_AudioEngine.instance) {
      if (!backend)
        throw new Error(
          "AudioEngine requires a backend on first initialization"
        );
      _AudioEngine.instance = new _AudioEngine(backend);
    }
    return _AudioEngine.instance;
  }
  /**
   * 호출자가 생명주기를 소유하는 독립 엔진을 만듭니다.
   *
   * 브라우저 앱은 격리된 Composition Root를 둘 이상 만들 수 있으므로
   * getInstance()가 반환하는 프로세스 전역 인스턴스를 공유하지 않습니다.
   */
  static create(backend) {
    return new _AudioEngine(backend);
  }
  /** Reset the singleton instance. For testing only. */
  static resetInstance() {
    if (_AudioEngine.instance) {
      _AudioEngine.instance.dispose();
    }
    _AudioEngine.instance = void 0;
  }
  /** Dispose all listeners and internal state to prevent memory leaks. */
  dispose() {
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
  disconnectSessionSignals() {
    this.signalDisposers.forEach((disposer) => disposer.dispose());
    this.signalDisposers = [];
    this.trackDisposers.forEach(
      (disposers) => disposers.forEach((disposer) => disposer.dispose())
    );
    this.trackDisposers.clear();
    this.sendBusDisposers.forEach(
      (disposers) => disposers.forEach((disposer) => disposer.dispose())
    );
    this.sendBusDisposers.clear();
  }
  setBackend(backend) {
    this.backend = backend;
    this.isBackendTransportRunning = false;
    this.syncSessionToBackend();
  }
  /**
   * Pre-cache a decoded AudioBuffer so subsequent addSource/getAudioBuffer
   * calls for the same URL hit the cache instead of re-fetching.
   * Useful when the source was loaded from a blob URL that will be revoked.
   */
  precacheAudioBuffer(url, buffer) {
    this.backend.addAudioBuffer(url, buffer);
  }
  getEngineType() {
    return this.backend.getEngineType();
  }
  getCurrentTime() {
    return this.backend.getCurrentTime();
  }
  getCurrentFrame() {
    return this.backend.getCurrentFrame();
  }
  seek(time) {
    this.backend.seek(time);
    const frame = Math.floor(time * this.session.sampleRate);
    this.session.locateTransport(frame);
  }
  /**
   * Convert a Region domain object to a plain RegionDTO safe for postMessage.
   * Only copies the properties defined in the RegionDTO interface, avoiding
   * non-serialisable fields like Signal instances that would cause DataCloneError.
   */
  static toRegionDTO(r) {
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
      timeDomain: r.timeDomain
    };
  }
  updateRegion(trackId, _region) {
    const track = this.session.getTrack(trackId);
    if (track) {
      const regions = track.playlist.getRegions();
      const regionsDTO = regions.map(
        (r) => _AudioEngine.toRegionDTO(r)
      );
      this.backend.updateRegions(trackId, regionsDTO);
    }
  }
  syncSessionToBackend() {
    const { masterBus } = this.session;
    this.backend.registerMasterIO(masterBus.input.id, masterBus.output.id);
    masterBus.processors.forEach((processor, index) => {
      this.backend.addMasterProcessor(
        processor.id,
        getProcessorRuntimeType(processor),
        index
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
    this.session.sources.forEach((source) => {
      void this.backend.addSource(source);
    });
    this.session.tracks.forEach((track) => this.syncTrackToBackend(track));
    this.session.sendBuses.forEach(
      (sendBus) => this.syncSendBusToBackend(sendBus)
    );
    this.syncRoutingSnapshot();
  }
  syncRoutingSnapshot() {
    this.backend.applyRoutingSnapshot(createRoutingSnapshot(this.session));
  }
  syncLoopRange() {
    const range = this.session.getLoopRange();
    if (!range) {
      return;
    }
    this.backend.setLoopRange(
      range.start / this.session.sampleRate,
      range.end / this.session.sampleRate
    );
  }
  syncPunchRange() {
    const range = this.session.getPunchRange();
    if (!range) {
      return;
    }
    this.backend.setPunchRange(range.start, range.end);
  }
  syncTrackToBackend(track) {
    this.createBackendTrack(track);
    track.route.processors.forEach((processor, index) => {
      this.backend.addProcessor(
        track.id,
        processor.id,
        getProcessorRuntimeType(processor),
        index
      );
      this.syncProcessorState(track.id, processor);
    });
    track.playlist.getRegions().forEach((region) => {
      this.backend.scheduleRegion(track.id, _AudioEngine.toRegionDTO(region));
    });
    track.playlist.getMidiRegions().forEach((midiRegion) => {
      this.backend.scheduleMidiRegion(
        track.id,
        _AudioEngine.toMidiRegionDTO(midiRegion)
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
  createBackendTrack(track) {
    const trackArguments = [
      track.id,
      track.name,
      track.route.input.id,
      track.route.output.id
    ];
    if (track.type === "AUX" /* AUX */) {
      this.backend.createAuxTrack(...trackArguments);
      return;
    }
    if (track.type === "BUS" /* BUS */) {
      this.backend.createBusTrack(...trackArguments);
      return;
    }
    if (track.type === "MIDI" /* MIDI */) {
      this.backend.createMidiTrack(...trackArguments);
      return;
    }
    this.backend.createTrack(...trackArguments);
  }
  syncProcessorState(trackId, processor) {
    const setParameter = (parameter, value) => {
      this.backend.setProcessorParameter(
        trackId,
        processor.id,
        parameter,
        value
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
        automation.getPoints()
      );
    });
  }
  syncMasterProcessorState(processor) {
    if (processor instanceof GainProcessor) {
      this.backend.setMasterGain(processor.gain);
    }
    if (processor instanceof PluginInsert) {
      processor.plugin.getParameters().forEach((parameter) => {
        this.backend.setMasterProcessorParameter(
          processor.id,
          parameter.id,
          parameter.value
        );
      });
    }
  }
  syncIOConnections(track) {
    track.route.input.connections.forEach((destinationId) => {
      this.backend.connectIO(track.route.input.id, destinationId);
    });
    track.route.output.connections.forEach((destinationId) => {
      this.backend.connectIO(track.route.output.id, destinationId);
    });
  }
  syncSendBusToBackend(sendBus) {
    this.backend.addSendBus(
      sendBus.id,
      sendBus.sourceTrackId,
      sendBus.destId,
      sendBus.level,
      sendBus.preFader
    );
    this.backend.setSendBusActive(sendBus.id, sendBus.active);
  }
  clearSessionFromBackend() {
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
  setupSessionListeners() {
    const masterBus = this.session.masterBus;
    masterBus.processors.forEach(
      (processor) => this.connectMasterProcessorSignals(processor)
    );
    this.signalDisposers.push(
      masterBus.processorAdded.connect((proc) => {
        const index = masterBus.processors.indexOf(proc);
        const type = getProcessorRuntimeType(proc);
        this.backend.addMasterProcessor(proc.id, type, index);
        this.connectMasterProcessorSignals(proc);
        this.syncRoutingSnapshot();
      })
    );
    this.signalDisposers.push(
      masterBus.processorRemoved.connect((procId) => {
        this.backend.removeMasterProcessor(procId);
        this.syncRoutingSnapshot();
      })
    );
    this.signalDisposers.push(
      this.session.loopEnabledChanged.connect((enabled) => {
        this.backend.enableLoop(enabled);
        if (enabled) {
          const range = this.session.getLoopRange();
          if (range) {
            const startSec = range.start / this.session.sampleRate;
            const endSec = range.end / this.session.sampleRate;
            this.backend.setLoopRange(startSec, endSec);
          }
        }
      })
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
      })
    );
    this.signalDisposers.push(
      this.session.trackAdded.connect((track) => {
        this.createBackendTrack(track);
        const disposers = [];
        track.route.processors.forEach((proc, index) => {
          const type = getProcessorRuntimeType(proc);
          this.backend.addProcessor(track.id, proc.id, type, index);
          this.connectProcessorSignals(track.id, proc, disposers);
        });
        this.bindTrackRuntimeSignals(track, disposers);
        this.trackDisposers.set(track.id, disposers);
        this.syncRoutingSnapshot();
      })
    );
    this.signalDisposers.push(
      this.session.trackRemoved.connect((trackId) => {
        const disposers = this.trackDisposers.get(trackId);
        if (disposers) {
          disposers.forEach((d) => d.dispose());
          this.trackDisposers.delete(trackId);
        }
        this.backend.deleteTrack(trackId);
        this.syncRoutingSnapshot();
      })
    );
    this.signalDisposers.push(
      this.session.metronomeChanged.connect((enabled) => {
        this.backend.enableMetronome(enabled);
      })
    );
    this.signalDisposers.push(
      this.session.metronomeVolumeChanged.connect((volume) => {
        this.backend.setMetronomeVolume(volume);
      })
    );
    this.signalDisposers.push(
      this.session.tempoChanged.connect((bpm) => {
        this.backend.setTempo(bpm);
        this.session.tracks.forEach((track) => {
          const regions = track.playlist.getRegions();
          const regionsDTO = regions.map(
            (r) => _AudioEngine.toRegionDTO(r)
          );
          this.backend.updateRegions(track.id, regionsDTO);
        });
      })
    );
    this.signalDisposers.push(
      this.session.sourceAdded.connect((source) => {
        this.backend.addSource(source);
      })
    );
    this.signalDisposers.push(
      this.session.sendBusAdded.connect((sendBus) => {
        this.syncSendBusToBackend(sendBus);
        const disposers = [];
        this.bindSendBusSignals(sendBus, disposers);
        this.sendBusDisposers.set(sendBus.id, disposers);
        this.syncRoutingSnapshot();
      })
    );
    this.signalDisposers.push(
      this.session.sendBusRemoved.connect((sendBusId) => {
        const disposers = this.sendBusDisposers.get(sendBusId);
        if (disposers) {
          disposers.forEach((d) => d.dispose());
          this.sendBusDisposers.delete(sendBusId);
        }
        this.backend.removeSendBus(sendBusId);
        this.syncRoutingSnapshot();
      })
    );
    this.signalDisposers.push(
      this.session.sidechainConfigChanged.connect(() => {
        this.syncRoutingSnapshot();
      })
    );
    this.session.tracks.forEach((track) => {
      const disposers = [];
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
      const disposers = [];
      this.bindSendBusSignals(sendBus, disposers);
      this.sendBusDisposers.set(sendBus.id, disposers);
    });
  }
  bindSendBusSignals(sendBus, disposers) {
    disposers.push(
      sendBus.levelChanged.connect((levelDb) => {
        this.backend.setSendBusLevel(sendBus.id, levelDb);
      }),
      sendBus.preFaderChanged.connect((preFader) => {
        this.backend.setSendBusPreFader(sendBus.id, preFader);
      }),
      sendBus.activeChanged.connect((active) => {
        this.backend.setSendBusActive(sendBus.id, active);
        this.syncRoutingSnapshot();
      })
    );
  }
  bindTrackRuntimeSignals(track, disposers) {
    disposers.push(
      track.route.processorAdded.connect((processor) => {
        const index = track.route.processors.indexOf(processor);
        const type = getProcessorRuntimeType(processor);
        this.backend.addProcessor(track.id, processor.id, type, index);
        this.connectProcessorSignals(track.id, processor, disposers);
        this.syncRoutingSnapshot();
      }),
      track.route.processorRemoved.connect((processorId) => {
        this.backend.removeProcessor(track.id, processorId);
        this.syncRoutingSnapshot();
      }),
      track.playlist.regionAdded.connect((region) => {
        this.backend.scheduleRegion(track.id, _AudioEngine.toRegionDTO(region));
      }),
      track.playlist.regionRemoved.connect((regionId) => {
        this.backend.removeRegion(track.id, regionId);
      }),
      track.playlist.regionChanged.connect((region) => {
        this.updateRegion(track.id, region);
      }),
      track.playlist.midiRegionAdded.connect((midiRegion) => {
        this.backend.scheduleMidiRegion(
          track.id,
          _AudioEngine.toMidiRegionDTO(midiRegion)
        );
      }),
      track.playlist.midiRegionRemoved.connect((regionId) => {
        this.backend.removeMidiRegion(track.id, regionId);
      })
    );
    this.bindTrackSignals(track, disposers);
  }
  static toMidiRegionDTO(midiRegion) {
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
        channel: note.channel
      }))
    };
  }
  bindTrackSignals(track, disposers = []) {
    if (track.monitorChanged) {
      disposers.push(
        track.monitorChanged.connect((enabled) => {
          this.backend.setMonitor(track.id, enabled);
        })
      );
    }
    disposers.push(
      track.muteChanged.connect((muted) => {
        this.backend.setTrackMute(track.id, muted);
      })
    );
    disposers.push(
      track.soloChanged.connect((soloed) => {
        this.backend.setTrackSolo(track.id, soloed);
      })
    );
    disposers.push(
      track.soloIsolateChanged.connect((isolate) => {
        this.backend.setTrackSoloIsolate(track.id, isolate);
      })
    );
    disposers.push(
      track.soloSafeChanged.connect((safe) => {
        this.backend.setTrackSoloSafe(track.id, safe);
      })
    );
    disposers.push(
      track.monitorModeChanged.connect((mode) => {
        this.backend.setMonitorMode(track.id, mode);
      })
    );
    if (track.route) {
      const route = track.route;
      if (route.output && route.output.connected) {
        disposers.push(
          route.output.connected.connect((destId) => {
            this.backend.connectIO(route.output.id, destId);
            this.syncRoutingSnapshot();
          })
        );
        disposers.push(
          route.output.disconnected.connect((destId) => {
            this.backend.disconnectIO(route.output.id, destId);
            this.syncRoutingSnapshot();
          })
        );
      }
      if (route.input && route.input.connected) {
        disposers.push(
          route.input.connected.connect((destId) => {
            this.backend.connectIO(route.input.id, destId);
            this.syncRoutingSnapshot();
          })
        );
        disposers.push(
          route.input.disconnected.connect((destId) => {
            this.backend.disconnectIO(route.input.id, destId);
            this.syncRoutingSnapshot();
          })
        );
      }
    }
  }
  connectMasterProcessorSignals(proc) {
    this.bindProcessorSnapshotSignals(proc, this.signalDisposers);
    if (proc instanceof GainProcessor) {
      this.signalDisposers.push(
        proc.gainChanged.connect((val) => {
          this.backend.setMasterGain(val);
        })
      );
    }
    if (proc instanceof PluginInsert && proc.plugin && proc.plugin.parameterChanged) {
      this.signalDisposers.push(
        proc.plugin.parameterChanged.connect(
          ({ id, value }) => {
            this.backend.setMasterProcessorParameter(proc.id, id, value);
          }
        )
      );
    }
  }
  connectProcessorSignals(trackId, proc, disposers) {
    this.bindProcessorSnapshotSignals(proc, disposers);
    if (proc instanceof GainProcessor) {
      disposers.push(
        proc.gainChanged.connect((val) => {
          this.backend.setProcessorParameter(trackId, proc.id, "gain", val);
        })
      );
    }
    if (proc instanceof Panner) {
      disposers.push(
        proc.azimuthChanged.connect((val) => {
          this.backend.setProcessorParameter(trackId, proc.id, "pan", val);
        }),
        proc.widthChanged.connect((val) => {
          this.backend.setProcessorParameter(trackId, proc.id, "width", val);
        })
      );
    } else if (proc instanceof PanProcessor) {
      disposers.push(
        proc.panChanged.connect((val) => {
          this.backend.setProcessorParameter(trackId, proc.id, "pan", val);
        }),
        proc.widthChanged.connect((val) => {
          this.backend.setProcessorParameter(trackId, proc.id, "width", val);
        })
      );
    }
    if (proc instanceof PolarityProcessor) {
      disposers.push(
        proc.polarityChanged.connect((inverted) => {
          this.backend.setProcessorParameter(
            trackId,
            proc.id,
            "polarity",
            inverted ? 1 : 0
          );
        })
      );
    }
    if (proc instanceof SendProcessor) {
      disposers.push(
        proc.levelChanged.connect((val) => {
          this.backend.setProcessorParameter(trackId, proc.id, "level", val);
        }),
        proc.preFaderChanged.connect((preFader) => {
          this.backend.setProcessorParameter(
            trackId,
            proc.id,
            "preFader",
            preFader ? 1 : 0
          );
        }),
        proc.muteChanged.connect((muted) => {
          this.backend.setProcessorParameter(
            trackId,
            proc.id,
            "muted",
            muted ? 1 : 0
          );
        })
      );
    }
    if (proc instanceof PluginInsert && proc.plugin && proc.plugin.parameterChanged) {
      disposers.push(
        proc.plugin.parameterChanged.connect(
          ({ id, value }) => {
            this.backend.setProcessorParameter(trackId, proc.id, id, value);
          }
        )
      );
    }
    if (proc.automations) {
      proc.automations.forEach((list, param) => {
        this.bindAutomationList(trackId, proc.id, param, list, disposers);
      });
    }
    if (proc.automationAdded) {
      disposers.push(
        proc.automationAdded.connect(
          ({
            paramName,
            list
          }) => {
            this.bindAutomationList(
              trackId,
              proc.id,
              paramName,
              list,
              disposers
            );
          }
        )
      );
    }
  }
  bindProcessorSnapshotSignals(processor, disposers) {
    const syncSnapshot = () => this.syncRoutingSnapshot();
    disposers.push(
      processor.activeChanged.connect(syncSnapshot),
      processor.latencyChanged.connect(syncSnapshot),
      processor.tailLengthChanged.connect(syncSnapshot)
    );
  }
  bindAutomationList(trackId, procId, param, list, disposers) {
    if (list.changed) {
      disposers.push(
        list.changed.connect(() => {
          logger.debug(
            "AudioEngine",
            `Automation changed for ${trackId}:${procId}:${param}`
          );
          const points2 = list.getPoints();
          this.backend.setProcessorAutomation(trackId, procId, param, points2);
        })
      );
      const points = list.getPoints();
      if (points.length > 0) {
        this.backend.setProcessorAutomation(trackId, procId, param, points);
      }
    }
  }
  async initialize() {
    await this.backend.initialize();
  }
  // Transport
  start() {
    if (this.transportStartPromise) {
      return this.transportStartPromise;
    }
    if (this.isBackendTransportRunning && this.session.transportFSM.isRolling()) {
      return Promise.resolve();
    }
    this.session.startTransport();
    const sessionAtRequest = this.session;
    const pendingStop = this.transportStopPromise;
    const operation = this.startBackendWhenReady(sessionAtRequest, pendingStop);
    this.transportStartPromise = operation;
    operation.then(
      () => this.clearTransportStartPromise(operation),
      () => this.clearTransportStartPromise(operation)
    );
    return operation;
  }
  async startBackendWhenReady(sessionAtRequest, pendingStop) {
    if (pendingStop) {
      try {
        await pendingStop;
      } catch (error) {
        logger.warn(
          "AudioEngine",
          "Previous transport stop failed before restart",
          error
        );
      }
    }
    if (this.disposed || this.session !== sessionAtRequest || !sessionAtRequest.transportFSM.isRolling()) {
      return;
    }
    this.scheduleAutomations();
    this.backend.setTempo(this.session.tempo);
    await this.backend.start();
    this.isBackendTransportRunning = true;
    if (this.session === sessionAtRequest && sessionAtRequest.transportFSM.isRolling()) {
      this.startTransportSync();
    }
  }
  clearTransportStartPromise(operation) {
    if (this.transportStartPromise === operation) {
      this.transportStartPromise = null;
    }
  }
  requestFrame(cb) {
    if (typeof requestAnimationFrame !== "undefined") {
      return requestAnimationFrame(cb);
    }
    return setTimeout(cb, 16);
  }
  cancelFrame(id) {
    if (typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(id);
    } else {
      clearTimeout(id);
    }
  }
  startTransportSync() {
    if (this.syncId) this.cancelFrame(this.syncId);
    const loop = () => {
      if (!this.session.isPlaying) return;
      const currentFrame = this.backend.getCurrentFrame();
      if (this.preRollTargetFrame !== null && currentFrame >= this.preRollTargetFrame) {
        this.preRollArmedTracks.forEach(
          (t) => this.backend.setRecordingMuted(t.id, false)
        );
        if (!this.preRollWasMetronomeEnabled) {
          this.backend.enableMetronome(false);
        }
        this.session.recordingStartFrame = currentFrame;
        logger.info("AudioEngine", "Pre-roll complete, recording active");
        this.preRollTargetFrame = null;
        this.preRollArmedTracks = [];
      }
      if (this.session.isRecording && this.session.punchEnabled && this.session.punchRangeId) {
        const punchRange = this.session.getPunchRange();
        if (punchRange) {
          const isInPunchRange = currentFrame >= punchRange.start && currentFrame < punchRange.end;
          const armedTracks = this.session.tracks.filter((t) => t.armed);
          armedTracks.forEach((t) => {
            this.backend.setRecordingMuted(t.id, !isInPunchRange);
          });
        }
      }
      if (this.session.loopEnabled && this.session.loopRangeId) {
        const loopRange = this.session.getLoopRange();
        if (loopRange && currentFrame >= loopRange.end) {
          if (this.session.isRecording && this.session.loopRecordingEnabled) {
            this.handleLoopRecordingTake(currentFrame).catch((err) => {
              logger.error(
                "AudioEngine",
                "Error handling loop recording take:",
                err
              );
            });
          }
          logger.debug(
            "AudioEngine",
            `Loop: ${currentFrame} >= ${loopRange.end}, seeking to ${loopRange.start}`
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
  scheduleAutomations() {
    this.session.tracks.forEach((track) => {
      track.route.processors.forEach((proc) => {
        if (proc.automations) {
          proc.automations.forEach(
            (automationList, paramName) => {
              const points = automationList.getPoints();
              if (points.length > 0) {
                this.backend.setProcessorAutomation(
                  track.id,
                  proc.id,
                  paramName,
                  points
                );
              }
            }
          );
        }
      });
    });
  }
  stop() {
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
      pendingStart
    });
    this.transportStopPromise = operation;
    operation.then(
      () => this.clearTransportStopPromise(operation),
      () => this.clearTransportStopPromise(operation)
    );
    return operation;
  }
  async stopBackendAfterStart({
    session: sessionAtRequest,
    backend: backendAtRequest,
    pendingStart
  }) {
    if (pendingStart) {
      try {
        await pendingStart;
      } catch {
      }
    }
    try {
      if (backendAtRequest.stopWithDeclick) {
        await backendAtRequest.stopWithDeclick();
      } else {
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
  clearTransportStopPromise(operation) {
    if (this.transportStopPromise === operation) {
      this.transportStopPromise = null;
    }
  }
  pause() {
    this.session.isPlaying = false;
    this.backend.pause();
    this.isBackendTransportRunning = false;
  }
  // Punch Recording
  enablePunchRecording(enabled) {
    this.session.setPunchEnabled(enabled);
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
  setMonitorWithEffects(trackId, enabled) {
    this.backend.setMonitorWithEffects(trackId, enabled);
  }
  // Input Latency
  getInputLatencyMs() {
    return this.backend.getInputLatencyMs();
  }
  /**
   * Handle loop recording take: stop current recording, save take as a region on a new layer,
   * then restart recording for the next pass.
   */
  async handleLoopRecordingTake(_endFrame) {
    const armedTracks = this.session.tracks.filter((t) => t.armed);
    const takeNumber = this.session.incrementTakeCount();
    const loopRange = this.session.getLoopRange();
    if (!loopRange) return;
    logger.info("AudioEngine", `Loop recording: completing take ${takeNumber}`);
    for (const track of armedTracks) {
      const blob = await this.backend.stopRecording(track.id);
      if (blob.size > 0) {
        const url = URL.createObjectURL(blob);
        await this.backend.cacheBlob(url, blob);
        const startFrame = loopRange.start;
        const durationFrames = loopRange.end - loopRange.start;
        if (durationFrames > 0) {
          const regionId = crypto.randomUUID();
          const region = new Region(
            regionId,
            url,
            startFrame,
            durationFrames,
            0,
            `Take ${takeNumber}`,
            takeNumber
            // layer = take number
          );
          track.playlist.addRegion(region);
          logger.debug(
            "AudioEngine",
            `Loop take ${takeNumber}: Region created on layer ${takeNumber}`
          );
        }
      }
      await this.backend.prepareRecording(track.id);
      this.backend.startRecording(track.id);
    }
  }
  // ─── MIDI Input ─────────────────────────────────────────────────────────
  /**
   * Initialize MIDI input subsystem.
   */
  async initializeMidiInput() {
    return this.midiInput.initialize();
  }
  /**
   * Get available MIDI input devices.
   */
  getMidiInputDevices() {
    return this.midiInput.getInputDevices();
  }
  /**
   * Set the active MIDI input device.
   */
  setMidiInputDevice(inputId) {
    this.midiInput.setActiveInput(inputId);
  }
  /**
   * Get the MidiInput singleton for external consumers.
   */
  getMidiInput() {
    return this.midiInput;
  }
  // ─── MIDI Recording Helpers ──────────────────────────────────────────────
  startMidiRecording() {
    this.midiRecordingNotes.clear();
    this.midiRecordedNotes = [];
    this.midiNoteOnSub = this.midiInput.noteOn.connect(
      (event) => {
        if (!this.session.isRecording) return;
        const currentFrame = this.backend.getCurrentFrame();
        const key = `${event.channel}-${event.pitch}`;
        this.midiRecordingNotes.set(key, {
          pitch: event.pitch,
          velocity: event.velocity,
          channel: event.channel,
          startFrame: currentFrame
        });
      }
    );
    this.midiNoteOffSub = this.midiInput.noteOff.connect(
      (event) => {
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
            pending.channel
          );
          this.midiRecordedNotes.push(note);
          this.midiRecordingNotes.delete(key);
        }
      }
    );
  }
  stopMidiRecording() {
    const currentFrame = this.backend.getCurrentFrame();
    for (const [_key, pending] of this.midiRecordingNotes) {
      const durationFrames = Math.max(1, currentFrame - pending.startFrame);
      const note = new MidiNote(
        crypto.randomUUID(),
        pending.pitch,
        pending.velocity,
        pending.startFrame,
        durationFrames,
        pending.channel
      );
      this.midiRecordedNotes.push(note);
    }
    this.midiRecordingNotes.clear();
    this.midiNoteOnSub?.dispose();
    this.midiNoteOffSub?.dispose();
    this.midiNoteOnSub = null;
    this.midiNoteOffSub = null;
  }
  finalizeMidiRecording() {
    if (this.midiRecordedNotes.length === 0) return;
    const armedMidiTracks = this.session.tracks.filter(
      (t) => t.armed && t.type === "MIDI" /* MIDI */
    );
    for (const track of armedMidiTracks) {
      const startFrame = this.session.recordingStartFrame;
      let minStart = Infinity;
      let maxEnd = 0;
      for (const note of this.midiRecordedNotes) {
        if (note.startFrame < minStart) minStart = note.startFrame;
        if (note.endFrame > maxEnd) maxEnd = note.endFrame;
      }
      const regionStart = Math.min(startFrame, minStart);
      const regionLength = maxEnd - regionStart;
      if (regionLength <= 0) continue;
      const regionId = crypto.randomUUID();
      const region = new MidiRegion(
        regionId,
        "MIDI Recording",
        regionStart,
        regionLength
      );
      for (const note of this.midiRecordedNotes) {
        const relativeNote = new MidiNote(
          note.id,
          note.pitch,
          note.velocity,
          note.startFrame - regionStart,
          note.durationFrames,
          note.channel
        );
        region.addNote(relativeNote);
      }
      track.playlist.addMidiRegion(region);
      logger.info(
        "AudioEngine",
        `MIDI recording finalized: ${this.midiRecordedNotes.length} notes in region ${regionId}`
      );
    }
    this.midiRecordedNotes = [];
  }
  // Recording
  async startRecording() {
    const armedTracks = this.session.tracks.filter((t) => t.armed);
    logger.info(
      "AudioEngine",
      `Starting recording. Armed tracks: ${armedTracks.length}`
    );
    if (this.session.punchEnabled && this.session.punchRangeId) {
      const punchRange = this.session.getPunchRange();
      if (punchRange) {
        logger.info(
          "AudioEngine",
          `Punch recording enabled: ${punchRange.name} (${punchRange.start} - ${punchRange.end})`
        );
        this.backend.enablePunchRecording(true);
        this.backend.setPunchRange(punchRange.start, punchRange.end);
      }
    }
    if (this.session.loopRecordingEnabled) {
      this.session.loopRecordingTakeCount = 0;
      logger.info("AudioEngine", "Loop recording mode active");
    }
    const armedAudioTracks = armedTracks.filter(
      (t) => t.type !== "MIDI" /* MIDI */
    );
    await Promise.all(
      armedAudioTracks.map((t) => this.backend.prepareRecording(t.id))
    );
    armedAudioTracks.forEach((t) => this.backend.startRecording(t.id));
    const armedMidiTracks = armedTracks.filter(
      (t) => t.type === "MIDI" /* MIDI */
    );
    if (armedMidiTracks.length > 0) {
      this.startMidiRecording();
    }
    this.session.startRecording();
    if (this.session.preRollBars > 0) {
      const preRollSeconds = this.session.getPreRollDurationSeconds();
      logger.info(
        "AudioEngine",
        `Pre-roll: ${this.session.preRollBars} bars (${preRollSeconds.toFixed(2)}s)`
      );
      this.preRollWasMetronomeEnabled = this.session.metronomeEnabled;
      if (!this.preRollWasMetronomeEnabled) {
        this.backend.enableMetronome(true);
      }
      armedTracks.forEach((t) => this.backend.setRecordingMuted(t.id, true));
      const currentFrame = this.backend.getCurrentFrame();
      this.preRollTargetFrame = currentFrame + Math.floor(preRollSeconds * this.session.sampleRate);
      this.preRollArmedTracks = armedTracks;
      await this.start();
    } else {
      await this.start();
    }
  }
  async stopRecording() {
    const armedTracks = this.session.tracks.filter((t) => t.armed);
    logger.info(
      "AudioEngine",
      `Stopping recording. Armed tracks: ${armedTracks.length}`
    );
    const endFrame = this.backend.getCurrentFrame();
    this.stopMidiRecording();
    this.finalizeMidiRecording();
    await this.stop();
    const armedAudioTracks = armedTracks.filter(
      (t) => t.type !== "MIDI" /* MIDI */
    );
    for (const track of armedAudioTracks) {
      const blob = await this.backend.stopRecording(track.id);
      if (blob.size > 0) {
        logger.debug(
          "AudioEngine",
          `Recorded blob for track ${track.id}, size: ${blob.size}`
        );
        const url = URL.createObjectURL(blob);
        await this.backend.cacheBlob(url, blob);
        const startFrame = this.session.recordingStartFrame;
        const durationFrames = endFrame - startFrame;
        if (durationFrames > 0) {
          const regionId = crypto.randomUUID();
          const region = new Region(
            regionId,
            url,
            startFrame,
            durationFrames,
            0,
            "Recording"
          );
          track.playlist.insertRecordedRegion(region, track.recordMode);
          logger.debug(
            "AudioEngine",
            `Created Region: ${url}, Start: ${startFrame}, Dur: ${durationFrames}`
          );
        }
      }
    }
    this.session.stopRecording();
  }
  // Track Management - Proxy to Session
  addTrack(name, type = "AUDIO" /* AUDIO */, id) {
    return this.session.addTrack(name, type, id);
  }
  removeTrack(trackId) {
    this.session.removeTrack(trackId);
  }
  // Direct Parameter Control - Now updates Domain, which signals Backend
  setTrackGain(trackId, gain) {
    const track = this.session.getTrack(trackId);
    if (track) {
      track.route.volume = gain;
    }
  }
  setTrackPan(trackId, pan) {
    const track = this.session.getTrack(trackId);
    if (track) {
      track.route.pan = pan;
    }
  }
  // Export
  getExportConfig() {
    return this.session.getExportConfig();
  }
  getExportStatus() {
    return this.session.getExportStatus();
  }
  async exportAudio(config, _status) {
    const trackIds = config.exportMasterOnly ? this.session.tracks.map((t) => t.id) : config.trackIds;
    const _buffer = await this.backend.exportAudio(
      config.startFrame,
      config.endFrame,
      config.sampleRate,
      trackIds
    );
    return;
  }
  async renderRegionsToBuffer(trackId, regionIds) {
    return this.backend.renderRegionsToBuffer(trackId, regionIds);
  }
  // Metering
  getMeterData(trackId) {
    return this.backend.getMeterData(trackId);
  }
  getMasterMeterData() {
    return this.backend.getMasterMeterData();
  }
  getAnalyserNode(trackId) {
    return this.backend.getAnalyserNode(trackId);
  }
  // Region Audition
  auditionRegion(trackId, regionId) {
    this.backend.auditionRegion(trackId, regionId);
  }
  stopAudition() {
    this.backend.stopAudition();
  }
  // MIDI Instrument
  setMidiInstrument(trackId, instrumentType) {
    this.backend.setMidiInstrument(trackId, instrumentType);
  }
  // Strip Silence
  async stripSilence(trackId, regionId, thresholdDb, minLengthFrames) {
    return this.backend.stripSilence(
      trackId,
      regionId,
      thresholdDb,
      minLengthFrames
    );
  }
  // Normalize Region
  async normalizeRegion(trackId, regionId, targetDb) {
    return this.backend.normalizeRegion(trackId, regionId, targetDb);
  }
  // MIDI Panic
  midiPanic() {
    this.backend.midiPanic();
  }
  // Stereo Master Metering
  getMasterStereoMeterData() {
    return this.backend.getMasterStereoMeterData();
  }
  // Region Reverse
  async reverseRegionBuffer(trackId, regionId) {
    return this.backend.reverseRegionBuffer(trackId, regionId);
  }
  // Session Management
  loadSession(newSession) {
    this.stopImmediately();
    this.clearSessionFromBackend();
    this.disconnectSessionSignals();
    this.session = newSession;
    this.syncSessionToBackend();
    this.setupSessionListeners();
  }
  loadSessionFromSnapshot(snapshot) {
    this.stopImmediately();
    this.clearSessionFromBackend();
    this.disconnectSessionSignals();
    this.session = Session.fromJSON(snapshot);
    this.syncSessionToBackend();
    this.setupSessionListeners();
  }
  stopImmediately() {
    this.transportStartPromise = null;
    this.transportStopPromise = null;
    this.backend.stop();
    this.isBackendTransportRunning = false;
    this.session.stopTransport();
    this.session.completeTransportStop();
  }
};

// core/src/domain/Source.ts
var Source = class {
  constructor(id, name, url, duration, sampleRate = 44100, channelCount = 2, videoMetadata) {
    /** Bitflags describing source properties (see SourceFlags). */
    this.flags = 0;
    /** Reference count tracking how many regions/clips use this source. */
    this._useCount = 0;
    /** Cached peak data for waveform display at various zoom levels. */
    this._peakCache = /* @__PURE__ */ new Map();
    /** Analysis results (populated lazily by AudioAnalyzer). */
    this._analysisData = null;
    /** Emitted when peak data for a given resolution is added or updated. */
    this.peakCacheUpdated = new Signal();
    /** Emitted when analysis data is set or replaced. */
    this.analysisCompleted = new Signal();
    /** Detected transient positions in frames. */
    this.transients = [];
    /** Cue markers mapping frame positions to names. */
    this.cueMarkers = /* @__PURE__ */ new Map();
    /** Positions (in frames) where xruns / buffer underruns occurred during capture. */
    this.xrunPositions = [];
    this.id = id;
    this.name = name;
    this.url = url;
    this.duration = duration;
    this.sampleRate = sampleRate;
    this.channelCount = channelCount;
    this.videoMetadata = videoMetadata;
  }
  /**
   * Check if this source originated from a video file
   */
  isVideoSource() {
    return this.videoMetadata !== void 0;
  }
  // --- Use count ---
  get useCount() {
    return this._useCount;
  }
  addUse() {
    this._useCount++;
  }
  removeUse() {
    if (this._useCount > 0) {
      this._useCount--;
    }
  }
  // --- Flag helpers ---
  /**
   * Check whether a specific flag is set.
   */
  hasFlag(flag) {
    return (this.flags & flag) !== 0;
  }
  /**
   * Set a specific flag.
   */
  setFlag(flag) {
    this.flags |= flag;
  }
  /**
   * Clear a specific flag.
   */
  clearFlag(flag) {
    this.flags &= ~flag;
  }
  // --- Peak cache ---
  /**
   * Store peak data for a given resolution (frames per peak entry).
   *
   * Replaces any previously cached data at the same resolution.
   * Emits {@link peakCacheUpdated} with the resolution key.
   */
  setPeakData(resolution, data) {
    this._peakCache.set(resolution, data);
    this.peakCacheUpdated.emit(resolution);
  }
  /**
   * Retrieve cached peak data for a given resolution.
   *
   * @returns The peak data, or `undefined` if not yet computed.
   */
  getPeakData(resolution) {
    return this._peakCache.get(resolution);
  }
  /**
   * Check whether peak data exists for a given resolution.
   */
  hasPeakData(resolution) {
    return this._peakCache.has(resolution);
  }
  /**
   * Clear all cached peak data for this source.
   */
  clearPeakCache() {
    this._peakCache.clear();
  }
  // --- Analysis data ---
  /**
   * Set or replace analysis data for this source.
   *
   * This also updates the legacy {@link transients} array from the
   * analysis results for backward compatibility.
   * Emits {@link analysisCompleted} with the new data.
   */
  setAnalysisData(data) {
    this._analysisData = data;
    this.transients = data.transients;
    this.analysisCompleted.emit(data);
  }
  /**
   * Retrieve the analysis data, or `null` if no analysis has been run.
   */
  getAnalysisData() {
    return this._analysisData;
  }
  // --- Cleanup ---
  /**
   * Release resources held by this source.
   *
   * Revokes the blob URL (if applicable), clears the peak cache, and
   * disconnects all signal listeners. After disposal the source should
   * not be used.
   */
  dispose() {
    if (this.url && this.url.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(this.url);
      } catch {
      }
    }
    this.clearPeakCache();
    this._analysisData = null;
    this.peakCacheUpdated.clear();
    this.analysisCompleted.clear();
  }
};
export {
  AudioEngine,
  Region,
  Session,
  Source,
  TrackType
};
