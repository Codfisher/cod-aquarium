import type { Mesh } from '@babylonjs/core'

export interface Marble {
  hexColor: string;
  mesh: Mesh;
  lastCheckPointIndex: number;
  isRespawning: boolean;
  finishTime: number;
}
