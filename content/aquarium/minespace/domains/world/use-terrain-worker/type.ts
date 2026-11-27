import type { RealmId } from '../../realm/realm-definition'

export interface TerrainWorkerMessage {
  type: 'generate';
  /** 要生哪一個場景的地形 */
  realmId: RealmId;
}

export interface TerrainWorkerResponse {
  type: 'terrain-ready';
  worldState: Uint8Array;
}
