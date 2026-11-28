import type { CritterFlightParam } from './ambient-critter-flight'
import type { AmbientLayer, CreateAmbientLayerParams } from './ambient-layer'
import { Constants, DirectionalLight, Effect, Lerp, ShaderMaterial, Vector2, Vector3, Vector4 } from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../../composables/use-babylon-scene'
import { buildVoxelFlockGeometry, createVoxelFlockMesh, GLSL_VOXEL_FACE_NORMAL } from '../../realm/realm-voxel-kit'
import { measureAmbientCapacity } from './ambient-budget'
import { createCritterFlock, measureCritterFade, stepCritterFlock } from './ambient-critter-flight'
import { CRITTER_SPECIES_MAP, CRITTER_TONE_COUNT } from './ambient-critter-shape'
import { createAmbientEmitter } from './ambient-emitter'
import { AMBIENT_KIND_SPEC_MAP } from './ambient-kind-spec'
import { resolveAmbientColorPair } from './ambient-layer'

/**
 * 一層體素生物：蜻蜓、蝴蝶、蛾（渲染端）
 *
 * 與 ambient-layer 是同一個介面（update、dispose），由 realm-ambient 看種類表的 critter 欄位決定建哪一種。
 * 什麼時候生、生在哪裡與方片那一路共用 ambient-emitter，怎麼飛在 ambient-critter-flight，
 * 形體在 ambient-critter-shape；這裡只管把牠們畫出來。
 *
 * 畫法：整層一個網格、一次繪製。網格是「這一種的方盒 × 位子數」，每個頂點只帶「我是第幾個位子」
 * 與自己在身體上的位置；每一隻的位置、朝向、大小、明暗與顏色每幀寫進三條 uniform 陣列，
 * 頂點著色器照位子的編號去查，再把方盒擺到世界上。拍翅也在頂點著色器裡算（整片翅膀繞翅根轉）。
 * 幾何建好之後不再動，沒有貼圖，CPU 每幀只更新幾十隻的狀態。
 *
 * 選 uniform 陣列而不是 thin instance：一層最多二十幾隻，三條陣列不到一百個向量，
 * 遠低於 WebGL2 保證的上限；而且不必在自訂著色器裡接實例矩陣那一套宣告，主執行緒與 worker 兩條算繪路徑都一樣
 *
 * 光：每個面一個法線、整面同一個明暗（天光看法線朝上多少、直射光看朝著太陽多少）。
 * 亮度的尺度沿用方片那一路：吃光的種類夜裡壓到三成，蛾繞的是燈、身上被燈照著，不跟著暗。
 * 霧：照場景的線性霧往霧色混（方片那一路是 applyFog），世界邊界與霧濃的場景裡不會浮在白幕前面。
 * 畫在天氣那一層、寫深度：半透明的水面在預設層是後畫的，留在預設層會被水面整片蓋掉
 */

const SHADER_NAME = 'minespaceAmbientCritter'

/**
 * 著色器裡的陣列長度：一層最多同時幾隻
 *
 * 目前最大的一層是風露原的十八隻蝴蝶，容量二十五。陣列長度寫死在著色器裡，三種生物才能共用同一支
 */
export const CRITTER_SLOT_COUNT = 32

/** 吃光的種類在全黑的夜裡留幾成亮度，與方片那一路同一個數 */
const NIGHT_BRIGHTNESS_FLOOR = 0.3

/**
 * 天光與直射光各佔多少：朝下的面約六成、側面約七成半、迎著太陽的頂面約一點三
 *
 * 原本的方片不吃光，白蝴蝶就是白的。第一版天光給零點八，白蝴蝶的側面只剩六成亮，
 * 在草地上看起來是灰的；拉到這個尺度，受光面與原本的方片一樣亮，背光面才暗下去
 */
const AMBIENT_LEVEL = 0.92
const SUN_LEVEL = 0.38

/** 場景裡找不到太陽那盞燈時用的方向（測試用的空場景） */
const FALLBACK_SUN_DIRECTION = new Vector3(0.35, 0.85, 0.4).normalize()

/** 黃金比例的小數：每一隻的拍翅相位依編號錯開 */
const GOLDEN_RATIO_FRACTION = 0.61803398875

const CRITTER_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec2 uv2;
uniform mat4 viewProjection;
/** xyz 位置、w 頭朝哪裡（方位） */
uniform vec4 critterPose[${CRITTER_SLOT_COUNT}];
/** x 一格體素多大（零就是這個位子空著）、y 淡入淡出、z 拍翅的相位（圈）、w 側傾 */
uniform vec4 critterState[${CRITTER_SLOT_COUNT}];
/** rgb 這一隻的底色、a 俯仰 */
uniform vec4 critterColor[${CRITTER_SLOT_COUNT}];
/** 每一種色調怎麼調：x 明暗、y 往白色混多少、z 不透明度 */
uniform vec3 toneRule[${CRITTER_TONE_COUNT}];
/** x 此刻拍到哪裡（圈）、y 平常翹起多少、z 上下各擺多大、w 後翅晚多少 */
uniform vec4 flapSetting;
/** x 翅根離身體中線多遠、y 翅膀底面的高度 */
uniform vec2 wingJoint;
uniform vec3 eyePosition;
varying vec3 vNormal;
varying vec4 vColor;
varying float vViewDistance;
${GLSL_VOXEL_FACE_NORMAL}

/** 在（高度、離翅根的距離）這個平面上轉：角度為正時外端往上抬 */
vec2 liftWing(vec2 point, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(point.x * c + point.y * s, point.y * c - point.x * s);
}

void main() {
  /** position.x 放的是位子的編號，整隻的每個頂點都一樣 */
  int slot = int(position.x + 0.5);
  vec4 pose = critterPose[slot];
  vec4 state = critterState[slot];
  vec4 tint = critterColor[slot];

  /** 頭朝著飛的方向、照爬升的角度仰起來；右是方位再增加四分之一圈的那一邊 */
  float cosPitch = cos(tint.a);
  vec3 forward = vec3(cos(pose.w) * cosPitch, sin(tint.a), sin(pose.w) * cosPitch);
  vec3 right = vec3(-sin(pose.w), 0.0, cos(pose.w));
  vec3 up = cross(right, forward);
  /** 轉彎時往內側傾：側傾為正，右翅壓低 */
  vec3 bankedRight = right * cos(state.w) - up * sin(state.w);
  vec3 bankedUp = up * cos(state.w) + right * sin(state.w);

  /** normal 這個屬性放的是頂點在身體上的位置（體素格）；面的法線由 uv2.x 的面編號查 */
  vec3 local = normal;
  vec3 faceNormal = getVoxelFaceNormal(uv2.x);
  if (uv.x > 0.5) {
    /** 翅膀：第三軸是離翅根的距離，整片繞著翅根轉；後翅晚一點跟上 */
    float lag = uv.x > 1.5 ? flapSetting.w : 0.0;
    float wingAngle = flapSetting.y + flapSetting.z * sin((flapSetting.x + state.z) * 6.2831853 - lag);
    vec2 lifted = liftWing(vec2(local.y - wingJoint.y, local.z), wingAngle);
    vec2 liftedNormal = liftWing(faceNormal.yz, wingAngle);
    local = vec3(local.x, lifted.x + wingJoint.y, (lifted.y + wingJoint.x) * uv.y);
    faceNormal = vec3(faceNormal.x, liftedNormal.x, liftedNormal.y * uv.y);
  }

  vec3 world = pose.xyz + (forward * local.x + bankedUp * local.y + bankedRight * local.z) * state.x;
  vNormal = forward * faceNormal.x + bankedUp * faceNormal.y + bankedRight * faceNormal.z;
  vec3 rule = toneRule[int(uv2.y + 0.5)];
  vColor = vec4(mix(tint.rgb, vec3(1.0), rule.y) * rule.x, rule.z * state.y);
  vViewDistance = length(world - eyePosition);
  gl_Position = viewProjection * vec4(world, 1.0);
}
`

const CRITTER_FRAGMENT = `
precision highp float;
varying vec3 vNormal;
varying vec4 vColor;
varying float vViewDistance;
uniform vec3 sunDirection;
/** x 天光、y 直射光 */
uniform vec2 lightLevel;
uniform vec3 fogColor;
uniform vec2 fogRange;

void main() {
  /** 整個面同一個法線，所以整面同一個明暗；小蟲多半是平視或從上面看，朝下的面留六成半 */
  vec3 faceNormal = normalize(vNormal);
  float skyFacing = 0.65 + 0.35 * (0.5 + 0.5 * faceNormal.y);
  float sunFacing = max(dot(faceNormal, sunDirection), 0.0);
  vec3 color = vColor.rgb * (lightLevel.x * skyFacing + lightLevel.y * sunFacing);
  float fogRatio = clamp((vViewDistance - fogRange.x) / (fogRange.y - fogRange.x), 0.0, 1.0);
  gl_FragColor = vec4(mix(color, fogColor, fogRatio), vColor.a);
}
`

/**
 * 顏色在那一對之間怎麼抽：往兩頭推
 *
 * 場景給的是一對顏色（蜻蜓一藍一紅）。平均地抽，大半會落在中間的紫灰；
 * 往兩頭推之後多數是偏藍或偏紅的，只有少數幾隻在中間
 */
function pushRatioToEnd(ratio: number): number {
  const centered = ratio * 2 - 1
  return 0.5 + 0.5 * Math.sign(centered) * Math.sqrt(Math.abs(centered))
}

export function createAmbientCritterLayer({
  scene,
  definition,
  particleRatio,
  world,
}: CreateAmbientLayerParams): AmbientLayer {
  const spec = AMBIENT_KIND_SPEC_MAP[definition.kind]
  if (!spec.critter)
    throw new Error(`環境粒子 ${definition.kind} 沒有設定 critter，不能建體素生物那一層`)

  const species = CRITTER_SPECIES_MAP[spec.critter]
  const count = Math.max(2, Math.round(definition.count * particleRatio))
  const capacity = Math.min(CRITTER_SLOT_COUNT, measureAmbientCapacity(count))
  const sizeRange = definition.size ?? spec.size
  /** 種類表的 size 是原本方片的邊長；除以整隻的格數，就是一格體素多大 */
  const voxelScale = species.sizeScale / species.span
  const [colorStart, colorEnd] = resolveAmbientColorPair(definition, spec)

  const emitter = createAmbientEmitter({ definition, spec, count, world })
  const flock = createCritterFlock(capacity)

  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = CRITTER_VERTEX
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = CRITTER_FRAGMENT

  const name = `ambient-critter-${definition.kind}`
  const slotList = Array.from({ length: capacity }, (_, slot) => ({
    anchor: [slot, 0, 0] as const,
    param: [0, 0, 0, 0] as const,
  }))
  const mesh = createVoxelFlockMesh(scene, name, buildVoxelFlockGeometry(species.boxList, slotList))
  const material = new ShaderMaterial(name, scene, SHADER_NAME, {
    attributes: ['position', 'normal', 'uv', 'uv2'],
    uniforms: [
      'viewProjection',
      'critterPose',
      'critterState',
      'critterColor',
      'toneRule',
      'flapSetting',
      'wingJoint',
      'eyePosition',
      'sunDirection',
      'lightLevel',
      'fogColor',
      'fogRange',
    ],
    needAlphaBlending: true,
  })
  /** 方盒的繞向沒有整理過，兩面都畫；有深度擋著，背面不會蓋到正面 */
  material.backFaceCulling = false
  material.alphaMode = Constants.ALPHA_COMBINE
  /** 半透明佇列預設不寫深度，這裡是實體，要寫：身體與翅膀、前後兩隻才擋得對 */
  material.forceDepthWrite = true

  mesh.material = material
  mesh.isPickable = false
  /** 頂點是著色器擺的，網格自己的包圍盒沒有意義 */
  mesh.alwaysSelectAsActiveMesh = true
  mesh.renderingGroupId = WEATHER_RENDERING_GROUP
  /** 開發工具與測試從這裡讀整群的狀態（鏡頭跟拍、數活著幾隻） */
  mesh.metadata = { critterFlock: flock }
  mesh.setEnabled(false)

  /** 三條陣列建一次、每幀就地改：材質記的是同一份，綁定時整條送上去 */
  const poseList = Array.from({ length: CRITTER_SLOT_COUNT * 4 }, () => 0)
  const stateList = Array.from({ length: CRITTER_SLOT_COUNT * 4 }, () => 0)
  const colorList = Array.from({ length: CRITTER_SLOT_COUNT * 4 }, () => 0)
  material.setArray4('critterPose', poseList)
  material.setArray4('critterState', stateList)
  material.setArray4('critterColor', colorList)
  material.setArray3('toneRule', species.toneRuleList.flatMap((rule) => [rule.shade, rule.whiten, rule.alpha]))
  material.setVector2('wingJoint', new Vector2(species.wingJoint.shoulderOffset, species.wingJoint.baseY))

  const flightParam: CritterFlightParam = {
    spec,
    bank: species.bank,
    deltaSecond: 0,
    windX: 0,
    windZ: 0,
    emitRate: 0,
    placeCritter(positionList, offset) {
      emitter.pickSpawnPoint()
      positionList[offset] = emitter.spawnPoint.x
      positionList[offset + 1] = emitter.spawnPoint.y
      positionList[offset + 2] = emitter.spawnPoint.z
    },
  }

  const flapSetting = new Vector4(0, species.flap.restRadian, species.flap.swingRadian, species.flap.hindLagRadian)
  const lightLevel = new Vector2()
  const fogRange = new Vector2()
  const sunDirection = new Vector3()
  const flapHz = spec.flap?.hz ?? 0
  let flapTurn = 0
  /** 上一幀寫到第幾個位子：這一幀少掉的那幾個要清成空的 */
  let writtenCount = 0

  return {
    update(frame) {
      flightParam.emitRate = emitter.update(frame)
      flightParam.deltaSecond = frame.deltaSecond
      flightParam.windX = emitter.windX
      flightParam.windZ = emitter.windZ
      stepCritterFlock(flock, flightParam)

      for (let index = 0; index < flock.aliveCount; index++) {
        const base = index * 4
        const source = index * 3
        poseList[base] = flock.positionList[source]!
        poseList[base + 1] = flock.positionList[source + 1]!
        poseList[base + 2] = flock.positionList[source + 2]!
        poseList[base + 3] = flock.headingList[index]!

        stateList[base] = Lerp(sizeRange[0], sizeRange[1], flock.sizeRatioList[index]!) * voxelScale
        stateList[base + 1] = measureCritterFade(flock.ageList[index]! / flock.lifeList[index]!)
        stateList[base + 2] = (flock.idList[index]! * GOLDEN_RATIO_FRACTION) % 1
        stateList[base + 3] = flock.bankList[index]!

        const colorRatio = pushRatioToEnd(flock.colorRatioList[index]!)
        colorList[base] = Lerp(colorStart.r, colorEnd.r, colorRatio)
        colorList[base + 1] = Lerp(colorStart.g, colorEnd.g, colorRatio)
        colorList[base + 2] = Lerp(colorStart.b, colorEnd.b, colorRatio)
        colorList[base + 3] = flock.pitchList[index]!
      }
      /** 空出來的位子把大小清成零：整隻的頂點縮成一點，不產生片段 */
      for (let index = flock.aliveCount; index < writtenCount; index++)
        stateList[index * 4] = 0
      writtenCount = flock.aliveCount

      const isShown = flock.aliveCount > 0
      if (mesh.isEnabled(false) !== isShown)
        mesh.setEnabled(isShown)
      if (!isShown)
        return

      /** 只送「此刻拍到一圈的哪裡」，不送越滾越大的秒數：跑久了浮點精度不夠，翅膀會一頓一頓 */
      flapTurn = (flapTurn + frame.deltaSecond * flapHz) % 1
      flapSetting.x = flapTurn
      material.setVector4('flapSetting', flapSetting)

      const dimRatio = spec.isDimmedAtNight ? Lerp(NIGHT_BRIGHTNESS_FLOOR, 1, frame.brightness) : 1
      lightLevel.set(AMBIENT_LEVEL * dimRatio, SUN_LEVEL * dimRatio * frame.brightness)
      material.setVector2('lightLevel', lightLevel)

      const sunLight = scene.lights.find((light): light is DirectionalLight => light instanceof DirectionalLight)
      if (sunLight)
        sunDirection.copyFrom(sunLight.direction).scaleInPlace(-1).normalize()
      else
        sunDirection.copyFrom(FALLBACK_SUN_DIRECTION)
      material.setVector3('sunDirection', sunDirection)

      material.setVector3('eyePosition', frame.camera.globalPosition)
      material.setColor3('fogColor', scene.fogColor)
      fogRange.set(scene.fogStart, scene.fogEnd)
      material.setVector2('fogRange', fogRange)
    },
    dispose() {
      mesh.dispose()
      material.dispose(false, true)
    },
  }
}
