import type { TransformNode } from '@babylonjs/core'
import type { Hex } from '../hex-grid'
import type { blockDefinitions } from './builder/data'

export type BlockType = keyof typeof blockDefinitions

export interface Block {
  type: BlockType;
  rootNode: TransformNode;
  hex: Hex;
  dispose: () => void;
}
