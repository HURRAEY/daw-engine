import { RegionDTO } from "../dto";
import { FrameCount } from "../../domain/types";

/** Fade curve shape */
export const enum FadeCurve {
  Linear = 0,
  EqualPower = 1,
  Exponential = 2,
}

export class PlaylistEngine {
  /**
   * Renders a block of audio for a given set of regions.
   * Higher Layer부터 처리합니다. 불투명 Region은 아래 Layer를 가리고,
   * 투명 Region은 아래 Layer의 오디오와 합산됩니다.
   */
  public render(
    outputLeft: Float32Array,
    outputRight: Float32Array,
    startFrame: FrameCount,
    numFrames: FrameCount,
    regions: RegionDTO[],
    getBuffer: (url: string) => AudioBuffer | null,
  ): void {
    const outputsShareSampleRange = this.validateOutputSampleRanges(
      outputLeft,
      outputRight,
    );

    // 1. Find active regions in this block
    const endFrame = startFrame + numFrames;
    const activeRegions = regions.filter(
      (r) => r.start < endFrame && r.end > startFrame && !r.muted,
    );

    // 2. Sort by layer descending (highest layer renders first, takes priority)
    activeRegions.sort((a, b) => b.layer - a.layer);

    // 3. Clear output
    outputLeft.fill(0);
    outputRight.fill(0);

    // 4. Coverage mask: tracks which sample positions are already filled
    //    by a higher-layer region. Lower layers only write to uncovered positions.
    const covered = new Uint8Array(numFrames);

    // 5. Render each layer. Regions on the same layer share only the
    //    coverage inherited from higher layers, so they can overlap.
    for (let index = 0; index < activeRegions.length; ) {
      const layer = activeRegions[index].layer;
      const layerCoverage = new Uint8Array(numFrames);
      while (
        index < activeRegions.length &&
        activeRegions[index].layer === layer
      ) {
        this.renderRegion(
          outputLeft,
          outputRight,
          startFrame,
          numFrames,
          activeRegions[index],
          getBuffer,
          covered,
          layerCoverage,
          outputsShareSampleRange,
        );
        index++;
      }
      for (let frame = 0; frame < numFrames; frame++) {
        covered[frame] ||= layerCoverage[frame];
      }
    }
  }

  private renderRegion(
    outL: Float32Array,
    outR: Float32Array,
    startFrame: number,
    numFrames: number,
    region: RegionDTO,
    getBuffer: (url: string) => AudioBuffer | null,
    covered: Uint8Array,
    layerCoverage: Uint8Array,
    outputsShareSampleRange: boolean,
  ) {
    const buffer = getBuffer(region.sourceId);
    if (!buffer) return;

    const bufferDataL = buffer.getChannelData(0);
    const bufferDataR =
      buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : bufferDataL;

    const renderStart = Math.max(startFrame, region.start);
    const renderEnd = Math.min(startFrame + numFrames, region.end);

    const playbackRate = region.playbackRate;
    if (!Number.isFinite(playbackRate) || playbackRate <= 0) return;
    const regionOffset =
      region.sourceStart + (renderStart - region.start) * playbackRate;
    const outOffset = renderStart - startFrame;
    const length = renderEnd - renderStart;

    // When playbackRate != 1, the source consumes samples faster/slower.
    // Clamp the render length so we never read past the source buffer.
    const maxSourceFrames = bufferDataL.length - 1 - regionOffset;
    const maxOutputFrames =
      maxSourceFrames >= 0 ? Math.floor(maxSourceFrames / playbackRate) + 1 : 0;
    const clampedLength = Math.min(length, maxOutputFrames);
    for (let i = 0; i < clampedLength; i++) {
      const outIdx = outOffset + i;

      // Skip positions already covered by a higher-layer region
      if (covered[outIdx]) continue;

      // With playbackRate, we need to resample
      const sourcePosition = regionOffset + i * playbackRate;
      const sampleIdx = Math.floor(sourcePosition);
      const frac = sourcePosition - sampleIdx;

      if (sampleIdx < 0 || sampleIdx >= bufferDataL.length) break;

      // Linear interpolation for resampling
      const sampleL0 = bufferDataL[sampleIdx];
      const sampleR0 = bufferDataR[sampleIdx];

      // Guard: if at last sample, skip interpolation
      const canInterpolate = sampleIdx + 1 < bufferDataL.length;
      const interpolatedL = canInterpolate
        ? sampleL0 + (bufferDataL[sampleIdx + 1] - sampleL0) * frac
        : sampleL0;
      const interpolatedR = canInterpolate
        ? sampleR0 + (bufferDataR[sampleIdx + 1] - sampleR0) * frac
        : sampleR0;

      // Apply fade envelope
      const currentPos = renderStart + i - region.start;
      let fadeGain = 1.0;

      if (region.fadeIn > 0 && currentPos < region.fadeIn) {
        const t = currentPos / region.fadeIn;
        fadeGain = Math.sqrt(t);
      } else if (
        region.fadeOut > 0 &&
        currentPos >= region.length - region.fadeOut
      ) {
        const distFromEnd = region.length - currentPos;
        const t = Math.max(0, distFromEnd / region.fadeOut);
        fadeGain = Math.sqrt(t);
      }

      const gain = region.gain * fadeGain;

      if (outputsShareSampleRange) {
        const monoSample =
          buffer.numberOfChannels > 1
            ? (interpolatedL + interpolatedR) / 2
            : interpolatedL;
        outL[outIdx] += monoSample * gain;
      } else {
        outL[outIdx] += interpolatedL * gain;
        outR[outIdx] += interpolatedR * gain;
      }

      if (region.opaque !== false) {
        layerCoverage[outIdx] = 1;
      }
    }
  }

  private validateOutputSampleRanges(
    outputLeft: Float32Array,
    outputRight: Float32Array,
  ): boolean {
    if (outputLeft.buffer !== outputRight.buffer) return false;

    const rangesMatch =
      outputLeft.byteOffset === outputRight.byteOffset &&
      outputLeft.byteLength === outputRight.byteLength;
    if (rangesMatch) return true;

    const leftEnd = outputLeft.byteOffset + outputLeft.byteLength;
    const rightEnd = outputRight.byteOffset + outputRight.byteLength;
    const rangesOverlap =
      outputLeft.byteOffset < rightEnd && outputRight.byteOffset < leftEnd;
    if (rangesOverlap) {
      throw new RangeError("Output channel sample ranges must not overlap");
    }

    return false;
  }
}
