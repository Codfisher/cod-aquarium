/** 定義 blocks 類型 */
export enum BlockType {
  /** tree */
  t1 = 't1',
}

export const BlockData = {
  [BlockType.t1]: {
    version: 1,
    rootFolderName: 'kenny-hexagon-pack',
    partList: [
      {
        path: 'GLB format/grass-hill.glb',
        position: [-0.000043, 0, -0.00063],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
    ],
  },
}
