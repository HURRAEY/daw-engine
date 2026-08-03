import { BWF_ORIGINATOR_REFERENCE_PREFIX } from "../config/product-identifiers";

/**
 * BWF (Broadcast Wave Format) metadata handler.
 *
 * BWF extends standard WAV with a 'bext' chunk containing:
 * - Description (256 chars)
 * - Originator (32 chars)
 * - OriginatorReference (32 chars)
 * - OriginationDate (10 chars, YYYY-MM-DD)
 * - OriginationTime (8 chars, HH:MM:SS)
 * - TimeReference (64-bit sample count)
 * - Version (2 bytes)
 * - UMID (64 bytes)
 * - LoudnessValue, LoudnessRange, MaxTruePeakLevel, etc.
 * - CodingHistory (variable length)
 *
 * Specification: EBU Tech 3285 (v2)
 */

export interface BWFData {
  description: string;
  originator: string;
  originatorReference: string;
  originationDate: string; // YYYY-MM-DD
  originationTime: string; // HH:MM:SS
  timeReference: bigint; // 64-bit sample position
  version: number;
  umid: Uint8Array; // 64 bytes, SMPTE 330M
  loudnessValue: number; // in 0.01 LUFS
  loudnessRange: number; // in 0.01 LU
  maxTruePeakLevel: number; // in 0.01 dBTP
  maxMomentaryLoudness: number;
  maxShortTermLoudness: number;
  codingHistory: string;
}

// ---------------------------------------------------------------
// Fixed field sizes within the bext chunk (EBU Tech 3285 v2)
// ---------------------------------------------------------------

/** Total byte size of the fixed-length portion of the bext chunk. */
const BEXT_FIXED_SIZE = 602;

// Field offsets (relative to the start of the bext chunk data, *after* the
// 8-byte chunk header).
const OFF_DESCRIPTION = 0;
const LEN_DESCRIPTION = 256;

const OFF_ORIGINATOR = 256;
const LEN_ORIGINATOR = 32;

const OFF_ORIGINATOR_REF = 288;
const LEN_ORIGINATOR_REF = 32;

const OFF_ORIGINATION_DATE = 320;
const LEN_ORIGINATION_DATE = 10;

const OFF_ORIGINATION_TIME = 330;
const LEN_ORIGINATION_TIME = 8;

const OFF_TIME_REF_LOW = 338;
const OFF_TIME_REF_HIGH = 342;

const OFF_VERSION = 346;

const OFF_UMID = 348;
const LEN_UMID = 64;

const OFF_LOUDNESS_VALUE = 412;
const OFF_LOUDNESS_RANGE = 414;
const OFF_MAX_TRUE_PEAK = 416;
const OFF_MAX_MOMENTARY = 418;
const OFF_MAX_SHORT_TERM = 420;

// 180 bytes reserved (offsets 422 .. 601)
const OFF_RESERVED = 422;
const LEN_RESERVED = 180;

// CodingHistory begins at offset 602 and extends to the end of the chunk.
const OFF_CODING_HISTORY = 602;

export class BWFMetadata {
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
  static parse(wavData: ArrayBuffer): BWFData | null {
    const view = new DataView(wavData);

    const bext = BWFMetadata.findChunk(view, "bext");
    if (!bext) {
      return null;
    }

    const base = bext.offset; // first byte of chunk *data*

    const description = BWFMetadata.readFixedString(
      view,
      base + OFF_DESCRIPTION,
      LEN_DESCRIPTION,
    );
    const originator = BWFMetadata.readFixedString(
      view,
      base + OFF_ORIGINATOR,
      LEN_ORIGINATOR,
    );
    const originatorReference = BWFMetadata.readFixedString(
      view,
      base + OFF_ORIGINATOR_REF,
      LEN_ORIGINATOR_REF,
    );
    const originationDate = BWFMetadata.readFixedString(
      view,
      base + OFF_ORIGINATION_DATE,
      LEN_ORIGINATION_DATE,
    );
    const originationTime = BWFMetadata.readFixedString(
      view,
      base + OFF_ORIGINATION_TIME,
      LEN_ORIGINATION_TIME,
    );

    const timeRefLow = view.getUint32(base + OFF_TIME_REF_LOW, true);
    const timeRefHigh = view.getUint32(base + OFF_TIME_REF_HIGH, true);
    const timeReference =
      (BigInt(timeRefHigh) << BigInt(32)) | BigInt(timeRefLow);

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
      codingHistory = BWFMetadata.readFixedString(
        view,
        base + OFF_CODING_HISTORY,
        codingLen,
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
      umid: new Uint8Array(umid), // defensive copy
      loudnessValue,
      loudnessRange,
      maxTruePeakLevel,
      maxMomentaryLoudness,
      maxShortTermLoudness,
      codingHistory,
    };
  }

  // ---------------------------------------------------------------
  // Create bext chunk
  // ---------------------------------------------------------------

  /**
   * Serialise {@link BWFData} into a standalone bext chunk (including
   * the 8-byte chunk header: 'bext' + uint32 size).
   */
  static createBextChunk(data: BWFData): ArrayBuffer {
    const codingBytes = BWFMetadata.encodeString(data.codingHistory);
    const dataSize = BEXT_FIXED_SIZE + codingBytes.byteLength;

    // Total chunk = 8-byte header + dataSize (padded to even length per RIFF spec)
    const paddedDataSize = dataSize + (dataSize % 2);
    const chunkBuffer = new ArrayBuffer(8 + paddedDataSize);
    const view = new DataView(chunkBuffer);

    // Chunk header
    BWFMetadata.writeChunkId(view, 0, "bext");
    view.setUint32(4, dataSize, true);

    const base = 8; // start of chunk data

    BWFMetadata.writeFixedString(
      view,
      base + OFF_DESCRIPTION,
      data.description,
      LEN_DESCRIPTION,
    );
    BWFMetadata.writeFixedString(
      view,
      base + OFF_ORIGINATOR,
      data.originator,
      LEN_ORIGINATOR,
    );
    BWFMetadata.writeFixedString(
      view,
      base + OFF_ORIGINATOR_REF,
      data.originatorReference,
      LEN_ORIGINATOR_REF,
    );
    BWFMetadata.writeFixedString(
      view,
      base + OFF_ORIGINATION_DATE,
      data.originationDate,
      LEN_ORIGINATION_DATE,
    );
    BWFMetadata.writeFixedString(
      view,
      base + OFF_ORIGINATION_TIME,
      data.originationTime,
      LEN_ORIGINATION_TIME,
    );

    // TimeReference as two uint32 values (little-endian)
    const mask32 = BigInt("0xFFFFFFFF");
    const low = Number(data.timeReference & mask32);
    const high = Number((data.timeReference >> BigInt(32)) & mask32);
    view.setUint32(base + OFF_TIME_REF_LOW, low, true);
    view.setUint32(base + OFF_TIME_REF_HIGH, high, true);

    view.setUint16(base + OFF_VERSION, data.version, true);

    // UMID
    const umidDst = new Uint8Array(chunkBuffer, base + OFF_UMID, LEN_UMID);
    const umidLen = Math.min(data.umid.byteLength, LEN_UMID);
    umidDst.set(data.umid.subarray(0, umidLen));

    // Loudness fields
    view.setInt16(base + OFF_LOUDNESS_VALUE, data.loudnessValue, true);
    view.setInt16(base + OFF_LOUDNESS_RANGE, data.loudnessRange, true);
    view.setInt16(base + OFF_MAX_TRUE_PEAK, data.maxTruePeakLevel, true);
    view.setInt16(base + OFF_MAX_MOMENTARY, data.maxMomentaryLoudness, true);
    view.setInt16(base + OFF_MAX_SHORT_TERM, data.maxShortTermLoudness, true);

    // Reserved (zero-filled by ArrayBuffer default)

    // CodingHistory
    const codingDst = new Uint8Array(
      chunkBuffer,
      base + OFF_CODING_HISTORY,
      codingBytes.byteLength,
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
  static injectBWF(wavData: ArrayBuffer, bwfData: BWFData): ArrayBuffer {
    const srcView = new DataView(wavData);

    // Validate RIFF header
    if (BWFMetadata.readChunkId(srcView, 0) !== "RIFF") {
      throw new Error("Not a valid RIFF file");
    }
    if (BWFMetadata.readChunkId(srcView, 8) !== "WAVE") {
      throw new Error("Not a valid WAVE file");
    }

    const bextChunk = BWFMetadata.createBextChunk(bwfData);

    // Check for existing bext chunk
    const existing = BWFMetadata.findChunkRaw(srcView, "bext");

    if (existing) {
      // Replace existing bext chunk
      const existingChunkTotal = 8 + existing.size + (existing.size % 2);
      const beforeLen = existing.headerOffset;
      const afterStart = existing.headerOffset + existingChunkTotal;
      const afterLen = wavData.byteLength - afterStart;

      const newSize = beforeLen + bextChunk.byteLength + afterLen;
      const result = new ArrayBuffer(newSize);
      const dst = new Uint8Array(result);

      // Copy everything before the old bext chunk
      dst.set(new Uint8Array(wavData, 0, beforeLen), 0);

      // Insert the new bext chunk
      dst.set(new Uint8Array(bextChunk), beforeLen);

      // Copy everything after the old bext chunk
      dst.set(
        new Uint8Array(wavData, afterStart, afterLen),
        beforeLen + bextChunk.byteLength,
      );

      // Update RIFF size field
      const resultView = new DataView(result);
      resultView.setUint32(4, newSize - 8, true);

      return result;
    } else {
      // Insert bext chunk right after the WAVE identifier (offset 12)
      const insertOffset = 12;
      const newSize = wavData.byteLength + bextChunk.byteLength;
      const result = new ArrayBuffer(newSize);
      const dst = new Uint8Array(result);

      // Copy RIFF header + WAVE id
      dst.set(new Uint8Array(wavData, 0, insertOffset), 0);

      // Insert bext chunk
      dst.set(new Uint8Array(bextChunk), insertOffset);

      // Copy remaining chunks
      dst.set(
        new Uint8Array(
          wavData,
          insertOffset,
          wavData.byteLength - insertOffset,
        ),
        insertOffset + bextChunk.byteLength,
      );

      // Update RIFF size field
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
  static createDefault(options?: {
    description?: string;
    originator?: string;
    timeReference?: bigint;
    sampleRate?: number;
  }): BWFData {
    const now = new Date();
    const pad2 = (n: number) => n.toString().padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    const sr = options?.sampleRate ?? 48000;
    const codingHistory = `A=PCM,F=${sr},W=24,M=stereo,T=daw-engine\r\n`;

    return {
      description: options?.description ?? "",
      originator: options?.originator ?? "daw-engine",
      originatorReference: BWFMetadata.generateOriginatorReference(),
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
      codingHistory,
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
  static validate(data: BWFData): string[] {
    const errors: string[] = [];

    if (data.description.length > LEN_DESCRIPTION) {
      errors.push(
        `Description exceeds ${LEN_DESCRIPTION} characters (got ${data.description.length})`,
      );
    }
    if (data.originator.length > LEN_ORIGINATOR) {
      errors.push(
        `Originator exceeds ${LEN_ORIGINATOR} characters (got ${data.originator.length})`,
      );
    }
    if (data.originatorReference.length > LEN_ORIGINATOR_REF) {
      errors.push(
        `OriginatorReference exceeds ${LEN_ORIGINATOR_REF} characters (got ${data.originatorReference.length})`,
      );
    }

    // Date format: YYYY-MM-DD (or YYYY:MM:DD per older BWF specs)
    if (
      data.originationDate.length > 0 &&
      !/^\d{4}[-:]\d{2}[-:]\d{2}$/.test(data.originationDate)
    ) {
      errors.push(
        `OriginationDate must be in YYYY-MM-DD format (got "${data.originationDate}")`,
      );
    }

    // Time format: HH:MM:SS (or HH.MM.SS)
    if (
      data.originationTime.length > 0 &&
      !/^\d{2}[:.]\d{2}[:.]\d{2}$/.test(data.originationTime)
    ) {
      errors.push(
        `OriginationTime must be in HH:MM:SS format (got "${data.originationTime}")`,
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
        `UMID must be exactly 64 bytes (got ${data.umid.byteLength})`,
      );
    }

    // Loudness fields are only meaningful for version >= 2
    if (data.version < 2) {
      if (
        data.loudnessValue !== 0 ||
        data.loudnessRange !== 0 ||
        data.maxTruePeakLevel !== 0 ||
        data.maxMomentaryLoudness !== 0 ||
        data.maxShortTermLoudness !== 0
      ) {
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
  private static readFixedString(
    view: DataView,
    offset: number,
    length: number,
  ): string {
    const bytes: number[] = [];
    for (let i = 0; i < length; i++) {
      const b = view.getUint8(offset + i);
      if (b === 0) break; // stop at first NUL
      bytes.push(b);
    }
    return String.fromCharCode(...bytes);
  }

  /**
   * Write a string into a fixed-length field, padding with NUL bytes.
   */
  private static writeFixedString(
    view: DataView,
    offset: number,
    str: string,
    length: number,
  ): void {
    const toWrite = Math.min(str.length, length);
    for (let i = 0; i < toWrite; i++) {
      view.setUint8(offset + i, str.charCodeAt(i) & 0xff);
    }
    // Remaining bytes are already zero (ArrayBuffer is zero-initialised)
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
  private static findChunk(
    view: DataView,
    chunkId: string,
  ): { offset: number; size: number } | null {
    const raw = BWFMetadata.findChunkRaw(view, chunkId);
    if (!raw) return null;
    return { offset: raw.headerOffset + 8, size: raw.size };
  }

  /**
   * Internal chunk finder that also returns the header offset (for
   * replacement scenarios in {@link injectBWF}).
   */
  private static findChunkRaw(
    view: DataView,
    chunkId: string,
  ): { headerOffset: number; size: number } | null {
    // Validate RIFF header
    if (view.byteLength < 12) return null;
    if (BWFMetadata.readChunkId(view, 0) !== "RIFF") return null;
    if (BWFMetadata.readChunkId(view, 8) !== "WAVE") return null;

    let pos = 12; // first sub-chunk

    while (pos + 8 <= view.byteLength) {
      const id = BWFMetadata.readChunkId(view, pos);
      const size = view.getUint32(pos + 4, true);

      if (id === chunkId) {
        return { headerOffset: pos, size };
      }

      // Advance to next chunk (size rounded up to even per RIFF spec)
      pos += 8 + size + (size % 2);
    }

    return null;
  }

  /**
   * Read a four-character chunk ID from a DataView.
   */
  private static readChunkId(view: DataView, offset: number): string {
    return String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
  }

  /**
   * Write a four-character chunk ID into a DataView.
   */
  private static writeChunkId(
    view: DataView,
    offset: number,
    id: string,
  ): void {
    for (let i = 0; i < 4; i++) {
      view.setUint8(offset + i, id.charCodeAt(i));
    }
  }

  /**
   * Encode a string to a Uint8Array using ASCII (Latin-1 subset).
   */
  private static encodeString(str: string): Uint8Array {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i) & 0xff;
    }
    return arr;
  }

  /**
   * Generate a unique originator reference string.
   *
   * EBU R99-1999 recommends a format based on country code, org code,
   * and a serial number. We use a simplified random approach.
   */
  private static generateOriginatorReference(): string {
    const now = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 10);
    return `${BWF_ORIGINATOR_REFERENCE_PREFIX}${now}${rand}`.substring(0, 32);
  }
}
