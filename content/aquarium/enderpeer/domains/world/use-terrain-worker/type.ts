import type { SandFall } from '../world-state'

/** Terrain Worker 請求：生成地形 */
export interface TerrainGenerateRequest {
  type: 'generate';
}

/** Terrain Worker 回應：地形生成完成 */
export interface TerrainGenerateResponse {
  type: 'terrain-ready';
  worldState: Uint8Array;
  sandFalls: SandFall[];
}

export type TerrainWorkerMessage = TerrainGenerateRequest
export type TerrainWorkerResponse = TerrainGenerateResponse
