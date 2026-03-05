import type { BlockId } from '../domains/block/block-constants'

/**
 * P2P 網路連線角色
 */
export enum NetworkRole {
  /** 房間建立者：負責維護真實世界狀態，並廣播給所有人 */
  HOST = 'host',
  /** 加入者：接收 Host 的地圖狀態，並將自己的動作送給 Host */
  CLIENT = 'client',
}

/** 網路封包基本型別 */
export enum PacketType {
  /** 初次連線時，Host 傳送完整世界快照給 Client */
  WORLD_SNAPSHOT = 'world_snapshot',
  /** 當有玩家挖掘或放置方塊時，同步單一座標點的更新 */
  BLOCK_UPDATE = 'block_update',
  /** 同步正在挖掘的方塊進度 (視覺特效使用) */
  MINING_PROGRESS = 'mining_progress',
  /** 同步玩家位置與朝向 */
  PLAYER_POSITION = 'player_position',
}

/** 完整世界快照封包 */
export interface WorldSnapshotPacket {
  type: PacketType.WORLD_SNAPSHOT;
  /** 256KB 的世界地圖陣列 */
  data: Uint8Array;
}

/** 單一方塊更新封包 (挖掘/放置) */
export interface BlockUpdatePacket {
  type: PacketType.BLOCK_UPDATE;
  data: {
    x: number;
    y: number;
    z: number;
    blockId: BlockId;
  };
}

/** 挖掘進度同步封包 */
export interface MiningProgressPacket {
  type: PacketType.MINING_PROGRESS;
  data: {
    peerId: string; // 發送者的 ID
    x: number;
    y: number;
    z: number;
    progress: number; // 0 ~ 1 之間的進度，若為 0 表示停止挖掘
    blockId: BlockId; // 正在挖掘的方塊材質(提供給粒子)
  };
}

/** 玩家位置同步封包 */
export interface PlayerPositionPacket {
  type: PacketType.PLAYER_POSITION;
  data: {
    peerId: string;
    x: number;
    y: number;
    z: number;
    rotationY: number;
  };
}

export type NetworkPacket = WorldSnapshotPacket | BlockUpdatePacket | MiningProgressPacket | PlayerPositionPacket
