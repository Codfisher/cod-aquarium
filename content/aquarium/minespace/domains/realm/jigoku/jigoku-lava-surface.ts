import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Color3, Effect, Mesh, RawTexture, ShaderMaterial, Texture, Vector2 } from '@babylonjs/core'
import { BlockId, isLavaBlock } from '../../block/block-constants'
import { getBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { samplePathCurve } from '../land-realm-kit'
import { JIGOKU_CENTER, LAKE_Y, LAVA_FALL_LIST, LAVA_RIVER_LIST, LAVA_SPATTER_POINT_LIST, LAVA_SURFACE_Y } from './jigoku-layout'

/**
 * 熔岩湖的湖面（渲染端，屬於世界層）
 *
 * 熔岩方塊的貼圖是十六格像素的一小塊在原地換格，鋪成上萬格就是一整片均勻的亮黃，
 * 看不出這是一座湖：真的熔岩湖面上是一片一片涼掉的黑殼，殼與殼之間裂著發亮的縫，整片慢慢地漂。
 * 這裡在熔岩面上蓋一張不透明的面，湖面長什麼樣子全在著色器裡算：
 *
 * - 殼：細胞雜訊切出來的一片片板塊，各自深淺不同，整片順著一個方向慢慢漂（熔岩是黏的，一秒十分之一格）
 * - 縫：板塊的交界是亮的，越熱的地方縫越寬、殼越小；最熱的地方整片是翻著的亮橘
 * - 哪裡熱：兩道瀑布的落潭、熔岩河、湖面上幾處冒泡的熱點；靠岸的地方涼一點、殼厚一點
 *
 * 「哪一格是熔岩、離岸多遠、有多熱」掃一次方塊資料存成一張 280 見方的貼圖（最近點取樣，邊緣正好切在格線上），
 * 所以地形怎麼改這張面都跟得上，湖面上凸出來的岩殼、玄武岩柱與參道照樣蓋在它上面。
 * 取樣座標切成八分之一格，花紋的顆粒與方塊貼圖同一個量級。
 *
 * 一個長方形、一次繪製、不透明（寫深度，不疊透明）；片段著色器一次細胞雜訊（九格）加四次值雜訊
 */

const SHADER_NAME = 'minespaceJigokuLavaSurface'

/** 這張面浮在熔岩面上這麼高：高過液面那一層方塊的頂面，低於湖面上岩殼方塊的頂面（半格的八分之一） */
const SURFACE_LIFT = 0.06

/** 離岸幾格以上算湖心（貼圖的一個色階是十六分之一格） */
const SHORE_DISTANCE_MAX = 15

/** 熔岩河中心線幾格內算河身，整條都是熱的 */
const RIVER_HOT_REACH = 4

/** 殼的亮度吃多少天光與直射光：殼是涼掉的黑岩，白天看得出是岩，夜裡只剩縫在亮 */
const AMBIENT_WEIGHT = 0.9
const SUN_WEIGHT = 0.5

const VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
uniform mat4 viewProjection;
uniform mat4 view;
varying vec3 vWorld;
varying float vViewDistance;
void main() {
  vWorld = position;
  vViewDistance = length((view * vec4(position, 1.0)).xyz);
  gl_Position = viewProjection * vec4(position, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;
uniform float time;
uniform sampler2D lakeMap;
uniform vec3 crustLight;
uniform vec3 fogColor;
uniform vec2 fogRange;
varying vec3 vWorld;
varying float vViewDistance;

float hash1(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash2(vec2 p) {
  return vec2(hash1(p), hash1(p + 17.31));
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash1(cell), hash1(cell + vec2(1.0, 0.0)), f.x),
    mix(hash1(cell + vec2(0.0, 1.0)), hash1(cell + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

const vec3 CRUST = vec3(0.16, 0.14, 0.14);
const vec3 SMOULDER = vec3(0.95, 0.13, 0.02);
const vec3 ORANGE = vec3(2.1, 0.62, 0.08);
const vec3 YELLOW = vec3(3.0, 1.9, 0.5);

void main() {
  /** r 是不是熔岩、g 離岸多遠、b 有多熱 */
  vec4 lake = texture2D(lakeMap, (vWorld.xz + 0.5) / ${WORLD_SIZE}.0);
  if (lake.r < 0.5)
    discard;

  vec2 point = floor(vWorld.xz * 8.0) / 8.0;
  float shore = lake.g * 255.0 / 16.0;
  float boost = lake.b;
  /** 熱度：湖面本身有大片的冷熱起伏，瀑布、河與熱點往上加，靠岸往下扣 */
  float heat = 0.3 + 0.24 * valueNoise(point * 0.045 + vec2(time * 0.012, 0.0)) + boost * 0.6;
  heat -= (1.0 - smoothstep(0.0, 4.0, shore)) * 0.14 * (1.0 - boost);
  heat = clamp(heat, 0.0, 1.0);

  /** 板塊：整片往南慢慢漂，座標先扭一下，邊才不是直的 */
  vec2 plane = (point - vec2(0.02, 0.1) * time) / 4.6;
  plane += (vec2(valueNoise(plane * 1.9 + 3.1), valueNoise(plane * 1.9 + 9.7)) - 0.5) * 0.7;
  vec2 cell = floor(plane);
  vec2 local = fract(plane);
  float nearestDistance = 8.0;
  float secondDistance = 8.0;
  vec2 nearestCell = cell;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 offset = vec2(float(i), float(j));
      vec2 toSeed = offset + hash2(cell + offset) - local;
      float seedDistance = dot(toSeed, toSeed);
      if (seedDistance < nearestDistance) {
        secondDistance = nearestDistance;
        nearestDistance = seedDistance;
        nearestCell = cell + offset;
      }
      else if (seedDistance < secondDistance) {
        secondDistance = seedDistance;
      }
    }
  }
  float edge = sqrt(secondDistance) - sqrt(nearestDistance);
  float seed = hash1(nearestCell);

  /** 縫：越熱越寬；最中間那一線是黃白 */
  float crackWidth = mix(0.05, 0.55, heat * heat);
  float crack = 1.0 - smoothstep(crackWidth * 0.35, crackWidth, edge);
  float core = 1.0 - smoothstep(0.0, crackWidth * 0.45, edge);
  float pulse = 0.84 + 0.16 * sin(time * 0.7 + seed * 6.2831853);
  vec3 glow = mix(ORANGE, YELLOW, core) * pulse;

  /** 殼：涼的是吃天光的黑岩，熱的那幾片底下透著悶燒的紅 */
  float wrinkle = valueNoise(point * 1.7 + nearestCell * 3.0);
  vec3 plate = CRUST * (0.55 + 0.45 * seed) * (0.7 + 0.5 * wrinkle) * crustLight;
  plate += SMOULDER * smoothstep(0.42, 0.95, heat + (seed - 0.5) * 0.3) * (0.3 + 0.7 * wrinkle);

  vec3 color = mix(plate, glow, crack);

  /** 自己發光的東西穿得過霧：亮的部分只淡到七成 */
  float fogRatio = clamp((vViewDistance - fogRange.x) / (fogRange.y - fogRange.x), 0.0, 1.0);
  color = mix(color, fogColor, fogRatio * mix(1.0, 0.7, crack));
  gl_FragColor = vec4(color, 1.0);
}
`

interface LakeMap {
  /** RGBA8：r 是不是熔岩、g 離岸多遠（十六分之一格一階）、b 有多熱 */
  data: Uint8Array;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * 掃方塊資料，算出湖面的那張圖
 *
 * 離岸的距離用兩趟掃描的距離轉換（四方相鄰，一格算一步）；
 * 熱度：熔岩河沿線整條是熱的，瀑布落潭與湖面的熱點各是一圈往外淡的熱
 */
function buildLakeMap(worldState: Uint8Array): LakeMap {
  const cellCount = WORLD_SIZE * WORLD_SIZE
  const distanceList = new Float32Array(cellCount)
  let minX = WORLD_SIZE
  let maxX = 0
  let minZ = WORLD_SIZE
  let maxZ = 0

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const isLava = isLavaBlock(getBlock(worldState, x, LAKE_Y, z)) && getBlock(worldState, x, LAKE_Y + 1, z) === BlockId.AIR
      distanceList[z * WORLD_SIZE + x] = isLava ? SHORE_DISTANCE_MAX : 0
      if (!isLava)
        continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
  }

  for (let z = 1; z < WORLD_SIZE; z++) {
    for (let x = 1; x < WORLD_SIZE; x++) {
      const index = z * WORLD_SIZE + x
      distanceList[index] = Math.min(distanceList[index]!, distanceList[index - 1]! + 1, distanceList[index - WORLD_SIZE]! + 1)
    }
  }
  for (let z = WORLD_SIZE - 2; z >= 0; z--) {
    for (let x = WORLD_SIZE - 2; x >= 0; x--) {
      const index = z * WORLD_SIZE + x
      distanceList[index] = Math.min(distanceList[index]!, distanceList[index + 1]! + 1, distanceList[index + WORLD_SIZE]! + 1)
    }
  }

  /** 熱源：圓心、半徑與強度；落潭的圓心從壁腳往火口裡退兩格 */
  const hotSpotList = [
    ...LAVA_FALL_LIST.map((fall) => {
      const inwardX = JIGOKU_CENTER.x - fall.x
      const inwardZ = JIGOKU_CENTER.z - fall.z
      const inwardLength = Math.hypot(inwardX, inwardZ)
      return { x: fall.x + (inwardX / inwardLength) * 2, z: fall.z + (inwardZ / inwardLength) * 2, radius: fall.halfWidth * 3 + 6, strength: 1 }
    }),
    ...LAVA_SPATTER_POINT_LIST.map((point) => ({ x: point.x, z: point.z, radius: point.radius * 2.6 + 2, strength: 0.75 })),
  ]
  const riverPointList = LAVA_RIVER_LIST.flatMap((pointList) => samplePathCurve(pointList, 10))

  const data = new Uint8Array(cellCount * 4)
  for (let z = 0; z < WORLD_SIZE; z++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      const index = z * WORLD_SIZE + x
      const distance = distanceList[index]!
      if (distance <= 0)
        continue

      let heat = 0
      for (const spot of hotSpotList) {
        const ratio = Math.hypot(x - spot.x, z - spot.z) / spot.radius
        if (ratio < 1)
          heat = Math.max(heat, spot.strength * (1 - ratio * ratio))
      }
      if (heat < 0.8 && riverPointList.some((point) => Math.hypot(x - point.x, z - point.z) <= RIVER_HOT_REACH))
        heat = Math.max(heat, 0.8)

      data[index * 4] = 255
      data[index * 4 + 1] = Math.min(255, Math.round(distance * 16))
      data[index * 4 + 2] = Math.round(heat * 255)
      data[index * 4 + 3] = 255
    }
  }
  return { data, minX, maxX, minZ, maxZ }
}

export function createJigokuLavaSurface({ scene, worldState, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_SHADER
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER

  const lakeMap = buildLakeMap(worldState)
  const texture = RawTexture.CreateRGBATexture(lakeMap.data, WORLD_SIZE, WORLD_SIZE, scene, false, false, Texture.NEAREST_SAMPLINGMODE)
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE

  /** 一個長方形蓋住所有的熔岩格；不是熔岩的地方由著色器丟掉，台地與岩壁底下的那些本來就被擋住 */
  const y = LAVA_SURFACE_Y + SURFACE_LIFT
  const fromX = lakeMap.minX - 0.5
  const toX = lakeMap.maxX + 0.5
  const fromZ = lakeMap.minZ - 0.5
  const toZ = lakeMap.maxZ + 0.5
  const mesh = new Mesh('jigoku-lava-surface', scene)
  mesh.setVerticesData('position', [fromX, y, fromZ, toX, y, fromZ, toX, y, toZ, fromX, y, toZ], false, 3)
  mesh.setIndices([0, 1, 2, 0, 2, 3])
  mesh.isPickable = false

  const material = new ShaderMaterial('jigoku-lava-surface', scene, SHADER_NAME, {
    attributes: ['position'],
    uniforms: ['viewProjection', 'view', 'time', 'crustLight', 'fogColor', 'fogRange'],
    samplers: ['lakeMap'],
  })
  /** 只會從上面看到它，但神遊的鏡頭貼著湖面飛，兩面都畫比較保險 */
  material.backFaceCulling = false
  material.setTexture('lakeMap', texture)
  mesh.material = material

  const crustLight = new Color3()
  const fogRange = new Vector2()
  let elapsedSecond = 0
  const observer = scene.onBeforeRenderObservable.add(() => {
    elapsedSecond += scene.getEngine().getDeltaTime() / 1000
    const ambient = atmosphere.ambientIntensity * atmosphere.ambientRatio * AMBIENT_WEIGHT
    const sun = atmosphere.lightIntensity * atmosphere.lightRatio * SUN_WEIGHT
    crustLight.set(
      atmosphere.ambientSkyColor.r * ambient + atmosphere.lightColor.r * sun,
      atmosphere.ambientSkyColor.g * ambient + atmosphere.lightColor.g * sun,
      atmosphere.ambientSkyColor.b * ambient + atmosphere.lightColor.b * sun,
    )
    material.setFloat('time', elapsedSecond)
    material.setColor3('crustLight', crustLight)
    material.setColor3('fogColor', scene.fogColor)
    /** ShaderMaterial 沒有 setFloat2（那是 Effect 的），用一個重複利用的 Vector2 傳 */
    fogRange.set(scene.fogStart, scene.fogEnd)
    material.setVector2('fogRange', fogRange)
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      mesh.dispose(false, false)
      material.dispose()
      texture.dispose()
    },
  }
}
