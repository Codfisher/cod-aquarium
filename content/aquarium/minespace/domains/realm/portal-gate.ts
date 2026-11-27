import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../weather/atmosphere'
import type { RealmDefinition, RealmPortal, RealmText } from './realm-definition'
import {
  Color3,
  Constants,
  DynamicTexture,
  Effect,
  Mesh,
  MeshBuilder,
  ShaderMaterial,
  StandardMaterial,
  Texture,
  Vector2,
} from '@babylonjs/core'
import { watch } from 'vue'
import { createSeededRandom } from '../../utils/noise'
import { renderSettings } from '../render-host/render-settings'
import {
  PORTAL_CLEAR_HALF_WIDTH,
  PORTAL_OPENING_HEIGHT,
  SIGN_FACING_OFFSET_MAP,
} from './portal-terrain'
import { getRealm } from './realm-list'

/**
 * 傳送門的霧面與木牌（渲染端的部分）
 *
 * 門框與木牌的柱子是方塊，地形 worker 生的（見 portal-terrain）。
 * 這裡建的是門洞裡那片緩慢流動的霧，以及釘在柱子上的那片薄木牌。
 * 兩者都屬於世界層：換場景時跟著拆
 */

/** 霧面的寬與高（格），貼著兩根門柱的內緣與島木的底面 */
const MIST_WIDTH = PORTAL_CLEAR_HALF_WIDTH * 2
const MIST_HEIGHT = PORTAL_OPENING_HEIGHT

const MIST_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec2 vUV;
varying vec3 vPositionW;

void main() {
  vec4 positionW = world * vec4(position, 1.0);
  vUV = uv;
  vPositionW = positionW.xyz;
  gl_Position = viewProjection * positionW;
}
`

const MIST_FRAGMENT = `
precision highp float;
varying vec2 vUV;
varying vec3 vPositionW;

uniform float time;
uniform vec3 mistColor;
/** ShaderMaterial 看到這個名字會自己把鏡頭位置填進來 */
uniform vec3 cameraPosition;
uniform vec3 sceneFogColor;
uniform vec2 sceneFogRange;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 blend = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(hash(cell), hash(cell + vec2(1.0, 0.0)), blend.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), blend.x),
    blend.y
  );
}

float fbm(vec2 point) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int index = 0; index < 4; index++) {
    total += valueNoise(point) * amplitude;
    point *= 2.07;
    amplitude *= 0.5;
  }
  return total;
}

void main() {
  /**
   * 霧面在門洞裡緩緩往上捲
   *
   * 兩層噪音以不同速度流動、再互相推擠，才不像一張貼圖在平移。
   * 量化成八階：整個世界都是一格一格的像素，只有這片霧是平滑的會很突兀
   */
  vec2 point = vec2(vUV.x * ${MIST_WIDTH.toFixed(2)}, vUV.y * ${MIST_HEIGHT.toFixed(2)});
  vec2 warp = vec2(fbm(point * 0.6 + vec2(0.0, -time * 0.12)), fbm(point * 0.6 + vec2(5.2, -time * 0.09)));
  float swirl = fbm(point * 0.9 + warp * 1.6 + vec2(time * 0.04, -time * 0.18));
  swirl = floor(swirl * 8.0) / 8.0;

  /**
   * 四邊淡出，貼著門框的那一圈是透明的，霧才像是在門洞裡而不是一塊板子
   *
   * 淡出只留三分之一格。門縮小之後門洞只有一格半寬，原本九分之十格的淡出
   * 從兩邊一夾，整片霧沒有一處是滿的，加上底色只有兩成，白天幾乎看不出門洞裡有東西
   */
  float border = min(min(vUV.x, 1.0 - vUV.x) * ${MIST_WIDTH.toFixed(2)}, min(vUV.y, 1.0 - vUV.y) * ${MIST_HEIGHT.toFixed(2)});
  float edgeFade = smoothstep(0.0, 0.32, border);

  /** 底色加厚到五成：霧照樣在捲，但門洞是一片看得出來的東西，遠遠就知道那是一道門 */
  float alpha = (0.5 + swirl * 0.42) * edgeFade;
  vec3 color = mistColor * (0.78 + swirl * 0.34);

  /** 與場景同一條線性霧，遠遠看過去照樣融進霧裡 */
  float distance = length(vPositionW - cameraPosition);
  float fogRatio = clamp((sceneFogRange.y - distance) / max(sceneFogRange.y - sceneFogRange.x, 0.001), 0.0, 1.0);
  color = mix(sceneFogColor, color, fogRatio);

  gl_FragColor = vec4(color, alpha);
}
`

const MIST_SHADER_NAME = 'minespacePortalMist'

/**
 * 霧面自己帶的光
 *
 * 原本只給零點零八，夜裡門洞跟著霧色一起暗下去，整道門只剩一個黑框。
 * 門該是一眼認得出來的東西：霧面自己亮，門框上還有會發光的燈箱與提燈（見 portal-terrain 的 placePortalLights）
 */
const MIST_SELF_GLOW = 0.32

/**
 * 木牌的尺寸（格）
 *
 * 一片一格半寬、四分之三格高的薄板，釘在兩格高的木樁朝外那一面。
 * 底緣離地一格、頂緣一格七五，與眼睛（一格六二）差不多高，站在牌前不必低頭；
 * 柱頭再冒出牌面四分之一格，看得出牌子是釘在柱上的
 */
const SIGN_BOARD_WIDTH = 1.5
const SIGN_BOARD_HEIGHT = 0.75
const SIGN_BOARD_THICKNESS = 0.06
const SIGN_BOARD_BOTTOM = 1
/** 木樁的半寬（WOOD_POST 的 0.42 的一半），牌面貼在它外面 */
const SIGN_POST_HALF_THICKNESS = 0.21

/** 牌面貼圖的大小，與牌面同為二比一 */
const SIGN_TEXTURE_WIDTH = 512
const SIGN_TEXTURE_HEIGHT = 256

/**
 * 牌面的木紋
 *
 * 貼圖上先畫一層木紋再寫字：木紋用與方塊同樣粗的像素格（一格十六個像素，牌面二十四乘十二），
 * 每格亮度差一點，每四排一道深色的板縫，看起來是三片木板拼的。
 * 不借材質包的木板貼圖：換材質包要跟著換，而且那張圖的對比太強，字壓在上面讀不出來
 */
const SIGN_WOOD_COLUMN_COUNT = 24
const SIGN_WOOD_ROW_COUNT = 12
const SIGN_WOOD_COLOR = { r: 168, g: 128, b: 86 }
/** 板子側邊與背面的顏色，比牌面暗一點（線性） */
const SIGN_EDGE_COLOR = new Color3(0.24, 0.15, 0.08)

/**
 * 字的字型
 *
 * worker 裡的 OffscreenCanvas 只認得系統字型，網頁載入的字型進不來，
 * 所以列一串各平台都有的黑體，最後退回 sans-serif
 */
const SIGN_FONT_FAMILY = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif'

export interface PortalGateList {
  dispose: () => void;
}

interface CreatePortalGateListParam {
  scene: Scene;
  realm: RealmDefinition;
  atmosphere: AtmosphereState;
}

/** 牌面朝向換算成平面的旋轉：平面預設面朝 -Z（北） */
const FACING_ROTATION_MAP = {
  north: 0,
  south: Math.PI,
  east: -Math.PI / 2,
  west: Math.PI / 2,
} as const

function createMistMaterial(scene: Scene, name: string): ShaderMaterial {
  Effect.ShadersStore[`${MIST_SHADER_NAME}VertexShader`] = MIST_VERTEX
  Effect.ShadersStore[`${MIST_SHADER_NAME}FragmentShader`] = MIST_FRAGMENT

  const material = new ShaderMaterial(name, scene, MIST_SHADER_NAME, {
    attributes: ['position', 'uv'],
    uniforms: ['world', 'viewProjection', 'time', 'mistColor', 'cameraPosition', 'sceneFogColor', 'sceneFogRange'],
    needAlphaBlending: true,
  })
  material.backFaceCulling = false
  material.disableDepthWrite = true
  material.alphaMode = Constants.ALPHA_COMBINE

  return material
}

/**
 * 把一行字縮到放得下
 *
 * 英文比中文長，同一個字級可能超出牌面。從給定的字級往下縮，量到放得下為止，
 * 但不低於 minSize：再小就讀不出來了。木牌上的字因此都寫得短（見 RealmDefinition 的 signCaption），
 * 正常情況不會縮到底
 */
function fitFontSize(
  context: ReturnType<DynamicTexture['getContext']>,
  text: string,
  maxWidth: number,
  fontSize: number,
  minSize: number,
  weight: string,
): number {
  let size = fontSize
  while (size > minSize) {
    context.font = `${weight} ${size}px ${SIGN_FONT_FAMILY}`
    if (context.measureText(text).width <= maxWidth)
      break
    size -= 2
  }
  context.font = `${weight} ${size}px ${SIGN_FONT_FAMILY}`
  return size
}

/**
 * 牌面的木紋
 *
 * 種子固定，每次重畫（換語言）木紋都一樣，只有字在換
 */
function drawSignWood(context: ReturnType<DynamicTexture['getContext']>): void {
  const random = createSeededRandom('portal-sign-wood')
  const cellWidth = SIGN_TEXTURE_WIDTH / SIGN_WOOD_COLUMN_COUNT
  const cellHeight = SIGN_TEXTURE_HEIGHT / SIGN_WOOD_ROW_COUNT

  for (let row = 0; row < SIGN_WOOD_ROW_COUNT; row++) {
    /** 每片板子的底色差一點，板與板之間看得出是分開的 */
    const plankShade = 0.94 + (Math.floor(row / 4) % 3) * 0.04
    for (let column = 0; column < SIGN_WOOD_COLUMN_COUNT; column++) {
      const shade = plankShade * (0.93 + random() * 0.12) * (row % 4 === 3 ? 0.72 : 1)
      context.fillStyle = `rgb(${Math.round(SIGN_WOOD_COLOR.r * shade)}, ${Math.round(SIGN_WOOD_COLOR.g * shade)}, ${Math.round(SIGN_WOOD_COLOR.b * shade)})`
      context.fillRect(Math.floor(column * cellWidth), Math.floor(row * cellHeight), Math.ceil(cellWidth), Math.ceil(cellHeight))
    }
  }
}

/**
 * 畫牌面：木紋，再寫上目的地的名字與一句短語
 *
 * 字是深褐的墨色，外面先描一圈粗的淡米色邊：木紋的明暗與字色接近，
 * 不描邊的話副標在陰影裡就糊進木頭。描邊先畫、字後畫，邊才不會吃進筆畫裡；
 * 邊寬照字級算，大字小字看起來一樣粗細
 */
function drawSignFace(texture: DynamicTexture, title: RealmText, caption: RealmText, locale: 'zh-hant' | 'en'): void {
  const context = texture.getContext()
  drawSignWood(context)

  const maxWidth = SIGN_TEXTURE_WIDTH * 0.88
  context.lineJoin = 'round'
  context.fillStyle = 'rgba(46, 26, 12, 0.96)'
  context.strokeStyle = 'rgba(255, 245, 225, 0.9)'

  const drawCentered = (text: string, baselineY: number, size: number) => {
    const width = context.measureText(text).width
    const x = (SIGN_TEXTURE_WIDTH - width) / 2
    context.lineWidth = Math.max(4, size * 0.16)
    context.strokeText(text, x, baselineY)
    context.fillText(text, x, baselineY)
  }

  const titleSize = fitFontSize(context, title[locale], maxWidth, 104, 64, '700')
  drawCentered(title[locale], SIGN_TEXTURE_HEIGHT * 0.5, titleSize)

  const captionSize = fitFontSize(context, caption[locale], maxWidth, 50, 40, '600')
  drawCentered(caption[locale], SIGN_TEXTURE_HEIGHT * 0.84, captionSize)

  texture.update(true, true)
}

/** 一座門的霧面：一片雙面的平面，填滿門洞 */
function createMistPlane(scene: Scene, portal: RealmPortal, material: ShaderMaterial): Mesh {
  const plane = MeshBuilder.CreatePlane(`portal-mist-${portal.targetRealmId}`, {
    width: MIST_WIDTH,
    height: MIST_HEIGHT,
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene)
  plane.material = material
  /** 門洞從腳下那一格的底面（portal.y - 0.5）一路到島木的底面 */
  plane.position.set(portal.x, portal.y - 0.5 + MIST_HEIGHT / 2, portal.z)
  if (portal.spanAxis === 'z') {
    plane.rotation.y = Math.PI / 2
  }
  plane.isPickable = false
  return plane
}

/** 牌面與板身共用的材質設定：與方塊材質一致，夜裡的補光與燈火才照得到 */
function createSignMaterial(scene: Scene, name: string): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  material.specularColor = new Color3(0, 0, 0)
  material.ambientColor = new Color3(1, 1, 1)
  material.maxSimultaneousLights = 6
  return material
}

/**
 * 一塊木牌：一片薄板加上貼在正面的牌面
 *
 * 板身是一個薄盒子（側邊與背面是素的深褐），正面再貼一片畫了木紋與字的平面，
 * 離板面半公分，避開與板面打架（z-fighting）
 */
function createSign(
  scene: Scene,
  portal: RealmPortal,
  texture: DynamicTexture,
): { meshList: Mesh[]; materialList: StandardMaterial[] } | null {
  const { sign } = portal
  if (!sign)
    return null

  const offset = SIGN_FACING_OFFSET_MAP[sign.facing]
  const rotation = FACING_ROTATION_MAP[sign.facing]
  const centerY = portal.y - 0.5 + SIGN_BOARD_BOTTOM + SIGN_BOARD_HEIGHT / 2
  const boardDistance = SIGN_POST_HALF_THICKNESS + SIGN_BOARD_THICKNESS / 2

  const boardMaterial = createSignMaterial(scene, `portal-sign-board-${portal.targetRealmId}`)
  boardMaterial.diffuseColor = SIGN_EDGE_COLOR
  const board = MeshBuilder.CreateBox(`portal-sign-board-${portal.targetRealmId}`, {
    width: SIGN_BOARD_WIDTH,
    height: SIGN_BOARD_HEIGHT,
    depth: SIGN_BOARD_THICKNESS,
  }, scene)
  board.material = boardMaterial
  board.position.set(sign.x + offset.x * boardDistance, centerY, sign.z + offset.z * boardDistance)
  board.rotation.y = rotation

  const faceMaterial = createSignMaterial(scene, `portal-sign-face-${portal.targetRealmId}`)
  faceMaterial.diffuseTexture = texture
  const face = MeshBuilder.CreatePlane(`portal-sign-face-${portal.targetRealmId}`, {
    width: SIGN_BOARD_WIDTH,
    height: SIGN_BOARD_HEIGHT,
  }, scene)
  face.material = faceMaterial
  const faceDistance = boardDistance + SIGN_BOARD_THICKNESS / 2 + 0.005
  face.position.set(sign.x + offset.x * faceDistance, centerY, sign.z + offset.z * faceDistance)
  face.rotation.y = rotation

  const meshList = [board, face]
  for (const mesh of meshList) {
    mesh.isPickable = false
    mesh.receiveShadows = true
  }

  return { meshList, materialList: [boardMaterial, faceMaterial] }
}

/**
 * 建立這個場景所有傳送門的霧面與木牌
 *
 * 霧色是目的地轉場的霧色，乘在此刻日夜的基準霧色上：
 * 從門洞望進去看到的，就是穿過去那一刻會被吞進去的那種霧。
 * 木牌的字跟著介面語言換，語言一變就重畫
 */
export function createPortalGateList({ scene, realm, atmosphere }: CreatePortalGateListParam): PortalGateList {
  const meshList: Mesh[] = []
  const materialList: (ShaderMaterial | StandardMaterial)[] = []
  const signList: { texture: DynamicTexture; target: RealmDefinition }[] = []
  const mistList: { material: ShaderMaterial; target: RealmDefinition }[] = []

  for (const portal of realm.portalList) {
    const target = getRealm(portal.targetRealmId)

    const mistMaterial = createMistMaterial(scene, `portal-mist-${realm.id}-${target.id}`)
    materialList.push(mistMaterial)
    mistList.push({ material: mistMaterial, target })
    meshList.push(createMistPlane(scene, portal, mistMaterial))

    const texture = new DynamicTexture(
      `portal-sign-${realm.id}-${target.id}`,
      { width: SIGN_TEXTURE_WIDTH, height: SIGN_TEXTURE_HEIGHT },
      scene,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
    )
    drawSignFace(texture, target.title, target.signCaption, renderSettings.locale)
    signList.push({ texture, target })

    const sign = createSign(scene, portal, texture)
    if (sign) {
      meshList.push(...sign.meshList)
      materialList.push(...sign.materialList)
    }
  }

  const stopLocaleWatch = watch(() => renderSettings.locale, (locale) => {
    for (const { texture, target } of signList) {
      drawSignFace(texture, target.title, target.signCaption, locale)
    }
  })

  let elapsedSecond = 0
  const mistColor = new Color3()
  const fogRange = new Vector2()
  const observer = mistList.length === 0
    ? null
    : scene.onBeforeRenderObservable.add(() => {
        elapsedSecond += scene.getEngine().getDeltaTime() / 1000
        fogRange.set(scene.fogStart, scene.fogEnd)

        for (const { material, target } of mistList) {
          const [tintR, tintG, tintB] = target.transition.fogTint
          const base = atmosphere.baseFogColor
          mistColor.set(
            Math.min(1, base.r * tintR + MIST_SELF_GLOW * tintR),
            Math.min(1, base.g * tintG + MIST_SELF_GLOW * tintG),
            Math.min(1, base.b * tintB + MIST_SELF_GLOW * tintB),
          )
          material.setFloat('time', elapsedSecond)
          material.setColor3('mistColor', mistColor)
          material.setColor3('sceneFogColor', scene.fogColor)
          material.setVector2('sceneFogRange', fogRange)
        }
      })

  return {
    dispose() {
      stopLocaleWatch()
      if (observer) {
        scene.onBeforeRenderObservable.remove(observer)
      }
      for (const mesh of meshList) {
        mesh.dispose()
      }
      /** 連貼圖一起收：牌面的 DynamicTexture 只掛在它自己那份材質上 */
      for (const material of materialList) {
        material.dispose(false, true)
      }
    },
  }
}
