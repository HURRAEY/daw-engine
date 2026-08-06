var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// core/src/lib/Signal.ts
var Signal;
var init_Signal = __esm({
  "core/src/lib/Signal.ts"() {
    "use strict";
    Signal = class {
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
  }
});

// core/src/automation/AutomationMode.ts
var AutomationMode;
var init_AutomationMode = __esm({
  "core/src/automation/AutomationMode.ts"() {
    "use strict";
    AutomationMode = /* @__PURE__ */ ((AutomationMode2) => {
      AutomationMode2["OFF"] = "off";
      AutomationMode2["READ"] = "read";
      AutomationMode2["WRITE"] = "write";
      AutomationMode2["TOUCH"] = "touch";
      AutomationMode2["LATCH"] = "latch";
      return AutomationMode2;
    })(AutomationMode || {});
  }
});

// core/src/automation/AutomationCurve.ts
var AutomationCurve;
var init_AutomationCurve = __esm({
  "core/src/automation/AutomationCurve.ts"() {
    "use strict";
    AutomationCurve = class _AutomationCurve {
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
  }
});

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
var init_PointThinning = __esm({
  "core/src/automation/PointThinning.ts"() {
    "use strict";
  }
});

// core/src/automation/AutomationList.ts
var AutomationList;
var init_AutomationList = __esm({
  "core/src/automation/AutomationList.ts"() {
    "use strict";
    init_Signal();
    init_AutomationCurve();
    init_PointThinning();
    AutomationList = class _AutomationList {
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
  }
});

// core/src/processing/Processor.ts
var Processor;
var init_Processor = __esm({
  "core/src/processing/Processor.ts"() {
    "use strict";
    init_Signal();
    init_AutomationList();
    Processor = class {
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
  }
});

// core/src/processing/GainProcessor.ts
var GainProcessor;
var init_GainProcessor = __esm({
  "core/src/processing/GainProcessor.ts"() {
    "use strict";
    init_Processor();
    init_Signal();
    GainProcessor = class extends Processor {
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
  }
});

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
var PannerType, PanLaw, Panner;
var init_Panner = __esm({
  "core/src/processing/Panner.ts"() {
    "use strict";
    init_Processor();
    init_Signal();
    PannerType = /* @__PURE__ */ ((PannerType2) => {
      PannerType2["STEREO_BALANCE"] = "stereo_balance";
      PannerType2["STEREO_WIDTH"] = "stereo_width";
      PannerType2["EQUAL_POWER"] = "equal_power";
      PannerType2["LINEAR"] = "linear";
      return PannerType2;
    })(PannerType || {});
    PanLaw = /* @__PURE__ */ ((PanLaw2) => {
      PanLaw2["MINUS_3DB"] = "-3dB";
      PanLaw2["MINUS_4_5DB"] = "-4.5dB";
      PanLaw2["MINUS_6DB"] = "-6dB";
      PanLaw2["ZERO_DB"] = "0dB";
      return PanLaw2;
    })(PanLaw || {});
    Panner = class extends Processor {
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
  }
});

// core/src/processing/PolarityProcessor.ts
var PolarityProcessor;
var init_PolarityProcessor = __esm({
  "core/src/processing/PolarityProcessor.ts"() {
    "use strict";
    init_Processor();
    init_Signal();
    PolarityProcessor = class extends Processor {
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
  }
});

// core/src/processing/IO.ts
var IO;
var init_IO = __esm({
  "core/src/processing/IO.ts"() {
    "use strict";
    init_Signal();
    IO = class {
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
  }
});

// core/src/audio/engine/LatencyCompensator.ts
var LatencyCompensator;
var init_LatencyCompensator = __esm({
  "core/src/audio/engine/LatencyCompensator.ts"() {
    "use strict";
    LatencyCompensator = class {
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
  }
});

// core/src/domain/Route.ts
var Route;
var init_Route = __esm({
  "core/src/domain/Route.ts"() {
    "use strict";
    init_GainProcessor();
    init_Panner();
    init_PolarityProcessor();
    init_IO();
    init_Signal();
    init_LatencyCompensator();
    Route = class {
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
  }
});

// core/src/domain/temporal/types.ts
var TimeDomain, TICKS_PER_BEAT, Beats;
var init_types = __esm({
  "core/src/domain/temporal/types.ts"() {
    "use strict";
    TimeDomain = /* @__PURE__ */ ((TimeDomain2) => {
      TimeDomain2[TimeDomain2["AudioTime"] = 0] = "AudioTime";
      TimeDomain2[TimeDomain2["BeatTime"] = 1] = "BeatTime";
      return TimeDomain2;
    })(TimeDomain || {});
    TICKS_PER_BEAT = 1920;
    Beats = class _Beats {
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
  }
});

// core/src/domain/OverlapType.ts
var OverlapType;
var init_OverlapType = __esm({
  "core/src/domain/OverlapType.ts"() {
    "use strict";
    OverlapType = /* @__PURE__ */ ((OverlapType2) => {
      OverlapType2[OverlapType2["NONE"] = 0] = "NONE";
      OverlapType2[OverlapType2["INTERNAL"] = 1] = "INTERNAL";
      OverlapType2[OverlapType2["START"] = 2] = "START";
      OverlapType2[OverlapType2["END"] = 3] = "END";
      OverlapType2[OverlapType2["EXTERNAL"] = 4] = "EXTERNAL";
      return OverlapType2;
    })(OverlapType || {});
  }
});

// core/src/domain/FadeEnvelope.ts
function computeFadeGain(t, shape) {
  const s = Math.max(0, Math.min(1, t));
  switch (shape) {
    case 0 /* LINEAR */:
      return s;
    case 1 /* EQUAL_POWER */:
      return Math.sqrt(s);
    case 2 /* S_CURVE */:
      return s * s * (3 - 2 * s);
    case 3 /* FAST */:
      return s * s * s;
    case 4 /* SLOW */:
      return 1 - (1 - s) ** 3;
    case 5 /* CUSTOM */:
      return s;
    default:
      return s;
  }
}
var FadeShape;
var init_FadeEnvelope = __esm({
  "core/src/domain/FadeEnvelope.ts"() {
    "use strict";
    FadeShape = /* @__PURE__ */ ((FadeShape2) => {
      FadeShape2[FadeShape2["LINEAR"] = 0] = "LINEAR";
      FadeShape2[FadeShape2["EQUAL_POWER"] = 1] = "EQUAL_POWER";
      FadeShape2[FadeShape2["S_CURVE"] = 2] = "S_CURVE";
      FadeShape2[FadeShape2["FAST"] = 3] = "FAST";
      FadeShape2[FadeShape2["SLOW"] = 4] = "SLOW";
      FadeShape2[FadeShape2["CUSTOM"] = 5] = "CUSTOM";
      return FadeShape2;
    })(FadeShape || {});
  }
});

// core/src/domain/Region.ts
var Region_exports = {};
__export(Region_exports, {
  Region: () => Region
});
var Region;
var init_Region = __esm({
  "core/src/domain/Region.ts"() {
    "use strict";
    init_Signal();
    Region = class _Region {
      constructor(id, sourceId, start, length, sourceStart, name, layer = 0) {
        // Source usage
        this.sourceStart = 0;
        // Playback properties
        this.gain = 1;
        this.muted = false;
        this.layer = 0;
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
  }
});

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
var Crossfade;
var init_Crossfade = __esm({
  "core/src/domain/Crossfade.ts"() {
    "use strict";
    init_Signal();
    Crossfade = class {
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
  }
});

// core/src/domain/ThawList.ts
var ThawList;
var init_ThawList = __esm({
  "core/src/domain/ThawList.ts"() {
    "use strict";
    ThawList = class {
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
  }
});

// core/src/domain/Playlist.ts
var Playlist;
var init_Playlist = __esm({
  "core/src/domain/Playlist.ts"() {
    "use strict";
    init_Region();
    init_Crossfade();
    init_Signal();
    init_ThawList();
    Playlist = class {
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
          if (!r.muted && r.covers(frame) && r.layer > region.layer) {
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
          const overlap = Crossfade.calculateOverlap(region, otherRegion);
          if (!overlap) {
            this.removeCrossfade(xfade.id);
          } else {
            xfade.setPosition(overlap.position);
            xfade.setLength(overlap.length);
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
  }
});

// core/src/domain/MonitorMode.ts
var MonitorMode;
var init_MonitorMode = __esm({
  "core/src/domain/MonitorMode.ts"() {
    "use strict";
    MonitorMode = /* @__PURE__ */ ((MonitorMode2) => {
      MonitorMode2["AUTO"] = "auto";
      MonitorMode2["INPUT"] = "input";
      MonitorMode2["DISK"] = "disk";
      MonitorMode2["EXTERNAL"] = "external";
      return MonitorMode2;
    })(MonitorMode || {});
  }
});

// core/src/domain/Track.ts
var TrackType, Track;
var init_Track = __esm({
  "core/src/domain/Track.ts"() {
    "use strict";
    init_Route();
    init_Playlist();
    init_Signal();
    TrackType = /* @__PURE__ */ ((TrackType2) => {
      TrackType2["AUDIO"] = "AUDIO";
      TrackType2["MIDI"] = "MIDI";
      TrackType2["AUX"] = "AUX";
      TrackType2["BUS"] = "BUS";
      TrackType2["FOLDER"] = "FOLDER";
      TrackType2["VCA"] = "VCA";
      return TrackType2;
    })(TrackType || {});
    Track = class {
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
    };
  }
});

// core/src/domain/Range.ts
var Range;
var init_Range = __esm({
  "core/src/domain/Range.ts"() {
    "use strict";
    init_Signal();
    Range = class _Range {
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
  }
});

// core/src/domain/MidiNote.ts
var MidiNote;
var init_MidiNote = __esm({
  "core/src/domain/MidiNote.ts"() {
    "use strict";
    init_Signal();
    MidiNote = class _MidiNote {
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
  }
});

// core/src/domain/MidiRegion.ts
var MidiRegion;
var init_MidiRegion = __esm({
  "core/src/domain/MidiRegion.ts"() {
    "use strict";
    init_Signal();
    init_MidiNote();
    MidiRegion = class _MidiRegion {
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
  }
});

// core/src/domain/SendBus.ts
var SendBus;
var init_SendBus = __esm({
  "core/src/domain/SendBus.ts"() {
    "use strict";
    init_Signal();
    SendBus = class {
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
  }
});

// core/src/domain/Marker.ts
var Marker;
var init_Marker = __esm({
  "core/src/domain/Marker.ts"() {
    "use strict";
    init_Signal();
    Marker = class _Marker {
      constructor(id, name, position, color = "#ffcc00", locked = false) {
        this.changed = new Signal();
        this.removed = new Signal();
        this.id = id;
        this._name = name;
        this._position = position;
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
          this._position = Math.max(0, value);
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
  }
});

// core/src/domain/RegionGroup.ts
var RegionGroup;
var init_RegionGroup = __esm({
  "core/src/domain/RegionGroup.ts"() {
    "use strict";
    init_Signal();
    RegionGroup = class {
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
  }
});

// core/src/utils/DitherProcessor.ts
var DitherProcessor;
var init_DitherProcessor = __esm({
  "core/src/utils/DitherProcessor.ts"() {
    "use strict";
    DitherProcessor = class {
      /**
       * Apply dithering to Float32 samples before quantization.
       * Should be called before converting to lower bit depth (e.g., float32 -> int16).
       *
       * @param samples Float32 audio data (modified in-place)
       * @param targetBits Target bit depth (16 or 24)
       * @param ditherType Type of dithering to apply
       */
      static apply(samples, targetBits, ditherType = "tpdf" /* TPDF */) {
        if (ditherType === "none" /* NONE */) return;
        const quantizationStep = 1 / Math.pow(2, targetBits - 1);
        if (ditherType === "tpdf" /* TPDF */) {
          this.applyTPDF(samples, quantizationStep);
        } else if (ditherType === "shaped" /* SHAPED */) {
          this.applyShaped(samples, quantizationStep);
        }
      }
      /**
       * TPDF dithering: add triangular-distributed random noise at +-1 LSB
       * and quantize to the target bit depth in a single step.
       * This is the standard method used in professional audio mastering.
       *
       * The dither noise must be applied immediately before truncation to integer
       * to correctly decorrelate the quantization error. Adding dither without
       * quantizing would leave the samples in float space with no actual
       * bit-depth reduction.
       */
      static applyTPDF(samples, quantizationStep) {
        const scale = 1 / quantizationStep;
        for (let i = 0; i < samples.length; i++) {
          const r1 = Math.random();
          const r2 = Math.random();
          const dither = (r1 - r2) * quantizationStep;
          const quantized = Math.round((samples[i] + dither) * scale) / scale;
          samples[i] = quantized;
        }
      }
      /**
       * Noise-shaped dithering: error feedback filter for psychoacoustic masking.
       * Uses a simple first-order high-pass error feedback filter.
       * Like TPDF, dither is applied and quantization happens in a single step.
       */
      static applyShaped(samples, quantizationStep) {
        const scale = 1 / quantizationStep;
        let previousError = 0;
        for (let i = 0; i < samples.length; i++) {
          const r1 = Math.random();
          const r2 = Math.random();
          const dither = (r1 - r2) * quantizationStep;
          const shaped = samples[i] + dither - previousError * 0.5;
          const quantized = Math.round(shaped * scale) / scale;
          previousError = quantized - samples[i];
          samples[i] = quantized;
        }
      }
    };
  }
});

// core/src/domain/ExportConfig.ts
var ExportConfig;
var init_ExportConfig = __esm({
  "core/src/domain/ExportConfig.ts"() {
    "use strict";
    init_Signal();
    ExportConfig = class _ExportConfig {
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
  }
});

// core/src/domain/ExportStatus.ts
var ExportStatus;
var init_ExportStatus = __esm({
  "core/src/domain/ExportStatus.ts"() {
    "use strict";
    init_Signal();
    ExportStatus = class {
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
  }
});

// core/src/domain/GridSettings.ts
var GridType, SnapMode, GridSettings;
var init_GridSettings = __esm({
  "core/src/domain/GridSettings.ts"() {
    "use strict";
    init_Signal();
    GridType = /* @__PURE__ */ ((GridType2) => {
      GridType2["NO_GRID"] = "no_grid";
      GridType2["BEAT_1_32"] = "1/32";
      GridType2["BEAT_1_16"] = "1/16";
      GridType2["BEAT_1_8"] = "1/8";
      GridType2["BEAT_1_4"] = "1/4";
      GridType2["BEAT_1_2"] = "1/2";
      GridType2["BEAT_1"] = "1";
      GridType2["BEAT_2"] = "2";
      GridType2["BEAT_4"] = "4";
      GridType2["BEAT_8"] = "8";
      GridType2["TIMECODE"] = "timecode";
      GridType2["MINSEC"] = "minsec";
      GridType2["SAMPLES"] = "samples";
      GridType2["CD_FRAMES"] = "cdframes";
      return GridType2;
    })(GridType || {});
    SnapMode = /* @__PURE__ */ ((SnapMode2) => {
      SnapMode2["NO_SNAP"] = "no_snap";
      SnapMode2["SNAP_TO_GRID"] = "snap_to_grid";
      SnapMode2["SNAP_MAGNETIC"] = "snap_magnetic";
      return SnapMode2;
    })(SnapMode || {});
    GridSettings = class {
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
  }
});

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
var TempoMap;
var init_TempoMap = __esm({
  "core/src/domain/temporal/TempoMap.ts"() {
    "use strict";
    init_types();
    init_Signal();
    TempoMap = class {
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
  }
});

// core/src/processing/PluginInsert.ts
var DEFAULT_SAMPLE_RATE, PluginInsert;
var init_PluginInsert = __esm({
  "core/src/processing/PluginInsert.ts"() {
    "use strict";
    init_Processor();
    DEFAULT_SAMPLE_RATE = 44100;
    PluginInsert = class extends Processor {
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
  }
});

// core/src/domain/MixerScene.ts
var MixerScene, MixerSceneManager;
var init_MixerScene = __esm({
  "core/src/domain/MixerScene.ts"() {
    "use strict";
    init_Signal();
    init_PluginInsert();
    MixerScene = class _MixerScene {
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
    MixerSceneManager = class {
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
  }
});

// core/src/domain/TrackGroup.ts
var TrackGroup;
var init_TrackGroup = __esm({
  "core/src/domain/TrackGroup.ts"() {
    "use strict";
    init_Signal();
    TrackGroup = class _TrackGroup {
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
  }
});

// core/src/domain/CDMarker.ts
var CDMarker_exports = {};
__export(CDMarker_exports, {
  CDMarker: () => CDMarker,
  generateCueSheet: () => generateCueSheet
});
function generateCueSheet(markers, sampleRate, albumTitle = "Untitled", albumPerformer = "", filename = "audio.wav") {
  const sorted = [...markers].sort((a, b) => a.index - b.index);
  const lines = [];
  if (albumPerformer) lines.push(`PERFORMER "${albumPerformer}"`);
  lines.push(`TITLE "${albumTitle}"`);
  lines.push(`FILE "${filename}" WAVE`);
  for (const marker of sorted) {
    lines.push(`  TRACK ${String(marker.index).padStart(2, "0")} AUDIO`);
    if (marker.title) lines.push(`    TITLE "${marker.title}"`);
    if (marker.performer) lines.push(`    PERFORMER "${marker.performer}"`);
    if (marker.isrc) lines.push(`    ISRC ${marker.isrc}`);
    const totalSeconds = marker.position / sampleRate;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const cdFrames = Math.floor(totalSeconds % 1 * 75);
    lines.push(
      `    INDEX 01 ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(cdFrames).padStart(2, "0")}`
    );
  }
  return lines.join("\n") + "\n";
}
var CDMarker;
var init_CDMarker = __esm({
  "core/src/domain/CDMarker.ts"() {
    "use strict";
    init_Signal();
    CDMarker = class _CDMarker {
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
  }
});

// core/src/domain/VCATrack.ts
var VCATrack;
var init_VCATrack = __esm({
  "core/src/domain/VCATrack.ts"() {
    "use strict";
    init_Signal();
    VCATrack = class _VCATrack {
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
  }
});

// core/src/domain/TransportMode.ts
var ScrubState;
var init_TransportMode = __esm({
  "core/src/domain/TransportMode.ts"() {
    "use strict";
    ScrubState = class {
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
  }
});

// core/src/domain/TransportFSM.ts
var MotionState, MAX_SPEED, MIN_SPEED, TransportFSM;
var init_TransportFSM = __esm({
  "core/src/domain/TransportFSM.ts"() {
    "use strict";
    init_Signal();
    MotionState = /* @__PURE__ */ ((MotionState2) => {
      MotionState2["STOPPED"] = "STOPPED";
      MotionState2["ROLLING"] = "ROLLING";
      MotionState2["DECLICK_TO_STOP"] = "DECLICK_TO_STOP";
      MotionState2["DECLICK_TO_LOCATE"] = "DECLICK_TO_LOCATE";
      MotionState2["WAITING_FOR_LOCATE"] = "WAITING_FOR_LOCATE";
      return MotionState2;
    })(MotionState || {});
    MAX_SPEED = 8;
    MIN_SPEED = 0.0625;
    TransportFSM = class {
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
  }
});

// core/src/domain/SidechainConfig.ts
var SidechainConfig, SIDECHAIN_FILTER_FREQ_MIN, SIDECHAIN_FILTER_FREQ_MAX, SIDECHAIN_FILTER_FREQ_DEFAULT;
var init_SidechainConfig = __esm({
  "core/src/domain/SidechainConfig.ts"() {
    "use strict";
    init_Signal();
    SidechainConfig = class _SidechainConfig {
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
    SIDECHAIN_FILTER_FREQ_MIN = 20;
    SIDECHAIN_FILTER_FREQ_MAX = 500;
    SIDECHAIN_FILTER_FREQ_DEFAULT = 80;
  }
});

// core/src/domain/Take.ts
var Take, TakeLane;
var init_Take = __esm({
  "core/src/domain/Take.ts"() {
    "use strict";
    init_Signal();
    Take = class _Take {
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
    TakeLane = class {
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
  }
});

// core/src/lib/DisposableGroup.ts
var DisposableGroup;
var init_DisposableGroup = __esm({
  "core/src/lib/DisposableGroup.ts"() {
    "use strict";
    DisposableGroup = class {
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
  }
});

// core/src/domain/TrackGroupLinkingService.ts
var TrackGroupLinkingService;
var init_TrackGroupLinkingService = __esm({
  "core/src/domain/TrackGroupLinkingService.ts"() {
    "use strict";
    init_DisposableGroup();
    TrackGroupLinkingService = class {
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
  }
});

// core/src/utils/Logger.ts
var Logger, logger;
var init_Logger = __esm({
  "core/src/utils/Logger.ts"() {
    "use strict";
    Logger = class {
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
    logger = new Logger();
  }
});

// core/src/domain/Session.ts
var Session_exports = {};
__export(Session_exports, {
  Session: () => Session
});
var Session;
var init_Session = __esm({
  "core/src/domain/Session.ts"() {
    "use strict";
    init_Track();
    init_Route();
    init_Range();
    init_Region();
    init_MidiRegion();
    init_SendBus();
    init_Marker();
    init_RegionGroup();
    init_Signal();
    init_ExportConfig();
    init_ExportStatus();
    init_GridSettings();
    init_TempoMap();
    init_MixerScene();
    init_TrackGroup();
    init_CDMarker();
    init_VCATrack();
    init_TransportMode();
    init_TransportFSM();
    init_SidechainConfig();
    init_Take();
    init_TrackGroupLinkingService();
    init_Logger();
    Session = class _Session {
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
        this.transportFSM.enqueue({ type: "DeclickDone" });
        this.isPlaying = false;
        this.transportFrame = 0;
        this.transportPositionChanged.emit(0);
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
        this._markers.set(markerId, marker);
        marker.changed.connect(() => {
          this.markerChanged.emit(marker);
        });
        this.markerAdded.emit(marker);
        return marker;
      }
      removeMarker(markerId) {
        const marker = this._markers.get(markerId);
        if (marker) {
          marker.removed.emit();
          this._markers.delete(markerId);
          this.markerRemoved.emit(markerId);
        }
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
        this._sidechainConfigs.set(configId, config);
        return config;
      }
      removeSidechainConfig(configId) {
        this._sidechainConfigs.delete(configId);
      }
      getSidechainConfig(configId) {
        return this._sidechainConfigs.get(configId);
      }
      getSidechainConfigsForTrack(trackId) {
        return Array.from(this._sidechainConfigs.values()).filter(
          (c) => c.targetTrackId === trackId
        );
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
            session._markers.set(marker.id, marker);
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
            session._sidechainConfigs.set(config.id, config);
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
  }
});

// core/src/index.ts
init_Session();
init_Track();
init_Region();
init_Playlist();

// core/src/domain/Source.ts
init_Signal();
var SourceFlags = /* @__PURE__ */ ((SourceFlags2) => {
  SourceFlags2[SourceFlags2["WRITABLE"] = 1] = "WRITABLE";
  SourceFlags2[SourceFlags2["CAN_RENAME"] = 2] = "CAN_RENAME";
  SourceFlags2[SourceFlags2["REMOVABLE"] = 4] = "REMOVABLE";
  SourceFlags2[SourceFlags2["MISSING"] = 8] = "MISSING";
  SourceFlags2[SourceFlags2["RF64_RIFF"] = 16] = "RF64_RIFF";
  return SourceFlags2;
})(SourceFlags || {});
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

// core/src/index.ts
init_Range();
init_Marker();
init_MidiNote();
init_MidiRegion();
init_SendBus();
init_GridSettings();
init_ExportConfig();
init_ExportStatus();

// core/src/domain/MouseMode.ts
var MouseMode = /* @__PURE__ */ ((MouseMode2) => {
  MouseMode2["OBJECT"] = "object";
  MouseMode2["RANGE"] = "range";
  MouseMode2["CUT"] = "cut";
  MouseMode2["DRAW"] = "draw";
  MouseMode2["CONTENT"] = "content";
  MouseMode2["AUDITION"] = "audition";
  MouseMode2["STRETCH"] = "stretch";
  MouseMode2["INTERNAL_EDIT"] = "internal_edit";
  return MouseMode2;
})(MouseMode || {});

// core/src/domain/EditMode.ts
var EditMode = /* @__PURE__ */ ((EditMode2) => {
  EditMode2["SLIDE"] = "slide";
  EditMode2["RIPPLE"] = "ripple";
  EditMode2["LOCK"] = "lock";
  return EditMode2;
})(EditMode || {});

// core/src/domain/ZoomFocus.ts
var ZoomFocus = /* @__PURE__ */ ((ZoomFocus2) => {
  ZoomFocus2["LEFT"] = "left";
  ZoomFocus2["RIGHT"] = "right";
  ZoomFocus2["CENTER"] = "center";
  ZoomFocus2["PLAYHEAD"] = "playhead";
  ZoomFocus2["MOUSE"] = "mouse";
  ZoomFocus2["EDIT_POINT"] = "edit_point";
  return ZoomFocus2;
})(ZoomFocus || {});

// core/src/domain/RulerType.ts
var RulerType = /* @__PURE__ */ ((RulerType2) => {
  RulerType2["BBT"] = "bbt";
  RulerType2["TIMECODE"] = "timecode";
  RulerType2["MINSEC"] = "minsec";
  RulerType2["SAMPLES"] = "samples";
  RulerType2["MARKERS"] = "markers";
  RulerType2["RANGES"] = "ranges";
  RulerType2["TEMPO"] = "tempo";
  return RulerType2;
})(RulerType || {});

// core/src/domain/ClockMode.ts
var ClockMode = /* @__PURE__ */ ((ClockMode2) => {
  ClockMode2["MINSEC"] = "minsec";
  ClockMode2["BBT"] = "bbt";
  ClockMode2["TIMECODE"] = "timecode";
  ClockMode2["SAMPLES"] = "samples";
  return ClockMode2;
})(ClockMode || {});
function formatClock(frame, sampleRate, mode, bpm = 120, timeSigNum = 4) {
  if (sampleRate <= 0) return "---";
  switch (mode) {
    case "minsec" /* MINSEC */: {
      const totalSeconds = frame / sampleRate;
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor(totalSeconds % 3600 / 60);
      const seconds = Math.floor(totalSeconds % 60);
      const millis = Math.floor(totalSeconds % 1 * 1e3);
      return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0") + "." + String(millis).padStart(3, "0");
    }
    case "bbt" /* BBT */: {
      const secondsPerBeat = 60 / bpm;
      const framesPerBeat = secondsPerBeat * sampleRate;
      const totalBeats = frame / framesPerBeat;
      const bar = Math.floor(totalBeats / timeSigNum) + 1;
      const beat = Math.floor(totalBeats % timeSigNum) + 1;
      const ticksPerBeat = 1920;
      const tick = Math.floor(totalBeats % 1 * ticksPerBeat);
      return String(bar).padStart(3, "0") + "|" + String(beat).padStart(2, "0") + "|" + String(tick).padStart(4, "0");
    }
    case "timecode" /* TIMECODE */: {
      const fps = 30;
      const totalSeconds = frame / sampleRate;
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor(totalSeconds % 3600 / 60);
      const seconds = Math.floor(totalSeconds % 60);
      const frames = Math.floor(totalSeconds % 1 * fps);
      return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0") + ":" + String(frames).padStart(2, "0");
    }
    case "samples" /* SAMPLES */: {
      return String(Math.floor(frame)).padStart(10, "0");
    }
    default:
      return "---";
  }
}

// core/src/index.ts
init_types();
init_TempoMap();

// core/src/domain/RecordMode.ts
var RecordMode = /* @__PURE__ */ ((RecordMode2) => {
  RecordMode2["SOUND_ON_SOUND"] = "sound_on_sound";
  RecordMode2["NON_LAYERED"] = "non_layered";
  RecordMode2["LAYERED"] = "layered";
  return RecordMode2;
})(RecordMode || {});

// core/src/index.ts
init_MonitorMode();

// core/src/domain/RegionClipboard.ts
var RegionClipboard = class _RegionClipboard {
  constructor() {
    this._clipboardData = [];
    this._pasteCount = 0;
  }
  static getInstance() {
    if (!_RegionClipboard.instance) {
      _RegionClipboard.instance = new _RegionClipboard();
    }
    return _RegionClipboard.instance;
  }
  /**
   * Region을 클립보드에 복사
   */
  copy(regions, trackIds) {
    if (regions.length !== trackIds.length) {
      throw new Error("Regions and trackIds length mismatch");
    }
    this._clipboardData = regions.map((region, index) => ({
      sourceId: region.sourceId,
      start: region.start,
      length: region.length,
      originalTrackId: trackIds[index],
      name: region.name || "Region"
    }));
  }
  /**
   * 클립보드에서 Region 데이터 가져오기
   */
  getClipboardData() {
    return this._clipboardData;
  }
  /**
   * 클립보드가 비어있는지 확인
   */
  isEmpty() {
    return this._clipboardData.length === 0;
  }
  /**
   * 클립보드 비우기
   */
  clear() {
    this._clipboardData = [];
    this._pasteCount = 0;
  }
  /**
   * Paste count for offset tracking.
   */
  get pasteCount() {
    return this._pasteCount;
  }
  incrementPasteCount() {
    this._pasteCount++;
  }
  /**
   * Reset paste count.
   * Called on undo/redo.
   */
  resetPasteCount() {
    this._pasteCount = 0;
  }
};

// core/src/index.ts
init_RegionGroup();
init_Route();

// core/src/domain/CrossfadeEngine.ts
var CrossfadeEngine = class _CrossfadeEngine {
  static {
    /**
     * The crossfade curve type used for automatic crossfade calculations.
     * - 'equal-power' (default): constant power crossfade, smooth loudness transition
     * - 'linear': simple linear gain ramp
     * - 's-curve': slow start/end with fast middle transition
     */
    this.curveType = "equal-power";
  }
  /**
   * Sets the crossfade curve type for all subsequent crossfade calculations.
   */
  static setCurveType(type) {
    _CrossfadeEngine.curveType = type;
  }
  /**
   * Re-calculates fades for a given list of regions.
   * Assumes regions are passed sorted by start time.
   */
  static calculateCrossfades(regions, _curveType) {
    if (regions.length < 2) return;
    for (let i = 0; i < regions.length - 1; i++) {
      const current = regions[i];
      const next = regions[i + 1];
      if (current.end > next.start) {
        const overlapAmount = current.end - next.start;
        current.setFadeOut(overlapAmount);
        next.setFadeIn(overlapAmount);
      } else if (current.end === next.start) {
      }
    }
  }
};

// core/src/index.ts
init_FadeEnvelope();
init_MixerScene();
init_TrackGroup();
init_TrackGroupLinkingService();
init_SidechainConfig();
init_VCATrack();

// core/src/domain/TriggerBox.ts
init_Signal();
var TriggerState = /* @__PURE__ */ ((TriggerState2) => {
  TriggerState2["STOPPED"] = "STOPPED";
  TriggerState2["WAITING_TO_START"] = "WAITING_TO_START";
  TriggerState2["RUNNING"] = "RUNNING";
  TriggerState2["WAITING_TO_STOP"] = "WAITING_TO_STOP";
  TriggerState2["WAITING_TO_RETRIGGER"] = "WAITING_TO_RETRIGGER";
  return TriggerState2;
})(TriggerState || {});
var LaunchQuantize = /* @__PURE__ */ ((LaunchQuantize2) => {
  LaunchQuantize2["NONE"] = "NONE";
  LaunchQuantize2["BAR"] = "BAR";
  LaunchQuantize2["BEAT"] = "BEAT";
  LaunchQuantize2["HALF_BAR"] = "HALF_BAR";
  return LaunchQuantize2;
})(LaunchQuantize || {});
var FollowAction = /* @__PURE__ */ ((FollowAction2) => {
  FollowAction2["NONE"] = "NONE";
  FollowAction2["AGAIN"] = "AGAIN";
  FollowAction2["NEXT"] = "NEXT";
  FollowAction2["PREV"] = "PREV";
  FollowAction2["RANDOM"] = "RANDOM";
  FollowAction2["STOP"] = "STOP";
  return FollowAction2;
})(FollowAction || {});
var DEFAULT_SLOT_COLORS = [
  "#E63946",
  "#457B9D",
  "#2A9D8F",
  "#E9C46A",
  "#F4A261",
  "#264653",
  "#6A0572",
  "#AB83A1"
];
var TriggerBox = class _TriggerBox {
  constructor(id, trackId, slotCount) {
    this._slots = [];
    this._activeSlotIndex = -1;
    this._defaultSlotCount = 8;
    // Signals
    this.slotTriggered = new Signal();
    this.slotStopped = new Signal();
    this.activeSlotChanged = new Signal();
    this.slotStateChanged = new Signal();
    this.id = id;
    this.trackId = trackId;
    if (slotCount !== void 0) {
      this._defaultSlotCount = slotCount;
    }
    for (let i = 0; i < this._defaultSlotCount; i++) {
      this._slots.push(this.createEmptySlot(i));
    }
  }
  // ───────────────────────── Slot management ───────────────────────────
  getSlot(index) {
    return this._slots[index];
  }
  get slots() {
    return this._slots;
  }
  get slotCount() {
    return this._slots.length;
  }
  get activeSlotIndex() {
    return this._activeSlotIndex;
  }
  // ──────────────────────── Clip loading / clearing ─────────────────────
  loadClip(slotIndex, sourceId, name) {
    const slot = this._slots[slotIndex];
    if (!slot) {
      throw new Error(
        `TriggerBox: slot index ${slotIndex} out of range (0-${this._slots.length - 1})`
      );
    }
    if (slot.state === "RUNNING" /* RUNNING */ || slot.state === "WAITING_TO_START" /* WAITING_TO_START */) {
      this.stopSlot(slotIndex);
    }
    slot.sourceId = sourceId;
    slot.name = name ?? `Clip ${slotIndex + 1}`;
    slot.playCount = 0;
    slot.playbackPosition = 0;
  }
  clearSlot(slotIndex) {
    const slot = this._slots[slotIndex];
    if (!slot) {
      throw new Error(`TriggerBox: slot index ${slotIndex} out of range`);
    }
    if (slot.state !== "STOPPED" /* STOPPED */) {
      this.stopSlot(slotIndex);
    }
    slot.sourceId = null;
    slot.name = "";
    slot.playCount = 0;
    slot.playbackPosition = 0;
  }
  // ──────────────────────── Launch / Stop ───────────────────────────────
  launchSlot(slotIndex) {
    const slot = this._slots[slotIndex];
    if (!slot) {
      throw new Error(`TriggerBox: slot index ${slotIndex} out of range`);
    }
    if (!slot.sourceId) {
      return;
    }
    if (this._activeSlotIndex >= 0 && this._activeSlotIndex !== slotIndex) {
      const activeSlot = this._slots[this._activeSlotIndex];
      if (activeSlot && activeSlot.state !== "STOPPED" /* STOPPED */) {
        this.setSlotState(this._activeSlotIndex, "WAITING_TO_STOP" /* WAITING_TO_STOP */);
      }
    }
    if (this._activeSlotIndex === slotIndex && slot.state === "RUNNING" /* RUNNING */) {
      this.setSlotState(slotIndex, "WAITING_TO_RETRIGGER" /* WAITING_TO_RETRIGGER */);
      return;
    }
    if (slot.launchQuantize === "NONE" /* NONE */) {
      this.activateSlot(slotIndex);
    } else {
      this.setSlotState(slotIndex, "WAITING_TO_START" /* WAITING_TO_START */);
    }
  }
  stopSlot(slotIndex) {
    const slot = this._slots[slotIndex];
    if (!slot) {
      return;
    }
    if (slot.state === "STOPPED" /* STOPPED */) {
      return;
    }
    if (slot.launchQuantize === "NONE" /* NONE */) {
      this.deactivateSlot(slotIndex);
    } else {
      this.setSlotState(slotIndex, "WAITING_TO_STOP" /* WAITING_TO_STOP */);
    }
  }
  stopAll() {
    for (let i = 0; i < this._slots.length; i++) {
      if (this._slots[i].state !== "STOPPED" /* STOPPED */) {
        this.deactivateSlot(i);
      }
    }
  }
  // ────────────────────── Process block (real-time) ────────────────────
  /**
   * Called by the transport for each audio processing block.
   * Handles state transitions (quantized launch, follow actions) and
   * returns the playback information for the currently active clip.
   */
  processBlock(currentFrame, blockSize, bpm, beatsPerBar) {
    const sampleRate = 44100;
    for (let i = 0; i < this._slots.length; i++) {
      const slot = this._slots[i];
      if (slot.state === "WAITING_TO_START" /* WAITING_TO_START */) {
        const quantizePoint = this.getNextQuantizePoint(
          currentFrame,
          bpm,
          beatsPerBar,
          sampleRate
        );
        if (currentFrame >= quantizePoint || quantizePoint - currentFrame <= blockSize) {
          if (this._activeSlotIndex >= 0 && this._activeSlotIndex !== i) {
            this.deactivateSlot(this._activeSlotIndex);
          }
          this.activateSlot(i);
        }
      }
    }
    for (let i = 0; i < this._slots.length; i++) {
      const slot = this._slots[i];
      if (slot.state === "WAITING_TO_STOP" /* WAITING_TO_STOP */) {
        const quantizePoint = this.getNextQuantizePoint(
          currentFrame,
          bpm,
          beatsPerBar,
          sampleRate
        );
        if (currentFrame >= quantizePoint || quantizePoint - currentFrame <= blockSize) {
          this.deactivateSlot(i);
        }
      }
    }
    for (let i = 0; i < this._slots.length; i++) {
      const slot = this._slots[i];
      if (slot.state === "WAITING_TO_RETRIGGER" /* WAITING_TO_RETRIGGER */) {
        const quantizePoint = this.getNextQuantizePoint(
          currentFrame,
          bpm,
          beatsPerBar,
          sampleRate
        );
        if (currentFrame >= quantizePoint || quantizePoint - currentFrame <= blockSize) {
          slot.playbackPosition = slot.loopStart;
          slot.playCount = 0;
          this.setSlotState(i, "RUNNING" /* RUNNING */);
        }
      }
    }
    if (this._activeSlotIndex < 0) {
      return null;
    }
    const activeSlot = this._slots[this._activeSlotIndex];
    if (!activeSlot || activeSlot.state !== "RUNNING" /* RUNNING */ || !activeSlot.sourceId) {
      return null;
    }
    const info = {
      sourceId: activeSlot.sourceId,
      startInSource: activeSlot.playbackPosition,
      blockSize,
      gain: activeSlot.gain
    };
    activeSlot.playbackPosition += blockSize;
    const effectiveEnd = activeSlot.loopEnd > 0 ? activeSlot.loopEnd : Infinity;
    if (activeSlot.playbackPosition >= effectiveEnd) {
      activeSlot.playCount++;
      activeSlot.playbackPosition = activeSlot.loopStart;
      if (activeSlot.followCount > 0 && activeSlot.playCount >= activeSlot.followCount) {
        this.processFollowAction(this._activeSlotIndex);
      }
    }
    return info;
  }
  // ──────────────────────── Quantize helpers ──────────────────────────
  /**
   * Calculate the next quantize boundary based on the launch quantize
   * setting of the slot that is currently transitioning.
   */
  getNextQuantizePoint(currentFrame, bpm, beatsPerBar, sampleRate) {
    if (bpm <= 0) {
      return currentFrame;
    }
    const framesPerBeat = sampleRate * 60 / bpm;
    const framesPerBar = framesPerBeat * beatsPerBar;
    let quantize = "NONE" /* NONE */;
    for (const slot of this._slots) {
      if (slot.state === "WAITING_TO_START" /* WAITING_TO_START */ || slot.state === "WAITING_TO_STOP" /* WAITING_TO_STOP */ || slot.state === "WAITING_TO_RETRIGGER" /* WAITING_TO_RETRIGGER */) {
        quantize = slot.launchQuantize;
        break;
      }
    }
    if (quantize === "NONE" /* NONE */) {
      return currentFrame;
    }
    let gridSize;
    switch (quantize) {
      case "BAR" /* BAR */:
        gridSize = framesPerBar;
        break;
      case "HALF_BAR" /* HALF_BAR */:
        gridSize = framesPerBar / 2;
        break;
      case "BEAT" /* BEAT */:
        gridSize = framesPerBeat;
        break;
      default:
        return currentFrame;
    }
    const nextBoundary = Math.ceil(currentFrame / gridSize) * gridSize;
    return nextBoundary;
  }
  // ──────────────────────── Follow actions ─────────────────────────────
  processFollowAction(slotIndex) {
    const slot = this._slots[slotIndex];
    if (!slot) {
      return;
    }
    if (slot.followProbability < 1 && Math.random() > slot.followProbability) {
      slot.playCount = 0;
      return;
    }
    switch (slot.followAction) {
      case "NONE" /* NONE */:
        this.deactivateSlot(slotIndex);
        break;
      case "AGAIN" /* AGAIN */:
        slot.playbackPosition = slot.loopStart;
        slot.playCount = 0;
        break;
      case "NEXT" /* NEXT */: {
        const next = this.findNextLoadedSlot(slotIndex, 1);
        if (next >= 0) {
          this.deactivateSlot(slotIndex);
          this.activateSlot(next);
        } else {
          this.deactivateSlot(slotIndex);
        }
        break;
      }
      case "PREV" /* PREV */: {
        const prev = this.findNextLoadedSlot(slotIndex, -1);
        if (prev >= 0) {
          this.deactivateSlot(slotIndex);
          this.activateSlot(prev);
        } else {
          this.deactivateSlot(slotIndex);
        }
        break;
      }
      case "RANDOM" /* RANDOM */: {
        const loaded = this._slots.map((s, i) => s.sourceId && i !== slotIndex ? i : -1).filter((i) => i >= 0);
        if (loaded.length > 0) {
          const randomIndex = loaded[Math.floor(Math.random() * loaded.length)];
          this.deactivateSlot(slotIndex);
          this.activateSlot(randomIndex);
        } else {
          this.deactivateSlot(slotIndex);
        }
        break;
      }
      case "STOP" /* STOP */:
        this.stopAll();
        break;
    }
  }
  // ──────────────────────── Serialization ──────────────────────────────
  toJSON() {
    return {
      id: this.id,
      trackId: this.trackId,
      slots: this._slots.map((slot) => ({
        name: slot.name,
        sourceId: slot.sourceId,
        gain: slot.gain,
        color: slot.color,
        launchQuantize: slot.launchQuantize,
        followAction: slot.followAction,
        followCount: slot.followCount,
        followProbability: slot.followProbability
      }))
    };
  }
  static fromJSON(data) {
    const box = new _TriggerBox(data.id, data.trackId, data.slots.length);
    data.slots.forEach((slotData, i) => {
      const slot = box._slots[i];
      if (!slot) return;
      slot.name = slotData.name;
      slot.sourceId = slotData.sourceId;
      slot.gain = slotData.gain;
      slot.color = slotData.color;
      slot.launchQuantize = slotData.launchQuantize;
      slot.followAction = slotData.followAction;
      slot.followCount = slotData.followCount;
      slot.followProbability = slotData.followProbability;
    });
    return box;
  }
  // ──────────────────────── Private helpers ────────────────────────────
  createEmptySlot(index) {
    return {
      id: `${this.id}-slot-${index}`,
      index,
      name: "",
      sourceId: null,
      state: "STOPPED" /* STOPPED */,
      gain: 1,
      color: DEFAULT_SLOT_COLORS[index % DEFAULT_SLOT_COLORS.length],
      launchQuantize: "BAR" /* BAR */,
      followAction: "AGAIN" /* AGAIN */,
      followCount: 0,
      followProbability: 1,
      stretchMode: "timestretch",
      loopStart: 0,
      loopEnd: 0,
      playCount: 0,
      playbackPosition: 0
    };
  }
  activateSlot(index) {
    const slot = this._slots[index];
    if (!slot || !slot.sourceId) return;
    slot.playbackPosition = slot.loopStart;
    slot.playCount = 0;
    this.setSlotState(index, "RUNNING" /* RUNNING */);
    this._activeSlotIndex = index;
    this.activeSlotChanged.emit(index);
    this.slotTriggered.emit({ index, slot });
  }
  deactivateSlot(index) {
    const slot = this._slots[index];
    if (!slot) return;
    this.setSlotState(index, "STOPPED" /* STOPPED */);
    slot.playbackPosition = 0;
    slot.playCount = 0;
    if (this._activeSlotIndex === index) {
      this._activeSlotIndex = -1;
      this.activeSlotChanged.emit(-1);
    }
    this.slotStopped.emit({ index });
  }
  setSlotState(index, state) {
    const slot = this._slots[index];
    if (!slot) return;
    slot.state = state;
    this.slotStateChanged.emit({ index, state });
  }
  /**
   * Find the next slot (in the given direction) that has a loaded clip.
   * Wraps around the slot list.
   */
  findNextLoadedSlot(fromIndex, direction) {
    const count = this._slots.length;
    for (let offset = 1; offset < count; offset++) {
      const candidate = ((fromIndex + direction * offset) % count + count) % count;
      if (this._slots[candidate].sourceId) {
        return candidate;
      }
    }
    return -1;
  }
};

// core/src/index.ts
init_CDMarker();
init_OverlapType();
init_TransportFSM();

// core/src/audio/AudioEngine.ts
init_Session();
init_Region();
init_MidiRegion();
init_MidiNote();

// core/src/midi/MidiInput.ts
init_Signal();
init_Logger();
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

// core/src/audio/AudioEngine.ts
init_GainProcessor();

// core/src/processing/PanProcessor.ts
init_Processor();
init_Signal();
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

// core/src/audio/AudioEngine.ts
init_Panner();
init_PolarityProcessor();

// core/src/processing/SendProcessor.ts
init_Processor();
init_Signal();
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
init_Processor();
init_Signal();
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

// core/src/audio/AudioEngine.ts
init_PluginInsert();
init_Logger();
var AudioEngine = class _AudioEngine {
  constructor(backend) {
    this.disposed = false;
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
    this.signalDisposers.forEach((d) => d.dispose());
    this.signalDisposers = [];
    this.trackDisposers.forEach(
      (disposers) => disposers.forEach((d) => d.dispose())
    );
    this.trackDisposers.clear();
    this.sendBusDisposers.forEach(
      (disposers) => disposers.forEach((d) => d.dispose())
    );
    this.sendBusDisposers.clear();
  }
  setBackend(backend) {
    this.backend = backend;
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
  setupSessionListeners() {
    const masterBus = this.session.masterBus;
    this.backend.registerMasterIO(masterBus.input.id, masterBus.output.id);
    masterBus.processors.forEach((proc, index) => {
      const type = this.getProcessorType(proc);
      this.backend.addMasterProcessor(proc.id, type, index);
      this.connectMasterProcessorSignals(proc);
    });
    this.signalDisposers.push(
      masterBus.processorAdded.connect((proc) => {
        const index = masterBus.processors.indexOf(proc);
        const type = this.getProcessorType(proc);
        this.backend.addMasterProcessor(proc.id, type, index);
        this.connectMasterProcessorSignals(proc);
      })
    );
    this.signalDisposers.push(
      masterBus.processorRemoved.connect((procId) => {
        this.backend.removeMasterProcessor(procId);
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
        if (track.type === "AUX" /* AUX */) {
          this.backend.createAuxTrack(
            track.id,
            track.name,
            track.route.input.id,
            track.route.output.id
          );
        } else if (track.type === "BUS" /* BUS */) {
          this.backend.createBusTrack(
            track.id,
            track.name,
            track.route.input.id,
            track.route.output.id
          );
        } else if (track.type === "MIDI" /* MIDI */) {
          this.backend.createMidiTrack(
            track.id,
            track.name,
            track.route.input.id,
            track.route.output.id
          );
        } else {
          this.backend.createTrack(
            track.id,
            track.name,
            track.route.input.id,
            track.route.output.id
          );
        }
        track.route.processors.forEach((proc, index) => {
          const type = this.getProcessorType(proc);
          this.backend.addProcessor(track.id, proc.id, type, index);
          this.connectProcessorSignals(track.id, proc);
        });
        const disposers = [];
        disposers.push(
          track.route.processorAdded.connect((proc) => {
            const index = track.route.processors.indexOf(proc);
            const type = this.getProcessorType(proc);
            this.backend.addProcessor(track.id, proc.id, type, index);
            this.connectProcessorSignals(track.id, proc);
          })
        );
        disposers.push(
          track.route.processorRemoved.connect((procId) => {
            this.backend.removeProcessor(track.id, procId);
          })
        );
        disposers.push(
          track.playlist.regionAdded.connect((region) => {
            const dto = _AudioEngine.toRegionDTO(region);
            this.backend.scheduleRegion(track.id, dto);
          })
        );
        disposers.push(
          track.playlist.regionRemoved.connect((regionId) => {
            this.backend.removeRegion(track.id, regionId);
          })
        );
        disposers.push(
          track.playlist.regionChanged.connect((region) => {
            this.updateRegion(track.id, region);
          })
        );
        disposers.push(
          track.playlist.midiRegionAdded.connect((midiRegion) => {
            const dto = {
              id: midiRegion.id,
              name: midiRegion.name,
              start: midiRegion.start,
              length: midiRegion.length,
              end: midiRegion.end,
              muted: midiRegion.muted,
              notes: midiRegion.getNotes().map((n) => ({
                id: n.id,
                pitch: n.pitch,
                velocity: n.velocity,
                startFrame: n.startFrame,
                durationFrames: n.durationFrames,
                channel: n.channel
              }))
            };
            this.backend.scheduleMidiRegion(track.id, dto);
          })
        );
        disposers.push(
          track.playlist.midiRegionRemoved.connect((regionId) => {
            this.backend.removeMidiRegion(track.id, regionId);
          })
        );
        this.bindTrackSignals(track, disposers);
        this.trackDisposers.set(track.id, disposers);
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
        this.backend.addSendBus(
          sendBus.id,
          sendBus.sourceTrackId,
          sendBus.destId,
          sendBus.level,
          sendBus.preFader
        );
        const disposers = [];
        disposers.push(
          sendBus.levelChanged.connect((levelDb) => {
            this.backend.setSendBusLevel(sendBus.id, levelDb);
          })
        );
        disposers.push(
          sendBus.preFaderChanged.connect((preFader) => {
            this.backend.setSendBusPreFader(sendBus.id, preFader);
          })
        );
        disposers.push(
          sendBus.activeChanged.connect((active) => {
            this.backend.setSendBusActive(sendBus.id, active);
          })
        );
        this.sendBusDisposers.set(sendBus.id, disposers);
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
      })
    );
    this.session.tracks.forEach((t) => {
      const disposers = [];
      this.bindTrackSignals(t, disposers);
      if (disposers.length > 0) {
        const existing = this.trackDisposers.get(t.id);
        if (existing) {
          existing.push(...disposers);
        } else {
          this.trackDisposers.set(t.id, disposers);
        }
      }
    });
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
          })
        );
        disposers.push(
          route.output.disconnected.connect((destId) => {
            this.backend.disconnectIO(route.output.id, destId);
          })
        );
      }
      if (route.input && route.input.connected) {
        disposers.push(
          route.input.connected.connect((destId) => {
            this.backend.connectIO(route.input.id, destId);
          })
        );
        disposers.push(
          route.input.disconnected.connect((destId) => {
            this.backend.disconnectIO(route.input.id, destId);
          })
        );
      }
    }
  }
  getProcessorType(proc) {
    if (proc instanceof GainProcessor) {
      return proc.name === "Trim" ? "Trim" : "Fader";
    }
    if (proc instanceof Panner) return "Panner";
    if (proc instanceof PanProcessor) return "Panner";
    if (proc instanceof PolarityProcessor) return "Polarity";
    if (proc instanceof SendProcessor) return "Send";
    if (proc instanceof MeterProcessor) return "Meter";
    if (proc instanceof PluginInsert) return `Insert: ${proc.plugin.name}`;
    return "Unknown";
  }
  connectMasterProcessorSignals(proc) {
    if (proc instanceof GainProcessor) {
      proc.gainChanged.connect((val) => {
        this.backend.setMasterGain(val);
      });
    }
    if (proc instanceof PluginInsert && proc.plugin && proc.plugin.parameterChanged) {
      proc.plugin.parameterChanged.connect(
        ({ id, value }) => {
          this.backend.setMasterProcessorParameter(proc.id, id, value);
        }
      );
    }
  }
  connectProcessorSignals(trackId, proc) {
    if (proc instanceof GainProcessor) {
      proc.gainChanged.connect((val) => {
        this.backend.setProcessorParameter(trackId, proc.id, "gain", val);
      });
    }
    if (proc instanceof Panner) {
      proc.azimuthChanged.connect((val) => {
        this.backend.setProcessorParameter(trackId, proc.id, "pan", val);
      });
      proc.widthChanged.connect((val) => {
        this.backend.setProcessorParameter(trackId, proc.id, "width", val);
      });
    } else if (proc instanceof PanProcessor) {
      proc.panChanged.connect((val) => {
        this.backend.setProcessorParameter(trackId, proc.id, "pan", val);
      });
      proc.widthChanged.connect((val) => {
        this.backend.setProcessorParameter(trackId, proc.id, "width", val);
      });
    }
    if (proc instanceof PolarityProcessor) {
      proc.polarityChanged.connect((inverted) => {
        this.backend.setProcessorParameter(
          trackId,
          proc.id,
          "polarity",
          inverted ? 1 : 0
        );
      });
    }
    if (proc instanceof SendProcessor) {
      proc.levelChanged.connect((val) => {
        this.backend.setProcessorParameter(trackId, proc.id, "level", val);
      });
      proc.preFaderChanged.connect((preFader) => {
        this.backend.setProcessorParameter(
          trackId,
          proc.id,
          "preFader",
          preFader ? 1 : 0
        );
      });
      proc.muteChanged.connect((muted) => {
        this.backend.setProcessorParameter(
          trackId,
          proc.id,
          "muted",
          muted ? 1 : 0
        );
      });
    }
    if (proc instanceof PluginInsert && proc.plugin && proc.plugin.parameterChanged) {
      proc.plugin.parameterChanged.connect(
        ({ id, value }) => {
          this.backend.setProcessorParameter(trackId, proc.id, id, value);
        }
      );
    }
    if (proc.automations) {
      proc.automations.forEach((list, param) => {
        this.bindAutomationList(trackId, proc.id, param, list);
      });
    }
    if (proc.automationAdded) {
      proc.automationAdded.connect(
        ({ paramName, list }) => {
          this.bindAutomationList(trackId, proc.id, paramName, list);
        }
      );
    }
  }
  bindAutomationList(trackId, procId, param, list) {
    if (list.changed) {
      list.changed.connect(() => {
        logger.debug(
          "AudioEngine",
          `Automation changed for ${trackId}:${procId}:${param}`
        );
        const points2 = list.getPoints();
        this.backend.setProcessorAutomation(trackId, procId, param, points2);
      });
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
  async start() {
    this.scheduleAutomations();
    this.backend.setTempo(this.session.tempo);
    this.session.startTransport();
    await this.backend.start();
    this.startTransportSync();
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
    this.session.stopTransport();
    this.backend.stop();
  }
  pause() {
    this.session.isPlaying = false;
    this.backend.pause();
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
    this.stop();
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
          track.playlist.addRegion(region);
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
    this.stop();
    this.session = newSession;
    this.setupSessionListeners();
  }
  loadSessionFromSnapshot(snapshot) {
    this.stop();
    this.session = Session.fromJSON(snapshot);
    this.setupSessionListeners();
  }
};

// core/src/utils/AudioBufferToWav.ts
var AudioBufferToWav = class {
  /**
   * Encode to WAV format
   * Reference: https://gist.github.com/meziantou/edb7217fddfbb70e899e
   */
  static encode(buffer, format = "float32") {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const interleaved = this.interleave(buffer);
    let samples;
    let bitsPerSample;
    switch (format) {
      case "int16":
        samples = this.float32ToInt16(interleaved);
        bitsPerSample = 16;
        break;
      case "int24":
        samples = this.float32ToInt24(interleaved);
        bitsPerSample = 24;
        break;
      case "float32":
      default:
        samples = interleaved.buffer;
        bitsPerSample = 32;
        break;
    }
    const dataSize = samples.byteLength;
    const header = this.createWAVHeader(
      numChannels,
      sampleRate,
      bitsPerSample,
      dataSize
    );
    return new Blob([header, samples], { type: "audio/wav" });
  }
  /**
   * Interleave multi-channel audio buffer
   */
  static interleave(buffer) {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length * numChannels;
    const result = new Float32Array(length);
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < buffer.length; i++) {
        result[i * numChannels + ch] = channelData[i];
      }
    }
    return result;
  }
  /**
   * Convert Float32 to Int16
   */
  static float32ToInt16(buffer) {
    const result = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      result[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return result.buffer;
  }
  /**
   * Convert Float32 to Int24 (stored as 3 bytes per sample)
   */
  static float32ToInt24(buffer) {
    const result = new Uint8Array(buffer.length * 3);
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      const val = Math.floor(s < 0 ? s * 8388608 : s * 8388607);
      result[i * 3 + 0] = val >> 0 & 255;
      result[i * 3 + 1] = val >> 8 & 255;
      result[i * 3 + 2] = val >> 16 & 255;
    }
    return result.buffer;
  }
  /**
   * Create WAV file header
   */
  static createWAVHeader(numChannels, sampleRate, bitsPerSample, dataSize) {
    const blockAlign = numChannels * (bitsPerSample / 8);
    const byteRate = sampleRate * blockAlign;
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    this.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, "WAVE");
    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, bitsPerSample === 32 ? 3 : 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    this.writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);
    return header;
  }
  /**
   * Write string to DataView
   */
  static writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
};

// core/src/utils/OggEncoder.ts
init_Logger();
var OggEncoder = class {
  /**
   * Encode AudioBuffer to OGG Blob.
   * Uses MediaRecorder (OGG Opus) when available, falls back to PCM container.
   *
   * @param buffer Audio data to encode
   * @param quality Quality 0.0-1.0, maps to Opus bitrate
   */
  static async encode(buffer, quality = 0.5) {
    if (typeof MediaRecorder !== "undefined" && typeof OfflineAudioContext !== "undefined") {
      try {
        return await this.encodeWithMediaRecorder(buffer, quality);
      } catch (e) {
        logger.warn(
          "OggEncoder",
          "MediaRecorder encoding failed, falling back to PCM:",
          e
        );
      }
    }
    return this.encodePcmFallback(buffer, quality);
  }
  /**
   * Encode using MediaRecorder API with OGG Opus codec.
   * This produces real, valid OGG Opus files.
   */
  static async encodeWithMediaRecorder(buffer, quality) {
    const sampleRate = buffer.sampleRate;
    const numChannels = buffer.numberOfChannels;
    const bitrate = Math.round(64e3 + quality * (32e4 - 64e3));
    const ctx = new AudioContext({ sampleRate });
    try {
      const destination = ctx.createMediaStreamDestination();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      const mimeType = MediaRecorder.isTypeSupported("audio/ogg; codecs=opus") ? "audio/ogg; codecs=opus" : MediaRecorder.isTypeSupported("audio/ogg") ? "audio/ogg" : null;
      if (!mimeType) {
        throw new Error("OGG encoding not supported by MediaRecorder");
      }
      const recorder = new MediaRecorder(destination.stream, {
        mimeType,
        audioBitsPerSecond: bitrate
      });
      const chunks = [];
      return new Promise((resolve, reject) => {
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        recorder.onstop = () => {
          ctx.close();
          const blob = new Blob(chunks, { type: "audio/ogg" });
          resolve(blob);
        };
        recorder.onerror = (e) => {
          ctx.close();
          reject(e);
        };
        recorder.start();
        source.start(0);
        const durationMs = buffer.length / sampleRate * 1e3;
        setTimeout(() => {
          try {
            if (recorder.state === "recording") {
              recorder.stop();
            }
            destination.stream.getTracks().forEach((t) => t.stop());
          } catch {
          }
        }, durationMs + 100);
      });
    } catch (e) {
      ctx.close();
      throw e;
    }
  }
  /**
   * Fallback: PCM data in OGG container.
   * This is NOT valid OGG Vorbis/Opus, but provides basic container structure.
   */
  static encodePcmFallback(buffer, quality) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const interleaved = this.interleave(buffer);
    const int16Data = this.float32ToInt16(interleaved);
    const pages = [];
    const serialNumber = Math.floor(Math.random() * 4294967295);
    pages.push(
      this.buildIdHeader(numChannels, sampleRate, quality, serialNumber)
    );
    pages.push(this.buildCommentHeader(serialNumber));
    const pageSize = 4096;
    const bytesPerSample = 2 * numChannels;
    let granulePosition = 0;
    let pageSequence = 2;
    for (let offset = 0; offset < int16Data.byteLength; offset += pageSize * bytesPerSample) {
      const remaining = int16Data.byteLength - offset;
      const chunkSize = Math.min(pageSize * bytesPerSample, remaining);
      const chunk = new Uint8Array(int16Data, offset, chunkSize);
      const samplesInPage = Math.floor(chunkSize / bytesPerSample);
      granulePosition += samplesInPage;
      const isLastPage = offset + chunkSize >= int16Data.byteLength;
      pages.push(
        this.buildDataPage(
          chunk,
          serialNumber,
          pageSequence++,
          granulePosition,
          isLastPage
        )
      );
    }
    return new Blob(pages, {
      type: "application/octet-stream"
    });
  }
  static interleave(buffer) {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length * numChannels;
    const result = new Float32Array(length);
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < buffer.length; i++) {
        result[i * numChannels + ch] = channelData[i];
      }
    }
    return result;
  }
  static float32ToInt16(buffer) {
    const result = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      result[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return result.buffer;
  }
  static buildOggPage(headerType, granulePosition, serialNumber, pageSequence, data) {
    const segments = [];
    let remaining = data.length;
    while (remaining >= 255) {
      segments.push(255);
      remaining -= 255;
    }
    segments.push(remaining);
    const headerSize = 27 + segments.length;
    const page = new Uint8Array(headerSize + data.length);
    const view = new DataView(page.buffer);
    page[0] = 79;
    page[1] = 103;
    page[2] = 103;
    page[3] = 83;
    page[4] = 0;
    page[5] = headerType;
    view.setUint32(6, granulePosition & 4294967295, true);
    view.setUint32(
      10,
      Math.floor(granulePosition / 4294967296) & 4294967295,
      true
    );
    view.setUint32(14, serialNumber, true);
    view.setUint32(18, pageSequence, true);
    view.setUint32(22, 0, true);
    page[26] = segments.length;
    for (let i = 0; i < segments.length; i++) {
      page[27 + i] = segments[i];
    }
    page.set(data, headerSize);
    const crc = this.crc32(page);
    view.setUint32(22, crc, true);
    return page;
  }
  static buildIdHeader(channels, sampleRate, quality, serialNumber) {
    const data = new Uint8Array(30);
    const view = new DataView(data.buffer);
    data[0] = 1;
    data[1] = 118;
    data[2] = 111;
    data[3] = 114;
    data[4] = 98;
    data[5] = 105;
    data[6] = 115;
    view.setUint32(7, 0, true);
    data[11] = channels;
    view.setUint32(12, sampleRate, true);
    const nominalBitrate = Math.floor(64e3 + quality * (32e4 - 64e3));
    view.setInt32(16, nominalBitrate, true);
    view.setInt32(20, nominalBitrate, true);
    view.setInt32(24, nominalBitrate, true);
    data[28] = 8;
    data[29] = 1;
    return this.buildOggPage(2, 0, serialNumber, 0, data);
  }
  static buildCommentHeader(serialNumber) {
    const vendor = "daw-engine Web DAW";
    const vendorBytes = new TextEncoder().encode(vendor);
    const data = new Uint8Array(7 + 4 + vendorBytes.length + 4 + 1);
    const view = new DataView(data.buffer);
    data[0] = 3;
    data[1] = 118;
    data[2] = 111;
    data[3] = 114;
    data[4] = 98;
    data[5] = 105;
    data[6] = 115;
    view.setUint32(7, vendorBytes.length, true);
    data.set(vendorBytes, 11);
    view.setUint32(11 + vendorBytes.length, 0, true);
    data[11 + vendorBytes.length + 4] = 1;
    return this.buildOggPage(0, 0, serialNumber, 1, data);
  }
  static buildDataPage(audioData, serialNumber, pageSequence, granulePosition, isLast) {
    const headerType = isLast ? 4 : 0;
    return this.buildOggPage(
      headerType,
      granulePosition,
      serialNumber,
      pageSequence,
      audioData
    );
  }
  static {
    this.crcTable = null;
  }
  static getCrcTable() {
    if (this.crcTable) return this.crcTable;
    this.crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let r = i << 24;
      for (let j = 0; j < 8; j++) {
        r = r & 2147483648 ? r << 1 ^ 79764919 : r << 1;
      }
      this.crcTable[i] = r >>> 0;
    }
    return this.crcTable;
  }
  static crc32(data) {
    const table = this.getCrcTable();
    let crc = 0;
    for (let i = 0; i < data.length; i++) {
      crc = (crc << 8 ^ table[crc >>> 24 & 255 ^ data[i]]) >>> 0;
    }
    return crc;
  }
};

// core/src/utils/FlacEncoder.ts
var FlacEncoder = class {
  /**
   * Encode AudioBuffer to FLAC Blob.
   * @param buffer Audio data
   * @param bitsPerSample 16 or 24
   */
  static encode(buffer, bitsPerSample = 16) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const totalSamples = buffer.length;
    const parts = [];
    parts.push(new Uint8Array([102, 76, 97, 67]));
    parts.push(
      this.buildStreamInfo(
        numChannels,
        sampleRate,
        bitsPerSample,
        totalSamples,
        buffer
      )
    );
    const blockSize = 4096;
    for (let offset = 0; offset < totalSamples; offset += blockSize) {
      const currentBlockSize = Math.min(blockSize, totalSamples - offset);
      parts.push(
        this.buildFrame(
          buffer,
          offset,
          currentBlockSize,
          numChannels,
          bitsPerSample,
          sampleRate,
          offset / blockSize
        )
      );
    }
    return new Blob(parts, { type: "audio/flac" });
  }
  static buildStreamInfo(channels, sampleRate, bitsPerSample, totalSamples, _buffer) {
    const data = new Uint8Array(4 + 34);
    const view = new DataView(data.buffer);
    data[0] = 128;
    data[1] = 0;
    data[2] = 0;
    data[3] = 34;
    const blockSize = 4096;
    view.setUint16(4, blockSize, false);
    view.setUint16(6, blockSize, false);
    data[8] = 0;
    data[9] = 0;
    data[10] = 0;
    data[11] = 0;
    data[12] = 0;
    data[13] = 0;
    const srChannelsBps = (sampleRate & 1048575) << 12 | (channels - 1 & 7) << 9 | (bitsPerSample - 1 & 31) << 4 | totalSamples >>> 32 & 15;
    view.setUint32(14, srChannelsBps, false);
    view.setUint32(18, totalSamples & 4294967295, false);
    for (let i = 22; i < 38; i++) {
      data[i] = 0;
    }
    return data;
  }
  static buildFrame(buffer, offset, blockSize, channels, bitsPerSample, sampleRate, frameNumber) {
    const bytesPerSample = bitsPerSample / 8;
    const _dataSize = blockSize * channels * bytesPerSample;
    const parts = [];
    parts.push(255);
    parts.push(248);
    const blockSizeCode = this.getBlockSizeCode(blockSize);
    const sampleRateCode = this.getSampleRateCode(sampleRate);
    parts.push(blockSizeCode << 4 | sampleRateCode);
    const channelAssignment = channels === 1 ? 0 : 1;
    const sampleSizeCode = bitsPerSample === 16 ? 4 : bitsPerSample === 24 ? 6 : 4;
    parts.push(channelAssignment << 4 | sampleSizeCode << 1);
    if (frameNumber < 128) {
      parts.push(frameNumber & 127);
    } else if (frameNumber < 2048) {
      parts.push(192 | frameNumber >> 6 & 31);
      parts.push(128 | frameNumber & 63);
    } else {
      parts.push(224 | frameNumber >> 12 & 15);
      parts.push(128 | frameNumber >> 6 & 63);
      parts.push(128 | frameNumber & 63);
    }
    if (blockSizeCode === 6) {
      parts.push(blockSize - 1 & 255);
    } else if (blockSizeCode === 7) {
      parts.push(blockSize - 1 >> 8 & 255);
      parts.push(blockSize - 1 & 255);
    }
    const headerBytes = new Uint8Array(parts);
    parts.push(this.crc8(headerBytes));
    const sampleData = [];
    for (let ch = 0; ch < channels; ch++) {
      sampleData.push(2);
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < blockSize; i++) {
        const sampleIndex = offset + i;
        const sample = sampleIndex < channelData.length ? channelData[sampleIndex] : 0;
        if (bitsPerSample === 16) {
          const clamped = Math.max(-1, Math.min(1, sample));
          const int16 = clamped < 0 ? Math.floor(clamped * 32768) : Math.floor(clamped * 32767);
          sampleData.push(int16 >> 8 & 255);
          sampleData.push(int16 & 255);
        } else {
          const clamped = Math.max(-1, Math.min(1, sample));
          const int24 = clamped < 0 ? Math.floor(clamped * 8388608) : Math.floor(clamped * 8388607);
          sampleData.push(int24 >> 16 & 255);
          sampleData.push(int24 >> 8 & 255);
          sampleData.push(int24 & 255);
        }
      }
    }
    const frameData = new Uint8Array(parts.length + sampleData.length + 2);
    frameData.set(new Uint8Array(parts), 0);
    frameData.set(new Uint8Array(sampleData), parts.length);
    const crc16 = this.crc16(
      frameData.subarray(0, parts.length + sampleData.length)
    );
    frameData[parts.length + sampleData.length] = crc16 >> 8 & 255;
    frameData[parts.length + sampleData.length + 1] = crc16 & 255;
    return frameData;
  }
  static getBlockSizeCode(blockSize) {
    switch (blockSize) {
      case 192:
        return 1;
      case 576:
        return 2;
      case 1152:
        return 3;
      case 2304:
        return 4;
      case 4096:
        return 8;
      case 4608:
        return 5;
      case 8192:
        return 9;
      case 16384:
        return 10;
      case 32768:
        return 11;
      default:
        if (blockSize <= 256) return 6;
        return 7;
    }
  }
  static getSampleRateCode(sampleRate) {
    switch (sampleRate) {
      case 88200:
        return 1;
      case 176400:
        return 2;
      case 192e3:
        return 3;
      case 8e3:
        return 4;
      case 16e3:
        return 5;
      case 22050:
        return 6;
      case 24e3:
        return 7;
      case 32e3:
        return 8;
      case 44100:
        return 9;
      case 48e3:
        return 10;
      case 96e3:
        return 11;
      default:
        return 0;
    }
  }
  static crc8(data) {
    let crc = 0;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = crc & 128 ? crc << 1 ^ 7 : crc << 1;
        crc &= 255;
      }
    }
    return crc;
  }
  static crc16(data) {
    let crc = 0;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i] << 8;
      for (let j = 0; j < 8; j++) {
        crc = crc & 32768 ? crc << 1 ^ 32773 : crc << 1;
        crc &= 65535;
      }
    }
    return crc;
  }
};

// core/src/audio/OfflineExporter.ts
init_DitherProcessor();

// core/src/audio/LufsNormalizer.ts
function highShelfCoeffs(sampleRate) {
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan(Math.PI * f0 / sampleRate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  return {
    b0: (Vh + Vb * K / Q + K * K) / a0,
    b1: 2 * (K * K - Vh) / a0,
    b2: (Vh - Vb * K / Q + K * K) / a0,
    a1: 2 * (K * K - 1) / a0,
    a2: (1 - K / Q + K * K) / a0
  };
}
function highPassCoeffs(sampleRate) {
  const f0 = 38.13547087602444;
  const Q = 0.5003270373238773;
  const K = Math.tan(Math.PI * f0 / sampleRate);
  const a0 = 1 + K / Q + K * K;
  return {
    b0: 1 / a0,
    b1: -2 / a0,
    b2: 1 / a0,
    a1: 2 * (K * K - 1) / a0,
    a2: (1 - K / Q + K * K) / a0
  };
}
function applyBiquad(samples, coeffs) {
  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = coeffs.b0 * x0 + coeffs.b1 * x1 + coeffs.b2 * x2 - coeffs.a1 * y1 - coeffs.a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}
function getChannelWeight(channelIndex, totalChannels) {
  if (totalChannels <= 2) return 1;
  if (totalChannels >= 6 && channelIndex === 3) return 0;
  if (totalChannels >= 6 && (channelIndex === 4 || channelIndex === 5))
    return 1.41;
  return 1;
}
function measureLUFS(buffer) {
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const blockSize = Math.round(sampleRate * 0.4);
  const stepSize = Math.round(sampleRate * 0.1);
  const shelf = highShelfCoeffs(sampleRate);
  const hp = highPassCoeffs(sampleRate);
  const kWeighted = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const raw = buffer.getChannelData(ch);
    const stage1 = applyBiquad(raw, shelf);
    const stage2 = applyBiquad(stage1, hp);
    kWeighted.push(stage2);
  }
  const blockLoudnesses = [];
  const numBlocks = Math.floor((buffer.length - blockSize) / stepSize) + 1;
  for (let b = 0; b < numBlocks; b++) {
    const start = b * stepSize;
    const end = start + blockSize;
    if (end > buffer.length) break;
    let sumWeightedMeanSquare = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const weight = getChannelWeight(ch, numChannels);
      if (weight === 0) continue;
      const data = kWeighted[ch];
      let sumSq = 0;
      for (let i = start; i < end; i++) {
        sumSq += data[i] * data[i];
      }
      sumWeightedMeanSquare += weight * (sumSq / blockSize);
    }
    const blockLufs = sumWeightedMeanSquare > 0 ? -0.691 + 10 * Math.log10(sumWeightedMeanSquare) : -Infinity;
    blockLoudnesses.push(blockLufs);
  }
  const ABSOLUTE_GATE = -70;
  const aboveAbsoluteGate = blockLoudnesses.filter((l) => l > ABSOLUTE_GATE);
  if (aboveAbsoluteGate.length === 0) {
    return {
      integrated: -Infinity,
      shortTerm: [],
      momentary: blockLoudnesses,
      truePeaks: [],
      range: 0
    };
  }
  const ungatedMeanPower = aboveAbsoluteGate.reduce((sum, l) => {
    return sum + Math.pow(10, l / 10);
  }, 0) / aboveAbsoluteGate.length;
  const ungatedMeanLufs = -0.691 + 10 * Math.log10(ungatedMeanPower);
  const relativeGate = ungatedMeanLufs - 10;
  const aboveBothGates = blockLoudnesses.filter(
    (l) => l > ABSOLUTE_GATE && l > relativeGate
  );
  let integrated = -Infinity;
  if (aboveBothGates.length > 0) {
    const gatedMeanPower = aboveBothGates.reduce((sum, l) => {
      return sum + Math.pow(10, l / 10);
    }, 0) / aboveBothGates.length;
    integrated = -0.691 + 10 * Math.log10(gatedMeanPower);
  }
  const shortTermBlockSize = Math.round(sampleRate * 3);
  const shortTermStep = Math.round(sampleRate * 1);
  const shortTerm = [];
  for (let start = 0; start + shortTermBlockSize <= buffer.length; start += shortTermStep) {
    let sumWeightedMS = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const weight = getChannelWeight(ch, numChannels);
      if (weight === 0) continue;
      const data = kWeighted[ch];
      let sumSq = 0;
      for (let i = start; i < start + shortTermBlockSize; i++) {
        sumSq += data[i] * data[i];
      }
      sumWeightedMS += weight * (sumSq / shortTermBlockSize);
    }
    shortTerm.push(
      sumWeightedMS > 0 ? -0.691 + 10 * Math.log10(sumWeightedMS) : -Infinity
    );
  }
  const truePeaks = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const data = buffer.getChannelData(ch);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
    truePeaks.push(peak > 0 ? 20 * Math.log10(peak) : -Infinity);
  }
  let range = 0;
  const validShortTerm = shortTerm.filter((l) => l > ABSOLUTE_GATE && l > relativeGate).sort((a, b) => a - b);
  if (validShortTerm.length >= 2) {
    const p10 = validShortTerm[Math.floor(validShortTerm.length * 0.1)];
    const p95 = validShortTerm[Math.floor(validShortTerm.length * 0.95)];
    range = p95 - p10;
  }
  return {
    integrated,
    shortTerm,
    momentary: blockLoudnesses,
    truePeaks,
    range
  };
}
function normalizeLUFS(buffer, targetLufs = -14) {
  const result = measureLUFS(buffer);
  if (result.integrated === -Infinity || !isFinite(result.integrated)) {
    return 0;
  }
  const gainDb = targetLufs - result.integrated;
  const gainLinear = Math.pow(10, gainDb / 20);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gainLinear;
    }
  }
  return gainDb;
}

// core/src/processing/TruePeakLimiter.ts
var OVERSAMPLE_TAPS = [
  0.001708984375,
  -0.0291748046875,
  -0.0189208984375,
  0.0708618164062,
  0.3031005859375,
  0.4736328125,
  0.3031005859375,
  0.0708618164062,
  -0.0189208984375,
  -0.0291748046875,
  0.001708984375,
  0
];
function measureTruePeak(samples) {
  const taps = OVERSAMPLE_TAPS;
  const numTaps = taps.length;
  const halfTaps = Math.floor(numTaps / 2);
  let maxPeak = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let phase = 0; phase < 4; phase++) {
      let sum = 0;
      for (let t = 0; t < numTaps; t++) {
        const srcIdx = i - halfTaps + t;
        if (srcIdx >= 0 && srcIdx < samples.length) {
          sum += samples[srcIdx] * taps[t];
        }
      }
      const abs = Math.abs(sum);
      if (abs > maxPeak) maxPeak = abs;
    }
  }
  return maxPeak;
}
function applyTruePeakLimiter(buffer, ceilingDbTP = -1) {
  const ceilingLinear = Math.pow(10, ceilingDbTP / 20);
  const numChannels = buffer.numberOfChannels;
  let globalTruePeak = 0;
  for (let ch = 0; ch < numChannels; ch++) {
    const data = buffer.getChannelData(ch);
    const peak = measureTruePeak(data);
    if (peak > globalTruePeak) globalTruePeak = peak;
  }
  if (globalTruePeak <= ceilingLinear) {
    return false;
  }
  const sampleRate = buffer.sampleRate;
  const lookaheadMs = 5;
  const releaseMs = 100;
  const lookaheadSamples = Math.ceil(sampleRate * lookaheadMs / 1e3);
  const releaseCoeff = Math.exp(-1 / (sampleRate * releaseMs / 1e3));
  const length = buffer.length;
  const gainEnvelope = new Float32Array(length);
  gainEnvelope.fill(1);
  const peaks = new Float32Array(length);
  for (let ch = 0; ch < numChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peaks[i]) peaks[i] = abs;
    }
  }
  let currentGain = 1;
  for (let i = length - 1; i >= 0; i--) {
    let futureMax = 0;
    const lookEnd = Math.min(i + lookaheadSamples, length);
    for (let j = i; j < lookEnd; j++) {
      if (peaks[j] > futureMax) futureMax = peaks[j];
    }
    let desiredGain = 1;
    if (futureMax > ceilingLinear) {
      desiredGain = ceilingLinear / futureMax;
    }
    if (desiredGain < currentGain) {
      currentGain = desiredGain;
    } else {
      currentGain = desiredGain + releaseCoeff * (currentGain - desiredGain);
    }
    gainEnvelope[i] = currentGain;
  }
  for (let ch = 0; ch < numChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] *= gainEnvelope[i];
    }
  }
  return true;
}

// core/src/audio/OfflineExporter.ts
init_Logger();
import * as lamejs from "lamejs";
var OfflineExporter = class {
  /**
   * Export audio using Offline Rendering
   *
   * @param config Export configuration
   * @param status Export status (for progress tracking)
   * @param getTrackAudio Callback to get track audio for a given time range
   */
  static async export(config, status, getTrackAudio) {
    try {
      if (!config.validate()) {
        throw new Error("Invalid export configuration");
      }
      const duration = config.getDuration();
      const durationSeconds = duration / config.sampleRate;
      logger.debug(
        "OfflineExporter",
        `Starting export: ${durationSeconds}s at ${config.sampleRate}Hz`
      );
      logger.debug(
        "OfflineExporter",
        `Export config trackIds:`,
        config.trackIds,
        `exportMasterOnly:`,
        config.exportMasterOnly
      );
      status.init(duration, config.getFullPath());
      status.setProgress("rendering" /* RENDERING */);
      const trackIdsToExport = config.trackIds && config.trackIds.length > 0 ? config.trackIds : void 0;
      logger.debug(
        "OfflineExporter",
        `Calling getTrackAudio with trackIds:`,
        trackIdsToExport
      );
      const renderedBuffer = await getTrackAudio(
        trackIdsToExport,
        config.startFrame,
        config.endFrame
      );
      status.updateProcessedFrames(duration);
      if (config.normalize) {
        status.setProgress("normalizing" /* NORMALIZING */);
        if (config.normalizeMode === "lufs") {
          const gainDb = normalizeLUFS(renderedBuffer, config.targetLufs);
          logger.debug(
            "OfflineExporter",
            `LUFS normalization applied: ${gainDb.toFixed(2)} dB gain`
          );
        } else {
          await this.normalizeBuffer(renderedBuffer, config.targetPeakDb);
        }
      }
      if (config.truePeakLimit) {
        const limited = applyTruePeakLimiter(
          renderedBuffer,
          config.truePeakCeiling
        );
        if (limited) {
          logger.debug(
            "OfflineExporter",
            `True peak limiter applied (ceiling: ${config.truePeakCeiling} dBTP)`
          );
        }
      }
      if (config.ditherType !== "none" /* NONE */) {
        const targetBits = config.sampleFormat === "int16" ? 16 : config.sampleFormat === "int24" ? 24 : 32;
        if (targetBits < 32) {
          for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch++) {
            DitherProcessor.apply(
              renderedBuffer.getChannelData(ch),
              targetBits,
              config.ditherType
            );
          }
        }
      }
      status.setProgress("encoding" /* ENCODING */);
      const blob = await this.encodeToBlob(renderedBuffer, config);
      const url = URL.createObjectURL(blob);
      status.complete(blob, url);
      logger.debug("OfflineExporter", `Export completed: ${blob.size} bytes`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("OfflineExporter", `Export failed:`, error);
      status.setError(message);
    }
  }
  /**
   * Normalize audio buffer using peak normalization.
   *
   * @param buffer Audio data (modified in-place)
   * @param targetPeakDb Target peak level in dBFS (default: -1 dBFS)
   */
  static async normalizeBuffer(buffer, targetPeakDb) {
    const target = targetPeakDb ?? -1;
    let maxPeak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        maxPeak = Math.max(maxPeak, Math.abs(data[i]));
      }
    }
    if (maxPeak === 0) return;
    const targetLinear = Math.pow(10, target / 20);
    const gain = targetLinear / maxPeak;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        data[i] *= gain;
      }
    }
  }
  /**
   * Encode AudioBuffer to Blob
   */
  static async encodeToBlob(buffer, config) {
    switch (config.format) {
      case "wav":
        return AudioBufferToWav.encode(buffer, config.sampleFormat);
      case "mp3":
        return this.encodeMP3(buffer, config);
      case "ogg":
        return await OggEncoder.encode(buffer, config.quality ?? 0.5);
      case "flac":
        return FlacEncoder.encode(
          buffer,
          config.sampleFormat === "int24" ? 24 : 16
        );
      default:
        throw new Error(`Unknown format: ${config.format}`);
    }
  }
  /**
   * Encode to MP3 format using lamejs
   */
  static encodeMP3(buffer, config) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const kbps = config.bitrate || 128;
    const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
    const mp3Data = [];
    const left = buffer.getChannelData(0);
    const right = channels > 1 ? buffer.getChannelData(1) : void 0;
    const leftInt16 = new Int16Array(left.length);
    const rightInt16 = right ? new Int16Array(right.length) : void 0;
    for (let i = 0; i < left.length; i++) {
      const s = Math.max(-1, Math.min(1, left[i]));
      leftInt16[i] = s < 0 ? s * 32768 : s * 32767;
      if (right && rightInt16) {
        const sR = Math.max(-1, Math.min(1, right[i]));
        rightInt16[i] = sR < 0 ? sR * 32768 : sR * 32767;
      }
    }
    const mp3buf = mp3encoder.encodeBuffer(leftInt16, rightInt16);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
    const mp3bufFlush = mp3encoder.flush();
    if (mp3bufFlush.length > 0) {
      mp3Data.push(mp3bufFlush);
    }
    return new Blob(mp3Data, { type: "audio/mp3" });
  }
  /**
   * Stem Export: export each track individually as separate files.
   * Returns a map of trackId -> { blob, filename }.
   */
  static async exportStems(config, status, trackIds, trackNames, getTrackAudio) {
    const results = /* @__PURE__ */ new Map();
    if (!config.validate()) {
      throw new Error("Invalid export configuration");
    }
    const totalTracks = trackIds.length;
    const duration = config.getDuration();
    status.init(duration * totalTracks, config.getFullPath());
    status.setProgress("rendering" /* RENDERING */);
    for (let i = 0; i < trackIds.length; i++) {
      if (status.aborted) break;
      const trackId = trackIds[i];
      const trackName = trackNames.get(trackId) || `Track_${i + 1}`;
      const safeTrackName = trackName.replace(/[^a-zA-Z0-9_-]/g, "_");
      logger.debug(
        "OfflineExporter",
        `Stem ${i + 1}/${totalTracks}: ${trackName}`
      );
      const renderedBuffer = await getTrackAudio(
        [trackId],
        config.startFrame,
        config.endFrame
      );
      if (config.normalize) {
        if (config.normalizeMode === "lufs") {
          normalizeLUFS(renderedBuffer, config.targetLufs);
        } else {
          await this.normalizeBuffer(renderedBuffer, config.targetPeakDb);
        }
      }
      if (config.truePeakLimit) {
        applyTruePeakLimiter(renderedBuffer, config.truePeakCeiling);
      }
      const blob = await this.encodeToBlob(renderedBuffer, config);
      const filename = `${config.filename}_${safeTrackName}.${config.format}`;
      results.set(trackId, { blob, filename });
      status.updateProcessedFrames(duration * (i + 1));
    }
    if (!status.aborted) {
      const firstResult = results.values().next().value;
      if (firstResult) {
        const url = URL.createObjectURL(firstResult.blob);
        status.complete(firstResult.blob, url);
      }
    }
    return results;
  }
};

// core/src/audio/Auditioner.ts
init_Signal();
var AuditionerState = /* @__PURE__ */ ((AuditionerState2) => {
  AuditionerState2["IDLE"] = "IDLE";
  AuditionerState2["LOADING"] = "LOADING";
  AuditionerState2["PLAYING"] = "PLAYING";
  AuditionerState2["PAUSED"] = "PAUSED";
  return AuditionerState2;
})(AuditionerState || {});
var Auditioner = class {
  constructor() {
    this._state = "IDLE" /* IDLE */;
    this._currentSourceId = null;
    this._currentUrl = null;
    this._position = 0;
    this._duration = 0;
    this._gain = 1;
    this._looping = false;
    // Region preview: play a specific portion of a source
    this._regionStart = 0;
    this._regionLength = 0;
    this.stateChanged = new Signal();
    this.positionChanged = new Signal();
    this.finished = new Signal();
  }
  // ---------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------
  get state() {
    return this._state;
  }
  get isPlaying() {
    return this._state === "PLAYING" /* PLAYING */;
  }
  get position() {
    return this._position;
  }
  get duration() {
    return this._duration;
  }
  get currentSourceId() {
    return this._currentSourceId;
  }
  // ---------------------------------------------------------------
  // Audition API
  // ---------------------------------------------------------------
  /**
   * Audition an entire source by URL.
   *
   * Cancels any currently active audition, then begins playback of the
   * full source from the beginning.
   */
  auditSource(sourceId, url, duration) {
    this.cancel();
    this._currentSourceId = sourceId;
    this._currentUrl = url;
    this._duration = duration;
    this._position = 0;
    this._regionStart = 0;
    this._regionLength = duration;
    this.setState("LOADING" /* LOADING */);
    this.setState("PLAYING" /* PLAYING */);
  }
  /**
   * Audition a specific region of a source.
   *
   * Useful for previewing a trimmed region or a clip without
   * having to play the full underlying source.
   */
  auditRegion(sourceId, url, start, length) {
    this.cancel();
    this._currentSourceId = sourceId;
    this._currentUrl = url;
    this._duration = length;
    this._position = 0;
    this._regionStart = start;
    this._regionLength = length;
    this.setState("LOADING" /* LOADING */);
    this.setState("PLAYING" /* PLAYING */);
  }
  // ---------------------------------------------------------------
  // Transport controls
  // ---------------------------------------------------------------
  /**
   * Resume or start playback of the current audition.
   */
  play() {
    if (this._state === "PAUSED" /* PAUSED */ || this._state === "LOADING" /* LOADING */) {
      this.setState("PLAYING" /* PLAYING */);
    }
  }
  /**
   * Pause the current audition. Position is preserved so playback
   * can be resumed with {@link play}.
   */
  pause() {
    if (this._state === "PLAYING" /* PLAYING */) {
      this.setState("PAUSED" /* PAUSED */);
    }
  }
  /**
   * Stop playback and reset position to the beginning.
   */
  stop() {
    if (this._state === "IDLE" /* IDLE */) {
      return;
    }
    this._position = 0;
    this.positionChanged.emit(this._position);
    this.setState("IDLE" /* IDLE */);
  }
  /**
   * Seek to an absolute frame position within the auditioned region.
   * The position is clamped to [0, duration).
   */
  seek(frame) {
    if (this._currentSourceId === null) {
      return;
    }
    this._position = Math.max(0, Math.min(frame, this._regionLength - 1));
    this.positionChanged.emit(this._position);
  }
  // ---------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------
  /**
   * Set the auditioner output gain.
   * @param gain Linear gain value (0.0 = silence, 1.0 = unity).
   */
  setGain(gain) {
    this._gain = Math.max(0, gain);
  }
  /**
   * Enable or disable looping for the current audition.
   */
  setLooping(loop) {
    this._looping = loop;
  }
  // ---------------------------------------------------------------
  // Audio processing
  // ---------------------------------------------------------------
  /**
   * Called by the audio engine on each render cycle to advance the
   * auditioner position and produce an output descriptor.
   *
   * Returns `null` when the auditioner is not actively playing.
   * When playback reaches the end of the region and looping is
   * disabled, emits the {@link finished} signal and transitions
   * to IDLE.
   *
   * @param blockSize   Number of frames in this render block.
   * @param _sampleRate Current engine sample rate (reserved for
   *                    future sample-rate conversion).
   */
  processBlock(blockSize, _sampleRate) {
    if (this._state !== "PLAYING" /* PLAYING */) {
      return null;
    }
    if (this._currentSourceId === null || this._currentUrl === null) {
      return null;
    }
    const remaining = this._regionLength - this._position;
    if (remaining <= 0) {
      if (this._looping) {
        this._position = 0;
      } else {
        this.setState("IDLE" /* IDLE */);
        this._position = 0;
        this.positionChanged.emit(this._position);
        this.finished.emit(void 0);
        return null;
      }
    }
    const framesToRender = Math.min(
      blockSize,
      this._regionLength - this._position
    );
    const output = {
      sourceId: this._currentSourceId,
      url: this._currentUrl,
      startInSource: this._regionStart + this._position,
      blockSize: framesToRender,
      gain: this._gain
    };
    this._position += framesToRender;
    this.positionChanged.emit(this._position);
    if (this._position >= this._regionLength) {
      if (this._looping) {
        this._position = 0;
      } else {
        this.setState("IDLE" /* IDLE */);
        this._position = 0;
        this.positionChanged.emit(this._position);
        this.finished.emit(void 0);
      }
    }
    return output;
  }
  // ---------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------
  /**
   * Cancel the current audition and reset all state.
   */
  cancel() {
    this._currentSourceId = null;
    this._currentUrl = null;
    this._position = 0;
    this._duration = 0;
    this._regionStart = 0;
    this._regionLength = 0;
    if (this._state !== "IDLE" /* IDLE */) {
      this.setState("IDLE" /* IDLE */);
    }
  }
  // ---------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------
  setState(state) {
    if (this._state !== state) {
      this._state = state;
      this.stateChanged.emit(state);
    }
  }
};

// core/src/config/product-identifiers.ts
var BWF_ORIGINATOR_REFERENCE_PREFIX = "HURRAEY";
var DAW_DATABASE_NAME = "hurraey-daw";
var KEY_BINDINGS_STORAGE_KEY = "hurraey-keybindings";
var PLUGIN_PRESET_STORAGE_KEY = "hurraey-plugin-presets";
var PREFERENCES_STORAGE_KEY = "hurraey-preferences";

// core/src/audio/BWFMetadata.ts
var BEXT_FIXED_SIZE = 602;
var OFF_DESCRIPTION = 0;
var LEN_DESCRIPTION = 256;
var OFF_ORIGINATOR = 256;
var LEN_ORIGINATOR = 32;
var OFF_ORIGINATOR_REF = 288;
var LEN_ORIGINATOR_REF = 32;
var OFF_ORIGINATION_DATE = 320;
var LEN_ORIGINATION_DATE = 10;
var OFF_ORIGINATION_TIME = 330;
var LEN_ORIGINATION_TIME = 8;
var OFF_TIME_REF_LOW = 338;
var OFF_TIME_REF_HIGH = 342;
var OFF_VERSION = 346;
var OFF_UMID = 348;
var LEN_UMID = 64;
var OFF_LOUDNESS_VALUE = 412;
var OFF_LOUDNESS_RANGE = 414;
var OFF_MAX_TRUE_PEAK = 416;
var OFF_MAX_MOMENTARY = 418;
var OFF_MAX_SHORT_TERM = 420;
var OFF_CODING_HISTORY = 602;
var BWFMetadata = class _BWFMetadata {
  // ---------------------------------------------------------------
  // Parse
  // ---------------------------------------------------------------
  /**
   * Parse BWF metadata from a WAV file ArrayBuffer.
   *
   * Scans the RIFF/WAVE structure for a 'bext' chunk and decodes the
   * fields according to EBU Tech 3285 v2. Returns `null` when no bext
   * chunk is found.
   */
  static parse(wavData) {
    const view = new DataView(wavData);
    const bext = _BWFMetadata.findChunk(view, "bext");
    if (!bext) {
      return null;
    }
    const base = bext.offset;
    const description = _BWFMetadata.readFixedString(
      view,
      base + OFF_DESCRIPTION,
      LEN_DESCRIPTION
    );
    const originator = _BWFMetadata.readFixedString(
      view,
      base + OFF_ORIGINATOR,
      LEN_ORIGINATOR
    );
    const originatorReference = _BWFMetadata.readFixedString(
      view,
      base + OFF_ORIGINATOR_REF,
      LEN_ORIGINATOR_REF
    );
    const originationDate = _BWFMetadata.readFixedString(
      view,
      base + OFF_ORIGINATION_DATE,
      LEN_ORIGINATION_DATE
    );
    const originationTime = _BWFMetadata.readFixedString(
      view,
      base + OFF_ORIGINATION_TIME,
      LEN_ORIGINATION_TIME
    );
    const timeRefLow = view.getUint32(base + OFF_TIME_REF_LOW, true);
    const timeRefHigh = view.getUint32(base + OFF_TIME_REF_HIGH, true);
    const timeReference = BigInt(timeRefHigh) << BigInt(32) | BigInt(timeRefLow);
    const version = view.getUint16(base + OFF_VERSION, true);
    const umid = new Uint8Array(wavData, base + OFF_UMID, LEN_UMID);
    const loudnessValue = view.getInt16(base + OFF_LOUDNESS_VALUE, true);
    const loudnessRange = view.getInt16(base + OFF_LOUDNESS_RANGE, true);
    const maxTruePeakLevel = view.getInt16(base + OFF_MAX_TRUE_PEAK, true);
    const maxMomentaryLoudness = view.getInt16(base + OFF_MAX_MOMENTARY, true);
    const maxShortTermLoudness = view.getInt16(base + OFF_MAX_SHORT_TERM, true);
    let codingHistory = "";
    if (bext.size > BEXT_FIXED_SIZE) {
      const codingLen = bext.size - BEXT_FIXED_SIZE;
      codingHistory = _BWFMetadata.readFixedString(
        view,
        base + OFF_CODING_HISTORY,
        codingLen
      );
    }
    return {
      description,
      originator,
      originatorReference,
      originationDate,
      originationTime,
      timeReference,
      version,
      umid: new Uint8Array(umid),
      // defensive copy
      loudnessValue,
      loudnessRange,
      maxTruePeakLevel,
      maxMomentaryLoudness,
      maxShortTermLoudness,
      codingHistory
    };
  }
  // ---------------------------------------------------------------
  // Create bext chunk
  // ---------------------------------------------------------------
  /**
   * Serialise {@link BWFData} into a standalone bext chunk (including
   * the 8-byte chunk header: 'bext' + uint32 size).
   */
  static createBextChunk(data) {
    const codingBytes = _BWFMetadata.encodeString(data.codingHistory);
    const dataSize = BEXT_FIXED_SIZE + codingBytes.byteLength;
    const paddedDataSize = dataSize + dataSize % 2;
    const chunkBuffer = new ArrayBuffer(8 + paddedDataSize);
    const view = new DataView(chunkBuffer);
    _BWFMetadata.writeChunkId(view, 0, "bext");
    view.setUint32(4, dataSize, true);
    const base = 8;
    _BWFMetadata.writeFixedString(
      view,
      base + OFF_DESCRIPTION,
      data.description,
      LEN_DESCRIPTION
    );
    _BWFMetadata.writeFixedString(
      view,
      base + OFF_ORIGINATOR,
      data.originator,
      LEN_ORIGINATOR
    );
    _BWFMetadata.writeFixedString(
      view,
      base + OFF_ORIGINATOR_REF,
      data.originatorReference,
      LEN_ORIGINATOR_REF
    );
    _BWFMetadata.writeFixedString(
      view,
      base + OFF_ORIGINATION_DATE,
      data.originationDate,
      LEN_ORIGINATION_DATE
    );
    _BWFMetadata.writeFixedString(
      view,
      base + OFF_ORIGINATION_TIME,
      data.originationTime,
      LEN_ORIGINATION_TIME
    );
    const mask32 = BigInt("0xFFFFFFFF");
    const low = Number(data.timeReference & mask32);
    const high = Number(data.timeReference >> BigInt(32) & mask32);
    view.setUint32(base + OFF_TIME_REF_LOW, low, true);
    view.setUint32(base + OFF_TIME_REF_HIGH, high, true);
    view.setUint16(base + OFF_VERSION, data.version, true);
    const umidDst = new Uint8Array(chunkBuffer, base + OFF_UMID, LEN_UMID);
    const umidLen = Math.min(data.umid.byteLength, LEN_UMID);
    umidDst.set(data.umid.subarray(0, umidLen));
    view.setInt16(base + OFF_LOUDNESS_VALUE, data.loudnessValue, true);
    view.setInt16(base + OFF_LOUDNESS_RANGE, data.loudnessRange, true);
    view.setInt16(base + OFF_MAX_TRUE_PEAK, data.maxTruePeakLevel, true);
    view.setInt16(base + OFF_MAX_MOMENTARY, data.maxMomentaryLoudness, true);
    view.setInt16(base + OFF_MAX_SHORT_TERM, data.maxShortTermLoudness, true);
    const codingDst = new Uint8Array(
      chunkBuffer,
      base + OFF_CODING_HISTORY,
      codingBytes.byteLength
    );
    codingDst.set(codingBytes);
    return chunkBuffer;
  }
  // ---------------------------------------------------------------
  // Inject bext into existing WAV
  // ---------------------------------------------------------------
  /**
   * Inject a bext chunk into an existing WAV file.
   *
   * If the WAV already contains a bext chunk it is replaced.
   * The returned ArrayBuffer is a new, valid RIFF/WAVE file.
   */
  static injectBWF(wavData, bwfData) {
    const srcView = new DataView(wavData);
    if (_BWFMetadata.readChunkId(srcView, 0) !== "RIFF") {
      throw new Error("Not a valid RIFF file");
    }
    if (_BWFMetadata.readChunkId(srcView, 8) !== "WAVE") {
      throw new Error("Not a valid WAVE file");
    }
    const bextChunk = _BWFMetadata.createBextChunk(bwfData);
    const existing = _BWFMetadata.findChunkRaw(srcView, "bext");
    if (existing) {
      const existingChunkTotal = 8 + existing.size + existing.size % 2;
      const beforeLen = existing.headerOffset;
      const afterStart = existing.headerOffset + existingChunkTotal;
      const afterLen = wavData.byteLength - afterStart;
      const newSize = beforeLen + bextChunk.byteLength + afterLen;
      const result = new ArrayBuffer(newSize);
      const dst = new Uint8Array(result);
      dst.set(new Uint8Array(wavData, 0, beforeLen), 0);
      dst.set(new Uint8Array(bextChunk), beforeLen);
      dst.set(
        new Uint8Array(wavData, afterStart, afterLen),
        beforeLen + bextChunk.byteLength
      );
      const resultView = new DataView(result);
      resultView.setUint32(4, newSize - 8, true);
      return result;
    } else {
      const insertOffset = 12;
      const newSize = wavData.byteLength + bextChunk.byteLength;
      const result = new ArrayBuffer(newSize);
      const dst = new Uint8Array(result);
      dst.set(new Uint8Array(wavData, 0, insertOffset), 0);
      dst.set(new Uint8Array(bextChunk), insertOffset);
      dst.set(
        new Uint8Array(
          wavData,
          insertOffset,
          wavData.byteLength - insertOffset
        ),
        insertOffset + bextChunk.byteLength
      );
      const resultView = new DataView(result);
      resultView.setUint32(4, newSize - 8, true);
      return result;
    }
  }
  // ---------------------------------------------------------------
  // Factory / defaults
  // ---------------------------------------------------------------
  /**
   * Create default BWF data suitable for a new recording.
   *
   * Populates the origination date/time from the current wall clock and
   * sets all other fields to sensible defaults.
   */
  static createDefault(options) {
    const now = /* @__PURE__ */ new Date();
    const pad2 = (n) => n.toString().padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
    const sr = options?.sampleRate ?? 48e3;
    const codingHistory = `A=PCM,F=${sr},W=24,M=stereo,T=daw-engine\r
`;
    return {
      description: options?.description ?? "",
      originator: options?.originator ?? "daw-engine",
      originatorReference: _BWFMetadata.generateOriginatorReference(),
      originationDate: dateStr,
      originationTime: timeStr,
      timeReference: options?.timeReference ?? BigInt(0),
      version: 2,
      umid: new Uint8Array(64),
      loudnessValue: 0,
      loudnessRange: 0,
      maxTruePeakLevel: 0,
      maxMomentaryLoudness: 0,
      maxShortTermLoudness: 0,
      codingHistory
    };
  }
  // ---------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------
  /**
   * Validate BWF data according to EBU Tech 3285 constraints.
   *
   * @returns An array of human-readable error strings (empty = valid).
   */
  static validate(data) {
    const errors = [];
    if (data.description.length > LEN_DESCRIPTION) {
      errors.push(
        `Description exceeds ${LEN_DESCRIPTION} characters (got ${data.description.length})`
      );
    }
    if (data.originator.length > LEN_ORIGINATOR) {
      errors.push(
        `Originator exceeds ${LEN_ORIGINATOR} characters (got ${data.originator.length})`
      );
    }
    if (data.originatorReference.length > LEN_ORIGINATOR_REF) {
      errors.push(
        `OriginatorReference exceeds ${LEN_ORIGINATOR_REF} characters (got ${data.originatorReference.length})`
      );
    }
    if (data.originationDate.length > 0 && !/^\d{4}[-:]\d{2}[-:]\d{2}$/.test(data.originationDate)) {
      errors.push(
        `OriginationDate must be in YYYY-MM-DD format (got "${data.originationDate}")`
      );
    }
    if (data.originationTime.length > 0 && !/^\d{2}[:.]\d{2}[:.]\d{2}$/.test(data.originationTime)) {
      errors.push(
        `OriginationTime must be in HH:MM:SS format (got "${data.originationTime}")`
      );
    }
    if (data.timeReference < BigInt(0)) {
      errors.push("TimeReference must be non-negative");
    }
    if (data.version < 0 || data.version > 2) {
      errors.push(`Version must be 0, 1, or 2 (got ${data.version})`);
    }
    if (data.umid.byteLength !== 64) {
      errors.push(
        `UMID must be exactly 64 bytes (got ${data.umid.byteLength})`
      );
    }
    if (data.version < 2) {
      if (data.loudnessValue !== 0 || data.loudnessRange !== 0 || data.maxTruePeakLevel !== 0 || data.maxMomentaryLoudness !== 0 || data.maxShortTermLoudness !== 0) {
        errors.push("Loudness fields are only valid for BWF version 2");
      }
    }
    return errors;
  }
  // ---------------------------------------------------------------
  // Private helpers — string I/O
  // ---------------------------------------------------------------
  /**
   * Read a fixed-length ASCII string from a DataView, trimming NUL
   * padding from the right.
   */
  static readFixedString(view, offset, length) {
    const bytes = [];
    for (let i = 0; i < length; i++) {
      const b = view.getUint8(offset + i);
      if (b === 0) break;
      bytes.push(b);
    }
    return String.fromCharCode(...bytes);
  }
  /**
   * Write a string into a fixed-length field, padding with NUL bytes.
   */
  static writeFixedString(view, offset, str, length) {
    const toWrite = Math.min(str.length, length);
    for (let i = 0; i < toWrite; i++) {
      view.setUint8(offset + i, str.charCodeAt(i) & 255);
    }
  }
  // ---------------------------------------------------------------
  // Private helpers — chunk navigation
  // ---------------------------------------------------------------
  /**
   * Locate a RIFF chunk by its four-character ID.
   *
   * Returns the offset of the chunk *data* (after the 8-byte header)
   * and the data size. Returns `null` if the chunk is not found.
   */
  static findChunk(view, chunkId) {
    const raw = _BWFMetadata.findChunkRaw(view, chunkId);
    if (!raw) return null;
    return { offset: raw.headerOffset + 8, size: raw.size };
  }
  /**
   * Internal chunk finder that also returns the header offset (for
   * replacement scenarios in {@link injectBWF}).
   */
  static findChunkRaw(view, chunkId) {
    if (view.byteLength < 12) return null;
    if (_BWFMetadata.readChunkId(view, 0) !== "RIFF") return null;
    if (_BWFMetadata.readChunkId(view, 8) !== "WAVE") return null;
    let pos = 12;
    while (pos + 8 <= view.byteLength) {
      const id = _BWFMetadata.readChunkId(view, pos);
      const size = view.getUint32(pos + 4, true);
      if (id === chunkId) {
        return { headerOffset: pos, size };
      }
      pos += 8 + size + size % 2;
    }
    return null;
  }
  /**
   * Read a four-character chunk ID from a DataView.
   */
  static readChunkId(view, offset) {
    return String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
  }
  /**
   * Write a four-character chunk ID into a DataView.
   */
  static writeChunkId(view, offset, id) {
    for (let i = 0; i < 4; i++) {
      view.setUint8(offset + i, id.charCodeAt(i));
    }
  }
  /**
   * Encode a string to a Uint8Array using ASCII (Latin-1 subset).
   */
  static encodeString(str) {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i) & 255;
    }
    return arr;
  }
  /**
   * Generate a unique originator reference string.
   *
   * EBU R99-1999 recommends a format based on country code, org code,
   * and a serial number. We use a simplified random approach.
   */
  static generateOriginatorReference() {
    const now = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 10);
    return `${BWF_ORIGINATOR_REFERENCE_PREFIX}${now}${rand}`.substring(0, 32);
  }
};

// core/src/index.ts
init_LatencyCompensator();

// core/src/audio/engine/SidechainRouter.ts
init_Signal();
var SidechainRouter = class {
  /**
   * @param sampleRate - The audio sample rate (e.g. 44100, 48000)
   */
  constructor(sampleRate = 44100) {
    this._configs = /* @__PURE__ */ new Map();
    /** Buffer storage: configId -> latest audio block from source */
    this._sidechainBuffers = /* @__PURE__ */ new Map();
    /** HPF filter state per config (one state per channel, keyed by configId) */
    this._filterStates = /* @__PURE__ */ new Map();
    this.routingChanged = new Signal();
    this._sampleRate = sampleRate;
  }
  // ─── Configuration Management ──────────────────────────────────────────────
  /**
   * Register a sidechain configuration.
   * Initialises the buffer and filter state for the new config.
   */
  addConfig(config) {
    this._configs.set(config.id, config);
    this._sidechainBuffers.set(config.id, {
      data: [],
      blockSize: 0,
      valid: false
    });
    this._rebuildFilterState(config);
    config.filterChanged.connect(() => {
      this._rebuildFilterState(config);
    });
    this.routingChanged.emit();
  }
  /**
   * Remove a sidechain configuration and clean up its resources.
   */
  removeConfig(configId) {
    if (!this._configs.has(configId)) {
      return;
    }
    this._configs.delete(configId);
    this._sidechainBuffers.delete(configId);
    this._filterStates.delete(configId);
    this.routingChanged.emit();
  }
  /**
   * Get config by ID.
   */
  getConfig(configId) {
    return this._configs.get(configId);
  }
  /**
   * Get all configs targeting a specific track.
   */
  getConfigsForTarget(trackId) {
    const result = [];
    for (const config of this._configs.values()) {
      if (config.targetTrackId === trackId) {
        result.push(config);
      }
    }
    return result;
  }
  /**
   * Get all configs sourcing from a specific track.
   */
  getConfigsForSource(trackId) {
    const result = [];
    for (const config of this._configs.values()) {
      if (config.sourceTrackId === trackId) {
        result.push(config);
      }
    }
    return result;
  }
  // ─── Audio Routing ─────────────────────────────────────────────────────────
  /**
   * Called by the audio engine when a source track produces audio.
   * Stores the audio block for later retrieval by target processors.
   *
   * For every config that sources from the given trackId, we copy the
   * audio data into the config's sidechain buffer.
   *
   * @param trackId - The source track that just produced audio
   * @param audioData - Per-channel audio data (e.g. [leftChannel, rightChannel])
   * @param blockSize - Number of samples per channel in this block
   */
  feedSourceAudio(trackId, audioData, blockSize) {
    for (const config of this._configs.values()) {
      if (config.sourceTrackId !== trackId || !config.enabled) {
        continue;
      }
      const numChannels = audioData.length;
      let buffer = this._sidechainBuffers.get(config.id);
      if (!buffer || buffer.data.length !== numChannels || buffer.blockSize !== blockSize) {
        buffer = {
          data: new Array(numChannels).fill(null).map(() => new Float32Array(blockSize)),
          blockSize,
          valid: false
        };
        this._sidechainBuffers.set(config.id, buffer);
      }
      for (let ch = 0; ch < numChannels; ch++) {
        buffer.data[ch].set(audioData[ch].subarray(0, blockSize));
      }
      buffer.valid = true;
    }
  }
  /**
   * Called by the target processor to get the sidechain input.
   * Returns the latest audio block from the source track (with optional HPF applied),
   * or null if no valid data is available.
   *
   * @param configId - The sidechain configuration ID
   * @returns Per-channel audio data, or null if unavailable
   */
  getSidechainInput(configId) {
    const config = this._configs.get(configId);
    if (!config || !config.enabled) {
      return null;
    }
    const buffer = this._sidechainBuffers.get(configId);
    if (!buffer || !buffer.valid || buffer.data.length === 0) {
      return null;
    }
    if (config.sidechainFilterEnabled) {
      return this._applyHPF(configId, buffer.data);
    }
    return buffer.data.map((ch) => new Float32Array(ch));
  }
  // ─── HPF (High-Pass Filter) ────────────────────────────────────────────────
  /**
   * Apply a 2nd-order Butterworth high-pass filter to the sidechain signal.
   * Processes in-place on copies of the input channels.
   *
   * The Butterworth HPF transfer function is implemented as a Direct Form I
   * biquad filter: y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
   */
  _applyHPF(configId, inputChannels) {
    const numChannels = inputChannels.length;
    let states = this._filterStates.get(configId);
    if (!states || states.length !== numChannels) {
      const config = this._configs.get(configId);
      if (!config) {
        return inputChannels.map((ch) => new Float32Array(ch));
      }
      states = new Array(numChannels).fill(null).map(
        () => computeHPFCoefficients(
          config.sidechainFilterFrequency,
          this._sampleRate
        )
      );
      this._filterStates.set(configId, states);
    }
    const output = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const input = inputChannels[ch];
      const out = new Float32Array(input.length);
      const state = states[ch];
      for (let i = 0; i < input.length; i++) {
        const x = input[i];
        const y = state.b0 * x + state.b1 * state.x1 + state.b2 * state.x2 - state.a1 * state.y1 - state.a2 * state.y2;
        state.x2 = state.x1;
        state.x1 = x;
        state.y2 = state.y1;
        state.y1 = y;
        out[i] = y;
      }
      output.push(out);
    }
    return output;
  }
  /**
   * Rebuild the filter state for a given config.
   * Called when the config is added or its filter parameters change.
   */
  _rebuildFilterState(config) {
    const buffer = this._sidechainBuffers.get(config.id);
    const numChannels = buffer ? Math.max(buffer.data.length, 2) : 2;
    const states = new Array(numChannels).fill(null).map(
      () => computeHPFCoefficients(
        config.sidechainFilterFrequency,
        this._sampleRate
      )
    );
    this._filterStates.set(config.id, states);
  }
  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  /**
   * Reset all buffers and filter states.
   * Typically called when transport stops or seeks.
   */
  reset() {
    for (const [configId, buffer] of this._sidechainBuffers.entries()) {
      for (const ch of buffer.data) {
        ch.fill(0);
      }
      buffer.valid = false;
      const states = this._filterStates.get(configId);
      if (states) {
        for (const state of states) {
          state.x1 = 0;
          state.x2 = 0;
          state.y1 = 0;
          state.y2 = 0;
        }
      }
    }
  }
  /**
   * Update the sample rate. Recomputes all HPF filter coefficients.
   */
  setSampleRate(sampleRate) {
    this._sampleRate = sampleRate;
    for (const config of this._configs.values()) {
      this._rebuildFilterState(config);
    }
  }
};
function computeHPFCoefficients(frequency, sampleRate) {
  const nyquist = sampleRate / 2;
  const freq = Math.max(1, Math.min(frequency, nyquist * 0.99));
  const omega = 2 * Math.PI * freq / sampleRate;
  const K = Math.tan(omega / 2);
  const K2 = K * K;
  const sqrt2 = Math.SQRT2;
  const norm = 1 / (1 + sqrt2 * K + K2);
  return {
    // Delay line state (zeroed)
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0,
    // Coefficients
    b0: norm,
    b1: -2 * norm,
    b2: norm,
    a1: 2 * (K2 - 1) * norm,
    a2: (1 - sqrt2 * K + K2) * norm
  };
}

// core/src/audio/engine/RoutingGraph.ts
init_Signal();
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

// core/src/audio/engine/PunchRecordManager.ts
init_Signal();
var PunchRecordManager = class {
  /**
   * @param sampleRate - Audio sample rate, used to compute declick fade length.
   *                     Defaults to 44100 if omitted.
   */
  constructor(sampleRate) {
    this._enabled = false;
    this._punchIn = 0;
    this._punchOut = 0;
    this._isPunchedIn = false;
    this._armedTrackIds = /* @__PURE__ */ new Set();
    // Declick fade length in frames (~1.5ms at 44100)
    this._declickLength = 64;
    /** Emitted when the playhead enters the punch range and recording begins. */
    this.punchInTriggered = new Signal();
    /** Emitted when the playhead exits the punch range and recording stops. */
    this.punchOutTriggered = new Signal();
    /** Emitted whenever the punch state changes. */
    this.stateChanged = new Signal();
    const rate = sampleRate ?? 44100;
    this._declickLength = Math.max(16, Math.round(1.5 / 1e3 * rate));
  }
  // ─── Configuration ──────────────────────────────────────────────────
  /**
   * Configure the punch range boundaries.
   * @param punchIn - Frame at which recording should begin
   * @param punchOut - Frame at which recording should end
   */
  setPunchRange(punchIn, punchOut) {
    if (punchOut <= punchIn) {
      throw new Error(
        `Invalid punch range: punchOut (${punchOut}) must be greater than punchIn (${punchIn})`
      );
    }
    this._punchIn = punchIn;
    this._punchOut = punchOut;
    this._emitStateChanged();
  }
  /**
   * Enable or disable punch recording.
   * Disabling while punched-in will trigger an immediate punch-out.
   */
  setEnabled(enabled) {
    const wasEnabled = this._enabled;
    this._enabled = enabled;
    if (wasEnabled && !enabled && this._isPunchedIn) {
      this._doPunchOut();
    }
    this._emitStateChanged();
  }
  // ─── Track Arming ───────────────────────────────────────────────────
  /**
   * Arm a track for punch recording.
   * Only armed tracks will be affected by punch-in/punch-out events.
   */
  armTrack(trackId) {
    this._armedTrackIds.add(trackId);
    this._emitStateChanged();
  }
  /**
   * Disarm a track from punch recording.
   */
  disarmTrack(trackId) {
    this._armedTrackIds.delete(trackId);
    this._emitStateChanged();
  }
  // ─── Processing ─────────────────────────────────────────────────────
  /**
   * Called each audio process cycle with the current transport position.
   * Checks whether the playhead has crossed a punch boundary and triggers
   * punch-in or punch-out accordingly.
   *
   * @param currentFrame - The current transport playhead position in frames
   * @returns true if the recording state changed during this call
   */
  processPosition(currentFrame) {
    if (!this._enabled) {
      return false;
    }
    if (this._armedTrackIds.size === 0) {
      return false;
    }
    const wasInRange = this._isPunchedIn;
    const isInRange = currentFrame >= this._punchIn && currentFrame < this._punchOut;
    if (!wasInRange && isInRange) {
      this._doPunchIn();
      return true;
    }
    if (wasInRange && !isInRange) {
      this._doPunchOut();
      return true;
    }
    return false;
  }
  // ─── State Queries ──────────────────────────────────────────────────
  /**
   * Get a snapshot of the current punch state.
   */
  getState() {
    return {
      enabled: this._enabled,
      punchIn: this._punchIn,
      punchOut: this._punchOut,
      isPunchedIn: this._isPunchedIn,
      armedTrackIds: Array.from(this._armedTrackIds)
    };
  }
  /**
   * Whether we're currently in the punched-in state (recording is active
   * within the punch range).
   */
  get isPunchedIn() {
    return this._isPunchedIn;
  }
  /**
   * Compute declick fade gain at a given position relative to punch boundaries.
   *
   * Returns a gain value between 0.0 and 1.0:
   * - Ramps from 0->1 over _declickLength frames starting at punchIn (fade-in)
   * - Ramps from 1->0 over _declickLength frames ending at punchOut (fade-out)
   * - Returns 1.0 for positions in the middle of the punch range
   * - Returns 0.0 for positions outside the punch range
   *
   * Uses a raised-cosine (Hann) curve for perceptually smooth transitions,
   * consistent with the Declicker class.
   */
  getDeclickGain(frame) {
    if (!this._enabled) {
      return 1;
    }
    if (frame < this._punchIn || frame >= this._punchOut) {
      return 0;
    }
    const fadeLen = this._declickLength;
    const distFromStart = frame - this._punchIn;
    if (distFromStart < fadeLen) {
      const t = distFromStart / (fadeLen - 1);
      return 0.5 * (1 - Math.cos(Math.PI * t));
    }
    const distFromEnd = this._punchOut - frame;
    if (distFromEnd <= fadeLen) {
      const t = (fadeLen - distFromEnd) / (fadeLen - 1);
      return 0.5 * (1 + Math.cos(Math.PI * t));
    }
    return 1;
  }
  /**
   * Reset state (called on transport stop).
   * Clears the punched-in state without emitting punch-out signals,
   * since transport stop implies recording has already ceased.
   */
  reset() {
    this._isPunchedIn = false;
    this._emitStateChanged();
  }
  // ─── Private helpers ────────────────────────────────────────────────
  /**
   * Execute a punch-in: transition to recording state and notify listeners.
   */
  _doPunchIn() {
    this._isPunchedIn = true;
    const trackIds = Array.from(this._armedTrackIds);
    this.punchInTriggered.emit(trackIds);
    this._emitStateChanged();
  }
  /**
   * Execute a punch-out: transition out of recording state and notify listeners.
   */
  _doPunchOut() {
    this._isPunchedIn = false;
    const trackIds = Array.from(this._armedTrackIds);
    this.punchOutTriggered.emit(trackIds);
    this._emitStateChanged();
  }
  /**
   * Emit a stateChanged signal with the current punch state snapshot.
   */
  _emitStateChanged() {
    this.stateChanged.emit(this.getState());
  }
};

// core/src/audio/engine/MultiTrackRecorder.ts
init_Signal();
var DEFAULT_SAMPLE_RATE2 = 44100;
var CLIP_THRESHOLD = 1;
var MultiTrackRecorder = class _MultiTrackRecorder {
  /**
   * @param sampleRate - Audio sample rate for WAV encoding. Defaults to 44100.
   */
  constructor(sampleRate) {
    this._assignments = /* @__PURE__ */ new Map();
    this._activeRecordings = /* @__PURE__ */ new Map();
    this._takeCounters = /* @__PURE__ */ new Map();
    this._isRecording = false;
    /** Emitted when recording starts on a set of tracks. */
    this.recordingStarted = new Signal();
    /** Emitted when recording stops, with results for each track. */
    this.recordingStopped = new Signal();
    /** Emitted periodically with per-track level updates during recording. */
    this.levelUpdate = new Signal();
    /** Emitted when clipping is detected on a track. */
    this.clipDetected = new Signal();
    this._sampleRate = sampleRate ?? DEFAULT_SAMPLE_RATE2;
  }
  // ─── Input Assignment ───────────────────────────────────────────────
  /**
   * Assign an input source to a track.
   * Defines which audio input channel or MIDI device feeds this track.
   */
  assignInput(assignment) {
    this._assignments.set(assignment.trackId, { ...assignment });
  }
  /**
   * Remove an input assignment from a track.
   */
  removeAssignment(trackId) {
    this._assignments.delete(trackId);
  }
  /**
   * Get the input assignment for a specific track.
   */
  getAssignment(trackId) {
    const assignment = this._assignments.get(trackId);
    return assignment ? { ...assignment } : void 0;
  }
  /**
   * Get all current input assignments.
   */
  getAllAssignments() {
    return Array.from(this._assignments.values()).map((a) => ({ ...a }));
  }
  // ─── Recording Control ──────────────────────────────────────────────
  /**
   * Start recording on all assigned and armed tracks simultaneously.
   * Only tracks that appear in both armedTrackIds AND have an input assignment
   * will begin recording.
   *
   * @param armedTrackIds - List of track IDs that are armed for recording
   * @param startFrame - The session frame at which recording begins
   */
  startRecording(armedTrackIds, startFrame) {
    if (this._isRecording) {
      return;
    }
    const tracksToRecord = [];
    for (const trackId of armedTrackIds) {
      if (!this._assignments.has(trackId)) {
        continue;
      }
      const currentTake = (this._takeCounters.get(trackId) ?? 0) + 1;
      this._takeCounters.set(trackId, currentTake);
      const recording = {
        trackId,
        startFrame,
        chunks: [],
        peakLevel: 0,
        hasClipped: false,
        takeNumber: currentTake
      };
      this._activeRecordings.set(trackId, recording);
      tracksToRecord.push(trackId);
    }
    if (tracksToRecord.length > 0) {
      this._isRecording = true;
      this.recordingStarted.emit(tracksToRecord);
    }
  }
  /**
   * Stop recording on all tracks and return results.
   * Each result contains the accumulated audio as a WAV blob, duration,
   * peak level, and clipping information.
   */
  stopRecording() {
    if (!this._isRecording) {
      return [];
    }
    const results = [];
    for (const [trackId, recording] of this._activeRecordings) {
      const result = this._finalizeRecording(recording);
      if (result) {
        results.push(result);
      }
    }
    this._activeRecordings.clear();
    this._isRecording = false;
    this.recordingStopped.emit(results);
    return results;
  }
  /**
   * Stop recording on a specific track while other tracks continue.
   * Returns the result for that track, or null if the track was not recording.
   */
  stopTrackRecording(trackId) {
    const recording = this._activeRecordings.get(trackId);
    if (!recording) {
      return null;
    }
    const result = this._finalizeRecording(recording);
    this._activeRecordings.delete(trackId);
    if (this._activeRecordings.size === 0) {
      this._isRecording = false;
    }
    return result;
  }
  // ─── Audio Data Feed ────────────────────────────────────────────────
  /**
   * Feed audio data for a specific track during recording.
   * Called from the audio processing callback for each block of samples.
   *
   * Accumulates chunks, tracks peak levels, and detects clipping.
   *
   * @param trackId - The track receiving the audio
   * @param data - Per-channel audio data (e.g. [leftChannel, rightChannel])
   * @param blockSize - Number of frames in this block
   */
  feedAudio(trackId, data, blockSize) {
    const recording = this._activeRecordings.get(trackId);
    if (!recording) {
      return;
    }
    const chunk = [];
    for (let ch = 0; ch < data.length; ch++) {
      const copy = new Float32Array(blockSize);
      const srcLen = Math.min(blockSize, data[ch].length);
      for (let i = 0; i < srcLen; i++) {
        copy[i] = data[ch][i];
      }
      chunk.push(copy);
    }
    recording.chunks.push(chunk);
    let blockPeak = 0;
    let clippedInBlock = false;
    for (let ch = 0; ch < data.length; ch++) {
      const channelData = data[ch];
      const len = Math.min(blockSize, channelData.length);
      for (let i = 0; i < len; i++) {
        const abs = Math.abs(channelData[i]);
        if (abs > blockPeak) {
          blockPeak = abs;
        }
        if (abs >= CLIP_THRESHOLD) {
          clippedInBlock = true;
        }
      }
    }
    if (blockPeak > recording.peakLevel) {
      recording.peakLevel = blockPeak;
    }
    if (clippedInBlock && !recording.hasClipped) {
      recording.hasClipped = true;
      this.clipDetected.emit(trackId);
    }
    this.levelUpdate.emit({ trackId, level: blockPeak });
  }
  // ─── Available Inputs ───────────────────────────────────────────────
  /**
   * Query the browser for available audio input devices.
   * Returns a list of input devices with their capabilities.
   */
  static async getAvailableInputs() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      return [];
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = [];
      for (const device of devices) {
        if (device.kind === "audioinput") {
          let channelCount = 2;
          try {
            const capabilities = device.getCapabilities?.();
            if (capabilities?.channelCount?.max) {
              channelCount = capabilities.channelCount.max;
            }
          } catch {
          }
          audioInputs.push({
            deviceId: device.deviceId,
            label: device.label || `Input ${audioInputs.length + 1}`,
            channelCount
          });
        }
      }
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return audioInputs;
    } catch {
      return [];
    }
  }
  // ─── State Queries ──────────────────────────────────────────────────
  /**
   * Whether the recorder is currently recording on any track.
   */
  get isRecording() {
    return this._isRecording;
  }
  /**
   * Get the list of track IDs that are currently being recorded.
   */
  getActiveTrackIds() {
    return Array.from(this._activeRecordings.keys());
  }
  /**
   * Reset all state: clear active recordings, assignments, and take counters.
   */
  reset() {
    this._activeRecordings.clear();
    this._assignments.clear();
    this._takeCounters.clear();
    this._isRecording = false;
  }
  // ─── Private helpers ────────────────────────────────────────────────
  /**
   * Finalize a recording: merge accumulated chunks into a WAV blob
   * and produce a RecordingResult.
   */
  _finalizeRecording(recording) {
    if (recording.chunks.length === 0) {
      return null;
    }
    const numChannels = recording.chunks[0].length;
    let totalFrames = 0;
    for (const chunk of recording.chunks) {
      totalFrames += chunk[0].length;
    }
    if (totalFrames === 0) {
      return null;
    }
    const mergedChannels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const merged = new Float32Array(totalFrames);
      let writePos = 0;
      for (const chunk of recording.chunks) {
        if (ch < chunk.length) {
          merged.set(chunk[ch], writePos);
          writePos += chunk[ch].length;
        } else {
          writePos += chunk[0].length;
        }
      }
      mergedChannels.push(merged);
    }
    const blob = _MultiTrackRecorder._encodeWav(
      mergedChannels,
      this._sampleRate,
      numChannels
    );
    return {
      trackId: recording.trackId,
      blob,
      startFrame: recording.startFrame,
      durationFrames: totalFrames,
      takeNumber: recording.takeNumber,
      peakLevel: recording.peakLevel,
      hasClipped: recording.hasClipped
    };
  }
  /**
   * Encode per-channel Float32Array data into a WAV file Blob.
   *
   * Produces a standard RIFF/WAVE file with IEEE Float32 audio format.
   * Header layout follows the canonical WAV specification.
   *
   * @param channels - Per-channel audio data arrays (all same length)
   * @param sampleRate - Sample rate in Hz
   * @param numChannels - Number of audio channels
   */
  static _encodeWav(channels, sampleRate, numChannels) {
    const totalFrames = channels[0].length;
    const bitsPerSample = 32;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = totalFrames * blockAlign;
    const interleaved = new Float32Array(totalFrames * numChannels);
    for (let frame = 0; frame < totalFrames; frame++) {
      for (let ch = 0; ch < numChannels; ch++) {
        interleaved[frame * numChannels + ch] = channels[ch][frame];
      }
    }
    const headerSize = 44;
    const header = new ArrayBuffer(headerSize);
    const view = new DataView(header);
    _MultiTrackRecorder._writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    _MultiTrackRecorder._writeString(view, 8, "WAVE");
    _MultiTrackRecorder._writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 3, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    _MultiTrackRecorder._writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);
    return new Blob([header, interleaved.buffer], {
      type: "audio/wav"
    });
  }
  /**
   * Write an ASCII string into a DataView at the given byte offset.
   */
  static _writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
};

// core/src/audio/export/ExportGraphBuilder.ts
var ExportGraphBuilder = class _ExportGraphBuilder {
  constructor(config) {
    this._nodes = [];
    this._config = config;
    this._sampleRate = config.sampleRate;
    this._channelCount = config.exportMasterOnly ? 2 : 2;
    this.buildFromConfig(config);
  }
  // ------------------------------------------------------------------ graph
  /**
   * Build the processing graph from an ExportConfig.
   * Clears any existing nodes and re-creates the chain.
   */
  buildFromConfig(config) {
    this._nodes = [];
    this._config = config;
    this._sampleRate = config.sampleRate;
    if (config.trimSilence) {
      this._nodes.push(_ExportGraphBuilder.createSilenceTrimNode(-60));
    }
    if (config.normalize) {
      const mode = config.normalizeMode ?? "peak";
      const targetLevel = mode === "lufs" ? config.targetLufs ?? -14 : config.targetPeakDb ?? -1;
      this._nodes.push(
        _ExportGraphBuilder.createNormalizeNode(mode, targetLevel)
      );
    }
    if (config.truePeakLimit) {
      this._nodes.push(
        _ExportGraphBuilder.createTruePeakLimiterNode(
          config.truePeakCeiling ?? -1
        )
      );
    }
    if (config.ditherType && config.ditherType !== "none" /* NONE */) {
      const targetBits = config.sampleFormat === "int16" /* INT16 */ ? 16 : config.sampleFormat === "int24" /* INT24 */ ? 24 : 32;
      if (targetBits < 32) {
        const ditherTypeMap = {
          ["none" /* NONE */]: "none",
          ["tpdf" /* TPDF */]: "triangular",
          ["shaped" /* SHAPED */]: "shaped"
        };
        this._nodes.push(
          _ExportGraphBuilder.createDitherNode(
            ditherTypeMap[config.ditherType] ?? "none",
            targetBits
          )
        );
      }
    }
    this._nodes.push(_ExportGraphBuilder.createAnalyzerNode());
  }
  // -------------------------------------------------------- node management
  /**
   * Add a node to the graph.
   * @param node   The node to insert.
   * @param position  Optional zero-based index. Appends if omitted.
   */
  addNode(node, position) {
    if (position !== void 0 && position >= 0 && position <= this._nodes.length) {
      this._nodes.splice(position, 0, node);
    } else {
      this._nodes.push(node);
    }
  }
  /**
   * Remove a node by id.
   */
  removeNode(id) {
    this._nodes = this._nodes.filter((n) => n.id !== id);
  }
  /**
   * Get the current ordered list of nodes (read-only copy).
   */
  getNodes() {
    return [...this._nodes];
  }
  // --------------------------------------------------------------- process
  /**
   * Process multi-channel audio through every node in sequence.
   */
  async processBuffer(inputBuffer) {
    let buffer = inputBuffer;
    for (const node of this._nodes) {
      buffer = await node.process(buffer, this._sampleRate);
    }
    return buffer;
  }
  /**
   * Encode the processed buffer into a Blob according to the config format.
   * This is a lightweight wrapper that delegates to format-specific logic.
   */
  async encode(buffer) {
    const format = this._config.format;
    const sampleRate = this._sampleRate;
    switch (format) {
      case "wav" /* WAV */:
      case "wav":
        return this._encodeWav(buffer, sampleRate, this._config.sampleFormat);
      case "flac" /* FLAC */:
      case "flac":
        return this._encodeRaw(buffer, "audio/flac");
      case "ogg" /* OGG */:
      case "ogg":
        return this._encodeRaw(buffer, "audio/ogg");
      case "mp3" /* MP3 */:
      case "mp3":
        return this._encodeRaw(buffer, "audio/mp3");
      default:
        return this._encodeWav(buffer, sampleRate, this._config.sampleFormat);
    }
  }
  // ===================================================================
  //  Built-in node factories
  // ===================================================================
  /**
   * Create a normalization node.
   * @param mode        'peak' or 'lufs'
   * @param targetLevel Target level in dB (peak) or LUFS
   */
  static createNormalizeNode(mode, targetLevel) {
    return {
      id: `normalize-${mode}`,
      type: "normalize",
      process(buffer, _sampleRate) {
        if (mode === "peak") {
          let maxPeak = 0;
          for (const ch of buffer) {
            for (let i = 0; i < ch.length; i++) {
              const abs = Math.abs(ch[i]);
              if (abs > maxPeak) maxPeak = abs;
            }
          }
          if (maxPeak === 0) return buffer;
          const targetLinear = Math.pow(10, targetLevel / 20);
          const gain = targetLinear / maxPeak;
          for (const ch of buffer) {
            for (let i = 0; i < ch.length; i++) {
              ch[i] *= gain;
            }
          }
        } else {
          let sumSquared = 0;
          let totalSamples = 0;
          for (const ch of buffer) {
            for (let i = 0; i < ch.length; i++) {
              sumSquared += ch[i] * ch[i];
            }
            totalSamples += ch.length;
          }
          if (totalSamples === 0 || sumSquared === 0) return buffer;
          const rms = Math.sqrt(sumSquared / totalSamples);
          const currentLufs = 20 * Math.log10(rms) - 0.691;
          const gainDb = targetLevel - currentLufs;
          const gainLinear = Math.pow(10, gainDb / 20);
          for (const ch of buffer) {
            for (let i = 0; i < ch.length; i++) {
              ch[i] *= gainLinear;
            }
          }
        }
        return buffer;
      }
    };
  }
  /**
   * Create a true-peak limiter node.
   * @param ceiling  Maximum true-peak level in dBTP (e.g. -1.0)
   */
  static createTruePeakLimiterNode(ceiling) {
    return {
      id: "true-peak-limiter",
      type: "limiter",
      process(buffer, _sampleRate) {
        const ceilingLinear = Math.pow(10, ceiling / 20);
        const attack = 1e-3;
        const release = 0.05;
        for (const ch of buffer) {
          let envelope = 0;
          for (let i = 0; i < ch.length; i++) {
            const abs = Math.abs(ch[i]);
            if (abs > envelope) {
              envelope = abs + attack * (abs - envelope);
            } else {
              envelope = abs + (1 - release) * (envelope - abs);
            }
            if (envelope > ceilingLinear) {
              ch[i] *= ceilingLinear / envelope;
            }
          }
        }
        return buffer;
      }
    };
  }
  /**
   * Create a dither node.
   * @param type      'none', 'triangular', or 'shaped'
   * @param bitDepth  Target bit depth (16 or 24)
   */
  static createDitherNode(type, bitDepth) {
    return {
      id: `dither-${type}-${bitDepth}`,
      type: "dither",
      process(buffer, _sampleRate) {
        if (type === "none") return buffer;
        const quantizationStep = 1 / Math.pow(2, bitDepth - 1);
        const scale = 1 / quantizationStep;
        for (const ch of buffer) {
          let previousError = 0;
          for (let i = 0; i < ch.length; i++) {
            const r1 = Math.random();
            const r2 = Math.random();
            const dither = (r1 - r2) * quantizationStep;
            if (type === "shaped") {
              const shaped = ch[i] + dither - previousError * 0.5;
              const quantized = Math.round(shaped * scale) / scale;
              previousError = quantized - ch[i];
              ch[i] = quantized;
            } else {
              const quantized = Math.round((ch[i] + dither) * scale) / scale;
              ch[i] = quantized;
            }
          }
        }
        return buffer;
      }
    };
  }
  /**
   * Create a silence-trimming node.
   * Removes leading and trailing silence below a threshold.
   * @param thresholdDb  Silence threshold in dBFS (e.g. -60)
   */
  static createSilenceTrimNode(thresholdDb) {
    return {
      id: "silence-trim",
      type: "silence_trim",
      process(buffer, _sampleRate) {
        if (buffer.length === 0 || buffer[0].length === 0) return buffer;
        const thresholdLinear = Math.pow(10, thresholdDb / 20);
        const length = buffer[0].length;
        let startSample = 0;
        outer_start: for (let i = 0; i < length; i++) {
          for (const ch of buffer) {
            if (Math.abs(ch[i]) > thresholdLinear) {
              startSample = i;
              break outer_start;
            }
          }
        }
        let endSample = length - 1;
        outer_end: for (let i = length - 1; i >= startSample; i--) {
          for (const ch of buffer) {
            if (Math.abs(ch[i]) > thresholdLinear) {
              endSample = i;
              break outer_end;
            }
          }
        }
        if (startSample > endSample) {
          return buffer.map(() => new Float32Array(1));
        }
        const trimmedLength = endSample - startSample + 1;
        return buffer.map(
          (ch) => ch.slice(startSample, startSample + trimmedLength)
        );
      }
    };
  }
  /**
   * Create a gain node.
   * @param gainDb  Gain in decibels
   */
  static createGainNode(gainDb) {
    return {
      id: `gain-${gainDb}dB`,
      type: "gain",
      process(buffer, _sampleRate) {
        const gainLinear = Math.pow(10, gainDb / 20);
        for (const ch of buffer) {
          for (let i = 0; i < ch.length; i++) {
            ch[i] *= gainLinear;
          }
        }
        return buffer;
      }
    };
  }
  /**
   * Create a sample-rate conversion node.
   * Uses linear interpolation for simplicity; a production implementation
   * would use windowed sinc interpolation.
   * @param fromRate  Source sample rate
   * @param toRate    Target sample rate
   */
  static createSampleRateConverter(fromRate, toRate) {
    return {
      id: `src-${fromRate}-${toRate}`,
      type: "sample_rate_convert",
      process(buffer, _sampleRate) {
        if (fromRate === toRate) return buffer;
        const ratio = fromRate / toRate;
        const newLength = Math.round(buffer[0].length / ratio);
        const result = [];
        for (const ch of buffer) {
          const output = new Float32Array(newLength);
          for (let i = 0; i < newLength; i++) {
            const srcPos = i * ratio;
            const idx = Math.floor(srcPos);
            const frac = srcPos - idx;
            if (idx + 1 < ch.length) {
              output[i] = ch[idx] * (1 - frac) + ch[idx + 1] * frac;
            } else if (idx < ch.length) {
              output[i] = ch[idx];
            }
          }
          result.push(output);
        }
        return result;
      }
    };
  }
  /**
   * Create an analyzer node that measures audio characteristics
   * without modifying the signal (pass-through).
   */
  static createAnalyzerNode() {
    let analysis = {
      peakDb: -Infinity,
      rmsDb: -Infinity,
      lufs: -Infinity,
      truePeakDb: -Infinity,
      dcOffset: 0,
      clippedSamples: 0
    };
    const node = {
      id: "analyzer",
      type: "analyzer",
      process(buffer, _sampleRate) {
        let maxPeak = 0;
        let sumSquared = 0;
        let totalSamples = 0;
        let dcSum = 0;
        let clipped = 0;
        let truePeak = 0;
        for (const ch of buffer) {
          for (let i = 0; i < ch.length; i++) {
            const sample = ch[i];
            const abs = Math.abs(sample);
            if (abs > maxPeak) maxPeak = abs;
            sumSquared += sample * sample;
            dcSum += sample;
            totalSamples++;
            if (abs >= 1) clipped++;
            if (i > 0) {
              const interpolated = Math.abs((ch[i - 1] + ch[i]) / 2);
              if (interpolated > truePeak) truePeak = interpolated;
            }
            if (abs > truePeak) truePeak = abs;
          }
        }
        const rms = totalSamples > 0 ? Math.sqrt(sumSquared / totalSamples) : 0;
        const dc = totalSamples > 0 ? dcSum / totalSamples : 0;
        analysis = {
          peakDb: maxPeak > 0 ? 20 * Math.log10(maxPeak) : -Infinity,
          rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
          lufs: rms > 0 ? 20 * Math.log10(rms) - 0.691 : -Infinity,
          truePeakDb: truePeak > 0 ? 20 * Math.log10(truePeak) : -Infinity,
          dcOffset: dc,
          clippedSamples: clipped
        };
        return buffer;
      },
      getAnalysis() {
        return { ...analysis };
      }
    };
    return node;
  }
  // ===================================================================
  //  Private helpers
  // ===================================================================
  /**
   * Encode multi-channel Float32Array[] as a WAV Blob.
   * Supports int16, int24, and float32.
   */
  _encodeWav(buffer, sampleRate, sampleFormat) {
    const numChannels = buffer.length;
    const numSamples = buffer[0]?.length ?? 0;
    let bytesPerSample;
    let audioFormat;
    switch (sampleFormat) {
      case "int16" /* INT16 */:
        bytesPerSample = 2;
        audioFormat = 1;
        break;
      case "int24" /* INT24 */:
        bytesPerSample = 3;
        audioFormat = 1;
        break;
      case "float32" /* FLOAT32 */:
      default:
        bytesPerSample = 4;
        audioFormat = 3;
        break;
    }
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numSamples * blockAlign;
    const headerSize = 44;
    const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(arrayBuffer);
    this._writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    this._writeString(view, 8, "WAVE");
    this._writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, audioFormat, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    this._writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);
    let offset = headerSize;
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = buffer[ch]?.[i] ?? 0;
        switch (sampleFormat) {
          case "int16" /* INT16 */: {
            const clamped = Math.max(-1, Math.min(1, sample));
            const int16 = clamped < 0 ? clamped * 32768 : clamped * 32767;
            view.setInt16(offset, int16, true);
            offset += 2;
            break;
          }
          case "int24" /* INT24 */: {
            const clamped = Math.max(-1, Math.min(1, sample));
            const int24 = Math.round(clamped * 8388607);
            view.setUint8(offset, int24 & 255);
            view.setUint8(offset + 1, int24 >> 8 & 255);
            view.setUint8(offset + 2, int24 >> 16 & 255);
            offset += 3;
            break;
          }
          case "float32" /* FLOAT32 */:
          default:
            view.setFloat32(offset, sample, true);
            offset += 4;
            break;
        }
      }
    }
    return new Blob([arrayBuffer], { type: "audio/wav" });
  }
  /**
   * Wrap raw Float32 data in a generic Blob (placeholder for formats
   * that require external encoders such as MP3, OGG, FLAC).
   */
  _encodeRaw(buffer, mimeType) {
    const numChannels = buffer.length;
    const numSamples = buffer[0]?.length ?? 0;
    const interleaved = new Float32Array(numChannels * numSamples);
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        interleaved[i * numChannels + ch] = buffer[ch]?.[i] ?? 0;
      }
    }
    return new Blob([interleaved.buffer], { type: mimeType });
  }
  _writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
};

// core/src/audio/export/CDMarkerExporter.ts
var CDMarkerExporter = class _CDMarkerExporter {
  /**
   * Generate a CUE sheet from CD markers.
   *
   * CUE format reference: https://en.wikipedia.org/wiki/Cue_sheet_(computing)
   * Time format: MM:SS:FF where FF = CD frames (75 fps)
   *
   * @param markers     Array of CDMarker instances
   * @param filename    Audio filename referenced in the CUE sheet
   * @param sampleRate  Sample rate of the audio
   * @param albumTitle  Optional album title
   * @param albumPerformer  Optional album performer
   */
  static generateCUE(markers, filename, sampleRate, albumTitle = "Untitled", albumPerformer = "") {
    const sorted = [...markers].sort((a, b) => a.index - b.index);
    const lines = [];
    if (albumPerformer) {
      lines.push(`PERFORMER "${albumPerformer}"`);
    }
    lines.push(`TITLE "${albumTitle}"`);
    lines.push(`FILE "${filename}" WAVE`);
    for (const marker of sorted) {
      const trackNum = String(marker.index).padStart(2, "0");
      lines.push(`  TRACK ${trackNum} AUDIO`);
      if (marker.title) {
        lines.push(`    TITLE "${marker.title}"`);
      }
      if (marker.performer) {
        lines.push(`    PERFORMER "${marker.performer}"`);
      }
      if (marker.isrc) {
        lines.push(`    ISRC ${marker.isrc}`);
      }
      const cdTime = _CDMarkerExporter.framesToCDTime(
        marker.position,
        sampleRate
      );
      lines.push(`    INDEX 01 ${cdTime}`);
    }
    return lines.join("\n") + "\n";
  }
  /**
   * Generate a cdrdao-compatible TOC (Table of Contents) file.
   *
   * TOC format reference: cdrdao(1) man page
   *
   * @param markers     Array of CDMarker instances
   * @param filename    Audio filename
   * @param sampleRate  Sample rate of the audio
   */
  static generateTOC(markers, filename, sampleRate) {
    const sorted = [...markers].sort((a, b) => a.index - b.index);
    const lines = [];
    lines.push("CD_DA");
    lines.push("");
    lines.push("");
    for (let i = 0; i < sorted.length; i++) {
      const marker = sorted[i];
      lines.push(`// Track ${marker.index}`);
      lines.push("TRACK AUDIO");
      if (marker.title || marker.performer) {
        lines.push("CD_TEXT {");
        lines.push("  LANGUAGE 0 {");
        if (marker.title) {
          lines.push(`    TITLE "${marker.title}"`);
        }
        if (marker.performer) {
          lines.push(`    PERFORMER "${marker.performer}"`);
        }
        lines.push("  }");
        lines.push("}");
      }
      if (marker.isrc) {
        lines.push(`ISRC "${marker.isrc}"`);
      }
      if (i === 0 && marker.position === 0) {
        lines.push("PREGAP 00:02:00");
      }
      const cdTime = _CDMarkerExporter.framesToCDTime(
        marker.position,
        sampleRate
      );
      if (i + 1 < sorted.length) {
        const nextMarker = sorted[i + 1];
        const lengthFrames = nextMarker.position - marker.position;
        const lengthCdTime = _CDMarkerExporter.framesToCDTime(
          lengthFrames,
          sampleRate
        );
        lines.push(`FILE "${filename}" ${cdTime} ${lengthCdTime}`);
      } else {
        lines.push(`FILE "${filename}" ${cdTime}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }
  /**
   * Generate Nero-style MP4 chapter metadata.
   *
   * Format: CHAPTERXX=HH:MM:SS.mmm / CHAPTERXXNAME=Title
   * This format is understood by ffmpeg via -i chapters.txt.
   *
   * @param markers     Array of CDMarker instances
   * @param sampleRate  Sample rate of the audio
   */
  static generateMP4Chapters(markers, sampleRate) {
    const sorted = [...markers].sort((a, b) => a.index - b.index);
    const lines = [];
    for (let i = 0; i < sorted.length; i++) {
      const marker = sorted[i];
      const chapterNum = String(i + 1).padStart(2, "0");
      const timestamp = _CDMarkerExporter.framesToTimestamp(
        marker.position,
        sampleRate
      );
      lines.push(`CHAPTER${chapterNum}=${timestamp}`);
      lines.push(
        `CHAPTER${chapterNum}NAME=${marker.title || `Chapter ${i + 1}`}`
      );
    }
    return lines.join("\n");
  }
  /**
   * Convert a sample-frame position to CD time format MM:SS:FF.
   * CD frames run at 75 fps (Red Book standard).
   *
   * @param frames      Position in audio sample frames
   * @param sampleRate  Audio sample rate (e.g. 44100)
   * @returns           Time string in MM:SS:FF format
   */
  static framesToCDTime(frames, sampleRate) {
    const totalSeconds = frames / sampleRate;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const cdFrames = Math.floor(totalSeconds % 1 * 75);
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0") + ":" + String(cdFrames).padStart(2, "0");
  }
  /**
   * Convert a sample-frame position to HH:MM:SS.mmm timestamp.
   *
   * @param frames      Position in audio sample frames
   * @param sampleRate  Audio sample rate
   * @returns           Time string in HH:MM:SS.mmm format
   */
  static framesToTimestamp(frames, sampleRate) {
    const totalSeconds = frames / sampleRate;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const millis = Math.floor(totalSeconds % 1 * 1e3);
    return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0") + "." + String(millis).padStart(3, "0");
  }
};

// core/src/audio/export/ExportPresetManager.ts
init_Signal();
init_Logger();
var ExportPresetManager = class _ExportPresetManager {
  constructor() {
    /** Emitted whenever the preset list or any preset changes. */
    this.presetsChanged = new Signal();
    this._presets = /* @__PURE__ */ new Map();
    for (const preset of _ExportPresetManager.getDefaultPresets()) {
      this._presets.set(preset.id, preset);
    }
  }
  // ------------------------------------------------------------------ CRUD
  /**
   * Create a new preset from the given config.
   */
  addPreset(name, config) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const preset = {
      id: crypto.randomUUID(),
      name,
      version: 1,
      config: { ...config },
      createdAt: now,
      updatedAt: now
    };
    this._presets.set(preset.id, preset);
    this.presetsChanged.emit();
    return preset;
  }
  /**
   * Update an existing preset's configuration.
   */
  updatePreset(id, config) {
    const existing = this._presets.get(id);
    if (!existing) {
      throw new Error(`Preset not found: ${id}`);
    }
    existing.config = { ...existing.config, ...config };
    existing.version += 1;
    existing.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this._presets.set(id, existing);
    this.presetsChanged.emit();
  }
  /**
   * Remove a preset by id.
   */
  removePreset(id) {
    if (!this._presets.has(id)) {
      throw new Error(`Preset not found: ${id}`);
    }
    this._presets.delete(id);
    this.presetsChanged.emit();
  }
  /**
   * Get a single preset by id.
   */
  getPreset(id) {
    const preset = this._presets.get(id);
    return preset ? { ...preset, config: { ...preset.config } } : void 0;
  }
  /**
   * Get all presets, sorted by name.
   */
  getAllPresets() {
    return Array.from(this._presets.values()).map((p) => ({ ...p, config: { ...p.config } })).sort((a, b) => a.name.localeCompare(b.name));
  }
  // --------------------------------------------------------- default presets
  /**
   * Returns the built-in default presets covering common export workflows.
   */
  static getDefaultPresets() {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return [
      // 1. CD Quality
      {
        id: "preset-cd-quality",
        name: "CD Quality (16-bit/44.1kHz WAV)",
        version: 1,
        config: {
          format: "wav" /* WAV */,
          sampleFormat: "int16" /* INT16 */,
          sampleRate: 44100,
          ditherType: "tpdf" /* TPDF */,
          normalize: false,
          truePeakLimit: false,
          exportMasterOnly: true,
          stemExport: false,
          splitMono: false,
          trimSilence: false,
          exportCdMarkers: false,
          bwfMetadata: false
        },
        createdAt: now,
        updatedAt: now
      },
      // 2. Hi-Res Audio
      {
        id: "preset-hi-res",
        name: "Hi-Res Audio (24-bit/96kHz WAV)",
        version: 1,
        config: {
          format: "wav" /* WAV */,
          sampleFormat: "int24" /* INT24 */,
          sampleRate: 96e3,
          ditherType: "none" /* NONE */,
          normalize: false,
          truePeakLimit: false,
          exportMasterOnly: true,
          stemExport: false,
          splitMono: false,
          trimSilence: false,
          exportCdMarkers: false,
          bwfMetadata: false
        },
        createdAt: now,
        updatedAt: now
      },
      // 3. MP3 320k (high quality lossy)
      {
        id: "preset-mp3-320k",
        name: "MP3 320kbps",
        version: 1,
        config: {
          format: "mp3" /* MP3 */,
          sampleRate: 44100,
          bitrate: 320,
          normalize: false,
          truePeakLimit: false,
          exportMasterOnly: true,
          stemExport: false,
          trimSilence: false,
          exportCdMarkers: false,
          bwfMetadata: false
        },
        createdAt: now,
        updatedAt: now
      },
      // 4. Streaming (LUFS-normalized for Spotify/Apple Music)
      {
        id: "preset-streaming",
        name: "Streaming (MP3 192k, -14 LUFS)",
        version: 1,
        config: {
          format: "mp3" /* MP3 */,
          sampleRate: 44100,
          bitrate: 192,
          normalize: true,
          normalizeMode: "lufs",
          targetLufs: -14,
          truePeakLimit: true,
          truePeakCeiling: -1,
          exportMasterOnly: true,
          stemExport: false,
          trimSilence: false,
          exportCdMarkers: false,
          bwfMetadata: false
        },
        createdAt: now,
        updatedAt: now
      },
      // 5. Podcast (OGG, loudness-normalized)
      {
        id: "preset-podcast",
        name: "Podcast (OGG Vorbis, -16 LUFS)",
        version: 1,
        config: {
          format: "ogg" /* OGG */,
          sampleRate: 44100,
          quality: 0.6,
          normalize: true,
          normalizeMode: "lufs",
          targetLufs: -16,
          truePeakLimit: true,
          truePeakCeiling: -1,
          exportMasterOnly: true,
          stemExport: false,
          trimSilence: true,
          exportCdMarkers: false,
          bwfMetadata: false
        },
        createdAt: now,
        updatedAt: now
      },
      // 6. FLAC Lossless Archive
      {
        id: "preset-flac-archive",
        name: "FLAC Lossless Archive (24-bit/48kHz)",
        version: 1,
        config: {
          format: "flac" /* FLAC */,
          sampleFormat: "int24" /* INT24 */,
          sampleRate: 48e3,
          ditherType: "none" /* NONE */,
          normalize: false,
          truePeakLimit: false,
          exportMasterOnly: true,
          stemExport: false,
          splitMono: false,
          trimSilence: false,
          exportCdMarkers: false,
          bwfMetadata: false
        },
        createdAt: now,
        updatedAt: now
      },
      // 7. Broadcast WAV (BWF)
      {
        id: "preset-broadcast-wav",
        name: "Broadcast WAV (24-bit/48kHz, BWF)",
        version: 1,
        config: {
          format: "wav" /* WAV */,
          sampleFormat: "int24" /* INT24 */,
          sampleRate: 48e3,
          ditherType: "none" /* NONE */,
          normalize: true,
          normalizeMode: "lufs",
          targetLufs: -23,
          truePeakLimit: true,
          truePeakCeiling: -1,
          exportMasterOnly: true,
          stemExport: false,
          splitMono: false,
          trimSilence: false,
          exportCdMarkers: false,
          bwfMetadata: true
        },
        createdAt: now,
        updatedAt: now
      },
      // 8. Stem Export (for collaboration / remix)
      {
        id: "preset-stems",
        name: "Stems Export (24-bit/48kHz WAV)",
        version: 1,
        config: {
          format: "wav" /* WAV */,
          sampleFormat: "int24" /* INT24 */,
          sampleRate: 48e3,
          ditherType: "none" /* NONE */,
          normalize: false,
          truePeakLimit: false,
          exportMasterOnly: false,
          stemExport: true,
          splitMono: false,
          trimSilence: false,
          exportCdMarkers: false,
          bwfMetadata: false
        },
        createdAt: now,
        updatedAt: now
      }
    ];
  }
  // --------------------------------------------------------- serialization
  /**
   * Serialize the preset manager to a JSON string for persistence.
   */
  serialize() {
    const data = {
      version: 1,
      presets: Array.from(this._presets.values())
    };
    return JSON.stringify(data, null, 2);
  }
  /**
   * Deserialize from a JSON string and return a new ExportPresetManager.
   * User presets from the JSON are merged on top of the defaults.
   */
  static deserialize(json) {
    const manager = new _ExportPresetManager();
    try {
      const data = JSON.parse(json);
      if (data && Array.isArray(data.presets)) {
        for (const preset of data.presets) {
          if (preset.id && preset.name && preset.config) {
            manager._presets.set(preset.id, {
              id: preset.id,
              name: preset.name,
              version: preset.version ?? 1,
              config: { ...preset.config },
              createdAt: preset.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
              updatedAt: preset.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString()
            });
          }
        }
      }
    } catch {
      logger.warn(
        "ExportPresetManager",
        "Failed to parse serialized presets, using defaults"
      );
    }
    return manager;
  }
};

// core/src/commands/types.ts
import { z } from "zod";
var CommandType = {
  PLAY: "PLAY",
  PAUSE: "PAUSE",
  STOP: "STOP",
  ADD_TRACK: "ADD_TRACK",
  REMOVE_TRACK: "REMOVE_TRACK",
  ADD_REGION: "ADD_REGION",
  ADD_PLUGIN: "ADD_PLUGIN",
  REMOVE_PLUGIN: "REMOVE_PLUGIN",
  SET_PLUGIN_PARAMETER: "SET_PLUGIN_PARAMETER",
  ADD_AUTOMATION: "ADD_AUTOMATION",
  UNDO: "UNDO",
  REDO: "REDO",
  SELECTION_UNDO: "SELECTION_UNDO",
  SELECTION_REDO: "SELECTION_REDO",
  START_RECORDING: "START_RECORDING",
  STOP_RECORDING: "STOP_RECORDING",
  TOGGLE_METRONOME: "TOGGLE_METRONOME",
  ADD_SOURCE: "ADD_SOURCE",
  SET_VOLUME: "SET_VOLUME",
  SET_PAN: "SET_PAN",
  MUTE_TRACK: "MUTE_TRACK",
  SOLO_TRACK: "SOLO_TRACK",
  REMOVE_REGION: "REMOVE_REGION",
  MOVE_REGION: "MOVE_REGION",
  RESIZE_REGION: "RESIZE_REGION",
  SET_TEMPO: "SET_TEMPO",
  SET_TIME_SIGNATURE: "SET_TIME_SIGNATURE",
  ARM_TRACK: "ARM_TRACK",
  SET_TRACK_MONITOR: "SET_TRACK_MONITOR",
  MOVE_AUTOMATION_POINT: "MOVE_AUTOMATION_POINT",
  REMOVE_AUTOMATION_POINT: "REMOVE_AUTOMATION_POINT",
  CONNECT_IO: "CONNECT_IO",
  DISCONNECT_IO: "DISCONNECT_IO",
  SEEK: "SEEK",
  EXPORT: "EXPORT",
  OPEN_EXPORT_DIALOG: "OPEN_EXPORT_DIALOG",
  DEBUG_SESSION: "DEBUG_SESSION",
  ADD_RANGE: "ADD_RANGE",
  REMOVE_RANGE: "REMOVE_RANGE",
  SET_RANGE: "SET_RANGE",
  LIST_RANGES: "LIST_RANGES",
  SET_LOOP_RANGE: "SET_LOOP_RANGE",
  TOGGLE_LOOP: "TOGGLE_LOOP",
  SET_PUNCH_RANGE: "SET_PUNCH_RANGE",
  // Grid & Snap
  SET_GRID: "SET_GRID",
  GET_GRID: "GET_GRID",
  // Region Editing
  COPY_REGION: "COPY_REGION",
  PASTE_REGION: "PASTE_REGION",
  DUPLICATE_REGION: "DUPLICATE_REGION",
  SPLIT_REGION: "SPLIT_REGION",
  SPLIT_AT_PLAYHEAD: "SPLIT_AT_PLAYHEAD",
  SELECT_REGION: "SELECT_REGION",
  CLEAR_SELECTION: "CLEAR_SELECTION",
  SET_REGION_TIME_DOMAIN: "SET_REGION_TIME_DOMAIN",
  TRIM_REGION: "TRIM_REGION",
  TRIM_REGION_TO_PLAYHEAD: "TRIM_REGION_TO_PLAYHEAD",
  TRIM_REGION_TO_RANGE: "TRIM_REGION_TO_RANGE",
  TRIM_TO_ADJACENT_REGION: "TRIM_TO_ADJACENT_REGION",
  SET_REGION_FADES: "SET_REGION_FADES",
  MERGE_REGIONS: "MERGE_REGIONS",
  SELECT_REGIONS: "SELECT_REGIONS",
  // Send Bus (Side-chain)
  ADD_SEND_BUS: "ADD_SEND_BUS",
  REMOVE_SEND_BUS: "REMOVE_SEND_BUS",
  SET_SEND_LEVEL: "SET_SEND_LEVEL",
  // Session Serialization
  SAVE_SESSION: "SAVE_SESSION",
  LOAD_SESSION: "LOAD_SESSION",
  NEW_SESSION: "NEW_SESSION",
  SAVE_SNAPSHOT: "SAVE_SNAPSHOT",
  // Markers
  ADD_MARKER: "ADD_MARKER",
  REMOVE_MARKER: "REMOVE_MARKER",
  MOVE_MARKER: "MOVE_MARKER",
  LIST_MARKERS: "LIST_MARKERS",
  GOTO_NEXT_MARKER: "GOTO_NEXT_MARKER",
  GOTO_PREV_MARKER: "GOTO_PREV_MARKER",
  // Track Enhancements
  SET_TRACK_COLOR: "SET_TRACK_COLOR",
  REORDER_TRACK: "REORDER_TRACK",
  BOUNCE_TRACK: "BOUNCE_TRACK",
  // Recording Improvements (Phase 12)
  ENABLE_PUNCH: "ENABLE_PUNCH",
  SET_LOOP_RECORDING: "SET_LOOP_RECORDING",
  SET_PRE_ROLL: "SET_PRE_ROLL",
  SET_MONITOR_WITH_EFFECTS: "SET_MONITOR_WITH_EFFECTS",
  // Advanced Editing (Phase 14)
  LOCK_REGION: "LOCK_REGION",
  SET_RIPPLE_EDIT: "SET_RIPPLE_EDIT",
  AUDITION_REGION: "AUDITION_REGION",
  STOP_AUDITION: "STOP_AUDITION",
  GROUP_REGIONS: "GROUP_REGIONS",
  UNGROUP_REGIONS: "UNGROUP_REGIONS",
  // Track Freeze
  FREEZE_TRACK: "FREEZE_TRACK",
  UNFREEZE_TRACK: "UNFREEZE_TRACK",
  // Strip Silence & Normalize
  STRIP_SILENCE: "STRIP_SILENCE",
  NORMALIZE_REGION: "NORMALIZE_REGION",
  // Playback Rate & Time Stretch
  SET_REGION_PLAYBACK_RATE: "SET_REGION_PLAYBACK_RATE",
  TIME_STRETCH_REGION: "TIME_STRETCH_REGION",
  // Region Reverse
  REVERSE_REGION: "REVERSE_REGION",
  // MIDI Editing
  ADD_MIDI_NOTE: "ADD_MIDI_NOTE",
  REMOVE_MIDI_NOTE: "REMOVE_MIDI_NOTE",
  MOVE_MIDI_NOTE: "MOVE_MIDI_NOTE",
  RESIZE_MIDI_NOTE: "RESIZE_MIDI_NOTE",
  QUANTIZE_MIDI: "QUANTIZE_MIDI",
  TRANSPOSE_MIDI: "TRANSPOSE_MIDI",
  SET_MIDI_INSTRUMENT: "SET_MIDI_INSTRUMENT",
  // Aux/Bus Tracks
  ADD_AUX_TRACK: "ADD_AUX_TRACK",
  ADD_BUS_TRACK: "ADD_BUS_TRACK",
  // Tempo Map
  ADD_TEMPO_CHANGE: "ADD_TEMPO_CHANGE",
  REMOVE_TEMPO_CHANGE: "REMOVE_TEMPO_CHANGE",
  // MIDI Input Device
  SET_MIDI_INPUT_DEVICE: "SET_MIDI_INPUT_DEVICE",
  // Plugin Presets
  APPLY_PLUGIN_PRESET: "APPLY_PLUGIN_PRESET",
  SAVE_PLUGIN_PRESET: "SAVE_PLUGIN_PRESET",
  // Stem Export
  EXPORT_STEMS: "EXPORT_STEMS",
  // Export Presets (Phase 1)
  SAVE_EXPORT_PRESET: "SAVE_EXPORT_PRESET",
  DELETE_EXPORT_PRESET: "DELETE_EXPORT_PRESET",
  LOAD_EXPORT_PRESET: "LOAD_EXPORT_PRESET",
  // MIDI File I/O (Phase 3)
  IMPORT_MIDI: "IMPORT_MIDI",
  EXPORT_MIDI: "EXPORT_MIDI",
  // Track Groups (Phase 10)
  CREATE_TRACK_GROUP: "CREATE_TRACK_GROUP",
  DELETE_TRACK_GROUP: "DELETE_TRACK_GROUP",
  ADD_TO_TRACK_GROUP: "ADD_TO_TRACK_GROUP",
  REMOVE_FROM_TRACK_GROUP: "REMOVE_FROM_TRACK_GROUP",
  SET_TRACK_PARENT: "SET_TRACK_PARENT",
  // VCA (Phase 10)
  ADD_VCA_TRACK: "ADD_VCA_TRACK",
  REMOVE_VCA_TRACK: "REMOVE_VCA_TRACK",
  SET_VCA_GAIN: "SET_VCA_GAIN",
  ASSIGN_TO_VCA: "ASSIGN_TO_VCA",
  // Scrub/Shuttle (Phase 10)
  SET_TRANSPORT_MODE: "SET_TRANSPORT_MODE",
  // CD Markers (Phase 12)
  ADD_CD_MARKER: "ADD_CD_MARKER",
  REMOVE_CD_MARKER: "REMOVE_CD_MARKER",
  GENERATE_CUE_SHEET: "GENERATE_CUE_SHEET",
  // Sidechain (Phase 12)
  SET_SIDECHAIN_SOURCE: "SET_SIDECHAIN_SOURCE",
  // Mixer Scenes
  SAVE_MIXER_SCENE: "SAVE_MIXER_SCENE",
  RECALL_MIXER_SCENE: "RECALL_MIXER_SCENE",
  DELETE_MIXER_SCENE: "DELETE_MIXER_SCENE",
  // Phase 15: Track Enhancements
  SET_TRACK_MONITOR_MODE: "SET_TRACK_MONITOR_MODE",
  SET_TRACK_TRIM_GAIN: "SET_TRACK_TRIM_GAIN",
  SET_TRACK_SOLO_ISOLATE: "SET_TRACK_SOLO_ISOLATE",
  SET_TRACK_SOLO_SAFE: "SET_TRACK_SOLO_SAFE",
  SET_TRACK_COMMENT: "SET_TRACK_COMMENT",
  // Phase 15: Additional
  SET_TRACK_PAN_WIDTH: "SET_TRACK_PAN_WIDTH",
  SET_AUTOMATION_MODE: "SET_AUTOMATION_MODE",
  RENAME_MIXER_SCENE: "RENAME_MIXER_SCENE",
  RENAME_MARKER: "RENAME_MARKER",
  SET_MARKER_LOCKED: "SET_MARKER_LOCKED",
  // Phase 13: Editor Modes
  SET_MOUSE_MODE: "SET_MOUSE_MODE",
  SET_EDIT_MODE: "SET_EDIT_MODE",
  SET_ZOOM_FOCUS: "SET_ZOOM_FOCUS",
  ZOOM_TO_FIT: "ZOOM_TO_FIT",
  SET_FOLLOW_PLAYHEAD: "SET_FOLLOW_PLAYHEAD",
  SET_TRACK_HEIGHT: "SET_TRACK_HEIGHT",
  TOGGLE_RULER: "TOGGLE_RULER"
};
var PlayCommandSchema = z.object({
  type: z.literal(CommandType.PLAY),
  payload: z.object({}).optional()
});
var PauseCommandSchema = z.object({
  type: z.literal(CommandType.PAUSE),
  payload: z.object({}).optional()
});
var StopCommandSchema = z.object({
  type: z.literal(CommandType.STOP),
  payload: z.object({}).optional()
});
var AddTrackCommandSchema = z.object({
  type: z.literal(CommandType.ADD_TRACK),
  payload: z.object({
    name: z.string(),
    trackType: z.enum(["audio", "instrument"]).default("audio")
  })
});
var RemoveTrackCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_TRACK),
  payload: z.object({
    trackId: z.string()
  })
});
var AddRegionCommandSchema = z.object({
  type: z.literal(CommandType.ADD_REGION),
  payload: z.object({
    trackId: z.string(),
    start: z.number(),
    duration: z.number(),
    sourceUrl: z.string()
  })
});
var AddPluginCommandSchema = z.object({
  type: z.literal(CommandType.ADD_PLUGIN),
  payload: z.object({
    trackId: z.string(),
    pluginId: z.string(),
    index: z.number().optional(),
    position: z.enum(["pre", "post"]).optional()
  })
});
var RemovePluginCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_PLUGIN),
  payload: z.object({
    trackId: z.string(),
    processorId: z.string()
  })
});
var SetPluginParameterCommandSchema = z.object({
  type: z.literal(CommandType.SET_PLUGIN_PARAMETER),
  payload: z.object({
    trackId: z.string(),
    processorId: z.string(),
    parameterId: z.string(),
    value: z.number()
  })
});
var UndoCommandSchema = z.object({
  type: z.literal(CommandType.UNDO)
});
var RedoCommandSchema = z.object({
  type: z.literal(CommandType.REDO)
});
var SelectionUndoCommandSchema = z.object({
  type: z.literal(CommandType.SELECTION_UNDO)
});
var SelectionRedoCommandSchema = z.object({
  type: z.literal(CommandType.SELECTION_REDO)
});
var SetTrackVolumeCommandSchema = z.object({
  type: z.literal(CommandType.SET_VOLUME),
  payload: z.object({
    trackId: z.string(),
    volume: z.number()
  })
});
var SetTrackPanCommandSchema = z.object({
  type: z.literal(CommandType.SET_PAN),
  payload: z.object({
    trackId: z.string(),
    pan: z.number()
  })
});
var SetTrackMuteCommandSchema = z.object({
  type: z.literal(CommandType.MUTE_TRACK),
  payload: z.object({
    trackId: z.string(),
    mute: z.boolean()
  })
});
var SetTrackSoloCommandSchema = z.object({
  type: z.literal(CommandType.SOLO_TRACK),
  payload: z.object({
    trackId: z.string(),
    solo: z.boolean()
  })
});
var RemoveRegionCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string()
  })
});
var MoveRegionCommandSchema = z.object({
  type: z.literal(CommandType.MOVE_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    newStart: z.number(),
    targetTrackId: z.string().optional()
  })
});
var ResizeRegionCommandSchema = z.object({
  type: z.literal(CommandType.RESIZE_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    newLength: z.number()
  })
});
var TrimRegionCommandSchema = z.object({
  type: z.literal(CommandType.TRIM_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    amount: z.number(),
    direction: z.enum(["front", "back"])
  })
});
var SetRegionFadesCommandSchema = z.object({
  type: z.literal(CommandType.SET_REGION_FADES),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    fadeIn: z.number().optional(),
    fadeOut: z.number().optional()
  })
});
var MergeRegionsCommandSchema = z.object({
  type: z.literal(CommandType.MERGE_REGIONS),
  payload: z.object({
    trackId: z.string(),
    regionIds: z.array(z.string())
  })
});
var SelectRegionsCommandSchema = z.object({
  type: z.literal(CommandType.SELECT_REGIONS),
  payload: z.object({
    regionIds: z.array(z.string()),
    addToSelection: z.boolean().optional()
  })
});
var AddSendBusCommandSchema = z.object({
  type: z.literal(CommandType.ADD_SEND_BUS),
  payload: z.object({
    sourceTrackId: z.string(),
    destId: z.string(),
    level: z.number().optional(),
    preFader: z.boolean().optional(),
    id: z.string().optional()
  })
});
var RemoveSendBusCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_SEND_BUS),
  payload: z.object({
    sendBusId: z.string()
  })
});
var SetSendLevelCommandSchema = z.object({
  type: z.literal(CommandType.SET_SEND_LEVEL),
  payload: z.object({
    sendBusId: z.string(),
    level: z.number()
  })
});
var SaveSessionCommandSchema = z.object({
  type: z.literal(CommandType.SAVE_SESSION)
});
var RegionSnapshotSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  name: z.string(),
  start: z.number(),
  length: z.number(),
  sourceStart: z.number(),
  gain: z.number(),
  muted: z.boolean(),
  layer: z.number(),
  fadeIn: z.number(),
  fadeOut: z.number(),
  playbackRate: z.number(),
  timeDomain: z.number(),
  locked: z.boolean().optional()
});
var MidiNoteSnapshotSchema = z.object({
  id: z.string(),
  pitch: z.number(),
  velocity: z.number(),
  startFrame: z.number(),
  durationFrames: z.number(),
  channel: z.number()
});
var MidiRegionSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  start: z.number(),
  length: z.number(),
  muted: z.boolean(),
  layer: z.number(),
  locked: z.boolean().optional(),
  timeDomain: z.number().optional(),
  notes: z.array(MidiNoteSnapshotSchema)
});
var TrackSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  armed: z.boolean(),
  mute: z.boolean(),
  solo: z.boolean(),
  color: z.string().optional(),
  regions: z.array(RegionSnapshotSchema),
  midiRegions: z.array(MidiRegionSnapshotSchema).optional()
});
var RangeSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  start: z.number(),
  end: z.number()
});
var SendBusSnapshotSchema = z.object({
  id: z.string(),
  sourceTrackId: z.string(),
  destId: z.string(),
  level: z.number(),
  preFader: z.boolean(),
  active: z.boolean()
});
var MarkerSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number(),
  color: z.string(),
  locked: z.boolean()
});
var TempoEventSnapshotSchema = z.object({
  frame: z.number(),
  bpm: z.number(),
  timeSigNum: z.number().optional(),
  timeSigDen: z.number().optional()
});
var RegionGroupSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  regionIds: z.array(z.string())
});
var MixerSceneTrackStateSchema = z.object({
  trackId: z.string(),
  volume: z.number(),
  pan: z.number(),
  mute: z.boolean(),
  solo: z.boolean(),
  pluginParameters: z.record(z.string(), z.record(z.string(), z.number()))
});
var MixerSceneSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  tracks: z.array(MixerSceneTrackStateSchema)
});
var SessionSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  sampleRate: z.number(),
  tempo: z.number(),
  timeSignature: z.tuple([z.number(), z.number()]),
  transportFrame: z.number(),
  tracks: z.array(TrackSnapshotSchema),
  ranges: z.array(RangeSnapshotSchema),
  sendBuses: z.array(SendBusSnapshotSchema),
  markers: z.array(MarkerSnapshotSchema).optional(),
  loopRangeId: z.string().optional(),
  loopEnabled: z.boolean(),
  punchRangeId: z.string().optional(),
  punchEnabled: z.boolean().optional(),
  preRollBars: z.number().optional(),
  loopRecordingEnabled: z.boolean().optional(),
  rippleEdit: z.boolean().optional(),
  regionGroups: z.array(RegionGroupSnapshotSchema).optional(),
  tempoMapEvents: z.array(TempoEventSnapshotSchema).optional(),
  mixerScenes: z.array(MixerSceneSnapshotSchema).optional()
});
var LoadSessionCommandSchema = z.object({
  type: z.literal(CommandType.LOAD_SESSION),
  payload: z.object({
    sessionId: z.string().optional(),
    snapshot: SessionSnapshotSchema.optional()
  })
});
var NewSessionCommandSchema = z.object({
  type: z.literal(CommandType.NEW_SESSION),
  payload: z.object({
    name: z.string().optional(),
    templateId: z.string().optional()
  }).optional()
});
var SaveSnapshotCommandSchema = z.object({
  type: z.literal(CommandType.SAVE_SNAPSHOT),
  payload: z.object({
    name: z.string()
  })
});
var LockRegionCommandSchema = z.object({
  type: z.literal(CommandType.LOCK_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    locked: z.boolean()
  })
});
var SetRippleEditCommandSchema = z.object({
  type: z.literal(CommandType.SET_RIPPLE_EDIT),
  payload: z.object({
    enabled: z.boolean()
  })
});
var AuditionRegionCommandSchema = z.object({
  type: z.literal(CommandType.AUDITION_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string()
  })
});
var StopAuditionCommandSchema = z.object({
  type: z.literal(CommandType.STOP_AUDITION),
  payload: z.object({}).optional()
});
var GroupRegionsCommandSchema = z.object({
  type: z.literal(CommandType.GROUP_REGIONS),
  payload: z.object({
    regionIds: z.array(z.string()),
    name: z.string().optional()
  })
});
var UngroupRegionsCommandSchema = z.object({
  type: z.literal(CommandType.UNGROUP_REGIONS),
  payload: z.object({
    groupId: z.string()
  })
});
var FreezeTrackCommandSchema = z.object({
  type: z.literal(CommandType.FREEZE_TRACK),
  payload: z.object({
    trackId: z.string()
  })
});
var UnfreezeTrackCommandSchema = z.object({
  type: z.literal(CommandType.UNFREEZE_TRACK),
  payload: z.object({
    trackId: z.string()
  })
});
var StripSilenceCommandSchema = z.object({
  type: z.literal(CommandType.STRIP_SILENCE),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    thresholdDb: z.number().optional().default(-60),
    minLengthFrames: z.number().optional().default(4410)
  })
});
var NormalizeRegionCommandSchema = z.object({
  type: z.literal(CommandType.NORMALIZE_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    targetDb: z.number().optional().default(0)
  })
});
var SetRegionPlaybackRateCommandSchema = z.object({
  type: z.literal(CommandType.SET_REGION_PLAYBACK_RATE),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    playbackRate: z.number()
  })
});
var TimeStretchRegionCommandSchema = z.object({
  type: z.literal(CommandType.TIME_STRETCH_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    /** Speed multiplier (1.0 = normal, 0.5 = half speed) */
    stretch: z.number().min(0.1).max(4),
    /** Pitch shift in semitones (0 = no shift) */
    pitchSemitones: z.number().min(-24).max(24).default(0)
  })
});
var ReverseRegionCommandSchema = z.object({
  type: z.literal(CommandType.REVERSE_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string()
  })
});
var AddMidiNoteCommandSchema = z.object({
  type: z.literal(CommandType.ADD_MIDI_NOTE),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    pitch: z.number().min(0).max(127),
    velocity: z.number().min(0).max(127).default(100),
    startFrame: z.number(),
    durationFrames: z.number(),
    channel: z.number().min(0).max(15).default(0)
  })
});
var RemoveMidiNoteCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_MIDI_NOTE),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    noteId: z.string()
  })
});
var MoveMidiNoteCommandSchema = z.object({
  type: z.literal(CommandType.MOVE_MIDI_NOTE),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    noteId: z.string(),
    newStartFrame: z.number().optional(),
    newPitch: z.number().min(0).max(127).optional()
  })
});
var ResizeMidiNoteCommandSchema = z.object({
  type: z.literal(CommandType.RESIZE_MIDI_NOTE),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    noteId: z.string(),
    newDurationFrames: z.number()
  })
});
var QuantizeMidiCommandSchema = z.object({
  type: z.literal(CommandType.QUANTIZE_MIDI),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    subdivisionFrames: z.number()
  })
});
var TransposeMidiCommandSchema = z.object({
  type: z.literal(CommandType.TRANSPOSE_MIDI),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    semitones: z.number()
  })
});
var SetMidiInstrumentCommandSchema = z.object({
  type: z.literal(CommandType.SET_MIDI_INSTRUMENT),
  payload: z.object({
    trackId: z.string(),
    instrumentType: z.string()
  })
});
var AddAuxTrackCommandSchema = z.object({
  type: z.literal(CommandType.ADD_AUX_TRACK),
  payload: z.object({
    name: z.string()
  })
});
var AddBusTrackCommandSchema = z.object({
  type: z.literal(CommandType.ADD_BUS_TRACK),
  payload: z.object({
    name: z.string()
  })
});
var AddTempoChangeCommandSchema = z.object({
  type: z.literal(CommandType.ADD_TEMPO_CHANGE),
  payload: z.object({
    frame: z.number(),
    bpm: z.number(),
    timeSigNum: z.number().optional(),
    timeSigDen: z.number().optional()
  })
});
var RemoveTempoChangeCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_TEMPO_CHANGE),
  payload: z.object({
    frame: z.number()
  })
});
var SetMidiInputDeviceCommandSchema = z.object({
  type: z.literal(CommandType.SET_MIDI_INPUT_DEVICE),
  payload: z.object({
    inputId: z.string().nullable()
  })
});
var ApplyPluginPresetCommandSchema = z.object({
  type: z.literal(CommandType.APPLY_PLUGIN_PRESET),
  payload: z.object({
    trackId: z.string(),
    processorId: z.string(),
    presetId: z.string()
  })
});
var SavePluginPresetCommandSchema = z.object({
  type: z.literal(CommandType.SAVE_PLUGIN_PRESET),
  payload: z.object({
    name: z.string(),
    pluginId: z.string(),
    trackId: z.string(),
    processorId: z.string()
  })
});
var ExportStemsCommandSchema = z.object({
  type: z.literal(CommandType.EXPORT_STEMS),
  payload: z.object({
    filename: z.string().optional(),
    format: z.enum(["wav", "mp3", "ogg", "flac"]).optional(),
    normalize: z.boolean().optional()
  }).optional()
});
var SaveMixerSceneCommandSchema = z.object({
  type: z.literal(CommandType.SAVE_MIXER_SCENE),
  payload: z.object({
    name: z.string()
  })
});
var RecallMixerSceneCommandSchema = z.object({
  type: z.literal(CommandType.RECALL_MIXER_SCENE),
  payload: z.object({
    sceneId: z.string()
  })
});
var DeleteMixerSceneCommandSchema = z.object({
  type: z.literal(CommandType.DELETE_MIXER_SCENE),
  payload: z.object({
    sceneId: z.string()
  })
});
var CreateTrackGroupCommandSchema = z.object({
  type: z.literal(CommandType.CREATE_TRACK_GROUP),
  payload: z.object({
    name: z.string(),
    trackIds: z.array(z.string()).optional()
  })
});
var DeleteTrackGroupCommandSchema = z.object({
  type: z.literal(CommandType.DELETE_TRACK_GROUP),
  payload: z.object({
    groupId: z.string()
  })
});
var AddToTrackGroupCommandSchema = z.object({
  type: z.literal(CommandType.ADD_TO_TRACK_GROUP),
  payload: z.object({
    groupId: z.string(),
    trackId: z.string()
  })
});
var RemoveFromTrackGroupCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_FROM_TRACK_GROUP),
  payload: z.object({
    groupId: z.string(),
    trackId: z.string()
  })
});
var SetTrackParentCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_PARENT),
  payload: z.object({
    trackId: z.string(),
    parentId: z.string().nullable()
  })
});
var AddVCATrackCommandSchema = z.object({
  type: z.literal(CommandType.ADD_VCA_TRACK),
  payload: z.object({
    name: z.string()
  })
});
var RemoveVCATrackCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_VCA_TRACK),
  payload: z.object({
    trackId: z.string()
  })
});
var SetVCAGainCommandSchema = z.object({
  type: z.literal(CommandType.SET_VCA_GAIN),
  payload: z.object({
    trackId: z.string(),
    gain: z.number()
  })
});
var AssignToVCACommandSchema = z.object({
  type: z.literal(CommandType.ASSIGN_TO_VCA),
  payload: z.object({
    trackId: z.string(),
    vcaTrackId: z.string()
  })
});
var SetTransportModeCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRANSPORT_MODE),
  payload: z.object({
    mode: z.enum(["normal", "scrub", "shuttle"])
  })
});
var AddCDMarkerCommandSchema = z.object({
  type: z.literal(CommandType.ADD_CD_MARKER),
  payload: z.object({
    name: z.string(),
    position: z.number()
  })
});
var RemoveCDMarkerCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_CD_MARKER),
  payload: z.object({
    markerId: z.string()
  })
});
var GenerateCueSheetCommandSchema = z.object({
  type: z.literal(CommandType.GENERATE_CUE_SHEET),
  payload: z.object({}).optional()
});
var SetSidechainSourceCommandSchema = z.object({
  type: z.literal(CommandType.SET_SIDECHAIN_SOURCE),
  payload: z.object({
    trackId: z.string(),
    sourceTrackId: z.string()
  })
});
var SetTrackMonitorModeCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_MONITOR_MODE),
  payload: z.object({
    trackId: z.string(),
    mode: z.enum(["auto", "input", "disk", "external"])
  })
});
var SetTrackTrimGainCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_TRIM_GAIN),
  payload: z.object({
    trackId: z.string(),
    trimGainDb: z.number()
  })
});
var SetTrackSoloIsolateCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_SOLO_ISOLATE),
  payload: z.object({
    trackId: z.string(),
    isolate: z.boolean()
  })
});
var SetTrackSoloSafeCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_SOLO_SAFE),
  payload: z.object({
    trackId: z.string(),
    safe: z.boolean()
  })
});
var SetTrackCommentCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_COMMENT),
  payload: z.object({
    trackId: z.string(),
    comment: z.string()
  })
});
var SetTrackPanWidthCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_PAN_WIDTH),
  payload: z.object({
    trackId: z.string(),
    width: z.number()
  })
});
var SetAutomationModeCommandSchema = z.object({
  type: z.literal(CommandType.SET_AUTOMATION_MODE),
  payload: z.object({
    trackId: z.string(),
    processorId: z.string(),
    parameter: z.string(),
    mode: z.enum(["off", "read", "write", "touch", "latch"])
  })
});
var RenameMixerSceneCommandSchema = z.object({
  type: z.literal(CommandType.RENAME_MIXER_SCENE),
  payload: z.object({
    sceneId: z.string(),
    name: z.string()
  })
});
var RenameMarkerCommandSchema = z.object({
  type: z.literal(CommandType.RENAME_MARKER),
  payload: z.object({
    markerId: z.string(),
    name: z.string()
  })
});
var SetMarkerLockedCommandSchema = z.object({
  type: z.literal(CommandType.SET_MARKER_LOCKED),
  payload: z.object({
    markerId: z.string(),
    locked: z.boolean()
  })
});
var SetMouseModeCommandSchema = z.object({
  type: z.literal(CommandType.SET_MOUSE_MODE),
  payload: z.object({
    mode: z.enum([
      "object",
      "range",
      "cut",
      "draw",
      "content",
      "audition",
      "stretch",
      "internal_edit"
    ])
  })
});
var SetEditModeCommandSchema = z.object({
  type: z.literal(CommandType.SET_EDIT_MODE),
  payload: z.object({
    mode: z.enum(["slide", "ripple", "lock"])
  })
});
var SetZoomFocusCommandSchema = z.object({
  type: z.literal(CommandType.SET_ZOOM_FOCUS),
  payload: z.object({
    focus: z.enum([
      "left",
      "right",
      "center",
      "playhead",
      "mouse",
      "edit_point"
    ])
  })
});
var ZoomToFitCommandSchema = z.object({
  type: z.literal(CommandType.ZOOM_TO_FIT),
  payload: z.object({}).optional()
});
var SetFollowPlayheadCommandSchema = z.object({
  type: z.literal(CommandType.SET_FOLLOW_PLAYHEAD),
  payload: z.object({
    follow: z.boolean()
  })
});
var SetTrackHeightCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_HEIGHT),
  payload: z.object({
    trackId: z.string(),
    height: z.number()
  })
});
var ToggleRulerCommandSchema = z.object({
  type: z.literal(CommandType.TOGGLE_RULER),
  payload: z.object({
    ruler: z.enum([
      "bbt",
      "timecode",
      "minsec",
      "samples",
      "markers",
      "ranges",
      "tempo"
    ])
  })
});
var AudioCommandSchema = z.discriminatedUnion("type", [
  PlayCommandSchema,
  PauseCommandSchema,
  StopCommandSchema,
  AddTrackCommandSchema,
  RemoveTrackCommandSchema,
  AddRegionCommandSchema,
  AddPluginCommandSchema,
  RemovePluginCommandSchema,
  SetPluginParameterCommandSchema,
  UndoCommandSchema,
  RedoCommandSchema,
  SelectionUndoCommandSchema,
  SelectionRedoCommandSchema,
  z.object({
    type: z.literal(CommandType.ADD_AUTOMATION),
    payload: z.object({
      trackId: z.string(),
      processorId: z.string(),
      parameter: z.string(),
      time: z.number(),
      value: z.number(),
      interpolation: z.enum(["Linear", "Exponential", "Hold"]).optional()
    })
  }),
  z.object({ type: z.literal(CommandType.START_RECORDING) }),
  z.object({ type: z.literal(CommandType.STOP_RECORDING) }),
  z.object({ type: z.literal(CommandType.TOGGLE_METRONOME) }),
  z.object({
    type: z.literal(CommandType.ADD_SOURCE),
    payload: z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      duration: z.number(),
      trackId: z.string().optional(),
      start: z.number().optional(),
      videoMetadata: z.object({
        fps: z.number(),
        width: z.number(),
        height: z.number(),
        codec: z.string(),
        format: z.string(),
        frameCount: z.number(),
        hasAudio: z.boolean(),
        thumbnailUrl: z.string().optional(),
        originalVideoUrl: z.string()
      }).optional()
    })
  }),
  SetTrackVolumeCommandSchema,
  SetTrackPanCommandSchema,
  SetTrackMuteCommandSchema,
  SetTrackSoloCommandSchema,
  RemoveRegionCommandSchema,
  MoveRegionCommandSchema,
  ResizeRegionCommandSchema,
  TrimRegionCommandSchema,
  SetRegionFadesCommandSchema,
  MergeRegionsCommandSchema,
  z.object({
    type: z.literal(CommandType.SET_TEMPO),
    payload: z.object({ bpm: z.number() })
  }),
  z.object({
    type: z.literal(CommandType.SET_TIME_SIGNATURE),
    payload: z.object({ numerator: z.number(), denominator: z.number() })
  }),
  z.object({
    type: z.literal(CommandType.ARM_TRACK),
    payload: z.object({ trackId: z.string(), armed: z.boolean() })
  }),
  z.object({
    type: z.literal(CommandType.SET_TRACK_MONITOR),
    payload: z.object({ trackId: z.string(), monitor: z.boolean() })
  }),
  z.object({
    type: z.literal(CommandType.SEEK),
    payload: z.object({ time: z.number() })
  }),
  z.object({
    type: z.literal(CommandType.CONNECT_IO),
    payload: z.object({ sourceId: z.string(), destId: z.string() })
  }),
  z.object({
    type: z.literal(CommandType.DISCONNECT_IO),
    payload: z.object({ sourceId: z.string(), destId: z.string() })
  }),
  z.object({
    type: z.literal(CommandType.MOVE_AUTOMATION_POINT),
    payload: z.object({
      trackId: z.string(),
      processorId: z.string(),
      parameter: z.string(),
      pointId: z.string(),
      newTime: z.number(),
      newValue: z.number()
    })
  }),
  z.object({
    type: z.literal(CommandType.REMOVE_AUTOMATION_POINT),
    payload: z.object({
      trackId: z.string(),
      processorId: z.string(),
      parameter: z.string(),
      pointId: z.string()
    })
  }),
  z.object({
    type: z.literal(CommandType.EXPORT),
    payload: z.object({
      filename: z.string().optional(),
      format: z.enum(["wav", "mp3", "ogg", "flac"]).optional(),
      sampleFormat: z.enum(["int16", "int24", "float32"]).optional(),
      normalize: z.boolean().optional(),
      rangeId: z.string().optional(),
      // Export named range
      startFrame: z.number().optional(),
      endFrame: z.number().optional()
    }).optional()
  }),
  z.object({
    type: z.literal(CommandType.OPEN_EXPORT_DIALOG),
    payload: z.object({}).passthrough().optional()
  }),
  z.object({
    type: z.literal(CommandType.DEBUG_SESSION),
    payload: z.object({}).optional()
  }),
  z.object({
    type: z.literal(CommandType.ADD_RANGE),
    payload: z.object({
      name: z.string(),
      start: z.number(),
      end: z.number(),
      color: z.string().optional()
    })
  }),
  z.object({
    type: z.literal(CommandType.REMOVE_RANGE),
    payload: z.object({
      rangeId: z.string()
    })
  }),
  z.object({
    type: z.literal(CommandType.SET_RANGE),
    payload: z.object({
      rangeId: z.string(),
      name: z.string().optional(),
      start: z.number().optional(),
      end: z.number().optional(),
      color: z.string().optional()
    })
  }),
  z.object({
    type: z.literal(CommandType.LIST_RANGES),
    payload: z.object({}).optional()
  }),
  z.object({
    type: z.literal(CommandType.SET_LOOP_RANGE),
    payload: z.object({
      rangeId: z.string().optional()
      // undefined to clear
    }).optional()
  }),
  z.object({
    type: z.literal(CommandType.TOGGLE_LOOP),
    payload: z.object({}).optional()
  }),
  z.object({
    type: z.literal(CommandType.SET_PUNCH_RANGE),
    payload: z.object({
      rangeId: z.string().optional()
      // undefined to clear
    }).optional()
  }),
  z.object({
    type: z.literal(CommandType.SET_GRID),
    payload: z.object({
      gridType: z.string().optional(),
      snapMode: z.string().optional(),
      snapToGrid: z.boolean().optional(),
      bpm: z.number().optional()
    }).optional()
  }),
  z.object({
    type: z.literal(CommandType.GET_GRID),
    payload: z.object({}).optional()
  }),
  z.object({
    type: z.literal(CommandType.COPY_REGION),
    payload: z.object({}).optional()
  }),
  z.object({
    type: z.literal(CommandType.PASTE_REGION),
    payload: z.object({
      trackId: z.string().optional(),
      position: z.number().optional()
    }).optional()
  }),
  z.object({
    type: z.literal(CommandType.DUPLICATE_REGION),
    payload: z.object({}).optional()
  }),
  z.object({
    type: z.literal(CommandType.SPLIT_REGION),
    payload: z.object({
      trackId: z.string(),
      regionId: z.string(),
      position: z.number()
    })
  }),
  z.object({
    type: z.literal(CommandType.SPLIT_AT_PLAYHEAD),
    payload: z.object({}).optional()
  }),
  z.object({
    type: z.literal(CommandType.SELECT_REGION),
    payload: z.object({
      regionId: z.string(),
      addToSelection: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal(CommandType.SELECT_REGIONS),
    payload: z.object({
      regionIds: z.array(z.string()),
      addToSelection: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal(CommandType.CLEAR_SELECTION),
    payload: z.object({}).optional()
  }),
  z.object({
    type: z.literal(CommandType.SET_REGION_TIME_DOMAIN),
    payload: z.object({
      trackId: z.string(),
      regionId: z.string(),
      timeDomain: z.number()
      // Enum value
    })
  }),
  AddSendBusCommandSchema,
  RemoveSendBusCommandSchema,
  SetSendLevelCommandSchema,
  SaveSessionCommandSchema,
  LoadSessionCommandSchema,
  NewSessionCommandSchema,
  SaveSnapshotCommandSchema,
  // Markers
  z.object({
    type: z.literal(CommandType.ADD_MARKER),
    payload: z.object({
      name: z.string(),
      position: z.number(),
      color: z.string().optional()
    })
  }),
  z.object({
    type: z.literal(CommandType.REMOVE_MARKER),
    payload: z.object({
      markerId: z.string()
    })
  }),
  z.object({
    type: z.literal(CommandType.MOVE_MARKER),
    payload: z.object({
      markerId: z.string(),
      position: z.number()
    })
  }),
  z.object({
    type: z.literal(CommandType.LIST_MARKERS),
    payload: z.object({}).optional()
  }),
  z.object({
    type: z.literal(CommandType.GOTO_NEXT_MARKER),
    payload: z.object({}).optional()
  }),
  z.object({
    type: z.literal(CommandType.GOTO_PREV_MARKER),
    payload: z.object({}).optional()
  }),
  // Track Enhancements
  z.object({
    type: z.literal(CommandType.SET_TRACK_COLOR),
    payload: z.object({
      trackId: z.string(),
      color: z.string()
    })
  }),
  z.object({
    type: z.literal(CommandType.REORDER_TRACK),
    payload: z.object({
      trackId: z.string(),
      newIndex: z.number()
    })
  }),
  z.object({
    type: z.literal(CommandType.BOUNCE_TRACK),
    payload: z.object({
      trackId: z.string()
    })
  }),
  // Recording Improvements (Phase 12)
  z.object({
    type: z.literal(CommandType.ENABLE_PUNCH),
    payload: z.object({
      enabled: z.boolean()
    })
  }),
  z.object({
    type: z.literal(CommandType.SET_LOOP_RECORDING),
    payload: z.object({
      enabled: z.boolean()
    })
  }),
  z.object({
    type: z.literal(CommandType.SET_PRE_ROLL),
    payload: z.object({
      bars: z.number()
    })
  }),
  z.object({
    type: z.literal(CommandType.SET_MONITOR_WITH_EFFECTS),
    payload: z.object({
      trackId: z.string(),
      enabled: z.boolean()
    })
  }),
  // Advanced Editing (Phase 14)
  LockRegionCommandSchema,
  SetRippleEditCommandSchema,
  AuditionRegionCommandSchema,
  StopAuditionCommandSchema,
  GroupRegionsCommandSchema,
  UngroupRegionsCommandSchema,
  FreezeTrackCommandSchema,
  UnfreezeTrackCommandSchema,
  StripSilenceCommandSchema,
  NormalizeRegionCommandSchema,
  SetRegionPlaybackRateCommandSchema,
  ReverseRegionCommandSchema,
  // MIDI
  AddMidiNoteCommandSchema,
  RemoveMidiNoteCommandSchema,
  MoveMidiNoteCommandSchema,
  ResizeMidiNoteCommandSchema,
  QuantizeMidiCommandSchema,
  TransposeMidiCommandSchema,
  SetMidiInstrumentCommandSchema,
  // Aux/Bus Tracks
  AddAuxTrackCommandSchema,
  AddBusTrackCommandSchema,
  // Tempo Map
  AddTempoChangeCommandSchema,
  RemoveTempoChangeCommandSchema,
  // MIDI Input Device
  SetMidiInputDeviceCommandSchema,
  // Plugin Presets
  ApplyPluginPresetCommandSchema,
  SavePluginPresetCommandSchema,
  // Stem Export
  ExportStemsCommandSchema,
  // Mixer Scenes
  SaveMixerSceneCommandSchema,
  RecallMixerSceneCommandSchema,
  DeleteMixerSceneCommandSchema,
  // Track Groups
  CreateTrackGroupCommandSchema,
  DeleteTrackGroupCommandSchema,
  AddToTrackGroupCommandSchema,
  RemoveFromTrackGroupCommandSchema,
  SetTrackParentCommandSchema,
  // VCA
  AddVCATrackCommandSchema,
  RemoveVCATrackCommandSchema,
  SetVCAGainCommandSchema,
  AssignToVCACommandSchema,
  // Transport Mode
  SetTransportModeCommandSchema,
  // CD Markers
  AddCDMarkerCommandSchema,
  RemoveCDMarkerCommandSchema,
  GenerateCueSheetCommandSchema,
  // Sidechain
  SetSidechainSourceCommandSchema,
  // Phase 15: Track Enhancements
  SetTrackPanWidthCommandSchema,
  SetAutomationModeCommandSchema,
  RenameMixerSceneCommandSchema,
  RenameMarkerCommandSchema,
  SetMarkerLockedCommandSchema,
  SetTrackMonitorModeCommandSchema,
  SetTrackTrimGainCommandSchema,
  SetTrackSoloIsolateCommandSchema,
  SetTrackSoloSafeCommandSchema,
  SetTrackCommentCommandSchema,
  // Phase 13: Editor Modes
  SetMouseModeCommandSchema,
  SetEditModeCommandSchema,
  SetZoomFocusCommandSchema,
  ZoomToFitCommandSchema,
  SetFollowPlayheadCommandSchema,
  SetTrackHeightCommandSchema,
  ToggleRulerCommandSchema
]);

// core/src/commands/CommandExecutor.ts
import { z as z2 } from "zod";

// core/src/commands/UndoTransaction.ts
var UndoTransaction = class {
  constructor(name) {
    this.entries = [];
    this._name = name;
    this._timestamp = Date.now();
  }
  get name() {
    return this._name;
  }
  get timestamp() {
    return this._timestamp;
  }
  get empty() {
    return this.entries.length === 0;
  }
  get size() {
    return this.entries.length;
  }
  /**
   * Append a command to this transaction.
   *
   * @param cmd     - The undoable command to add.
   * @param cleanup - Optional callback invoked when the command is removed
   *                  or invalidated (e.g. via {@link removeCommand}).
   */
  addCommand(cmd, cleanup) {
    this.entries.push({ command: cmd, cleanup });
  }
  /**
   * Remove (invalidate) the command at the given index.
   *
   * If the entry has a cleanup callback it will be invoked before the
   * entry is removed.
   *
   * @param index - Zero-based index of the command to remove.
   * @throws {RangeError} If the index is out of bounds.
   */
  removeCommand(index) {
    if (index < 0 || index >= this.entries.length) {
      throw new RangeError(
        `UndoTransaction.removeCommand: index ${index} out of bounds [0, ${this.entries.length})`
      );
    }
    const entry = this.entries[index];
    if (entry.cleanup) {
      entry.cleanup();
    }
    this.entries.splice(index, 1);
  }
  async execute() {
    for (const entry of this.entries) {
      await entry.command.execute();
    }
  }
  async undo() {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      await this.entries[i].command.undo();
    }
  }
  async redo() {
    for (const entry of this.entries) {
      await entry.command.redo();
    }
  }
};

// core/src/commands/CommandHistory.ts
init_Signal();
var CommandHistory = class {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this._depth = 0;
    // 0 = unlimited
    // Active transaction
    this._activeTransaction = null;
    // Signals
    this.historyChanged = new Signal();
    this.beginUndoRedo = new Signal();
    this.endUndoRedo = new Signal();
  }
  // --- Depth management ---
  get depth() {
    return this._depth;
  }
  setDepth(d) {
    this._depth = Math.max(0, Math.min(512, d));
    this.trimUndoStack();
  }
  get undoDepth() {
    return this.undoStack.length;
  }
  get redoDepth() {
    return this.redoStack.length;
  }
  trimUndoStack() {
    if (this._depth > 0) {
      while (this.undoStack.length > this._depth) {
        this.undoStack.shift();
      }
    }
  }
  // --- Execute ---
  async execute(command, label) {
    await command.execute();
    const entryLabel = label || command.constructor.name.replace("Command", "");
    this.undoStack.push({
      command,
      label: entryLabel,
      timestamp: Date.now()
    });
    this.trimUndoStack();
    this.redoStack = [];
    this.historyChanged.emit();
  }
  // --- Transaction grouping ---
  beginTransaction(name) {
    this._activeTransaction = new UndoTransaction(name);
  }
  addCommandToTransaction(cmd) {
    if (this._activeTransaction) {
      this._activeTransaction.addCommand(cmd);
    }
  }
  async commitTransaction() {
    if (!this._activeTransaction || this._activeTransaction.empty) {
      this._activeTransaction = null;
      return;
    }
    const txn = this._activeTransaction;
    this._activeTransaction = null;
    this.undoStack.push({
      command: txn,
      label: txn.name,
      timestamp: txn.timestamp
    });
    this.trimUndoStack();
    this.redoStack = [];
    this.historyChanged.emit();
  }
  async abortTransaction() {
    if (!this._activeTransaction) return;
    const txn = this._activeTransaction;
    this._activeTransaction = null;
    await txn.undo();
  }
  get hasActiveTransaction() {
    return this._activeTransaction !== null;
  }
  // --- Undo / Redo with begin/end signals ---
  async undo() {
    const entry = this.undoStack.pop();
    if (entry) {
      this.beginUndoRedo.emit();
      try {
        await entry.command.undo();
        this.redoStack.push(entry);
      } finally {
        this.endUndoRedo.emit();
      }
      this.historyChanged.emit();
    }
  }
  async redo() {
    const entry = this.redoStack.pop();
    if (entry) {
      this.beginUndoRedo.emit();
      try {
        await entry.command.redo();
        this.undoStack.push(entry);
        this.trimUndoStack();
      } finally {
        this.endUndoRedo.emit();
      }
      this.historyChanged.emit();
    }
  }
  // --- Batch undo / redo ---
  /**
   * Undo multiple transactions at once.
   *
   * This is more efficient than calling {@link undo} in a loop because it
   * emits `beginUndoRedo` / `endUndoRedo` and `historyChanged` only once
   * for the entire batch.
   *
   * @param count - Number of undo steps to perform.  Clamped to the
   *   available undo depth.
   */
  async undoMultiple(count) {
    const steps = Math.min(Math.max(0, count), this.undoStack.length);
    if (steps === 0) return;
    this.beginUndoRedo.emit();
    try {
      for (let i = 0; i < steps; i++) {
        const entry = this.undoStack.pop();
        if (entry) {
          await entry.command.undo();
          this.redoStack.push(entry);
        }
      }
    } finally {
      this.endUndoRedo.emit();
    }
    this.historyChanged.emit();
  }
  /**
   * Redo multiple transactions at once.
   *
   * This is more efficient than calling {@link redo} in a loop because it
   * emits `beginUndoRedo` / `endUndoRedo` and `historyChanged` only once
   * for the entire batch.
   *
   * @param count - Number of redo steps to perform.  Clamped to the
   *   available redo depth.
   */
  async redoMultiple(count) {
    const steps = Math.min(Math.max(0, count), this.redoStack.length);
    if (steps === 0) return;
    this.beginUndoRedo.emit();
    try {
      for (let i = 0; i < steps; i++) {
        const entry = this.redoStack.pop();
        if (entry) {
          await entry.command.redo();
          this.undoStack.push(entry);
        }
      }
      this.trimUndoStack();
    } finally {
      this.endUndoRedo.emit();
    }
    this.historyChanged.emit();
  }
  // --- State queries ---
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  /**
   * Dynamic label for next undo action.
   */
  get nextUndoLabel() {
    if (this.undoStack.length === 0) return "";
    return this.undoStack[this.undoStack.length - 1].label;
  }
  /**
   * Dynamic label for next redo action.
   */
  get nextRedoLabel() {
    if (this.redoStack.length === 0) return "";
    return this.redoStack[this.redoStack.length - 1].label;
  }
  /**
   * Get the undo history stack (for UI display).
   * Returns entries in execution order (oldest first).
   */
  getUndoHistory() {
    return [...this.undoStack];
  }
  /**
   * Get the redo history stack.
   * Returns entries in redo order (next to redo first).
   */
  getRedoHistory() {
    return [...this.redoStack].reverse();
  }
  /**
   * Undo to a specific point in history (undo multiple steps).
   */
  async undoTo(index) {
    const stepsToUndo = this.undoStack.length - index;
    for (let i = 0; i < stepsToUndo; i++) {
      await this.undo();
    }
  }
  /**
   * Get the current position in history (number of executed commands).
   */
  get currentIndex() {
    return this.undoStack.length;
  }
  /**
   * Get total history size (undo + redo).
   */
  get totalSize() {
    return this.undoStack.length + this.redoStack.length;
  }
  // --- Clear methods ---
  clearUndo() {
    this.undoStack = [];
    this.historyChanged.emit();
  }
  clearRedo() {
    this.redoStack = [];
    this.historyChanged.emit();
  }
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.historyChanged.emit();
  }
  // --- Persistence ---
  /**
   * Serialize history metadata for persistence.
   * @param depth Number of entries to save (0 = all, negative = all)
   */
  getState(depth = 0) {
    const undoEntries = (depth > 0 ? this.undoStack.slice(-depth) : this.undoStack).map((e) => ({ label: e.label, timestamp: e.timestamp }));
    const redoEntries = (depth > 0 ? this.redoStack.slice(-depth) : this.redoStack).map((e) => ({ label: e.label, timestamp: e.timestamp }));
    return { undoEntries, redoEntries };
  }
  // --- Serialization support ---
  /**
   * Return a lightweight snapshot containing the transaction/command names
   * from both stacks.
   *
   * This is useful for persisting history metadata (e.g. to show the user
   * what operations were performed) without needing to serialize full
   * command state.
   *
   * @returns An object with `undoStack` and `redoStack` arrays of label
   *   strings.
   */
  getSnapshot() {
    return {
      undoStack: this.undoStack.map((e) => e.label),
      redoStack: this.redoStack.map((e) => e.label)
    };
  }
  /**
   * Check whether all commands in the history implement
   * {@link SerializableCommand}, meaning the full history could be
   * serialized and later re-hydrated.
   *
   * @returns `true` if every entry's command has a `toJSON` method.
   */
  canSerialize() {
    const allEntries = [...this.undoStack, ...this.redoStack];
    return allEntries.every((entry) => this.isSerializable(entry.command));
  }
  /**
   * Type guard for checking if a command implements SerializableCommand.
   */
  isSerializable(cmd) {
    return typeof cmd === "object" && cmd !== null && "toJSON" in cmd && typeof cmd.toJSON === "function";
  }
};

// core/src/commands/impl/AddTempoChangeCommand.ts
var AddTempoChangeCommand = class {
  constructor(frame, bpm, timeSigNum, timeSigDen) {
    /** Backup of previous event at this frame for undo (null if none existed) */
    this.previousEvent = null;
    this.wasNew = true;
    this.frame = frame;
    this.bpm = bpm;
    this.timeSigNum = timeSigNum;
    this.timeSigDen = timeSigDen;
  }
  async execute() {
    const tempoMap = AudioEngine.getInstance().session.tempoMap;
    const existing = tempoMap.getAllEvents().find((e) => e.frame === this.frame);
    if (existing) {
      this.previousEvent = {
        bpm: existing.bpm,
        timeSigNum: existing.timeSigNum,
        timeSigDen: existing.timeSigDen
      };
      this.wasNew = false;
    } else {
      this.wasNew = true;
    }
    tempoMap.addTempoChange(
      this.frame,
      this.bpm,
      this.timeSigNum,
      this.timeSigDen
    );
  }
  async undo() {
    const tempoMap = AudioEngine.getInstance().session.tempoMap;
    if (this.wasNew) {
      tempoMap.removeTempoChange(this.frame);
    } else if (this.previousEvent) {
      tempoMap.addTempoChange(
        this.frame,
        this.previousEvent.bpm,
        this.previousEvent.timeSigNum,
        this.previousEvent.timeSigDen
      );
    }
  }
  async redo() {
    const tempoMap = AudioEngine.getInstance().session.tempoMap;
    tempoMap.addTempoChange(
      this.frame,
      this.bpm,
      this.timeSigNum,
      this.timeSigDen
    );
  }
};

// core/src/commands/impl/RemoveTempoChangeCommand.ts
var RemoveTempoChangeCommand = class {
  constructor(frame) {
    /** Backup of the removed event for undo */
    this.removedEvent = null;
    this.frame = frame;
  }
  async execute() {
    const tempoMap = AudioEngine.getInstance().session.tempoMap;
    const existing = tempoMap.getAllEvents().find((e) => e.frame === this.frame);
    if (existing) {
      this.removedEvent = {
        bpm: existing.bpm,
        timeSigNum: existing.timeSigNum,
        timeSigDen: existing.timeSigDen
      };
    }
    tempoMap.removeTempoChange(this.frame);
  }
  async undo() {
    if (this.removedEvent) {
      const tempoMap = AudioEngine.getInstance().session.tempoMap;
      tempoMap.addTempoChange(
        this.frame,
        this.removedEvent.bpm,
        this.removedEvent.timeSigNum,
        this.removedEvent.timeSigDen
      );
    }
  }
  async redo() {
    const tempoMap = AudioEngine.getInstance().session.tempoMap;
    tempoMap.removeTempoChange(this.frame);
  }
};

// core/src/commands/handlers/TransportHandler.ts
var TransportHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.PLAY,
      CommandType.PAUSE,
      CommandType.STOP,
      CommandType.START_RECORDING,
      CommandType.STOP_RECORDING,
      CommandType.TOGGLE_METRONOME,
      CommandType.SEEK,
      CommandType.SET_TEMPO,
      CommandType.SET_TIME_SIGNATURE,
      CommandType.ENABLE_PUNCH,
      CommandType.SET_LOOP_RECORDING,
      CommandType.SET_PRE_ROLL,
      CommandType.SET_MONITOR_WITH_EFFECTS,
      CommandType.ADD_TEMPO_CHANGE,
      CommandType.REMOVE_TEMPO_CHANGE,
      CommandType.SET_TRANSPORT_MODE
    ]);
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, history) {
    switch (commandType) {
      case CommandType.PLAY:
        await audioEngine.start();
        return { success: true, message: "Playback started" };
      case CommandType.PAUSE:
        audioEngine.pause();
        return { success: true, message: "Playback paused" };
      case CommandType.STOP:
        audioEngine.stop();
        return { success: true, message: "Playback stopped" };
      case CommandType.START_RECORDING:
        await audioEngine.startRecording();
        return { success: true, message: "Recording started" };
      case CommandType.STOP_RECORDING:
        await audioEngine.stopRecording();
        return { success: true, message: "Recording stopped" };
      case CommandType.TOGGLE_METRONOME:
        audioEngine.session.toggleMetronome();
        return { success: true, message: "Metronome toggled" };
      default:
        break;
    }
    if (!payload) {
      return { success: false, message: `${commandType} requires a payload` };
    }
    switch (commandType) {
      case CommandType.SEEK:
        audioEngine.seek(payload.time);
        return { success: true, message: `Seeked to ${payload.time}s` };
      case CommandType.SET_TEMPO:
        audioEngine.session.setTempo(payload.bpm);
        return { success: true, message: `Tempo set to ${payload.bpm}` };
      case CommandType.SET_TIME_SIGNATURE:
        audioEngine.session.setTimeSignature(
          payload.numerator,
          payload.denominator
        );
        return {
          success: true,
          message: `Time signature set to ${payload.numerator}/${payload.denominator}`
        };
      case CommandType.ENABLE_PUNCH:
        audioEngine.enablePunchRecording(payload.enabled);
        return {
          success: true,
          message: `Punch recording ${payload.enabled ? "enabled" : "disabled"}`
        };
      case CommandType.SET_LOOP_RECORDING:
        audioEngine.session.setLoopRecording(payload.enabled);
        return {
          success: true,
          message: `Loop recording ${payload.enabled ? "enabled" : "disabled"}`
        };
      case CommandType.SET_PRE_ROLL:
        audioEngine.session.setPreRollBars(payload.bars);
        return {
          success: true,
          message: `Pre-roll set to ${payload.bars} bars`
        };
      case CommandType.SET_MONITOR_WITH_EFFECTS:
        audioEngine.setMonitorWithEffects(
          payload.trackId,
          payload.enabled
        );
        return {
          success: true,
          message: `Monitor with effects ${payload.enabled ? "enabled" : "disabled"} for track ${payload.trackId}`
        };
      case CommandType.ADD_TEMPO_CHANGE: {
        const addTempoCmd = new AddTempoChangeCommand(
          payload.frame,
          payload.bpm,
          payload.timeSigNum,
          payload.timeSigDen
        );
        await history.execute(addTempoCmd);
        return {
          success: true,
          message: `Tempo change added: ${payload.bpm} BPM at frame ${payload.frame}`
        };
      }
      case CommandType.REMOVE_TEMPO_CHANGE: {
        const removeTempoCmd = new RemoveTempoChangeCommand(
          payload.frame
        );
        await history.execute(removeTempoCmd);
        return {
          success: true,
          message: `Tempo change removed at frame ${payload.frame}`
        };
      }
      case CommandType.SET_TRANSPORT_MODE: {
        const mode = payload.mode;
        const scrubState = audioEngine.session.scrubState;
        switch (mode) {
          case "normal":
            scrubState.setNormalMode();
            break;
          case "scrub":
            scrubState.setScrubMode();
            break;
          case "shuttle":
            scrubState.setShuttleMode(1);
            break;
        }
        return { success: true, message: `Transport mode set to ${mode}` };
      }
      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
};

// core/src/errors/DAWErrors.ts
var DAWError = class _DAWError extends Error {
  constructor(message) {
    super(message);
    this.name = "DAWError";
    Object.setPrototypeOf(this, _DAWError.prototype);
  }
};
var TrackNotFoundError = class extends DAWError {
  constructor(trackId) {
    super(`Track not found: ${trackId}`);
    this.trackId = trackId;
    this.name = "TrackNotFoundError";
  }
};
var RegionNotFoundError = class extends DAWError {
  constructor(regionId) {
    super(`Region not found: ${regionId}`);
    this.regionId = regionId;
    this.name = "RegionNotFoundError";
  }
};
var RegionOutOfBoundsError = class extends DAWError {
  constructor(regionId, position, start, end) {
    super(
      `Region ${regionId}: position ${position} is outside bounds (${start}-${end})`
    );
    this.regionId = regionId;
    this.position = position;
    this.start = start;
    this.end = end;
    this.name = "RegionOutOfBoundsError";
  }
};
var RangeNotFoundError = class extends DAWError {
  constructor(rangeId) {
    super(`Range not found: ${rangeId}`);
    this.rangeId = rangeId;
    this.name = "RangeNotFoundError";
  }
};
var InvalidRangeError = class extends DAWError {
  constructor(start, end) {
    super(`Invalid range: start (${start}) must be less than end (${end})`);
    this.start = start;
    this.end = end;
    this.name = "InvalidRangeError";
  }
};
var SourceNotFoundError = class extends DAWError {
  constructor(sourceId) {
    super(`Source not found: ${sourceId}`);
    this.sourceId = sourceId;
    this.name = "SourceNotFoundError";
  }
};
var AudioLoadError = class extends DAWError {
  constructor(url, reason) {
    super(`Failed to load audio from ${url}: ${reason}`);
    this.url = url;
    this.reason = reason;
    this.name = "AudioLoadError";
  }
};
var IONotFoundError = class extends DAWError {
  constructor(ioId) {
    super(`IO not found: ${ioId}`);
    this.ioId = ioId;
    this.name = "IONotFoundError";
  }
};
var IOConnectionError = class extends DAWError {
  constructor(sourceId, destId, reason) {
    super(`Failed to connect ${sourceId} to ${destId}: ${reason}`);
    this.sourceId = sourceId;
    this.destId = destId;
    this.reason = reason;
    this.name = "IOConnectionError";
  }
};
var InvalidCommandError = class extends DAWError {
  constructor(message) {
    super(`Invalid command: ${message}`);
    this.name = "InvalidCommandError";
  }
};
var CommandExecutionError = class extends DAWError {
  constructor(commandType, reason) {
    super(`Failed to execute ${commandType}: ${reason}`);
    this.commandType = commandType;
    this.reason = reason;
    this.name = "CommandExecutionError";
  }
};
var ExportError = class extends DAWError {
  constructor(message) {
    super(`Export failed: ${message}`);
    this.name = "ExportError";
  }
};
var ExportConfigurationError = class extends DAWError {
  constructor(message) {
    super(`Invalid export configuration: ${message}`);
    this.name = "ExportConfigurationError";
  }
};
var NoSelectionError = class extends DAWError {
  constructor() {
    super("No region selected. Select a region first.");
    this.name = "NoSelectionError";
  }
};
var AutomationPointNotFoundError = class extends DAWError {
  constructor(pointId) {
    super(`Automation point not found: ${pointId}`);
    this.pointId = pointId;
    this.name = "AutomationPointNotFoundError";
  }
};
var ProcessorNotFoundError = class extends DAWError {
  constructor(processorId) {
    super(`Processor not found: ${processorId}`);
    this.processorId = processorId;
    this.name = "ProcessorNotFoundError";
  }
};

// core/src/commands/handlers/CommandHandler.ts
function getTrackOrThrow(audioEngine, trackId) {
  const track = audioEngine.session.getTrack(trackId);
  if (!track) {
    throw new TrackNotFoundError(trackId);
  }
  return track;
}
function requireString(payload, key) {
  const val = payload[key];
  if (typeof val !== "string")
    throw new Error(`Missing required string field: ${key}`);
  return val;
}
function requireNumber(payload, key) {
  const val = payload[key];
  if (typeof val !== "number")
    throw new Error(`Missing required number field: ${key}`);
  return val;
}
function optionalString(payload, key) {
  const val = payload[key];
  return typeof val === "string" ? val : void 0;
}
function optionalNumber(payload, key) {
  const val = payload[key];
  return typeof val === "number" ? val : void 0;
}
function requireBoolean(payload, key) {
  const val = payload[key];
  if (typeof val !== "boolean")
    throw new Error(`Missing required boolean field: ${key}`);
  return val;
}
function optionalBoolean(payload, key) {
  const val = payload[key];
  return typeof val === "boolean" ? val : void 0;
}
function requireStringArray(payload, key) {
  const val = payload[key];
  if (!Array.isArray(val))
    throw new Error(`Missing required string array field: ${key}`);
  return val;
}

// core/src/commands/impl/AddTrackCommand.ts
var AddTrackCommand = class {
  constructor(name, type = "AUDIO" /* AUDIO */) {
    this.trackId = null;
    this.name = name;
    this.type = type;
  }
  get id() {
    return this.trackId;
  }
  async execute() {
    const track = AudioEngine.getInstance().addTrack(
      this.name,
      this.type,
      this.trackId || void 0
    );
    this.trackId = track.id;
  }
  async undo() {
    if (this.trackId) {
      AudioEngine.getInstance().removeTrack(this.trackId);
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/RemoveTrackCommand.ts
var RemoveTrackCommand = class {
  constructor(trackId) {
    // Backup data for undo
    this.trackName = null;
    this.trackType = "AUDIO" /* AUDIO */;
    this.trackId = trackId;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const track = engine.session.getTrack(this.trackId);
    if (track) {
      this.trackName = track.name;
      this.trackType = track.type;
      engine.removeTrack(this.trackId);
    }
  }
  async undo() {
    if (this.trackName) {
      AudioEngine.getInstance().addTrack(
        this.trackName,
        this.trackType,
        this.trackId
      );
    }
  }
  async redo() {
    AudioEngine.getInstance().removeTrack(this.trackId);
  }
};

// core/src/commands/impl/SetTrackVolumeCommand.ts
var SetTrackVolumeCommand = class {
  constructor(session, trackId, volume) {
    /** Snapshot of volume for the primary track and all linked siblings. */
    this.oldStates = /* @__PURE__ */ new Map();
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.newVolume = volume;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    this.oldStates.set(this.trackId, track.route.volume);
    const group = this.session.getTrackGroupForTrack(this.trackId);
    if (group?.gainLinked) {
      for (const memberId of group.memberTrackIds) {
        if (memberId === this.trackId) continue;
        const sibling = this.session.getTrack(memberId);
        if (sibling) this.oldStates.set(memberId, sibling.route.volume);
      }
    }
    track.route.volume = this.newVolume;
  }
  async undo() {
    for (const [trackId, oldVolume] of this.oldStates) {
      const track = this.session.getTrack(trackId);
      if (track) track.route.volume = oldVolume;
    }
  }
  async redo() {
    this.oldStates.clear();
    await this.execute();
  }
};

// core/src/commands/impl/SetTrackPanCommand.ts
var SetTrackPanCommand = class {
  constructor(session, trackId, pan) {
    this.oldPan = null;
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.newPan = pan;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    this.oldPan = track.route.pan;
    track.route.pan = this.newPan;
  }
  async undo() {
    if (this.oldPan === null) return;
    const track = this.session.getTrack(this.trackId);
    if (track) {
      track.route.pan = this.oldPan;
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/SetTrackMuteCommand.ts
var SetTrackMuteCommand = class {
  constructor(session, trackId, mute) {
    /** Snapshot of mute state for the primary track and all linked siblings. */
    this.oldStates = /* @__PURE__ */ new Map();
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.newMute = mute;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    this.oldStates.set(this.trackId, track.mute);
    const group = this.session.getTrackGroupForTrack(this.trackId);
    if (group?.muteLinked) {
      for (const memberId of group.memberTrackIds) {
        if (memberId === this.trackId) continue;
        const sibling = this.session.getTrack(memberId);
        if (sibling) this.oldStates.set(memberId, sibling.mute);
      }
    }
    track.setMute(this.newMute);
  }
  async undo() {
    for (const [trackId, oldMute] of this.oldStates) {
      const track = this.session.getTrack(trackId);
      if (track) track.setMute(oldMute);
    }
  }
  async redo() {
    this.oldStates.clear();
    await this.execute();
  }
};

// core/src/commands/impl/SetTrackSoloCommand.ts
var SetTrackSoloCommand = class {
  constructor(session, trackId, solo) {
    /** Snapshot of solo state for the primary track and all linked siblings. */
    this.oldStates = /* @__PURE__ */ new Map();
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.newSolo = solo;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    this.oldStates.set(this.trackId, track.solo);
    const group = this.session.getTrackGroupForTrack(this.trackId);
    if (group?.soloLinked) {
      for (const memberId of group.memberTrackIds) {
        if (memberId === this.trackId) continue;
        const sibling = this.session.getTrack(memberId);
        if (sibling) this.oldStates.set(memberId, sibling.solo);
      }
    }
    track.setSolo(this.newSolo);
  }
  async undo() {
    for (const [trackId, oldSolo] of this.oldStates) {
      const track = this.session.getTrack(trackId);
      if (track) track.setSolo(oldSolo);
    }
  }
  async redo() {
    this.oldStates.clear();
    await this.execute();
  }
};

// core/src/commands/impl/SetPluginParameterCommand.ts
init_PluginInsert();
var SetPluginParameterCommand = class {
  constructor(session, trackId, processorId, parameterId, value) {
    this.session = session;
    this.trackId = trackId;
    this.processorId = processorId;
    this.parameterId = parameterId;
    this.value = value;
    const track = this.session.getTrack(this.trackId);
    if (track) {
      const proc = track.route.processors.find(
        (p) => p.id === this.processorId
      );
      if (proc && proc instanceof PluginInsert) {
        const param = proc.plugin.getParameter(this.parameterId);
        if (param) {
          this.previousValue = param.value;
        } else {
          this.previousValue = 0;
        }
      } else {
        this.previousValue = 0;
      }
    } else {
      this.previousValue = 0;
    }
  }
  async execute() {
    this.applyValue(this.value);
  }
  async undo() {
    this.applyValue(this.previousValue);
  }
  async redo() {
    this.applyValue(this.value);
  }
  applyValue(val) {
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const proc = track.route.processors.find((p) => p.id === this.processorId);
    if (!proc || !(proc instanceof PluginInsert)) return;
    proc.plugin.setParameter(this.parameterId, val);
  }
};

// core/src/commands/impl/ReorderTrackCommand.ts
var ReorderTrackCommand = class {
  constructor(session, trackId, newIndex) {
    this.oldIndex = -1;
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.newIndex = newIndex;
  }
  async execute() {
    this.oldIndex = this.session.getTrackIndex(this.trackId);
    if (this.oldIndex === -1) {
      throw new Error(`Track not found: ${this.trackId}`);
    }
    this.session.reorderTrack(this.trackId, this.newIndex);
  }
  async undo() {
    if (this.oldIndex === -1) return;
    this.session.reorderTrack(this.trackId, this.oldIndex);
  }
  async redo() {
    this.session.reorderTrack(this.trackId, this.newIndex);
  }
};

// core/src/commands/impl/FreezeTrackCommand.ts
init_Region();
var FreezeTrackCommand = class {
  constructor(session, audioEngine, trackId) {
    // Saved state for undo
    this.originalRegions = [];
    this.frozenRegion = null;
    this.frozenSource = null;
    this.disabledProcessorIds = [];
    this.id = crypto.randomUUID();
    this.session = session;
    this.audioEngine = audioEngine;
    this.trackId = trackId;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    if (track.frozen) {
      throw new Error(`Track ${this.trackId} is already frozen`);
    }
    const regions = track.playlist.getRegions();
    if (regions.length > 0) {
      this.originalRegions = [...regions];
      const regionIds = regions.map((r) => r.id);
      const audioBuffer = await this.audioEngine.renderRegionsToBuffer(
        this.trackId,
        regionIds
      );
      let minStart = Infinity;
      let maxEnd = -Infinity;
      for (const r of regions) {
        if (r.start < minStart) minStart = r.start;
        if (r.end > maxEnd) maxEnd = r.end;
      }
      const sourceId = crypto.randomUUID();
      this.frozenSource = new Source(
        sourceId,
        `Frozen: ${track.name}`,
        `frozen://${sourceId}`,
        audioBuffer.length,
        audioBuffer.sampleRate,
        audioBuffer.numberOfChannels
      );
      this.session.addSource(this.frozenSource);
      for (const id of regionIds) {
        track.playlist.removeRegion(id);
      }
      this.frozenRegion = new Region(
        crypto.randomUUID(),
        this.frozenSource.id,
        minStart,
        audioBuffer.length,
        0,
        `${track.name} (Frozen)`
      );
      track.playlist.addRegion(this.frozenRegion);
      this.disabledProcessorIds = track.route.processors.map(
        (p) => p.id
      );
      track.frozenSourceId = this.frozenSource.id;
    }
    track.setFrozen(true);
  }
  async undo() {
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    if (this.frozenRegion) {
      track.playlist.removeRegion(this.frozenRegion.id);
      for (const region of this.originalRegions) {
        track.playlist.addRegion(region);
      }
    }
    track.frozenSourceId = null;
    track.setFrozen(false);
  }
  async redo() {
    const track = this.session.getTrack(this.trackId);
    if (!track || !this.frozenRegion) return;
    for (const region of this.originalRegions) {
      track.playlist.removeRegion(region.id);
    }
    track.playlist.addRegion(this.frozenRegion);
    track.frozenSourceId = this.frozenSource?.id ?? null;
    track.setFrozen(true);
  }
};

// core/src/commands/impl/AddAuxTrackCommand.ts
var AddAuxTrackCommand = class {
  constructor(name) {
    this.trackId = null;
    this.name = name;
  }
  get id() {
    return this.trackId;
  }
  async execute() {
    const track = AudioEngine.getInstance().session.addAuxTrack(
      this.name,
      this.trackId || void 0
    );
    this.trackId = track.id;
  }
  async undo() {
    if (this.trackId) {
      AudioEngine.getInstance().removeTrack(this.trackId);
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/AddBusTrackCommand.ts
var AddBusTrackCommand = class {
  constructor(name) {
    this.trackId = null;
    this.name = name;
  }
  get id() {
    return this.trackId;
  }
  async execute() {
    const track = AudioEngine.getInstance().session.addBusTrack(
      this.name,
      this.trackId || void 0
    );
    this.trackId = track.id;
  }
  async undo() {
    if (this.trackId) {
      AudioEngine.getInstance().removeTrack(this.trackId);
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/handlers/TrackHandler.ts
var TrackHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.ADD_TRACK,
      CommandType.ADD_AUX_TRACK,
      CommandType.ADD_BUS_TRACK,
      CommandType.REMOVE_TRACK,
      CommandType.SET_VOLUME,
      CommandType.SET_PAN,
      CommandType.MUTE_TRACK,
      CommandType.SOLO_TRACK,
      CommandType.SET_PLUGIN_PARAMETER,
      CommandType.ARM_TRACK,
      CommandType.SET_TRACK_MONITOR,
      CommandType.SET_TRACK_COLOR,
      CommandType.REORDER_TRACK,
      CommandType.BOUNCE_TRACK,
      CommandType.FREEZE_TRACK,
      CommandType.UNFREEZE_TRACK,
      // Phase 15: Track Enhancements
      CommandType.SET_TRACK_PAN_WIDTH,
      CommandType.SET_TRACK_MONITOR_MODE,
      CommandType.SET_TRACK_TRIM_GAIN,
      CommandType.SET_TRACK_SOLO_ISOLATE,
      CommandType.SET_TRACK_SOLO_SAFE,
      CommandType.SET_TRACK_COMMENT
    ]);
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, history) {
    if (!payload) {
      return { success: false, message: `${commandType} requires a payload` };
    }
    switch (commandType) {
      case CommandType.ADD_TRACK: {
        const name = requireString(payload, "name");
        const cmd = new AddTrackCommand(name);
        await history.execute(cmd);
        return {
          success: true,
          message: `Track "${name}" added (ID: ${cmd.id})`
        };
      }
      case CommandType.ADD_AUX_TRACK: {
        const name = requireString(payload, "name");
        const auxCmd = new AddAuxTrackCommand(name);
        await history.execute(auxCmd);
        return {
          success: true,
          message: `Aux track "${name}" added (ID: ${auxCmd.id})`
        };
      }
      case CommandType.ADD_BUS_TRACK: {
        const name = requireString(payload, "name");
        const busCmd = new AddBusTrackCommand(name);
        await history.execute(busCmd);
        return {
          success: true,
          message: `Bus track "${name}" added (ID: ${busCmd.id})`
        };
      }
      case CommandType.REMOVE_TRACK: {
        const cmd = new RemoveTrackCommand(requireString(payload, "trackId"));
        await history.execute(cmd);
        return { success: true, message: "Track removed" };
      }
      case CommandType.SET_VOLUME: {
        const volume = requireNumber(payload, "volume");
        const cmd = new SetTrackVolumeCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          volume
        );
        await history.execute(cmd);
        return { success: true, message: `Volume set to ${volume}dB` };
      }
      case CommandType.SET_PAN: {
        const pan = requireNumber(payload, "pan");
        const cmd = new SetTrackPanCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          pan
        );
        await history.execute(cmd);
        return { success: true, message: `Pan set to ${pan}` };
      }
      case CommandType.MUTE_TRACK: {
        const mute = requireBoolean(payload, "mute");
        const cmd = new SetTrackMuteCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          mute
        );
        await history.execute(cmd);
        return { success: true, message: `Track mute set to ${mute}` };
      }
      case CommandType.SOLO_TRACK: {
        const solo = requireBoolean(payload, "solo");
        const cmd = new SetTrackSoloCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          solo
        );
        await history.execute(cmd);
        return { success: true, message: `Track solo set to ${solo}` };
      }
      case CommandType.SET_PLUGIN_PARAMETER: {
        const value = requireNumber(payload, "value");
        const cmd = new SetPluginParameterCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "processorId"),
          requireString(payload, "parameterId"),
          value
        );
        await history.execute(cmd);
        return { success: true, message: `Plugin parameter set to ${value}` };
      }
      case CommandType.ARM_TRACK: {
        const trackId = requireString(payload, "trackId");
        const armed = requireBoolean(payload, "armed");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setArmed(armed);
        return {
          success: true,
          message: `Track ${armed ? "armed" : "disarmed"} for recording`
        };
      }
      case CommandType.SET_TRACK_MONITOR: {
        const trackId = requireString(payload, "trackId");
        const monitor = requireBoolean(payload, "monitor");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setMonitor(monitor);
        return {
          success: true,
          message: `Track monitoring ${monitor ? "enabled" : "disabled"}`
        };
      }
      case CommandType.SET_TRACK_COLOR: {
        const trackId = requireString(payload, "trackId");
        const color = requireString(payload, "color");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setColor(color);
        return { success: true, message: `Track color set to ${color}` };
      }
      case CommandType.REORDER_TRACK: {
        const newIndex = requireNumber(payload, "newIndex");
        const cmd = new ReorderTrackCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          newIndex
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Track reordered to index ${newIndex}`
        };
      }
      case CommandType.BOUNCE_TRACK: {
        const trackId = requireString(payload, "trackId");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        const regions = track.playlist.getRegions();
        if (regions.length === 0) {
          return { success: false, message: "No regions to bounce" };
        }
        const regionIds = regions.map((r) => r.id);
        try {
          const buffer = await audioEngine.renderRegionsToBuffer(
            trackId,
            regionIds
          );
          return {
            success: true,
            message: `Track bounced: ${buffer.duration.toFixed(2)}s`,
            data: {
              duration: buffer.duration,
              channels: buffer.numberOfChannels
            }
          };
        } catch (error) {
          return {
            success: false,
            message: `Bounce failed: ${error.message}`
          };
        }
      }
      case CommandType.FREEZE_TRACK: {
        const cmd = new FreezeTrackCommand(
          audioEngine.session,
          audioEngine,
          requireString(payload, "trackId")
        );
        await history.execute(cmd);
        return { success: true, message: `Track frozen` };
      }
      case CommandType.UNFREEZE_TRACK: {
        const unfreezeTrackId = requireString(payload, "trackId");
        const unfreezeTrack = audioEngine.session.getTrack(unfreezeTrackId);
        if (!unfreezeTrack) {
          return {
            success: false,
            message: `Track not found: ${unfreezeTrackId}`
          };
        }
        if (!unfreezeTrack.frozen) {
          return { success: false, message: "Track is not frozen" };
        }
        await history.undo();
        return { success: true, message: "Track unfrozen" };
      }
      // ─── Phase 15: Track Enhancements ────────────────────────────
      case CommandType.SET_TRACK_PAN_WIDTH: {
        const trackId = requireString(payload, "trackId");
        const width = requireNumber(payload, "width");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.route.panner.setWidth(width);
        return { success: true, message: `Pan width set to ${width}` };
      }
      case CommandType.SET_TRACK_MONITOR_MODE: {
        const trackId = requireString(payload, "trackId");
        const mode = requireString(payload, "mode");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setMonitorMode(mode);
        return { success: true, message: `Monitor mode set to ${mode}` };
      }
      case CommandType.SET_TRACK_TRIM_GAIN: {
        const trackId = requireString(payload, "trackId");
        const trimGainDb = requireNumber(payload, "trimGainDb");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setTrimGain(trimGainDb);
        return { success: true, message: `Trim gain set to ${trimGainDb}dB` };
      }
      case CommandType.SET_TRACK_SOLO_ISOLATE: {
        const trackId = requireString(payload, "trackId");
        const isolate = requireBoolean(payload, "isolate");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setSoloIsolate(isolate);
        return {
          success: true,
          message: `Solo isolate ${isolate ? "enabled" : "disabled"}`
        };
      }
      case CommandType.SET_TRACK_SOLO_SAFE: {
        const trackId = requireString(payload, "trackId");
        const safe = requireBoolean(payload, "safe");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setSoloSafe(safe);
        return {
          success: true,
          message: `Solo safe ${safe ? "enabled" : "disabled"}`
        };
      }
      case CommandType.SET_TRACK_COMMENT: {
        const trackId = requireString(payload, "trackId");
        const comment = requireString(payload, "comment");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.comment = comment;
        return { success: true, message: "Track comment updated" };
      }
      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
};

// core/src/commands/impl/AddSourceCommand.ts
var AddSourceCommand = class {
  constructor(session, source) {
    this.session = session;
    this.source = source;
  }
  async execute() {
    this.session.addSource(this.source);
  }
  async undo() {
    this.session.removeSource(this.source.id);
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/AddRegionCommand.ts
init_Region();
var AddRegionCommand = class {
  constructor(session, trackId, sourceId, start, duration, sourceStart = 0) {
    // State
    this.regionId = null;
    this.rippleApplied = false;
    this.oldRegionStarts = /* @__PURE__ */ new Map();
    this.session = session;
    this.trackId = trackId;
    this.sourceId = sourceId;
    this.start = start;
    this.duration = duration;
    this.sourceStart = sourceStart;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    track.playlist.getRegions().forEach((r) => {
      this.oldRegionStarts.set(r.id, r.start);
    });
    if (this.session.rippleEdit) {
      this.rippleApplied = true;
      track.playlist.rippleShift(this.start, this.duration);
    }
    const id = this.regionId || crypto.randomUUID();
    const region = new Region(
      id,
      this.sourceId,
      this.start,
      this.duration,
      this.sourceStart,
      "Region"
    );
    track.playlist.addRegion(region);
    this.regionId = region.id;
  }
  async undo() {
    if (!this.regionId) return;
    const track = this.session.getTrack(this.trackId);
    if (track) {
      track.playlist.removeRegion(this.regionId);
      if (this.rippleApplied) {
        track.playlist.getRegions().forEach((r) => {
          const oldStart = this.oldRegionStarts.get(r.id);
          if (oldStart !== void 0) {
            r.move(oldStart);
          }
        });
      }
    }
  }
  async redo() {
    this.rippleApplied = false;
    this.oldRegionStarts.clear();
    await this.execute();
  }
};

// core/src/commands/impl/RemoveRegionCommand.ts
var RemoveRegionCommand = class {
  constructor(session, trackId, regionId) {
    this.removedRegion = null;
    this.rippleApplied = false;
    this.oldRegionStarts = /* @__PURE__ */ new Map();
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.regionId = regionId;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    const region = track.playlist.getRegion(this.regionId);
    if (!region) {
      throw new Error(`Region ${this.regionId} not found`);
    }
    this.removedRegion = region;
    const regionEnd = region.end;
    const regionLength = region.length;
    track.playlist.getRegions().forEach((r) => {
      this.oldRegionStarts.set(r.id, r.start);
    });
    track.playlist.removeRegion(this.regionId);
    if (this.session.rippleEdit) {
      this.rippleApplied = true;
      track.playlist.rippleShift(regionEnd, -regionLength);
    }
  }
  async undo() {
    if (!this.removedRegion) return;
    const track = this.session.getTrack(this.trackId);
    if (track) {
      if (this.rippleApplied) {
        track.playlist.getRegions().forEach((r) => {
          const oldStart = this.oldRegionStarts.get(r.id);
          if (oldStart !== void 0) {
            r.move(oldStart);
          }
        });
      }
      track.playlist.addRegion(this.removedRegion);
    }
  }
  async redo() {
    this.rippleApplied = false;
    this.oldRegionStarts.clear();
    await this.execute();
  }
};

// core/src/commands/impl/MoveRegionCommand.ts
var MoveRegionCommand = class {
  constructor(session, trackId, regionId, newStart, targetTrackId) {
    this.oldStart = null;
    this.oldFades = /* @__PURE__ */ new Map();
    this.targetTrackOldFades = /* @__PURE__ */ new Map();
    this.rippleApplied = false;
    this.oldRegionStarts = /* @__PURE__ */ new Map();
    this.isCrossTrack = false;
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.targetTrackId = targetTrackId || trackId;
    this.regionId = regionId;
    this.newStart = newStart;
    this.isCrossTrack = this.targetTrackId !== this.trackId;
  }
  async execute() {
    const sourceTrack = this.session.getTrack(this.trackId);
    if (!sourceTrack) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    const region = sourceTrack.playlist.getRegion(this.regionId);
    if (!region) {
      throw new Error(`Region ${this.regionId} not found`);
    }
    this.oldStart = region.start;
    if (this.isCrossTrack) {
      const targetTrack = this.session.getTrack(this.targetTrackId);
      if (!targetTrack) {
        throw new Error(`Target track ${this.targetTrackId} not found`);
      }
      sourceTrack.playlist.getRegions().forEach((r) => {
        this.oldFades.set(r.id, { fadeIn: r.fadeIn, fadeOut: r.fadeOut });
      });
      targetTrack.playlist.getRegions().forEach((r) => {
        this.targetTrackOldFades.set(r.id, {
          fadeIn: r.fadeIn,
          fadeOut: r.fadeOut
        });
      });
      sourceTrack.playlist.removeRegion(this.regionId);
      region.move(this.newStart);
      targetTrack.playlist.addRegion(region);
      CrossfadeEngine.calculateCrossfades([
        ...sourceTrack.playlist.getRegions()
      ]);
      CrossfadeEngine.calculateCrossfades([
        ...targetTrack.playlist.getRegions()
      ]);
    } else {
      sourceTrack.playlist.getRegions().forEach((r) => {
        this.oldRegionStarts.set(r.id, r.start);
      });
      sourceTrack.playlist.getRegions().forEach((r) => {
        this.oldFades.set(r.id, { fadeIn: r.fadeIn, fadeOut: r.fadeOut });
      });
      sourceTrack.playlist.removeRegion(this.regionId);
      if (this.session.rippleEdit) {
        this.rippleApplied = true;
        const delta = this.newStart - this.oldStart;
        if (delta > 0) {
          sourceTrack.playlist.rippleShift(this.newStart, delta);
        } else if (delta < 0) {
          sourceTrack.playlist.rippleShift(
            this.oldStart + region.length,
            delta
          );
        }
      }
      region.move(this.newStart);
      sourceTrack.playlist.addRegion(region);
      CrossfadeEngine.calculateCrossfades([
        ...sourceTrack.playlist.getRegions()
      ]);
    }
  }
  async undo() {
    if (this.oldStart === null) return;
    if (this.isCrossTrack) {
      const targetTrack = this.session.getTrack(this.targetTrackId);
      const sourceTrack = this.session.getTrack(this.trackId);
      if (!targetTrack || !sourceTrack) return;
      const region = targetTrack.playlist.getRegion(this.regionId);
      if (!region) return;
      targetTrack.playlist.removeRegion(this.regionId);
      region.move(this.oldStart);
      sourceTrack.playlist.addRegion(region);
      this.oldFades.forEach((fades, id) => {
        const r = sourceTrack.playlist.getRegion(id);
        if (r) {
          r.fadeIn = fades.fadeIn;
          r.fadeOut = fades.fadeOut;
        }
      });
      this.targetTrackOldFades.forEach((fades, id) => {
        const r = targetTrack.playlist.getRegion(id);
        if (r) {
          r.fadeIn = fades.fadeIn;
          r.fadeOut = fades.fadeOut;
        }
      });
    } else {
      const track = this.session.getTrack(this.trackId);
      if (track) {
        const region = track.playlist.getRegion(this.regionId);
        if (region) {
          if (this.rippleApplied) {
            track.playlist.getRegions().forEach((r) => {
              const oldStart = this.oldRegionStarts.get(r.id);
              if (oldStart !== void 0 && r.id !== this.regionId) {
                r.move(oldStart);
                track.playlist.regionChanged.emit(r);
              }
            });
          }
          track.playlist.removeRegion(this.regionId);
          region.move(this.oldStart);
          this.oldFades.forEach((fades, id) => {
            const r = track.playlist.getRegion(id);
            if (r) {
              r.fadeIn = fades.fadeIn;
              r.fadeOut = fades.fadeOut;
            }
          });
          track.playlist.addRegion(region);
        }
      }
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/ResizeRegionCommand.ts
var ResizeRegionCommand = class {
  constructor(session, trackId, regionId, newLength) {
    this.oldLength = null;
    this.rippleApplied = false;
    this.oldRegionStarts = /* @__PURE__ */ new Map();
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.regionId = regionId;
    this.newLength = newLength;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    const region = track.playlist.getRegion(this.regionId);
    if (!region) {
      throw new Error(`Region ${this.regionId} not found`);
    }
    this.oldLength = region.length;
    const oldEnd = region.end;
    track.playlist.getRegions().forEach((r) => {
      this.oldRegionStarts.set(r.id, r.start);
    });
    track.playlist.removeRegion(this.regionId);
    region.resize(this.newLength);
    if (this.session.rippleEdit) {
      this.rippleApplied = true;
      const delta = this.newLength - this.oldLength;
      track.playlist.rippleShift(oldEnd, delta);
    }
    track.playlist.addRegion(region);
  }
  async undo() {
    if (this.oldLength === null) return;
    const track = this.session.getTrack(this.trackId);
    if (track) {
      const region = track.playlist.getRegion(this.regionId);
      if (region) {
        track.playlist.removeRegion(this.regionId);
        if (this.rippleApplied) {
          track.playlist.getRegions().forEach((r) => {
            const oldStart = this.oldRegionStarts.get(r.id);
            if (oldStart !== void 0) {
              r.move(oldStart);
            }
          });
        }
        region.resize(this.oldLength);
        track.playlist.addRegion(region);
      }
    }
  }
  async redo() {
    this.rippleApplied = false;
    this.oldRegionStarts.clear();
    await this.execute();
  }
};

// core/src/commands/impl/CopyRegionCommand.ts
init_Logger();
var CopyRegionCommand = class {
  constructor() {
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    const selectedIds = Array.from(session.getSelectedRegionIds());
    if (selectedIds.length === 0) {
      logger.debug("CopyRegionCommand", "No regions selected");
      return;
    }
    const regions = [];
    const trackIds = [];
    for (const regionId of selectedIds) {
      for (const track of session.tracks) {
        const region = track.playlist.getRegion(regionId);
        if (region) {
          regions.push(region);
          trackIds.push(track.id);
          break;
        }
      }
    }
    if (regions.length === 0) {
      logger.debug("CopyRegionCommand", "No valid regions found");
      return;
    }
    const clipboard = RegionClipboard.getInstance();
    clipboard.copy(regions, trackIds);
    logger.debug(
      "CopyRegionCommand",
      `Copied ${regions.length} region(s) to clipboard`
    );
  }
};

// core/src/commands/impl/PasteRegionCommand.ts
init_Logger();
var PasteRegionCommand = class {
  constructor(targetTrackId, pastePosition) {
    this.addedRegionCommands = [];
    this.targetTrackId = targetTrackId;
    this.pastePosition = pastePosition;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    const clipboard = RegionClipboard.getInstance();
    if (clipboard.isEmpty()) {
      logger.debug("PasteRegionCommand", "Clipboard is empty");
      return;
    }
    const clipboardData = clipboard.getClipboardData();
    const basePosition = this.pastePosition ?? session.transportFrame;
    const minOriginalStart = Math.min(
      ...clipboardData.map((data) => data.start)
    );
    for (const data of clipboardData) {
      let targetTrack = this.targetTrackId ? session.getTrack(this.targetTrackId) : session.getTrack(data.originalTrackId);
      if (!targetTrack && session.tracks.length > 0) {
        targetTrack = session.tracks[0];
      }
      if (!targetTrack) {
        logger.warn("PasteRegionCommand", "No target track found");
        continue;
      }
      const relativeOffset = data.start - minOriginalStart;
      const newStart = basePosition + relativeOffset;
      const addCmd = new AddRegionCommand(
        session,
        targetTrack.id,
        data.sourceId,
        newStart,
        data.length,
        data.start
        // sourceStart
      );
      await addCmd.execute();
      this.addedRegionCommands.push(addCmd);
    }
    logger.debug(
      "PasteRegionCommand",
      `Pasted ${clipboardData.length} region(s) at frame ${basePosition}`
    );
  }
  async undo() {
    for (let i = this.addedRegionCommands.length - 1; i >= 0; i--) {
      await this.addedRegionCommands[i].undo();
    }
    this.addedRegionCommands = [];
    logger.debug("PasteRegionCommand", "Undo paste");
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/DuplicateRegionCommand.ts
init_Logger();
var DuplicateRegionCommand = class {
  constructor() {
    this.addedRegionCommands = [];
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    const selectedIds = Array.from(session.getSelectedRegionIds());
    if (selectedIds.length === 0) {
      logger.debug("DuplicateRegionCommand", "No regions selected");
      return;
    }
    for (const regionId of selectedIds) {
      for (const track of session.tracks) {
        const region = track.playlist.getRegion(regionId);
        if (region) {
          const duplicateStart = region.end;
          const addCmd = new AddRegionCommand(
            session,
            track.id,
            region.sourceId,
            duplicateStart,
            region.length,
            region.sourceStart
          );
          await addCmd.execute();
          this.addedRegionCommands.push(addCmd);
          break;
        }
      }
    }
    logger.debug(
      "DuplicateRegionCommand",
      `Duplicated ${selectedIds.length} region(s)`
    );
  }
  async undo() {
    for (let i = this.addedRegionCommands.length - 1; i >= 0; i--) {
      await this.addedRegionCommands[i].undo();
    }
    this.addedRegionCommands = [];
    logger.debug("DuplicateRegionCommand", "Undo duplicate");
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/SplitRegionCommand.ts
init_Logger();
var SplitRegionCommand = class {
  constructor(trackId, regionId, splitPosition) {
    this.trackId = trackId;
    this.regionId = regionId;
    this.splitPosition = splitPosition;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    const track = session.getTrack(this.trackId);
    if (!track) {
      throw new TrackNotFoundError(this.trackId);
    }
    const region = track.playlist.getRegion(this.regionId);
    if (!region) {
      throw new RegionNotFoundError(this.regionId);
    }
    if (this.splitPosition <= region.start || this.splitPosition >= region.end) {
      throw new RegionOutOfBoundsError(
        this.regionId,
        this.splitPosition,
        region.start,
        region.end
      );
    }
    this.originalRegionData = {
      sourceId: region.sourceId,
      start: region.start,
      length: region.length,
      sourceStart: region.sourceStart,
      name: region.name
    };
    this.removeOriginalCmd = new RemoveRegionCommand(
      session,
      this.trackId,
      this.regionId
    );
    await this.removeOriginalCmd.execute();
    const leftLength = this.splitPosition - region.start;
    this.addLeftCmd = new AddRegionCommand(
      session,
      this.trackId,
      region.sourceId,
      region.start,
      leftLength,
      region.sourceStart
    );
    await this.addLeftCmd.execute();
    const rightLength = region.end - this.splitPosition;
    const rightSourceStart = region.sourceStart + leftLength;
    this.addRightCmd = new AddRegionCommand(
      session,
      this.trackId,
      region.sourceId,
      this.splitPosition,
      rightLength,
      rightSourceStart
    );
    try {
      await this.addRightCmd.execute();
    } catch (err) {
      await this.addLeftCmd.undo();
      await this.removeOriginalCmd.undo();
      throw err;
    }
    logger.debug(
      "SplitRegionCommand",
      `Split region ${this.regionId} at frame ${this.splitPosition}`
    );
  }
  async undo() {
    if (!this.addLeftCmd || !this.addRightCmd || !this.removeOriginalCmd) {
      throw new Error("Cannot undo: commands not initialized");
    }
    await this.addRightCmd.undo();
    await this.addLeftCmd.undo();
    await this.removeOriginalCmd.undo();
    logger.debug("SplitRegionCommand", "Undo split");
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/SplitAtPlayheadCommand.ts
init_Logger();
var SplitAtPlayheadCommand = class {
  constructor() {
    this.splitCommands = [];
    this.skippedRegions = [];
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    const selectedRegionIds = session.getSelectedRegionIds();
    const playheadPosition = session.transportFrame;
    if (selectedRegionIds.size === 0) {
      throw new NoSelectionError();
    }
    this.splitCommands = [];
    this.skippedRegions = [];
    for (const regionId of selectedRegionIds) {
      let trackId = null;
      let region = null;
      for (const track of session.tracks) {
        const r = track.playlist.getRegion(regionId);
        if (r) {
          trackId = track.id;
          region = r;
          break;
        }
      }
      if (!trackId || !region) {
        this.skippedRegions.push({
          regionId,
          reason: "Track not found"
        });
        continue;
      }
      if (playheadPosition <= region.start || playheadPosition >= region.end) {
        this.skippedRegions.push({
          regionId,
          reason: `Playhead (${playheadPosition}) is outside region bounds (${region.start}-${region.end})`
        });
        continue;
      }
      try {
        const splitCmd = new SplitRegionCommand(
          trackId,
          regionId,
          playheadPosition
        );
        await splitCmd.execute();
        this.splitCommands.push(splitCmd);
      } catch (error) {
        this.skippedRegions.push({
          regionId,
          reason: error.message
        });
      }
    }
    if (this.splitCommands.length === 0) {
      throw new Error(
        `No regions could be split. ${this.skippedRegions.length} skipped. Tip: Move the playhead inside the region before splitting.`
      );
    }
    logger.debug(
      "SplitAtPlayheadCommand",
      `Split ${this.splitCommands.length} region(s), skipped ${this.skippedRegions.length}`
    );
  }
  async undo() {
    for (let i = this.splitCommands.length - 1; i >= 0; i--) {
      await this.splitCommands[i].undo();
    }
    logger.debug("SplitAtPlayheadCommand", "Undo split at playhead");
  }
  async redo() {
    for (const splitCmd of this.splitCommands) {
      await splitCmd.redo();
    }
    logger.debug("SplitAtPlayheadCommand", "Redo split at playhead");
  }
  /**
   * 실행 결과 요약 반환 (Console에서 사용)
   */
  getSummary() {
    return {
      successCount: this.splitCommands.length,
      skippedCount: this.skippedRegions.length,
      skippedDetails: this.skippedRegions
    };
  }
};

// core/src/commands/impl/SetRegionTimeDomainCommand.ts
init_Logger();
var SetRegionTimeDomainCommand = class {
  // Definite assignment assertion
  constructor(session, trackId, regionId, newTimeDomain) {
    this.session = session;
    this.trackId = trackId;
    this.regionId = regionId;
    this.newTimeDomain = newTimeDomain;
  }
  async execute() {
    logger.debug(
      "SetRegionTimeDomainCommand",
      `Executing: trackId=${this.trackId}, regionId=${this.regionId}, newTimeDomain=${this.newTimeDomain}`
    );
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    const region = track.playlist.getRegion(this.regionId);
    if (!region) throw new Error(`Region ${this.regionId} not found`);
    logger.debug(
      "SetRegionTimeDomainCommand",
      `Found region "${region.name}", current timeDomain=${region.timeDomain}`
    );
    this.previousTimeDomain = region.timeDomain;
    region.timeDomain = this.newTimeDomain;
    logger.debug(
      "SetRegionTimeDomainCommand",
      `Updated region timeDomain to ${this.newTimeDomain}`
    );
    this.updateBackend(region);
  }
  async undo() {
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const region = track.playlist.getRegion(this.regionId);
    if (!region) return;
    region.timeDomain = this.previousTimeDomain;
    this.updateBackend(region);
  }
  async redo() {
    await this.execute();
  }
  updateBackend(_region) {
    const audioEngine = AudioEngine.getInstance();
    audioEngine.updateRegion(this.trackId, _region);
  }
};

// core/src/commands/impl/TrimRegionCommand.ts
var TrimRegionCommand = class {
  constructor(session, trackId, regionId, amount, direction, noOverlap = false) {
    this.oldStart = null;
    this.oldLength = null;
    this.oldSourceStart = null;
    this.oldFadeIn = null;
    this.oldFadeOut = null;
    this.oldFades = /* @__PURE__ */ new Map();
    this.rippleApplied = false;
    this.oldRegionStarts = /* @__PURE__ */ new Map();
    this.adjacentTrimmed = null;
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.regionId = regionId;
    this.amount = amount;
    this.direction = direction;
    this.noOverlap = noOverlap;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    const region = track.playlist.getRegion(this.regionId);
    if (!region) throw new Error(`Region ${this.regionId} not found`);
    if (region.locked) {
      throw new Error(`Region ${this.regionId} is locked`);
    }
    this.oldStart = region.start;
    this.oldLength = region.length;
    this.oldSourceStart = region.sourceStart;
    this.oldFadeIn = region.fadeIn;
    this.oldFadeOut = region.fadeOut;
    track.playlist.getRegions().forEach((r) => {
      this.oldFades.set(r.id, { fadeIn: r.fadeIn, fadeOut: r.fadeOut });
      this.oldRegionStarts.set(r.id, r.start);
    });
    const oldEnd = region.end;
    const source = this.session.getSource(region.sourceId);
    const sourceDuration = source?.duration;
    let clampedAmount = this.amount;
    if (this.direction === "front") {
      if (region.sourceStart + clampedAmount < 0) {
        clampedAmount = -region.sourceStart;
      }
      if (clampedAmount >= region.length) {
        return;
      }
      if (sourceDuration !== void 0) {
        const newSourceStart = region.sourceStart + clampedAmount;
        const newLength = region.length - clampedAmount;
        if (newSourceStart + newLength > sourceDuration) {
          return;
        }
      }
    } else {
      if (region.length + clampedAmount < 1) {
        return;
      }
      if (sourceDuration !== void 0) {
        const newLength = region.length + clampedAmount;
        if (region.sourceStart + newLength > sourceDuration) {
          clampedAmount = sourceDuration - region.sourceStart - region.length;
          if (clampedAmount <= 0) return;
        }
      }
    }
    if (clampedAmount === 0) return;
    track.playlist.removeRegion(this.regionId);
    if (this.direction === "front") {
      region.trimFront(clampedAmount);
    } else {
      region.trimBack(clampedAmount);
    }
    if (this.noOverlap) {
      const regions = track.playlist.getRegions().filter((r) => r.layer === region.layer).sort((a, b) => a.start - b.start);
      if (this.direction === "front" && clampedAmount < 0) {
        const prev = [...regions].reverse().find((r) => r.end > region.start && r.start < region.start);
        if (prev) {
          this.adjacentTrimmed = {
            regionId: prev.id,
            oldStart: prev.start,
            oldLength: prev.length,
            oldSourceStart: prev.sourceStart
          };
          prev.trimEndTo(region.start, sourceDuration);
        }
      } else if (this.direction === "back" && clampedAmount > 0) {
        const next = regions.find(
          (r) => r.start < region.end && r.start > region.start
        );
        if (next) {
          this.adjacentTrimmed = {
            regionId: next.id,
            oldStart: next.start,
            oldLength: next.length,
            oldSourceStart: next.sourceStart
          };
          const nextSource = this.session.getSource(next.sourceId);
          next.trimFrontTo(region.end, nextSource?.duration);
        }
      }
    }
    if (this.session.rippleEdit) {
      this.rippleApplied = true;
      const delta = region.length - this.oldLength;
      if (this.direction === "back") {
        track.playlist.rippleShift(oldEnd, delta);
      }
    }
    track.playlist.addRegion(region);
    CrossfadeEngine.calculateCrossfades([...track.playlist.getRegions()]);
  }
  async undo() {
    if (this.oldStart === null || this.oldLength === null || this.oldSourceStart === null)
      return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const region = track.playlist.getRegion(this.regionId);
    if (!region) return;
    track.playlist.removeRegion(this.regionId);
    if (this.adjacentTrimmed) {
      const adj = track.playlist.getRegion(this.adjacentTrimmed.regionId);
      if (adj) {
        adj.start = this.adjacentTrimmed.oldStart;
        adj.length = this.adjacentTrimmed.oldLength;
        adj.sourceStart = this.adjacentTrimmed.oldSourceStart;
      }
    }
    if (this.rippleApplied) {
      track.playlist.getRegions().forEach((r) => {
        const oldStart = this.oldRegionStarts.get(r.id);
        if (oldStart !== void 0) {
          r.move(oldStart);
        }
      });
    }
    region.start = this.oldStart;
    region.length = this.oldLength;
    region.sourceStart = this.oldSourceStart;
    if (this.oldFadeIn !== null) region.fadeIn = this.oldFadeIn;
    if (this.oldFadeOut !== null) region.fadeOut = this.oldFadeOut;
    this.oldFades.forEach((fades, id) => {
      const r = track.playlist.getRegion(id);
      if (r) {
        r.fadeIn = fades.fadeIn;
        r.fadeOut = fades.fadeOut;
      }
    });
    track.playlist.addRegion(region);
    CrossfadeEngine.calculateCrossfades([...track.playlist.getRegions()]);
  }
  async redo() {
    this.rippleApplied = false;
    this.adjacentTrimmed = null;
    this.oldRegionStarts.clear();
    this.oldFades.clear();
    await this.execute();
  }
};

// core/src/commands/impl/TrimRegionToPlayheadCommand.ts
var TrimRegionToPlayheadCommand = class {
  constructor(session, trackId, regionId, direction) {
    this.oldStart = null;
    this.oldLength = null;
    this.oldSourceStart = null;
    this.oldFadeIn = null;
    this.oldFadeOut = null;
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.regionId = regionId;
    this.direction = direction;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    const region = track.playlist.getRegion(this.regionId);
    if (!region) throw new Error(`Region ${this.regionId} not found`);
    const playhead = this.session.transportFrame;
    if (playhead <= region.start || playhead >= region.end) return;
    this.oldStart = region.start;
    this.oldLength = region.length;
    this.oldSourceStart = region.sourceStart;
    this.oldFadeIn = region.fadeIn;
    this.oldFadeOut = region.fadeOut;
    const source = this.session.getSource(region.sourceId);
    const sourceDuration = source?.duration;
    if (this.direction === "front") {
      region.trimFrontTo(playhead, sourceDuration);
    } else {
      region.trimEndTo(playhead, sourceDuration);
    }
  }
  async undo() {
    if (this.oldStart === null || this.oldLength === null || this.oldSourceStart === null)
      return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const region = track.playlist.getRegion(this.regionId);
    if (!region) return;
    region.start = this.oldStart;
    region.length = this.oldLength;
    region.sourceStart = this.oldSourceStart;
    if (this.oldFadeIn !== null) region.fadeIn = this.oldFadeIn;
    if (this.oldFadeOut !== null) region.fadeOut = this.oldFadeOut;
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/TrimRegionToRangeCommand.ts
var TrimRegionToRangeCommand = class {
  constructor(session, trackId, regionId, rangeStart, rangeEnd) {
    this.oldStart = null;
    this.oldLength = null;
    this.oldSourceStart = null;
    this.oldFadeIn = null;
    this.oldFadeOut = null;
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.regionId = regionId;
    this.rangeStart = rangeStart;
    this.rangeEnd = rangeEnd;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    const region = track.playlist.getRegion(this.regionId);
    if (!region) throw new Error(`Region ${this.regionId} not found`);
    if (region.end <= this.rangeStart || region.start >= this.rangeEnd) return;
    this.oldStart = region.start;
    this.oldLength = region.length;
    this.oldSourceStart = region.sourceStart;
    this.oldFadeIn = region.fadeIn;
    this.oldFadeOut = region.fadeOut;
    const source = this.session.getSource(region.sourceId);
    const sourceDuration = source?.duration;
    const newPosition = Math.max(region.start, this.rangeStart);
    const newEnd = Math.min(region.end, this.rangeEnd);
    const newLength = newEnd - newPosition;
    if (newLength <= 0) return;
    region.trimTo(newPosition, newLength, sourceDuration);
  }
  async undo() {
    if (this.oldStart === null || this.oldLength === null || this.oldSourceStart === null)
      return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const region = track.playlist.getRegion(this.regionId);
    if (!region) return;
    region.start = this.oldStart;
    region.length = this.oldLength;
    region.sourceStart = this.oldSourceStart;
    if (this.oldFadeIn !== null) region.fadeIn = this.oldFadeIn;
    if (this.oldFadeOut !== null) region.fadeOut = this.oldFadeOut;
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/TrimToAdjacentRegionCommand.ts
var TrimToAdjacentRegionCommand = class {
  constructor(session, trackId, regionId, direction) {
    this.oldStart = null;
    this.oldLength = null;
    this.oldSourceStart = null;
    this.oldFadeIn = null;
    this.oldFadeOut = null;
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.regionId = regionId;
    this.direction = direction;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    const region = track.playlist.getRegion(this.regionId);
    if (!region) throw new Error(`Region ${this.regionId} not found`);
    const regions = track.playlist.getRegions().filter((r) => r.id !== this.regionId && r.layer === region.layer).sort((a, b) => a.start - b.start);
    this.oldStart = region.start;
    this.oldLength = region.length;
    this.oldSourceStart = region.sourceStart;
    this.oldFadeIn = region.fadeIn;
    this.oldFadeOut = region.fadeOut;
    const source = this.session.getSource(region.sourceId);
    const sourceDuration = source?.duration;
    if (this.direction === "forward") {
      const next = regions.find((r) => r.start > region.start);
      if (!next) return;
      region.trimEndTo(next.start, sourceDuration);
    } else {
      const prev = [...regions].reverse().find((r) => r.end <= region.end && r.start < region.start);
      if (!prev) return;
      region.trimFrontTo(prev.end, sourceDuration);
    }
  }
  async undo() {
    if (this.oldStart === null || this.oldLength === null || this.oldSourceStart === null)
      return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const region = track.playlist.getRegion(this.regionId);
    if (!region) return;
    region.start = this.oldStart;
    region.length = this.oldLength;
    region.sourceStart = this.oldSourceStart;
    if (this.oldFadeIn !== null) region.fadeIn = this.oldFadeIn;
    if (this.oldFadeOut !== null) region.fadeOut = this.oldFadeOut;
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/SetRegionFadesCommand.ts
var SetRegionFadesCommand = class {
  constructor(session, trackId, regionId, fadeIn, fadeOut) {
    this.oldFadeIn = 0;
    this.oldFadeOut = 0;
    this.session = session;
    this.trackId = trackId;
    this.regionId = regionId;
    this.newFadeIn = fadeIn;
    this.newFadeOut = fadeOut;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    const region = track.playlist.getRegion(this.regionId);
    if (!region) throw new Error(`Region ${this.regionId} not found`);
    this.oldFadeIn = region.fadeIn;
    this.oldFadeOut = region.fadeOut;
    track.playlist.removeRegion(this.regionId);
    if (this.newFadeIn !== void 0) {
      region.setFadeIn(this.newFadeIn);
    }
    if (this.newFadeOut !== void 0) {
      region.setFadeOut(this.newFadeOut);
    }
    track.playlist.addRegion(region);
  }
  async undo() {
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const region = track.playlist.getRegion(this.regionId);
    if (!region) return;
    track.playlist.removeRegion(this.regionId);
    region.fadeIn = this.oldFadeIn;
    region.fadeOut = this.oldFadeOut;
    track.playlist.addRegion(region);
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/MergeRegionsCommand.ts
init_Region();
var MergeRegionsCommand = class {
  constructor(session, audioEngine, trackId, regionIds) {
    this.newRegion = null;
    this.oldRegions = [];
    this.newSource = null;
    this.id = crypto.randomUUID();
    this.session = session;
    this.audioEngine = audioEngine;
    this.trackId = trackId;
    this.regionIds = regionIds;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    if (this.regionIds.length < 2) {
      throw new Error(`Merge requires at least 2 regions`);
    }
    this.oldRegions = this.regionIds.map((id) => track.playlist.getRegion(id)).filter((r) => r !== void 0);
    if (this.oldRegions.length !== this.regionIds.length) {
      throw new Error(`Some regions to merge were not found`);
    }
    const audioBuffer = await this.audioEngine.renderRegionsToBuffer(
      this.trackId,
      this.regionIds
    );
    const blob = AudioBufferToWav.encode(audioBuffer, "float32");
    const url = URL.createObjectURL(blob);
    let minStart = Infinity;
    for (const r of this.oldRegions) {
      if (r.start < minStart) minStart = r.start;
    }
    const durationFrames = audioBuffer.length;
    this.newSource = new Source(
      crypto.randomUUID(),
      `Merged Source ${this.id.slice(0, 4)}`,
      url,
      durationFrames,
      audioBuffer.sampleRate,
      audioBuffer.numberOfChannels
    );
    await this.session.addSource(this.newSource);
    for (const id of this.regionIds) {
      track.playlist.removeRegion(id);
    }
    this.newRegion = new Region(
      crypto.randomUUID(),
      this.newSource.id,
      minStart,
      durationFrames,
      0,
      "Merged Region"
    );
    track.playlist.addRegion(this.newRegion);
    const backend = this.audioEngine.backend;
    if (backend && backend.cacheBlob) {
      await backend.cacheBlob(url, blob);
      backend.scheduleRegion(this.trackId, {
        ...this.newRegion,
        end: this.newRegion.start + this.newRegion.length,
        timeDomain: this.newRegion.timeDomain
      });
    }
  }
  async undo() {
    const track = this.session.getTrack(this.trackId);
    if (!track || !this.newRegion) return;
    track.playlist.removeRegion(this.newRegion.id);
    for (const old of this.oldRegions) {
      track.playlist.addRegion(old);
    }
  }
  async redo() {
    const track = this.session.getTrack(this.trackId);
    if (!track || !this.newRegion) return;
    for (const id of this.regionIds) {
      track.playlist.removeRegion(id);
    }
    track.playlist.addRegion(this.newRegion);
  }
};

// core/src/commands/impl/LockRegionCommand.ts
var LockRegionCommand = class {
  constructor(session, trackId, regionId, locked) {
    this.previousLocked = null;
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.regionId = regionId;
    this.locked = locked;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    const region = track.playlist.getRegion(this.regionId);
    if (!region) {
      throw new Error(`Region ${this.regionId} not found`);
    }
    this.previousLocked = region.locked;
    region.setLocked(this.locked);
  }
  async undo() {
    if (this.previousLocked === null) return;
    const track = this.session.getTrack(this.trackId);
    if (track) {
      const region = track.playlist.getRegion(this.regionId);
      if (region) {
        region.setLocked(this.previousLocked);
      }
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/GroupRegionsCommand.ts
var GroupRegionsCommand = class {
  constructor(session, regionIds, name) {
    this.createdGroupId = null;
    this.id = crypto.randomUUID();
    this.session = session;
    this.regionIds = regionIds;
    this.name = name;
  }
  async execute() {
    if (this.regionIds.length < 2) {
      throw new Error("Need at least 2 regions to create a group");
    }
    this.createdGroupId = this.session.groupRegions(this.regionIds, this.name);
  }
  getGroupId() {
    return this.createdGroupId;
  }
  async undo() {
    if (this.createdGroupId) {
      this.session.ungroupRegions(this.createdGroupId);
      this.createdGroupId = null;
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/UngroupRegionsCommand.ts
var UngroupRegionsCommand = class {
  constructor(session, groupId) {
    this.savedRegionIds = [];
    this.savedName = "";
    this.id = crypto.randomUUID();
    this.session = session;
    this.groupId = groupId;
  }
  async execute() {
    const group = this.session.getRegionGroup(this.groupId);
    if (!group) {
      throw new Error(`Region group ${this.groupId} not found`);
    }
    this.savedRegionIds = group.getRegionIds();
    this.savedName = group.name;
    this.session.ungroupRegions(this.groupId);
  }
  async undo() {
    if (this.savedRegionIds.length > 0) {
      this.session.groupRegions(
        this.savedRegionIds,
        this.savedName,
        this.groupId
      );
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/StripSilenceCommand.ts
init_Region();
var StripSilenceCommand = class {
  constructor(session, audioEngine, trackId, regionId, thresholdDb = -60, minLengthFrames = 4410) {
    // Saved state for undo
    this.originalRegion = null;
    this.newRegions = [];
    this.id = crypto.randomUUID();
    this.session = session;
    this.audioEngine = audioEngine;
    this.trackId = trackId;
    this.regionId = regionId;
    this.thresholdDb = thresholdDb;
    this.minLengthFrames = minLengthFrames;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    const region = track.playlist.getRegion(this.regionId);
    if (!region) {
      throw new Error(`Region ${this.regionId} not found`);
    }
    this.originalRegion = region;
    const segments = await this.audioEngine.stripSilence(
      this.trackId,
      this.regionId,
      this.thresholdDb,
      this.minLengthFrames
    );
    if (segments.length === 0) {
      track.playlist.removeRegion(this.regionId);
      return;
    }
    track.playlist.removeRegion(this.regionId);
    this.newRegions = segments.map((seg, index) => {
      const newRegion = new Region(
        crypto.randomUUID(),
        region.sourceId,
        region.start + seg.start,
        // Timeline position offset by segment start
        seg.length,
        // Length of the non-silent segment
        region.sourceStart + seg.start,
        // Source offset
        `${region.name} (${index + 1})`,
        region.layer
      );
      newRegion.gain = region.gain;
      newRegion.muted = region.muted;
      newRegion.playbackRate = region.playbackRate;
      newRegion.stretch = region.stretch;
      newRegion.pitchSemitones = region.pitchSemitones;
      newRegion.timeDomain = region.timeDomain;
      return newRegion;
    });
    for (const r of this.newRegions) {
      track.playlist.addRegion(r);
    }
  }
  async undo() {
    const track = this.session.getTrack(this.trackId);
    if (!track || !this.originalRegion) return;
    for (const r of this.newRegions) {
      track.playlist.removeRegion(r.id);
    }
    track.playlist.addRegion(this.originalRegion);
  }
  async redo() {
    const track = this.session.getTrack(this.trackId);
    if (!track || !this.originalRegion) return;
    track.playlist.removeRegion(this.originalRegion.id);
    for (const r of this.newRegions) {
      track.playlist.addRegion(r);
    }
  }
};

// core/src/commands/impl/NormalizeRegionCommand.ts
var NormalizeRegionCommand = class {
  constructor(session, audioEngine, trackId, regionId, targetDb = 0) {
    // Saved state for undo
    this.previousGain = null;
    this.newGain = 1;
    this.id = crypto.randomUUID();
    this.session = session;
    this.audioEngine = audioEngine;
    this.trackId = trackId;
    this.regionId = regionId;
    this.targetDb = targetDb;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    const region = track.playlist.getRegion(this.regionId);
    if (!region) {
      throw new Error(`Region ${this.regionId} not found`);
    }
    this.previousGain = region.gain;
    const gainNeeded = await this.audioEngine.normalizeRegion(
      this.trackId,
      this.regionId,
      this.targetDb
    );
    this.newGain = region.gain * gainNeeded;
    region.gain = this.newGain;
    track.playlist.regionChanged.emit(region);
  }
  async undo() {
    if (this.previousGain === null) return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const region = track.playlist.getRegion(this.regionId);
    if (!region) return;
    region.gain = this.previousGain;
    track.playlist.regionChanged.emit(region);
  }
  async redo() {
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const region = track.playlist.getRegion(this.regionId);
    if (!region) return;
    region.gain = this.newGain;
    track.playlist.regionChanged.emit(region);
  }
};

// core/src/commands/impl/SetRegionPlaybackRateCommand.ts
var SetRegionPlaybackRateCommand = class {
  constructor(session, audioEngine, trackId, regionId, playbackRate) {
    this.previousPlaybackRate = null;
    this.id = crypto.randomUUID();
    this.session = session;
    this.audioEngine = audioEngine;
    this.trackId = trackId;
    this.regionId = regionId;
    this.playbackRate = playbackRate;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    const region = track.playlist.getRegion(this.regionId);
    if (!region) {
      throw new Error(`Region ${this.regionId} not found`);
    }
    this.previousPlaybackRate = region.playbackRate;
    region.playbackRate = this.playbackRate;
    this.audioEngine.updateRegion(this.trackId, region);
  }
  async undo() {
    if (this.previousPlaybackRate === null) return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const region = track.playlist.getRegion(this.regionId);
    if (!region) return;
    region.playbackRate = this.previousPlaybackRate;
    this.audioEngine.updateRegion(this.trackId, region);
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/TimeStretchRegionCommand.ts
var TimeStretchRegionCommand = class {
  constructor(session, audioEngine, trackId, regionId, stretch, pitchSemitones) {
    this.previousStretch = null;
    this.previousPitchSemitones = null;
    this.id = crypto.randomUUID();
    this.session = session;
    this.audioEngine = audioEngine;
    this.trackId = trackId;
    this.regionId = regionId;
    this.stretch = stretch;
    this.pitchSemitones = pitchSemitones;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    const region = track.playlist.getRegion(this.regionId);
    if (!region) {
      throw new Error(`Region ${this.regionId} not found`);
    }
    this.previousStretch = region.stretch;
    this.previousPitchSemitones = region.pitchSemitones;
    region.stretch = this.stretch;
    region.pitchSemitones = this.pitchSemitones;
    this.audioEngine.updateRegion(this.trackId, region);
  }
  async undo() {
    if (this.previousStretch === null) return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const region = track.playlist.getRegion(this.regionId);
    if (!region) return;
    region.stretch = this.previousStretch;
    region.pitchSemitones = this.previousPitchSemitones ?? 0;
    this.audioEngine.updateRegion(this.trackId, region);
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/ReverseRegionCommand.ts
var ReverseRegionCommand = class {
  constructor(session, audioEngine, trackId, regionId) {
    this.id = crypto.randomUUID();
    this.session = session;
    this.audioEngine = audioEngine;
    this.trackId = trackId;
    this.regionId = regionId;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    const region = track.playlist.getRegion(this.regionId);
    if (!region) {
      throw new Error(`Region ${this.regionId} not found`);
    }
    await this.audioEngine.reverseRegionBuffer(this.trackId, this.regionId);
    track.playlist.regionChanged.emit(region);
  }
  async undo() {
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const region = track.playlist.getRegion(this.regionId);
    if (!region) return;
    await this.audioEngine.reverseRegionBuffer(this.trackId, this.regionId);
    track.playlist.regionChanged.emit(region);
  }
  async redo() {
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const region = track.playlist.getRegion(this.regionId);
    if (!region) return;
    await this.audioEngine.reverseRegionBuffer(this.trackId, this.regionId);
    track.playlist.regionChanged.emit(region);
  }
};

// core/src/commands/impl/BatchMoveRegionsCommand.ts
var BatchMoveRegionsCommand = class {
  constructor(session, entries) {
    this.session = session;
    this.entries = entries;
    this.subCommands = [];
  }
  async execute() {
    this.subCommands = this.entries.map(
      (e) => new MoveRegionCommand(
        this.session,
        e.trackId,
        e.regionId,
        e.newStart,
        e.targetTrackId
      )
    );
    for (const cmd of this.subCommands) {
      await cmd.execute();
    }
  }
  async undo() {
    for (let i = this.subCommands.length - 1; i >= 0; i--) {
      await this.subCommands[i].undo();
    }
  }
  async redo() {
    for (const cmd of this.subCommands) {
      await cmd.redo();
    }
  }
};

// core/src/commands/impl/BatchTrimRegionsCommand.ts
var BatchTrimRegionsCommand = class {
  constructor(session, entries) {
    this.session = session;
    this.entries = entries;
    this.subCommands = [];
  }
  async execute() {
    this.subCommands = this.entries.map(
      (e) => new TrimRegionCommand(
        this.session,
        e.trackId,
        e.regionId,
        e.amount,
        e.direction,
        e.noOverlap
      )
    );
    for (const cmd of this.subCommands) {
      await cmd.execute();
    }
  }
  async undo() {
    for (let i = this.subCommands.length - 1; i >= 0; i--) {
      await this.subCommands[i].undo();
    }
  }
  async redo() {
    for (const cmd of this.subCommands) {
      await cmd.redo();
    }
  }
};

// core/src/commands/impl/BatchRemoveRegionsCommand.ts
var BatchRemoveRegionsCommand = class {
  constructor(session, entries) {
    this.session = session;
    this.entries = entries;
    this.subCommands = [];
  }
  async execute() {
    const sorted = [...this.entries].sort((a, b) => {
      const regionA = this.findRegionStart(a.trackId, a.regionId);
      const regionB = this.findRegionStart(b.trackId, b.regionId);
      return regionB - regionA;
    });
    this.subCommands = sorted.map(
      (e) => new RemoveRegionCommand(this.session, e.trackId, e.regionId)
    );
    for (const cmd of this.subCommands) {
      await cmd.execute();
    }
  }
  async undo() {
    for (let i = this.subCommands.length - 1; i >= 0; i--) {
      await this.subCommands[i].undo();
    }
  }
  async redo() {
    for (const cmd of this.subCommands) {
      await cmd.redo();
    }
  }
  findRegionStart(trackId, regionId) {
    const track = this.session.getTrack(trackId);
    const region = track?.playlist.getRegion(regionId);
    return region?.start ?? 0;
  }
};

// core/src/commands/impl/BatchSetRegionFadesCommand.ts
var BatchSetRegionFadesCommand = class {
  constructor(session, entries) {
    this.session = session;
    this.entries = entries;
    this.subCommands = [];
  }
  async execute() {
    this.subCommands = this.entries.map(
      (e) => new SetRegionFadesCommand(
        this.session,
        e.trackId,
        e.regionId,
        e.fadeIn,
        e.fadeOut
      )
    );
    for (const cmd of this.subCommands) {
      await cmd.execute();
    }
  }
  async undo() {
    for (let i = this.subCommands.length - 1; i >= 0; i--) {
      await this.subCommands[i].undo();
    }
  }
  async redo() {
    for (const cmd of this.subCommands) {
      await cmd.redo();
    }
  }
};

// core/src/commands/handlers/RegionHandler.ts
var RegionHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.ADD_SOURCE,
      CommandType.ADD_REGION,
      CommandType.REMOVE_REGION,
      CommandType.MOVE_REGION,
      CommandType.RESIZE_REGION,
      CommandType.COPY_REGION,
      CommandType.PASTE_REGION,
      CommandType.DUPLICATE_REGION,
      CommandType.SPLIT_REGION,
      CommandType.SPLIT_AT_PLAYHEAD,
      CommandType.SELECT_REGION,
      CommandType.CLEAR_SELECTION,
      CommandType.SET_REGION_TIME_DOMAIN,
      CommandType.TRIM_REGION,
      CommandType.TRIM_REGION_TO_PLAYHEAD,
      CommandType.TRIM_REGION_TO_RANGE,
      CommandType.TRIM_TO_ADJACENT_REGION,
      CommandType.SET_REGION_FADES,
      CommandType.MERGE_REGIONS,
      CommandType.SELECT_REGIONS,
      CommandType.LOCK_REGION,
      CommandType.AUDITION_REGION,
      CommandType.STOP_AUDITION,
      CommandType.GROUP_REGIONS,
      CommandType.UNGROUP_REGIONS,
      CommandType.SET_RIPPLE_EDIT,
      CommandType.STRIP_SILENCE,
      CommandType.NORMALIZE_REGION,
      CommandType.SET_REGION_PLAYBACK_RATE,
      CommandType.TIME_STRETCH_REGION,
      CommandType.REVERSE_REGION
    ]);
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, history) {
    if (!payload) {
      return { success: false, message: `${commandType} requires a payload` };
    }
    switch (commandType) {
      case CommandType.ADD_SOURCE: {
        const source = new Source(
          requireString(payload, "id"),
          requireString(payload, "name"),
          requireString(payload, "url"),
          requireNumber(payload, "duration"),
          void 0,
          // sampleRate - use default
          void 0,
          // channelCount - use default
          payload.videoMetadata
          // Pass video metadata if present
        );
        const cmd = new AddSourceCommand(audioEngine.session, source);
        await history.execute(cmd);
        const trackId = optionalString(payload, "trackId");
        if (trackId) {
          const addRegionCmd = new AddRegionCommand(
            audioEngine.session,
            trackId,
            source.id,
            optionalNumber(payload, "start") ?? 0,
            source.duration,
            0
          );
          await history.execute(addRegionCmd);
          return { success: true, message: "Source added and Region created" };
        }
        return { success: true, message: "Source added to Session" };
      }
      case CommandType.ADD_REGION: {
        const cmd = new AddRegionCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "sourceUrl"),
          requireNumber(payload, "start"),
          requireNumber(payload, "duration"),
          0
        );
        await history.execute(cmd);
        return { success: true, message: "Region added to track" };
      }
      case CommandType.REMOVE_REGION: {
        const session = audioEngine.session;
        const primaryRegionId = requireString(payload, "regionId");
        const selected = session.getSelectedRegionIds();
        if (selected.size > 1 && selected.has(primaryRegionId)) {
          const entries = [];
          for (const rid of selected) {
            const t = session.findTrackForRegion(rid);
            if (t) entries.push({ trackId: t.id, regionId: rid });
          }
          const cmd2 = new BatchRemoveRegionsCommand(session, entries);
          await history.execute(cmd2);
          return {
            success: true,
            message: `${entries.length} regions removed`
          };
        }
        const cmd = new RemoveRegionCommand(
          session,
          requireString(payload, "trackId"),
          primaryRegionId
        );
        await history.execute(cmd);
        return { success: true, message: "Region removed" };
      }
      case CommandType.MOVE_REGION: {
        const session = audioEngine.session;
        const primaryRegionId = requireString(payload, "regionId");
        const newStart = requireNumber(payload, "newStart");
        const selected = session.getSelectedRegionIds();
        if (selected.size > 1 && selected.has(primaryRegionId)) {
          const primaryTrack = session.findTrackForRegion(primaryRegionId);
          const primaryRegion = primaryTrack?.playlist.getRegion(primaryRegionId);
          if (primaryTrack && primaryRegion) {
            const delta = newStart - primaryRegion.start;
            const entries = [];
            for (const rid of selected) {
              const t = session.findTrackForRegion(rid);
              const r = t?.playlist.getRegion(rid);
              if (t && r) {
                entries.push({
                  trackId: t.id,
                  regionId: rid,
                  newStart: r.start + delta
                });
              }
            }
            const cmd2 = new BatchMoveRegionsCommand(session, entries);
            await history.execute(cmd2);
            return {
              success: true,
              message: `${entries.length} regions moved`
            };
          }
        }
        const cmd = new MoveRegionCommand(
          session,
          requireString(payload, "trackId"),
          primaryRegionId,
          newStart,
          optionalString(payload, "targetTrackId")
        );
        await history.execute(cmd);
        return { success: true, message: `Region moved to ${newStart}` };
      }
      case CommandType.RESIZE_REGION: {
        const newLength = requireNumber(payload, "newLength");
        const cmd = new ResizeRegionCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          newLength
        );
        await history.execute(cmd);
        return { success: true, message: `Region resized to ${newLength}` };
      }
      case CommandType.TRIM_REGION: {
        const session = audioEngine.session;
        const primaryRegionId = requireString(payload, "regionId");
        const selected = session.getSelectedRegionIds();
        const direction = requireString(payload, "direction");
        const amount = requireNumber(payload, "amount");
        if (selected.size > 1 && selected.has(primaryRegionId)) {
          const entries = [];
          for (const rid of selected) {
            const t = session.findTrackForRegion(rid);
            if (t)
              entries.push({ trackId: t.id, regionId: rid, amount, direction });
          }
          const cmd2 = new BatchTrimRegionsCommand(session, entries);
          await history.execute(cmd2);
          return {
            success: true,
            message: `${entries.length} regions trimmed`
          };
        }
        const cmd = new TrimRegionCommand(
          session,
          requireString(payload, "trackId"),
          primaryRegionId,
          amount,
          direction
        );
        await history.execute(cmd);
        return { success: true, message: `Region trimmed by ${amount}` };
      }
      case CommandType.TRIM_REGION_TO_PLAYHEAD: {
        const direction = requireString(payload, "direction");
        const cmd = new TrimRegionToPlayheadCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          direction
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Region trimmed to playhead (${direction})`
        };
      }
      case CommandType.TRIM_REGION_TO_RANGE: {
        const cmd = new TrimRegionToRangeCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          requireNumber(payload, "rangeStart"),
          requireNumber(payload, "rangeEnd")
        );
        await history.execute(cmd);
        return { success: true, message: "Region trimmed to range" };
      }
      case CommandType.TRIM_TO_ADJACENT_REGION: {
        const direction = requireString(payload, "direction");
        const cmd = new TrimToAdjacentRegionCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          direction
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Region trimmed to adjacent (${direction})`
        };
      }
      case CommandType.SET_REGION_FADES: {
        const session = audioEngine.session;
        const primaryRegionId = requireString(payload, "regionId");
        const fadeIn = optionalNumber(payload, "fadeIn");
        const fadeOut = optionalNumber(payload, "fadeOut");
        const selected = session.getSelectedRegionIds();
        if (selected.size > 1 && selected.has(primaryRegionId)) {
          const entries = [];
          for (const rid of selected) {
            const t = session.findTrackForRegion(rid);
            if (t)
              entries.push({
                trackId: t.id,
                regionId: rid,
                fadeIn,
                fadeOut
              });
          }
          const cmd2 = new BatchSetRegionFadesCommand(session, entries);
          await history.execute(cmd2);
          return {
            success: true,
            message: `${entries.length} region fades updated`
          };
        }
        const cmd = new SetRegionFadesCommand(
          session,
          requireString(payload, "trackId"),
          primaryRegionId,
          fadeIn,
          fadeOut
        );
        await history.execute(cmd);
        return { success: true, message: `Region fades updated` };
      }
      case CommandType.MERGE_REGIONS: {
        let regionIds = payload.regionIds ?? [];
        if (regionIds.length === 0) {
          regionIds = Array.from(audioEngine.session.getSelectedRegionIds());
        }
        let trackId = optionalString(payload, "trackId") ?? "";
        if (trackId === "selected" || !trackId) {
          if (regionIds.length > 0) {
            for (const track of audioEngine.session.tracks) {
              if (track.playlist.getRegion(regionIds[0])) {
                trackId = track.id;
                break;
              }
            }
          }
        }
        if (!trackId || regionIds.length < 2) {
          return {
            success: false,
            message: "Need at least 2 regions on the same track to merge"
          };
        }
        const cmd = new MergeRegionsCommand(
          audioEngine.session,
          audioEngine,
          trackId,
          regionIds
        );
        await history.execute(cmd);
        return { success: true, message: `Regions merged` };
      }
      case CommandType.COPY_REGION: {
        const cmd = new CopyRegionCommand();
        await cmd.execute();
        return { success: true, message: "Region(s) copied to clipboard" };
      }
      case CommandType.PASTE_REGION: {
        const cmd = new PasteRegionCommand(
          optionalString(payload, "trackId"),
          optionalNumber(payload, "position")
        );
        await history.execute(cmd);
        return { success: true, message: "Region(s) pasted" };
      }
      case CommandType.DUPLICATE_REGION: {
        const cmd = new DuplicateRegionCommand();
        await history.execute(cmd);
        return { success: true, message: "Region(s) duplicated" };
      }
      case CommandType.SPLIT_REGION: {
        const cmd = new SplitRegionCommand(
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          requireNumber(payload, "position")
        );
        await history.execute(cmd);
        return { success: true, message: "Region split" };
      }
      case CommandType.SPLIT_AT_PLAYHEAD: {
        const cmd = new SplitAtPlayheadCommand();
        await history.execute(cmd);
        const summary = cmd.getSummary();
        const messages = [`Split ${summary.successCount} region(s)`];
        if (summary.skippedCount > 0) {
          messages.push(`${summary.skippedCount} skipped (out of bounds)`);
        }
        return {
          success: true,
          message: messages.join(", "),
          data: summary
        };
      }
      case CommandType.SELECT_REGION: {
        const regionId = requireString(payload, "regionId");
        audioEngine.session.selectRegion(
          regionId,
          optionalBoolean(payload, "addToSelection") ?? false
        );
        return {
          success: true,
          message: `Region selected: ${regionId}`
        };
      }
      case CommandType.SELECT_REGIONS: {
        const regionIds = requireStringArray(payload, "regionIds");
        audioEngine.session.selectRegions(
          regionIds,
          optionalBoolean(payload, "addToSelection") ?? false
        );
        return {
          success: true,
          message: `Selected ${regionIds.length} regions`
        };
      }
      case CommandType.CLEAR_SELECTION: {
        audioEngine.session.clearSelection();
        return { success: true, message: "Selection cleared" };
      }
      case CommandType.SET_REGION_TIME_DOMAIN: {
        const timeDomain = requireNumber(payload, "timeDomain");
        const cmd = new SetRegionTimeDomainCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          timeDomain
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Region time domain set to ${timeDomain === 0 ? "Audio" : "Beat"}`
        };
      }
      case CommandType.LOCK_REGION: {
        const locked = requireBoolean(payload, "locked");
        const cmd = new LockRegionCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          locked
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Region ${locked ? "locked" : "unlocked"}`
        };
      }
      case CommandType.AUDITION_REGION: {
        audioEngine.auditionRegion(
          requireString(payload, "trackId"),
          requireString(payload, "regionId")
        );
        return { success: true, message: "Auditioning region" };
      }
      case CommandType.STOP_AUDITION: {
        audioEngine.stopAudition();
        return { success: true, message: "Audition stopped" };
      }
      case CommandType.SET_RIPPLE_EDIT: {
        const enabled = requireBoolean(payload, "enabled");
        audioEngine.session.setRippleEdit(enabled);
        return {
          success: true,
          message: `Ripple edit ${enabled ? "enabled" : "disabled"}`
        };
      }
      case CommandType.GROUP_REGIONS: {
        const groupRegionIds = requireStringArray(payload, "regionIds");
        if (groupRegionIds.length < 2) {
          return {
            success: false,
            message: "GROUP_REGIONS requires at least 2 regionIds"
          };
        }
        const cmd = new GroupRegionsCommand(
          audioEngine.session,
          groupRegionIds,
          optionalString(payload, "name")
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Grouped ${groupRegionIds.length} regions`,
          data: { groupId: cmd.getGroupId() }
        };
      }
      case CommandType.UNGROUP_REGIONS: {
        const cmd = new UngroupRegionsCommand(
          audioEngine.session,
          requireString(payload, "groupId")
        );
        await history.execute(cmd);
        return { success: true, message: "Regions ungrouped" };
      }
      case CommandType.STRIP_SILENCE: {
        const stripCmd = new StripSilenceCommand(
          audioEngine.session,
          audioEngine,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          optionalNumber(payload, "thresholdDb") ?? -60,
          optionalNumber(payload, "minLengthFrames") ?? 4410
        );
        await history.execute(stripCmd);
        return { success: true, message: "Silence stripped from region" };
      }
      case CommandType.NORMALIZE_REGION: {
        const normalizeCmd = new NormalizeRegionCommand(
          audioEngine.session,
          audioEngine,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          optionalNumber(payload, "targetDb") ?? 0
        );
        await history.execute(normalizeCmd);
        return { success: true, message: "Region normalized" };
      }
      case CommandType.SET_REGION_PLAYBACK_RATE: {
        const playbackRate = requireNumber(payload, "playbackRate");
        const rateCmd = new SetRegionPlaybackRateCommand(
          audioEngine.session,
          audioEngine,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          playbackRate
        );
        await history.execute(rateCmd);
        return {
          success: true,
          message: `Playback rate set to ${playbackRate}`
        };
      }
      case CommandType.TIME_STRETCH_REGION: {
        const stretch = requireNumber(payload, "stretch");
        const pitchSemitones = optionalNumber(payload, "pitchSemitones") ?? 0;
        const stretchCmd = new TimeStretchRegionCommand(
          audioEngine.session,
          audioEngine,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          stretch,
          pitchSemitones
        );
        await history.execute(stretchCmd);
        return {
          success: true,
          message: `Time stretch applied: ${stretch}x, pitch: ${pitchSemitones}st`
        };
      }
      case CommandType.REVERSE_REGION: {
        const reverseCmd = new ReverseRegionCommand(
          audioEngine.session,
          audioEngine,
          requireString(payload, "trackId"),
          requireString(payload, "regionId")
        );
        await history.execute(reverseCmd);
        return { success: true, message: "Region reversed" };
      }
      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
};

// core/src/commands/impl/AddRangeCommand.ts
init_Logger();
var AddRangeCommand = class {
  constructor(name, start, end, color) {
    this.name = name;
    this.start = start;
    this.end = end;
    this.color = color;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    this.addedRange = session.addRange(
      this.name,
      this.start,
      this.end,
      this.rangeId,
      this.color
    );
    this.rangeId = this.addedRange.id;
    logger.debug(
      "AddRangeCommand",
      `Added range: ${this.name} (${this.start} - ${this.end})`
    );
  }
  async undo() {
    if (!this.rangeId) return;
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    session.removeRange(this.rangeId);
    logger.debug("AddRangeCommand", `Removed range: ${this.name}`);
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/RemoveRangeCommand.ts
init_Logger();
var RemoveRangeCommand = class {
  constructor(rangeId) {
    this.rangeId = rangeId;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    const range = session.getRange(this.rangeId);
    if (!range) {
      throw new Error(`Range not found: ${this.rangeId}`);
    }
    this.removedRange = range.clone();
    session.removeRange(this.rangeId);
    logger.debug("RemoveRangeCommand", `Removed range: ${range.name}`);
  }
  async undo() {
    if (!this.removedRange) return;
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    session.addRange(
      this.removedRange.name,
      this.removedRange.start,
      this.removedRange.end,
      this.removedRange.id,
      this.removedRange.color
    );
    logger.debug(
      "RemoveRangeCommand",
      `Restored range: ${this.removedRange.name}`
    );
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/SetRangeCommand.ts
init_Logger();
var SetRangeCommand = class {
  constructor(rangeId, options) {
    this.rangeId = rangeId;
    this.newName = options.name;
    this.newStart = options.start;
    this.newEnd = options.end;
    this.newColor = options.color;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    const range = session.getRange(this.rangeId);
    if (!range) {
      throw new Error(`Range not found: ${this.rangeId}`);
    }
    this.oldName = range.name;
    this.oldStart = range.start;
    this.oldEnd = range.end;
    this.oldColor = range.color;
    if (this.newName !== void 0) {
      range.setName(this.newName);
    }
    if (this.newStart !== void 0 && this.newEnd !== void 0) {
      range.setRange(this.newStart, this.newEnd);
    } else if (this.newStart !== void 0) {
      range.setRange(this.newStart, range.end);
    } else if (this.newEnd !== void 0) {
      range.setRange(range.start, this.newEnd);
    }
    if (this.newColor !== void 0) {
      range.setColor(this.newColor);
    }
    logger.debug("SetRangeCommand", `Updated range: ${range.name}`);
  }
  async undo() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    const range = session.getRange(this.rangeId);
    if (!range) return;
    if (this.oldName !== void 0) {
      range.setName(this.oldName);
    }
    if (this.oldStart !== void 0 && this.oldEnd !== void 0) {
      range.setRange(this.oldStart, this.oldEnd);
    }
    if (this.oldColor !== void 0) {
      range.setColor(this.oldColor);
    }
    logger.debug("SetRangeCommand", `Restored range: ${range.name}`);
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/SetLoopRangeCommand.ts
init_Logger();
var SetLoopRangeCommand = class {
  constructor(rangeId) {
    this.oldLoopEnabled = false;
    this.rangeId = rangeId;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    this.oldRangeId = session.loopRangeId;
    this.oldLoopEnabled = session.loopEnabled;
    if (this.rangeId) {
      session.setLoopRange(this.rangeId);
      logger.debug("SetLoopRangeCommand", `Loop range set to: ${this.rangeId}`);
    } else {
      session.clearLoopRange();
      logger.debug("SetLoopRangeCommand", `Loop range cleared`);
    }
  }
  async undo() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    if (this.oldRangeId) {
      session.setLoopRange(this.oldRangeId);
      session.setLoopEnabled(this.oldLoopEnabled);
    } else {
      session.clearLoopRange();
    }
    logger.debug(
      "SetLoopRangeCommand",
      `Restored loop range: ${this.oldRangeId}`
    );
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/ToggleLoopCommand.ts
init_Logger();
var ToggleLoopCommand = class {
  constructor() {
    this.oldValue = false;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    this.oldValue = session.loopEnabled;
    if (!session.loopRangeId && session.ranges.length > 0) {
      this.autoAssignedRangeId = session.ranges[0].id;
      session.setLoopRange(session.ranges[0].id);
    }
    session.toggleLoop();
    logger.debug(
      "ToggleLoopCommand",
      `Loop ${session.loopEnabled ? "enabled" : "disabled"}`
    );
  }
  async undo() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    session.setLoopEnabled(this.oldValue);
    if (this.autoAssignedRangeId) {
      session.clearLoopRange();
      this.autoAssignedRangeId = void 0;
    }
    logger.debug("ToggleLoopCommand", `Restored loop state: ${this.oldValue}`);
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/SetPunchRangeCommand.ts
init_Logger();
var SetPunchRangeCommand = class {
  constructor(rangeId) {
    this.rangeId = rangeId;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    this.oldRangeId = session.punchRangeId;
    if (this.rangeId) {
      session.setPunchRange(this.rangeId);
      logger.debug(
        "SetPunchRangeCommand",
        `Punch range set to: ${this.rangeId}`
      );
    } else {
      session.clearPunchRange();
      logger.debug("SetPunchRangeCommand", `Punch range cleared`);
    }
  }
  async undo() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    if (this.oldRangeId) {
      session.setPunchRange(this.oldRangeId);
    } else {
      session.clearPunchRange();
    }
    logger.debug(
      "SetPunchRangeCommand",
      `Restored punch range: ${this.oldRangeId}`
    );
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/handlers/RangeHandler.ts
var RangeHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.ADD_RANGE,
      CommandType.REMOVE_RANGE,
      CommandType.SET_RANGE,
      CommandType.LIST_RANGES,
      CommandType.SET_LOOP_RANGE,
      CommandType.TOGGLE_LOOP,
      CommandType.SET_PUNCH_RANGE
    ]);
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, history) {
    if (!payload) {
      return { success: false, message: `${commandType} requires a payload` };
    }
    switch (commandType) {
      case CommandType.ADD_RANGE: {
        const cmd = new AddRangeCommand(
          payload.name,
          payload.start,
          payload.end,
          payload.color
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Range "${payload.name}" added`
        };
      }
      case CommandType.REMOVE_RANGE: {
        const cmd = new RemoveRangeCommand(payload.rangeId);
        await history.execute(cmd);
        return { success: true, message: "Range removed" };
      }
      case CommandType.SET_RANGE: {
        const cmd = new SetRangeCommand(payload.rangeId, {
          name: payload.name,
          start: payload.start,
          end: payload.end,
          color: payload.color
        });
        await history.execute(cmd);
        return { success: true, message: "Range updated" };
      }
      case CommandType.LIST_RANGES: {
        const listRanges = audioEngine.session.ranges.map((r) => r.toDTO());
        const loopRange = audioEngine.session.getLoopRange();
        const punchRange = audioEngine.session.getPunchRange();
        return {
          success: true,
          message: `Found ${listRanges.length} range(s)`,
          data: {
            ranges: listRanges,
            loopRangeId: audioEngine.session.loopRangeId,
            loopEnabled: audioEngine.session.loopEnabled,
            loopRange: loopRange?.toDTO(),
            punchRangeId: audioEngine.session.punchRangeId,
            punchRange: punchRange?.toDTO()
          }
        };
      }
      case CommandType.SET_LOOP_RANGE: {
        const cmd = new SetLoopRangeCommand(
          payload?.rangeId
        );
        await history.execute(cmd);
        if (payload?.rangeId) {
          return {
            success: true,
            message: `Loop range set to: ${payload.rangeId}`
          };
        } else {
          return { success: true, message: "Loop range cleared" };
        }
      }
      case CommandType.TOGGLE_LOOP: {
        const cmd = new ToggleLoopCommand();
        await history.execute(cmd);
        const isEnabled = audioEngine.session.loopEnabled;
        return {
          success: true,
          message: `Loop ${isEnabled ? "enabled" : "disabled"}`,
          data: { loopEnabled: isEnabled }
        };
      }
      case CommandType.SET_PUNCH_RANGE: {
        const cmd = new SetPunchRangeCommand(
          payload?.rangeId
        );
        await history.execute(cmd);
        if (payload?.rangeId) {
          return {
            success: true,
            message: `Punch range set to: ${payload.rangeId}`
          };
        } else {
          return { success: true, message: "Punch range cleared" };
        }
      }
      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
};

// core/src/commands/impl/AddAutomationPointCommand.ts
init_Logger();
var AddAutomationPointCommand = class {
  constructor(session, trackId, processorId, parameter, time, value, interpolation = "Linear" /* Linear */) {
    this.session = session;
    this.trackId = trackId;
    this.processorId = processorId;
    this.parameter = parameter;
    this.time = time;
    this.value = value;
    this.interpolation = interpolation;
    this.type = "AddAutomationPoint";
    this.addedPointId = null;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    const processor = track.route.processors.find(
      (p) => p.id === this.processorId
    );
    if (!processor)
      throw new Error(
        `Processor ${this.processorId} not found on track ${this.trackId}`
      );
    const automationList = processor.getAutomation(this.parameter);
    const point = automationList.addPoint(
      this.time,
      this.value,
      this.interpolation
    );
    this.addedPointId = point.id;
    logger.debug(
      "Command",
      `Added automation point to ${this.parameter} at ${this.time}s`
    );
  }
  async undo() {
    if (!this.addedPointId) return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const processor = track.route.processors.find(
      (p) => p.id === this.processorId
    );
    if (!processor) return;
    const automationList = processor.automations.get(this.parameter);
    if (automationList) {
      automationList.removePoint(this.addedPointId);
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/MoveAutomationPointCommand.ts
var MoveAutomationPointCommand = class {
  constructor(session, trackId, processorId, parameter, pointId, newTime, newValue) {
    this.session = session;
    this.trackId = trackId;
    this.processorId = processorId;
    this.parameter = parameter;
    this.pointId = pointId;
    this.newTime = newTime;
    this.newValue = newValue;
    this.type = "MoveAutomationPoint";
    // State to restore on undo
    this.originalTime = null;
    this.originalValue = null;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    const processor = track.route.processors.find(
      (p) => p.id === this.processorId
    );
    if (!processor) throw new Error(`Processor ${this.processorId} not found`);
    const automationList = processor.automations.get(this.parameter);
    if (!automationList)
      throw new Error(`val parameter ${this.parameter} not found`);
    const points = automationList.getPoints();
    const point = points.find((p) => p.id === this.pointId);
    if (!point) throw new Error(`Point ${this.pointId} not found`);
    if (this.originalTime === null) {
      this.originalTime = point.time;
      this.originalValue = point.value;
    }
    automationList.updatePoint(this.pointId, this.newTime, this.newValue);
  }
  async undo() {
    if (this.originalTime === null || this.originalValue === null) return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const processor = track.route.processors.find(
      (p) => p.id === this.processorId
    );
    if (!processor) return;
    const automationList = processor.automations.get(this.parameter);
    if (automationList) {
      automationList.updatePoint(
        this.pointId,
        this.originalTime,
        this.originalValue
      );
    }
  }
  async redo() {
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const processor = track.route.processors.find(
      (p) => p.id === this.processorId
    );
    if (!processor) return;
    const automationList = processor.automations.get(this.parameter);
    if (automationList) {
      automationList.updatePoint(this.pointId, this.newTime, this.newValue);
    }
  }
};

// core/src/commands/impl/RemoveAutomationPointCommand.ts
init_Logger();
var RemoveAutomationPointCommand = class {
  constructor(session, trackId, processorId, parameter, pointId) {
    this.session = session;
    this.trackId = trackId;
    this.processorId = processorId;
    this.parameter = parameter;
    this.pointId = pointId;
    this.type = "RemoveAutomationPoint";
    // State to restore
    this.deletedPoint = null;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    const processor = track.route.processors.find(
      (p) => p.id === this.processorId
    );
    if (!processor) throw new Error(`Processor ${this.processorId} not found`);
    const automationList = processor.automations.get(this.parameter);
    if (!automationList)
      throw new Error(`val parameter ${this.parameter} not found`);
    const points = automationList.getPoints();
    const point = points.find((p) => p.id === this.pointId);
    if (point) {
      this.deletedPoint = { ...point };
    } else {
      logger.warn(
        "RemoveAutomationPointCommand",
        `Point ${this.pointId} not found to remove`
      );
      return;
    }
    automationList.removePoint(this.pointId);
  }
  async undo() {
    if (!this.deletedPoint) return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const processor = track.route.processors.find(
      (p) => p.id === this.processorId
    );
    if (!processor) return;
    const automationList = processor.automations.get(this.parameter);
    if (automationList) {
      automationList.addPoint(
        this.deletedPoint.time,
        this.deletedPoint.value,
        this.deletedPoint.interpolation,
        this.deletedPoint.id
        // We need to update AutomationList to accept ID
      );
    }
  }
  async redo() {
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const processor = track.route.processors.find(
      (p) => p.id === this.processorId
    );
    if (!processor) return;
    const automationList = processor.automations.get(this.parameter);
    if (automationList) {
      automationList.removePoint(this.pointId);
    }
  }
};

// core/src/plugins/impl/GenericPlugin.ts
init_Signal();
var GenericPlugin = class {
  constructor(id, name, type) {
    this.parameterChanged = new Signal();
    this.parameters = /* @__PURE__ */ new Map();
    this.id = id;
    this.name = name;
    this.type = type;
  }
  addParameter(param) {
    this.parameters.set(param.id, param);
  }
  getParameters() {
    return Array.from(this.parameters.values());
  }
  getParameter(id) {
    return this.parameters.get(id);
  }
  setParameter(id, value) {
    const param = this.parameters.get(id);
    if (param) {
      param.value = Math.max(param.min, Math.min(param.max, value));
      this.parameterChanged.emit({ id, value: param.value });
    }
  }
  getState() {
    const state = {};
    this.parameters.forEach((p, k) => state[k] = p.value);
    return state;
  }
  setState(state) {
    for (const key in state) {
      this.setParameter(key, state[key]);
    }
  }
};

// core/src/plugins/impl/ParametricEQPlugin.ts
var BAND_DEFS = [
  { index: 1, freq: 160, freqMin: 20, freqMax: 1e3, isShelf: true },
  { index: 2, freq: 397, freqMin: 50, freqMax: 2e3, isShelf: false },
  { index: 3, freq: 1e3, freqMin: 200, freqMax: 5e3, isShelf: false },
  { index: 4, freq: 2500, freqMin: 500, freqMax: 1e4, isShelf: false },
  { index: 5, freq: 6300, freqMin: 1e3, freqMax: 16e3, isShelf: false },
  { index: 6, freq: 9e3, freqMin: 2e3, freqMax: 2e4, isShelf: true }
];
function initParametricEQParameters(plugin) {
  for (const band of BAND_DEFS) {
    const b = `band${band.index}`;
    plugin.addParameter({
      id: `${b}Freq`,
      name: `Band ${band.index} Freq`,
      value: band.freq,
      min: band.freqMin,
      max: band.freqMax,
      step: 1
    });
    plugin.addParameter({
      id: `${b}Gain`,
      name: `Band ${band.index} Gain`,
      value: 0,
      min: -24,
      max: 24,
      step: 0.5
    });
    if (!band.isShelf) {
      plugin.addParameter({
        id: `${b}Q`,
        name: `Band ${band.index} Q`,
        value: 1,
        min: 0.1,
        max: 18,
        step: 0.1
      });
    }
    plugin.addParameter({
      id: `${b}Bypass`,
      name: `Band ${band.index} Bypass`,
      value: 0,
      min: 0,
      max: 1,
      step: 1
    });
  }
}

// core/src/plugins/impl/ExpanderPlugin.ts
var EXPANDER_DEFAULTS = {
  threshold: -30,
  ratio: 2,
  attack: 5,
  release: 50,
  knee: 6,
  range: -12
};
var GATE_DEFAULTS = {
  threshold: -40,
  ratio: 20,
  attack: 0.5,
  release: 50,
  knee: 0,
  range: -90
};
function initExpanderParameters(plugin, defaults) {
  plugin.addParameter({
    id: "threshold",
    name: "Threshold",
    value: defaults.threshold,
    min: -60,
    max: 0,
    step: 0.5
  });
  plugin.addParameter({
    id: "ratio",
    name: "Ratio",
    value: defaults.ratio,
    min: 1,
    max: 20,
    step: 0.5
  });
  plugin.addParameter({
    id: "attack",
    name: "Attack",
    value: defaults.attack,
    min: 0.1,
    max: 100,
    step: 0.1
  });
  plugin.addParameter({
    id: "release",
    name: "Release",
    value: defaults.release,
    min: 1,
    max: 1e3,
    step: 1
  });
  plugin.addParameter({
    id: "knee",
    name: "Knee",
    value: defaults.knee,
    min: 0,
    max: 20,
    step: 0.5
  });
  plugin.addParameter({
    id: "range",
    name: "Range",
    value: defaults.range,
    min: -90,
    max: 0,
    step: 0.5
  });
}

// core/src/plugins/impl/SyncDelayPlugin.ts
var SyncDelayPlugin = class _SyncDelayPlugin extends GenericPlugin {
  constructor(id, name, type) {
    super(id, name, type);
    this.addParameter({
      id: "sync",
      name: "Sync",
      value: 1,
      min: 0,
      max: 1,
      step: 1
    });
    this.addParameter({
      id: "divisor",
      name: "Divisor",
      value: 0,
      min: 0,
      max: 4,
      step: 1
    });
    this.addParameter({
      id: "feedback",
      name: "Feedback",
      value: 0.35,
      min: 0,
      max: 0.95,
      step: 0.01
    });
    this.addParameter({
      id: "lpf",
      name: "LPF",
      value: 8e3,
      min: 200,
      max: 2e4,
      step: 1
    });
    this.addParameter({
      id: "wet",
      name: "Wet",
      value: 0.4,
      min: 0,
      max: 1,
      step: 0.01
    });
    this.addParameter({
      id: "delayTime",
      name: "Delay Time",
      value: 0.5,
      min: 0.01,
      max: 2,
      step: 0.01
    });
  }
  /**
   * Get the divisor multiplier for the currently selected divisor value.
   */
  static divisorMultiplier(divisor) {
    switch (Math.round(divisor)) {
      case 0:
        return 1;
      // 1/4
      case 1:
        return 0.5;
      // 1/8
      case 2:
        return 0.25;
      // 1/16
      case 3:
        return 0.5 * 1.5;
      // dotted 1/8
      case 4:
        return 1 * (2 / 3);
      // triplet 1/4
      default:
        return 1;
    }
  }
  /**
   * Compute the effective delay time in seconds.
   */
  getEffectiveDelayTime(bpm) {
    const sync = this.getParameter("sync")?.value ?? 0;
    if (sync < 0.5) {
      return this.getParameter("delayTime")?.value ?? 0.5;
    }
    const divisor = this.getParameter("divisor")?.value ?? 0;
    const quarterNote = 60 / bpm;
    return quarterNote * _SyncDelayPlugin.divisorMultiplier(divisor);
  }
};

// core/src/plugins/impl/ConvolutionReverbPlugin.ts
var ConvolutionReverbPlugin = class extends GenericPlugin {
  constructor(id, name, type) {
    super(id, name, type);
    this.addParameter({
      id: "wet",
      name: "Wet",
      value: 0.4,
      min: 0,
      max: 1,
      step: 0.01
    });
    this.addParameter({
      id: "preDelay",
      name: "Pre-Delay",
      value: 10,
      min: 0,
      max: 100,
      step: 1
    });
    this.addParameter({
      id: "irType",
      name: "IR Type",
      value: 0,
      min: 0,
      max: 3,
      step: 1
    });
  }
  /** Human-readable label for the current IR type. */
  static irTypeLabel(irType) {
    switch (Math.round(irType)) {
      case 0:
        return "Small Room";
      case 1:
        return "Hall";
      case 2:
        return "Plate";
      case 3:
        return "Chamber";
      default:
        return "Unknown";
    }
  }
};

// core/src/plugins/PluginManager.ts
var PluginManager = class _PluginManager {
  constructor() {
    this.availablePlugins = [
      { id: "internal-reverb", name: "Reverb", type: "EFFECT" /* EFFECT */ },
      { id: "internal-delay", name: "Delay", type: "EFFECT" /* EFFECT */ },
      { id: "internal-eq3", name: "3-Band EQ", type: "EFFECT" /* EFFECT */ },
      { id: "internal-compressor", name: "Compressor", type: "EFFECT" /* EFFECT */ },
      { id: "internal-gain", name: "Gain (Utility)", type: "EFFECT" /* EFFECT */ },
      { id: "internal-chorus", name: "Chorus", type: "EFFECT" /* EFFECT */ },
      { id: "internal-distortion", name: "Distortion", type: "EFFECT" /* EFFECT */ },
      { id: "internal-filter", name: "Filter", type: "EFFECT" /* EFFECT */ },
      {
        id: "internal-eq6",
        name: "6-Band Parametric EQ",
        type: "EFFECT" /* EFFECT */
      },
      { id: "internal-expander", name: "Expander", type: "EFFECT" /* EFFECT */ },
      { id: "internal-gate", name: "Gate", type: "EFFECT" /* EFFECT */ },
      { id: "internal-deesser", name: "De-Esser", type: "EFFECT" /* EFFECT */ },
      {
        id: "internal-multiband-comp",
        name: "Multiband Compressor",
        type: "EFFECT" /* EFFECT */
      },
      { id: "internal-phaser", name: "Phaser", type: "EFFECT" /* EFFECT */ },
      { id: "internal-tremolo", name: "Tremolo", type: "EFFECT" /* EFFECT */ },
      { id: "internal-vibrato", name: "Vibrato", type: "EFFECT" /* EFFECT */ },
      { id: "internal-autopan", name: "Auto-Pan", type: "EFFECT" /* EFFECT */ },
      {
        id: "internal-tape-sat",
        name: "Tape Saturation",
        type: "EFFECT" /* EFFECT */
      },
      { id: "internal-sync-delay", name: "Sync Delay", type: "EFFECT" /* EFFECT */ },
      {
        id: "internal-convolver",
        name: "Convolution Reverb",
        type: "EFFECT" /* EFFECT */
      }
    ];
  }
  static getInstance() {
    if (!_PluginManager.instance) {
      _PluginManager.instance = new _PluginManager();
    }
    return _PluginManager.instance;
  }
  getAvailablePlugins() {
    return this.availablePlugins;
  }
  createPlugin(descriptorId) {
    const desc = this.availablePlugins.find((p) => p.id === descriptorId);
    if (!desc) return null;
    const plugin = new GenericPlugin(
      crypto.randomUUID(),
      desc.name,
      desc.type
    );
    plugin.descriptorId = descriptorId;
    switch (descriptorId) {
      case "internal-reverb":
        plugin.addParameter({
          id: "decay",
          name: "Decay",
          value: 1.5,
          min: 0.1,
          max: 10,
          step: 0.1
        });
        plugin.addParameter({
          id: "preDelay",
          name: "Pre-Delay",
          value: 0.01,
          min: 0,
          max: 0.1,
          step: 0.01
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 0.5,
          min: 0,
          max: 1,
          step: 0.01
        });
        break;
      case "internal-delay":
        plugin.addParameter({
          id: "delayTime",
          name: "Time",
          value: 0.5,
          min: 0,
          max: 2,
          step: 0.01
        });
        plugin.addParameter({
          id: "feedback",
          name: "Feedback",
          value: 0.3,
          min: 0,
          max: 0.95,
          step: 0.01
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 0.5,
          min: 0,
          max: 1,
          step: 0.01
        });
        break;
      case "internal-eq3":
        plugin.addParameter({
          id: "lowFreq",
          name: "Low Freq",
          value: 200,
          min: 20,
          max: 500,
          step: 1
        });
        plugin.addParameter({
          id: "lowGain",
          name: "Low Gain",
          value: 0,
          min: -24,
          max: 24,
          step: 0.5
        });
        plugin.addParameter({
          id: "midFreq",
          name: "Mid Freq",
          value: 1e3,
          min: 200,
          max: 5e3,
          step: 1
        });
        plugin.addParameter({
          id: "midGain",
          name: "Mid Gain",
          value: 0,
          min: -24,
          max: 24,
          step: 0.5
        });
        plugin.addParameter({
          id: "midQ",
          name: "Mid Q",
          value: 1,
          min: 0.1,
          max: 10,
          step: 0.1
        });
        plugin.addParameter({
          id: "highFreq",
          name: "High Freq",
          value: 5e3,
          min: 2e3,
          max: 2e4,
          step: 1
        });
        plugin.addParameter({
          id: "highGain",
          name: "High Gain",
          value: 0,
          min: -24,
          max: 24,
          step: 0.5
        });
        break;
      case "internal-compressor":
        plugin.addParameter({
          id: "threshold",
          name: "Threshold",
          value: -24,
          min: -60,
          max: 0,
          step: 0.5
        });
        plugin.addParameter({
          id: "ratio",
          name: "Ratio",
          value: 4,
          min: 1,
          max: 20,
          step: 0.5
        });
        plugin.addParameter({
          id: "attack",
          name: "Attack",
          value: 3e-3,
          min: 0,
          max: 1,
          step: 1e-3
        });
        plugin.addParameter({
          id: "release",
          name: "Release",
          value: 0.25,
          min: 0,
          max: 1,
          step: 1e-3
        });
        plugin.addParameter({
          id: "knee",
          name: "Knee",
          value: 30,
          min: 0,
          max: 40,
          step: 1
        });
        plugin.addParameter({
          id: "makeupGain",
          name: "Makeup Gain",
          value: 0,
          min: 0,
          max: 24,
          step: 0.5
        });
        break;
      case "internal-gain":
        plugin.addParameter({
          id: "gain",
          name: "Gain",
          value: 0,
          min: -60,
          max: 24,
          step: 0.5
        });
        break;
      case "internal-chorus":
        plugin.addParameter({
          id: "frequency",
          name: "Rate",
          value: 1.5,
          min: 0.1,
          max: 10,
          step: 0.1
        });
        plugin.addParameter({
          id: "delayTime",
          name: "Delay",
          value: 3.5,
          min: 2,
          max: 20,
          step: 0.5
        });
        plugin.addParameter({
          id: "depth",
          name: "Depth",
          value: 0.7,
          min: 0,
          max: 1,
          step: 0.01
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 0.5,
          min: 0,
          max: 1,
          step: 0.01
        });
        break;
      case "internal-distortion":
        plugin.addParameter({
          id: "distortion",
          name: "Drive",
          value: 0.4,
          min: 0,
          max: 1,
          step: 0.01
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 1,
          min: 0,
          max: 1,
          step: 0.01
        });
        break;
      case "internal-filter":
        plugin.addParameter({
          id: "frequency",
          name: "Frequency",
          value: 1e3,
          min: 20,
          max: 2e4,
          step: 1
        });
        plugin.addParameter({
          id: "Q",
          name: "Resonance",
          value: 1,
          min: 0.1,
          max: 20,
          step: 0.1
        });
        plugin.addParameter({
          id: "type",
          name: "Type",
          value: 0,
          min: 0,
          max: 3,
          step: 1
        });
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
          value: 6e3,
          min: 2e3,
          max: 12e3,
          step: 100
        });
        plugin.addParameter({
          id: "threshold",
          name: "Threshold",
          value: -20,
          min: -40,
          max: 0,
          step: 0.5
        });
        plugin.addParameter({
          id: "reduction",
          name: "Reduction",
          value: 6,
          min: 0,
          max: 20,
          step: 0.5
        });
        plugin.addParameter({
          id: "listenMode",
          name: "Listen",
          value: 0,
          min: 0,
          max: 1,
          step: 1
        });
        break;
      case "internal-multiband-comp":
        plugin.addParameter({
          id: "lowThreshold",
          name: "Low Threshold",
          value: -24,
          min: -60,
          max: 0,
          step: 0.5
        });
        plugin.addParameter({
          id: "lowRatio",
          name: "Low Ratio",
          value: 4,
          min: 1,
          max: 20,
          step: 0.5
        });
        plugin.addParameter({
          id: "lowAttack",
          name: "Low Attack",
          value: 3e-3,
          min: 0,
          max: 1,
          step: 1e-3
        });
        plugin.addParameter({
          id: "lowRelease",
          name: "Low Release",
          value: 0.25,
          min: 0,
          max: 1,
          step: 1e-3
        });
        plugin.addParameter({
          id: "midThreshold",
          name: "Mid Threshold",
          value: -24,
          min: -60,
          max: 0,
          step: 0.5
        });
        plugin.addParameter({
          id: "midRatio",
          name: "Mid Ratio",
          value: 4,
          min: 1,
          max: 20,
          step: 0.5
        });
        plugin.addParameter({
          id: "midAttack",
          name: "Mid Attack",
          value: 3e-3,
          min: 0,
          max: 1,
          step: 1e-3
        });
        plugin.addParameter({
          id: "midRelease",
          name: "Mid Release",
          value: 0.25,
          min: 0,
          max: 1,
          step: 1e-3
        });
        plugin.addParameter({
          id: "highThreshold",
          name: "High Threshold",
          value: -24,
          min: -60,
          max: 0,
          step: 0.5
        });
        plugin.addParameter({
          id: "highRatio",
          name: "High Ratio",
          value: 4,
          min: 1,
          max: 20,
          step: 0.5
        });
        plugin.addParameter({
          id: "highAttack",
          name: "High Attack",
          value: 3e-3,
          min: 0,
          max: 1,
          step: 1e-3
        });
        plugin.addParameter({
          id: "highRelease",
          name: "High Release",
          value: 0.25,
          min: 0,
          max: 1,
          step: 1e-3
        });
        plugin.addParameter({
          id: "lowFrequency",
          name: "Low Crossover",
          value: 250,
          min: 20,
          max: 500,
          step: 1
        });
        plugin.addParameter({
          id: "highFrequency",
          name: "High Crossover",
          value: 4e3,
          min: 2e3,
          max: 16e3,
          step: 1
        });
        break;
      case "internal-phaser":
        plugin.addParameter({
          id: "frequency",
          name: "Rate",
          value: 0.5,
          min: 0.1,
          max: 10,
          step: 0.1
        });
        plugin.addParameter({
          id: "octaves",
          name: "Octaves",
          value: 3,
          min: 1,
          max: 6,
          step: 1
        });
        plugin.addParameter({
          id: "baseFrequency",
          name: "Base Freq",
          value: 350,
          min: 100,
          max: 3e3,
          step: 1
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 0.5,
          min: 0,
          max: 1,
          step: 0.01
        });
        break;
      case "internal-tremolo":
        plugin.addParameter({
          id: "frequency",
          name: "Rate",
          value: 4,
          min: 0.1,
          max: 20,
          step: 0.1
        });
        plugin.addParameter({
          id: "depth",
          name: "Depth",
          value: 0.5,
          min: 0,
          max: 1,
          step: 0.01
        });
        plugin.addParameter({
          id: "type",
          name: "Type",
          value: 0,
          min: 0,
          max: 3,
          step: 1
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 1,
          min: 0,
          max: 1,
          step: 0.01
        });
        break;
      case "internal-vibrato":
        plugin.addParameter({
          id: "frequency",
          name: "Rate",
          value: 5,
          min: 0.1,
          max: 20,
          step: 0.1
        });
        plugin.addParameter({
          id: "depth",
          name: "Depth",
          value: 0.1,
          min: 0,
          max: 1,
          step: 0.01
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 1,
          min: 0,
          max: 1,
          step: 0.01
        });
        break;
      case "internal-autopan":
        plugin.addParameter({
          id: "frequency",
          name: "Rate",
          value: 1,
          min: 0.1,
          max: 20,
          step: 0.1
        });
        plugin.addParameter({
          id: "depth",
          name: "Depth",
          value: 1,
          min: 0,
          max: 1,
          step: 0.01
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 1,
          min: 0,
          max: 1,
          step: 0.01
        });
        break;
      case "internal-tape-sat":
        plugin.addParameter({
          id: "drive",
          name: "Drive",
          value: 0.3,
          min: 0,
          max: 1,
          step: 0.01
        });
        plugin.addParameter({
          id: "warmth",
          name: "Warmth",
          value: 0.4,
          min: 0,
          max: 1,
          step: 0.01
        });
        plugin.addParameter({
          id: "saturation",
          name: "Saturation",
          value: 0.3,
          min: 0,
          max: 1,
          step: 0.01
        });
        plugin.addParameter({
          id: "wet",
          name: "Wet",
          value: 0.5,
          min: 0,
          max: 1,
          step: 0.01
        });
        break;
      case "internal-sync-delay": {
        const syncDelay = new SyncDelayPlugin(
          crypto.randomUUID(),
          desc.name,
          desc.type
        );
        syncDelay.descriptorId = descriptorId;
        return syncDelay;
      }
      case "internal-convolver": {
        const convolver = new ConvolutionReverbPlugin(
          crypto.randomUUID(),
          desc.name,
          desc.type
        );
        convolver.descriptorId = descriptorId;
        return convolver;
      }
    }
    return plugin;
  }
};

// core/src/commands/impl/AddPluginCommand.ts
init_PluginInsert();
init_Logger();
var AddPluginCommand = class {
  constructor(session, trackId, pluginTypeId, index = 0, position = "pre") {
    this.type = "AddPlugin";
    this.processor = null;
    this.session = session;
    this.trackId = trackId;
    this.pluginTypeId = pluginTypeId;
    this.index = index;
    this.position = position;
  }
  get createdProcessor() {
    return this.processor;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    if (!this.processor) {
      const pluginManager = PluginManager.getInstance();
      const plugin = pluginManager.createPlugin(this.pluginTypeId);
      if (!plugin)
        throw new Error(`Plugin type ${this.pluginTypeId} not found`);
      this.processor = new PluginInsert(
        crypto.randomUUID(),
        plugin
      );
    }
    track.route.addProcessor(this.processor, this.position, this.index);
    logger.debug(
      "Command",
      `Added plugin ${this.processor.plugin.name} to track ${track.name} (${this.position})`
    );
  }
  async undo() {
    if (!this.processor) return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    track.route.removeProcessor(this.processor.id);
    logger.debug("Command", `Undid add plugin for track ${track.name}`);
  }
  async redo() {
    return this.execute();
  }
};

// core/src/commands/impl/RemovePluginCommand.ts
init_PluginInsert();
init_Logger();
var RemovePluginCommand = class {
  constructor(session, trackId, processorId) {
    this.type = "RemovePlugin";
    this.removedProcessor = null;
    this.removedPosition = "pre";
    this.removedIndex = -1;
    this.session = session;
    this.trackId = trackId;
    this.processorId = processorId;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    let index = -1;
    let position = "pre";
    if (track.route.preFaderProcessors.find(
      (p) => p.id === this.processorId
    )) {
      index = track.route.preFaderProcessors.findIndex(
        (p) => p.id === this.processorId
      );
      position = "pre";
    } else if (track.route.postFaderProcessors.find(
      (p) => p.id === this.processorId
    )) {
      index = track.route.postFaderProcessors.findIndex(
        (p) => p.id === this.processorId
      );
      position = "post";
    }
    if (index === -1) return;
    const processor = position === "pre" ? track.route.preFaderProcessors[index] : track.route.postFaderProcessors[index];
    if (processor instanceof PluginInsert) {
      this.removedProcessor = processor;
      this.removedIndex = index;
      this.removedPosition = position;
      track.route.removeProcessor(this.processorId);
      logger.debug(
        "Command",
        `Removed plugin ${processor.name} from track ${track.name}`
      );
    } else {
      logger.warn(
        "Command",
        `Target processor ${this.processorId} is not a plugin`
      );
    }
  }
  async undo() {
    if (!this.removedProcessor || this.removedIndex === -1) return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    track.route.addProcessor(
      this.removedProcessor,
      this.removedPosition,
      this.removedIndex
    );
    logger.debug("Command", `Undid remove plugin for track ${track.name}`);
  }
  async redo() {
    return this.execute();
  }
};

// core/src/commands/handlers/AutomationHandler.ts
var AutomationHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.ADD_AUTOMATION,
      CommandType.MOVE_AUTOMATION_POINT,
      CommandType.REMOVE_AUTOMATION_POINT,
      CommandType.ADD_PLUGIN,
      CommandType.REMOVE_PLUGIN,
      CommandType.SET_AUTOMATION_MODE
    ]);
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, history) {
    if (!payload) {
      return { success: false, message: `${commandType} requires a payload` };
    }
    switch (commandType) {
      case CommandType.ADD_AUTOMATION: {
        const cmd = new AddAutomationPointCommand(
          audioEngine.session,
          payload.trackId,
          payload.processorId,
          payload.parameter,
          payload.time,
          payload.value,
          payload.interpolation
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Automation point added to ${payload.parameter}`
        };
      }
      case CommandType.MOVE_AUTOMATION_POINT: {
        const cmd = new MoveAutomationPointCommand(
          audioEngine.session,
          payload.trackId,
          payload.processorId,
          payload.parameter,
          payload.pointId,
          payload.newTime,
          payload.newValue
        );
        await history.execute(cmd);
        return { success: true, message: "Automation point moved" };
      }
      case CommandType.REMOVE_AUTOMATION_POINT: {
        const cmd = new RemoveAutomationPointCommand(
          audioEngine.session,
          payload.trackId,
          payload.processorId,
          payload.parameter,
          payload.pointId
        );
        await history.execute(cmd);
        return { success: true, message: "Automation point removed" };
      }
      case CommandType.ADD_PLUGIN: {
        const cmd = new AddPluginCommand(
          audioEngine.session,
          payload.trackId,
          payload.pluginId,
          payload.index || 0,
          payload.position
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Plugin ${payload.pluginId} added (Processor ID: ${cmd.createdProcessor?.id})`
        };
      }
      case CommandType.REMOVE_PLUGIN: {
        const cmd = new RemovePluginCommand(
          audioEngine.session,
          payload.trackId,
          payload.processorId
        );
        await history.execute(cmd);
        return { success: true, message: "Plugin removed" };
      }
      case CommandType.SET_AUTOMATION_MODE: {
        const track = audioEngine.session.getTrack(payload.trackId);
        if (!track) {
          return {
            success: false,
            message: `Track not found: ${payload.trackId}`
          };
        }
        const allProcessors = [...track.route.processors, track.route.panner];
        const processor = allProcessors.find(
          (p) => p.id === payload.processorId
        );
        if (!processor) {
          return {
            success: false,
            message: `Processor not found: ${payload.processorId}`
          };
        }
        const list = processor.getAutomation(payload.parameter);
        list.mode = payload.mode;
        return {
          success: true,
          message: `Automation mode set to ${payload.mode}`
        };
      }
      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
};

// core/src/commands/impl/ExportCommand.ts
init_Logger();
var ExportCommand = class {
  constructor(config, status) {
    this.config = config;
    this.status = status;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    if (this.config.rangeId) {
      const range = session.getRange(this.config.rangeId);
      if (!range) {
        throw new Error(`Export range not found: ${this.config.rangeId}`);
      }
      this.config.setRange(range.start, range.end);
      logger.debug(
        "ExportCommand",
        `Using named range: ${range.name} (${range.start} - ${range.end})`
      );
    }
    if (this.config.endFrame === 0) {
      let maxEnd = 0;
      let regionCount = 0;
      session.tracks.forEach((track) => {
        const regions = track.playlist.getRegions();
        regionCount += regions.length;
        regions.forEach((region) => {
          maxEnd = Math.max(maxEnd, region.end);
          logger.debug(
            "ExportCommand",
            `Found region: ${region.name}, start=${region.start}, end=${region.end}`
          );
        });
      });
      logger.debug(
        "ExportCommand",
        `Total regions found: ${regionCount}, maxEnd: ${maxEnd}`
      );
      if (maxEnd === 0) {
        throw new Error(
          "No audio content found to export. Please add regions to tracks first."
        );
      }
      this.config.setRange(0, maxEnd);
    }
    if (!this.config.validate()) {
      throw new Error(
        "Invalid export configuration: endFrame must be greater than startFrame"
      );
    }
    logger.debug(
      "ExportCommand",
      `Export range: ${this.config.startFrame} to ${this.config.endFrame} (${(this.config.endFrame - this.config.startFrame) / this.config.sampleRate}s)`
    );
    const wasPlaying = session.isPlaying;
    if (wasPlaying) {
      engine.pause();
    }
    try {
      const trackIdsToExport = this.config.exportMasterOnly ? session.tracks.map((t) => t.id) : this.config.trackIds;
      logger.debug(
        "ExportCommand",
        `Session tracks: ${session.tracks.length}, IDs:`,
        trackIdsToExport
      );
      const backend = engine.backend;
      const availableTracks = backend.tracks ? Array.from(backend.tracks.keys()) : [];
      logger.debug("ExportCommand", `Backend tracks:`, availableTracks);
      if (trackIdsToExport.length === 0) {
        throw new Error("No tracks found in session");
      }
      this.config.trackIds = trackIdsToExport;
      await OfflineExporter.export(
        this.config,
        this.status,
        async (callbackTrackIds, startFrame, endFrame) => {
          const audioProvider = engine.backend;
          return await audioProvider.exportAudio(
            startFrame,
            endFrame,
            this.config.sampleRate,
            callbackTrackIds || trackIdsToExport
            // Fallback to our calculated trackIds
          );
        }
      );
      logger.debug("ExportCommand", `Export completed successfully`);
    } catch (error) {
      logger.error("ExportCommand", `Export failed:`, error);
      throw error;
    } finally {
      if (wasPlaying) {
        await engine.start();
      }
    }
  }
};

// core/src/commands/impl/SetGridCommand.ts
init_Logger();
var SetGridCommand = class {
  constructor(options) {
    this.gridType = options.gridType;
    this.snapMode = options.snapMode;
    this.snapToGrid = options.snapToGrid;
    this.bpm = options.bpm;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    const gridSettings = session.gridSettings;
    if (this.gridType !== void 0) {
      gridSettings.setGridType(this.gridType);
      logger.debug("SetGridCommand", `Grid type: ${this.gridType}`);
    }
    if (this.snapMode !== void 0) {
      gridSettings.setSnapMode(this.snapMode);
      logger.debug("SetGridCommand", `Snap mode: ${this.snapMode}`);
    }
    if (this.snapToGrid !== void 0) {
      gridSettings.setSnapToGrid(this.snapToGrid);
      logger.debug("SetGridCommand", `Snap to grid: ${this.snapToGrid}`);
    }
    if (this.bpm !== void 0) {
      gridSettings.setBPM(this.bpm);
      logger.debug("SetGridCommand", `BPM: ${this.bpm}`);
    }
  }
};

// core/src/commands/handlers/ExportHandler.ts
var ExportHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.EXPORT,
      CommandType.EXPORT_STEMS,
      CommandType.SET_GRID,
      CommandType.GET_GRID,
      CommandType.OPEN_EXPORT_DIALOG,
      CommandType.DEBUG_SESSION
    ]);
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, _history) {
    switch (commandType) {
      case CommandType.EXPORT: {
        const config = audioEngine.getExportConfig();
        const status = audioEngine.getExportStatus();
        if (payload?.filename) config.setFilename(payload.filename);
        if (payload?.format) config.setFormat(payload.format);
        if (payload?.sampleFormat)
          config.setSampleFormat(payload.sampleFormat);
        if (payload?.normalize !== void 0)
          config.setNormalize(payload.normalize);
        if (payload?.rangeId) {
          config.setRangeById(payload.rangeId);
        } else {
          const startFrame = payload?.startFrame ?? 0;
          const endFrame = payload?.endFrame ?? audioEngine.session.getSessionDuration();
          config.setRange(startFrame, endFrame);
        }
        const exportCmd = new ExportCommand(config, status);
        await exportCmd.execute();
        if (status.resultUrl) {
          if (typeof document !== "undefined") {
            const a = document.createElement("a");
            a.href = status.resultUrl;
            a.download = config.getFullPath();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
          return {
            success: true,
            message: `Export completed: ${config.getFullPath()}`,
            data: {
              filename: config.getFullPath(),
              size: status.resultBlob?.size,
              duration: config.getDuration() / config.sampleRate
            }
          };
        }
        return { success: false, message: "Export failed" };
      }
      case CommandType.EXPORT_STEMS: {
        const stemConfig = audioEngine.getExportConfig();
        const stemStatus = audioEngine.getExportStatus();
        if (payload?.filename)
          stemConfig.setFilename(payload.filename);
        if (payload?.format)
          stemConfig.setFormat(payload.format);
        if (payload?.normalize !== void 0)
          stemConfig.setNormalize(payload.normalize);
        const sessionStartFrame = 0;
        const sessionEndFrame = audioEngine.session.getSessionDuration();
        stemConfig.setRange(sessionStartFrame, sessionEndFrame);
        const allTrackIds = audioEngine.session.tracks.map((t) => t.id);
        const trackNameMap = /* @__PURE__ */ new Map();
        audioEngine.session.tracks.forEach(
          (t) => trackNameMap.set(t.id, t.name)
        );
        const stemBackend = audioEngine.backend;
        const stemResults = await OfflineExporter.exportStems(
          stemConfig,
          stemStatus,
          allTrackIds,
          trackNameMap,
          async (tids, start, end) => stemBackend.exportAudio(start, end, stemConfig.sampleRate, tids)
        );
        return {
          success: true,
          message: `Exported ${stemResults.size} stems`,
          data: { stemCount: stemResults.size }
        };
      }
      case CommandType.SET_GRID: {
        const cmd = new SetGridCommand({
          gridType: payload?.gridType,
          snapMode: payload?.snapMode,
          snapToGrid: payload?.snapToGrid,
          bpm: payload?.bpm
        });
        await cmd.execute();
        return {
          success: true,
          message: "Grid settings updated",
          data: audioEngine.session.gridSettings.toDTO()
        };
      }
      case CommandType.GET_GRID: {
        return {
          success: true,
          message: "Grid settings",
          data: audioEngine.session.gridSettings.toDTO()
        };
      }
      case CommandType.DEBUG_SESSION: {
        const session = audioEngine.session;
        const backend = audioEngine.backend;
        const backendEntries = backend.tracks ? Array.from(backend.tracks.entries()) : [];
        const debugInfo = {
          tracks: session.tracks.map((t) => ({
            id: t.id,
            name: t.name,
            regions: t.playlist.getRegions().map((r) => ({
              id: r.id,
              sourceId: r.sourceId,
              start: r.start,
              length: r.length,
              end: r.end
            }))
          })),
          sources: Array.from(session.sources.values()).map((s) => ({
            id: s.id,
            name: s.name,
            url: s.url,
            duration: s.duration
          })),
          bufferCache: backend.bufferCache ? Array.from(backend.bufferCache.keys()) : [],
          backendRegions: backendEntries.map(([trackId, ctx]) => ({
            trackId,
            regions: ctx.regions.map((r) => ({
              sourceId: r.sourceId,
              start: r.start,
              length: r.length
            }))
          })),
          sessionDuration: session.getSessionDuration()
        };
        return {
          success: true,
          message: "Session debug info",
          data: debugInfo
        };
      }
      case CommandType.OPEN_EXPORT_DIALOG: {
        return { success: true, message: "Open export dialog" };
      }
      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
};

// core/src/commands/handlers/IOHandler.ts
var IOHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.CONNECT_IO,
      CommandType.DISCONNECT_IO
    ]);
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, _history) {
    if (!payload) {
      return { success: false, message: `${commandType} requires a payload` };
    }
    switch (commandType) {
      case CommandType.CONNECT_IO: {
        const sourceIO = audioEngine.session.getIO(payload.sourceId);
        const destIO = audioEngine.session.getIO(payload.destId);
        if (sourceIO && destIO) {
          try {
            sourceIO.connect(destIO.id);
            return {
              success: true,
              message: `Connected ${payload.sourceId} to ${payload.destId}`
            };
          } catch (e) {
            return {
              success: false,
              message: `Connection failed: ${e.message}`
            };
          }
        }
        return {
          success: false,
          message: "Source or Destination IO not found"
        };
      }
      case CommandType.DISCONNECT_IO: {
        const sourceIO = audioEngine.session.getIO(payload.sourceId);
        const destIO = audioEngine.session.getIO(payload.destId);
        if (sourceIO && destIO) {
          sourceIO.disconnect(destIO.id);
          return {
            success: true,
            message: `Disconnected ${payload.sourceId} from ${payload.destId}`
          };
        }
        return {
          success: false,
          message: "Source or Destination IO not found"
        };
      }
      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
};

// core/src/domain/DragManager.ts
init_Signal();
var DragManager = class _DragManager {
  constructor() {
    this.dragAborted = new Signal();
    this._activeDragCount = 0;
  }
  static getInstance() {
    if (!_DragManager.instance) {
      _DragManager.instance = new _DragManager();
    }
    return _DragManager.instance;
  }
  registerDrag() {
    this._activeDragCount++;
  }
  unregisterDrag() {
    this._activeDragCount = Math.max(0, this._activeDragCount - 1);
  }
  get active() {
    return this._activeDragCount > 0;
  }
  abort() {
    if (this._activeDragCount > 0) {
      this._activeDragCount = 0;
      this.dragAborted.emit();
    }
  }
};

// core/src/domain/SelectionHistory.ts
init_Signal();
var SelectionHistory = class {
  constructor() {
    this.history = [];
    this.currentIndex = 0;
    this.changed = new Signal();
  }
  /**
   * Initialize/reset the selection history with the current selection.
   * Called at the start of a session and after main undo/redo operations.
   */
  begin(currentSelection) {
    this.history = [new Set(currentSelection)];
    this.currentIndex = 0;
    this.changed.emit();
  }
  /**
   * Commit a new selection state snapshot.
   * Trims any forward (redo) history.
   */
  commit(selectionSnapshot) {
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }
    this.history.push(new Set(selectionSnapshot));
    this.currentIndex = this.history.length - 1;
    this.changed.emit();
  }
  /**
   * Undo the last selection change.
   * Returns the previous selection state, or null if nothing to undo.
   */
  undo() {
    if (!this.canUndo) return null;
    this.currentIndex++;
    const snapshot = this.history[this.history.length - 1 - this.currentIndex];
    this.changed.emit();
    return snapshot ? new Set(snapshot) : null;
  }
  /**
   * Redo the next selection change.
   * Returns the next selection state, or null if nothing to redo.
   */
  redo() {
    if (!this.canRedo) return null;
    this.currentIndex--;
    const snapshot = this.history[this.history.length - 1 - this.currentIndex];
    this.changed.emit();
    return snapshot ? new Set(snapshot) : null;
  }
  get canUndo() {
    return this.currentIndex < this.history.length - 1;
  }
  get canRedo() {
    return this.currentIndex > 0;
  }
};

// core/src/commands/handlers/HistoryHandler.ts
var HistoryHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.UNDO,
      CommandType.REDO,
      CommandType.SELECTION_UNDO,
      CommandType.SELECTION_REDO
    ]);
    this._selectionHistory = null;
    this._selectionConnected = false;
  }
  get selectionHistory() {
    if (!this._selectionHistory) {
      this._selectionHistory = new SelectionHistory();
    }
    return this._selectionHistory;
  }
  getSelectionHistory() {
    return this.selectionHistory;
  }
  /**
   * Connect selection history to session's selectionChanged signal.
   * Called lazily on first command execution.
   */
  ensureSelectionTracking(audioEngine) {
    if (this._selectionConnected) return;
    this._selectionConnected = true;
    const session = audioEngine.session;
    this.selectionHistory.begin(new Set(session.getSelectedRegionIds()));
    session.selectionChanged.connect((selection) => {
      this.selectionHistory.commit(selection);
    });
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, history) {
    this.ensureSelectionTracking(audioEngine);
    switch (commandType) {
      case CommandType.UNDO: {
        if (audioEngine.session.isRecording) {
          return { success: false, message: "Cannot undo while recording" };
        }
        if (!history.canUndo) {
          return { success: false, message: "Nothing to undo" };
        }
        if (DragManager.getInstance().active) {
          DragManager.getInstance().abort();
        }
        RegionClipboard.getInstance().resetPasteCount();
        await history.undo();
        const currentSelection = audioEngine.session.getSelectedRegionIds();
        this.selectionHistory.begin(new Set(currentSelection));
        return { success: true, message: "Undo successful" };
      }
      case CommandType.REDO: {
        if (audioEngine.session.isRecording) {
          return { success: false, message: "Cannot redo while recording" };
        }
        if (!history.canRedo) {
          return { success: false, message: "Nothing to redo" };
        }
        if (DragManager.getInstance().active) {
          DragManager.getInstance().abort();
        }
        RegionClipboard.getInstance().resetPasteCount();
        await history.redo();
        const currentSelectionRedo = audioEngine.session.getSelectedRegionIds();
        this.selectionHistory.begin(new Set(currentSelectionRedo));
        return { success: true, message: "Redo successful" };
      }
      case CommandType.SELECTION_UNDO: {
        const snapshot = this.selectionHistory.undo();
        if (!snapshot) {
          return {
            success: false,
            message: "Nothing to undo in selection history"
          };
        }
        audioEngine.session.clearSelection();
        for (const regionId of snapshot) {
          audioEngine.session.selectRegion(regionId, true);
        }
        return { success: true, message: "Selection undo successful" };
      }
      case CommandType.SELECTION_REDO: {
        const snapshot = this.selectionHistory.redo();
        if (!snapshot) {
          return {
            success: false,
            message: "Nothing to redo in selection history"
          };
        }
        audioEngine.session.clearSelection();
        for (const regionId of snapshot) {
          audioEngine.session.selectRegion(regionId, true);
        }
        return { success: true, message: "Selection redo successful" };
      }
      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
};

// core/src/commands/impl/AddSendBusCommand.ts
init_Logger();
var AddSendBusCommand = class {
  constructor(payload) {
    this.payload = payload;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const sendBus = engine.session.addSendBus(
      this.payload.sourceTrackId,
      this.payload.destId,
      this.payload.level ?? 0,
      this.payload.preFader ?? false,
      this.payload.id
    );
    this._createdSendBusId = sendBus.id;
    logger.debug(
      "AddSendBusCommand",
      `Added send bus ${sendBus.id}: ${this.payload.sourceTrackId} -> ${this.payload.destId}`
    );
  }
  async undo() {
    if (!this._createdSendBusId) return;
    const engine = AudioEngine.getInstance();
    engine.session.removeSendBus(this._createdSendBusId);
    logger.debug(
      "AddSendBusCommand",
      `Undo: removed send bus ${this._createdSendBusId}`
    );
  }
  async redo() {
    this.payload.id = this._createdSendBusId;
    await this.execute();
  }
};

// core/src/commands/impl/RemoveSendBusCommand.ts
init_Logger();
var RemoveSendBusCommand = class {
  constructor(payload) {
    this.payload = payload;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const sendBus = engine.session.getSendBus(this.payload.sendBusId);
    if (!sendBus) {
      logger.warn(
        "RemoveSendBusCommand",
        `SendBus not found: ${this.payload.sendBusId}`
      );
      return;
    }
    this._removedSendBus = sendBus;
    engine.session.removeSendBus(this.payload.sendBusId);
    logger.debug(
      "RemoveSendBusCommand",
      `Removed send bus ${this.payload.sendBusId}`
    );
  }
  async undo() {
    if (!this._removedSendBus) return;
    const engine = AudioEngine.getInstance();
    const sb = this._removedSendBus;
    engine.session.addSendBus(
      sb.sourceTrackId,
      sb.destId,
      sb.level,
      sb.preFader,
      sb.id
    );
    logger.debug("RemoveSendBusCommand", `Undo: restored send bus ${sb.id}`);
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/SetSendLevelCommand.ts
init_Logger();
var SetSendLevelCommand = class {
  constructor(payload) {
    this.payload = payload;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const sendBus = engine.session.getSendBus(this.payload.sendBusId);
    if (!sendBus) {
      logger.warn(
        "SetSendLevelCommand",
        `SendBus not found: ${this.payload.sendBusId}`
      );
      return;
    }
    this._previousLevel = sendBus.level;
    sendBus.setLevel(this.payload.level);
    logger.debug(
      "SetSendLevelCommand",
      `Set level ${this.payload.sendBusId}: ${this._previousLevel} -> ${this.payload.level}`
    );
  }
  async undo() {
    if (this._previousLevel === void 0) return;
    const engine = AudioEngine.getInstance();
    const sendBus = engine.session.getSendBus(this.payload.sendBusId);
    if (!sendBus) return;
    sendBus.setLevel(this._previousLevel);
    logger.debug(
      "SetSendLevelCommand",
      `Undo: restored level ${this.payload.sendBusId} -> ${this._previousLevel}`
    );
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/handlers/SendBusHandler.ts
var SendBusHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.ADD_SEND_BUS,
      CommandType.REMOVE_SEND_BUS,
      CommandType.SET_SEND_LEVEL
    ]);
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, history) {
    if (!payload) {
      return { success: false, message: `${commandType} requires a payload` };
    }
    switch (commandType) {
      case CommandType.ADD_SEND_BUS: {
        const cmd = new AddSendBusCommand({
          sourceTrackId: payload.sourceTrackId,
          destId: payload.destId,
          level: payload.level,
          preFader: payload.preFader,
          id: payload.id
        });
        await history.execute(cmd);
        return {
          success: true,
          message: `Send Bus added (${payload.sourceTrackId} -> ${payload.destId})`
        };
      }
      case CommandType.REMOVE_SEND_BUS: {
        const cmd = new RemoveSendBusCommand({
          sendBusId: payload.sendBusId
        });
        await history.execute(cmd);
        return {
          success: true,
          message: `Send Bus removed (${payload.sendBusId})`
        };
      }
      case CommandType.SET_SEND_LEVEL: {
        const cmd = new SetSendLevelCommand({
          sendBusId: payload.sendBusId,
          level: payload.level
        });
        await history.execute(cmd);
        return {
          success: true,
          message: `Send Bus level set: ${payload.sendBusId} -> ${payload.level}dB`
        };
      }
      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
};

// core/src/storage/SessionStorage.ts
var DB_VERSION = 1;
var SESSIONS_STORE = "sessions";
var SNAPSHOTS_STORE = "snapshots";
var SessionStorage = class _SessionStorage {
  constructor() {
    this.dbPromise = null;
  }
  static getInstance() {
    if (!_SessionStorage.instance) {
      _SessionStorage.instance = new _SessionStorage();
    }
    return _SessionStorage.instance;
  }
  // ─── Database Initialisation ─────────────────────────────────────────────
  openDB() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DAW_DATABASE_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const sessionsStore = db.createObjectStore(SESSIONS_STORE, {
            keyPath: "id"
          });
          sessionsStore.createIndex("name", "name", { unique: false });
          sessionsStore.createIndex("modified", "modified", { unique: false });
        }
        if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
          const snapshotsStore = db.createObjectStore(SNAPSHOTS_STORE, {
            keyPath: "id"
          });
          snapshotsStore.createIndex("sessionId", "sessionId", {
            unique: false
          });
          snapshotsStore.createIndex("created", "created", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });
    return this.dbPromise;
  }
  // ─── Session CRUD ────────────────────────────────────────────────────────
  /**
   * Save (insert or update) a session snapshot to IndexedDB.
   */
  async saveSession(session) {
    const db = await this.openDB();
    const snapshot = session.toJSON();
    const record = {
      id: snapshot.id,
      name: snapshot.name,
      modified: (/* @__PURE__ */ new Date()).toISOString(),
      snapshot
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, "readwrite");
      tx.objectStore(SESSIONS_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  /**
   * Load a session snapshot by ID.
   */
  async loadSession(id) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, "readonly");
      const request = tx.objectStore(SESSIONS_STORE).get(id);
      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? record.snapshot : null);
      };
      request.onerror = () => reject(request.error);
    });
  }
  /**
   * List all saved sessions (lightweight metadata only).
   */
  async listSessions() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, "readonly");
      const request = tx.objectStore(SESSIONS_STORE).getAll();
      request.onsuccess = () => {
        const records = request.result ?? [];
        resolve(
          records.map((r) => ({
            id: r.id,
            name: r.name,
            modified: new Date(r.modified)
          }))
        );
      };
      request.onerror = () => reject(request.error);
    });
  }
  /**
   * Delete a session and all its snapshots.
   */
  async deleteSession(id) {
    const db = await this.openDB();
    const snapshots = await this.listSnapshots(id);
    return new Promise((resolve, reject) => {
      const tx = db.transaction([SESSIONS_STORE, SNAPSHOTS_STORE], "readwrite");
      tx.objectStore(SESSIONS_STORE).delete(id);
      for (const snap of snapshots) {
        tx.objectStore(SNAPSHOTS_STORE).delete(snap.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  // ─── Named Snapshots ─────────────────────────────────────────────────────
  /**
   * Save a named snapshot of the given session.
   * Returns the snapshot ID.
   */
  async saveSnapshot(sessionId, name, snapshot) {
    const db = await this.openDB();
    const id = crypto.randomUUID();
    const entry = {
      id,
      sessionId,
      name,
      created: /* @__PURE__ */ new Date(),
      snapshot
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readwrite");
      tx.objectStore(SNAPSHOTS_STORE).put({
        ...entry,
        created: entry.created.toISOString()
      });
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  }
  /**
   * List all snapshots for a given session.
   */
  async listSnapshots(sessionId) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readonly");
      const index = tx.objectStore(SNAPSHOTS_STORE).index("sessionId");
      const request = index.getAll(sessionId);
      request.onsuccess = () => {
        const records = request.result ?? [];
        resolve(
          records.map((r) => ({
            id: r.id,
            name: r.name,
            created: new Date(r.created)
          }))
        );
      };
      request.onerror = () => reject(request.error);
    });
  }
  /**
   * Load a specific snapshot by ID.
   */
  async loadSnapshot(snapshotId) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readonly");
      const request = tx.objectStore(SNAPSHOTS_STORE).get(snapshotId);
      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? record.snapshot : null);
      };
      request.onerror = () => reject(request.error);
    });
  }
  /**
   * Delete a specific snapshot.
   */
  async deleteSnapshot(snapshotId) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readwrite");
      tx.objectStore(SNAPSHOTS_STORE).delete(snapshotId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};

// core/src/commands/impl/SaveSessionCommand.ts
init_Logger();
var SaveSessionCommand = class {
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    const storage = SessionStorage.getInstance();
    await storage.saveSession(session);
    const snapshot = session.toJSON();
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${session.name.replace(/\s+/g, "_")}_session.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    logger.debug("SaveSessionCommand", `Session saved: ${session.name}`);
  }
  async undo() {
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/LoadSessionCommand.ts
init_Logger();
var LoadSessionCommand = class {
  constructor(snapshot) {
    this.snapshotToLoad = snapshot;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    this._snapshotBeforeLoad = engine.session.toJSON();
    await this.applySnapshot(this.snapshotToLoad, engine);
    logger.debug(
      "LoadSessionCommand",
      `Session loaded: ${this.snapshotToLoad.name}`
    );
  }
  async undo() {
    if (!this._snapshotBeforeLoad) return;
    const engine = AudioEngine.getInstance();
    await this.applySnapshot(this._snapshotBeforeLoad, engine);
    logger.debug("LoadSessionCommand", `Undo: restored previous session state`);
  }
  async redo() {
    await this.execute();
  }
  /**
   * 기존 세션을 비우고 스냅샷으로부터 상태를 복원합니다.
   * UI Signal 체계를 유지하기 위해 기존 Session 인스턴스를 재사용합니다.
   */
  async applySnapshot(snapshot, engine) {
    const session = engine.session;
    const existingTrackIds = session.tracks.map((t) => t.id);
    for (const id of existingTrackIds) {
      session.removeTrack(id);
    }
    const existingSendBusIds = session.sendBuses.map((sb) => sb.id);
    for (const id of existingSendBusIds) {
      session.removeSendBus(id);
    }
    session.tempo = snapshot.tempo;
    session.timeSignature = snapshot.timeSignature;
    session.tempoChanged.emit(snapshot.tempo);
    const { Session: SessionClass } = await Promise.resolve().then(() => (init_Session(), Session_exports));
    const _restoredSession = SessionClass.fromJSON(snapshot);
    for (const trackData of snapshot.tracks) {
      const track = session.addTrack(
        trackData.name,
        trackData.type,
        trackData.id
      );
      track.armed = trackData.armed;
      track.mute = trackData.mute;
      track.solo = trackData.solo;
      for (const regionData of trackData.regions) {
        const { Region: Region2 } = await Promise.resolve().then(() => (init_Region(), Region_exports));
        const region = new Region2(
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
        region.fadeIn = regionData.fadeIn;
        region.fadeOut = regionData.fadeOut;
        region.playbackRate = regionData.playbackRate;
        region.timeDomain = regionData.timeDomain;
        track.playlist.addRegion(region);
      }
    }
    for (const sbData of snapshot.sendBuses) {
      session.addSendBus(
        sbData.sourceTrackId,
        sbData.destId,
        sbData.level,
        sbData.preFader,
        sbData.id
      );
    }
  }
};

// core/src/commands/impl/NewSessionCommand.ts
init_Session();

// core/src/storage/SessionTemplate.ts
init_Session();
init_Signal();
var SessionTemplateManager = class _SessionTemplateManager {
  constructor() {
    this._templates = /* @__PURE__ */ new Map();
    this.templatesChanged = new Signal();
    for (const t of _SessionTemplateManager.getDefaultTemplates()) {
      this._templates.set(t.id, t);
    }
  }
  // ─── CRUD ─────────────────────────────────────────────────────────────────
  /**
   * Add a new template. An `id`, `createdAt`, and `updatedAt` are generated
   * automatically.
   */
  addTemplate(template) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const full = {
      ...template,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this._templates.set(full.id, full);
    this.templatesChanged.emit();
    return full;
  }
  /**
   * Update an existing template. Only the supplied fields are merged; the
   * `updatedAt` timestamp is refreshed automatically.
   */
  updateTemplate(id, updates) {
    const existing = this._templates.get(id);
    if (!existing) {
      throw new Error(`SessionTemplate not found: ${id}`);
    }
    const updated = {
      ...existing,
      ...updates,
      id,
      // prevent ID overwrite
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this._templates.set(id, updated);
    this.templatesChanged.emit();
  }
  /**
   * Remove a template by ID.
   */
  removeTemplate(id) {
    if (this._templates.delete(id)) {
      this.templatesChanged.emit();
    }
  }
  /**
   * Get a single template by ID.
   */
  getTemplate(id) {
    return this._templates.get(id);
  }
  /**
   * Get all registered templates.
   */
  getAllTemplates() {
    return Array.from(this._templates.values());
  }
  /**
   * Get templates filtered by category.
   */
  getTemplatesByCategory(category) {
    return this.getAllTemplates().filter((t) => t.category === category);
  }
  // ─── Create template from a live Session ──────────────────────────────────
  /**
   * Snapshot a Session into a reusable template.
   */
  static createFromSession(session, name, description) {
    const trackTemplates = session.tracks.map(
      (track) => ({
        name: track.name,
        type: track.type,
        color: track.color,
        armed: track.armed,
        monitorMode: track.monitorMode
      })
    );
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return {
      id: crypto.randomUUID(),
      name,
      description,
      category: "custom",
      sampleRate: session.sampleRate,
      tempo: session.tempo,
      timeSignature: [...session.timeSignature],
      tracks: trackTemplates,
      createdAt: now,
      updatedAt: now
    };
  }
  // ─── Built-in default templates ──────────────────────────────────────────
  static getDefaultTemplates() {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return [
      // 1. Empty Session
      {
        id: "tpl-empty",
        name: "Empty Session",
        description: "A blank slate with no tracks \u2014 start from scratch.",
        category: "custom",
        sampleRate: 44100,
        tempo: 120,
        timeSignature: [4, 4],
        tracks: [],
        createdAt: now,
        updatedAt: now
      },
      // 2. Basic Recording (8 audio tracks)
      {
        id: "tpl-basic-recording",
        name: "Basic Recording",
        description: "8 audio tracks pre-named for a typical drum/bass/vocal recording session.",
        category: "recording",
        sampleRate: 48e3,
        tempo: 120,
        timeSignature: [4, 4],
        tracks: [
          {
            name: "Kick",
            type: "AUDIO" /* AUDIO */,
            color: "#ff6b6b",
            armed: true
          },
          {
            name: "Snare",
            type: "AUDIO" /* AUDIO */,
            color: "#ff922b",
            armed: true
          },
          {
            name: "HiHat",
            type: "AUDIO" /* AUDIO */,
            color: "#ffd43b",
            armed: true
          },
          {
            name: "Toms",
            type: "AUDIO" /* AUDIO */,
            color: "#51cf66",
            armed: true
          },
          { name: "OHL", type: "AUDIO" /* AUDIO */, color: "#20c997", armed: true },
          { name: "OHR", type: "AUDIO" /* AUDIO */, color: "#4a9eff", armed: true },
          {
            name: "Bass DI",
            type: "AUDIO" /* AUDIO */,
            color: "#cc5de8",
            armed: true
          },
          {
            name: "Vocal",
            type: "AUDIO" /* AUDIO */,
            color: "#f06595",
            armed: true
          }
        ],
        createdAt: now,
        updatedAt: now
      },
      // 3. Podcast (2 audio + 1 music bed)
      {
        id: "tpl-podcast",
        name: "Podcast",
        description: "2 voice tracks (Host, Guest) and a music-bed audio track for podcast production.",
        category: "podcast",
        sampleRate: 48e3,
        tempo: 120,
        timeSignature: [4, 4],
        tracks: [
          {
            name: "Host",
            type: "AUDIO" /* AUDIO */,
            color: "#4a9eff",
            armed: true,
            monitorMode: "auto"
          },
          {
            name: "Guest",
            type: "AUDIO" /* AUDIO */,
            color: "#51cf66",
            armed: true,
            monitorMode: "auto"
          },
          {
            name: "Music Bed",
            type: "AUDIO" /* AUDIO */,
            color: "#cc5de8",
            armed: false
          }
        ],
        createdAt: now,
        updatedAt: now
      },
      // 4. Song Production (4 audio + 2 MIDI + 1 bus)
      {
        id: "tpl-song-production",
        name: "Song Production",
        description: "4 audio tracks, 2 MIDI tracks, and a Drums bus for modern song production.",
        category: "production",
        sampleRate: 48e3,
        tempo: 128,
        timeSignature: [4, 4],
        tracks: [
          { name: "Kick", type: "AUDIO" /* AUDIO */, color: "#ff6b6b" },
          { name: "Snare", type: "AUDIO" /* AUDIO */, color: "#ff922b" },
          { name: "HiHat", type: "AUDIO" /* AUDIO */, color: "#ffd43b" },
          {
            name: "Vocal",
            type: "AUDIO" /* AUDIO */,
            color: "#f06595",
            armed: true
          },
          { name: "Synth Lead", type: "MIDI" /* MIDI */, color: "#4a9eff" },
          { name: "Synth Pad", type: "MIDI" /* MIDI */, color: "#cc5de8" },
          { name: "Drums Bus", type: "BUS" /* BUS */, color: "#868e96" }
        ],
        createdAt: now,
        updatedAt: now
      },
      // 5. Mixing (pre-configured bus structure)
      {
        id: "tpl-mixing",
        name: "Mixing",
        description: "Pre-configured bus structure for mixing: Drums, Bass, Keys, Vocals, and FX buses.",
        category: "mixing",
        sampleRate: 48e3,
        tempo: 120,
        timeSignature: [4, 4],
        tracks: [
          { name: "Drums Bus", type: "BUS" /* BUS */, color: "#ff6b6b" },
          { name: "Bass Bus", type: "BUS" /* BUS */, color: "#ff922b" },
          { name: "Keys Bus", type: "BUS" /* BUS */, color: "#ffd43b" },
          { name: "Vocals Bus", type: "BUS" /* BUS */, color: "#4a9eff" },
          { name: "FX Bus", type: "BUS" /* BUS */, color: "#cc5de8" }
        ],
        createdAt: now,
        updatedAt: now
      },
      // 6. Mastering (1 stereo audio + 1 reference)
      {
        id: "tpl-mastering",
        name: "Mastering",
        description: "1 stereo audio track for the mix and a reference track for A/B comparison.",
        category: "mastering",
        sampleRate: 96e3,
        tempo: 120,
        timeSignature: [4, 4],
        tracks: [
          { name: "Mix", type: "AUDIO" /* AUDIO */, color: "#4a9eff" },
          { name: "Reference", type: "AUDIO" /* AUDIO */, color: "#868e96" }
        ],
        createdAt: now,
        updatedAt: now
      }
    ];
  }
  // ─── Serialization ────────────────────────────────────────────────────────
  /**
   * Serialize all templates to a JSON string.
   */
  serialize() {
    const snapshot = {
      templates: this.getAllTemplates()
    };
    return JSON.stringify(snapshot, null, 2);
  }
  /**
   * Restore a SessionTemplateManager from a JSON string produced by
   * `serialize()`.
   */
  static deserialize(json) {
    const snapshot = JSON.parse(json);
    const manager = new _SessionTemplateManager();
    manager._templates.clear();
    for (const t of snapshot.templates) {
      manager._templates.set(t.id, t);
    }
    return manager;
  }
};
function createFromTemplate(templateId) {
  const templates = SessionTemplateManager.getDefaultTemplates();
  const template = templates.find((t) => t.id === templateId);
  if (!template) {
    throw new Error(`Unknown template: ${templateId}`);
  }
  const session = new Session(template.name, void 0, template.sampleRate);
  session.tempo = template.tempo;
  session.timeSignature = [...template.timeSignature];
  for (const tt of template.tracks) {
    const track = session.addTrack(tt.name, tt.type);
    if (tt.color) {
      track.color = tt.color;
    }
    if (tt.armed) {
      track.armed = true;
    }
  }
  return session;
}

// core/src/commands/impl/NewSessionCommand.ts
init_Logger();
var NewSessionCommand = class {
  constructor(name, templateId) {
    this.name = name;
    this.templateId = templateId;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    this._snapshotBeforeNew = engine.session.toJSON();
    let newSession;
    if (this.templateId) {
      newSession = createFromTemplate(this.templateId);
      if (this.name) {
        newSession.name = this.name;
      }
    } else {
      newSession = new Session(this.name ?? "Untitled Session");
    }
    await this.applySnapshot(newSession.toJSON(), engine);
    logger.debug(
      "NewSessionCommand",
      `New session created: ${engine.session.name}`
    );
  }
  async undo() {
    if (!this._snapshotBeforeNew) return;
    const engine = AudioEngine.getInstance();
    await this.applySnapshot(this._snapshotBeforeNew, engine);
    logger.debug("NewSessionCommand", `Undo: restored previous session`);
  }
  async redo() {
    await this.execute();
  }
  async applySnapshot(snapshot, engine) {
    const session = engine.session;
    const existingTrackIds = session.tracks.map((t) => t.id);
    for (const id of existingTrackIds) {
      session.removeTrack(id);
    }
    const existingSendBusIds = session.sendBuses.map((sb) => sb.id);
    for (const id of existingSendBusIds) {
      session.removeSendBus(id);
    }
    session.name = snapshot.name;
    session.tempo = snapshot.tempo;
    session.timeSignature = snapshot.timeSignature;
    session.tempoChanged.emit(snapshot.tempo);
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
      for (const regionData of trackData.regions) {
        const { Region: Region2 } = await Promise.resolve().then(() => (init_Region(), Region_exports));
        const region = new Region2(
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
        region.fadeIn = regionData.fadeIn;
        region.fadeOut = regionData.fadeOut;
        region.playbackRate = regionData.playbackRate;
        region.timeDomain = regionData.timeDomain;
        if (regionData.locked) region.locked = regionData.locked;
        track.playlist.addRegion(region);
      }
    }
    for (const sbData of snapshot.sendBuses) {
      session.addSendBus(
        sbData.sourceTrackId,
        sbData.destId,
        sbData.level,
        sbData.preFader,
        sbData.id
      );
    }
  }
};

// core/src/commands/impl/SaveSnapshotCommand.ts
init_Logger();
var SaveSnapshotCommand = class {
  constructor(name) {
    this.snapshotName = name;
  }
  get snapshotId() {
    return this._snapshotId;
  }
  async execute() {
    const engine = AudioEngine.getInstance();
    const session = engine.session;
    const storage = SessionStorage.getInstance();
    const snapshot = session.toJSON();
    this._snapshotId = await storage.saveSnapshot(
      session.id,
      this.snapshotName,
      snapshot
    );
    logger.debug(
      "SaveSnapshotCommand",
      `Snapshot "${this.snapshotName}" saved (id: ${this._snapshotId})`
    );
  }
  async undo() {
    if (this._snapshotId) {
      const storage = SessionStorage.getInstance();
      await storage.deleteSnapshot(this._snapshotId);
      logger.debug(
        "SaveSnapshotCommand",
        `Undo: deleted snapshot ${this._snapshotId}`
      );
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/handlers/SessionHandler.ts
var SessionHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.SAVE_SESSION,
      CommandType.LOAD_SESSION,
      CommandType.NEW_SESSION,
      CommandType.SAVE_SNAPSHOT
    ]);
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, history) {
    switch (commandType) {
      case CommandType.SAVE_SESSION: {
        const cmd = new SaveSessionCommand();
        await cmd.execute();
        return {
          success: true,
          message: `Session saved: ${audioEngine.session.name}`
        };
      }
      case CommandType.LOAD_SESSION: {
        let snapshot = null;
        if (payload?.snapshot) {
          snapshot = payload.snapshot;
        } else if (payload?.sessionId) {
          const storage = SessionStorage.getInstance();
          snapshot = await storage.loadSession(payload.sessionId);
          if (!snapshot) {
            return {
              success: false,
              message: `Session not found: ${payload.sessionId}`
            };
          }
        }
        if (!snapshot) {
          return {
            success: false,
            message: "LOAD_SESSION: snapshot or sessionId is required"
          };
        }
        const cmd = new LoadSessionCommand(snapshot);
        await history.execute(cmd);
        return { success: true, message: `Session loaded: ${snapshot.name}` };
      }
      case CommandType.NEW_SESSION: {
        const name = payload?.name;
        const templateId = payload?.templateId;
        const cmd = new NewSessionCommand(name, templateId);
        await history.execute(cmd);
        return {
          success: true,
          message: `New session created: ${audioEngine.session.name}`
        };
      }
      case CommandType.SAVE_SNAPSHOT: {
        const snapshotName = payload?.name;
        if (!snapshotName) {
          return { success: false, message: "SAVE_SNAPSHOT: name is required" };
        }
        const cmd = new SaveSnapshotCommand(snapshotName);
        await cmd.execute();
        return {
          success: true,
          message: `Snapshot "${snapshotName}" saved`,
          data: { snapshotId: cmd.snapshotId }
        };
      }
      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
};

// core/src/commands/impl/AddMarkerCommand.ts
init_Logger();
var AddMarkerCommand = class {
  constructor(name, position, color) {
    this.name = name;
    this.position = position;
    this.color = color;
  }
  async execute() {
    const session = AudioEngine.getInstance().session;
    const marker = session.addMarker(this.name, this.position, this.color);
    this.markerId = marker.id;
    logger.debug(
      "AddMarkerCommand",
      `Added marker "${this.name}" at frame ${this.position}`
    );
  }
  async undo() {
    if (this.markerId) {
      const session = AudioEngine.getInstance().session;
      session.removeMarker(this.markerId);
      logger.debug("AddMarkerCommand", `Undo: removed marker "${this.name}"`);
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/RemoveMarkerCommand.ts
init_Logger();
var RemoveMarkerCommand = class {
  constructor(markerId) {
    this.markerId = markerId;
  }
  async execute() {
    const session = AudioEngine.getInstance().session;
    const marker = session.getMarker(this.markerId);
    if (!marker) throw new Error(`Marker not found: ${this.markerId}`);
    this.savedName = marker.name;
    this.savedPosition = marker.position;
    this.savedColor = marker.color;
    this.savedLocked = marker.locked;
    session.removeMarker(this.markerId);
    logger.debug("RemoveMarkerCommand", `Removed marker "${this.savedName}"`);
  }
  async undo() {
    if (this.savedName !== void 0 && this.savedPosition !== void 0) {
      const session = AudioEngine.getInstance().session;
      const marker = session.addMarker(
        this.savedName,
        this.savedPosition,
        this.savedColor,
        this.markerId
      );
      if (this.savedLocked) marker.locked = true;
      logger.debug(
        "RemoveMarkerCommand",
        `Undo: restored marker "${this.savedName}"`
      );
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/MoveMarkerCommand.ts
init_Logger();
var MoveMarkerCommand = class {
  constructor(markerId, newPosition) {
    this.markerId = markerId;
    this.newPosition = newPosition;
  }
  async execute() {
    const session = AudioEngine.getInstance().session;
    const marker = session.getMarker(this.markerId);
    if (!marker) throw new Error(`Marker not found: ${this.markerId}`);
    this.oldPosition = marker.position;
    marker.position = this.newPosition;
    logger.debug(
      "MoveMarkerCommand",
      `Moved marker "${marker.name}" from ${this.oldPosition} to ${this.newPosition}`
    );
  }
  async undo() {
    if (this.oldPosition !== void 0) {
      const session = AudioEngine.getInstance().session;
      const marker = session.getMarker(this.markerId);
      if (marker) {
        marker.position = this.oldPosition;
      }
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/handlers/MarkerHandler.ts
var MarkerHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.ADD_MARKER,
      CommandType.REMOVE_MARKER,
      CommandType.MOVE_MARKER,
      CommandType.LIST_MARKERS,
      CommandType.GOTO_NEXT_MARKER,
      CommandType.GOTO_PREV_MARKER,
      CommandType.RENAME_MARKER,
      CommandType.SET_MARKER_LOCKED
    ]);
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, history) {
    if (!payload) {
      return { success: false, message: `${commandType} requires a payload` };
    }
    switch (commandType) {
      case CommandType.ADD_MARKER: {
        const cmd = new AddMarkerCommand(
          payload.name,
          payload.position,
          payload.color
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Added marker "${payload.name}" at frame ${payload.position}`
        };
      }
      case CommandType.REMOVE_MARKER: {
        const cmd = new RemoveMarkerCommand(payload.markerId);
        await history.execute(cmd);
        return { success: true, message: `Removed marker ${payload.markerId}` };
      }
      case CommandType.MOVE_MARKER: {
        const cmd = new MoveMarkerCommand(
          payload.markerId,
          payload.position
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Moved marker to frame ${payload.position}`
        };
      }
      case CommandType.LIST_MARKERS: {
        const markers = audioEngine.session.markers.map((m) => ({
          id: m.id,
          name: m.name,
          position: m.position,
          time: (m.position / audioEngine.session.sampleRate).toFixed(2) + "s",
          color: m.color,
          locked: m.locked
        }));
        return {
          success: true,
          message: `${markers.length} marker(s)`,
          data: markers
        };
      }
      case CommandType.GOTO_NEXT_MARKER: {
        const currentFrame = audioEngine.getCurrentFrame();
        const nextMarker = audioEngine.session.getNextMarker(currentFrame);
        if (nextMarker) {
          audioEngine.seek(
            nextMarker.position / audioEngine.session.sampleRate
          );
          return {
            success: true,
            message: `Jumped to marker "${nextMarker.name}"`
          };
        }
        return { success: false, message: "No next marker" };
      }
      case CommandType.GOTO_PREV_MARKER: {
        const currentFrame = audioEngine.getCurrentFrame();
        const prevMarker = audioEngine.session.getPreviousMarker(currentFrame);
        if (prevMarker) {
          audioEngine.seek(
            prevMarker.position / audioEngine.session.sampleRate
          );
          return {
            success: true,
            message: `Jumped to marker "${prevMarker.name}"`
          };
        }
        return { success: false, message: "No previous marker" };
      }
      case CommandType.RENAME_MARKER: {
        const marker = audioEngine.session.getMarker(
          payload.markerId
        );
        if (!marker) {
          return {
            success: false,
            message: `Marker not found: ${payload.markerId}`
          };
        }
        marker.name = payload.name;
        return {
          success: true,
          message: `Marker renamed to "${payload.name}"`
        };
      }
      case CommandType.SET_MARKER_LOCKED: {
        const marker = audioEngine.session.getMarker(
          payload.markerId
        );
        if (!marker) {
          return {
            success: false,
            message: `Marker not found: ${payload.markerId}`
          };
        }
        marker.locked = payload.locked;
        return {
          success: true,
          message: `Marker ${payload.locked ? "locked" : "unlocked"}`
        };
      }
      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
};

// core/src/commands/impl/AddMidiNoteCommand.ts
init_MidiNote();
var AddMidiNoteCommand = class {
  constructor(session, trackId, regionId, pitch, velocity, startFrame, durationFrames, channel = 0) {
    this.noteId = null;
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.regionId = regionId;
    this.pitch = pitch;
    this.velocity = velocity;
    this.startFrame = startFrame;
    this.durationFrames = durationFrames;
    this.channel = channel;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    const midiRegion = track.playlist.getMidiRegion(this.regionId);
    if (!midiRegion) throw new Error(`MIDI Region ${this.regionId} not found`);
    const id = this.noteId || crypto.randomUUID();
    const note = new MidiNote(
      id,
      this.pitch,
      this.velocity,
      this.startFrame,
      this.durationFrames,
      this.channel
    );
    midiRegion.addNote(note);
    this.noteId = note.id;
  }
  async undo() {
    if (!this.noteId) return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const midiRegion = track.playlist.getMidiRegion(this.regionId);
    if (midiRegion) {
      midiRegion.removeNote(this.noteId);
    }
  }
  async redo() {
    await this.execute();
  }
  getNoteId() {
    return this.noteId;
  }
};

// core/src/commands/impl/RemoveMidiNoteCommand.ts
var RemoveMidiNoteCommand = class {
  constructor(session, trackId, regionId, noteId) {
    this.removedNote = null;
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.regionId = regionId;
    this.noteId = noteId;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    const midiRegion = track.playlist.getMidiRegion(this.regionId);
    if (!midiRegion) throw new Error(`MIDI Region ${this.regionId} not found`);
    const note = midiRegion.getNote(this.noteId);
    if (!note) throw new Error(`MIDI Note ${this.noteId} not found`);
    this.removedNote = note;
    midiRegion.removeNote(this.noteId);
  }
  async undo() {
    if (!this.removedNote) return;
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const midiRegion = track.playlist.getMidiRegion(this.regionId);
    if (midiRegion) {
      midiRegion.addNote(this.removedNote);
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/impl/MoveMidiNoteCommand.ts
var MoveMidiNoteCommand = class {
  constructor(session, trackId, regionId, noteId, newStartFrame, newPitch) {
    this.oldStartFrame = null;
    this.oldPitch = null;
    this.id = crypto.randomUUID();
    this.session = session;
    this.trackId = trackId;
    this.regionId = regionId;
    this.noteId = noteId;
    this.newStartFrame = newStartFrame;
    this.newPitch = newPitch;
  }
  async execute() {
    const track = this.session.getTrack(this.trackId);
    if (!track) throw new Error(`Track ${this.trackId} not found`);
    const midiRegion = track.playlist.getMidiRegion(this.regionId);
    if (!midiRegion) throw new Error(`MIDI Region ${this.regionId} not found`);
    const note = midiRegion.getNote(this.noteId);
    if (!note) throw new Error(`MIDI Note ${this.noteId} not found`);
    this.oldStartFrame = note.startFrame;
    this.oldPitch = note.pitch;
    if (this.newStartFrame !== void 0) {
      note.move(this.newStartFrame);
    }
    if (this.newPitch !== void 0) {
      note.setPitch(this.newPitch);
    }
  }
  async undo() {
    const track = this.session.getTrack(this.trackId);
    if (!track) return;
    const midiRegion = track.playlist.getMidiRegion(this.regionId);
    if (!midiRegion) return;
    const note = midiRegion.getNote(this.noteId);
    if (!note) return;
    if (this.oldStartFrame !== null) {
      note.move(this.oldStartFrame);
    }
    if (this.oldPitch !== null) {
      note.setPitch(this.oldPitch);
    }
  }
  async redo() {
    await this.execute();
  }
};

// core/src/commands/handlers/MidiHandler.ts
var MidiHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.ADD_MIDI_NOTE,
      CommandType.REMOVE_MIDI_NOTE,
      CommandType.MOVE_MIDI_NOTE,
      CommandType.RESIZE_MIDI_NOTE,
      CommandType.QUANTIZE_MIDI,
      CommandType.TRANSPOSE_MIDI,
      CommandType.SET_MIDI_INSTRUMENT
    ]);
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, history) {
    if (!payload) {
      return { success: false, message: `${commandType} requires a payload` };
    }
    switch (commandType) {
      case CommandType.ADD_MIDI_NOTE: {
        const cmd = new AddMidiNoteCommand(
          audioEngine.session,
          payload.trackId,
          payload.regionId,
          payload.pitch,
          payload.velocity,
          payload.startFrame,
          payload.durationFrames,
          payload.channel
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `MIDI note added (pitch: ${payload.pitch})`,
          data: { noteId: cmd.getNoteId() }
        };
      }
      case CommandType.REMOVE_MIDI_NOTE: {
        const cmd = new RemoveMidiNoteCommand(
          audioEngine.session,
          payload.trackId,
          payload.regionId,
          payload.noteId
        );
        await history.execute(cmd);
        return { success: true, message: "MIDI note removed" };
      }
      case CommandType.MOVE_MIDI_NOTE: {
        const cmd = new MoveMidiNoteCommand(
          audioEngine.session,
          payload.trackId,
          payload.regionId,
          payload.noteId,
          payload.newStartFrame,
          payload.newPitch
        );
        await history.execute(cmd);
        return { success: true, message: "MIDI note moved" };
      }
      case CommandType.RESIZE_MIDI_NOTE: {
        const track = getTrackOrThrow(audioEngine, payload.trackId);
        const midiRegion = track.playlist.getMidiRegion(
          payload.regionId
        );
        if (!midiRegion) {
          return {
            success: false,
            message: `MIDI Region ${payload.regionId} not found`
          };
        }
        const note = midiRegion.getNote(payload.noteId);
        if (!note) {
          return {
            success: false,
            message: `MIDI Note ${payload.noteId} not found`
          };
        }
        note.resize(payload.newDurationFrames);
        return {
          success: true,
          message: `MIDI note resized to ${payload.newDurationFrames} frames`
        };
      }
      case CommandType.QUANTIZE_MIDI: {
        const track = getTrackOrThrow(audioEngine, payload.trackId);
        const midiRegion = track.playlist.getMidiRegion(
          payload.regionId
        );
        if (!midiRegion) {
          return {
            success: false,
            message: `MIDI Region ${payload.regionId} not found`
          };
        }
        const subdivisionFrames = payload.subdivisionFrames;
        const notes = midiRegion.getNotes();
        const originalPositions = /* @__PURE__ */ new Map();
        for (const note of notes) {
          originalPositions.set(note.id, note.startFrame);
        }
        const quantizeCmd = {
          async execute() {
            for (const note of notes) {
              const quantized = Math.round(note.startFrame / subdivisionFrames) * subdivisionFrames;
              note.move(quantized);
            }
          },
          async undo() {
            for (const note of notes) {
              const original = originalPositions.get(note.id);
              if (original !== void 0) {
                note.move(original);
              }
            }
          },
          async redo() {
            for (const note of notes) {
              const quantized = Math.round(
                (originalPositions.get(note.id) ?? note.startFrame) / subdivisionFrames
              ) * subdivisionFrames;
              note.move(quantized);
            }
          }
        };
        await history.execute(quantizeCmd);
        return {
          success: true,
          message: `MIDI region quantized (subdivision: ${subdivisionFrames} frames)`
        };
      }
      case CommandType.TRANSPOSE_MIDI: {
        const track = getTrackOrThrow(audioEngine, payload.trackId);
        const midiRegion = track.playlist.getMidiRegion(
          payload.regionId
        );
        if (!midiRegion) {
          return {
            success: false,
            message: `MIDI Region ${payload.regionId} not found`
          };
        }
        const semitones = payload.semitones;
        const notes = midiRegion.getNotes();
        const originalPitches = /* @__PURE__ */ new Map();
        for (const note of notes) {
          originalPitches.set(note.id, note.pitch);
        }
        const transposeCmd = {
          async execute() {
            for (const note of notes) {
              note.transpose(semitones);
            }
          },
          async undo() {
            for (const note of notes) {
              const original = originalPitches.get(note.id);
              if (original !== void 0) {
                note.setPitch(original);
              }
            }
          },
          async redo() {
            for (const note of notes) {
              note.transpose(semitones);
            }
          }
        };
        await history.execute(transposeCmd);
        return {
          success: true,
          message: `MIDI region transposed by ${semitones} semitones`
        };
      }
      case CommandType.SET_MIDI_INSTRUMENT: {
        audioEngine.setMidiInstrument(
          payload.trackId,
          payload.instrumentType
        );
        return {
          success: true,
          message: `MIDI instrument set to ${payload.instrumentType}`
        };
      }
      default:
        throw new Error(`Unsupported MIDI command: ${commandType}`);
    }
  }
};

// core/src/plugins/PluginPreset.ts
var PresetManager = class _PresetManager {
  constructor() {
    this.builtInPresets = [];
    this.customPresets = [];
    this.initBuiltInPresets();
    this.loadCustomPresets();
  }
  static getInstance() {
    if (!_PresetManager.instance) {
      _PresetManager.instance = new _PresetManager();
    }
    return _PresetManager.instance;
  }
  /** For testing – reset singleton */
  static resetInstance() {
    _PresetManager.instance = void 0;
  }
  // ─── Query ────────────────────────────────────────────────────────────────
  /**
   * Get all presets (built-in + custom) for a given plugin descriptor ID.
   */
  getPresetsForPlugin(pluginId) {
    return [
      ...this.builtInPresets.filter((p) => p.pluginId === pluginId),
      ...this.customPresets.filter((p) => p.pluginId === pluginId)
    ];
  }
  /**
   * Get a single preset by ID.
   */
  getPreset(presetId) {
    return this.builtInPresets.find((p) => p.id === presetId) ?? this.customPresets.find((p) => p.id === presetId);
  }
  // ─── Apply ────────────────────────────────────────────────────────────────
  /**
   * Apply a preset to a plugin processor on a track.
   * The caller is responsible for looking up the correct track / processor.
   * Returns the parameter map so the caller can propagate it.
   */
  getPresetParameters(presetId) {
    const preset = this.getPreset(presetId);
    if (!preset) return null;
    return new Map(preset.parameters);
  }
  // ─── Save / Delete Custom ─────────────────────────────────────────────────
  /**
   * Save a custom preset. Returns the new preset ID.
   */
  savePreset(name, pluginId, parameters) {
    const id = `custom-${crypto.randomUUID()}`;
    const preset = { id, name, pluginId, parameters };
    this.customPresets.push(preset);
    this.persistCustomPresets();
    return id;
  }
  /**
   * Delete a custom preset by ID.
   */
  deletePreset(presetId) {
    const idx = this.customPresets.findIndex((p) => p.id === presetId);
    if (idx === -1) return false;
    this.customPresets.splice(idx, 1);
    this.persistCustomPresets();
    return true;
  }
  // ─── Built-In Presets ─────────────────────────────────────────────────────
  initBuiltInPresets() {
    this.builtInPresets.push(
      makePreset("preset-reverb-small-room", "Small Room", "internal-reverb", {
        decay: 0.8,
        preDelay: 5e-3,
        wet: 0.3
      }),
      makePreset("preset-reverb-large-hall", "Large Hall", "internal-reverb", {
        decay: 4,
        preDelay: 0.03,
        wet: 0.5
      }),
      makePreset("preset-reverb-plate", "Plate", "internal-reverb", {
        decay: 2,
        preDelay: 0.01,
        wet: 0.45
      })
    );
    this.builtInPresets.push(
      makePreset("preset-delay-slapback", "Slapback", "internal-delay", {
        delayTime: 0.08,
        feedback: 0.1,
        wet: 0.4
      }),
      makePreset("preset-delay-quarter", "Quarter Note", "internal-delay", {
        delayTime: 0.5,
        feedback: 0.35,
        wet: 0.35
      }),
      makePreset("preset-delay-long", "Long Echo", "internal-delay", {
        delayTime: 1,
        feedback: 0.6,
        wet: 0.3
      })
    );
    this.builtInPresets.push(
      makePreset("preset-eq3-vocal", "Vocal Presence", "internal-eq3", {
        lowFreq: 150,
        lowGain: -3,
        midFreq: 2500,
        midGain: 4,
        midQ: 1.5,
        highFreq: 8e3,
        highGain: 2
      }),
      makePreset("preset-eq3-bass-cut", "Bass Cut", "internal-eq3", {
        lowFreq: 200,
        lowGain: -12,
        midFreq: 1e3,
        midGain: 0,
        midQ: 1,
        highFreq: 5e3,
        highGain: 0
      })
    );
    this.builtInPresets.push(
      makePreset("preset-comp-gentle", "Gentle", "internal-compressor", {
        threshold: -18,
        ratio: 2,
        attack: 0.01,
        release: 0.2,
        knee: 30,
        makeupGain: 3
      }),
      makePreset(
        "preset-comp-aggressive",
        "Aggressive",
        "internal-compressor",
        {
          threshold: -30,
          ratio: 8,
          attack: 1e-3,
          release: 0.1,
          knee: 10,
          makeupGain: 8
        }
      ),
      makePreset("preset-comp-limiter", "Limiter", "internal-compressor", {
        threshold: -6,
        ratio: 20,
        attack: 5e-4,
        release: 0.05,
        knee: 0,
        makeupGain: 0
      })
    );
    this.builtInPresets.push(
      makePreset("preset-chorus-subtle", "Subtle", "internal-chorus", {
        frequency: 0.5,
        delayTime: 3,
        depth: 0.3,
        wet: 0.3
      }),
      makePreset("preset-chorus-wide", "Wide", "internal-chorus", {
        frequency: 1.2,
        delayTime: 5,
        depth: 0.8,
        wet: 0.5
      })
    );
    this.builtInPresets.push(
      makePreset(
        "preset-distortion-light",
        "Light Overdrive",
        "internal-distortion",
        {
          distortion: 0.15,
          wet: 0.8
        }
      ),
      makePreset("preset-distortion-heavy", "Heavy", "internal-distortion", {
        distortion: 0.7,
        wet: 1
      })
    );
    this.builtInPresets.push(
      makePreset("preset-filter-lowpass", "Warm Lowpass", "internal-filter", {
        frequency: 800,
        Q: 0.7,
        type: 0
      }),
      makePreset("preset-filter-highpass", "High Pass", "internal-filter", {
        frequency: 300,
        Q: 0.7,
        type: 1
      })
    );
    this.builtInPresets.push(
      makePreset("preset-eq6-vocal", "Vocal Clarity", "internal-eq6", {
        band1Freq: 100,
        band1Gain: -3,
        band2Freq: 300,
        band2Gain: -2,
        band2Q: 1.5,
        band3Freq: 2e3,
        band3Gain: 3,
        band3Q: 1.2,
        band4Freq: 4e3,
        band4Gain: 2,
        band4Q: 1,
        band5Freq: 8e3,
        band5Gain: 1,
        band5Q: 0.8,
        band6Freq: 12e3,
        band6Gain: 2
      }),
      makePreset("preset-eq6-bass-boost", "Bass Boost", "internal-eq6", {
        band1Freq: 80,
        band1Gain: 6,
        band2Freq: 200,
        band2Gain: 3,
        band2Q: 1,
        band3Freq: 1e3,
        band3Gain: 0,
        band3Q: 1,
        band4Freq: 2500,
        band4Gain: 0,
        band4Q: 1,
        band5Freq: 6300,
        band5Gain: 0,
        band5Q: 1,
        band6Freq: 9e3,
        band6Gain: -2
      }),
      makePreset("preset-eq6-bright", "Bright", "internal-eq6", {
        band1Freq: 160,
        band1Gain: -2,
        band2Freq: 397,
        band2Gain: 0,
        band2Q: 1,
        band3Freq: 1e3,
        band3Gain: 0,
        band3Q: 1,
        band4Freq: 3e3,
        band4Gain: 2,
        band4Q: 1,
        band5Freq: 8e3,
        band5Gain: 4,
        band5Q: 0.7,
        band6Freq: 12e3,
        band6Gain: 5
      })
    );
    this.builtInPresets.push(
      makePreset("preset-gate-gentle", "Gentle", "internal-gate", {
        threshold: -50,
        ratio: 2,
        attack: 10,
        release: 150,
        knee: 6,
        range: -20
      }),
      makePreset("preset-gate-tight", "Tight", "internal-gate", {
        threshold: -30,
        ratio: 10,
        attack: 1,
        release: 50,
        knee: 0,
        range: -60
      }),
      makePreset("preset-gate-drum", "Drum Gate", "internal-gate", {
        threshold: -25,
        ratio: 20,
        attack: 0.5,
        release: 50,
        knee: 0,
        range: -90
      })
    );
    this.builtInPresets.push(
      makePreset("preset-mbc-master", "Mastering", "internal-multiband-comp", {
        lowThreshold: -18,
        lowRatio: 2,
        lowAttack: 0.01,
        lowRelease: 0.2,
        midThreshold: -20,
        midRatio: 3,
        midAttack: 5e-3,
        midRelease: 0.15,
        highThreshold: -22,
        highRatio: 3,
        highAttack: 3e-3,
        highRelease: 0.1,
        lowFrequency: 200,
        highFrequency: 4e3
      }),
      makePreset("preset-mbc-balanced", "Balanced", "internal-multiband-comp", {
        lowThreshold: -24,
        lowRatio: 4,
        lowAttack: 3e-3,
        lowRelease: 0.25,
        midThreshold: -24,
        midRatio: 4,
        midAttack: 3e-3,
        midRelease: 0.25,
        highThreshold: -24,
        highRatio: 4,
        highAttack: 3e-3,
        highRelease: 0.25,
        lowFrequency: 250,
        highFrequency: 4e3
      })
    );
    this.builtInPresets.push(
      makePreset("preset-phaser-slow", "Slow Sweep", "internal-phaser", {
        frequency: 0.3,
        octaves: 3,
        baseFrequency: 350,
        wet: 0.5
      }),
      makePreset("preset-phaser-fast", "Fast Phase", "internal-phaser", {
        frequency: 2,
        octaves: 2,
        baseFrequency: 500,
        wet: 0.6
      })
    );
    this.builtInPresets.push(
      makePreset("preset-tremolo-gentle", "Gentle", "internal-tremolo", {
        frequency: 3,
        depth: 0.3,
        type: 0,
        wet: 1
      }),
      makePreset("preset-tremolo-choppy", "Choppy", "internal-tremolo", {
        frequency: 8,
        depth: 0.8,
        type: 1,
        wet: 1
      })
    );
    this.builtInPresets.push(
      makePreset("preset-vibrato-subtle", "Subtle", "internal-vibrato", {
        frequency: 5,
        depth: 0.05,
        wet: 1
      }),
      makePreset("preset-vibrato-wide", "Wide", "internal-vibrato", {
        frequency: 6,
        depth: 0.2,
        wet: 0.8
      })
    );
    this.builtInPresets.push(
      makePreset("preset-autopan-slow", "Slow Pan", "internal-autopan", {
        frequency: 0.5,
        depth: 0.8,
        wet: 1
      }),
      makePreset("preset-autopan-fast", "Fast Pan", "internal-autopan", {
        frequency: 4,
        depth: 1,
        wet: 1
      })
    );
    this.builtInPresets.push(
      makePreset("preset-tape-warm", "Warm", "internal-tape-sat", {
        drive: 0.35,
        warmth: 0.7,
        saturation: 0.4,
        wet: 0.3
      }),
      makePreset("preset-tape-hot", "Hot", "internal-tape-sat", {
        drive: 0.7,
        warmth: 0.55,
        saturation: 0.7,
        wet: 0.5
      }),
      makePreset("preset-tape-saturated", "Saturated", "internal-tape-sat", {
        drive: 0.9,
        warmth: 0.8,
        saturation: 0.85,
        wet: 0.7
      })
    );
    this.builtInPresets.push(
      makePreset("preset-eq6-flat", "Flat", "internal-eq6", {
        band1Freq: 160,
        band1Gain: 0,
        band2Freq: 397,
        band2Gain: 0,
        band2Q: 1,
        band3Freq: 1e3,
        band3Gain: 0,
        band3Q: 1,
        band4Freq: 2500,
        band4Gain: 0,
        band4Q: 1,
        band5Freq: 6300,
        band5Gain: 0,
        band5Q: 1,
        band6Freq: 9e3,
        band6Gain: 0
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
          band3Freq: 2e3,
          band3Gain: 3,
          band3Q: 1.2,
          band4Freq: 3500,
          band4Gain: 4,
          band4Q: 1.5,
          band5Freq: 8e3,
          band5Gain: 2,
          band5Q: 1,
          band6Freq: 12e3,
          band6Gain: 1.5
        }
      ),
      makePreset("preset-eq6-bass-boost-modern", "Bass Boost", "internal-eq6", {
        band1Freq: 80,
        band1Gain: 6,
        band2Freq: 250,
        band2Gain: 3,
        band2Q: 0.8,
        band3Freq: 1e3,
        band3Gain: 0,
        band3Q: 1,
        band4Freq: 2500,
        band4Gain: 0,
        band4Q: 1,
        band5Freq: 6300,
        band5Gain: 0,
        band5Q: 1,
        band6Freq: 9e3,
        band6Gain: -2
      })
    );
    this.builtInPresets.push(
      makePreset("preset-exp-gentle", "Gentle Expansion", "internal-expander", {
        threshold: -30,
        ratio: 2,
        attack: 10,
        release: 100,
        knee: 6,
        range: -20
      }),
      makePreset("preset-gate-noise", "Noise Gate", "internal-gate", {
        threshold: -40,
        ratio: 20,
        attack: 0.5,
        release: 50,
        knee: 0,
        range: -90
      }),
      makePreset("preset-gate-drum-tight", "Drum Gate", "internal-gate", {
        threshold: -20,
        ratio: 20,
        attack: 0.1,
        release: 50,
        knee: 0,
        range: -90
      })
    );
    this.builtInPresets.push(
      makePreset("preset-phaser-subtle", "Subtle Sweep", "internal-phaser", {
        frequency: 0.4,
        octaves: 2,
        baseFrequency: 800,
        wet: 0.35
      }),
      makePreset("preset-phaser-deep", "Deep Phase", "internal-phaser", {
        frequency: 1.2,
        octaves: 4,
        baseFrequency: 1200,
        wet: 0.6
      })
    );
    this.builtInPresets.push(
      makePreset(
        "preset-tremolo-gentle-motion",
        "Gentle Tremolo",
        "internal-tremolo",
        { frequency: 3, depth: 0.3, type: 0, wet: 1 }
      ),
      makePreset("preset-tremolo-fast", "Fast Chop", "internal-tremolo", {
        frequency: 12,
        depth: 0.9,
        type: 1,
        wet: 1
      })
    );
    this.builtInPresets.push(
      makePreset("preset-vibrato-light", "Light Vibrato", "internal-vibrato", {
        frequency: 4,
        depth: 0.05,
        wet: 1
      }),
      makePreset("preset-vibrato-heavy", "Heavy Vibrato", "internal-vibrato", {
        frequency: 6,
        depth: 0.2,
        wet: 1
      })
    );
    this.builtInPresets.push(
      makePreset("preset-autopan-slow-wide", "Slow Pan", "internal-autopan", {
        frequency: 0.5,
        depth: 0.8,
        wet: 1
      }),
      makePreset("preset-autopan-fast-wide", "Fast Pan", "internal-autopan", {
        frequency: 4,
        depth: 1,
        wet: 1
      })
    );
    this.builtInPresets.push(
      makePreset(
        "preset-syncdelay-quarter",
        "Quarter Note",
        "internal-sync-delay",
        { sync: 1, divisor: 0, feedback: 0.3, lpf: 8e3, wet: 0.4 }
      ),
      makePreset(
        "preset-syncdelay-eighth",
        "Eighth Note",
        "internal-sync-delay",
        { sync: 1, divisor: 1, feedback: 0.35, lpf: 6e3, wet: 0.35 }
      ),
      makePreset(
        "preset-syncdelay-dotted",
        "Dotted Eighth",
        "internal-sync-delay",
        { sync: 1, divisor: 3, feedback: 0.4, lpf: 5e3, wet: 0.3 }
      )
    );
    this.builtInPresets.push(
      makePreset("preset-conv-room", "Small Room", "internal-convolver", {
        wet: 0.3,
        preDelay: 5,
        irType: 0
      }),
      makePreset("preset-conv-hall", "Concert Hall", "internal-convolver", {
        wet: 0.4,
        preDelay: 20,
        irType: 1
      }),
      makePreset("preset-conv-plate", "Plate Reverb", "internal-convolver", {
        wet: 0.35,
        preDelay: 0,
        irType: 2
      })
    );
    this.builtInPresets.push(
      makePreset("preset-deesser-subtle", "Subtle", "internal-deesser", {
        frequency: 6e3,
        threshold: -15,
        reduction: 4,
        listenMode: 0
      }),
      makePreset("preset-deesser-moderate", "Moderate", "internal-deesser", {
        frequency: 6500,
        threshold: -20,
        reduction: 8,
        listenMode: 0
      }),
      makePreset(
        "preset-deesser-aggressive",
        "Aggressive",
        "internal-deesser",
        { frequency: 7e3, threshold: -28, reduction: 14, listenMode: 0 }
      )
    );
    this.builtInPresets.push(
      makePreset(
        "preset-mbcomp-mastering",
        "Mastering",
        "internal-multiband-comp",
        {
          lowFrequency: 200,
          highFrequency: 4e3,
          lowThreshold: -18,
          lowRatio: 2,
          lowAttack: 0.02,
          lowRelease: 0.3,
          midThreshold: -16,
          midRatio: 2,
          midAttack: 8e-3,
          midRelease: 0.2,
          highThreshold: -14,
          highRatio: 1.5,
          highAttack: 5e-3,
          highRelease: 0.15
        }
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
        highAttack: 8e-3,
        highRelease: 0.2
      })
    );
  }
  // ─── Persistence (localStorage) ───────────────────────────────────────────
  persistCustomPresets() {
    try {
      if (typeof localStorage === "undefined") return;
      const snapshots = this.customPresets.map((p) => ({
        id: p.id,
        name: p.name,
        pluginId: p.pluginId,
        parameters: Object.fromEntries(p.parameters)
      }));
      localStorage.setItem(
        PLUGIN_PRESET_STORAGE_KEY,
        JSON.stringify(snapshots)
      );
    } catch {
    }
  }
  loadCustomPresets() {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(PLUGIN_PRESET_STORAGE_KEY);
      if (!raw) return;
      const snapshots = JSON.parse(raw);
      this.customPresets = snapshots.map((s) => ({
        id: s.id,
        name: s.name,
        pluginId: s.pluginId,
        parameters: new Map(Object.entries(s.parameters))
      }));
    } catch {
      this.customPresets = [];
    }
  }
};
function makePreset(id, name, pluginId, params) {
  return {
    id,
    name,
    pluginId,
    parameters: new Map(Object.entries(params))
  };
}

// core/src/commands/handlers/MixerSceneHandler.ts
init_PluginInsert();
var MixerSceneHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.SET_MIDI_INPUT_DEVICE,
      CommandType.APPLY_PLUGIN_PRESET,
      CommandType.SAVE_PLUGIN_PRESET,
      CommandType.SAVE_MIXER_SCENE,
      CommandType.RECALL_MIXER_SCENE,
      CommandType.DELETE_MIXER_SCENE,
      CommandType.RENAME_MIXER_SCENE
    ]);
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, _history) {
    if (!payload) {
      return { success: false, message: `${commandType} requires a payload` };
    }
    switch (commandType) {
      // ─── MIDI Input Device ────────────────────────────────────────
      case CommandType.SET_MIDI_INPUT_DEVICE: {
        const inputId = payload.inputId;
        audioEngine.setMidiInputDevice(inputId);
        return {
          success: true,
          message: inputId ? `MIDI input device set: ${inputId}` : "MIDI input device disconnected"
        };
      }
      // ─── Plugin Presets ───────────────────────────────────────────
      case CommandType.APPLY_PLUGIN_PRESET: {
        const track = getTrackOrThrow(audioEngine, payload.trackId);
        const proc = track.route.processors.find(
          (p) => p.id === payload.processorId
        );
        if (!proc || !(proc instanceof PluginInsert)) {
          return {
            success: false,
            message: `Processor ${payload.processorId} not found or has no plugin`
          };
        }
        const presetMgr = PresetManager.getInstance();
        const params = presetMgr.getPresetParameters(
          payload.presetId
        );
        if (!params) {
          return {
            success: false,
            message: `Preset ${payload.presetId} not found`
          };
        }
        for (const [paramId, value] of params) {
          proc.plugin.setParameter(paramId, value);
        }
        return {
          success: true,
          message: `Preset applied: ${payload.presetId}`
        };
      }
      case CommandType.SAVE_PLUGIN_PRESET: {
        const track = getTrackOrThrow(audioEngine, payload.trackId);
        const proc = track.route.processors.find(
          (p) => p.id === payload.processorId
        );
        if (!proc || !(proc instanceof PluginInsert)) {
          return {
            success: false,
            message: `Processor ${payload.processorId} not found or has no plugin`
          };
        }
        const currentParams = /* @__PURE__ */ new Map();
        for (const param of proc.plugin.getParameters()) {
          currentParams.set(param.id, param.value);
        }
        const presetMgr = PresetManager.getInstance();
        const presetId = presetMgr.savePreset(
          payload.name,
          payload.pluginId,
          currentParams
        );
        return {
          success: true,
          message: `Preset saved: ${payload.name}`,
          data: { presetId }
        };
      }
      // ─── Mixer Scenes ─────────────────────────────────────────────
      case CommandType.SAVE_MIXER_SCENE: {
        const sceneId = audioEngine.session.mixerSceneManager.saveScene(
          payload.name,
          audioEngine.session
        );
        return {
          success: true,
          message: `Mixer scene saved: ${payload.name}`,
          data: { sceneId }
        };
      }
      case CommandType.RECALL_MIXER_SCENE: {
        const recalled = audioEngine.session.mixerSceneManager.recallScene(
          payload.sceneId,
          audioEngine.session
        );
        if (!recalled) {
          return {
            success: false,
            message: `Mixer scene not found: ${payload.sceneId}`
          };
        }
        return {
          success: true,
          message: `Mixer scene recalled: ${payload.sceneId}`
        };
      }
      case CommandType.DELETE_MIXER_SCENE: {
        const deleted = audioEngine.session.mixerSceneManager.deleteScene(
          payload.sceneId
        );
        if (!deleted) {
          return {
            success: false,
            message: `Mixer scene not found: ${payload.sceneId}`
          };
        }
        return {
          success: true,
          message: `Mixer scene deleted: ${payload.sceneId}`
        };
      }
      case CommandType.RENAME_MIXER_SCENE: {
        const scene = audioEngine.session.mixerSceneManager.scenes.find(
          (s) => s.id === payload.sceneId
        );
        if (!scene) {
          return {
            success: false,
            message: `Mixer scene not found: ${payload.sceneId}`
          };
        }
        scene.name = payload.name;
        return {
          success: true,
          message: `Mixer scene renamed to "${payload.name}"`
        };
      }
      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
};

// core/src/commands/handlers/TrackGroupHandler.ts
var TrackGroupHandler = class {
  constructor() {
    this.supportedCommands = /* @__PURE__ */ new Set([
      CommandType.CREATE_TRACK_GROUP,
      CommandType.DELETE_TRACK_GROUP,
      CommandType.ADD_TO_TRACK_GROUP,
      CommandType.REMOVE_FROM_TRACK_GROUP,
      CommandType.SET_TRACK_PARENT,
      CommandType.ADD_VCA_TRACK,
      CommandType.REMOVE_VCA_TRACK,
      CommandType.SET_VCA_GAIN,
      CommandType.ASSIGN_TO_VCA,
      CommandType.ADD_CD_MARKER,
      CommandType.REMOVE_CD_MARKER,
      CommandType.GENERATE_CUE_SHEET,
      CommandType.SET_SIDECHAIN_SOURCE
    ]);
  }
  canHandle(commandType) {
    return this.supportedCommands.has(commandType);
  }
  async execute(commandType, payload, audioEngine, _history) {
    const session = audioEngine.session;
    switch (commandType) {
      // ─── Track Groups ────────────────────────────────────────────
      case CommandType.CREATE_TRACK_GROUP: {
        if (!payload)
          return {
            success: false,
            message: "CREATE_TRACK_GROUP requires a payload"
          };
        const group = session.addTrackGroup(payload.name);
        const trackIds = payload.trackIds;
        if (trackIds) {
          for (const trackId of trackIds) {
            group.addMember(trackId);
            const track = session.getTrack(trackId);
            if (track) track.groupId = group.id;
          }
        }
        return {
          success: true,
          message: `Track group "${payload.name}" created`,
          data: { groupId: group.id }
        };
      }
      case CommandType.DELETE_TRACK_GROUP: {
        if (!payload)
          return {
            success: false,
            message: "DELETE_TRACK_GROUP requires a payload"
          };
        const group = session.getTrackGroup(payload.groupId);
        if (!group) {
          return {
            success: false,
            message: `Track group not found: ${payload.groupId}`
          };
        }
        session.removeTrackGroup(payload.groupId);
        return {
          success: true,
          message: `Track group deleted: ${payload.groupId}`
        };
      }
      case CommandType.ADD_TO_TRACK_GROUP: {
        if (!payload)
          return {
            success: false,
            message: "ADD_TO_TRACK_GROUP requires a payload"
          };
        const group = session.getTrackGroup(payload.groupId);
        if (!group) {
          return {
            success: false,
            message: `Track group not found: ${payload.groupId}`
          };
        }
        group.addMember(payload.trackId);
        const track = session.getTrack(payload.trackId);
        if (track) track.groupId = group.id;
        return {
          success: true,
          message: `Track ${payload.trackId} added to group ${payload.groupId}`
        };
      }
      case CommandType.REMOVE_FROM_TRACK_GROUP: {
        if (!payload)
          return {
            success: false,
            message: "REMOVE_FROM_TRACK_GROUP requires a payload"
          };
        const group = session.getTrackGroup(payload.groupId);
        if (!group) {
          return {
            success: false,
            message: `Track group not found: ${payload.groupId}`
          };
        }
        group.removeMember(payload.trackId);
        const track = session.getTrack(payload.trackId);
        if (track) track.groupId = null;
        return {
          success: true,
          message: `Track ${payload.trackId} removed from group ${payload.groupId}`
        };
      }
      case CommandType.SET_TRACK_PARENT: {
        if (!payload)
          return {
            success: false,
            message: "SET_TRACK_PARENT requires a payload"
          };
        session.setTrackParent(
          payload.trackId,
          payload.parentId
        );
        return { success: true, message: `Track parent set` };
      }
      // ─── VCA Tracks ─────────────────────────────────────────────
      case CommandType.ADD_VCA_TRACK: {
        if (!payload)
          return {
            success: false,
            message: "ADD_VCA_TRACK requires a payload"
          };
        const vca = session.addVCATrack(payload.name);
        return {
          success: true,
          message: `VCA track "${payload.name}" added`,
          data: { vcaId: vca.id }
        };
      }
      case CommandType.REMOVE_VCA_TRACK: {
        if (!payload)
          return {
            success: false,
            message: "REMOVE_VCA_TRACK requires a payload"
          };
        const vca = session.getVCATrack(payload.trackId);
        if (!vca) {
          return {
            success: false,
            message: `VCA track not found: ${payload.trackId}`
          };
        }
        session.removeVCATrack(payload.trackId);
        return {
          success: true,
          message: `VCA track removed: ${payload.trackId}`
        };
      }
      case CommandType.SET_VCA_GAIN: {
        if (!payload)
          return { success: false, message: "SET_VCA_GAIN requires a payload" };
        const vca = session.getVCATrack(payload.trackId);
        if (!vca) {
          return {
            success: false,
            message: `VCA track not found: ${payload.trackId}`
          };
        }
        const delta = vca.setGain(payload.gain);
        for (const slaveId of vca.slaveTrackIds) {
          const slaveTrack = session.getTrack(slaveId);
          if (slaveTrack) {
            const currentVolume = slaveTrack.route.volume;
            slaveTrack.route.volume = currentVolume * delta;
          }
        }
        return { success: true, message: `VCA gain set to ${payload.gain}` };
      }
      case CommandType.ASSIGN_TO_VCA: {
        if (!payload)
          return {
            success: false,
            message: "ASSIGN_TO_VCA requires a payload"
          };
        const vca = session.getVCATrack(payload.vcaTrackId);
        if (!vca) {
          return {
            success: false,
            message: `VCA track not found: ${payload.vcaTrackId}`
          };
        }
        vca.addSlave(payload.trackId);
        return {
          success: true,
          message: `Track ${payload.trackId} assigned to VCA ${payload.vcaTrackId}`
        };
      }
      // ─── CD Markers ─────────────────────────────────────────────
      case CommandType.ADD_CD_MARKER: {
        if (!payload)
          return {
            success: false,
            message: "ADD_CD_MARKER requires a payload"
          };
        const existingMarkers = session.cdMarkers;
        const nextIndex = existingMarkers.length > 0 ? Math.max(...existingMarkers.map((m) => m.index)) + 1 : 1;
        const cdMarker = session.addCDMarker(
          nextIndex,
          payload.name,
          payload.position
        );
        return {
          success: true,
          message: `CD marker "${payload.name}" added at position ${payload.position}`,
          data: { markerId: cdMarker.id }
        };
      }
      case CommandType.REMOVE_CD_MARKER: {
        if (!payload)
          return {
            success: false,
            message: "REMOVE_CD_MARKER requires a payload"
          };
        const cdMarker = session.getCDMarker(payload.markerId);
        if (!cdMarker) {
          return {
            success: false,
            message: `CD marker not found: ${payload.markerId}`
          };
        }
        session.removeCDMarker(payload.markerId);
        return {
          success: true,
          message: `CD marker removed: ${payload.markerId}`
        };
      }
      case CommandType.GENERATE_CUE_SHEET: {
        const { generateCueSheet: generateCueSheet2 } = await Promise.resolve().then(() => (init_CDMarker(), CDMarker_exports));
        const markers = session.cdMarkers;
        if (markers.length === 0) {
          return {
            success: false,
            message: "No CD markers to generate cue sheet from"
          };
        }
        const cueSheet = generateCueSheet2(
          [...markers],
          session.sampleRate,
          session.name
        );
        return {
          success: true,
          message: "Cue sheet generated",
          data: { cueSheet }
        };
      }
      // ─── Sidechain ──────────────────────────────────────────────
      case CommandType.SET_SIDECHAIN_SOURCE: {
        if (!payload)
          return {
            success: false,
            message: "SET_SIDECHAIN_SOURCE requires a payload"
          };
        const configs = session.getSidechainConfigsForTrack(
          payload.trackId
        );
        if (configs.length > 0) {
          configs[0].setSource(payload.sourceTrackId);
          configs[0].setEnabled(true);
        } else {
          const config = session.addSidechainConfig(
            payload.trackId,
            "default"
          );
          config.setSource(payload.sourceTrackId);
          config.setEnabled(true);
        }
        return {
          success: true,
          message: `Sidechain source set: ${payload.sourceTrackId} \u2192 ${payload.trackId}`
        };
      }
      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
};

// core/src/commands/CommandExecutor.ts
init_Signal();
var CommandExecutor = class _CommandExecutor {
  constructor() {
    this.commandExecuted = new Signal();
    this.audioEngine = AudioEngine.getInstance();
    this._history = new CommandHistory();
    this.handlers = [
      new TransportHandler(),
      new TrackHandler(),
      new RegionHandler(),
      new RangeHandler(),
      new AutomationHandler(),
      new ExportHandler(),
      new IOHandler(),
      new SendBusHandler(),
      new SessionHandler(),
      new MarkerHandler(),
      new MidiHandler(),
      new MixerSceneHandler(),
      new TrackGroupHandler(),
      new HistoryHandler()
    ];
  }
  registerHandler(handler) {
    this.handlers.push(handler);
  }
  static getInstance() {
    if (!_CommandExecutor.instance) {
      _CommandExecutor.instance = new _CommandExecutor();
    }
    return _CommandExecutor.instance;
  }
  get history() {
    return this._history;
  }
  /**
   * Command 실행
   *
   * 1. Zod로 검증
   * 2. AudioEngine 초기화
   * 3. 적절한 Handler 찾기
   * 4. Handler에게 위임
   */
  async execute(commandJson) {
    try {
      const command = AudioCommandSchema.parse(commandJson);
      await this.audioEngine.initialize();
      const handler = this.handlers.find((h) => h.canHandle(command.type));
      if (!handler) {
        return {
          success: false,
          message: `No handler found for command type: ${command.type}`
        };
      }
      const payload = "payload" in command ? command.payload : void 0;
      const result = await handler.execute(
        command.type,
        payload,
        this.audioEngine,
        this._history
      );
      if (result.success) {
        this.commandExecuted.emit({ type: command.type, payload });
      }
      return result;
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return {
          success: false,
          message: `Invalid command format: ${error.issues.map((e) => e.message).join(", ")}`
        };
      }
      return {
        success: false,
        message: `Execution failed: ${error.message}`
      };
    }
  }
};

// core/src/index.ts
init_AutomationList();
init_AutomationCurve();
init_AutomationMode();

// core/src/analysis/AudioAnalyzer.ts
var DEFAULT_FFT_SIZE = 2048;
var DEFAULT_TRANSIENT_THRESHOLD = 1.4;
var DEFAULT_ONSET_THRESHOLD = 1.3;
var MEDIAN_FILTER_SIZE = 11;
var MIN_ONSET_SPACING_MS = 50;
var AudioAnalyzer = class {
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
  }
  // ════════════════════════════════════════════════════════════════════════
  //  Transient Detection — spectral flux with adaptive threshold
  // ════════════════════════════════════════════════════════════════════════
  detectTransients(audioData, options = {}) {
    const windowSize = options.windowSize ?? 1024;
    const fftSize = this.nextPow2(windowSize);
    const hopSize = windowSize >>> 1;
    const threshold = options.threshold ?? DEFAULT_TRANSIENT_THRESHOLD;
    if (audioData.length < fftSize) {
      return { positions: [], strengths: [] };
    }
    const hannWin = this.hannWindow(fftSize);
    const numFrames = Math.floor((audioData.length - fftSize) / hopSize) + 1;
    const fluxValues = new Float32Array(numFrames);
    let prevMag = new Float32Array(fftSize / 2 + 1);
    for (let f = 0; f < numFrames; f++) {
      const offset = f * hopSize;
      const windowed = new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        windowed[i] = offset + i < audioData.length ? audioData[offset + i] * hannWin[i] : 0;
      }
      const { magnitude } = this.computeFFT(windowed, fftSize);
      let flux = 0;
      for (let k = 0; k <= fftSize / 2; k++) {
        const diff = magnitude[k] - prevMag[k];
        if (diff > 0) flux += diff;
      }
      fluxValues[f] = flux;
      prevMag = magnitude;
    }
    const positions = [];
    const strengths = [];
    const halfMedian = MEDIAN_FILTER_SIZE - 1 >>> 1;
    const minSpacingFrames = Math.floor(
      MIN_ONSET_SPACING_MS / 1e3 * this.sampleRate / hopSize
    );
    let maxFlux = 0;
    for (let f = 0; f < numFrames; f++) {
      if (fluxValues[f] > maxFlux) maxFlux = fluxValues[f];
    }
    if (maxFlux === 0) return { positions: [], strengths: [] };
    let lastPickedFrame = -minSpacingFrames - 1;
    for (let f = 0; f < numFrames; f++) {
      const start = Math.max(0, f - halfMedian);
      const end = Math.min(numFrames - 1, f + halfMedian);
      const neighbourhood = [];
      for (let j = start; j <= end; j++) {
        neighbourhood.push(fluxValues[j]);
      }
      neighbourhood.sort((a, b) => a - b);
      const median = neighbourhood[neighbourhood.length >>> 1];
      if (fluxValues[f] > median * threshold && fluxValues[f] > 0 && f - lastPickedFrame >= minSpacingFrames) {
        const samplePos = f * hopSize + (fftSize >>> 1);
        positions.push(samplePos);
        strengths.push(fluxValues[f] / maxFlux);
        lastPickedFrame = f;
      }
    }
    return { positions, strengths };
  }
  // ════════════════════════════════════════════════════════════════════════
  //  Onset Detection — high-frequency content + spectral flux
  // ════════════════════════════════════════════════════════════════════════
  detectOnsets(audioData, options = {}) {
    const windowSize = options.windowSize ?? 1024;
    const fftSize = this.nextPow2(windowSize);
    const hopSize = windowSize >>> 1;
    const threshold = options.threshold ?? DEFAULT_ONSET_THRESHOLD;
    if (audioData.length < fftSize) {
      return { positions: [], types: [] };
    }
    const hannWin = this.hannWindow(fftSize);
    const numFrames = Math.floor((audioData.length - fftSize) / hopSize) + 1;
    const hfcValues = new Float32Array(numFrames);
    const fluxValues = new Float32Array(numFrames);
    const zcrValues = new Float32Array(numFrames);
    let prevMag = new Float32Array(fftSize / 2 + 1);
    const halfSpec = fftSize / 2;
    for (let f = 0; f < numFrames; f++) {
      const offset = f * hopSize;
      const windowed = new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        windowed[i] = offset + i < audioData.length ? audioData[offset + i] * hannWin[i] : 0;
      }
      const { magnitude } = this.computeFFT(windowed, fftSize);
      let hfc = 0;
      let flux = 0;
      for (let k = 0; k <= halfSpec; k++) {
        hfc += k * magnitude[k] * magnitude[k];
        const diff = magnitude[k] - prevMag[k];
        if (diff > 0) flux += diff;
      }
      hfcValues[f] = hfc;
      fluxValues[f] = flux;
      prevMag = magnitude;
      let zcr = 0;
      for (let i = 1; i < fftSize && offset + i < audioData.length; i++) {
        if (audioData[offset + i] >= 0 !== audioData[offset + i - 1] >= 0) {
          zcr++;
        }
      }
      zcrValues[f] = zcr / fftSize;
    }
    let maxHfc = 0;
    let maxFlux = 0;
    for (let f = 0; f < numFrames; f++) {
      if (hfcValues[f] > maxHfc) maxHfc = hfcValues[f];
      if (fluxValues[f] > maxFlux) maxFlux = fluxValues[f];
    }
    if (maxHfc === 0 && maxFlux === 0) {
      return { positions: [], types: [] };
    }
    const odf = new Float32Array(numFrames);
    for (let f = 0; f < numFrames; f++) {
      const normHfc = maxHfc > 0 ? hfcValues[f] / maxHfc : 0;
      const normFlux = maxFlux > 0 ? fluxValues[f] / maxFlux : 0;
      odf[f] = 0.5 * normHfc + 0.5 * normFlux;
    }
    const positions = [];
    const types = [];
    const halfMedian = MEDIAN_FILTER_SIZE - 1 >>> 1;
    const minSpacingFrames = Math.floor(
      MIN_ONSET_SPACING_MS / 1e3 * this.sampleRate / hopSize
    );
    let lastPicked = -minSpacingFrames - 1;
    for (let f = 0; f < numFrames; f++) {
      const start = Math.max(0, f - halfMedian);
      const end = Math.min(numFrames - 1, f + halfMedian);
      const neighbourhood = [];
      for (let j = start; j <= end; j++) {
        neighbourhood.push(odf[j]);
      }
      neighbourhood.sort((a, b) => a - b);
      const median = neighbourhood[neighbourhood.length >>> 1];
      if (odf[f] > median * threshold && odf[f] > 0.01 && f - lastPicked >= minSpacingFrames) {
        const samplePos = f * hopSize + (fftSize >>> 1);
        positions.push(samplePos);
        const zcr = zcrValues[f];
        if (zcr > 0.15) {
          types.push("percussive");
        } else if (zcr < 0.05) {
          types.push("tonal");
        } else {
          types.push("mixed");
        }
        lastPicked = f;
      }
    }
    return { positions, types };
  }
  // ════════════════════════════════════════════════════════════════════════
  //  BPM Detection — onset autocorrelation
  // ════════════════════════════════════════════════════════════════════════
  detectBPM(audioData, options = {}) {
    const minBPM = options.minBPM ?? 60;
    const maxBPM = options.maxBPM ?? 200;
    const windowSize = 1024;
    const fftSize = this.nextPow2(windowSize);
    const hopSize = windowSize >>> 1;
    const hannWin = this.hannWindow(fftSize);
    const numFrames = Math.floor((audioData.length - fftSize) / hopSize) + 1;
    if (numFrames < 4) {
      return { bpm: 0, confidence: 0, alternatives: [] };
    }
    const onsetEnvelope = new Float32Array(numFrames);
    let prevMag = new Float32Array(fftSize / 2 + 1);
    for (let f = 0; f < numFrames; f++) {
      const offset = f * hopSize;
      const windowed = new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        windowed[i] = offset + i < audioData.length ? audioData[offset + i] * hannWin[i] : 0;
      }
      const { magnitude } = this.computeFFT(windowed, fftSize);
      let flux = 0;
      for (let k = 0; k <= fftSize / 2; k++) {
        const diff = magnitude[k] - prevMag[k];
        if (diff > 0) flux += diff;
      }
      onsetEnvelope[f] = flux;
      prevMag = magnitude;
    }
    const framesPerSecond = this.sampleRate / hopSize;
    const minLag = Math.floor(60 / maxBPM * framesPerSecond);
    const maxLag = Math.ceil(60 / minBPM * framesPerSecond);
    if (maxLag >= numFrames) {
      return { bpm: 0, confidence: 0, alternatives: [] };
    }
    const acf = this.autocorrelate(onsetEnvelope, minLag, maxLag);
    const candidates = [];
    let acfMax = 0;
    for (let i = 0; i < acf.length; i++) {
      if (acf[i] > acfMax) acfMax = acf[i];
    }
    if (acfMax === 0) {
      return { bpm: 0, confidence: 0, alternatives: [] };
    }
    for (let i = 1; i < acf.length - 1; i++) {
      if (acf[i] > acf[i - 1] && acf[i] > acf[i + 1] && acf[i] > acfMax * 0.1) {
        const lag = minLag + i;
        candidates.push({ lag, value: acf[i] / acfMax });
      }
    }
    if (candidates.length === 0) {
      let bestIdx = 0;
      for (let i = 1; i < acf.length; i++) {
        if (acf[i] > acf[bestIdx]) bestIdx = i;
      }
      const lag = minLag + bestIdx;
      const bpm = 60 * framesPerSecond / lag;
      return {
        bpm: Math.round(bpm * 10) / 10,
        confidence: acf[bestIdx] / acfMax,
        alternatives: []
      };
    }
    candidates.sort((a, b) => b.value - a.value);
    const results = candidates.map((c) => ({
      bpm: Math.round(60 * framesPerSecond / c.lag * 10) / 10,
      confidence: c.value
    }));
    const deduped = [];
    for (const r of results) {
      const hasSimilar = deduped.some((d) => Math.abs(d.bpm - r.bpm) < 1);
      if (!hasSimilar) deduped.push(r);
    }
    return {
      bpm: deduped[0].bpm,
      confidence: deduped[0].confidence,
      alternatives: deduped.slice(1, 5)
    };
  }
  // ════════════════════════════════════════════════════════════════════════
  //  Peak Analysis
  // ════════════════════════════════════════════════════════════════════════
  analyzePeaks(audioData, count = 10) {
    if (audioData.length === 0) {
      return { peaks: [], truePeak: 0, peakFrame: 0 };
    }
    let truePeak = 0;
    let peakFrame = 0;
    for (let i = 0; i < audioData.length; i++) {
      const abs = Math.abs(audioData[i]);
      if (abs > truePeak) {
        truePeak = abs;
        peakFrame = i;
      }
    }
    if (truePeak === 0) {
      return { peaks: [], truePeak: 0, peakFrame: 0 };
    }
    const windowSamples = Math.max(Math.floor(this.sampleRate * 0.01), 16);
    const localPeaks = [];
    for (let i = windowSamples; i < audioData.length - windowSamples; i++) {
      const abs = Math.abs(audioData[i]);
      if (abs < truePeak * 0.01) continue;
      let isMax = true;
      for (let j = -windowSamples; j <= windowSamples; j++) {
        if (j === 0) continue;
        if (Math.abs(audioData[i + j]) > abs) {
          isMax = false;
          break;
        }
      }
      if (isMax) {
        localPeaks.push({ frame: i, amplitude: abs });
      }
    }
    localPeaks.sort((a, b) => b.amplitude - a.amplitude);
    const topPeaks = localPeaks.slice(0, count);
    topPeaks.sort((a, b) => a.frame - b.frame);
    return {
      peaks: topPeaks,
      truePeak,
      peakFrame
    };
  }
  // ════════════════════════════════════════════════════════════════════════
  //  Loudness Profile (RMS + integrated LUFS)
  // ════════════════════════════════════════════════════════════════════════
  analyzeLoudness(audioData, windowSize) {
    const winSize = windowSize ?? Math.floor(this.sampleRate * 0.4);
    const hopSize = winSize >>> 1;
    const numWindows = Math.max(
      1,
      Math.floor((audioData.length - winSize) / hopSize) + 1
    );
    const rms = new Float32Array(numWindows);
    let totalMeanSquare = 0;
    let totalSamples = 0;
    for (let w = 0; w < numWindows; w++) {
      const offset = w * hopSize;
      let sumOfSquares = 0;
      let count = 0;
      for (let i = 0; i < winSize && offset + i < audioData.length; i++) {
        const sample = audioData[offset + i];
        sumOfSquares += sample * sample;
        count++;
      }
      const windowRms = count > 0 ? Math.sqrt(sumOfSquares / count) : 0;
      rms[w] = windowRms;
      totalMeanSquare += sumOfSquares;
      totalSamples += count;
    }
    const globalMeanSquare = totalSamples > 0 ? totalMeanSquare / totalSamples : 0;
    const integratedLUFS = globalMeanSquare > 0 ? -0.691 + 10 * Math.log10(globalMeanSquare) : -Infinity;
    return {
      rms,
      windowSize: winSize,
      hopSize,
      integratedLUFS
    };
  }
  // ════════════════════════════════════════════════════════════════════════
  //  Zero-Crossing Rate
  // ════════════════════════════════════════════════════════════════════════
  computeZeroCrossingRate(audioData, windowSize) {
    const winSize = windowSize ?? 1024;
    const hopSize = winSize >>> 1;
    const numWindows = Math.max(
      1,
      Math.floor((audioData.length - winSize) / hopSize) + 1
    );
    const zcr = new Float32Array(numWindows);
    for (let w = 0; w < numWindows; w++) {
      const offset = w * hopSize;
      let crossings = 0;
      for (let i = 1; i < winSize && offset + i < audioData.length; i++) {
        if (audioData[offset + i] >= 0 !== audioData[offset + i - 1] >= 0) {
          crossings++;
        }
      }
      zcr[w] = crossings / (winSize - 1);
    }
    return zcr;
  }
  // ════════════════════════════════════════════════════════════════════════
  //  Spectral Centroid
  // ════════════════════════════════════════════════════════════════════════
  computeSpectralCentroid(audioData, fftSize) {
    const fft = fftSize ?? DEFAULT_FFT_SIZE;
    const actualFftSize = this.nextPow2(fft);
    const hopSize = actualFftSize >>> 1;
    const hannWin = this.hannWindow(actualFftSize);
    const numFrames = Math.max(
      1,
      Math.floor((audioData.length - actualFftSize) / hopSize) + 1
    );
    const centroids = new Float32Array(numFrames);
    const freqPerBin = this.sampleRate / actualFftSize;
    for (let f = 0; f < numFrames; f++) {
      const offset = f * hopSize;
      const windowed = new Float32Array(actualFftSize);
      for (let i = 0; i < actualFftSize; i++) {
        windowed[i] = offset + i < audioData.length ? audioData[offset + i] * hannWin[i] : 0;
      }
      const { magnitude } = this.computeFFT(windowed, actualFftSize);
      let numerator = 0;
      let denominator = 0;
      for (let k = 0; k <= actualFftSize / 2; k++) {
        const freq = k * freqPerBin;
        numerator += freq * magnitude[k];
        denominator += magnitude[k];
      }
      centroids[f] = denominator > 0 ? numerator / denominator : 0;
    }
    return centroids;
  }
  // ════════════════════════════════════════════════════════════════════════
  //  FFT — Radix-2 Cooley-Tukey (in-place, decimation-in-time)
  // ════════════════════════════════════════════════════════════════════════
  computeFFT(data, fftSize) {
    const n = fftSize;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      real[i] = data[i];
    }
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
      if (i < j) {
        let tmp = real[i];
        real[i] = real[j];
        real[j] = tmp;
        tmp = imag[i];
        imag[i] = imag[j];
        imag[j] = tmp;
      }
      let k = n >>> 1;
      while (k <= j) {
        j -= k;
        k >>>= 1;
      }
      j += k;
    }
    for (let stage = 1; stage < n; stage <<= 1) {
      const halfStage = stage;
      const fullStage = stage << 1;
      const angleIncrement = -Math.PI / halfStage;
      let twiddleReal = 1;
      let twiddleImag = 0;
      const wReal = Math.cos(angleIncrement);
      const wImag = Math.sin(angleIncrement);
      for (let k = 0; k < halfStage; k++) {
        for (let i = k; i < n; i += fullStage) {
          const partner = i + halfStage;
          const tReal = twiddleReal * real[partner] - twiddleImag * imag[partner];
          const tImag = twiddleReal * imag[partner] + twiddleImag * real[partner];
          real[partner] = real[i] - tReal;
          imag[partner] = imag[i] - tImag;
          real[i] += tReal;
          imag[i] += tImag;
        }
        const nextTwiddleReal = twiddleReal * wReal - twiddleImag * wImag;
        const nextTwiddleImag = twiddleReal * wImag + twiddleImag * wReal;
        twiddleReal = nextTwiddleReal;
        twiddleImag = nextTwiddleImag;
      }
    }
    const halfN = n / 2;
    const magnitude = new Float32Array(halfN + 1);
    const phase = new Float32Array(halfN + 1);
    for (let k = 0; k <= halfN; k++) {
      magnitude[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
      phase[k] = Math.atan2(imag[k], real[k]);
    }
    return { magnitude, phase };
  }
  // ════════════════════════════════════════════════════════════════════════
  //  Hann Window
  // ════════════════════════════════════════════════════════════════════════
  hannWindow(size) {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
    }
    return window;
  }
  // ════════════════════════════════════════════════════════════════════════
  //  Autocorrelation
  // ════════════════════════════════════════════════════════════════════════
  autocorrelate(data, minLag, maxLag) {
    const n = data.length;
    const resultLength = maxLag - minLag + 1;
    const result = new Float32Array(resultLength);
    let mean = 0;
    for (let i = 0; i < n; i++) mean += data[i];
    mean /= n;
    let normFactor = 0;
    for (let i = 0; i < n; i++) {
      const centered = data[i] - mean;
      normFactor += centered * centered;
    }
    for (let lagIdx = 0; lagIdx < resultLength; lagIdx++) {
      const lag = minLag + lagIdx;
      let sum = 0;
      for (let i = 0; i < n - lag; i++) {
        sum += (data[i] - mean) * (data[i + lag] - mean);
      }
      result[lagIdx] = normFactor > 0 ? sum / normFactor : 0;
    }
    return result;
  }
  // ════════════════════════════════════════════════════════════════════════
  //  Utility
  // ════════════════════════════════════════════════════════════════════════
  nextPow2(v) {
    let p = 1;
    while (p < v) p <<= 1;
    return p;
  }
};

// core/src/index.ts
init_Signal();

// core/src/lib/ThawList.ts
init_Signal();
var ThawList2 = class {
  constructor() {
    this._freezeCount = 0;
    this._pendingChanges = [];
    this._hasPendingChanges = false;
    /**
     * Emitted when the outermost thaw() resolves and there are pending
     * changes. Receives the full array of batched changes.
     */
    this.changed = new Signal();
    /**
     * Emitted immediately for each change when the list is NOT frozen.
     * When frozen, individual notifications are suppressed until thaw.
     */
    this.singleChanged = new Signal();
  }
  // ---------------------------------------------------------------
  // State accessors
  // ---------------------------------------------------------------
  /**
   * Whether notifications are currently suppressed.
   */
  get isFrozen() {
    return this._freezeCount > 0;
  }
  /**
   * Current nesting depth of freeze() calls.
   */
  get freezeCount() {
    return this._freezeCount;
  }
  /**
   * Number of changes queued while frozen.
   */
  get pendingCount() {
    return this._pendingChanges.length;
  }
  // ---------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------
  /**
   * Freeze (suppress) notifications.
   *
   * Can be called multiple times to nest freeze contexts. Each freeze()
   * must be balanced by a corresponding thaw().
   */
  freeze() {
    this._freezeCount++;
  }
  /**
   * Thaw notifications.
   *
   * Decrements the freeze counter. When the counter reaches zero (i.e.
   * the outermost freeze context is resolved) and there are pending
   * changes, a single batch notification is emitted via {@link changed}.
   *
   * @throws Error if called without a matching freeze().
   */
  thaw() {
    if (this._freezeCount <= 0) {
      throw new Error("ThawList.thaw() called without matching freeze()");
    }
    this._freezeCount--;
    if (this._freezeCount === 0 && this._hasPendingChanges) {
      const changes = this._pendingChanges;
      this._pendingChanges = [];
      this._hasPendingChanges = false;
      this.changed.emit(changes);
    }
  }
  /**
   * Record a change.
   *
   * - If the list is **not frozen**, the change is emitted immediately
   *   via {@link singleChanged}.
   * - If the list **is frozen**, the change is queued and will be
   *   included in the batch notification when the outermost thaw()
   *   resolves.
   */
  notify(data) {
    if (this._freezeCount > 0) {
      this._pendingChanges.push(data);
      this._hasPendingChanges = true;
    } else {
      this.singleChanged.emit(data);
    }
  }
  /**
   * Force-emit all pending changes as a batch notification, regardless
   * of the current freeze state. The freeze counter is **not** modified.
   *
   * Useful for "flush before destroy" scenarios where you need to
   * guarantee observers see all pending changes.
   */
  flush() {
    if (this._hasPendingChanges) {
      const changes = this._pendingChanges;
      this._pendingChanges = [];
      this._hasPendingChanges = false;
      this.changed.emit(changes);
    }
  }
  /**
   * Discard all pending changes without emitting any notification.
   *
   * The freeze counter is **not** modified. This is useful when an
   * operation is aborted/rolled back and queued notifications should
   * be silently dropped.
   */
  discard() {
    this._pendingChanges = [];
    this._hasPendingChanges = false;
  }
  /**
   * Execute a function within a freeze/thaw block.
   *
   * Convenience wrapper that:
   * 1. Calls freeze()
   * 2. Invokes `fn`
   * 3. Calls thaw() (even if `fn` throws)
   *
   * This ensures the freeze/thaw pairing is always balanced.
   *
   * @param fn The function to execute while notifications are frozen.
   */
  batch(fn) {
    this.freeze();
    try {
      fn();
    } finally {
      this.thaw();
    }
  }
};

// core/src/index.ts
init_DisposableGroup();
init_Processor();
init_GainProcessor();
init_Panner();
init_PluginInsert();

// core/src/processing/SurroundPanner.ts
init_Processor();
init_Signal();
var SpeakerLayout = /* @__PURE__ */ ((SpeakerLayout2) => {
  SpeakerLayout2["STEREO"] = "STEREO";
  SpeakerLayout2["QUAD"] = "QUAD";
  SpeakerLayout2["SURROUND_5_1"] = "5.1";
  SpeakerLayout2["SURROUND_7_1"] = "7.1";
  return SpeakerLayout2;
})(SpeakerLayout || {});
var SurroundPanner = class _SurroundPanner extends Processor {
  constructor(id, layout) {
    super(id, "Surround Panner");
    this._azimuth = 0;
    // Source horizontal angle in degrees
    this._elevation = 0;
    // Source vertical angle in degrees
    this._spread = 0;
    // Source spread (0 = point, 1 = omni)
    this._lfeLevel = 0;
    // LFE send level (0-1)
    this._layout = "STEREO" /* STEREO */;
    this._speakers = [];
    this._gains = new Float32Array(0);
    this.positionChanged = new Signal();
    this.layoutChanged = new Signal();
    const initialLayout = layout ?? "STEREO" /* STEREO */;
    this._speakers = this.setupSpeakers(initialLayout);
    this._layout = initialLayout;
    this._gains = new Float32Array(this._speakers.length);
    this.computeGains();
  }
  // ── Position control ────────────────────────────────────────────────────
  /**
   * Set the source position.
   * @param azimuth  Horizontal angle in degrees (-180 to 180).
   * @param elevation Vertical angle in degrees (-90 to 90). Defaults to current.
   */
  setPosition(azimuth, elevation) {
    const clampedAz = Math.max(-180, Math.min(180, azimuth));
    const clampedEl = elevation !== void 0 ? Math.max(-90, Math.min(90, elevation)) : this._elevation;
    if (this._azimuth !== clampedAz || this._elevation !== clampedEl) {
      this._azimuth = clampedAz;
      this._elevation = clampedEl;
      this.computeGains();
      this.positionChanged.emit({
        azimuth: this._azimuth,
        elevation: this._elevation
      });
      this.stateChanged.emit();
    }
  }
  /**
   * Set the source spread.
   * @param spread 0 = point source, 1 = omnidirectional.
   */
  setSpread(spread) {
    const clamped = Math.max(0, Math.min(1, spread));
    if (this._spread !== clamped) {
      this._spread = clamped;
      this.computeGains();
      this.stateChanged.emit();
    }
  }
  /**
   * Set the LFE send level.
   * @param level 0 to 1.
   */
  setLFELevel(level) {
    const clamped = Math.max(0, Math.min(1, level));
    if (this._lfeLevel !== clamped) {
      this._lfeLevel = clamped;
      this.stateChanged.emit();
    }
  }
  get azimuth() {
    return this._azimuth;
  }
  get elevation() {
    return this._elevation;
  }
  get spread() {
    return this._spread;
  }
  get lfeLevel() {
    return this._lfeLevel;
  }
  // ── Layout ──────────────────────────────────────────────────────────────
  /**
   * Set the speaker layout. Recomputes speaker positions and gains.
   */
  setLayout(layout) {
    if (this._layout !== layout) {
      this._layout = layout;
      this._speakers = this.setupSpeakers(layout);
      this._gains = new Float32Array(this._speakers.length);
      this.computeGains();
      this.layoutChanged.emit(layout);
      this.stateChanged.emit();
    }
  }
  get layout() {
    return this._layout;
  }
  /** Number of output channels for the current layout. */
  get channelCount() {
    return this._speakers.length;
  }
  /** Speaker positions for the current layout. */
  get speakers() {
    return this._speakers;
  }
  // ── Gain computation ────────────────────────────────────────────────────
  /**
   * Compute per-channel gains based on the current source position,
   * spread, and layout using VBAP.
   *
   * @returns Float32Array of linear gains, one per speaker/channel.
   */
  computeGains() {
    const hasElevation = this._elevation !== 0;
    let rawGains;
    if (hasElevation) {
      rawGains = this.vbap3D(this._azimuth, this._elevation);
    } else {
      rawGains = this.vbap2D(this._azimuth);
    }
    if (this._spread > 0) {
      const uniformGain = 1 / Math.sqrt(this._speakers.length);
      for (let i = 0; i < rawGains.length; i++) {
        rawGains[i] = rawGains[i] * (1 - this._spread) + uniformGain * this._spread;
      }
    }
    if (this._layout === "5.1" /* SURROUND_5_1 */ || this._layout === "7.1" /* SURROUND_7_1 */) {
      const lfeIndex = this.getLFEChannelIndex();
      if (lfeIndex >= 0 && lfeIndex < rawGains.length) {
        rawGains[lfeIndex] = this._lfeLevel;
      }
    }
    this._gains = rawGains;
    return new Float32Array(rawGains);
  }
  // ── VBAP algorithms ─────────────────────────────────────────────────────
  /**
   * 2D VBAP: Vector Base Amplitude Panning in the horizontal plane.
   *
   * For each adjacent speaker pair, computes the amplitude split
   * based on the angular position of the source relative to both speakers.
   *
   * @param azimuth Source azimuth in degrees (-180 to 180).
   */
  vbap2D(azimuth) {
    const gains = new Float32Array(this._speakers.length);
    const speakerCount = this._speakers.length;
    if (speakerCount === 0) return gains;
    if (this._layout === "STEREO" /* STEREO */) {
      const normalized = Math.max(-1, Math.min(1, azimuth / 180));
      const pan01 = (normalized + 1) / 2;
      const angle = pan01 * Math.PI / 2;
      gains[0] = Math.cos(angle);
      gains[1] = Math.sin(angle);
      return gains;
    }
    const sourceRad = azimuth * Math.PI / 180;
    const activeSpeakers = [];
    for (let i = 0; i < speakerCount; i++) {
      if (this._speakers[i].label === "LFE") continue;
      activeSpeakers.push({
        index: i,
        azimuthRad: this._speakers[i].azimuth * Math.PI / 180
      });
    }
    activeSpeakers.sort((a, b) => a.azimuthRad - b.azimuthRad);
    if (activeSpeakers.length === 0) return gains;
    if (activeSpeakers.length === 1) {
      gains[activeSpeakers[0].index] = 1;
      return gains;
    }
    let found = false;
    for (let i = 0; i < activeSpeakers.length; i++) {
      const next = (i + 1) % activeSpeakers.length;
      let az1 = activeSpeakers[i].azimuthRad;
      let az2 = activeSpeakers[next].azimuthRad;
      let span = az2 - az1;
      if (span <= 0) span += 2 * Math.PI;
      let sourceOffset = sourceRad - az1;
      if (sourceOffset < 0) sourceOffset += 2 * Math.PI;
      if (sourceOffset <= span) {
        const t = span > 0 ? sourceOffset / span : 0;
        const angle = t * Math.PI / 2;
        const g2 = Math.sin(angle);
        const g1 = Math.cos(angle);
        gains[activeSpeakers[i].index] = g1;
        gains[activeSpeakers[next].index] = g2;
        found = true;
        break;
      }
    }
    if (!found) {
      let minDist = Infinity;
      let closest = 0;
      for (const sp of activeSpeakers) {
        let dist = Math.abs(sourceRad - sp.azimuthRad);
        if (dist > Math.PI) dist = 2 * Math.PI - dist;
        if (dist < minDist) {
          minDist = dist;
          closest = sp.index;
        }
      }
      gains[closest] = 1;
    }
    return gains;
  }
  /**
   * 3D VBAP: Vector Base Amplitude Panning with elevation.
   *
   * Extends 2D VBAP by considering the vertical angle to distribute
   * energy across speakers at different elevations.
   *
   * @param azimuth Source azimuth in degrees.
   * @param elevation Source elevation in degrees.
   */
  vbap3D(azimuth, elevation) {
    const gains = new Float32Array(this._speakers.length);
    const speakerCount = this._speakers.length;
    if (speakerCount === 0) return gains;
    const srcAzRad = azimuth * Math.PI / 180;
    const srcElRad = elevation * Math.PI / 180;
    const srcX = Math.cos(srcElRad) * Math.cos(srcAzRad);
    const srcY = Math.cos(srcElRad) * Math.sin(srcAzRad);
    const srcZ = Math.sin(srcElRad);
    const dotProducts = [];
    let totalWeight = 0;
    for (let i = 0; i < speakerCount; i++) {
      if (this._speakers[i].label === "LFE") {
        dotProducts.push(0);
        continue;
      }
      const spAzRad = this._speakers[i].azimuth * Math.PI / 180;
      const spElRad = this._speakers[i].elevation * Math.PI / 180;
      const spX = Math.cos(spElRad) * Math.cos(spAzRad);
      const spY = Math.cos(spElRad) * Math.sin(spAzRad);
      const spZ = Math.sin(spElRad);
      let dot = srcX * spX + srcY * spY + srcZ * spZ;
      dot = Math.max(0, dot);
      dot = dot * dot;
      dotProducts.push(dot);
      totalWeight += dot;
    }
    if (totalWeight > 0) {
      for (let i = 0; i < speakerCount; i++) {
        gains[i] = Math.sqrt(dotProducts[i] / totalWeight);
      }
    } else {
      let nonLfeCount = 0;
      for (let i = 0; i < speakerCount; i++) {
        if (this._speakers[i].label !== "LFE") nonLfeCount++;
      }
      if (nonLfeCount > 0) {
        const equalGain = 1 / Math.sqrt(nonLfeCount);
        for (let i = 0; i < speakerCount; i++) {
          if (this._speakers[i].label !== "LFE") {
            gains[i] = equalGain;
          }
        }
      }
    }
    return gains;
  }
  // ── Speaker setup ───────────────────────────────────────────────────────
  /**
   * Setup default speaker positions for a given layout.
   * Angles follow the ITU-R BS.775 and ITU-R BS.2051 standards.
   */
  setupSpeakers(layout) {
    switch (layout) {
      case "STEREO" /* STEREO */:
        return [
          { azimuth: -30, elevation: 0, distance: 1, label: "L" },
          { azimuth: 30, elevation: 0, distance: 1, label: "R" }
        ];
      case "QUAD" /* QUAD */:
        return [
          { azimuth: -45, elevation: 0, distance: 1, label: "FL" },
          { azimuth: 45, elevation: 0, distance: 1, label: "FR" },
          { azimuth: -135, elevation: 0, distance: 1, label: "RL" },
          { azimuth: 135, elevation: 0, distance: 1, label: "RR" }
        ];
      case "5.1" /* SURROUND_5_1 */:
        return [
          { azimuth: -30, elevation: 0, distance: 1, label: "FL" },
          { azimuth: 30, elevation: 0, distance: 1, label: "FR" },
          { azimuth: 0, elevation: 0, distance: 1, label: "C" },
          { azimuth: 0, elevation: -90, distance: 1, label: "LFE" },
          { azimuth: -110, elevation: 0, distance: 1, label: "RL" },
          { azimuth: 110, elevation: 0, distance: 1, label: "RR" }
        ];
      case "7.1" /* SURROUND_7_1 */:
        return [
          { azimuth: -30, elevation: 0, distance: 1, label: "FL" },
          { azimuth: 30, elevation: 0, distance: 1, label: "FR" },
          { azimuth: 0, elevation: 0, distance: 1, label: "C" },
          { azimuth: 0, elevation: -90, distance: 1, label: "LFE" },
          { azimuth: -135, elevation: 0, distance: 1, label: "RL" },
          { azimuth: 135, elevation: 0, distance: 1, label: "RR" },
          { azimuth: -90, elevation: 0, distance: 1, label: "SL" },
          { azimuth: 90, elevation: 0, distance: 1, label: "SR" }
        ];
      default:
        return [
          { azimuth: -30, elevation: 0, distance: 1, label: "L" },
          { azimuth: 30, elevation: 0, distance: 1, label: "R" }
        ];
    }
  }
  /**
   * Get the index of the LFE channel in the current layout.
   * Returns -1 if the layout has no LFE channel.
   */
  getLFEChannelIndex() {
    return this._speakers.findIndex((s) => s.label === "LFE");
  }
  // ── Serialization ───────────────────────────────────────────────────────
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      azimuth: this._azimuth,
      elevation: this._elevation,
      spread: this._spread,
      lfeLevel: this._lfeLevel,
      layout: this._layout,
      active: this.active
    };
  }
  static fromJSON(data) {
    const panner = new _SurroundPanner(data.id, data.layout);
    panner.name = data.name;
    panner._azimuth = data.azimuth;
    panner._elevation = data.elevation;
    panner._spread = data.spread;
    panner._lfeLevel = data.lfeLevel;
    panner.active = data.active;
    panner.computeGains();
    return panner;
  }
};

// core/src/processing/InternalSend.ts
init_Processor();
init_Signal();
var InternalSend = class _InternalSend extends Processor {
  constructor(id, name, targetTrackId) {
    super(id, name);
    this._sendLevel = 0;
    // dB
    this._preFader = false;
    this._muted = false;
    this.targetChanged = new Signal();
    this.levelChanged = new Signal();
    this._targetTrackId = targetTrackId;
  }
  // ── Target ──────────────────────────────────────────────────────────────
  /** The ID of the target track that receives audio from this send. */
  get targetTrackId() {
    return this._targetTrackId;
  }
  /**
   * Change the target track.
   * @param trackId The new target track ID.
   */
  setTarget(trackId) {
    if (this._targetTrackId !== trackId) {
      this._targetTrackId = trackId;
      this.targetChanged.emit(trackId);
      this.stateChanged.emit();
    }
  }
  // ── Send Level ──────────────────────────────────────────────────────────
  /** Send level in dB. 0 dB = unity gain. */
  get sendLevel() {
    return this._sendLevel;
  }
  /**
   * Set the send level in dB.
   * @param db Level in decibels. Clamped to [-100, +12]. -Infinity = silence, 0 = unity.
   */
  setSendLevel(db) {
    const clamped = db === -Infinity ? -Infinity : Math.min(Math.max(db, -100), 12);
    if (this._sendLevel !== clamped) {
      this._sendLevel = clamped;
      this.levelChanged.emit(clamped);
      this.stateChanged.emit();
    }
  }
  // ── Pre/Post Fader ──────────────────────────────────────────────────────
  /** Whether this send taps the signal before the channel fader. */
  get preFader() {
    return this._preFader;
  }
  /**
   * Set whether this send is pre-fader or post-fader.
   * @param pre true for pre-fader, false for post-fader.
   */
  setPreFader(pre) {
    if (this._preFader !== pre) {
      this._preFader = pre;
      this.stateChanged.emit();
    }
  }
  // ── Mute ────────────────────────────────────────────────────────────────
  /** Whether this send is muted. */
  get muted() {
    return this._muted;
  }
  /**
   * Set the mute state of this send.
   * @param muted true to mute, false to unmute.
   */
  setMuted(muted) {
    if (this._muted !== muted) {
      this._muted = muted;
      this.stateChanged.emit();
    }
  }
  // ── Gain computation ────────────────────────────────────────────────────
  /**
   * Compute the linear gain to apply to audio routed through this send.
   * Takes into account the send level (dB) and mute state.
   *
   * @returns Linear gain (0.0 if muted or inactive).
   */
  getLinearGain() {
    if (this._muted || !this.active) {
      return 0;
    }
    return Math.pow(10, this._sendLevel / 20);
  }
  // ── Serialization ───────────────────────────────────────────────────────
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      targetTrackId: this._targetTrackId,
      sendLevel: this._sendLevel,
      preFader: this._preFader,
      muted: this._muted,
      active: this.active
    };
  }
  static fromJSON(data) {
    const send = new _InternalSend(
      data.id,
      data.name,
      data.targetTrackId
    );
    send._sendLevel = data.sendLevel;
    send._preFader = data.preFader;
    send._muted = data.muted;
    send.active = data.active;
    return send;
  }
};
var InternalReturn = class _InternalReturn extends Processor {
  constructor(id, name) {
    super(id, name);
    this._sourceTrackIds = /* @__PURE__ */ new Set();
    this.sourceAdded = new Signal();
    this.sourceRemoved = new Signal();
  }
  /**
   * Register a source track that is sending audio to this return.
   * @param trackId The source track ID.
   */
  addSource(trackId) {
    if (!this._sourceTrackIds.has(trackId)) {
      this._sourceTrackIds.add(trackId);
      this.sourceAdded.emit(trackId);
      this.stateChanged.emit();
    }
  }
  /**
   * Remove a source track from this return.
   * @param trackId The source track ID to remove.
   */
  removeSource(trackId) {
    if (this._sourceTrackIds.has(trackId)) {
      this._sourceTrackIds.delete(trackId);
      this.sourceRemoved.emit(trackId);
      this.stateChanged.emit();
    }
  }
  /** List of all source track IDs sending audio to this return. */
  get sourceTrackIds() {
    return Array.from(this._sourceTrackIds);
  }
  /**
   * Check if a specific track is registered as a source.
   * @param trackId The track ID to check.
   */
  hasSource(trackId) {
    return this._sourceTrackIds.has(trackId);
  }
  // ── Serialization ───────────────────────────────────────────────────────
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      sourceTrackIds: Array.from(this._sourceTrackIds),
      active: this.active
    };
  }
  static fromJSON(data) {
    const ret = new _InternalReturn(data.id, data.name);
    for (const id of data.sourceTrackIds) {
      ret._sourceTrackIds.add(id);
    }
    ret.active = data.active;
    return ret;
  }
};

// core/src/index.ts
init_IO();

// core/src/preferences/KeyBindings.ts
init_Signal();
init_Logger();
var KeyBindings = class _KeyBindings {
  constructor() {
    this.customBindings = /* @__PURE__ */ new Map();
    this.bindingsChanged = new Signal();
    this.loadFromStorage();
  }
  static getInstance() {
    if (!_KeyBindings.instance) {
      _KeyBindings.instance = new _KeyBindings();
    }
    return _KeyBindings.instance;
  }
  /**
   * Set a custom key binding for an action, overriding the default.
   */
  setBinding(actionId, keyCombo) {
    this.customBindings.set(actionId, keyCombo);
    this.saveToStorage();
    this.bindingsChanged.emit({ actionId, keyCombo });
  }
  /**
   * Get the custom key binding for an action (undefined if using default).
   */
  getBinding(actionId) {
    return this.customBindings.get(actionId);
  }
  /**
   * Remove a custom binding, reverting to default.
   */
  removeBinding(actionId) {
    this.customBindings.delete(actionId);
    this.saveToStorage();
    this.bindingsChanged.emit({ actionId, keyCombo: void 0 });
  }
  /**
   * Clear all custom bindings, reverting everything to defaults.
   */
  resetToDefaults() {
    this.customBindings.clear();
    this.saveToStorage();
    this.bindingsChanged.emit({ actionId: "*", keyCombo: void 0 });
  }
  /**
   * Get all custom bindings as a Map of actionId -> keyCombo.
   */
  getAllBindings() {
    return new Map(this.customBindings);
  }
  saveToStorage() {
    try {
      if (typeof localStorage === "undefined") return;
      const data = Object.fromEntries(this.customBindings);
      localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(data));
    } catch {
      logger.warn("KeyBindings", "Failed to save to localStorage");
    }
  }
  loadFromStorage() {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(KEY_BINDINGS_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.customBindings = new Map(Object.entries(data));
      }
    } catch {
      logger.warn("KeyBindings", "Failed to load from localStorage");
    }
  }
};

// core/src/actions/ActionRegistry.ts
init_Logger();
var ActionRegistry = class _ActionRegistry {
  constructor() {
    this.actions = /* @__PURE__ */ new Map();
    this.keyMap = /* @__PURE__ */ new Map();
  }
  static getInstance() {
    if (!_ActionRegistry.instance) {
      _ActionRegistry.instance = new _ActionRegistry();
    }
    return _ActionRegistry.instance;
  }
  registerDefaults(actions) {
    actions.forEach((action) => {
      this.register(action);
    });
  }
  register(action) {
    this.actions.set(action.id, action);
    if (action.defaultKey) {
      this.keyMap.set(action.defaultKey.toLowerCase(), action.id);
    }
  }
  getAction(id) {
    return this.actions.get(id);
  }
  getAllActions() {
    return Array.from(this.actions.values());
  }
  /**
   * Resolve the effective key for an action, checking custom bindings first,
   * then falling back to the default key.
   */
  getEffectiveKey(actionId) {
    const customBinding = KeyBindings.getInstance().getBinding(actionId);
    if (customBinding !== void 0) {
      return customBinding;
    }
    return this.actions.get(actionId)?.defaultKey;
  }
  /**
   * Look up an action by key string, checking custom bindings first,
   * then falling back to default key map.
   */
  getActionIdByKey(key) {
    const lowerKey = key.toLowerCase();
    const customBindings = KeyBindings.getInstance().getAllBindings();
    for (const [actionId, keyCombo] of customBindings) {
      if (keyCombo.toLowerCase() === lowerKey) {
        return actionId;
      }
    }
    return this.keyMap.get(lowerKey);
  }
  /**
   * Rebuild the key map (useful after registering new actions or changing bindings).
   */
  rebuildKeyMap() {
    this.keyMap.clear();
    for (const action of this.actions.values()) {
      if (action.defaultKey) {
        this.keyMap.set(action.defaultKey.toLowerCase(), action.id);
      }
    }
  }
  /**
   * Get all actions grouped by category.
   * Category is derived from action ID prefix (e.g., "transport.play" -> "Transport").
   */
  getActionsByCategory() {
    const categories = /* @__PURE__ */ new Map();
    for (const action of this.actions.values()) {
      const dotIndex = action.id.indexOf(".");
      const categoryKey = dotIndex >= 0 ? action.id.substring(0, dotIndex) : "general";
      const categoryLabel = categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
      if (!categories.has(categoryLabel)) {
        categories.set(categoryLabel, []);
      }
      categories.get(categoryLabel).push(action);
    }
    return categories;
  }
  async execute(id, context) {
    const action = this.actions.get(id);
    if (!action) {
      logger.warn("ActionRegistry", `Action not found: ${id}`);
      return;
    }
    if (action.execute) {
      await action.execute(context);
    } else if (action.commandFactory) {
      const command = action.commandFactory(context);
      await CommandExecutor.getInstance().execute(command);
    }
  }
};

// core/src/preferences/Preferences.ts
init_Signal();
init_Logger();
var DEFAULT_PREFERENCES = {
  audioBufferSize: 512,
  sampleRate: 44100,
  theme: "dark",
  autoSaveInterval: 6e4,
  snapToGrid: true,
  gridSubdivision: 4,
  meterType: "peak",
  showMinimap: true,
  followPlayhead: true,
  countInBars: 0,
  historyDepth: 0,
  saveHistory: true,
  saveHistoryDepth: 0
};
var Preferences = class _Preferences {
  constructor() {
    this.preferenceChanged = new Signal();
    this.values = { ...DEFAULT_PREFERENCES };
    this.loadFromStorage();
  }
  static getInstance() {
    if (!_Preferences.instance) {
      _Preferences.instance = new _Preferences();
    }
    return _Preferences.instance;
  }
  /**
   * Get a preference value by key.
   */
  get(key) {
    return this.values[key];
  }
  /**
   * Set a preference value.
   */
  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    this.saveToStorage();
    this.preferenceChanged.emit({ key, value });
  }
  /**
   * Get all preferences as a plain object.
   */
  getAll() {
    return { ...this.values };
  }
  /**
   * Reset all preferences to defaults.
   */
  resetToDefaults() {
    const keys = Object.keys(DEFAULT_PREFERENCES);
    this.values = { ...DEFAULT_PREFERENCES };
    this.saveToStorage();
    keys.forEach((key) => {
      this.preferenceChanged.emit({ key, value: this.values[key] });
    });
  }
  saveToStorage() {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify(this.values)
      );
    } catch {
      logger.warn("Preferences", "Failed to save to localStorage");
    }
  }
  loadFromStorage() {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.values = { ...DEFAULT_PREFERENCES, ...data };
      }
    } catch {
      logger.warn("Preferences", "Failed to load from localStorage");
    }
  }
};

// core/src/storage/AutoSave.ts
init_Signal();
init_Logger();
var AUTO_SAVE_INTERVAL_MS = 6e4;
var AutoSave = class _AutoSave {
  constructor() {
    this._dirty = false;
    this._lastModified = /* @__PURE__ */ new Date();
    this._timerId = null;
    this._session = null;
    this._subscriptions = [];
    /** Emitted after each successful auto-save. */
    this.saved = new Signal();
    /** Emitted when the dirty flag changes. */
    this.dirtyChanged = new Signal();
  }
  static getInstance() {
    if (!_AutoSave.instance) {
      _AutoSave.instance = new _AutoSave();
    }
    return _AutoSave.instance;
  }
  // ─── Public API ──────────────────────────────────────────────────────────
  get dirty() {
    return this._dirty;
  }
  get lastModified() {
    return this._lastModified;
  }
  /**
   * Start monitoring the given session for changes and auto-saving.
   */
  start(session) {
    this.stop();
    this._session = session;
    this._dirty = false;
    this._lastModified = /* @__PURE__ */ new Date();
    this.subscribeToSessionSignals(session);
    this.startTimer();
    logger.debug("AutoSave", `Started for session: ${session.name}`);
  }
  /**
   * Stop auto-saving and clean up subscriptions.
   */
  stop() {
    this.stopTimer();
    this.disposeSubscriptions();
    this._session = null;
    this._dirty = false;
  }
  /**
   * Mark the session as dirty (has unsaved changes).
   */
  markDirty() {
    const wasDirty = this._dirty;
    this._dirty = true;
    this._lastModified = /* @__PURE__ */ new Date();
    if (!wasDirty) this.dirtyChanged.emit(true);
  }
  /**
   * Force an immediate save (e.g. on window beforeunload).
   */
  async saveNow() {
    if (!this._session) return;
    if (!this._dirty) return;
    try {
      const storage = SessionStorage.getInstance();
      await storage.saveSession(this._session);
      this._dirty = false;
      this.dirtyChanged.emit(false);
      this.saved.emit(/* @__PURE__ */ new Date());
      logger.debug("AutoSave", `Session saved: ${this._session.name}`);
    } catch (err) {
      logger.error("AutoSave", "Failed to save session:", err);
    }
  }
  // ─── Internals ───────────────────────────────────────────────────────────
  startTimer() {
    this._timerId = setInterval(() => {
      this.saveNow();
    }, AUTO_SAVE_INTERVAL_MS);
  }
  stopTimer() {
    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
  }
  disposeSubscriptions() {
    for (const sub of this._subscriptions) {
      sub.dispose();
    }
    this._subscriptions = [];
  }
  /**
   * Subscribe to relevant session signals so that any structural or
   * transport change automatically marks the session as dirty.
   */
  subscribeToSessionSignals(session) {
    const markDirty = () => this.markDirty();
    this._subscriptions.push(
      session.trackAdded.connect(markDirty),
      session.trackRemoved.connect(markDirty),
      session.rangeAdded.connect(markDirty),
      session.rangeRemoved.connect(markDirty),
      session.tempoChanged.connect(markDirty),
      session.timeSignatureChanged.connect(markDirty),
      session.sendBusAdded.connect(markDirty),
      session.sendBusRemoved.connect(markDirty),
      session.markerAdded.connect(markDirty),
      session.markerRemoved.connect(markDirty),
      session.markerChanged.connect(markDirty),
      session.loopRangeChanged.connect(markDirty),
      session.loopEnabledChanged.connect(markDirty),
      session.punchRangeChanged.connect(markDirty),
      session.punchEnabledChanged.connect(markDirty),
      session.rippleEditChanged.connect(markDirty),
      session.regionGroupAdded.connect(markDirty),
      session.regionGroupRemoved.connect(markDirty)
    );
  }
};

// core/src/storage/SessionArchive.ts
init_Signal();
var ARCHIVE_MAGIC = new Uint8Array([68, 65, 87, 69]);
var ARCHIVE_FORMAT_VERSION = 1;
var SessionArchive = class {
  constructor() {
    this.progress = new Signal();
  }
  /**
   * Create an archive from session data and audio sources.
   *
   * @param sessionData  JSON string of the serialized session.
   * @param sources      Array of audio sources to include.
   * @param metadata     Optional metadata overrides.
   * @returns A Blob containing the packed archive.
   */
  async createArchive(sessionData, sources, metadata) {
    this.progress.emit(0);
    const encoder = new TextEncoder();
    const sourceBuffers = [];
    let totalSourceSize = 0;
    for (let i = 0; i < sources.length; i++) {
      const data = await sources[i].blob.arrayBuffer();
      sourceBuffers.push({ name: sources[i].name, data });
      totalSourceSize += data.byteLength;
      this.progress.emit((i + 1) / (sources.length + 2) * 0.5);
    }
    const sessionBytes = encoder.encode(sessionData);
    const archiveMetadata = {
      version: metadata?.version ?? "1.0.0",
      createdAt: metadata?.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      sessionName: metadata?.sessionName ?? "Untitled Session",
      sourceCount: sources.length,
      totalSize: 0
      // Will be computed after assembly
    };
    const metadataBytes = encoder.encode(JSON.stringify(archiveMetadata));
    let totalSize = 4 + 4 + 4 + metadataBytes.byteLength + 4 + sessionBytes.byteLength + 4;
    for (const src of sourceBuffers) {
      const nameBytes = encoder.encode(src.name);
      totalSize += 4 + nameBytes.byteLength + 4 + src.data.byteLength;
    }
    archiveMetadata.totalSize = totalSize;
    const finalMetadataBytes = encoder.encode(JSON.stringify(archiveMetadata));
    const sizeDiff = finalMetadataBytes.byteLength - metadataBytes.byteLength;
    totalSize += sizeDiff;
    this.progress.emit(0.6);
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;
    bytes.set(ARCHIVE_MAGIC, offset);
    offset += 4;
    view.setUint32(offset, ARCHIVE_FORMAT_VERSION, true);
    offset += 4;
    view.setUint32(offset, finalMetadataBytes.byteLength, true);
    offset += 4;
    bytes.set(finalMetadataBytes, offset);
    offset += finalMetadataBytes.byteLength;
    view.setUint32(offset, sessionBytes.byteLength, true);
    offset += 4;
    bytes.set(sessionBytes, offset);
    offset += sessionBytes.byteLength;
    view.setUint32(offset, sourceBuffers.length, true);
    offset += 4;
    this.progress.emit(0.7);
    for (let i = 0; i < sourceBuffers.length; i++) {
      const src = sourceBuffers[i];
      const nameBytes = encoder.encode(src.name);
      view.setUint32(offset, nameBytes.byteLength, true);
      offset += 4;
      bytes.set(nameBytes, offset);
      offset += nameBytes.byteLength;
      view.setUint32(offset, src.data.byteLength, true);
      offset += 4;
      bytes.set(new Uint8Array(src.data), offset);
      offset += src.data.byteLength;
      this.progress.emit(0.7 + (i + 1) / sourceBuffers.length * 0.25);
    }
    this.progress.emit(1);
    return new Blob([buffer], { type: "application/x-daw-engine-archive" });
  }
  /**
   * Extract an archive into session data and audio blobs.
   *
   * @param archiveBlob The archive Blob to extract.
   * @returns The extracted session data, sources, and metadata.
   * @throws Error if the archive format is invalid.
   */
  async extractArchive(archiveBlob) {
    this.progress.emit(0);
    const arrayBuffer = await archiveBlob.arrayBuffer();
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder();
    let offset = 0;
    if (bytes[0] !== ARCHIVE_MAGIC[0] || bytes[1] !== ARCHIVE_MAGIC[1] || bytes[2] !== ARCHIVE_MAGIC[2] || bytes[3] !== ARCHIVE_MAGIC[3]) {
      throw new Error("Invalid archive: missing DAWE magic bytes");
    }
    offset += 4;
    const formatVersion = view.getUint32(offset, true);
    if (formatVersion !== ARCHIVE_FORMAT_VERSION) {
      throw new Error(`Unsupported archive format version: ${formatVersion}`);
    }
    offset += 4;
    this.progress.emit(0.1);
    const metadataLength = view.getUint32(offset, true);
    offset += 4;
    const metadataJson = decoder.decode(
      bytes.slice(offset, offset + metadataLength)
    );
    const metadata = JSON.parse(metadataJson);
    offset += metadataLength;
    this.progress.emit(0.2);
    const sessionLength = view.getUint32(offset, true);
    offset += 4;
    const sessionData = decoder.decode(
      bytes.slice(offset, offset + sessionLength)
    );
    offset += sessionLength;
    this.progress.emit(0.4);
    const sourceCount = view.getUint32(offset, true);
    offset += 4;
    const sources = [];
    for (let i = 0; i < sourceCount; i++) {
      const nameLength = view.getUint32(offset, true);
      offset += 4;
      const name = decoder.decode(bytes.slice(offset, offset + nameLength));
      offset += nameLength;
      const blobSize = view.getUint32(offset, true);
      offset += 4;
      const blobData = bytes.slice(offset, offset + blobSize);
      offset += blobSize;
      sources.push({
        name,
        blob: new Blob([blobData])
      });
      this.progress.emit(0.4 + (i + 1) / sourceCount * 0.55);
    }
    this.progress.emit(1);
    return { sessionData, sources, metadata };
  }
  /**
   * Get archive info without fully extracting all sources.
   * Only reads the header and metadata section.
   *
   * @param archiveBlob The archive Blob to inspect.
   * @returns The archive metadata.
   * @throws Error if the archive format is invalid.
   */
  async getArchiveInfo(archiveBlob) {
    const headerSize = Math.min(archiveBlob.size, 64 * 1024);
    const headerSlice = archiveBlob.slice(0, headerSize);
    const arrayBuffer = await headerSlice.arrayBuffer();
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder();
    let offset = 0;
    if (bytes[0] !== ARCHIVE_MAGIC[0] || bytes[1] !== ARCHIVE_MAGIC[1] || bytes[2] !== ARCHIVE_MAGIC[2] || bytes[3] !== ARCHIVE_MAGIC[3]) {
      throw new Error("Invalid archive: missing DAWE magic bytes");
    }
    offset += 4;
    const formatVersion = view.getUint32(offset, true);
    if (formatVersion !== ARCHIVE_FORMAT_VERSION) {
      throw new Error(`Unsupported archive format version: ${formatVersion}`);
    }
    offset += 4;
    const metadataLength = view.getUint32(offset, true);
    offset += 4;
    if (offset + metadataLength > arrayBuffer.byteLength) {
      throw new Error("Archive header is truncated; cannot read metadata");
    }
    const metadataJson = decoder.decode(
      bytes.slice(offset, offset + metadataLength)
    );
    return JSON.parse(metadataJson);
  }
};
export {
  ActionRegistry,
  AudioAnalyzer,
  AudioEngine,
  AudioLoadError,
  Auditioner,
  AuditionerState,
  AutoSave,
  AutomationCurve,
  AutomationList,
  AutomationMode,
  AutomationPointNotFoundError,
  BWFMetadata,
  CDMarker,
  CDMarkerExporter,
  ClockMode,
  CommandExecutionError,
  CommandExecutor,
  CommandHistory,
  CommandType,
  CrossfadeEngine,
  DAWError,
  DisposableGroup,
  EditMode,
  ExportConfig,
  ExportConfigurationError,
  ExportError,
  ExportGraphBuilder,
  ExportPresetManager,
  ExportStatus,
  FadeShape,
  FollowAction,
  GainProcessor,
  GridSettings,
  GridType,
  IO,
  IOConnectionError,
  IONotFoundError,
  InternalReturn,
  InternalSend,
  InvalidCommandError,
  InvalidRangeError,
  KeyBindings,
  LatencyCompensator,
  LaunchQuantize,
  Marker,
  MeterProcessor,
  MidiNote,
  MidiRegion,
  MixerScene,
  MonitorMode,
  MotionState,
  MouseMode,
  MultiTrackRecorder,
  NoSelectionError,
  OfflineExporter,
  OverlapType,
  PanLaw,
  PanProcessor,
  Panner,
  PannerType,
  Playlist,
  PluginInsert,
  PluginManager,
  Preferences,
  Processor,
  ProcessorNotFoundError,
  PunchRecordManager,
  Range,
  RangeNotFoundError,
  RecordMode,
  Region,
  RegionClipboard,
  RegionGroup,
  RegionNotFoundError,
  RegionOutOfBoundsError,
  Route,
  RoutingGraph,
  RulerType,
  SendBus,
  SendProcessor,
  Session,
  SessionArchive,
  SessionStorage,
  SessionTemplateManager,
  SidechainConfig,
  SidechainRouter,
  Signal,
  SnapMode,
  Source,
  SourceFlags,
  SourceNotFoundError,
  SpeakerLayout,
  SurroundPanner,
  TICKS_PER_BEAT,
  TempoMap,
  ThawList2 as ThawList,
  TimeDomain,
  Track,
  TrackGroup,
  TrackGroupLinkingService,
  TrackNotFoundError,
  TrackType,
  TransportFSM,
  TriggerBox,
  TriggerState,
  VCATrack,
  ZoomFocus,
  computeFadeGain,
  formatClock
};
