import type { DynamicTexture, Mesh, Scene, StandardMaterial } from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'

/**
 * 軌跡記得幾個腳印
 *
 * 第一個永遠是「人此刻站在哪裡」，其餘是走過的腳印，各自在恢復中。
 * 這個數字直接是每一個草的頂點每一幀的迴圈次數，不能無限加
 */
export const TRAIL_MARK_COUNT = 12

/** 風往哪個方向吹 */
const WIND_DIRECTION: [number, number] = [0.94, 0.34]

/** 噪聲場的疏密，數字越小，一陣風的範圍越大 */
const WIND_FIELD_SCALE = 0.09

/** 陣風掃過的速度（格／秒） */
const WIND_SPEED = 2.6

/** 顫動佔主擺幅的比例，以及它多快 */
const FLUTTER_RATIO = 0.25
const FLUTTER_SPEED = 2.2

/**
 * 一份草地此刻的狀態
 *
 * 每一幀由外面覆寫，材質綁定時自己來讀。
 * 全部走 uniform 是為了滑桿拉得動，專案裡固定的那幾項
 * 是直接寫成 GLSL 的字面值
 */
export interface GrassSwayState {
  /** 從場景開始到現在幾秒，風的節奏全靠它推 */
  windTime: number;
  /** 顫動累積到哪個相位 */
  flutterPhase: number;
  /** 擺動幅度（格） */
  amplitude: number;
  /** 一為從底部彎（花草），零為整塊一起移動（樹葉） */
  heightLeverage: number;
  /** 行進波的角頻率，由波長換算而來 */
  rippleFrequency: number;
  /** 三層各自的開關：柏林噪聲的陣風、行進波、細碎顫動 */
  gustWeight: number;
  rippleWeight: number;
  flutterWeight: number;
  /** 每四個數字一個腳印：世界 XYZ 與此刻的強度，強度為零代表空位 */
  markList: Float32Array;
  /** 草此刻該倒向哪一邊 */
  flowX: number;
  flowZ: number;
  /** 圈裡面滿檔的核心（格） */
  trampleCoreRadius: number;
  /** 草往外倒的範圍（格） */
  trampleRadius: number;
  /** 高度差超過這麼多就不算踩到 */
  trampleHeightReach: number;
  /** 往外倒的同時往下壓多少（佔推開量的比例） */
  tramplePressRatio: number;
}

export function createGrassSwayState(): GrassSwayState {
  return {
    windTime: 0,
    flutterPhase: 0,
    amplitude: 0.14,
    heightLeverage: 1,
    rippleFrequency: Math.PI * 2 / 6,
    gustWeight: 1,
    rippleWeight: 1,
    flutterWeight: 1,
    markList: new Float32Array(TRAIL_MARK_COUNT * 4),
    flowX: 1,
    flowZ: 0,
    trampleCoreRadius: 0.6,
    trampleRadius: 1.5,
    trampleHeightReach: 2.2,
    tramplePressRatio: 0.55,
  }
}

/**
 * 柏林噪聲
 *
 * 梯度噪聲，格點上存的是方向而非高度，
 * 內插出來的場沒有格子的痕跡，這是「像風」的關鍵
 */
const VERTEX_DEFINITIONS = `
vec2 windHash(vec2 point) {
  point = vec2(dot(point, vec2(127.1, 311.7)), dot(point, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(point) * 43758.5453123);
}

float windNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 offset = fract(point);
  vec2 weight = offset * offset * (3.0 - 2.0 * offset);

  return mix(
    mix(
      dot(windHash(cell), offset),
      dot(windHash(cell + vec2(1.0, 0.0)), offset - vec2(1.0, 0.0)),
      weight.x
    ),
    mix(
      dot(windHash(cell + vec2(0.0, 1.0)), offset - vec2(0.0, 1.0)),
      dot(windHash(cell + vec2(1.0, 1.0)), offset - vec2(1.0, 1.0)),
      weight.x
    ),
    weight.y
  );
}
`

const VERTEX_UPDATE_POSITION = `
{
  /**
   * 這一株長在哪裡
   *
   * thin instance 的矩陣是純平移，第四行就是它的世界座標。
   * 這一段插在 instancesVertex 之前，finalWorld 還沒算出來，
   * 但 world3 這個屬性已經在了
   */
  #ifdef INSTANCES
    vec3 plantOrigin = world3.xyz;
  #else
    vec3 plantOrigin = vec3(0.0);
  #endif

  vec2 windDirection = normalize(vec2(${WIND_DIRECTION[0].toFixed(3)}, ${WIND_DIRECTION[1].toFixed(3)}));

  /** 取樣點隨時間往風的方向退，噪聲場因此像一陣風掃過草原 */
  vec2 samplePoint = plantOrigin.xz * ${WIND_FIELD_SCALE.toFixed(3)}
    - windDirection * windTime * ${WIND_FIELD_SCALE.toFixed(3)} * ${WIND_SPEED.toFixed(3)};
  float gust = windNoise(samplePoint) * 0.68 + windNoise(samplePoint * 2.3 + 17.0) * 0.32;
  float gustStrength = mix(1.0, clamp(0.7 + gust * 0.45, 0.35, 1.15), windLayerWeight.x);

  /**
   * 沿著風向前進的那道波
   *
   * 相位由兩件事決定：這一株在風向上站得多前面，以及現在幾點。
   * 關掉這一層等於拿掉位置那一項，整片草因此變成同時擺動
   */
  float rippleTravel = dot(plantOrigin.xz, windDirection) * windLayerWeight.y
    - windTime * ${WIND_SPEED.toFixed(3)};
  float ripple = sin(windRippleFrequency * rippleTravel);

  /** 每一株自己的細碎顫動，相位由它的座標決定 */
  float plantPhase = plantOrigin.x * 1.7 + plantOrigin.z * 2.3;
  float flutter = sin(windFlutterPhase + plantPhase) * windLayerWeight.z;

  /**
   * 越高擺得越開，或整塊一起動
   *
   * 區域座標從負零點五到正零點五，加上零點五就是「離地多高」。
   * 再平方一次，根部幾乎釘在地上，只有頂端在動
   */
  float height = clamp(positionUpdated.y + 0.5, 0.0, 1.0);
  float leverage = mix(1.0, height * height, windHeightLeverage);

  float amplitude = windAmplitude * gustStrength
    * (ripple + flutter * ${FLUTTER_RATIO.toFixed(3)});
  vec2 sway = windDirection * amplitude * leverage;

  /**
   * 人走過去，草順著他走的方向伏倒
   *
   * 強度由 CPU 照年齡算好，所以這裡不必知道時間。
   * 只有從底部彎的花草會被踩到，樹葉的 windHeightLeverage 是零
   */
  float trampleAmount = 0.0;

  if (windHeightLeverage > 0.0) {
    /** 核心一定要小於外圈，smoothstep 的上下界顛倒在 GLSL 是未定義行為 */
    float coreRadius = min(windTrampleShape.x, windTrampleShape.y - 0.01);

    for (int markIndex = 0; markIndex < ${TRAIL_MARK_COUNT}; markIndex++) {
      vec4 trampleMark = windTrampleList[markIndex];
      if (trampleMark.w <= 0.0) continue;

      float trampleDistance = length(plantOrigin.xz - trampleMark.xz);
      float trampleFalloff = 1.0 - smoothstep(coreRadius, windTrampleShape.y, trampleDistance);
      /** 高度差太多就不算踩到，橋上與跳起來的那一刻都不該推到草 */
      trampleFalloff *= 1.0 - smoothstep(
        0.0,
        windTrampleShape.z,
        abs(plantOrigin.y - trampleMark.y)
      );

      /** 取最重的那一個，不是加起來。相加會在來回走的路上互相抵銷 */
      trampleAmount = max(trampleAmount, trampleMark.w * trampleFalloff);
    }
  }

  /**
   * 位移一律乘上 leverage
   *
   * 這是「底部釘在原地」的保證：leverage 在根部是零、在頂端是一，
   * 而立板只有上下兩排頂點，所以底邊在數學上不可能移動
   */
  float tramplePush = trampleAmount * windHeightLeverage * leverage;
  sway += windTrampleFlow.xy * tramplePush;

  positionUpdated.x += sway.x;
  positionUpdated.z += sway.y;
  /** 被踩到的同時矮下去一截，那是重量，不是風 */
  positionUpdated.y -= tramplePush * windTrampleShape.w;
}
`

/**
 * 把搖擺掛上材質
 *
 * 走材質外掛而不是自己寫一份 ShaderMaterial：這些草照樣要吃平行光、
 * 環境光與鏤空裁切，自己寫一份等於把 StandardMaterial 那一整套重寫一遍。
 * 外掛的完整機制見 EP05，這裡新增的是它也能改頂點著色器
 */
export function attachGrassSway(
  babylon: BabylonModule,
  material: StandardMaterial,
  state: GrassSwayState,
) {
  class GrassSwayPlugin extends babylon.MaterialPluginBase {
    constructor() {
      super(material, 'GrassSway', 200, { GRASS_SWAY: true })
      this._enable(true)
    }

    getClassName(): string {
      return 'GrassSwayPlugin'
    }

    /**
     * 只登記 ubo，不要再給 vertex 宣告字串
     *
     * 兩個都給的話 Babylon 會照單全收，同一個名字宣告兩次，
     * 著色器編譯直接失敗
     */
    getUniforms() {
      return {
        ubo: [
          { name: 'windTime', size: 1, type: 'float' },
          { name: 'windAmplitude', size: 1, type: 'float' },
          { name: 'windHeightLeverage', size: 1, type: 'float' },
          { name: 'windRippleFrequency', size: 1, type: 'float' },
          { name: 'windFlutterPhase', size: 1, type: 'float' },
          { name: 'windLayerWeight', size: 3, type: 'vec3' },
          { name: 'windTrampleShape', size: 4, type: 'vec4' },
          { name: 'windTrampleFlow', size: 4, type: 'vec4' },
          { name: 'windTrampleList', size: 4, type: 'vec4', arraySize: TRAIL_MARK_COUNT },
        ],
      }
    }

    bindForSubMesh(uniformBuffer: {
      updateFloat: (name: string, value: number) => void;
      updateFloat3: (name: string, x: number, y: number, z: number) => void;
      updateFloat4: (name: string, x: number, y: number, z: number, w: number) => void;
      updateFloatArray: (name: string, value: Float32Array) => void;
    }): void {
      uniformBuffer.updateFloat('windTime', state.windTime)
      uniformBuffer.updateFloat('windAmplitude', state.amplitude)
      uniformBuffer.updateFloat('windHeightLeverage', state.heightLeverage)
      uniformBuffer.updateFloat('windRippleFrequency', state.rippleFrequency)
      uniformBuffer.updateFloat('windFlutterPhase', state.flutterPhase)
      uniformBuffer.updateFloat3(
        'windLayerWeight',
        state.gustWeight,
        state.rippleWeight,
        state.flutterWeight,
      )
      uniformBuffer.updateFloat4(
        'windTrampleShape',
        state.trampleCoreRadius,
        state.trampleRadius,
        state.trampleHeightReach,
        state.tramplePressRatio,
      )
      uniformBuffer.updateFloat4('windTrampleFlow', state.flowX, state.flowZ, 0, 0)
      uniformBuffer.updateFloatArray('windTrampleList', state.markList)
    }

    getCustomCode(shaderType: string): Record<string, string> | null {
      if (shaderType !== 'vertex')
        return null

      return {
        CUSTOM_VERTEX_DEFINITIONS: VERTEX_DEFINITIONS,
        CUSTOM_VERTEX_UPDATE_POSITION: VERTEX_UPDATE_POSITION,
      }
    }
  }

  return new GrassSwayPlugin()
}

/**
 * 一叢草的貼圖
 *
 * 幾根一格高的葉片，背景全透明。取樣走 NEAREST 保住硬邊，
 * 材質那邊再開鏤空裁切，露出來的就只有葉片本身
 */
export function createBladeTexture(babylon: BabylonModule, scene: Scene): DynamicTexture {
  const size = 16
  const texture = new babylon.DynamicTexture(
    'grass-blade',
    { width: size, height: size },
    scene,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
  )

  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, size, size)

  const bladeList: [number, number, number, string][] = [
    [3, 15, 4, '#4f7a35'],
    [7, 15, 2, '#649544'],
    [11, 15, 6, '#436b2c'],
    [13, 15, 9, '#5a8a3c'],
  ]

  for (const [x, bottom, top, color] of bladeList) {
    context.fillStyle = color
    for (let y = bottom; y >= top; y--) {
      /** 越往上越細，同時往一邊帶一點斜度 */
      const width = y > (bottom + top) / 2 ? 2 : 1
      const lean = Math.round((bottom - y) * 0.15)
      context.fillRect(x + lean, y, width, 1)
    }
  }

  texture.update()
  texture.hasAlpha = true

  return texture
}

export interface CreateGrassFieldParams {
  babylon: BabylonModule;
  scene: Scene;
  state: GrassSwayState;
  /** 草鋪在多大的方形範圍裡（格） */
  extent: number;
  /** 一共幾株 */
  plantCount: number;
}

export interface GrassField {
  mesh: Mesh;
  material: StandardMaterial;
  dispose: () => void;
}

/**
 * 一片草地
 *
 * 全部走 thin instance，共用同一份頂點資料。CPU 這邊連
 * 「單獨移動其中一株」的餘地都沒有，這正是擺動只能寫在著色器裡的理由
 */
export function createGrassField({
  babylon,
  scene,
  state,
  extent,
  plantCount,
}: CreateGrassFieldParams): GrassField {
  const material = new babylon.StandardMaterial('grass-material', scene)
  material.diffuseTexture = createBladeTexture(babylon, scene)
  material.specularColor = new babylon.Color3(0, 0, 0)
  material.backFaceCulling = false
  /** 鏤空裁切，透明的地方直接丟掉，不必排序 */
  material.transparencyMode = babylon.Material.MATERIAL_ALPHATEST
  material.useAlphaFromDiffuseTexture = true
  material.alphaCutOff = 0.4

  attachGrassSway(babylon, material, state)

  /**
   * 交叉立板
   *
   * 兩片互相垂直的板子，從任何方向看過去都有東西。
   * 區域座標的 y 落在正負零點五之間，加上零點五剛好是「離地多高」
   */
  const planeX = babylon.MeshBuilder.CreatePlane(
    'blade-x',
    { size: 1, sideOrientation: babylon.Mesh.DOUBLESIDE },
    scene,
  )
  const planeZ = babylon.MeshBuilder.CreatePlane(
    'blade-z',
    { size: 1, sideOrientation: babylon.Mesh.DOUBLESIDE },
    scene,
  )
  planeZ.rotation.y = Math.PI / 2

  const merged = babylon.Mesh.MergeMeshes([planeX, planeZ], true, true)
  if (!merged)
    throw new Error('草的網格合併失敗')

  const mesh = merged
  mesh.name = 'grass'
  mesh.material = material
  mesh.isPickable = false
  /** 頂點著色器會把草推出原本的包圍盒，交給場景一律當作可見 */
  mesh.alwaysSelectAsActiveMesh = true

  /**
   * 每一株的矩陣是純平移加上一點縮放
   *
   * 不加旋轉：著色器裡的位移是在區域座標上做的，
   * 一旦實例帶了旋轉，整片草會各自往不同的方向倒
   */
  const matrixList = new Float32Array(plantCount * 16)
  const matrix = babylon.Matrix.Identity()

  for (let index = 0; index < plantCount; index++) {
    const x = (Math.random() - 0.5) * extent
    const z = (Math.random() - 0.5) * extent
    const scale = 0.85 + Math.random() * 0.4

    babylon.Matrix.ComposeToRef(
      new babylon.Vector3(scale, scale, scale),
      babylon.Quaternion.Identity(),
      /** 底邊要剛好落在地面上，所以中心抬高半個身高 */
      new babylon.Vector3(x, scale / 2, z),
      matrix,
    )
    matrix.copyToArray(matrixList, index * 16)
  }

  mesh.thinInstanceSetBuffer('matrix', matrixList, 16)

  return {
    mesh,
    material,
    dispose() {
      mesh.dispose()
      material.dispose()
    },
  }
}

export interface TrailConfig {
  /** 一個腳印多久站回來（秒） */
  recoverSecond: number;
  /** 草被推開多遠（格） */
  push: number;
  /** 走多遠蓋一個腳印的上下限（格） */
  stampDistanceMin: number;
  stampDistanceMax: number;
}

export interface Trail {
  config: TrailConfig;
  /** 推進這一幀的軌跡 */
  update: (footX: number, footY: number, footZ: number, deltaSecond: number) => void;
  clear: () => void;
}

/** 腳印從蓋下來到完全站回原狀的恢復曲線，一是全倒、零是站直 */
function measureRecovery(age: number, recoverSecond: number): number {
  const ratio = Math.min(1, Math.max(0, age / recoverSecond))

  /** 平滑收尾，草不該在恢復的最後一刻「啪」地彈回去 */
  return 1 - ratio * ratio * (3 - 2 * ratio)
}

/**
 * 記住人走過哪裡
 *
 * 第零個位置是活的，每一幀覆寫成人此刻的位置，所以站著不動時
 * 腳邊那一圈會一直伏著。其餘是走過留下的腳印，各自照自己的年齡恢復
 */
export function createTrail(state: GrassSwayState, config: TrailConfig): Trail {
  const ageList = new Float32Array(TRAIL_MARK_COUNT)
  let flowAngle = 0
  let nextMarkIndex = 1
  let lastStampX = 0
  let lastStampZ = 0
  let lastFootX = 0
  let lastFootZ = 0
  let speed = 0

  /**
   * 這一刻該隔多遠蓋一個腳印
   *
   * 位置只有十二個，蓋滿之後最舊的那一個會被新的覆寫掉，
   * 而它當時往往還壓著八成。要讓被回收的永遠是一個已經站直的位置，
   * 一圈涵蓋的路走完所花的時間就得不短於恢復時間
   */
  function measureStampDistance(currentSpeed: number): number {
    const span = currentSpeed * config.recoverSecond / (TRAIL_MARK_COUNT - 1)

    return Math.min(config.stampDistanceMax, Math.max(config.stampDistanceMin, span))
  }

  return {
    config,
    update(footX, footY, footZ, deltaSecond) {
      const { markList } = state

      /**
       * 這一幀往哪走
       *
       * 只有真的在走才更新方向，而且一次只轉一小段。
       * 一百八十度的迴轉要用轉的，直接切過去會讓草在兩個姿勢之間彈
       */
      const moveX = footX - lastFootX
      const moveZ = footZ - lastFootZ
      const moveLength = Math.hypot(moveX, moveZ)
      if (deltaSecond > 0 && moveLength / deltaSecond > 0.5) {
        const targetAngle = Math.atan2(moveZ, moveX)
        /** 把差角收進正負一百八十度，才不會為了轉三十度而繞一圈 */
        let deltaAngle = (targetAngle - flowAngle) % (Math.PI * 2)
        if (deltaAngle > Math.PI)
          deltaAngle -= Math.PI * 2
        if (deltaAngle < -Math.PI)
          deltaAngle += Math.PI * 2

        const turnLimit = 4 * deltaSecond
        flowAngle += Math.min(turnLimit, Math.max(-turnLimit, deltaAngle))
      }

      state.flowX = Math.cos(flowAngle)
      state.flowZ = Math.sin(flowAngle)

      /** 第零個是活的：人站著不動時，腳邊那一圈要一直伏著 */
      markList[0] = footX
      markList[1] = footY
      markList[2] = footZ
      markList[3] = config.push

      const frameSpeed = deltaSecond > 0 ? moveLength / deltaSecond : 0
      lastFootX = footX
      lastFootZ = footZ
      speed += (Math.min(12, frameSpeed) - speed) * Math.min(1, deltaSecond * 4)

      /**
       * 走遠了才蓋下一個腳印
       *
       * 照時間蓋的話，站著不動會把整條軌跡蓋在同一個點上，
       * 十二個位置全被同一個地方吃光，一走開身後什麼都沒留下
       */
      const stampDistance = Math.hypot(footX - lastStampX, footZ - lastStampZ)
      if (stampDistance >= measureStampDistance(speed)) {
        const offset = nextMarkIndex * 4
        markList[offset] = footX
        markList[offset + 1] = footY
        markList[offset + 2] = footZ
        markList[offset + 3] = config.push
        ageList[nextMarkIndex] = 0

        lastStampX = footX
        lastStampZ = footZ
        /** 繞回一而不是零：第零個位置是活的，不參與輪替 */
        nextMarkIndex = nextMarkIndex + 1 >= TRAIL_MARK_COUNT ? 1 : nextMarkIndex + 1
      }

      /** 舊腳印各自站回來，站直了就把位置讓出來 */
      for (let index = 1; index < TRAIL_MARK_COUNT; index++) {
        const offset = index * 4
        if (markList[offset + 3] === 0)
          continue

        const age = ageList[index]! + deltaSecond
        ageList[index] = age
        markList[offset + 3] = config.push * measureRecovery(age, config.recoverSecond)
      }
    },
    clear() {
      state.markList.fill(0)
      ageList.fill(0)
      nextMarkIndex = 1
    },
  }
}

/** 每一幀往前推風的時間與顫動的相位 */
export function advanceWind(state: GrassSwayState, deltaSecond: number): void {
  state.windTime += deltaSecond
  /**
   * 顫動的相位一點一點累積
   *
   * 不能在著色器裡寫「時間乘上當下的速度」。速度是會變的，
   * 跑了十分鐘之後稍微一動就會把相位甩出去好幾圈
   */
  state.flutterPhase += deltaSecond * FLUTTER_SPEED
}
