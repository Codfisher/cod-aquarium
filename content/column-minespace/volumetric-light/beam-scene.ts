import type { Camera, PostProcess, Scene } from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'

/**
 * 範例共用的迷你場景與光線行進
 *
 * 本體那一支查的是另外畫出來的一張陰影圖；這裡的場景只有八個盒子，
 * 所以「這一點曬得到太陽嗎」直接拿盒子算就好，不必再開一張貼圖。
 * 除了這一點之外，行進、相位、亮部保護的算式都與本體相同。
 *
 * 場景本身也由這支著色器畫出來，範例裡沒有任何網格。
 * 這麼做是為了讓「畫面上看到的幾何」與「行進時用來擋光的幾何」
 * 保證是同一份，不會有對不上的可能
 */

export interface BeamBox {
  center: readonly [number, number, number];
  half: readonly [number, number, number];
  albedo: readonly [number, number, number];
}

const WOOD_ALBEDO: readonly [number, number, number] = [0.46, 0.31, 0.2]
const LEAF_ALBEDO: readonly [number, number, number] = [0.24, 0.42, 0.2]
const STONE_ALBEDO: readonly [number, number, number] = [0.5, 0.49, 0.46]

/**
 * 一座鳥居加一排樹冠
 *
 * 樹冠刻意排成有縫的一列，光束才有東西可以透。
 * 縫的寬度也是刻意的：太寬看不出是光束，太窄則整片糊掉
 */
export const BEAM_BOX_LIST: readonly BeamBox[] = [
  { center: [-3.5, 3, 0], half: [0.5, 3, 0.5], albedo: WOOD_ALBEDO },
  { center: [3.5, 3, 0], half: [0.5, 3, 0.5], albedo: WOOD_ALBEDO },
  { center: [0, 5.7, 0], half: [4.6, 0.3, 0.36], albedo: WOOD_ALBEDO },
  { center: [-4.5, 7.4, 4], half: [1.1, 0.5, 1.8], albedo: LEAF_ALBEDO },
  { center: [-1.5, 7.4, 4], half: [1.1, 0.5, 1.8], albedo: LEAF_ALBEDO },
  { center: [1.5, 7.4, 4], half: [1.1, 0.5, 1.8], albedo: LEAF_ALBEDO },
  { center: [4.5, 7.4, 4], half: [1.1, 0.5, 1.8], albedo: LEAF_ALBEDO },
  { center: [0, 1, 9], half: [2, 1, 2], albedo: STONE_ALBEDO },
]

/**
 * 太陽的方向（光線前進的方向）
 *
 * 鏡頭預設望向 +Z，所以太陽擺在 +Z 的高處，
 * 一進來就是「望著太陽」那一側，光束最明顯
 */
export const BEAM_SUN_DIRECTION: readonly [number, number, number] = [0.26, -0.56, -0.79]

function toVec3(value: readonly [number, number, number]): string {
  return `vec3(${value.map((item) => item.toFixed(4)).join(', ')})`
}

/** 盒子的清單直接展開成程式碼，省下一組會踩到裝置差異的陣列常數 */
function buildTraceGlsl(): string {
  return BEAM_BOX_LIST.map((box) => `
  {
    float boxDistance = hitBox(origin, direction, ${toVec3(box.center)}, ${toVec3(box.half)});
    if (boxDistance >= 0.0 && boxDistance < best) {
      best = boxDistance;
      hitCenter = ${toVec3(box.center)};
      hitHalf = ${toVec3(box.half)};
      hitAlbedo = ${toVec3(box.albedo)};
      isBox = true;
    }
  }`).join('\n')
}

function buildShadowGlsl(): string {
  return BEAM_BOX_LIST.map((box) => `
  if (hitBox(position, toSun, ${toVec3(box.center)}, ${toVec3(box.half)}) >= 0.0) {
    return 0.0;
  }`).join('\n')
}

/**
 * 沿著視線行進的光束
 *
 * 迴圈的上限是編譯期常數 MAX_STEP_COUNT，實際走幾步由 stepCount 決定。
 * GLSL 的迴圈次數不能是 uniform，所以步數一定得走這兩層
 */
export const BEAM_FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUV;

uniform sampler2D textureSampler;

uniform mat4 inverseViewProjection;
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float strength;
uniform float maxDistance;
uniform float stepCount;
uniform float anisotropy;
uniform float scatterBase;
uniform float phaseEnabled;
uniform float averageEnabled;
uniform float jitterEnabled;
uniform float beamOnly;
uniform float headroomEnabled;
/**
 * 不管亮不亮，天空至少先吃到幾成的保護
 *
 * 保護整份跟著亮度走的話，光暈正中央最亮的地方保護拉到最滿，
 * 稍微離開光暈、亮度一降，保護立刻跟著鬆開；離太陽夠遠、
 * 光暈根本碰不到的天色，這道保護的底值才真正決定亮暗。
 *
 * 這一項做成可調的，範例才有得比
 */
uniform float skyGuardBase;

const float NEAR_FADE_DISTANCE = 8.0;
const float SKY_DISTANCE = 9000.0;

/** 標準的板塊測試，回傳最近的交點距離，沒打中就是負的 */
float hitBox(vec3 origin, vec3 direction, vec3 center, vec3 halfSize) {
  vec3 inverseDirection = 1.0 / (direction + vec3(0.000001));
  vec3 firstList = (center - halfSize - origin) * inverseDirection;
  vec3 secondList = (center + halfSize - origin) * inverseDirection;
  vec3 nearList = min(firstList, secondList);
  vec3 farList = max(firstList, secondList);

  float nearest = max(max(nearList.x, nearList.y), nearList.z);
  float farthest = min(min(farList.x, farList.y), farList.z);

  if (farthest < max(nearest, 0.0)) {
    return -1.0;
  }

  return max(nearest, 0.0);
}

/** 這條視線撞到什麼，回傳距離，順便帶出法線與表面顏色 */
float traceScene(vec3 origin, vec3 direction, out vec3 hitNormal, out vec3 hitAlbedo) {
  float best = 100000.0;
  vec3 hitCenter = vec3(0.0);
  vec3 hitHalf = vec3(1.0);
  bool isBox = false;

  /** 沒打中東西時的預設是地面，顏色與法線都照地面給 */
  hitNormal = vec3(0.0, 1.0, 0.0);
  hitAlbedo = vec3(0.72, 0.7, 0.66);

  if (direction.y < -0.0001) {
    float groundDistance = -origin.y / direction.y;
    if (groundDistance > 0.0) {
      best = groundDistance;
    }
  }
${buildTraceGlsl()}

  if (isBox) {
    /** 打在盒子上，法線取局部座標最大的那一軸 */
    vec3 point = origin + direction * best;
    vec3 local = (point - hitCenter) / hitHalf;
    vec3 absLocal = abs(local);

    if (absLocal.x > absLocal.y && absLocal.x > absLocal.z) {
      hitNormal = vec3(sign(local.x), 0.0, 0.0);
    } else if (absLocal.y > absLocal.z) {
      hitNormal = vec3(0.0, sign(local.y), 0.0);
    } else {
      hitNormal = vec3(0.0, 0.0, sign(local.z));
    }
  }

  return best;
}

/** 這一點的空氣曬得到太陽嗎 */
float measureSunVisibility(vec3 position) {
  vec3 toSun = -sunDirection;
${buildShadowGlsl()}

  return 1.0;
}

/**
 * Henyey-Greenstein 相位函數
 *
 * 「這條視線與光線的夾角，散射進眼睛的比例是多少」
 */
float scatterPhase(float cosAngle) {
  float gg = anisotropy * anisotropy;
  float denominator = 1.0 + gg - 2.0 * anisotropy * cosAngle;

  return (1.0 - gg) / (4.0 * 3.14159265 * pow(max(denominator, 0.0001), 1.5));
}

void main() {
  /** 把畫面座標推到遠平面再轉回世界座標，減掉鏡頭位置就是方向 */
  vec4 farPoint = inverseViewProjection * vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
  vec3 rayDirection = normalize(farPoint.xyz / farPoint.w - cameraPosition);

  vec3 hitNormal;
  vec3 hitAlbedo;
  float sceneDistance = traceScene(cameraPosition, rayDirection, hitNormal, hitAlbedo);

  vec3 sceneColor;
  if (sceneDistance >= SKY_DISTANCE) {
    float upward = clamp(rayDirection.y, 0.0, 1.0);
    sceneColor = mix(vec3(0.88, 0.87, 0.83), vec3(0.36, 0.54, 0.84), upward);

    /**
     * 太陽外圍那圈暖光
     *
     * 緊的那層是日輪本身，鬆的那層鋪出周圍的暈。
     * 少了鬆的那一層，天空的亮度在太陽附近是一根針，
     * 亮部保護那條曲線根本來不及反應
     */
    float towardSun = max(dot(rayDirection, -sunDirection), 0.0);
    float skyHalo = pow(towardSun, 60.0) * 0.65 + pow(towardSun, 8.0) * 0.35;
    sceneColor = mix(sceneColor, vec3(1.0, 0.95, 0.82), clamp(skyHalo, 0.0, 1.0));
  } else {
    vec3 point = cameraPosition + rayDirection * sceneDistance;
    float lambert = max(dot(hitNormal, -sunDirection), 0.0);
    float shadow = measureSunVisibility(point + hitNormal * 0.02);
    sceneColor = hitAlbedo * (0.42 + 1.0 * lambert * shadow);
  }

  float rayLength = min(sceneDistance, maxDistance);
  float stepLength = rayLength / stepCount;

  /**
   * 起點要抖動
   *
   * 每個像素都從同一個位置起步的話，取樣點會在空間裡排成一層一層
   * 等距的殼，畫面上就是一圈一圈的同心紋
   */
  float jitter = 0.5;
  if (jitterEnabled > 0.5) {
    jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float travelled = stepLength * jitter;
  float accumulated = 0.0;

  for (int index = 0; index < MAX_STEP_COUNT; index++) {
    if (float(index) >= stepCount) {
      break;
    }

    accumulated += measureSunVisibility(cameraPosition + rayDirection * travelled);
    travelled += stepLength;
  }

  /** 沿路的平均，也就是「這條線上有幾成的空氣曬得到太陽」 */
  float rawVisibility = accumulated / stepCount;

  /** 取積分那條路會跟著距離走，深度不連續的地方因此裂開 */
  float beam = rawVisibility;
  if (averageEnabled < 0.5) {
    beam = rawVisibility * (rayLength / maxDistance);
  }

  beam *= smoothstep(0.0, NEAR_FADE_DISTANCE, rayLength);

  float phaseValue = 1.0;
  if (phaseEnabled > 0.5) {
    float cosAngle = dot(rayDirection, -sunDirection);
    float forwardLobe = scatterPhase(cosAngle) / scatterPhase(1.0);
    phaseValue = scatterBase + (1.0 - scatterBase) * forwardLobe;
  }

  /** 已經很亮的地方少加一點，看的是亮度不是深度 */
  float headroom = 1.0;
  if (headroomEnabled > 0.5) {
    float sceneLuma = dot(sceneColor, vec3(0.2126, 0.7152, 0.0722));
    float brightRatio = smoothstep(0.45, 0.85, sceneLuma);
    float farRatio = step(SKY_DISTANCE, sceneDistance);
    float skyRatio = farRatio * mix(skyGuardBase, 1.0, brightRatio);
    headroom = mix(1.0, 0.05, skyRatio) * mix(1.0, 0.5, brightRatio);
  }

  vec3 addition = sunColor * beam * phaseValue * headroom * strength;

  if (beamOnly > 0.5) {
    gl_FragColor = vec4(addition, 1.0);
    return;
  }

  gl_FragColor = vec4(sceneColor + addition, 1.0);
}
`

/** 光束最遠走到哪 */
export const BEAM_MAX_DISTANCE = 60

const SHADER_NAME = 'demoVolumetricBeam'

/** 建立後製時要宣告的那一串常數名稱 */
const BEAM_UNIFORM_LIST = [
  'inverseViewProjection',
  'cameraPosition',
  'sunDirection',
  'sunColor',
  'strength',
  'maxDistance',
  'stepCount',
  'anisotropy',
  'scatterBase',
  'phaseEnabled',
  'averageEnabled',
  'jitterEnabled',
  'beamOnly',
  'headroomEnabled',
  'skyGuardBase',
]

/** 這一刻要怎麼畫，四個範例各自把不同的項目接到滑桿上 */
export interface BeamSetting {
  strength: number;
  stepCount: number;
  anisotropy: number;
  scatterBase: number;
  phaseEnabled: boolean;
  averageEnabled: boolean;
  jitterEnabled: boolean;
  /**
   * 亮部保護，不給就是開著
   *
   * 只有專講這一項的那支範例會關掉它
   */
  headroomEnabled?: boolean;
  /** 天空保護的底，不給就是專案裡實際用的那個值 */
  skyGuardBase?: number;
  /** 只畫加上去的那道光，不含原本的畫面 */
  beamOnly: boolean;
  /** 光線前進的方向，沒給就用預設的那顆太陽 */
  sunDirection?: readonly [number, number, number];
}

export interface CreateBeamParam {
  babylon: BabylonModule;
  scene: Scene;
  camera: Camera;
  /** 迴圈的上限，必須是編譯期常數 */
  maxStepCount: number;
  measureSetting: () => BeamSetting;
}

/**
 * 把光束掛成一道後製
 *
 * 每一幀都要重寫一次常數，滑桿拉到哪裡下一幀就是哪裡
 */
export function createBeamPostProcess(param: CreateBeamParam): PostProcess {
  const { babylon, scene, camera } = param

  babylon.Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = BEAM_FRAGMENT_SHADER

  const postProcess = new babylon.PostProcess(
    'demo-volumetric-beam',
    SHADER_NAME,
    BEAM_UNIFORM_LIST,
    [],
    1,
    camera,
    undefined,
    scene.getEngine(),
    false,
    `#define MAX_STEP_COUNT ${param.maxStepCount}`,
  )

  const inverseViewProjection = new babylon.Matrix()

  postProcess.onApply = (effect) => {
    const setting = param.measureSetting()
    const sunDirection = setting.sunDirection ?? BEAM_SUN_DIRECTION

    scene.getTransformMatrix().invertToRef(inverseViewProjection)

    effect.setMatrix('inverseViewProjection', inverseViewProjection)
    effect.setVector3('cameraPosition', camera.globalPosition)
    effect.setFloat3('sunDirection', sunDirection[0], sunDirection[1], sunDirection[2])
    effect.setFloat3('sunColor', 1, 0.94, 0.82)
    effect.setFloat('strength', setting.strength)
    effect.setFloat('maxDistance', BEAM_MAX_DISTANCE)
    effect.setFloat('stepCount', Math.min(setting.stepCount, param.maxStepCount))
    effect.setFloat('anisotropy', setting.anisotropy)
    effect.setFloat('scatterBase', setting.scatterBase)
    effect.setFloat('phaseEnabled', setting.phaseEnabled ? 1 : 0)
    effect.setFloat('averageEnabled', setting.averageEnabled ? 1 : 0)
    effect.setFloat('jitterEnabled', setting.jitterEnabled ? 1 : 0)
    effect.setFloat('beamOnly', setting.beamOnly ? 1 : 0)
    effect.setFloat('headroomEnabled', setting.headroomEnabled === false ? 0 : 1)
    effect.setFloat('skyGuardBase', setting.skyGuardBase ?? 0.65)
  }

  return postProcess
}

/**
 * 場景裡留一顆看不到的方塊
 *
 * 整張畫面由後製自己畫出來，場景本身沒有東西要畫。
 * 留一顆是為了讓算繪流程照常走完，它會被後製整個蓋掉
 */
export function addBeamAnchor(babylon: BabylonModule, scene: Scene): void {
  const anchor = babylon.MeshBuilder.CreateBox('anchor', { size: 0.01 }, scene)
  anchor.isPickable = false
}
