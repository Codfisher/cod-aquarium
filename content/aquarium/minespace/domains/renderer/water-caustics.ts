import type { Material, Scene, StandardMaterial, UniformBuffer, UniversalCamera } from '@babylonjs/core'
import type { WaterMap } from '../world/water-body'
import { MaterialPluginBase } from '@babylonjs/core'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'
import { measureSection } from '../../composables/use-performance-probe'
import { findNearestWaterBody } from '../world/water-body'
import { WATER_CELL_GLSL, WATER_HASH_GLSL } from './water-noise'

/**
 * 焦散的網有多密（每格幾個細胞）
 *
 * 一格約一個半的細胞。焦散是陽光穿過皺起來的水面聚出來的光斑，
 * 比水面本身的紋路細——粗了會變成水底鋪著幾塊亮斑，那不像光
 */
const CAUSTIC_CELL_SCALE = 1.4

/** 網蠕動的快慢，比水面的動畫快一些才像光在晃 */
const CAUSTIC_CELL_SPEED = 0.55

/** 兩個細胞靠多近才開始互相抹平，見 waterSmoothMin */
const CAUSTIC_BLEND = 0.45

/**
 * 多高的脊線才算一條亮線
 *
 * 柔邊給得很窄：焦散是一張細細的亮網，不是一片糊開的白。
 * 門檻放低會變成水底整片發光
 */
const CAUSTIC_EDGE_THRESHOLD = 0.075
const CAUSTIC_EDGE_SOFTNESS = 0.02

/** 亮網最亮到什麼程度，這是加法 */
const CAUSTIC_STRENGTH = 0.55

/**
 * 每深一格衰減多少
 *
 * 光穿過水會被吃掉，深處的光斑本來就淡。
 * 這一項同時解掉一個實務問題：淺灘的焦散最清楚，
 * 而淺灘正是人看得最清楚的地方
 */
const CAUSTIC_DEPTH_FALLOFF = 0.55

/**
 * 焦散的顏色
 *
 * 偏青的白。它是乘在光照上的，但這裡是加法而不是混合，
 * 所以不必像水面的白沫那樣把水的藍色調先乘回去
 */
const CAUSTIC_COLOR: [number, number, number] = [0.72, 0.95, 1]

/** 離最近的一片水多遠就不必畫了 */
const ACTIVE_DISTANCE = 40

/** 挑水的間隔（秒），這件事不必每一幀做 */
const CHECK_INTERVAL = 0.3

/**
 * 這一刻的焦散
 *
 * 與 aerial-perspective 的 airState 同一種寫法。
 * 這份資料掛在兩百多份方塊材質上，各自綁定時來讀
 */
const causticState = {
  time: 0,
  strength: 0,
  /** 目前這一片水：中心 XZ、半徑、水面高度 */
  centerX: 0,
  centerZ: 0,
  radius: 0,
  surfaceY: 0,
}

/**
 * 水底的焦散
 *
 * 陽光穿過皺起來的水面時會被聚成一張晃動的亮網打在水底。
 * 少了它，水底的沙石與水面以外的沙石是同一個樣子——
 * 也就是說，那片水在視覺上只剩「藍色的半透明蓋子」這一個作用。
 *
 * 這是整個場景唯一一個用到細胞紋的地方（水面上那層鋪滿的泡沫
 * 已經拿掉了，見 water-surface），但它仍然放在 water-noise
 * 而不是搬進來：亮網的疏密與流速是這個效果的靈魂，
 * 那份程式碼值得有自己的位置與自己的說明
 *
 * ── 為什麼需要「哪一片水」 ──
 *
 * 片段著色器問不到世界資料，它只知道自己在哪裡。
 * 「這個點在不在水下」這件事因此得由 CPU 先算好送進來：
 * 每 0.3 秒挑出離玩家最近的那一片水，把中心、半徑與水面高度
 * 塞進一組 uniform。四座箱庭彼此相距數十格，
 * 同一刻至多只有一片水在玩家附近，一組就夠。
 *
 * 少了範圍判斷的話，焦散會出現在「任何比水面矮的地方」——
 * 包括池子隔壁那條乾的石階
 *
 * ── 一個圓是近似，而且它知道自己是 ──
 *
 * 水池不是圓的，用中心加半徑去框它一定會多框到岸上一圈。
 * 多框到的地方要同時「比水面矮」才會亮起來，而岸邊本來就是往上走的，
 * 所以多數時候看不出來；真正會露餡的是水池旁邊還有一個更低的坑。
 *
 * 精確的做法是把每一格柱的水面高度烘成一張貼圖讓著色器去查，
 * 那才是「這個點在不在水下」的正解。沒有走那條路是因為
 * 這個場景已經有一個懸案：cloud-shadow 那張 RawTexture
 * 至今取樣不到（見它的說明）。在那件事查清楚以前，
 * 不要把第二個效果押在同一個機制上
 */
class WaterCausticsPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    /** 第六個參數是「一律啟用」，強弱全由 causticState 決定 */
    super(material, 'MinespaceWaterCaustics', 205, {}, true, true)
  }

  getClassName(): string {
    return 'WaterCausticsPlugin'
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'causticRegion', size: 4, type: 'vec4' },
        { name: 'causticParam', size: 4, type: 'vec4' },
      ],
    }
  }

  bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat4(
      'causticRegion',
      causticState.centerX,
      causticState.centerZ,
      causticState.radius,
      causticState.surfaceY,
    )
    uniformBuffer.updateFloat4(
      'causticParam',
      causticState.time,
      causticState.strength,
      CAUSTIC_DEPTH_FALLOFF,
      0,
    )
  }

  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== 'fragment')
      return null

    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        ${WATER_HASH_GLSL}
        ${WATER_CELL_GLSL}
      `,
      /**
       * 疊在漫射色上
       *
       * 與水面的白沫同一個位置、同一個理由：這裡的顏色還沒乘上光照，
       * 所以水底的亮網會跟著天色走。夜裡的水底不該有陽光聚出來的光斑，
       * 而強度那一項本來就已經乘過白晝的程度了——這裡是第二道保險
       *
       * 三層條件由外往內收，最貴的細胞紋排在最裡面：
       * 絕大多數的片元在第一道（沒有水）或第二道（在水面之上）就出去了
       */
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        if (causticParam.y > 0.0) {
          float causticDepth = causticRegion.w - vPositionW.y;
          if (causticDepth > 0.05) {
            float causticReach = 1.0 - smoothstep(
              causticRegion.z * 0.8,
              causticRegion.z + 1.0,
              length(vPositionW.xz - causticRegion.xy)
            );
            if (causticReach > 0.0) {
              float causticEdge = waterCellEdge(
                waterQuantize(vPositionW.xz) * ${CAUSTIC_CELL_SCALE.toFixed(3)},
                causticParam.x * ${CAUSTIC_CELL_SPEED.toFixed(3)},
                ${CAUSTIC_BLEND.toFixed(3)}
              );
              float caustic = smoothstep(
                ${(CAUSTIC_EDGE_THRESHOLD - CAUSTIC_EDGE_SOFTNESS).toFixed(4)},
                ${(CAUSTIC_EDGE_THRESHOLD + CAUSTIC_EDGE_SOFTNESS).toFixed(4)},
                causticEdge
              );
              baseColor.rgb += vec3(${CAUSTIC_COLOR.map((channel) => channel.toFixed(3)).join(', ')})
                * caustic
                * causticReach
                * exp(-causticDepth * causticParam.z)
                * causticParam.y;
            }
          }
        }
      `,
    }
  }
}

/**
 * 把焦散掛到一份材質上
 *
 * 由材質工廠替每一份方塊材質掛上（見 pixel-material），
 * 但液體自己不掛：水面那一份已經有 water-surface，
 * 兩者共用同一份 GLSL 函式，同時掛上去等於把同一個函式宣告兩次，
 * 整份材質會編譯失敗而整批不畫
 */
export function attachWaterCaustics(material: StandardMaterial): void {
  // eslint-disable-next-line no-new
  new WaterCausticsPlugin(material)
}

export interface WaterCaustics {
  dispose: () => void;
}

export interface CreateWaterCausticsParams {
  scene: Scene;
  camera: UniversalCamera;
  waterMap: WaterMap;
  /** 白晝的程度，0 為全暗、1 為大白天 */
  getDayRatio: () => number;
}

/**
 * 推動焦散
 *
 * 挑水這件事每 0.3 秒做一次就夠：人走 0.3 秒不會從一座箱庭
 * 換到另一座，而水是不會動的
 */
export function createWaterCaustics({
  scene,
  camera,
  waterMap,
  getDayRatio,
}: CreateWaterCausticsParams): WaterCaustics {
  const { state: devToggle } = useDevToggles()
  const { quality } = useGraphicsQuality()

  let elapsed = CHECK_INTERVAL

  const observer = scene.onBeforeRenderObservable.add(() => {
    measureSection('水下焦散', () => {
      const deltaSecond = scene.getEngine().getDeltaTime() / 1000
      causticState.time += deltaSecond

      elapsed += deltaSecond
      if (elapsed < CHECK_INTERVAL)
        return

      elapsed = 0

      /**
       * 低畫質不做
       *
       * 一片元十八次雜湊，而這個外掛掛在每一份方塊材質上——
       * 就算多數片元在前兩道條件就出去了，那一檔本來就在跟填充率計較
       */
      const dayRatio = Math.min(1, Math.max(0, getDayRatio()))
      const isEnabled = devToggle.waterCaustics && quality.value !== 'low' && dayRatio > 0.01
      if (!isEnabled) {
        causticState.strength = 0
        return
      }

      const body = findNearestWaterBody(
        waterMap,
        camera.position.x,
        camera.position.z,
        ACTIVE_DISTANCE,
      )
      if (!body) {
        causticState.strength = 0
        return
      }

      causticState.centerX = body.centerX
      causticState.centerZ = body.centerZ
      causticState.radius = body.radius
      causticState.surfaceY = body.surfaceY
      /** 陽光穿過水才有焦散，夜裡沒有東西可以聚 */
      causticState.strength = CAUSTIC_STRENGTH * dayRatio
    })
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      causticState.strength = 0
    },
  }
}
