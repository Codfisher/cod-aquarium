import type { TraitType } from '../../../types'
import type { BlockType } from '../type'

type TraitTypeUnion = TraitType

interface PartData {
  path: string;
  position: [number, number, number];
  rotationQuaternion: [number, number, number, number];
  scaling: [number, number, number];
  metadata: any;
}

interface BlockDefinition {
  /** 一個 block 可能會有多個特性，例如港口同時有 water、building */
  traitList: TraitTypeUnion[];
  content: {
    version: number;
    rootFolderName: string;
    partList: PartData[];
  };
}

export const blockDefinitions = {
  /** grass */
  g1: {
    traitList: ['grass'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/grass.glb',
          position: [0, 0, 0],
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
  },
  g2: {
    traitList: ['grass'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/grass.glb',
          position: [0, 0, -0.000002],
          rotationQuaternion: [0, 1, 0, 0],
          scaling: [1, 1, 1],
          metadata: {
            name: '',
            mass: 0,
            restitution: 0.5,
            friction: 0,
          },
        },
        {
          path: 'kenny-hexagon-pack/GLB format/sand-rocks.glb',
          position: [0, 0, -0.000002],
          rotationQuaternion: [0, 1, 0, 0],
          scaling: [0.960391, 0.960391, 0.960391],
          metadata: {
            name: '',
            mass: 0,
            restitution: 0.5,
            friction: 0,
          },
        },
      ],
    },
  },
  g3: {
    traitList: ['grass'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/stone-rocks.glb',
          position: [0, 0, 0],
          rotationQuaternion: [0, 1, 0, 0],
          scaling: [0.951249, 0.951249, 0.951249],
          metadata: {
            name: '',
            mass: 0,
            restitution: 0.5,
            friction: 0,
          },
        },
        {
          path: 'kenny-hexagon-pack/GLB format/grass.glb',
          position: [0, 0, 0],
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
  },
  g4: {
    traitList: ['grass'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/grass.glb',
          position: [0, 0, 0],
          rotationQuaternion: [0, 1, 0, 0],
          scaling: [1, 1, 1],
          metadata: {
            name: '',
            mass: 0,
            restitution: 0.5,
            friction: 0,
          },
        },
        {
          path: 'kenny-hexagon-pack/GLB format/path-corner.glb',
          position: [0, 0.2, 0],
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
  },
  g5: {
    traitList: ['grass'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/grass.glb',
          position: [0, 0, 0],
          rotationQuaternion: [0, 1, 0, 0],
          scaling: [1, 1, 1],
          metadata: {
            name: '',
            mass: 0,
            restitution: 0.5,
            friction: 0,
          },
        },
        {
          path: 'kenny-hexagon-pack/GLB format/path-straight.glb',
          position: [0, 0.2, 0],
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
  },
  g6: {
    traitList: ['grass'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/grass.glb',
          position: [0, 0, 0],
          rotationQuaternion: [0, 1, 0, 0],
          scaling: [1, 1, 1],
          metadata: {
            name: '',
            mass: 0,
            restitution: 0.5,
            friction: 0,
          },
        },
        {
          path: 'kenny-hexagon-pack/GLB format/path-intersectionB.glb',
          position: [0, 0.2, 0],
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
  },
  /** tree */
  t1: {
    traitList: ['tree'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/grass-forest.glb',
          position: [0, 0, 0],
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
  },
  t2: {
    traitList: ['tree'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/grass-hill.glb',
          position: [0, 0, 0],
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
  },
  t3: {
    traitList: ['tree'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/dirt-lumber.glb',
          position: [0, 0, 0],
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
  },
  /** building */
  b1: {
    traitList: ['building'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/building-market.glb',
          position: [0, 0, 0],
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
  },
  b2: {
    traitList: ['building'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/building-house.glb',
          position: [0, 0, 0],
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
  },
  b3: {
    traitList: ['building'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/building-village.glb',
          position: [0, 0, 0],
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
  },
  b4: {
    traitList: ['building'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/building-mill.glb',
          position: [-0.000007, 0, 0.000009],
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
  },
  b5: {
    traitList: ['building'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/building-farm.glb',
          position: [0, 0, 0],
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
  },
  b6: {
    traitList: ['building', 'water'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/building-dock.glb',
          position: [0, 0, 0],
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
  },
  /** alpine */
  a1: {
    traitList: ['alpine'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/stone-mountain.glb',
          position: [0, 0, 0],
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
  },
  a2: {
    traitList: ['alpine'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/stone-hill.glb',
          position: [0, 0, 0],
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
  },
  /** water */
  w1: {
    traitList: ['water'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/water.glb',
          position: [0, 0, 0],
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
  },
  w2: {
    traitList: ['water'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/water-rocks.glb',
          position: [0, 0, 0],
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
  },

  /** river */
  r1: {
    traitList: ['river'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/river-start.glb',
          position: [0, 0, 0],
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
  },
  r2: {
    traitList: ['river'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/river-corner.glb',
          position: [0, 0, 0],
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
  },
  r3: {
    traitList: ['river'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/river-straight.glb',
          position: [0, 0, 0],
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
  },
  r4: {
    traitList: ['river'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/bridge.glb',
          position: [0, 0, 0],
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
  },
  r5: {
    traitList: ['river', 'building'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/building-watermill.glb',
          position: [0, 0, 0],
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
  },

  /** sand */
  // s1: {
  //   traitList: ['sand'] as TraitTypeUnion[],
  //   content: {
  //     version: 1,
  //     rootFolderName: 'assets',
  //     partList: [
  //       {
  //         path: 'kenny-hexagon-pack/GLB format/sand-rocks.glb',
  //         position: [0, 0, 0],
  //         rotationQuaternion: [0, 1, 0, 0],
  //         scaling: [1, 1, 1],
  //         metadata: {
  //           name: '',
  //           mass: 0,
  //           restitution: 0.5,
  //           friction: 0,
  //         },
  //       },
  //     ],
  //   },
  // },
  // s2: {
  //   traitList: ['sand'] as TraitTypeUnion[],
  //   content: {
  //     version: 1,
  //     rootFolderName: 'assets',
  //     partList: [
  //       {
  //         path: 'kenny-hexagon-pack/GLB format/sand-desert.glb',
  //         position: [0, 0, 0],
  //         rotationQuaternion: [0, 1, 0, 0],
  //         scaling: [1, 1, 1],
  //         metadata: {
  //           name: '',
  //           mass: 0,
  //           restitution: 0.5,
  //           friction: 0,
  //         },
  //       },
  //     ],
  //   },
  // },
  // s3: {
  //   traitList: ['sand'] as TraitTypeUnion[],
  //   content: {
  //     version: 1,
  //     rootFolderName: 'assets',
  //     partList: [
  //       {
  //         path: 'kenny-hexagon-pack/GLB format/sand.glb',
  //         position: [0, 0, 0],
  //         rotationQuaternion: [0, 1, 0, 0],
  //         scaling: [1, 1, 1],
  //         metadata: {
  //           name: '',
  //           mass: 0,
  //           restitution: 0.5,
  //           friction: 0,
  //         },
  //       },
  //     ],
  //   },
  // },
} satisfies Record<string, BlockDefinition>

export const blockTypeList = Object.keys(blockDefinitions) as BlockType[]
