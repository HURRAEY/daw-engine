import { CDMarker } from "../../domain/CDMarker";

/**
 * CD Marker Exporter
 *
 * Generates industry-standard marker/chapter files from CDMarker data.
 * Supports CUE sheets, cdrdao TOC files, and Nero-style MP4 chapter files.
 */
export class CDMarkerExporter {
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
  static generateCUE(
    markers: CDMarker[],
    filename: string,
    sampleRate: number,
    albumTitle: string = "Untitled",
    albumPerformer: string = "",
  ): string {
    const sorted = [...markers].sort((a, b) => a.index - b.index);
    const lines: string[] = [];

    // Global header
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

      const cdTime = CDMarkerExporter.framesToCDTime(
        marker.position,
        sampleRate,
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
  static generateTOC(
    markers: CDMarker[],
    filename: string,
    sampleRate: number,
  ): string {
    const sorted = [...markers].sort((a, b) => a.index - b.index);
    const lines: string[] = [];

    lines.push("CD_DA");
    lines.push("");
    lines.push("");

    for (let i = 0; i < sorted.length; i++) {
      const marker = sorted[i];

      lines.push(`// Track ${marker.index}`);
      lines.push("TRACK AUDIO");

      // CD-TEXT block
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

      // ISRC
      if (marker.isrc) {
        lines.push(`ISRC "${marker.isrc}"`);
      }

      // Pregap for first track (standard 2-second pregap)
      if (i === 0 && marker.position === 0) {
        lines.push("PREGAP 00:02:00");
      }

      // File reference with start time
      const cdTime = CDMarkerExporter.framesToCDTime(
        marker.position,
        sampleRate,
      );

      // Calculate length if next marker exists
      if (i + 1 < sorted.length) {
        const nextMarker = sorted[i + 1];
        const lengthFrames = nextMarker.position - marker.position;
        const lengthCdTime = CDMarkerExporter.framesToCDTime(
          lengthFrames,
          sampleRate,
        );
        lines.push(`FILE "${filename}" ${cdTime} ${lengthCdTime}`);
      } else {
        // Last track: let cdrdao figure out the remaining length
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
  static generateMP4Chapters(markers: CDMarker[], sampleRate: number): string {
    const sorted = [...markers].sort((a, b) => a.index - b.index);
    const lines: string[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const marker = sorted[i];
      const chapterNum = String(i + 1).padStart(2, "0");
      const timestamp = CDMarkerExporter.framesToTimestamp(
        marker.position,
        sampleRate,
      );

      lines.push(`CHAPTER${chapterNum}=${timestamp}`);
      lines.push(
        `CHAPTER${chapterNum}NAME=${marker.title || `Chapter ${i + 1}`}`,
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
  static framesToCDTime(frames: number, sampleRate: number): string {
    const totalSeconds = frames / sampleRate;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const cdFrames = Math.floor((totalSeconds % 1) * 75);

    return (
      String(minutes).padStart(2, "0") +
      ":" +
      String(seconds).padStart(2, "0") +
      ":" +
      String(cdFrames).padStart(2, "0")
    );
  }

  /**
   * Convert a sample-frame position to HH:MM:SS.mmm timestamp.
   *
   * @param frames      Position in audio sample frames
   * @param sampleRate  Audio sample rate
   * @returns           Time string in HH:MM:SS.mmm format
   */
  static framesToTimestamp(frames: number, sampleRate: number): string {
    const totalSeconds = frames / sampleRate;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const millis = Math.floor((totalSeconds % 1) * 1000);

    return (
      String(hours).padStart(2, "0") +
      ":" +
      String(minutes).padStart(2, "0") +
      ":" +
      String(seconds).padStart(2, "0") +
      "." +
      String(millis).padStart(3, "0")
    );
  }
}
