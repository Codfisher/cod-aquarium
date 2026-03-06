/** 玩家狀態（Phase 2 使用） */
export interface PlayerState {
  peerId: string;
  position: { x: number; y: number; z: number };
  rotation: { pitch: number; yaw: number };
  heldBlockId: number;
}
