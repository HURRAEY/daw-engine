import {
  CommandHandler,
  CommandHandlerPayload,
  CommandResult,
  requireString,
  requireNumber,
  requireBoolean,
  requireStringArray,
  optionalString,
  optionalNumber,
  optionalBoolean,
} from "./CommandHandler";
import { AudioEngine } from "../../audio/AudioEngine";
import { CommandHistory } from "../CommandHistory";
import { CommandType } from "../types";
import { Source } from "../../domain/Source";
import type { VideoMetadata } from "../../domain/VideoMetadata";
import { AddSourceCommand } from "../impl/AddSourceCommand";
import { AddRegionCommand } from "../impl/AddRegionCommand";
import { RemoveRegionCommand } from "../impl/RemoveRegionCommand";
import { moveRegionAndCreateTransaction } from "../history/moveRegionAndCreateTransaction";
import { ResizeRegionCommand } from "../impl/ResizeRegionCommand";
import { CopyRegionCommand } from "../impl/CopyRegionCommand";
import { PasteRegionCommand } from "../impl/PasteRegionCommand";
import { DuplicateRegionCommand } from "../impl/DuplicateRegionCommand";
import { SplitRegionCommand } from "../impl/SplitRegionCommand";
import { SplitAtPlayheadCommand } from "../impl/SplitAtPlayheadCommand";
import { SetRegionTimeDomainCommand } from "../impl/SetRegionTimeDomainCommand";
import { TrimRegionCommand } from "../impl/TrimRegionCommand";
import { TrimRegionToPlayheadCommand } from "../impl/TrimRegionToPlayheadCommand";
import { TrimRegionToRangeCommand } from "../impl/TrimRegionToRangeCommand";
import { TrimToAdjacentRegionCommand } from "../impl/TrimToAdjacentRegionCommand";
import { SetRegionFadesCommand } from "../impl/SetRegionFadesCommand";
import { MergeRegionsCommand } from "../impl/MergeRegionsCommand";
import { LockRegionCommand } from "../impl/LockRegionCommand";
import { GroupRegionsCommand } from "../impl/GroupRegionsCommand";
import { UngroupRegionsCommand } from "../impl/UngroupRegionsCommand";
import { StripSilenceCommand } from "../impl/StripSilenceCommand";
import { NormalizeRegionCommand } from "../impl/NormalizeRegionCommand";
import { SetRegionPlaybackRateCommand } from "../impl/SetRegionPlaybackRateCommand";
import { TimeStretchRegionCommand } from "../impl/TimeStretchRegionCommand";
import { ReverseRegionCommand } from "../impl/ReverseRegionCommand";
import { BatchMoveRegionsCommand } from "../impl/BatchMoveRegionsCommand";
import { BatchTrimRegionsCommand } from "../impl/BatchTrimRegionsCommand";
import { BatchRemoveRegionsCommand } from "../impl/BatchRemoveRegionsCommand";
import { BatchSetRegionFadesCommand } from "../impl/BatchSetRegionFadesCommand";
import { SetRegionLayerCommand } from "../impl/SetRegionLayerCommand";
import { SetRegionOpaqueCommand } from "../impl/SetRegionOpaqueCommand";

/**
 * Region Command Handler
 *
 * Region 추가/제거/이동/크기 조절/편집 등 처리
 */
export class RegionHandler implements CommandHandler {
  private readonly supportedCommands = new Set<string>([
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
    CommandType.SET_REGION_LAYER,
    CommandType.SET_REGION_OPAQUE,
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
    CommandType.REVERSE_REGION,
  ]);

  canHandle(commandType: string): boolean {
    return this.supportedCommands.has(commandType);
  }

  async execute(
    commandType: string,
    payload: CommandHandlerPayload | undefined,
    audioEngine: AudioEngine,
    history: CommandHistory,
  ): Promise<CommandResult> {
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
          undefined, // sampleRate - use default
          undefined, // channelCount - use default
          payload.videoMetadata as VideoMetadata | undefined, // Pass video metadata if present
        );

        const cmd = new AddSourceCommand(audioEngine.session, source);
        await history.execute(cmd);

        // Optional: Add to track if trackId is provided
        const trackId = optionalString(payload, "trackId");
        if (trackId) {
          const addRegionCmd = new AddRegionCommand(
            audioEngine.session,
            trackId,
            source.id,
            optionalNumber(payload, "start") ?? 0,
            source.duration,
            0,
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
          0,
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
          const cmd = new BatchRemoveRegionsCommand(session, entries);
          await history.execute(cmd);
          return {
            success: true,
            message: `${entries.length} regions removed`,
          };
        }

        const cmd = new RemoveRegionCommand(
          session,
          requireString(payload, "trackId"),
          primaryRegionId,
        );
        await history.execute(cmd);
        return { success: true, message: "Region removed" };
      }

      case CommandType.MOVE_REGION: {
        const session = audioEngine.session;
        const primaryRegionId = requireString(payload, "regionId");
        const newStart = requireNumber(payload, "newStart");
        const selected = session.getSelectedRegionIds();

        // Batch: if primary region is part of a multi-region selection, move all
        if (selected.size > 1 && selected.has(primaryRegionId)) {
          const primaryTrack = session.findTrackForRegion(primaryRegionId);
          const primaryRegion =
            primaryTrack?.playlist.getRegion(primaryRegionId);
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
                  newStart: r.start + delta,
                });
              }
            }
            const cmd = new BatchMoveRegionsCommand(session, entries);
            await history.execute(cmd);
            return {
              success: true,
              message: `${entries.length} regions moved`,
            };
          }
        }

        const transaction = moveRegionAndCreateTransaction({
          session,
          trackId: requireString(payload, "trackId"),
          regionId: primaryRegionId,
          newStart,
          targetTrackId: optionalString(payload, "targetTrackId"),
        });
        await history.record(transaction, transaction.name);
        return { success: true, message: `Region moved to ${newStart}` };
      }

      case CommandType.RESIZE_REGION: {
        const newLength = requireNumber(payload, "newLength");
        const cmd = new ResizeRegionCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          newLength,
        );
        await history.execute(cmd);
        return { success: true, message: `Region resized to ${newLength}` };
      }

      case CommandType.TRIM_REGION: {
        const session = audioEngine.session;
        const primaryRegionId = requireString(payload, "regionId");
        const selected = session.getSelectedRegionIds();
        const direction = requireString(payload, "direction") as
          "front" | "back";
        const amount = requireNumber(payload, "amount");

        if (selected.size > 1 && selected.has(primaryRegionId)) {
          const entries = [];
          for (const rid of selected) {
            const t = session.findTrackForRegion(rid);
            if (t)
              entries.push({ trackId: t.id, regionId: rid, amount, direction });
          }
          const cmd = new BatchTrimRegionsCommand(session, entries);
          await history.execute(cmd);
          return {
            success: true,
            message: `${entries.length} regions trimmed`,
          };
        }

        const cmd = new TrimRegionCommand(
          session,
          requireString(payload, "trackId"),
          primaryRegionId,
          amount,
          direction,
        );
        await history.execute(cmd);
        return { success: true, message: `Region trimmed by ${amount}` };
      }

      case CommandType.TRIM_REGION_TO_PLAYHEAD: {
        const direction = requireString(payload, "direction") as
          "front" | "back";
        const cmd = new TrimRegionToPlayheadCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          direction,
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Region trimmed to playhead (${direction})`,
        };
      }

      case CommandType.TRIM_REGION_TO_RANGE: {
        const cmd = new TrimRegionToRangeCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          requireNumber(payload, "rangeStart"),
          requireNumber(payload, "rangeEnd"),
        );
        await history.execute(cmd);
        return { success: true, message: "Region trimmed to range" };
      }

      case CommandType.TRIM_TO_ADJACENT_REGION: {
        const direction = requireString(payload, "direction") as
          "forward" | "backward";
        const cmd = new TrimToAdjacentRegionCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          direction,
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Region trimmed to adjacent (${direction})`,
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
                fadeOut,
              });
          }
          const cmd = new BatchSetRegionFadesCommand(session, entries);
          await history.execute(cmd);
          return {
            success: true,
            message: `${entries.length} region fades updated`,
          };
        }

        const cmd = new SetRegionFadesCommand(
          session,
          requireString(payload, "trackId"),
          primaryRegionId,
          fadeIn,
          fadeOut,
        );
        await history.execute(cmd);
        return { success: true, message: `Region fades updated` };
      }

      case CommandType.SET_REGION_LAYER: {
        const command = new SetRegionLayerCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          requireNumber(payload, "layer"),
        );
        await history.execute(command);
        return { success: true, message: "Region layer updated" };
      }

      case CommandType.SET_REGION_OPAQUE: {
        const command = new SetRegionOpaqueCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          requireBoolean(payload, "opaque"),
        );
        await history.execute(command);
        return { success: true, message: "Region opacity updated" };
      }

      case CommandType.MERGE_REGIONS: {
        let regionIds = (payload.regionIds as string[] | undefined) ?? [];
        if (regionIds.length === 0) {
          regionIds = Array.from(audioEngine.session.getSelectedRegionIds());
        }

        let trackId = optionalString(payload, "trackId") ?? "";
        if (trackId === "selected" || !trackId) {
          // Try to guess track from first selected region
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
            message: "Need at least 2 regions on the same track to merge",
          };
        }

        const cmd = new MergeRegionsCommand(
          audioEngine.session,
          audioEngine,
          trackId,
          regionIds,
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
          optionalNumber(payload, "position"),
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
          requireNumber(payload, "position"),
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
          data: summary,
        };
      }

      case CommandType.SELECT_REGION: {
        const regionId = requireString(payload, "regionId");
        audioEngine.session.selectRegion(
          regionId,
          optionalBoolean(payload, "addToSelection") ?? false,
        );
        return {
          success: true,
          message: `Region selected: ${regionId}`,
        };
      }

      case CommandType.SELECT_REGIONS: {
        const regionIds = requireStringArray(payload, "regionIds");
        audioEngine.session.selectRegions(
          regionIds,
          optionalBoolean(payload, "addToSelection") ?? false,
        );
        return {
          success: true,
          message: `Selected ${regionIds.length} regions`,
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
          timeDomain,
        );
        await history.execute(cmd);

        return {
          success: true,
          message: `Region time domain set to ${timeDomain === 0 ? "Audio" : "Beat"}`,
        };
      }

      case CommandType.LOCK_REGION: {
        const locked = requireBoolean(payload, "locked");
        const cmd = new LockRegionCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
          locked,
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Region ${locked ? "locked" : "unlocked"}`,
        };
      }

      case CommandType.AUDITION_REGION: {
        audioEngine.auditionRegion(
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
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
          message: `Ripple edit ${enabled ? "enabled" : "disabled"}`,
        };
      }

      case CommandType.GROUP_REGIONS: {
        const groupRegionIds = requireStringArray(payload, "regionIds");
        if (groupRegionIds.length < 2) {
          return {
            success: false,
            message: "GROUP_REGIONS requires at least 2 regionIds",
          };
        }
        const cmd = new GroupRegionsCommand(
          audioEngine.session,
          groupRegionIds,
          optionalString(payload, "name"),
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Grouped ${groupRegionIds.length} regions`,
          data: { groupId: cmd.getGroupId() },
        };
      }

      case CommandType.UNGROUP_REGIONS: {
        const cmd = new UngroupRegionsCommand(
          audioEngine.session,
          requireString(payload, "groupId"),
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
          optionalNumber(payload, "minLengthFrames") ?? 4410,
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
          optionalNumber(payload, "targetDb") ?? 0,
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
          playbackRate,
        );
        await history.execute(rateCmd);
        return {
          success: true,
          message: `Playback rate set to ${playbackRate}`,
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
          pitchSemitones,
        );
        await history.execute(stretchCmd);
        return {
          success: true,
          message: `Time stretch applied: ${stretch}x, pitch: ${pitchSemitones}st`,
        };
      }

      case CommandType.REVERSE_REGION: {
        const reverseCmd = new ReverseRegionCommand(
          audioEngine.session,
          audioEngine,
          requireString(payload, "trackId"),
          requireString(payload, "regionId"),
        );
        await history.execute(reverseCmd);
        return { success: true, message: "Region reversed" };
      }

      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
}
