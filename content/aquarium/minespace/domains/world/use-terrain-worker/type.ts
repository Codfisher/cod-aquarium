export interface TerrainWorkerMessage {
  type: 'generate';
}

export interface TerrainWorkerResponse {
  type: 'terrain-ready';
  worldState: Uint8Array;
}
