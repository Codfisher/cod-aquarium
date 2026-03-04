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
}

/** 完整世界快照封包 */
export interface WorldSnapshotPacket {
  type: PacketType.WORLD_SNAPSHOT;
  /** 256KB 的世界地圖陣列 */
  data: Uint8Array;
}

export type NetworkPacket = WorldSnapshotPacket
