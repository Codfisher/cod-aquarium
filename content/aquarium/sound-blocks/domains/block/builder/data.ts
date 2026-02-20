interface PartData {
  path: string;
  position: [number, number, number];
  rotationQuaternion: [number, number, number, number];
  scaling: [number, number, number];
  metadata: any;
}

interface BlockDefinition {
  tags: string[];
  content: {
    version: number;
    rootFolderName: string;
    partList: PartData[];
  };
}

export const blockDefinitions = {
  /** grass */
  g1: {
    tags: [],
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
  /** tree */
  t1: {
    tags: [],
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
    tags: [],
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
    tags: [],
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
    tags: [],
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
    tags: [],
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
  /** alpine */
  a1: {
    tags: [],
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
  /** water */
  w1: {
    tags: [],
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
} satisfies Record<string, BlockDefinition>

export type BlockType = keyof typeof blockDefinitions
