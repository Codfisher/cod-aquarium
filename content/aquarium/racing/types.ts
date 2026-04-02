import type { Mesh, Scene, ShadowGenerator, TransformNode } from '@babylonjs/core'

export interface VehicleNode {
  root: TransformNode;
  container: TransformNode;
  body: TransformNode;
  wheelFrontLeft: TransformNode;
  wheelFrontRight: TransformNode;
  wheelBackLeft: TransformNode;
  wheelBackRight: TransformNode;
  sphere: Mesh;
}

export interface VehicleState {
  inputX: number;
  inputZ: number;
  linearSpeed: number;
  angularSpeed: number;
  acceleration: number;
  colliding: boolean;
}

export interface TrackSegment {
  position: { x: number; z: number };
  rotation: number;
  type: 'straight' | 'corner' | 'bump' | 'finish';
}

export interface GameState {
  speed: number;
  isPlaying: boolean;
}

export interface SceneContext {
  scene: Scene;
  shadowGenerator: ShadowGenerator;
}
