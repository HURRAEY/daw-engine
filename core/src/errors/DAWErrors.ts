/**
 * DAW Custom Error Classes
 *
 * 명확한 에러 처리를 위한 Custom Error 클래스들
 */

/**
 * 기본 DAW 에러
 */
export class DAWError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DAWError";
    Object.setPrototypeOf(this, DAWError.prototype);
  }
}

/**
 * Track 관련 에러
 */
export class TrackNotFoundError extends DAWError {
  constructor(public readonly trackId: string) {
    super(`Track not found: ${trackId}`);
    this.name = "TrackNotFoundError";
  }
}

/**
 * Region 관련 에러
 */
export class RegionNotFoundError extends DAWError {
  constructor(public readonly regionId: string) {
    super(`Region not found: ${regionId}`);
    this.name = "RegionNotFoundError";
  }
}

export class RegionOutOfBoundsError extends DAWError {
  constructor(
    public readonly regionId: string,
    public readonly position: number,
    public readonly start: number,
    public readonly end: number,
  ) {
    super(
      `Region ${regionId}: position ${position} is outside bounds (${start}-${end})`,
    );
    this.name = "RegionOutOfBoundsError";
  }
}

/**
 * Range 관련 에러
 */
export class RangeNotFoundError extends DAWError {
  constructor(public readonly rangeId: string) {
    super(`Range not found: ${rangeId}`);
    this.name = "RangeNotFoundError";
  }
}

export class InvalidRangeError extends DAWError {
  constructor(
    public readonly start: number,
    public readonly end: number,
  ) {
    super(`Invalid range: start (${start}) must be less than end (${end})`);
    this.name = "InvalidRangeError";
  }
}

/**
 * Source 관련 에러
 */
export class SourceNotFoundError extends DAWError {
  constructor(public readonly sourceId: string) {
    super(`Source not found: ${sourceId}`);
    this.name = "SourceNotFoundError";
  }
}

export class AudioLoadError extends DAWError {
  constructor(
    public readonly url: string,
    public readonly reason: string,
  ) {
    super(`Failed to load audio from ${url}: ${reason}`);
    this.name = "AudioLoadError";
  }
}

/**
 * IO 관련 에러
 */
export class IONotFoundError extends DAWError {
  constructor(public readonly ioId: string) {
    super(`IO not found: ${ioId}`);
    this.name = "IONotFoundError";
  }
}

export class IOConnectionError extends DAWError {
  constructor(
    public readonly sourceId: string,
    public readonly destId: string,
    public readonly reason: string,
  ) {
    super(`Failed to connect ${sourceId} to ${destId}: ${reason}`);
    this.name = "IOConnectionError";
  }
}

/**
 * Command 관련 에러
 */
export class InvalidCommandError extends DAWError {
  constructor(message: string) {
    super(`Invalid command: ${message}`);
    this.name = "InvalidCommandError";
  }
}

export class CommandExecutionError extends DAWError {
  constructor(
    public readonly commandType: string,
    public readonly reason: string,
  ) {
    super(`Failed to execute ${commandType}: ${reason}`);
    this.name = "CommandExecutionError";
  }
}

/**
 * Export 관련 에러
 */
export class ExportError extends DAWError {
  constructor(message: string) {
    super(`Export failed: ${message}`);
    this.name = "ExportError";
  }
}

export class ExportConfigurationError extends DAWError {
  constructor(message: string) {
    super(`Invalid export configuration: ${message}`);
    this.name = "ExportConfigurationError";
  }
}

/**
 * Selection 관련 에러
 */
export class NoSelectionError extends DAWError {
  constructor() {
    super("No region selected. Select a region first.");
    this.name = "NoSelectionError";
  }
}

/**
 * Automation 관련 에러
 */
export class AutomationPointNotFoundError extends DAWError {
  constructor(public readonly pointId: string) {
    super(`Automation point not found: ${pointId}`);
    this.name = "AutomationPointNotFoundError";
  }
}

export class ProcessorNotFoundError extends DAWError {
  constructor(public readonly processorId: string) {
    super(`Processor not found: ${processorId}`);
    this.name = "ProcessorNotFoundError";
  }
}

export class DuplicateProcessorIdError extends DAWError {
  constructor(
    public readonly routeId: string,
    public readonly processorId: string,
  ) {
    super(`Processor ID already exists in route ${routeId}: ${processorId}`);
    this.name = "DuplicateProcessorIdError";
    Object.setPrototypeOf(this, DuplicateProcessorIdError.prototype);
  }
}
