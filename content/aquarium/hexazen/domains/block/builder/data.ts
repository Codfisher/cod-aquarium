import type { TraitType } from '../../../types'
import type { BlockType } from '../type'

interface PartData {
  path: string;
  position: [number, number, number];
  rotationQuaternion: [number, number, number, number];
  scaling: [number, number, number];
  metadata: any;
}

interface BlockDefinition {
  /** 一個 block 可能會有多個特性，例如港口同時有 water、building */
  traitList: Array<`${TraitType}`>;
  content: {
    version: number;
    rootFolderName: string;
    partList: PartData[];
  };
}

export const blockDefinitions = {
  /** grass */
  g1: {
    traitList: ['grass'],
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
    traitList: ['grass'],
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
          path: 'kay-hexagon-pack/decoration/nature/rock_single_C.gltf',
          position: [0.15486, 0.2, 0.214361],
          rotationQuaternion: [0, 1, 0, 0],
          scaling: [0.51202, 0.51202, 0.51202],
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
    traitList: ['tree'],
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
    traitList: ['tree'],
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
  /** building */
  b1: {
    traitList: ['building'],
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
    traitList: ['building'],
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
    traitList: ['building'],
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
    traitList: ['building'],
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
  /** alpine */
  a1: {
    traitList: ['alpine'],
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
    traitList: ['alpine'],
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
    traitList: ['water'],
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

  /** river */
  r1: {
    traitList: ['river'],
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
    traitList: ['river'],
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
    traitList: ['river'],
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
    traitList: ['river'],
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
    traitList: ['river', 'building'],
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
} satisfies Record<string, BlockDefinition>

export const blockTypeList = Object.keys(blockDefinitions) as BlockType[]
