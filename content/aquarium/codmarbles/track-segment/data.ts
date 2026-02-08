interface TrackSegmentSceneData {
  version: number;
  rootFolderName: string;
  partList: Array<{
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
  }>;
}

export enum TrackSegmentType {
  g01 = 'g01',
  g02 = 'g02',
  b01 = 'b01',
  b02 = 'b02',
  y01 = 'y01',

  end = 'end',
}

export const trackSegmentData: Record<TrackSegmentType, TrackSegmentSceneData> = {
  [TrackSegmentType.g01]: {
    version: 1,
    rootFolderName: 'kay-platformer-pack',
    partList: [
      {
        path: 'green/platform_2x2x4_green.gltf',
        position: [-4, -0.7, 4],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-5.461404, 4, -1.325003],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/signage_arrows_right_green.gltf',
        position: [2.017502, 3.999999, 7.697391],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_decorative_1x1x1_green.gltf',
        position: [-5.034626, 4.514127, 4.725829],
        rotationQuaternion: [0.27059814, -0.65328146, -0.27059796, 0.65328151],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_4x1x1.gltf',
        position: [1.034748, 1.73419, -2.544961],
        rotationQuaternion: [0, 0, 0, 1],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/barrier_3x1x1_green.gltf',
        position: [-8.325094, 4, 12.099703],
        rotationQuaternion: [0, 0.92387953, 0, 0.38268343],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_6x2x2_green.gltf',
        position: [0.000374, 0, -2.1],
        rotationQuaternion: [0, 3e-8, 0, 1],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x2_green.gltf',
        position: [2, 1.999999, 4],
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
        path: 'neutral/platform_wood_1x1x1.gltf',
        position: [-6.281435, 4, -1.51575],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_2x4x4_green.gltf',
        position: [-6.00002, 1.960229, 3],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_2x4x4_green.gltf',
        position: [-8.000016, 1.999998, 6.999999],
        rotationQuaternion: [0, 0, 0, 1],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_2x2x2_green.gltf',
        position: [-2, 0, 2],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x4_green.gltf',
        position: [-9.999974, 4, 4.000005],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/platform_6x2x4_green.gltf',
        position: [-9.999998, 0, 7.999998],
        rotationQuaternion: [0, -0.70710699, 0, 0.70710657],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-4.812348, 4, -1.26607],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x2_green.gltf',
        position: [-2, 0, 8],
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
        path: 'green/barrier_4x1x1_green.gltf',
        position: [-2.851089, 3.881558, 12.719039],
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
        path: 'neutral/barrier_2x1x1.gltf',
        position: [-2.013737, 1.740885, -2.557682],
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
        path: 'green/flag_A_green.gltf',
        position: [-3.93602, 3.3, 3.96658],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-4.164329, 4, -1.274537],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_2x2x2_green.gltf',
        position: [-4, 2, 2.000012],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x4_green.gltf',
        position: [-8, 0, 0.000012],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_C.gltf',
        position: [1.888601, 1, 4.490527],
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
        path: 'green/platform_2x2x4_green.gltf',
        position: [-9.999974, 0, 4.000005],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/barrier_3x1x1_green.gltf',
        position: [0.224644, 3.582404, 12.135732],
        rotationQuaternion: [0, -0.92387953, 0, 0.38268343],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_2x4x4_green.gltf',
        position: [-6, 1.999998, 7.000003],
        rotationQuaternion: [0, -1.7e-7, 0, 1],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_6x2x1_green.gltf',
        position: [2.000012, 0, 6],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_4x2x2_green.gltf',
        position: [-2, 0, 5.000129],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_4x2x4_green.gltf',
        position: [-9.999971, 4, 7.011183],
        rotationQuaternion: [0, -0.70710857, 0, 0.70710499],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_4x2x4_green.gltf',
        position: [1.999974, 0, 11],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/barrier_3x1x1_green.gltf',
        position: [-6.15033, 4, 12.651276],
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
        path: 'green/platform_4x2x2_green.gltf',
        position: [0, 0, 6.999985],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_4x4x4_green.gltf',
        position: [-7, 0, 11],
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
        path: 'green/platform_2x2x2_green.gltf',
        position: [0.000221, 0, 4],
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
        path: 'green/platform_slope_2x2x2_green.gltf',
        position: [-2, 0, -2],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_4x1x1.gltf',
        position: [2.58818, 1.75693, -0.028371],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_4x4x4_green.gltf',
        position: [-3, 0, 11],
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
        path: 'neutral/cone.gltf',
        position: [1.521478, 3.999999, 3.393853],
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
        path: 'neutral/structure_A.gltf',
        position: [0, 0, 0],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: 'out',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_6x2x2_green.gltf',
        position: [2.1, 0, -0.000098],
        rotationQuaternion: [0, -0.70727417, 0, 0.70693935],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_A.gltf',
        position: [-8.000012, 7.874008, 5.500009],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: 'in',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x2_green.gltf',
        position: [-4, 0, 2.000012],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_2x4x4_green.gltf',
        position: [0, 0, 11.000044],
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
        path: 'neutral/structure_C.gltf',
        position: [1.888601, 1, 7.451001],
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
        path: 'green/platform_slope_2x4x4_green.gltf',
        position: [-5, 0, 0.000488],
        rotationQuaternion: [0, 0.7071068, 0, 0.70710676],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_6x2x2_green.gltf',
        position: [0, 0, 2.099872],
        rotationQuaternion: [0, -1, 0, 3e-8],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/barrier_2x1x1_green.gltf',
        position: [-9.151984, 4.526803, 2.086134],
        rotationQuaternion: [-0.15776813, 0.68928167, -0.15776813, 0.68928167],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_2x4x4_green.gltf',
        position: [-8.000012, 2, 3.000011],
        rotationQuaternion: [0, 1, 0, 3e-8],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_2x2x2_green.gltf',
        position: [-1.999966, 0, 0],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_4x2x2_green.gltf',
        position: [-3.999997, 0, 7.000001],
        rotationQuaternion: [0, -0.70710671, 0, 0.70710686],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_4x2x2_green.gltf',
        position: [2, 1.999999, 7.000015],
        rotationQuaternion: [0, -0.70710741, 0, 0.70710615],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x2_green.gltf',
        position: [-9.999971, 4, 9.950198],
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
        path: 'green/platform_4x2x4_green.gltf',
        position: [-5, 0, -2],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'green/railing_straight_padded_green.gltf',
        position: [-4.903756, 2, 5.202438],
        rotationQuaternion: [0, -0.92387953, 0, 0.38268343],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_1x1x2.gltf',
        position: [2.514596, 1.718827, 2.480247],
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
        path: 'green/barrier_3x1x1_green.gltf',
        position: [-8.116904, 4, -0.254795],
        rotationQuaternion: [0, -0.92387953, 0, 0.38268343],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
    ],
  },
  [TrackSegmentType.g02]: {
    version: 1,
    rootFolderName: 'kay-platformer-pack',
    partList: [
      {
        path: 'green/platform_2x2x4_green.gltf',
        position: [1.800001, 0, 4.000001],
        rotationQuaternion: [0, 1, -1e-8, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_6x2x2_green.gltf',
        position: [0, 0, -2.000013],
        rotationQuaternion: [0, 0, 0, 1],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_6x6x1_green.gltf',
        position: [-13.999995, 0, -0.000034],
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
        path: 'neutral/cone.gltf',
        position: [-10.037466, 6.635997, -0.816713],
        rotationQuaternion: [-0.23939908, -0.948026, -0.05131952, 0.20322669],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_A.gltf',
        position: [-15.928817, 10.800003, 0.032636],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: 'in',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_C.gltf',
        position: [-15.836543, 2.999896, -1.90928],
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
        path: 'neutral/structure_C.gltf',
        position: [-10.002956, 1, -1.89177],
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
        path: 'neutral/cone.gltf',
        position: [-15.069952, 9.144004, 1.228285],
        rotationQuaternion: [0.25115379, 0.94308265, -0.05609644, 0.21064208],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-13.256505, 8.221911, 0.169793],
        rotationQuaternion: [-0.27250965, -0.9318012, -0.06729996, 0.23012111],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_C.gltf',
        position: [-15.936539, 2.999896, 1.961779],
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
        path: 'green/platform_slope_2x2x2_green.gltf',
        position: [-4.034588, 2, 1.988413],
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
        path: 'neutral/barrier_1x1x1.gltf',
        position: [-11.159257, 7.027901, -2.076738],
        rotationQuaternion: [-0.30816148, -0.87097064, -0.12764466, 0.3607679],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_2x2x2_green.gltf',
        position: [-4.015753, 2, -1.960346],
        rotationQuaternion: [0, 0, 0, 1],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-9.039926, 6.128773, 0.158807],
        rotationQuaternion: [-0.24845726, -0.9314573, -0.06850759, 0.25683264],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/railing_straight_padded_green.gltf',
        position: [-4.50104, 3.599991, -3.276385],
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
        path: 'neutral/cone.gltf',
        position: [-11.417037, 7.286589, 0.184886],
        rotationQuaternion: [-0.29014105, -0.90867387, -0.0913175, 0.2859914],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x4_green.gltf',
        position: [1.800003, 0, -4.000016],
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
        path: 'green/platform_slope_6x2x2_green.gltf',
        position: [2.1, 0, 0],
        rotationQuaternion: [0, -0.70710694, 0, 0.70710662],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_6x2x2_green.gltf',
        position: [0.000003, 0, 1.999999],
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
        path: 'neutral/cone.gltf',
        position: [-15.021373, 9.119302, -1.141566],
        rotationQuaternion: [-0.24534432, -0.91886855, -0.07971496, 0.29855031],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/flag_A_green.gltf',
        position: [1.794842, 4, -4.009089],
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
        path: 'green/barrier_1x1x1_green.gltf',
        position: [-16.745462, 10.095958, -2.516687],
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
        path: 'neutral/barrier_1x1x1.gltf',
        position: [-11.173766, 7.041293, 2.201901],
        rotationQuaternion: [0.28523834, 0.87874483, -0.11814963, 0.36398802],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_6x2x2_green.gltf',
        position: [-4.000001, 0, 0.000017],
        rotationQuaternion: [0, -0.70710688, 0, 0.70710668],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/barrier_1x1x1_green.gltf',
        position: [-16.648874, 10.046845, 2.633738],
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
        path: 'neutral/cone.gltf',
        position: [-10.015743, 6.624951, 1.032946],
        rotationQuaternion: [0.23851716, 0.94338211, -0.05650495, 0.22348816],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_C.gltf',
        position: [-9.902954, 1, 2.051304],
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
        path: 'green/platform_6x2x2_green.gltf',
        position: [-5.991594, 1, -0.005983],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-13.213113, 8.199848, 1.292919],
        rotationQuaternion: [0.27320447, 0.93216968, -0.06680534, 0.22793869],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-7.031164, 5.107368, -0.138711],
        rotationQuaternion: [-0.28115986, -0.95074289, -0.03701538, 0.12516768],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/barrier_4x1x1_green.gltf',
        position: [-11.305932, 7.230095, 2.714784],
        rotationQuaternion: [0.24674976, 0.96907923, -3e-8, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-8.231533, 5.717726, 1.127489],
        rotationQuaternion: [-0.24910167, -0.89491632, -0.09928089, 0.35667414],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_A.gltf',
        position: [-0.000002, 0, 0.000001],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: 'out',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/barrier_4x1x1_green.gltf',
        position: [-7.78089, 5.488585, -2.474996],
        rotationQuaternion: [0.23976121, 0.97083189, -3e-8, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-14.281401, 8.743045, -0.31677],
        rotationQuaternion: [0.25651911, 0.9239455, -0.07591163, 0.27342289],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_6x6x4_green.gltf',
        position: [-8.000005, 3.099999, 0],
        rotationQuaternion: [0, 0.70710679, 1e-8, 0.70710677],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-8.071647, 5.636428, -0.873998],
        rotationQuaternion: [-0.24964773, -0.88951076, -0.10340746, 0.36844743],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/barrier_4x1x1_green.gltf',
        position: [-14.829679, 9.021831, 2.710767],
        rotationQuaternion: [0.26044427, 0.96548888, -3e-8, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/barrier_4x1x1_green.gltf',
        position: [-14.990945, 9.10383, -2.489225],
        rotationQuaternion: [0.25836249, 0.96604804, -3e-8, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-12.18037, 7.674725, 0.84434],
        rotationQuaternion: [-0.2846042, -0.92366054, -0.07556429, 0.24523802],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-15.760423, 9.495089, 0.031547],
        rotationQuaternion: [-0.2349785, -0.91623845, -0.08060936, 0.31431567],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/barrier_4x1x1_green.gltf',
        position: [-7.808207, 5.503594, 2.674994],
        rotationQuaternion: [0.23431951, 0.97215964, -3e-8, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_6x6x4_green.gltf',
        position: [-14.000075, 6.199998, 0.000001],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/barrier_1x1x1_green.gltf',
        position: [-5.618069, 4.388846, -2.373908],
        rotationQuaternion: [0.30162012, 0.95342818, -3e-8, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/barrier_1x1x1_green.gltf',
        position: [-5.7476, 4.261617, 2.58087],
        rotationQuaternion: [0.26311181, 0.96476535, -3e-8, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_C.gltf',
        position: [-15.936539, 4.999887, 1.961779],
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
        path: 'green/barrier_4x1x1_green.gltf',
        position: [-11.464657, 7.310802, -2.503248],
        rotationQuaternion: [0.23730838, 0.97143437, -3e-8, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_C.gltf',
        position: [-15.836543, 4.999887, -1.90928],
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
        path: 'neutral/cone.gltf',
        position: [-7.986917, 5.593346, 0.159838],
        rotationQuaternion: [-0.25065562, -0.88922728, -0.10382492, 0.36833001],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x1_green.gltf',
        position: [-1.99987, 0, 0],
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
        path: 'neutral/structure_C.gltf',
        position: [-9.902954, 3, 2.051304],
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
        path: 'neutral/cone.gltf',
        position: [-13.289408, 8.238643, -1.038726],
        rotationQuaternion: [-0.26764065, -0.91664887, -0.08320111, 0.28495773],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_C.gltf',
        position: [-10.002956, 3, -1.89177],
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
        path: 'green/platform_2x2x2_green.gltf',
        position: [-15.936539, 1, 1.961779],
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
        path: 'neutral/cone.gltf',
        position: [-6.474219, 4.824188, 0.993634],
        rotationQuaternion: [-0.28081011, -0.92420611, -0.0752531, 0.24764029],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x2_green.gltf',
        position: [-15.836543, 0.963438, -1.90928],
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
        path: 'green/platform_6x6x1_green.gltf',
        position: [-7.999995, 0, 0],
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
        path: 'green/platform_6x2x4_green.gltf',
        position: [-17.999977, 7.400003, 0],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-12.173422, 7.671191, -0.549799],
        rotationQuaternion: [0.2842826, 0.92231193, -0.07710565, 0.25015761],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/railing_straight_padded_green.gltf',
        position: [-4.363099, 3.699991, 1.669607],
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
        path: 'neutral/cone.gltf',
        position: [-6.454654, 4.814227, -1.04287],
        rotationQuaternion: [-0.26881497, -0.88390719, -0.11134675, 0.36612634],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-14.306915, 8.75602, 0.585607],
        rotationQuaternion: [-0.25478849, -0.91892848, -0.0804464, 0.29014076],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/lever_floor_base_green.gltf',
        position: [1.868935, 4, 4.053122],
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
        path: 'green/arch_wide_green.gltf',
        position: [-3.498046, 3.537894, -0.031646],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_2x1x2.gltf',
        position: [2.658873, 1.794144, -1.962252],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_1x1x2.gltf',
        position: [2.658873, 1.794144, -0.507362],
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
        path: 'neutral/barrier_3x1x2.gltf',
        position: [2.658873, 1.794144, 1.471973],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x4_green.gltf',
        position: [-6, 0, 4],
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
        path: 'neutral/sign.gltf',
        position: [-6.090887, 4, 4.005767],
        rotationQuaternion: [0, -0.92387957, 0, 0.38268335],
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
  [TrackSegmentType.b01]: {
    version: 1,
    rootFolderName: 'kay-platformer-pack',
    partList: [
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-6.229891, 2.615711, 1.013204],
        rotationQuaternion: [0.13052619, 0.99144486, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-6.197943, 9.042265, -0.986792],
        rotationQuaternion: [-2e-7, -0.0000015, -0.13052619, 0.99144486],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_6x6x1_blue.gltf',
        position: [-5.5, 0, 0],
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
        path: 'blue/platform_decorative_1x1x1_blue.gltf',
        position: [-9.499999, 4.1903, 1.483876],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x1_blue.gltf',
        position: [2, 19.225607, 0.000008],
        rotationQuaternion: [-0.49999999, 0.50000001, 0.50000001, 0.49999999],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/signage_arrows_right_blue.gltf',
        position: [-9.157626, 9.927205, -2.999955],
        rotationQuaternion: [-0.50000003, 0.50000001, -0.49999993, 0.50000004],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-2.1, 0.000001, 0.000011],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_decorative_1x1x1_blue.gltf',
        position: [3.500003, 0.65033, 1.560029],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_6x6x1_blue.gltf',
        position: [2.500005, 14.900001, 0.000044],
        rotationQuaternion: [0.70710678, 0.70710678, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [0.297058, 5.810319, 1.013201],
        rotationQuaternion: [-0.13052619, 0.99144486, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [2.099995, 0, -0.000003],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_6x6x1_blue.gltf',
        position: [2.500003, 8.900001, 0.000044],
        rotationQuaternion: [-0.70710678, -0.70710679, 0, 1e-8],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-6.229891, 2.615711, -0.986792],
        rotationQuaternion: [-2e-7, -0.0000015, -0.13052619, 0.99144486],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_6x6x1_blue.gltf',
        position: [-8.499996, 8.900001, 0.000045],
        rotationQuaternion: [2e-8, 3e-8, 0.70710678, 0.70710679],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_A.gltf',
        position: [-0.000015, 20.300022, -0.000093],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: 'in',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_decorative_1x1x1_blue.gltf',
        position: [3.500003, 0.65033, -1.37033],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_decorative_1x1x1_blue.gltf',
        position: [-9.500002, 9.990299, 1.483876],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_A.gltf',
        position: [0, 0, 0.000002],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: 'out',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/signage_arrows_left_blue.gltf',
        position: [3.144008, 12.274739, 3.000044],
        rotationQuaternion: [0.5, -0.50000001, -0.5, 0.49999999],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/sign.gltf',
        position: [-9.025411, 13.865619, -0.565272],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [0, 0, 2.1],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_decorative_1x1x1_blue.gltf',
        position: [3.400004, 7.050327, -1.37033],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [0.208282, 12.750319, -0.986795],
        rotationQuaternion: [2e-7, -0.00000149, 0.13052619, 0.99144486],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_6x6x1_blue.gltf',
        position: [-8.499995, 2.9, 0.000045],
        rotationQuaternion: [2e-8, 2e-8, 0.70710678, 0.70710679],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x1_blue.gltf',
        position: [0, 19.225607, -1.999995],
        rotationQuaternion: [0, -0.70710678, -0.70710678, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [0, 0, -2.099999],
        rotationQuaternion: [0, 0, 0, 1],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_decorative_1x1x1_blue.gltf',
        position: [3.500005, 14.150331, -1.37033],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_decorative_1x1x1_blue.gltf',
        position: [-9.499995, 0.090299, 1.483876],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [0.208283, 12.750319, 1.013201],
        rotationQuaternion: [-0.13052619, 0.99144486, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x1_blue.gltf',
        position: [0, 19.225607, 2.00001],
        rotationQuaternion: [-0.70710678, 0, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_decorative_1x1x1_blue.gltf',
        position: [-9.500002, 9.990299, -1.492062],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_decorative_1x1x1_blue.gltf',
        position: [-9.499995, 0.090299, -1.492062],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_6x2x1_blue.gltf',
        position: [-8.499996, 12.890203, 0.000045],
        rotationQuaternion: [0.5, -0.5, 0.5, 0.5],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [0.297057, 5.810319, -0.986795],
        rotationQuaternion: [2e-7, -0.0000015, 0.13052619, 0.99144486],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x1_blue.gltf',
        position: [-2, 19.225607, 0.000008],
        rotationQuaternion: [-0.49999999, -0.50000001, -0.50000001, 0.49999999],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_decorative_1x1x1_blue.gltf',
        position: [-9.499999, 4.1903, -1.492062],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_decorative_1x1x1_blue.gltf',
        position: [3.400004, 7.050327, 1.560029],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_6x6x1_blue.gltf',
        position: [2.500003, 2.9, 0.000044],
        rotationQuaternion: [0.70710678, 0.70710679, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_decorative_1x1x1_blue.gltf',
        position: [3.500005, 14.150332, 1.560029],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-6.197943, 9.042265, 1.013204],
        rotationQuaternion: [0.13052619, 0.99144486, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/railing_straight_padded_blue.gltf',
        position: [-2.157396, 13.560682, 0.813765],
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
        path: 'blue/railing_straight_padded_blue.gltf',
        position: [-2.157396, 13.560682, -2.286235],
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
        path: 'blue/railing_straight_padded_blue.gltf',
        position: [-4.157393, 9.86067, 0.813765],
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
        path: 'blue/railing_straight_padded_blue.gltf',
        position: [-4.157393, 9.86067, -2.286235],
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
        path: 'blue/railing_straight_padded_blue.gltf',
        position: [-1.757394, 6.860662, -2.286235],
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
        path: 'blue/railing_straight_padded_blue.gltf',
        position: [-1.757394, 6.860662, 0.813765],
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
        path: 'blue/railing_straight_padded_blue.gltf',
        position: [-4.357392, 3.560665, -2.286235],
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
        path: 'blue/railing_straight_padded_blue.gltf',
        position: [-4.357392, 3.560665, 0.813765],
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
  [TrackSegmentType.b02]: {
    version: 1,
    rootFolderName: 'kay-platformer-pack',
    partList: [
      {
        path: 'blue/platform_2x2x2_blue.gltf',
        position: [-0.999941, 5.34553, -15.494045],
        rotationQuaternion: [0, 0.99144486, 0.13052619, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-2.1, 0.000001, 0.000011],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-0.99999, 4.310258, -11.630361],
        rotationQuaternion: [0.09229606, 0.7010566, 0.09229585, 0.70105816],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-12.200003, 11.757358, -7.257771],
        rotationQuaternion: [-0.09229597, 0.70105728, -0.09229595, 0.70105749],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_1x1x1_blue.gltf',
        position: [2.51543, 6.370181, -11.59069],
        rotationQuaternion: [0, 0.99144486, 0.13052619, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-0.309335, 18.610291, 0.147123],
        rotationQuaternion: [-0.13052612, 0.99144487, -2e-8, 1.2e-7],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-10.790669, 9.110266, -13.239698],
        rotationQuaternion: [0, -1e-7, -0.13052619, 0.99144486],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-13.748902, 15.628866, -2.402544],
        rotationQuaternion: [-0.13052618, -1.3e-7, 0, 0.99144486],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-10.790669, 9.110266, -11.239697],
        rotationQuaternion: [0.13052619, 0.99144486, -1.4e-7, 0.00000108],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_1x1x1_blue.gltf',
        position: [-13.715431, 15.870196, -1.501888],
        rotationQuaternion: [-0.13052618, -1.1e-7, -1e-8, 0.99144486],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x2_blue.gltf',
        position: [-14.654353, 10.145537, -11.239746],
        rotationQuaternion: [-0.09229594, -0.70105741, -0.09229597, 0.70105736],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-1.249662, 20.428883, 1.696007],
        rotationQuaternion: [-0.09229591, 0.70105736, 0.09229593, 0.70105742],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [0, 0, -2.099999],
        rotationQuaternion: [0, 0, 0, 1],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/signage_arrow_stand_blue.gltf',
        position: [-14.126568, 12.074671, -10.943894],
        rotationQuaternion: [-0.05271998, -0.92491093, -0.11710043, 0.35783777],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [1.000012, 4.310258, -11.630361],
        rotationQuaternion: [0.09229596, -0.70105738, -0.09229596, 0.70105738],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_4x2x4_blue.gltf',
        position: [-13.2, 14.84555, 2.401487],
        rotationQuaternion: [-0.13052618, -9e-8, -1e-8, 0.99144486],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_4x2x4_blue.gltf',
        position: [2.000001, 5.345535, -15.494064],
        rotationQuaternion: [0, 0.99144486, 0.13052619, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x2_blue.gltf',
        position: [-10.200055, 14.845545, 2.401468],
        rotationQuaternion: [-0.13052618, -8e-8, -1e-8, 0.99144486],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [2.099996, 0, -0.000003],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-6.104895, 16.557375, -1.852892],
        rotationQuaternion: [1.6e-7, -9.8e-7, 0.13052611, 0.99144487],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-0.309335, 18.610291, -1.852888],
        rotationQuaternion: [1.6e-7, -9.8e-7, 0.13052612, 0.99144487],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x2_blue.gltf',
        position: [3.000004, 4.310254, -11.630342],
        rotationQuaternion: [0, 0.99144486, 0.13052619, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_1x1x1_blue.gltf',
        position: [-10.750998, 11.170189, -14.755117],
        rotationQuaternion: [-0.09229594, -0.70105741, -0.09229597, 0.70105736],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-10.200006, 13.810273, -1.462216],
        rotationQuaternion: [-0.09229587, -0.70105818, 0.09229603, 0.70105659],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [2.548903, 6.128851, -10.690033],
        rotationQuaternion: [0, 0.99144486, 0.13052619, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-1.000004, 2.357345, -5.834805],
        rotationQuaternion: [0.09229606, 0.7010566, 0.09229585, 0.70105816],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-6.104893, 16.557375, 0.147113],
        rotationQuaternion: [-0.13052611, 0.99144487, -3e-8, 1.1e-7],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_A.gltf',
        position: [0, 0, 0.000002],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: 'out',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-9.850342, 10.928859, -14.788589],
        rotationQuaternion: [-0.09229594, -0.70105741, -0.09229596, 0.70105736],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x2_blue.gltf',
        position: [3.554349, 19.645561, -1.852845],
        rotationQuaternion: [-0.09229593, 0.70105739, 0.09229596, 0.70105739],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [0, 0, 2.1],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.1,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [0.999999, 2.357344, -5.834805],
        rotationQuaternion: [0.09229597, -0.70105739, -0.09229597, 0.70105738],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_1x1x1_blue.gltf',
        position: [-0.349006, 20.670212, 1.662536],
        rotationQuaternion: [-0.09229591, 0.70105737, 0.09229592, 0.70105741],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x2_blue.gltf',
        position: [-14.200006, 13.810269, -1.462235],
        rotationQuaternion: [-0.13052618, -1.2e-7, -1e-8, 0.99144486],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-10.199998, 11.757358, -7.257771],
        rotationQuaternion: [-0.09229588, -0.70105816, 0.09229604, 0.70105661],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x4_blue.gltf',
        position: [1.622504, 19.127941, 2.147117],
        rotationQuaternion: [-0.09229592, 0.70105738, 0.09229593, 0.70105739],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-4.995115, 6.95735, -11.239683],
        rotationQuaternion: [0.13052619, 0.99144486, -1.4e-7, 0.00000107],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x2_blue.gltf',
        position: [-10.79065, 9.110262, -15.239691],
        rotationQuaternion: [-0.09229594, -0.70105741, -0.09229597, 0.70105736],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_4x2x4_blue.gltf',
        position: [-14.654372, 10.145542, -14.239688],
        rotationQuaternion: [-0.09229594, -0.70105741, -0.09229597, 0.70105736],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x4_blue.gltf',
        position: [3.000014, 4.827909, -13.5622],
        rotationQuaternion: [0, 0.99144486, 0.13052619, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_4x2x4_blue.gltf',
        position: [3.554369, 19.645565, 1.147102],
        rotationQuaternion: [-0.09229592, 0.70105739, 0.09229594, 0.70105739],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x4_blue.gltf',
        position: [-12.722507, 9.627916, -15.239701],
        rotationQuaternion: [-0.09229594, -0.70105741, -0.09229597, 0.70105736],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-12.200015, 13.810273, -1.462216],
        rotationQuaternion: [-0.09229596, 0.70105729, -0.09229594, 0.70105748],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x4_blue.gltf',
        position: [-14.200014, 14.327924, 0.469622],
        rotationQuaternion: [-0.13052618, -1e-7, -1e-8, 0.99144486],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_slope_6x2x2_blue.gltf',
        position: [-4.995115, 6.95735, -13.239685],
        rotationQuaternion: [0, -1.1e-7, -0.13052619, 0.99144486],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_2x2x2_blue.gltf',
        position: [-0.309353, 18.610287, 2.147113],
        rotationQuaternion: [-0.0922959, 0.70105736, 0.09229592, 0.70105742],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_A.gltf',
        position: [0.48952, 23.11478, 0.040333],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: 'in',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/sign.gltf',
        position: [-12.193647, 18.663088, 1.19391],
        rotationQuaternion: [-0.03378264, 0.9576622, -0.1260786, 0.25660482],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/lever_floor_base_blue.gltf',
        position: [2.857218, 9.234669, -14.553698],
        rotationQuaternion: [-1e-8, -0.7071068, 0, 0.70710676],
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
  [TrackSegmentType.y01]: {
  "version": 1,
  "rootFolderName": "kay-platformer-pack",
  "partList": [
    {
      "path": "yellow/pipe_90_B_yellow.gltf",
      "position": [-1.064909, 13.032892, -4.237993],
      "rotationQuaternion": [1e-8, 0, -1, 1e-8],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_A.gltf",
      "position": [0, 0, 0.000002],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "out",
        "mass": 0,
        "restitution": 0.1,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-4.065791, 11.791178, -1.299793],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-4.065791, 17.775326, -1.299793],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/pipe_90_B_yellow.gltf",
      "position": [-3.064909, 3.032889, -0.237993],
      "rotationQuaternion": [-0.70710678, 0.70710679, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-7.03627, 9.998671, -4.15337],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_slope_6x2x2_yellow.gltf",
      "position": [-0.000001, 0, -2.100012],
      "rotationQuaternion": [0, 0, 0, 1],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/pipe_90_B_yellow.gltf",
      "position": [-3.031112, 15.065389, -4.237999],
      "rotationQuaternion": [-0.5, 0.50000001, 0.5, 0.5],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/pipe_end_yellow.gltf",
      "position": [-5.005764, 21.063457, -4.213576],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_A.gltf",
      "position": [-5.005764, 21.963457, -4.213576],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "in",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/pipe_end_yellow.gltf",
      "position": [-3.064912, 3.032889, -0.237993],
      "rotationQuaternion": [0.70710678, 0.70710679, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-4.065791, 13.790906, -1.299793],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-6, 2, 2],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/pipe_90_B_yellow.gltf",
      "position": [-3.06491, 7.032883, -4.237993],
      "rotationQuaternion": [0, 0, -0.70710678, 0.70710679],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-4.065791, 9.799002, -1.299793],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-4.065791, 15.790865, -1.299793],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/pipe_90_B_yellow.gltf",
      "position": [-3.064909, 15.032892, -4.237993],
      "rotationQuaternion": [0.50000001, 0.5, -0.49999999, 0.50000001],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_decorative_1x1x1_yellow.gltf",
      "position": [-4.071231, 21.797012, -0.299793],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-4.065791, 6.999969, -1.299793],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/pipe_90_B_yellow.gltf",
      "position": [-5.06491, 5.032885, -4.237993],
      "rotationQuaternion": [0, 0.70710678, 1e-8, 0.70710679],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_hole_6x6x1_yellow.gltf",
      "position": [-5.005764, 21.063173, -4.213576],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_4x4x1_yellow.gltf",
      "position": [-7.000002, 0, -1.000002],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/pipe_straight_B_yellow.gltf",
      "position": [-5.005764, 17.065386, -4.213576],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/pipe_straight_B_yellow.gltf",
      "position": [-5.005764, 19.065384, -4.213576],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-4.065791, 19.706787, -1.299793],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_slope_6x2x2_yellow.gltf",
      "position": [-0.00002, 0, 2.1],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_2x2x2_yellow.gltf",
      "position": [-6, 0, 2],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_4x4x1_yellow.gltf",
      "position": [-1, 0, -5.1],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_2x2x2_yellow.gltf",
      "position": [-4.065791, 21.340843, -1.299793],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_slope_6x2x2_yellow.gltf",
      "position": [2.1, 0, 0.000002],
      "rotationQuaternion": [0, -0.70710678, 0, 0.70710678],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-7.036268, 13.899951, -4.15337],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_2x2x2_yellow.gltf",
      "position": [-6.810886, 6.999969, -1.419907],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-7.03627, 11.998667, -4.15337],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/pipe_90_B_yellow.gltf",
      "position": [-5.064908, 3.032889, -2.237993],
      "rotationQuaternion": [-0.70710678, 0, 0, 0.70710678],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-6, 3.999973, 2],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_slope_6x2x2_yellow.gltf",
      "position": [-2.1, 0, 0],
      "rotationQuaternion": [0, 0.70710678, 0, 0.70710678],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-7.036268, 15.898676, -4.15337],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-7.03627, 2, -4.15337],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-7.03627, 7.999946, -4.15337],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_6x6x2_yellow.gltf",
      "position": [-5.999999, 0, -5.999956],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-7.036268, 17.898672, -4.15337],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-7.03627, 4, -4.15337],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-4.065791, 7.79904, -1.299793],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-7.03627, 5.999953, -4.15337],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/structure_C.gltf",
      "position": [-7.036268, 19.880981, -4.15337],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_6x6x1_yellow.gltf",
      "position": [-5.343551, 5.99997, -0.028695],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_6x2x1_yellow.gltf",
      "position": [-4, 0, 0.000001],
      "rotationQuaternion": [0, -0.70710678, 0, 0.70710678],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/arch_yellow.gltf",
      "position": [-2.395664, 0.903577, -0.235565],
      "rotationQuaternion": [0, -0.70710678, 0, 0.70710678],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/flag_B_yellow.gltf",
      "position": [-6.814962, 8.999969, -1.424401],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/pipe_180_B_yellow.gltf",
      "position": [-1.064917, 7.032888, -2.238004],
      "rotationQuaternion": [0, -0.70710678, -0.70710678, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/platform_1x1x1_yellow.gltf",
      "position": [1.5, 0, -3.5],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "neutral/cone.gltf",
      "position": [1.493697, 1, -3.512345],
      "rotationQuaternion": [0, 1, 0, 0],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/signage_arrow_wall_yellow.gltf",
      "position": [-1.964912, 4.393538, -0.238706],
      "rotationQuaternion": [-0.5, -0.5, 0.5, 0.5],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    },
    {
      "path": "yellow/lever_wall_base_B_yellow.gltf",
      "position": [-6.782684, 7.993245, -0.419907],
      "rotationQuaternion": [0, -1e-8, 0, 1],
      "scaling": [1, 1, 1],
      "metadata": {
        "name": "",
        "mass": 0,
        "restitution": 0.5,
        "friction": 0
      }
    }
  ]
},
  [TrackSegmentType.end]: {
    version: 1,
    rootFolderName: 'kay-platformer-pack',
    partList: [
      {
        path: 'yellow/platform_slope_6x6x4_yellow.gltf',
        position: [3.000058, 4.000301, -7.000004],
        rotationQuaternion: [0, 0, 0, 1],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'red/platform_4x4x1_red.gltf',
        position: [4, 0, 18.000006],
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
        path: 'neutral/barrier_4x1x2.gltf',
        position: [3.086762, 1, 21.410679],
        rotationQuaternion: [0, 0, 0, 1],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_1x1x2.gltf',
        position: [5.521604, 1, 17.363321],
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
        path: 'red/platform_2x2x1_red.gltf',
        position: [-3.00001, 0.000006, 15.000022],
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
        path: 'blue/platform_slope_6x6x4_blue.gltf',
        position: [-3.000027, 0, 10.999996],
        rotationQuaternion: [0, 0.70710755, 0, 0.70710602],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'yellow/platform_6x2x1_yellow.gltf',
        position: [2.999967, 0, 21.000023],
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
        path: 'neutral/barrier_4x1x2.gltf',
        position: [5.549201, 1, 19.85232],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'red/platform_6x2x1_red.gltf',
        position: [-3, 0, 20.999901],
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
        path: 'yellow/platform_slope_6x6x4_yellow.gltf',
        position: [-2.999999, 4, -7.000003],
        rotationQuaternion: [0, -3.8e-7, 0, 1],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_6x2x1_green.gltf',
        position: [-5.000009, 0, 17],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_3x1x2.gltf',
        position: [-0.427507, 1, 21.4053],
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
        path: 'neutral/structure_A.gltf',
        position: [-0.068213, 7.853437, -5.33451],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: 'in',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_1x1x2.gltf',
        position: [-5.505769, 1, 14.477631],
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
        path: 'blue/platform_6x2x1_blue.gltf',
        position: [-1, 0, 19.000036],
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
        path: 'blue/platform_slope_6x6x4_blue.gltf',
        position: [2.999997, 0, 11],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710679],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_6x6x4_green.gltf',
        position: [3, 0, -1],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_3x1x2.gltf',
        position: [-5.482131, 1, 16.427025],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'red/platform_slope_6x6x4_red.gltf',
        position: [-3.000058, 0, 4.999998],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_4x4x1_green.gltf',
        position: [0, 0, 16.000044],
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
        path: 'red/platform_slope_6x6x4_red.gltf',
        position: [2.999995, 0, 4.999999],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_1x1x2.gltf',
        position: [-5.437006, 1, 20.564594],
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
        path: 'green/platform_slope_6x6x4_green.gltf',
        position: [-3.000011, 0, -0.999943],
        rotationQuaternion: [0, 0.70710662, 0, 0.70710694],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'yellow/platform_2x2x1_yellow.gltf',
        position: [-2.999988, 0, 16.999996],
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
        path: 'yellow/platform_6x6x4_yellow.gltf',
        position: [3.000058, 0, -7.000004],
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
        path: 'neutral/barrier_3x1x2.gltf',
        position: [5.519746, 1, 15.436629],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'blue/platform_4x2x1_blue.gltf',
        position: [4, 0, 15],
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
        path: 'neutral/barrier_2x1x2.gltf',
        position: [-5.548862, 1, 18.985413],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_4x1x2.gltf',
        position: [-3.892035, 1, 21.448553],
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
        path: 'yellow/platform_6x6x4_yellow.gltf',
        position: [-2.999999, 0, -7.000003],
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
        path: 'neutral/signage_finish_wide.gltf',
        position: [-0.066802, 2.883201, 11.113214],
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
        path: 'neutral/barrier_4x1x2.gltf',
        position: [5.377838, 3.70907, -3.654033],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_4x1x2.gltf',
        position: [-5.33649, 3.70907, -3.654033],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_3x1x1.gltf',
        position: [5.337525, 5.709177, -5.444126],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/barrier_3x1x1.gltf',
        position: [-5.242432, 5.709177, -5.444126],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
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
