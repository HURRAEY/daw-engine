/**
 * Record Mode
 */
export enum RecordMode {
  /** 기존 리전을 유지하고 새 리전을 투명 Layer로 추가합니다. */
  SOUND_ON_SOUND = "sound_on_sound",
  /** 새 리전과 겹치는 기존 리전을 자르거나 Playlist에서 제거합니다. */
  NON_LAYERED = "non_layered",
  /** 기존 리전을 유지하고 새 리전을 불투명 최상위 Layer로 추가합니다. */
  LAYERED = "layered",
}
