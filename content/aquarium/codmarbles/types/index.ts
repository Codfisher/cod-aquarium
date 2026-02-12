import type { Mesh } from '@babylonjs/core'

export interface Marble {
  hexColor: string;
  mesh: Mesh;
  lastCheckPointIndex: number;
  isRespawning: boolean;
  isGrounded: boolean;
  /** 已靜止秒數，停太久則強制回歸上一個檢查點 */
  staticDurationSec: number;
  finishedAt: number;
}
