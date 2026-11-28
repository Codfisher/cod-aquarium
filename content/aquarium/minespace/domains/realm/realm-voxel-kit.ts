import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../weather/atmosphere'
import type { SignatureFrame } from './realm-signature-kit'
import { Color3, Constants, Effect, Mesh, ShaderMaterial, Vector3, VertexData } from '@babylonjs/core'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'
import { optOutOfFog } from '../renderer/fog-opt-out'
import { updateSignatureFrame } from './realm-signature-kit'

/**
 * 體素風布景物的共用零件（渲染端）
 *
 * 方塊世界外面那些「走不到、只遠遠看」的實體（飛鳥、天燈這一類），第一版都是永遠正對鏡頭的像素方片。
 * 方片沒有厚度、沒有朝向、整片一個顏色，遠近只剩大小一個線索，看起來像貼在天上的貼紙
 * （使用者：「用像素看不出距離，改成實體的立體物體，走體素風格」）。
 *
 * 規矩：是一個「東西」就用方盒拼，是光、煙、水、雲才留方片或柔邊。體素風的做法：
 * - 形體是物體自己座標系裡軸對齊的方盒，一階一階的落差看得出來，不做斜面與圓弧
 * - 每個面一個法線、整面同一個明暗（天光看法線朝上多少、直射光看朝著太陽多少），面裡面不做漸層
 * - 一格體素在平常的觀看距離要有幾個畫面像素；小到分不出面的東西不值得改
 * - 照離鏡頭的實際距離往地平線色混，轉場時跟著 veilRatio 化進霧色
 * - 整群一個網格、一次繪製：每一隻的位置、朝向與動作都在頂點著色器裡照時間算，CPU 不追蹤
 *
 * 這裡放三樣：
 * - 把「一份方盒清單 × 好幾隻」攤成頂點的純函式（buildVoxelFlockGeometry），可以單獨測
 * - 幾段 GLSL：面的法線、翅膀的關節、打光與混霧
 * - 一層體素布景（createVoxelPropLayer）：建材質、每幀寫共用的光與霧、看不到時整個網格停用
 *
 * 頂點的擺法與石殿遺址的飛鳥（ruins-colossi.ts）相同，那邊是這套做法的原型
 */

/** 布景那一層（與 backdrop 的山稜同一層）：地形的深度已經寫好，被擋住的部分照樣不畫 */
const BACKDROP_RENDERING_GROUP = 1

/** 與山稜、巨像同一組光的權重：天光是主體，直射光補一點 */
const AMBIENT_WEIGHT = 0.95
const SUN_WEIGHT = 0.55

/** 可見度低於這個值就整個網格停用，省掉那一次繪製 */
const VISIBILITY_EPSILON = 0.002

/** 方盒的六個面：法線軸與方向。順序要與 GLSL_VOXEL_FACE_NORMAL 的編號一致 */
export const VOXEL_FACE_LIST = [
  { axis: 0, sign: 1 },
  { axis: 0, sign: -1 },
  { axis: 1, sign: 1 },
  { axis: 1, sign: -1 },
  { axis: 2, sign: 1 },
  { axis: 2, sign: -1 },
] as const

/** 面上兩個切線軸各取 min（0）或 max（1）的四個角 */
const FACE_CORNER_LIST = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const

export type VoxelTriple = readonly [number, number, number]

/** 一個方盒：座標是物體自己的體素格，頭朝 +x、上是 +y */
export interface VoxelBox {
  min: VoxelTriple;
  max: VoxelTriple;
  /** 部位，寫進 uv.x：著色器照它決定這個方盒怎麼動（零是不動的身體） */
  part: number;
  /** 寫進 uv.y：成對的部位在哪一邊（右 1、左 -1），不成對的給 0 */
  side: number;
  /** 顏色的編號，寫進 uv2.y：片段著色器照它挑顏色 */
  tone: number;
  /** 只畫這幾個面（VOXEL_FACE_LIST 的編號）；薄片的側邊小到看不見時省掉，不給就六面都畫 */
  faceIndexList?: readonly number[];
}

/** 一隻（一盞）：整隻的每個頂點都帶同一份錨點與參數 */
export interface VoxelInstance {
  /** 錨點（世界座標），寫進 position */
  anchor: VoxelTriple;
  /** 四個自訂參數，寫進 color（半徑、速度、相位這一類），意思由各自的頂點著色器決定 */
  param: readonly [number, number, number, number];
}

/**
 * 攤開之後的頂點資料
 *
 * position 是錨點、normal 這個屬性挪去放「頂點在物體身上的位置」（真正的法線要跟著部位轉，在著色器裡由面的編號查）、
 * color 是每隻的參數、uv 是（部位、哪一邊）、uv2 是（面的編號、顏色的編號）
 */
export interface VoxelFlockGeometry {
  positionList: number[];
  localList: number[];
  colorList: number[];
  uvList: number[];
  uv2List: number[];
  indexList: number[];
}

/** 一份方盒清單會攤出幾個面 */
export function countVoxelFace(boxList: readonly VoxelBox[]): number {
  return boxList.reduce((total, box) => total + (box.faceIndexList?.length ?? VOXEL_FACE_LIST.length), 0)
}

/** 一份方盒清單的外框（體素格） */
export function measureVoxelBounds(boxList: readonly VoxelBox[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  for (const box of boxList) {
    for (const axis of [0, 1, 2] as const) {
      min[axis] = Math.min(min[axis], box.min[axis])
      max[axis] = Math.max(max[axis], box.max[axis])
    }
  }
  return { min, max }
}

/** 把「一份方盒清單 × 好幾隻」攤成頂點：每個面四個頂點、兩個三角形 */
export function buildVoxelFlockGeometry(boxList: readonly VoxelBox[], instanceList: readonly VoxelInstance[]): VoxelFlockGeometry {
  const geometry: VoxelFlockGeometry = { positionList: [], localList: [], colorList: [], uvList: [], uv2List: [], indexList: [] }

  for (const instance of instanceList) {
    for (const box of boxList) {
      const faceIndexList = box.faceIndexList ?? VOXEL_FACE_LIST.map((_, index) => index)
      for (const faceIndex of faceIndexList) {
        const face = VOXEL_FACE_LIST[faceIndex]!
        const baseIndex = geometry.positionList.length / 3
        const firstAxis = (face.axis + 1) % 3
        const secondAxis = (face.axis + 2) % 3
        for (const [firstCorner, secondCorner] of FACE_CORNER_LIST) {
          const local: [number, number, number] = [0, 0, 0]
          local[face.axis] = face.sign > 0 ? box.max[face.axis]! : box.min[face.axis]!
          local[firstAxis] = firstCorner === 1 ? box.max[firstAxis]! : box.min[firstAxis]!
          local[secondAxis] = secondCorner === 1 ? box.max[secondAxis]! : box.min[secondAxis]!
          geometry.positionList.push(instance.anchor[0], instance.anchor[1], instance.anchor[2])
          geometry.localList.push(local[0], local[1], local[2])
          geometry.colorList.push(instance.param[0], instance.param[1], instance.param[2], instance.param[3])
          geometry.uvList.push(box.part, box.side)
          geometry.uv2List.push(faceIndex, box.tone)
        }
        geometry.indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
      }
    }
  }
  return geometry
}

/** 把攤好的頂點資料做成網格 */
export function createVoxelFlockMesh(scene: Scene, name: string, geometry: VoxelFlockGeometry): Mesh {
  const mesh = new Mesh(name, scene)
  const vertexData = new VertexData()
  vertexData.positions = geometry.positionList
  vertexData.normals = geometry.localList
  vertexData.colors = geometry.colorList
  vertexData.uvs = geometry.uvList
  vertexData.uvs2 = geometry.uv2List
  vertexData.indices = geometry.indexList
  vertexData.applyToMesh(mesh)
  return mesh
}

/** 由面的編號查法線，編號與 VOXEL_FACE_LIST 同一份 */
export const GLSL_VOXEL_FACE_NORMAL = `
vec3 getVoxelFaceNormal(float faceIndex) {
  if (faceIndex < 0.5) return vec3(1.0, 0.0, 0.0);
  if (faceIndex < 1.5) return vec3(-1.0, 0.0, 0.0);
  if (faceIndex < 2.5) return vec3(0.0, 1.0, 0.0);
  if (faceIndex < 3.5) return vec3(0.0, -1.0, 0.0);
  if (faceIndex < 4.5) return vec3(0.0, 0.0, 1.0);
  return vec3(0.0, 0.0, -1.0);
}
`

/** 部位的編號：不動的身體、翅膀內節、翅膀外節。寫進 VoxelBox.part，著色器照它決定怎麼轉 */
export const VOXEL_WING_PART = { body: 0, innerWing: 1, outerWing: 2 } as const

/** 翅膀的關節：翅根離身體中線多遠、翅膀底面的高度、內節多長（都是體素格） */
export interface VoxelWingJoint {
  shoulderOffset: number;
  baseY: number;
  innerLength: number;
}

/**
 * 翅膀的關節（頂點著色器用）
 *
 * 翅膀的方盒第三軸放的是「離翅根多遠」，一律從零往外，左右兩隻共用同一份形狀、由 side 決定翻到哪一邊。
 * 外節先繞內節末端轉，再整隻翅膀繞翅根轉；法線跟著轉，翻起來的翅面才會換明暗。
 * 整節方盒繞著關節轉、方盒本身不變形，像方塊生物那樣
 */
export function createVoxelWingGlsl(joint: VoxelWingJoint): string {
  const baseY = joint.baseY.toFixed(3)
  const innerLength = joint.innerLength.toFixed(3)
  const shoulderOffset = joint.shoulderOffset.toFixed(3)
  return `
/** 在（高度、離翅根的距離）這個平面上轉：角度為正時外端往上抬 */
vec2 liftVoxelWing(vec2 point, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(point.x * c + point.y * s, point.y * c - point.x * s);
}

void poseVoxelWing(inout vec3 local, inout vec3 faceNormal, float part, float side, float innerAngle, float outerAngle) {
  if (part < 0.5) return;
  vec2 lifted = vec2(local.y - ${baseY}, local.z);
  vec2 liftedNormal = faceNormal.yz;
  if (part > 1.5) {
    lifted.y -= ${innerLength};
    lifted = liftVoxelWing(lifted, outerAngle);
    lifted.y += ${innerLength};
    liftedNormal = liftVoxelWing(liftedNormal, outerAngle);
  }
  lifted = liftVoxelWing(lifted, innerAngle);
  liftedNormal = liftVoxelWing(liftedNormal, innerAngle);
  local = vec3(local.x, lifted.x + ${baseY}, (lifted.y + ${shoulderOffset}) * side);
  faceNormal = vec3(faceNormal.x, liftedNormal.x, liftedNormal.y * side);
}
`
}

/**
 * 體素布景共用的 uniform 與打光（片段著色器用）
 *
 * shadeVoxel：天光加直射光。這些東西多半是從底下往上看，腹面不能全黑，
 * 朝下的面留四成半天光（地面反上來的光），朝上的面全給。
 * hazeVoxel：照離鏡頭的實際距離往地平線色混，近的深、遠的淡，這是看出前後的主要線索
 */
export const GLSL_VOXEL_LIGHT = `
uniform vec3 ambientLight;
uniform vec3 sunLight;
uniform vec3 sunDirection;
uniform vec3 horizonColor;
uniform vec3 eyePosition;
uniform float veilRatio;
uniform float strength;

vec3 shadeVoxel(vec3 albedo, vec3 normal) {
  float skyFacing = 0.45 + 0.55 * (0.5 + 0.5 * normal.y);
  float sunFacing = max(dot(normal, sunDirection), 0.0);
  return albedo * (ambientLight * skyFacing + sunLight * sunFacing);
}

vec3 hazeVoxel(vec3 color, vec3 world, float nearDistance, float farDistance, float nearHaze, float farHaze) {
  float haze = mix(nearHaze, farHaze, smoothstep(nearDistance, farDistance, length(world - eyePosition)));
  return mix(color, horizonColor, max(haze, veilRatio));
}
`

interface VoxelPropLayerParam {
  scene: Scene;
  atmosphere: AtmosphereState;
  /** 網格與材質的名字 */
  name: string;
  /** 著色器在 ShadersStore 裡的名字，全專案不能重複 */
  shaderName: string;
  vertexSource: string;
  fragmentSource: string;
  /** 共用那幾個以外還用到的 uniform */
  uniformList?: string[];
  mesh: Mesh;
  /** 交代它跳出霧之後怎麼收（見 fog-opt-out） */
  fogHandling: string;
  /**
   * 每幀呼叫：寫自己的 uniform，回傳此刻的可見度（零到一）
   *
   * 可見度會被寫進 strength（片段著色器拿去當透明度）；低於門檻就整個網格停用
   */
  update: (frame: SignatureFrame, material: ShaderMaterial) => number;
}

/**
 * 建一層體素布景
 *
 * 與招牌景象那一層（createSignatureLayer）的差別：這裡畫的是實體，所以寫深度
 * （方盒互相擋、同一隻的翅膀與身體互相擋都靠它），畫在布景那一層，光與霧每幀由這裡寫好。
 * 材質仍然走半透明佇列：出現與消失要能淡入淡出；體積雲在同一層排在最前面畫，這些東西蓋在雲上、被陰天罩蓋住。
 *
 * 共用的 uniform：viewProjection、time、strength、ambientLight、sunLight、sunDirection、
 * horizonColor、eyePosition、veilRatio。回傳的 dispose 把觀察者、網格與材質都收掉
 */
export function createVoxelPropLayer(param: VoxelPropLayerParam): { dispose: () => void } {
  const { scene, atmosphere, mesh } = param
  Effect.ShadersStore[`${param.shaderName}VertexShader`] = param.vertexSource
  Effect.ShadersStore[`${param.shaderName}FragmentShader`] = param.fragmentSource

  const material = new ShaderMaterial(param.name, scene, param.shaderName, {
    attributes: ['position', 'normal', 'color', 'uv', 'uv2'],
    uniforms: [
      'viewProjection',
      'time',
      'strength',
      'ambientLight',
      'sunLight',
      'sunDirection',
      'horizonColor',
      'eyePosition',
      'veilRatio',
      ...(param.uniformList ?? []),
    ],
    needAlphaBlending: true,
  })
  /** 方盒的繞向沒有整理過，兩面都畫；有深度擋著，背面不會蓋到正面 */
  material.backFaceCulling = false
  material.alphaMode = Constants.ALPHA_COMBINE
  /** 半透明佇列預設不寫深度，這裡是實體，要寫 */
  material.forceDepthWrite = true

  mesh.material = material
  mesh.isPickable = false
  /** 頂點是著色器算的，網格自己的包圍盒沒有意義 */
  mesh.alwaysSelectAsActiveMesh = true
  mesh.renderingGroupId = BACKDROP_RENDERING_GROUP
  optOutOfFog(mesh, param.fogHandling)
  mesh.setEnabled(false)

  const { state: devToggle } = useDevToggles()
  const { preset } = useGraphicsQuality()
  const frame: SignatureFrame = {
    elapsed: 0,
    deltaSecond: 0,
    sunDirection: new Vector3(0, 1, 0),
    sunHeight: 1,
    outdoorRatio: 1,
    clearRatio: 1,
    darkRatio: 0,
    nightRatio: 0,
    dayRatio: 1,
    twilightRatio: 0,
    detailRatio: 1,
    moonLightRatio: 1,
    cameraPosition: new Vector3(),
  }
  const ambientLight = new Color3()
  const sunLight = new Color3()

  const observer = scene.onBeforeRenderObservable.add(() => {
    frame.deltaSecond = scene.getEngine().getDeltaTime() / 1000
    frame.elapsed += frame.deltaSecond
    updateSignatureFrame(frame, atmosphere)
    frame.detailRatio = preset.value.particleRatio
    if (scene.activeCamera) {
      frame.cameraPosition.copyFrom(scene.activeCamera.globalPosition)
    }

    const visibility = devToggle.realmSignature ? param.update(frame, material) : 0
    mesh.setEnabled(visibility > VISIBILITY_EPSILON)

    const ambient = atmosphere.ambientIntensity * atmosphere.ambientRatio * AMBIENT_WEIGHT
    const sun = atmosphere.lightIntensity * atmosphere.lightRatio * SUN_WEIGHT
    ambientLight.set(atmosphere.ambientSkyColor.r * ambient, atmosphere.ambientSkyColor.g * ambient, atmosphere.ambientSkyColor.b * ambient)
    sunLight.set(atmosphere.lightColor.r * sun, atmosphere.lightColor.g * sun, atmosphere.lightColor.b * sun)
    material.setFloat('time', frame.elapsed)
    material.setFloat('strength', visibility)
    material.setColor3('ambientLight', ambientLight)
    material.setColor3('sunLight', sunLight)
    material.setVector3('sunDirection', atmosphere.sunDirection)
    material.setColor3('horizonColor', atmosphere.fogColor)
    material.setVector3('eyePosition', frame.cameraPosition)
    /** 與山稜、巨像同一個係數：轉場的霧還沒蓋滿之前，這些東西就已經化進霧色 */
    material.setFloat('veilRatio', Math.min(1, atmosphere.edgeRatio * 1.6))
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      mesh.dispose()
      material.dispose(false, true)
    },
  }
}
