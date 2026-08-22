<template>
  <demo-frame
    :setup="setup"
    :camera-radius="150"
    :camera-beta="1.38"
    :camera-alpha="-1.1"
    :camera-target="[0, 12, 0]"
    :height="340"
    title="材質外掛實作：雲影"
    caption="這個範例真的掛了一份 MaterialPluginBase，用正規式把光照那兩行換掉。地上那塊暗與頭頂那朵雲是同一份圖樣，所以對得起來。天光那一項調到零，雲影只會變淺，不會消失，地面的暗多半來自直射光那組參數，天光只占一小部分。正式場景裡雲影幾乎看不見，是因為畫面撞上了 ACES 色調映射的天花板，這個範例沒有掛色調映射，重現不出這個現象，只在正文表格的量測數字裡看得到。"
  >
    <demo-toggle
      v-model="shadowVisible"
      label="雲影"
    />
    <demo-slider
      v-model="shadeDepth"
      label="直射光收掉"
      :min="0"
      :max="1"
      :step="0.02"
    />
    <demo-slider
      v-model="skyShadeDepth"
      label="天光收掉"
      :min="0"
      :max="0.8"
      :step="0.02"
    />
    <demo-slider
      v-model="sunHeight"
      label="太陽仰角"
      :min="0.2"
      :max="0.95"
      :step="0.01"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Material, RawTexture, UniformBuffer } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture } from '../demo/pixel-texture'
import { blurPattern, createCloudMesh, createCloudPattern, createSeededRandom, upsamplePattern } from './cloud-pattern'

const shadowVisible = ref(true)
const shadeDepth = ref(0.72)
const skyShadeDepth = ref(0.42)
const sunHeight = ref(0.62)

/** 雲的圖樣格數與格寬，兩者相乘就是圖樣涵蓋的世界寬度 */
const PATTERN_COUNT = 20
const CELL_SIZE = 14
const CLOUD_HEIGHT = 90
const CLOUD_THICKNESS = 5
const CLOUD_DRIFT_SPEED = 3.2

/** 一格雲切成幾個紋素，切細之後模糊的半徑就與雲的大小脫鉤了 */
const SHADOW_TEXEL_PER_CELL = 4

/** 覆蓋率要到多少才開始遮、多少才遮到滿 */
const COVER_START = 0.1
const COVER_FULL = 0.5

/**
 * 這一刻的雲影
 *
 * 所有材質共用一份，每一幀寫一次，下一幀各材質綁定時自己來讀。
 * 兩百多份材質各存一套的話，改天氣得走過每一份
 */
const cloudShadowState = {
  /** 直射光最深收掉幾成，零等於這個效果不存在 */
  strength: 0,
  /** 天光最深收掉幾成 */
  skyStrength: 0,
  /** 雲層此刻往 +X 飄了多遠 */
  driftX: 0,
  /** 每高出地面一格，投影點要往回退多少 */
  slopeX: 0,
  slopeZ: 0,
  height: CLOUD_HEIGHT,
  /** 一除以圖樣涵蓋的世界寬度 */
  inverseSpan: 1 / (PATTERN_COUNT * CELL_SIZE),
}

/**
 * 外掛的類別要等 Babylon 載進來才能定義
 *
 * MaterialPluginBase 是它的匯出，動態 import 之前根本沒有那個基底類別
 */
function createPluginClass(babylon: BabylonModule) {
  return class DemoCloudShadowPlugin extends babylon.MaterialPluginBase {
    constructor(material: Material) {
      /** 第六個參數是「一律啟用」，這個外掛沒有開關屬性 */
      super(material, 'DemoCloudShadow', 210, {}, true, true)
    }

    getClassName(): string {
      return 'DemoCloudShadowPlugin'
    }

    getSamplers(samplers: string[]): void {
      samplers.push('cloudShadowSampler')
    }

    getUniforms() {
      return {
        ubo: [
          { name: 'cloudShadowParam', size: 4, type: 'vec4' },
          { name: 'cloudShadowProjection', size: 4, type: 'vec4' },
        ],
        /**
         * 這一段只有不支援統一緩衝區時才派得上用場
         *
         * 支援的時候上面那個 ubo 陣列會被塞進材質的統一緩衝區，
         * 兩邊都寫，退路才在
         */
        fragment: `
          uniform vec4 cloudShadowParam;
          uniform vec4 cloudShadowProjection;
        `,
      }
    }

    bindForSubMesh(uniformBuffer: UniformBuffer): void {
      const state = cloudShadowState

      uniformBuffer.updateFloat4(
        'cloudShadowParam',
        state.strength,
        state.inverseSpan,
        COVER_START,
        COVER_FULL,
      )
      uniformBuffer.updateFloat4(
        'cloudShadowProjection',
        state.slopeX,
        state.slopeZ,
        state.skyStrength,
        state.driftX,
      )

      if (patternTexture) {
        uniformBuffer.setTexture('cloudShadowSampler', patternTexture)
      }
    }

    getCustomCode(shaderType: string): { [pointName: string]: string } | null {
      if (shaderType !== 'fragment')
        return null

      return {
        /**
         * 沿著光線往上找，看頭頂那個位置有沒有雲
         *
         * 先依高度差把座標推回雲層那一層，再扣掉雲此刻飄了多遠，
         * 剩下的就是原始圖樣裡的位置。取樣器用重複定址，
         * 座標推到圖樣外面會自己繞回來
         */
        'CUSTOM_FRAGMENT_DEFINITIONS': `
          uniform sampler2D cloudShadowSampler;

          float demoCloudCover() {
            if (cloudShadowParam.x <= 0.0) {
              return 0.0;
            }

            vec2 cloudPoint = vPositionW.xz
              - (${CLOUD_HEIGHT.toFixed(1)} - vPositionW.y) * cloudShadowProjection.xy
              - vec2(cloudShadowProjection.w, 0.0);

            float cover = texture2D(cloudShadowSampler, cloudPoint * cloudShadowParam.y).r;

            return smoothstep(cloudShadowParam.z, cloudShadowParam.w, cover);
          }
        `,

        /**
         * 覆蓋率一幀只算一次
         *
         * 平行光與天光都要用到它，而它裡面有一次貼圖取樣。
         * 擺在光照之前算好存起來，兩盞燈共用同一個值
         */
        'CUSTOM_FRAGMENT_BEFORE_LIGHTS': `
          float demoCloudCoverValue = demoCloudCover();
        `,

        /**
         * 天光也收一截
         *
         * 這一行是半球光專用的，條件編譯已經把它框在 HEMILIGHT 裡面。
         * 天空色與地面反射色兩份都乘，因為那塊地一起在影子裡
         */
        '!info=computeHemisphericLighting\\(viewDirectionW,normalW,([^,]+),(diffuse(\\d+)\\.rgb),([^,]+),([^,]+),glossiness\\);': `
          {
            float cloudSkyShade = 1.0 - cloudShadowProjection.z * demoCloudCoverValue;

            info = computeHemisphericLighting(viewDirectionW, normalW, $1, $2 * cloudSkyShade, $4, $5 * cloudSkyShade, glossiness);
          }
        `,

        /**
         * 平行光收得最深，而且漫射與高光都要乘
         *
         * DIRLIGHT 這個條件是在挑「這一盞是不是平行光」。
         * 每個 $n 只准出現一次，所以漫射與高光各自獨立成群。
         * 注入的那段 GLSL 裡不要寫註解，前處理器會把註解裡的
         * 條件編譯指令當成真的指令
         */
        '!info=computeLighting\\(viewDirectionW,normalW,([^,]+),(diffuse(\\d+)\\.rgb),([^,]+),(diffuse\\3\\.a),glossiness\\);': `
          {
            float cloudShade = 1.0;
            #ifdef DIRLIGHT$3
              cloudShade = 1.0 - cloudShadowParam.x * demoCloudCoverValue;
            #endif

            info = computeLighting(viewDirectionW, normalW, $1, $2 * cloudShade, $4 * cloudShade, $5, glossiness);
          }
        `,
      }
    }
  }
}

/** 雲的覆蓋圖，由場景建好之後交過來 */
let patternTexture: RawTexture | null = null

function setup({ babylon, scene }: BabylonDemoContext) {
  scene.clearColor = new babylon.Color4(0.55, 0.72, 0.92, 1)

  /**
   * 平行光要先建
   *
   * 著色器裡的 DIRLIGHT0 是照建立順序編號的，
   * 平行光排第一，天光才會是第一盞半球光
   */
  const sun = new babylon.DirectionalLight('sun', new babylon.Vector3(0.5, -0.7, 0.5), scene)
  sun.intensity = 1.35
  sun.diffuse = new babylon.Color3(1, 0.95, 0.84)
  sun.specular = new babylon.Color3(0, 0, 0)

  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.68
  ambient.diffuse = new babylon.Color3(0.78, 0.88, 1)
  ambient.groundColor = new babylon.Color3(0.82, 0.77, 0.72)
  ambient.specular = new babylon.Color3(0, 0, 0)

  const PluginClass = createPluginClass(babylon)

  const sandTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandTexture.uScale = 90
  sandTexture.vScale = 90

  const sandMaterial = new babylon.StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = sandTexture
  sandMaterial.specularColor = new babylon.Color3(0, 0, 0)
  /**
   * 直接掛在這幾份材質上
   *
   * 本體是用 RegisterMaterialPlugin 讓所有材質自動接上，但那是全域的。
   * 文章頁只想影響自己這兩份，就直接 new 一個
   */
  // eslint-disable-next-line no-new
  new PluginClass(sandMaterial)

  const stoneMaterial = new babylon.StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new babylon.Color3(0, 0, 0)
  // eslint-disable-next-line no-new
  new PluginClass(stoneMaterial)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 420, height: 420 }, scene)
  ground.material = sandMaterial

  /** 幾根柱子，雲影掃過去時牆面也該跟著暗 */
  for (const [index, spot] of ([[-30, 10], [24, -18], [4, 26]] as const).entries()) {
    const pillar = babylon.MeshBuilder.CreateBox(`pillar-${index}`, {
      width: 6,
      height: 22,
      depth: 6,
    }, scene)
    pillar.position.set(spot[0], 11, spot[1])
    pillar.material = stoneMaterial
  }

  /**
   * 雲的圖樣算一次，雲層與雲影共用
   *
   * 各算各的就會是兩朵不同的雲，地上那塊暗與頭頂那朵就對不起來了
   */
  const cellList = createCloudPattern(
    createSeededRandom(20260820),
    PATTERN_COUNT,
    0.2,
    [
      { density: 0.28, weight: 1 },
      { density: 0.7, weight: 0.35 },
    ],
  )

  const cloudMaterial = new babylon.StandardMaterial('cloud-material', scene)
  cloudMaterial.diffuseColor = new babylon.Color3(1, 1, 1)
  cloudMaterial.specularColor = new babylon.Color3(0, 0, 0)
  cloudMaterial.emissiveColor = new babylon.Color3(0.4, 0.43, 0.48)
  cloudMaterial.backFaceCulling = false
  cloudMaterial.alpha = 0.92

  const cloudMesh = createCloudMesh({
    babylon,
    scene,
    name: 'cloud',
    cellList,
    patternCount: PATTERN_COUNT,
    cellSize: CELL_SIZE,
    thickness: CLOUD_THICKNESS,
    tileCount: 3,
    isCulled: true,
  })
  cloudMesh.material = cloudMaterial
  cloudMesh.position.y = CLOUD_HEIGHT

  patternTexture = createPatternTexture(babylon, scene, cellList)

  const driftPeriod = PATTERN_COUNT * CELL_SIZE
  let elapsed = 0
  const observer = scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() / 1000
    const driftX = (elapsed * CLOUD_DRIFT_SPEED) % driftPeriod

    cloudMesh.position.x = driftX
    cloudShadowState.driftX = driftX

    /** 光線往下走，太陽越高 y 越負 */
    const height = sunHeight.value
    const flat = Math.sqrt(Math.max(0, 1 - height * height))
    sun.direction.set(0.62 * flat, -height, 0.78 * flat)

    cloudShadowState.slopeX = sun.direction.x / height
    cloudShadowState.slopeZ = sun.direction.z / height
  })

  applySetting()

  return () => {
    scene.onBeforeRenderObservable.remove(observer)
    patternTexture?.dispose()
    patternTexture = null
  }
}

/**
 * 把布林值的雲格糊成一張有濃淡的小圖
 *
 * 直接雙線性取樣一張全有全無的圖會拉出菱形的塊，糊過才有中間值
 */
function createPatternTexture(
  babylon: BabylonModule,
  scene: BabylonDemoContext['scene'],
  cellList: boolean[],
) {
  const shadowCount = PATTERN_COUNT * SHADOW_TEXEL_PER_CELL
  const coverList = blurPattern(
    upsamplePattern(cellList, PATTERN_COUNT, SHADOW_TEXEL_PER_CELL),
    shadowCount,
  )

  /**
   * 用四通道，不用單通道
   *
   * 單通道格式在不同裝置上的支援情況要一個一個確認，
   * 而這張圖只有八十格見方，多三個通道也才多兩萬個位元組
   */
  const data = new Uint8Array(shadowCount * shadowCount * 4)
  for (const [index, cover] of coverList.entries()) {
    const value = Math.round(Math.min(1, Math.max(0, cover)) * 255)
    data[index * 4] = value
    data[index * 4 + 1] = value
    data[index * 4 + 2] = value
    data[index * 4 + 3] = 255
  }

  const texture = babylon.RawTexture.CreateRGBATexture(
    data,
    shadowCount,
    shadowCount,
    scene,
    false,
    false,
    babylon.Texture.BILINEAR_SAMPLINGMODE,
  )
  /** 圖樣要無限平鋪，這是循環世界的硬性條件 */
  texture.wrapU = babylon.Texture.WRAP_ADDRESSMODE
  texture.wrapV = babylon.Texture.WRAP_ADDRESSMODE

  return texture
}

function applySetting() {
  cloudShadowState.strength = shadowVisible.value ? shadeDepth.value : 0
  cloudShadowState.skyStrength = shadowVisible.value ? skyShadeDepth.value : 0
}

watch([shadowVisible, shadeDepth, skyShadeDepth], applySetting)
</script>
