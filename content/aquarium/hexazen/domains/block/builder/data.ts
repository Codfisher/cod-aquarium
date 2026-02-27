import type { TraitType } from '../../../types'
import type { BlockType } from '../type'

type TraitTypeUnion = TraitType

interface PartData {
  path: string;
  position: [number, number, number];
  rotationQuaternion: [number, number, number, number];
  scaling: [number, number, number];
  metadata: {
    name: string;
    mass: number;
    restitution: number;
    friction: number;
  };
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
  /** campfire */
  c1: {
    traitList: ['campfire'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/dirt.glb',
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
          path: 'kenny-hexagon-pack/GLB format/unit-tree.glb',
          position: [0.019293, 0.1, -0.406058],
          rotationQuaternion: [0, 1, 0, 0],
          scaling: [0.770846, 0.770846, 0.770846],
          metadata: {
            name: '',
            mass: 0,
            restitution: 0.5,
            friction: 0,
          },
        },
        {
          path: 'kenny-hexagon-pack/GLB format/unit-tree.glb',
          position: [0.241323, 0.1, -0.301052],
          rotationQuaternion: [0, -0.97121328, 0, 0.23821158],
          scaling: [0.841121, 0.84112, 0.841121],
          metadata: {
            name: '',
            mass: 0,
            restitution: 0.5,
            friction: 0,
          },
        },
        {
          path: 'kenny-hexagon-pack/GLB format/unit-tree.glb',
          position: [-0.239856, 0.1, 0.339206],
          rotationQuaternion: [0, 1, 0, 1e-8],
          scaling: [0.623575, 0.623575, 0.623575],
          metadata: {
            name: '',
            mass: 0,
            restitution: 0.5,
            friction: 0,
          },
        },
        {
          path: 'kay-hexagon-pack/decoration/props/pallet.gltf',
          position: [-0.00671, 0.1, 0.020719],
          rotationQuaternion: [0, 0.98776214, 0, 0.15596783],
          scaling: [0.681659, 0.681659, 0.681659],
          metadata: {
            name: 'campfire',
            mass: 0,
            restitution: 0.5,
            friction: 0,
          },
        },
        {
          path: 'kay-hexagon-pack/decoration/props/resource_lumber.gltf',
          position: [0.346913, 0.099999, 0.078525],
          rotationQuaternion: [0, -0.71779402, 0, 0.69625551],
          scaling: [0.2879, 0.2879, 0.2879],
          metadata: {
            name: '',
            mass: 0,
            restitution: 0.5,
            friction: 0,
          },
        },
        {
          path: 'kay-hexagon-pack/decoration/nature/tree_single_A_cut.gltf',
          position: [0.039788, 0.1, 0.431967],
          rotationQuaternion: [0, 1, 0, 0],
          scaling: [0.439342, 0.439342, 0.439342],
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
    traitList: ['grass'] as TraitTypeUnion[],
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
  b7: {
    traitList: ['building', 'alpine'] as TraitTypeUnion[],
    content: {
      version: 1,
      rootFolderName: 'assets',
      partList: [
        {
          path: 'kenny-hexagon-pack/GLB format/building-cabin.glb',
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
