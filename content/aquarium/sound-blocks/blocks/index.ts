import type { Scene, ShadowGenerator } from '@babylonjs/core'

export interface CreateBlockParams {
  scene: Scene;
  shadowGenerator?: ShadowGenerator;
}

export * from './tree'
