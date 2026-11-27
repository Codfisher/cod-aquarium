import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Color3, Effect, Engine, Mesh, ShaderMaterial, StandardMaterial, Vector2 } from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../../composables/use-babylon-scene'
import { BlockId } from '../../block/block-constants'
import {
  STRAND_ROCK_LIST,
  UPPER_FLOOR_Y,
  VALLEY_HEAD_X,
  WATERFALL_HALF_WIDTH,
  WATERFALL_POINT,
  WATERFALL_TOP_Y,
} from './river-layout'

/**
 * 瀑布的水幕
 *
 * 方塊疊出來的流水是一整面平的藍，看不出是白的、摻了空氣的、在往下掉的水。
 * 這裡在那幾排流水的外面貼一層薄薄的、會往下捲的白色水紋，一個網格、一次繪製：
 *
 * - 水紋：三層直條的雜訊以不同速度往下捲，亮的地方是白水、暗的地方透出底下的青
 * - 崖頂：水剛翻過缺口的那一圈是白的（kind 0 的上緣，加上缺口裡一小片往崖邊衝的水紋 kind 2）
 * - 潭面：水幕底部越往下越白越實，落點在潭面上炸開一片翻滾的白沫（kind 1）
 *
 * 避開主瀑布中間突出的兩塊岩，水幕只貼在真正是流水的方塊外面。
 * 顏色吃此刻的光（天光打底、直射光往上加）與場景霧色，夜裡跟著暗下來，不會自己發亮。
 * 與水霧同屬世界層，由 waterfall-mist 建、一起拆
 */

const SHADER_NAME = 'waterfallCurtain'

/** 水幕貼在水方塊東面外面這麼遠，避開與水面同深度的閃爍 */
const FACE_OFFSET = 0.04

/** 潭面（水面頂）比方塊中心高這麼多：與 LIQUID_SURFACE_DROP 的八分之一格同量級，再浮一點避免閃爍 */
const POOL_SURFACE_OFFSET = -0.07

/** 落點的白沫往外鋪多遠（格）、左右多寬 */
const FOAM_REACH = 6.5
const FOAM_HALF_WIDTH = 5.6

/** 光的權重：與水霧一致 */
const AMBIENT_WEIGHT = 0.8
const SUN_WEIGHT = 0.6

/** 水原本與流水的方塊色調（block-constants），這裡換成偏青、淡一點的 */
const WATER_TINT = new Color3(0.72, 0.92, 0.94)
const FLOWING_WATER_TINT = new Color3(0.78, 0.95, 0.96)

const VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec3 span;
uniform mat4 viewProjection;
uniform mat4 view;
varying vec3 vWorld;
varying vec3 vSpan;
varying float vViewDistance;
void main() {
  vWorld = position;
  vSpan = span;
  vViewDistance = length((view * vec4(position, 1.0)).xyz);
  gl_Position = viewProjection * vec4(position, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;
uniform float time;
uniform vec3 lightColor;
uniform vec3 fogColor;
uniform vec2 fogRange;
uniform vec2 footPoint;
varying vec3 vWorld;
varying vec3 vSpan;
varying float vViewDistance;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 smoothed = local * local * (3.0 - 2.0 * local);
  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, smoothed.x), mix(c, d, smoothed.x), smoothed.y);
}

void main() {
  vec3 deepColor = vec3(0.50, 0.78, 0.80);
  vec3 whiteColor = vec3(0.98, 1.0, 1.0);
  vec3 color = deepColor;
  float alpha = 0.0;

  if (vSpan.z < 0.5) {
    /* 水幕：三層直條雜訊往下捲，z 方向細、y 方向長，才是一條一條的水絲 */
    float fall = vWorld.y + time * 9.0;
    float streakA = valueNoise(vec2(vWorld.z * 3.1, fall * 0.22));
    float streakB = valueNoise(vec2(vWorld.z * 7.3 + 13.0, (vWorld.y + time * 12.5) * 0.4));
    float streakC = valueNoise(vec2(vWorld.z * 1.4 + 5.0, (vWorld.y + time * 6.5) * 0.12));
    float streak = streakA * 0.45 + streakB * 0.35 + streakC * 0.2;
    float white = smoothstep(0.3, 0.78, streak);

    /* 水珠：偶爾一點亮得發白的氣泡，跟著水往下掉 */
    float bubble = step(0.93, valueNoise(vec2(vWorld.z * 11.0, (vWorld.y + time * 14.0) * 1.3)));
    white = max(white, bubble);

    float fromTop = vSpan.y - vWorld.y;
    float fromBottom = vWorld.y - vSpan.x;
    /* 崖頂：水剛翻過去，一圈白 */
    float lip = 1.0 - smoothstep(0.0, 2.2, fromTop);
    /* 潭面：越往下摻的空氣越多，越白越實 */
    float churn = valueNoise(vec2(vWorld.z * 4.0, vWorld.y * 2.5 - time * 3.0));
    float base = 1.0 - smoothstep(0.0, 4.5 + churn * 2.0, fromBottom);
    white = clamp(max(white * 0.85, max(lip * 0.9, base)), 0.0, 1.0);

    color = mix(deepColor, whiteColor, 0.2 + white * 0.8);
    alpha = 0.42 + white * 0.46 + base * 0.1;
    /* 頂端與底端各收一小段，免得水幕像一張貼紙有硬邊 */
    alpha *= smoothstep(0.0, 0.35, fromTop) * smoothstep(0.0, 0.2, fromBottom + 0.1 + base * 3.0);
  }
  else if (vSpan.z < 1.5) {
    /* 落點的白沫：離崖腳越遠越碎，翻滾著往外推 */
    float distance = vWorld.x - footPoint.x;
    float reach = clamp(distance / ${FOAM_REACH.toFixed(1)}, 0.0, 1.0);
    float side = abs(vWorld.z - footPoint.y) / ${FOAM_HALF_WIDTH.toFixed(1)};
    float cell = valueNoise(vec2(vWorld.x * 2.2 - time * 1.1, vWorld.z * 2.2 + time * 0.4));
    float fine = valueNoise(vec2(vWorld.x * 5.5 - time * 2.0, vWorld.z * 5.5 - time * 0.7));
    float threshold = mix(0.2, 0.78, reach) + side * 0.25;
    float foam = smoothstep(threshold, threshold + 0.22, cell * 0.65 + fine * 0.4);
    float fade = (1.0 - smoothstep(0.55, 1.0, reach)) * (1.0 - smoothstep(0.6, 1.0, side));
    color = mix(vec3(0.86, 0.97, 0.98), whiteColor, fine);
    alpha = foam * fade * 0.92;
  }
  else {
    /* 崖頂缺口的最後一小段：水加速，白色的水紋往崖邊衝 */
    float rush = valueNoise(vec2(vWorld.z * 3.3, vWorld.x * 0.7 + time * 3.2));
    float rushFine = valueNoise(vec2(vWorld.z * 8.0, vWorld.x * 1.6 + time * 5.0));
    float toLip = smoothstep(0.0, 1.0, (vWorld.x - vSpan.x) / max(vSpan.y - vSpan.x, 0.01));
    float white = smoothstep(0.45 - toLip * 0.25, 0.8, rush * 0.65 + rushFine * 0.35);
    color = mix(deepColor, whiteColor, white);
    alpha = white * (0.35 + toLip * 0.55);
  }

  color *= lightColor;
  float fogRatio = clamp((vViewDistance - fogRange.x) / (fogRange.y - fogRange.x), 0.0, 1.0);
  color = mix(color, fogColor, fogRatio);
  gl_FragColor = vec4(color, alpha * (1.0 - fogRatio * 0.6));
}
`

export interface WaterfallCurtain {
  dispose: () => void;
}

interface CurtainGeometry {
  positionList: number[];
  spanList: number[];
  indexList: number[];
}

/** 加一片面朝 +X（立著）的長方形，z 方向 [z0, z1]、y 方向 [y0, y1] */
function addStandingQuad(geometry: CurtainGeometry, x: number, z0: number, z1: number, y0: number, y1: number, span: [number, number, number]): void {
  const base = geometry.positionList.length / 3
  geometry.positionList.push(x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0)
  for (let index = 0; index < 4; index++) {
    geometry.spanList.push(...span)
  }
  geometry.indexList.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

/** 加一片躺著的長方形，x 方向 [x0, x1]、z 方向 [z0, z1]，高度 y */
function addFlatQuad(geometry: CurtainGeometry, x0: number, x1: number, z0: number, z1: number, y: number, span: [number, number, number]): void {
  const base = geometry.positionList.length / 3
  geometry.positionList.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1)
  for (let index = 0; index < 4; index++) {
    geometry.spanList.push(...span)
  }
  geometry.indexList.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

function buildGeometry(): CurtainGeometry {
  const geometry: CurtainGeometry = { positionList: [], spanList: [], indexList: [] }
  const faceX = VALLEY_HEAD_X + 0.5 + FACE_OFFSET
  const poolY = UPPER_FLOOR_Y + 0.5 + POOL_SURFACE_OFFSET
  const fallZ = WATERFALL_POINT.z

  for (let offsetZ = -WATERFALL_HALF_WIDTH; offsetZ <= WATERFALL_HALF_WIDTH; offsetZ++) {
    const z = fallZ + offsetZ
    /** 兩側那一排的水口低一格 */
    const topY = (Math.abs(offsetZ) === WATERFALL_HALF_WIDTH ? WATERFALL_TOP_Y - 1 : WATERFALL_TOP_Y) + 0.5
    const rock = STRAND_ROCK_LIST.find((item) => item.offsetZ === offsetZ)
    if (!rock) {
      addStandingQuad(geometry, faceX, z - 0.5, z + 0.5, poolY, topY, [poolY, topY, 0])
      continue
    }
    /** 岩的下面一段與上面一段各一片 */
    const rockBottom = UPPER_FLOOR_Y + rock.fromLevel - 0.5
    const rockTop = UPPER_FLOOR_Y + rock.toLevel + 0.5
    addStandingQuad(geometry, faceX, z - 0.5, z + 0.5, poolY, rockBottom, [poolY, rockBottom, 0])
    addStandingQuad(geometry, faceX, z - 0.5, z + 0.5, rockTop, topY, [rockTop, topY, 0])
  }

  /** 崖頂缺口最後兩格往崖邊衝的水紋，兩側水口低的那一排不鋪 */
  const lipX = VALLEY_HEAD_X + 0.5
  addFlatQuad(
    geometry,
    lipX - 3,
    lipX,
    fallZ - WATERFALL_HALF_WIDTH + 1 - 0.5,
    fallZ + WATERFALL_HALF_WIDTH - 1 + 0.5,
    WATERFALL_TOP_Y + 0.5 - 0.06,
    [lipX - 3, lipX, 2],
  )

  /** 落點的白沫 */
  addFlatQuad(
    geometry,
    lipX,
    lipX + FOAM_REACH,
    fallZ - FOAM_HALF_WIDTH,
    fallZ + FOAM_HALF_WIDTH,
    poolY,
    [0, 0, 1],
  )
  return geometry
}

interface WaterMaterialEntry {
  material: StandardMaterial;
  tint: Color3;
}

/** 找出場景裡水與流水的材質（水面那一層與水體各一份） */
function findWaterMaterialList(scene: Scene): WaterMaterialEntry[] {
  const entryList: WaterMaterialEntry[] = []
  for (const material of scene.materials) {
    if (!(material instanceof StandardMaterial))
      continue
    if (material.name.startsWith(`block_${BlockId.FLOWING_WATER}_mat`))
      entryList.push({ material, tint: FLOWING_WATER_TINT })
    else if (material.name.startsWith(`block_${BlockId.WATER}_mat`))
      entryList.push({ material, tint: WATER_TINT })
  }
  return entryList
}

interface CreateWaterfallCurtainParam {
  scene: Scene;
  atmosphere: AtmosphereState;
}

export function createWaterfallCurtain({ scene, atmosphere }: CreateWaterfallCurtainParam): WaterfallCurtain {
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_SHADER
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER

  const geometry = buildGeometry()
  const mesh = new Mesh('waterfall-curtain', scene)
  mesh.setVerticesData('position', geometry.positionList, false, 3)
  mesh.setVerticesData('span', geometry.spanList, false, 3)
  mesh.setIndices(geometry.indexList)
  mesh.isPickable = false
  mesh.alwaysSelectAsActiveMesh = true
  mesh.renderingGroupId = WEATHER_RENDERING_GROUP

  const material = new ShaderMaterial('waterfall-curtain', scene, SHADER_NAME, {
    attributes: ['position', 'span'],
    uniforms: ['viewProjection', 'view', 'time', 'lightColor', 'fogColor', 'fogRange', 'footPoint'],
    needAlphaBlending: true,
  })
  material.backFaceCulling = false
  material.alphaMode = Engine.ALPHA_COMBINE
  material.disableDepthWrite = true
  material.setVector2('footPoint', new Vector2(VALLEY_HEAD_X + 0.5, WATERFALL_POINT.z))
  mesh.material = material

  const light = new Color3()
  let elapsedSecond = 0
  let waterMaterialList = findWaterMaterialList(scene)
  /** 水原本的色調，離開時還回去 */
  const originalTintMap = new Map<StandardMaterial, Color3>()
  let lastSearchSecond = 0
  const fogRange = new Vector2()

  const observer = scene.onBeforeRenderObservable.add(() => {
    elapsedSecond += scene.getEngine().getDeltaTime() / 1000
    const ambient = atmosphere.ambientIntensity * atmosphere.ambientRatio * AMBIENT_WEIGHT
    const sun = atmosphere.lightIntensity * atmosphere.lightRatio * SUN_WEIGHT
    light.set(
      Math.min(1.1, atmosphere.ambientSkyColor.r * ambient + atmosphere.lightColor.r * sun),
      Math.min(1.1, atmosphere.ambientSkyColor.g * ambient + atmosphere.lightColor.g * sun),
      Math.min(1.1, atmosphere.ambientSkyColor.b * ambient + atmosphere.lightColor.b * sun),
    )
    material.setFloat('time', elapsedSecond)
    material.setColor3('lightColor', light)
    material.setColor3('fogColor', scene.fogColor)
    /** ShaderMaterial 沒有 setFloat2（那是 Effect 的），用一個重複利用的 Vector2 傳 */
    fogRange.set(scene.fogStart, scene.fogEnd)
    material.setVector2('fogRange', fogRange)

    /** 水材質可能晚於這裡建好（材質包重載），每隔幾秒重找一次 */
    if (waterMaterialList.length === 0 && elapsedSecond - lastSearchSecond > 2) {
      lastSearchSecond = elapsedSecond
      waterMaterialList = findWaterMaterialList(scene)
    }
    /** 材質包換貼圖時色調會被重設，所以每幀蓋一次；材質只有幾份，不貴 */
    for (const entry of waterMaterialList) {
      if (!originalTintMap.has(entry.material))
        originalTintMap.set(entry.material, entry.material.diffuseColor.clone())
      if (!entry.material.diffuseColor.equals(entry.tint))
        entry.material.diffuseColor.copyFrom(entry.tint)
    }
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      /** 把水的色調還給原本的，換到別的場景不能帶著青色 */
      for (const [target, tint] of originalTintMap) {
        target.diffuseColor.copyFrom(tint)
      }
      mesh.dispose(false, false)
      material.dispose()
    },
  }
}
