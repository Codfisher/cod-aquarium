import type { AbstractEngine, Material, Scene, StandardMaterial, UniformBuffer, UniversalCamera } from '@babylonjs/core'
import type { WaterMap } from '../world/water-body'
import { MaterialPluginBase } from '@babylonjs/core'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'
import { measureSection } from '../../composables/use-performance-probe'
import { LIQUID_SURFACE_DROP } from '../block/block-constants'
import { PLAYER_EYE_HEIGHT } from '../player/collision'
import { getWaterLevel } from '../world/water-body'
import { sceneDepthState } from './scene-depth'

/**
 * 頂面在區域座標的哪個高度
 *
 * 水面那一層的網格是一顆矮掉八分之一格的方塊，建好之後又往下烘了
 * 半個落差（見 voxel-renderer 那段），頂面因此落在 0.5 減一個落差。
 * 算出來而不是寫死：落差是與碰撞共用的常數，哪天調了它，
 * 寫死的門檻會靜靜地失效——而失效的樣子是「岸線整片不見」，
 * 不會有任何錯誤訊息。留兩個百分點的餘裕給浮點數
 */
const TOP_FACE_THRESHOLD = 0.5 - LIQUID_SURFACE_DROP - 0.02

/**
 * 岸線那道亮線有多寬（世界單位）
 *
 * 量的是「水面與它背後那塊實體之間的距離」，而那個距離是沿著視線量的，
 * 不是垂直的深度。所以同一片淺灘，低頭看是一圈細線，
 * 平視過去則整片被拉長——那是對的，光本來就是這樣穿過水的
 */
const SHORELINE_WIDTH = 0.34

/** 亮線外面那圈暈的衰減距離，比線本身寬一倍多才有「白沫散開」的樣子 */
const SHORELINE_GLOW_WIDTH = 0.8

/** 岸線最亮到什麼程度 */
const SHORELINE_STRENGTH = 0.85

/**
 * 岸線量化成幾階
 *
 * 深度差是連續的，直接畫出來是一圈平滑的漸層——全場唯一沒有階梯的東西。
 * 切成四階之後，那圈白沫是一階一階退開的，
 * 與貼圖上的像素、與像素對齊的陰影同一個節奏
 */
const SHORELINE_STEP_COUNT = 4.0

/** 同時最多幾圈漣漪 */
const RIPPLE_SLOT_COUNT = 8

/** 漣漪擴散的速度（格／秒） */
const RIPPLE_SPEED = 1.9

/** 圈本身的厚度（格） */
const RIPPLE_WIDTH = 0.32

/** 幾秒之內淡光，同時也是一個槽位被佔用的時間 */
const RIPPLE_LIFETIME = 2.2

/** 指數衰減的係數，與壽命配合讓圈在消失前就已經很淡 */
const RIPPLE_DECAY = 1.5

/** 雨滴打出來的圈有多明顯 */
const RAIN_RIPPLE_STRENGTH = 0.55

/**
 * 兩圈雨的漣漪至少隔多久（秒）
 *
 * 這一項不是為了省效能，是為了讓圈長得出來。
 *
 * 雨每一幀會算出二十幾個落點，站在池邊時那些落點多半都在水上——
 * 照單全收的話，八個槽位每一幀被覆寫一遍，每一圈都停在剛出生的
 * 那個半徑上。畫面看到的是一池不會擴散的白點，不是雨打在水上。
 *
 * 隔三分之一秒放一圈，配上兩秒多的壽命，水面上同時有六七圈
 * 大小不同的環——那才是雨的樣子
 */
const RAIN_RIPPLE_INTERVAL = 0.33

/**
 * 落點與水面差多少之內才算打在水上
 *
 * 射線回傳的是「雨滴打到的表面」，水面地圖存的是「這根格柱的水面」。
 * 兩者本來就該相等，但一個是從方塊的碰撞高度算的、
 * 一個是從液面落差算的，容許八分之一格的出入。
 *
 * 這一刀真正擋掉的是「水面上方有東西」：池上的屋頂、棧道與樹冠——
 * 雨打在那些東西上，底下的水不該起波
 */
const RAIN_RIPPLE_SURFACE_TOLERANCE = 0.35

/** 人涉水走出來的圈，比雨滴大得多 */
const WADE_RIPPLE_STRENGTH = 0.9

/** 走多遠濺一次，太密會讓整片水糊成一團白 */
const WADE_RIPPLE_DISTANCE = 0.7

/**
 * 白沫的顏色
 *
 * 看起來超出範圍的紅是刻意的。這個顏色是乘在光照上的，
 * 而水的材質色調把光照先染成了藍（水是 [0.55, 0.78, 1]）——
 * 給純白出來會是一圈淡藍色的沫。把紅與綠先乘回去，
 * 落到畫面上才是白的。著色器最後有 clamp，不會過曝
 */
const FOAM_COLOR: [number, number, number] = [1.7, 1.25, 1.05]

/**
 * 這一刻的水面
 *
 * 與 aerial-perspective 的 airState 同一種寫法：資料放在模組上，
 * 材質綁定時自己來讀。水面只有兩三份材質，但漣漪的事件來自
 * 雨、玩家與日後任何想丟一顆石頭進去的東西——
 * 讓它們各自去找材質是不可能的，放在模組上才呼叫得到
 */
const waterState = {
  time: 0,
  shorelineStrength: 0,
  /** 每四個數字一圈：世界 X、世界 Z、已經過幾秒、濃度。濃度為零代表空槽 */
  rippleList: new Float32Array(RIPPLE_SLOT_COUNT * 4),
}

/**
 * 在水面上打一圈漣漪
 *
 * 呼叫者不必知道那裡有沒有水，也不必知道水面在多高——
 * 圈是畫在水面材質上的，畫不到沒有水的地方去。
 * 但仍然要篩：雨打在屋瓦與草地上的落點若也送進來，
 * 槽位會被那些畫不出來的圈佔滿，真正落在水上的反而排不進來
 */
export function emitWaterRipple(x: number, z: number, strength: number): void {
  const { rippleList } = waterState

  let slotIndex = -1
  let oldestAge = -1

  for (let index = 0; index < RIPPLE_SLOT_COUNT; index++) {
    const offset = index * 4
    if (rippleList[offset + 3] === 0) {
      slotIndex = offset
      break
    }

    /** 全滿時擠掉最老的那一圈，它本來就快淡光了 */
    const age = rippleList[offset + 2]!
    if (age > oldestAge) {
      oldestAge = age
      slotIndex = offset
    }
  }

  rippleList[slotIndex] = x
  rippleList[slotIndex + 1] = z
  rippleList[slotIndex + 2] = 0
  rippleList[slotIndex + 3] = strength
}

/**
 * 水面
 *
 * 原本的水是一張逐格播放的動畫貼圖，加上一道反日光的高光。
 * 那道高光很有效——它是靜水最有說服力的東西——但整片水
 * 除了那個亮點之外，從岸邊到湖心是同一個樣子。
 *
 * 這個外掛在水面上疊兩層東西，兩層都只畫在頂面那一面：
 *
 * 一是岸線。拿場景深度圖比對「我背後那塊實體有多近」，
 * 近的地方畫一道亮線——於是岸邊、睡蓮的莖、棧道的柱子、
 * 從水裡站起來的枯木，交界處全部自己浮出一圈白沫，
 * 而這件事完全不必知道那裡有什麼東西。
 *
 * 二是漣漪。雨滴與涉水的腳步各打出一圈往外擴的環。
 *
 * ── 拿掉過的兩層，以及為什麼 ──
 *
 * 一層是鋪滿整片水的細胞紋（水底焦散還在用的那一份），
 * 當時當成「水自己的紋理」。水面貼圖本來就有六格動畫在跑，
 * 再疊一層會蠕動的紋只是讓水變忙，而不是變得像水。
 *
 * 另一層是白天灑在水面上的亮片，想做的是「陽光碎在水面上」。
 * 做法是每四分之一格一個格點、門檻卡高、隨時間換位置——
 * 但那個做法沒有任何空間上的連續性：亮起來的是一個個
 * 邊長四分之一格的方塊，彼此無關，看起來不是波光而是雜訊在閃。
 *
 * 真要做這件事，該動的是法線而不是顏色：水面現在是一個
 * 光學上的平面（見 voxel-renderer 的 flatShaded），
 * 那道反日光的高光才只有一個點。讓法線隨波起伏，
 * 高光自己就會碎成一片——那是有物理根據的做法，
 * 不是在畫面上灑白點
 *
 * ── 為什麼只畫在頂面 ──
 *
 * 水的網格是一顆一顆的方塊，六個面都在。這幾層都是照世界的 XZ
 * 座標算的，畫到側面上會變成一條條垂直的抹痕——
 * 同一個 XZ 的所有高度都是同一個值。
 *
 * 法線幫不上忙：水是 flatShaded 的，六個面的法線都被改成朝上。
 * 所以改看頂點的區域座標——那顆方塊自己的上下——只有頂面那一圈是滿的
 */
class WaterSurfacePlugin extends MaterialPluginBase {
  constructor(material: Material) {
    /** 第六個參數是「一律啟用」，這個外掛沒有開關屬性，強弱全由 waterState 決定 */
    super(material, 'MinespaceWaterSurface', 215, {}, true, true)
  }

  getClassName(): string {
    return 'WaterSurfacePlugin'
  }

  getSamplers(samplerList: string[]): void {
    samplerList.push('waterDepthSampler')
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'waterParam', size: 4, type: 'vec4' },
        { name: 'waterScreen', size: 4, type: 'vec4' },
        { name: 'waterRippleList', size: 4, type: 'vec4', arraySize: RIPPLE_SLOT_COUNT },
      ],
    }
  }

  bindForSubMesh(uniformBuffer: UniformBuffer, _scene: Scene, engine: AbstractEngine): void {
    const depthTexture = sceneDepthState.texture

    /** 第一個是時間、第二個是岸線的強弱，後兩個留白 */
    uniformBuffer.updateFloat4(
      'waterParam',
      waterState.time,
      /** 沒有深度圖就沒有岸線，那一段直接跳過 */
      depthTexture && sceneDepthState.isEnabled ? waterState.shorelineStrength : 0,
      0,
      0,
    )

    /**
     * 深度圖與場景畫在同一個尺寸上，所以像素座標除以畫面大小
     * 就是取樣用的座標。硬體縮放會同時改動兩邊，每幀重讀才不會錯開
     */
    uniformBuffer.updateFloat4(
      'waterScreen',
      1 / engine.getRenderWidth(),
      1 / engine.getRenderHeight(),
      SHORELINE_WIDTH,
      SHORELINE_GLOW_WIDTH,
    )

    uniformBuffer.updateFloatArray('waterRippleList', waterState.rippleList)

    /** 關掉時也照樣綁：取樣器沒綁上去的話，驅動程式會抱怨 */
    if (depthTexture) {
      uniformBuffer.setTexture('waterDepthSampler', depthTexture)
    }
  }

  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    /**
     * 頂點這邊要準備兩件事
     *
     * 一是視空間的 Z，岸線要拿它與深度圖比對。這裡算的式子與 Babylon
     * 深度著色器裡那一行完全相同，兩邊比的才會是同一個量。
     *
     * 二是「這個頂點在不在頂面」。水面那一層的網格高度是 0.875 格、
     * 又往下烘了半個落差，區域座標的頂面因此落在 0.375。
     * 用 step 取出來之後，頂面四個角都是一，側面則從上緣的一
     * 一路內插到下緣的零——片段那邊再切一刀就只剩頂面
     */
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
          varying float vWaterViewZ;
          varying float vWaterTopFace;
        `,
        CUSTOM_VERTEX_MAIN_END: `
          vWaterViewZ = (view * worldPos).z;
          vWaterTopFace = step(${TOP_FACE_THRESHOLD.toFixed(3)}, position.y);
        `,
      }
    }

    if (shaderType !== 'fragment')
      return null

    return {
      /**
       * 取樣器與 varying 要自己宣告
       *
       * getSamplers 只是把名字報給 Babylon 去查位置，它不會替你寫那一行。
       * 統一緩衝區裡的三個 uniform 則是自動生成的，
       * 在這裡再寫一次就是重複宣告，整份材質會編譯失敗而整批不畫
       */
      CUSTOM_FRAGMENT_DEFINITIONS: `
        uniform sampler2D waterDepthSampler;
        varying float vWaterViewZ;
        varying float vWaterTopFace;

        /** 白沫的濃度，透明度那邊還要再用一次，所以放在外面 */
        float waterFoamMask = 0.0;
      `,
      /**
       * 疊在漫射色上，而不是最後的成品上
       *
       * 這個位置的顏色還沒有乘上光照，所以白沫會跟著天色走：
       * 夜裡的沫是暗的、黃昏是橘的、霧裡是灰的。
       * 疊在成品上的話，那圈白會在半夜的湖面上自己發亮
       */
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        if (vWaterTopFace > 0.9) {
          /**
           * 漣漪
           *
           * 每一圈是一條往外跑的環：半徑隨時間長大，濃度隨時間指數衰減。
           * 取最大值而不是相加——兩圈交會處相加會爆出一塊白，
           * 而水面上兩道波交會時本來就只是「比較亮的那一道」
           */
          float waterRipple = 0.0;
          for (int rippleIndex = 0; rippleIndex < ${RIPPLE_SLOT_COUNT}; rippleIndex++) {
            vec4 rippleEvent = waterRippleList[rippleIndex];
            if (rippleEvent.w <= 0.0) continue;

            float rippleDistance = length(vPositionW.xz - rippleEvent.xy);
            float ringRadius = rippleEvent.z * ${RIPPLE_SPEED.toFixed(3)};
            float ring = 1.0 - smoothstep(0.0, ${RIPPLE_WIDTH.toFixed(3)}, abs(rippleDistance - ringRadius));
            waterRipple = max(
              waterRipple,
              ring * rippleEvent.w * exp(-rippleEvent.z * ${RIPPLE_DECAY.toFixed(3)})
            );
          }

          /**
           * 岸線
           *
           * 深度圖裡沒有半透明的東西，所以這裡讀到的是水底下那塊實體，
           * 而不是水面自己。兩者的距離就是「這裡的水有多淺」
           */
          float waterShore = 0.0;
          if (waterParam.y > 0.0) {
            float waterSceneZ = texture2D(waterDepthSampler, gl_FragCoord.xy * waterScreen.xy).r;
            float waterGap = max(waterSceneZ - vWaterViewZ, 0.0);
            float waterLine = 1.0 - smoothstep(0.0, waterScreen.z, waterGap);
            float waterHalo = exp(-waterGap / waterScreen.w) * 0.55;
            waterShore = max(waterLine, waterHalo) * waterParam.y;
            waterShore = floor(waterShore * ${SHORELINE_STEP_COUNT.toFixed(1)}) / ${SHORELINE_STEP_COUNT.toFixed(1)};
          }

          waterFoamMask = clamp(max(waterRipple, waterShore), 0.0, 1.0);
          baseColor.rgb = mix(
            baseColor.rgb,
            vec3(${FOAM_COLOR.map((channel) => channel.toFixed(3)).join(', ')}),
            waterFoamMask
          );

        }
      `,
      /**
       * 白沫的地方要不透明一點
       *
       * 水本身是七成二的半透明，白沫若跟著半透明，
       * 水底的沙石會從那圈沫裡透出來——那不是泡沫，是漂白過的水。
       * 這一段在霧之後，所以遠處的白沫已經被霧收掉，不會硬生生浮出來
       */
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
        color.a = min(1.0, color.a + waterFoamMask * 0.4);
      `,
    }
  }
}

/**
 * 把水面效果掛到一份材質上
 *
 * 只掛在水面那一層的材質上（見 voxel-renderer 替液體另外開的那一份），
 * 水面以下那些滿格的水方塊、岩漿與其他兩百多份材質都不會被動到
 */
export function attachWaterSurface(material: StandardMaterial): void {
  // eslint-disable-next-line no-new
  new WaterSurfacePlugin(material)
}

export interface WaterSurface {
  dispose: () => void;
}

export interface CreateWaterSurfaceParams {
  scene: Scene;
  camera: UniversalCamera;
  waterMap: WaterMap;
}

/**
 * 推動水面
 *
 * 時間、漣漪的年齡與各層的強弱都在這裡寫進 waterState，
 * 材質下一次綁定時自己來讀
 */
export function createWaterSurface({
  scene,
  camera,
  waterMap,
}: CreateWaterSurfaceParams): WaterSurface {
  const { state: devToggle } = useDevToggles()
  const { quality } = useGraphicsQuality()

  /** 上一次濺出漣漪的地方，走遠一步才濺下一次 */
  let lastWadeX = camera.position.x
  let lastWadeZ = camera.position.z

  const observer = scene.onBeforeRenderObservable.add(() => {
    measureSection('水面', () => {
      const deltaSecond = scene.getEngine().getDeltaTime() / 1000
      waterState.time += deltaSecond

      for (let index = 0; index < RIPPLE_SLOT_COUNT; index++) {
        const offset = index * 4
        if (waterState.rippleList[offset + 3] === 0)
          continue

        const age = waterState.rippleList[offset + 2]! + deltaSecond
        waterState.rippleList[offset + 2] = age
        /** 過了壽命就把槽位讓出來 */
        if (age > RIPPLE_LIFETIME) {
          waterState.rippleList[offset + 3] = 0
        }
      }

      /**
       * 低畫質整套收掉
       *
       * 岸線那一趟深度預繪在低畫質本來就沒開，漣漪則是每片元八圈環、
       * 每圈一次指數衰減——不貴，但那一檔本來就在跟填充率計較。
       * 強度歸零之後著色器裡那幾段全部跳過，等於這個外掛不存在
       */
      const isEnabled = devToggle.waterShoreline && quality.value !== 'low'
      waterState.shorelineStrength = isEnabled ? SHORELINE_STRENGTH : 0

      if (!isEnabled)
        return

      /**
       * 涉水的腳步
       *
       * 走多遠濺一次，不是每幾秒濺一次：站著不動的人不該
       * 在自己腳邊持續打出一圈一圈的水波。
       *
       * 判斷「腳踩在水面附近」而不是「泡在水裡」：整個人沉下去之後
       * 水面在頭頂，那時該有的是頭頂的波紋，不是腳邊的
       */
      const footY = camera.position.y - PLAYER_EYE_HEIGHT
      const level = getWaterLevel(waterMap, camera.position.x, camera.position.z)
      if (level === null || footY > level + 0.2 || footY < level - 1.4)
        return

      const wadeDistance = Math.hypot(
        camera.position.x - lastWadeX,
        camera.position.z - lastWadeZ,
      )
      if (wadeDistance < WADE_RIPPLE_DISTANCE)
        return

      lastWadeX = camera.position.x
      lastWadeZ = camera.position.z
      emitWaterRipple(camera.position.x, camera.position.z, WADE_RIPPLE_STRENGTH)
    })
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      waterState.rippleList.fill(0)
    },
  }
}

/** 上一圈雨的漣漪是什麼時候放的 */
let lastRainRippleTime = Number.NEGATIVE_INFINITY

/**
 * 雨滴打在水面上的圈
 *
 * 給雨的粒子系統用：它每一幀已經算好幾十個落點，
 * 這裡負責篩出「真的打在水面上」的那幾個，再按節奏放行。
 *
 * 強度是固定的——一滴雨就是一滴雨，不必隨雨勢改。
 * 雨大的時候本來就是圈變多而不是變大
 */
export function emitRainRipple(
  waterMap: WaterMap,
  x: number,
  z: number,
  impactY: number,
): boolean {
  if (waterState.time - lastRainRippleTime < RAIN_RIPPLE_INTERVAL)
    return false

  const level = getWaterLevel(waterMap, x, z)
  if (level === null || Math.abs(impactY - level) > RAIN_RIPPLE_SURFACE_TOLERANCE)
    return false

  lastRainRippleTime = waterState.time
  emitWaterRipple(x, z, RAIN_RIPPLE_STRENGTH)

  return true
}
