import type { Camera, Mesh, Scene, UniversalCamera } from '@babylonjs/core'
import { Texture, Vector3, VolumetricLightScatteringPostProcess } from '@babylonjs/core'
import { watch } from 'vue'
import {
  CLOUD_LAYER_NAME,
  MOON_DISC_NAME,
  MOON_GLOW_NAME,
  OVERCAST_NAME,
  SKYBOX_NAME,
  STAR_FIELD_NAME,
  SUN_DISC_NAME,
  SUN_GLOW_NAME,
} from '../../composables/use-babylon-scene'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'

/**
 * 遮蔽用那一張圖畫多大
 *
 * 光束是一團糊開的東西，解析度低到四分之一也看不出差別，
 * 但那一張圖每一幀要把全世界重畫一次，能省的都得省
 */
const PASS_RATIO = 0.25

/** 沿著光線取樣幾次，越多越平滑也越貴 */
const SAMPLE_COUNT = 60

/** 光束最強時的曝光 */
const MAX_EXPOSURE = 0.32

/**
 * 太陽要離視野中心多近才點亮光束
 *
 * 太陽跑到背後時，投影出來的原點落在畫面之外，
 * 光束會變成從螢幕邊緣掃進來的一道怪東西。
 * 背對太陽時本來就不該看到光束，直接關掉最乾淨
 */
const FACING_THRESHOLD = 0.1
const FACING_FULL = 0.45

export interface GodRays {
  /**
   * 設定光束強度，0 為完全關閉
   *
   * 關閉時連那張遮蔽圖都會從算繪清單裡拿掉——
   * 光束平常不該存在，就不該讓它每一幀把世界多畫一次
   */
  setStrength: (ratio: number) => void;
  dispose: () => void;
}

/**
 * 晨昏的光束
 *
 * 做法是螢幕空間的放射狀模糊：先把場景畫成一張只有太陽是亮的黑白圖，
 * 再沿著「太陽在畫面上的位置」往外一路取樣疊加。
 * 擋在太陽前面的樹與鳥居會在那張圖上留下黑影，
 * 於是光束自然就從枝葉的縫隙裡透出來。
 *
 * 代價是那張遮蔽圖要把整個世界重畫一次。所以它只在該出現的時候存在：
 * 太陽貼近地平線、而且人正對著它的那幾十秒
 */
export function createGodRays(scene: Scene, camera: UniversalCamera): GodRays {
  const { preset } = useGraphicsQuality()

  const sunDisc = scene.getMeshByName(SUN_DISC_NAME) as Mesh | null
  /**
   * 這一級不做螢幕空間的光束就整個不建
   *
   * 最省的那一級是完全不要；極致那一級則是換成沿著視線行進的版本
   * （見 volumetric-light.ts），兩者都不該讓這一趟遮蔽圖存在
   */
  if (!sunDisc || preset.value.volumetric !== 'screen') {
    return { setStrength: () => {}, dispose: () => {} }
  }

  const godRays = new VolumetricLightScatteringPostProcess(
    'god-rays',
    { postProcessRatio: 1, passRatio: PASS_RATIO },
    camera,
    sunDisc,
    SAMPLE_COUNT,
    Texture.BILINEAR_SAMPLINGMODE,
    scene.getEngine(),
    false,
    scene,
  )

  /**
   * 補上它自己漏掉的預設參數
   *
   * VolumetricLightScatteringPostProcess.dispose 的第一行是
   * `camera.getScene().customRenderTargets.indexOf(...)`——它無條件讀 camera，
   * 而基底類別的 dispose 那個參數本來是選填的。
   *
   * 場景自己回收後製時（Scene._disposeList）是不帶參數呼叫的，
   * camera 於是是 undefined，整個 engine.dispose 當場中斷在這裡，
   * 後面該收的東西全部沒收到。只要頁面卸載或熱更新就會踩到。
   *
   * 這是 Babylon 那邊的疏漏，我們改不了它的原始碼，
   * 但可以把相機綁死在這個實例上：兩種呼叫方式都走得通
   */
  const disposeGodRays = godRays.dispose.bind(godRays)
  godRays.dispose = (disposeCamera?: Camera) => {
    disposeGodRays(disposeCamera ?? camera)
  }

  /**
   * 太陽的位置要自己算
   *
   * 太陽那片網格開著 infiniteDistance，它的 position 存的是「相對鏡頭的偏移」
   * 而不是世界座標。交給後製自己去讀，投影出來的原點會落在世界原點附近，
   * 光束的方向整個是錯的
   */
  godRays.useCustomMeshPosition = true
  godRays.customMeshPosition = new Vector3()

  godRays.decay = 0.965
  godRays.weight = 0.58
  godRays.density = 0.92
  godRays.exposure = 0

  /**
   * 把罩住整片天的東西排除在遮蔽圖之外
   *
   * 遮蔽圖裡除了太陽以外全部畫成黑色，天空罩、星空盒與陰天罩
   * 都是包住鏡頭的盒子——留著它們，太陽會被自己的背景蓋掉，
   * 一道光束都出不來
   */
  const excludedNameList = [
    SKYBOX_NAME,
    STAR_FIELD_NAME,
    OVERCAST_NAME,
    CLOUD_LAYER_NAME,
    SUN_GLOW_NAME,
    MOON_DISC_NAME,
    MOON_GLOW_NAME,
  ]
  for (const name of excludedNameList) {
    const mesh = scene.getMeshByName(name)
    if (mesh) {
      godRays.excludedMeshes.push(mesh)
    }
  }

  /** 遮蔽圖是掛在鏡頭上的，關閉時要從清單裡拿掉才真的省下那一次重畫 */
  const scatteringTexture = camera.customRenderTargets
    .find((target) => target.name === 'volumetricLightScatteringMap')

  let isEnabled = true

  function setEnabled(nextEnabled: boolean): void {
    if (nextEnabled === isEnabled)
      return

    isEnabled = nextEnabled

    if (nextEnabled) {
      /**
       * 插在最前面
       *
       * 後製鏈的順序就是套用的順序。光束要在色調映射之前疊上去，
       * 才會跟著整個畫面一起被曝光曲線壓過；擺在後面則是疊在成品上，
       * 亮部會直接爆掉
       */
      camera.attachPostProcess(godRays, 0)
      if (scatteringTexture && !camera.customRenderTargets.includes(scatteringTexture)) {
        camera.customRenderTargets.push(scatteringTexture)
      }
      return
    }

    camera.detachPostProcess(godRays)
    if (scatteringTexture) {
      const index = camera.customRenderTargets.indexOf(scatteringTexture)
      if (index !== -1) {
        camera.customRenderTargets.splice(index, 1)
      }
    }
  }

  setEnabled(false)

  const stopQualityWatch = watch(preset, (currentPreset) => {
    if (currentPreset.volumetric !== 'screen') {
      setEnabled(false)
    }
  })

  /** 鏡頭正面與太陽方向的夾角，背對太陽時淡出 */
  function measureFacingRatio(): number {
    const forward = camera.getDirection(Vector3.Forward())
    const toSun = sunDisc!.position
    const length = toSun.length()
    if (length < 1e-3)
      return 0

    const facing = Vector3.Dot(forward, toSun) / length

    return smoothRange(facing, FACING_THRESHOLD, FACING_FULL)
  }

  return {
    setStrength(ratio: number) {
      const strength = preset.value.volumetric === 'screen'
        ? ratio * measureFacingRatio()
        : 0

      setEnabled(strength > 0.01)
      if (strength <= 0.01)
        return

      /** 太陽掛在鏡頭前方固定的距離上，換算回世界座標才投影得對 */
      godRays.customMeshPosition
        .copyFrom(camera.position)
        .addInPlace(sunDisc!.position)

      godRays.exposure = MAX_EXPOSURE * strength
    },
    dispose() {
      stopQualityWatch()
      setEnabled(false)
      godRays.dispose(camera)
    },
  }
}

function smoothRange(value: number, from: number, to: number): number {
  const ratio = Math.min(1, Math.max(0, (value - from) / (to - from)))

  return ratio * ratio * (3 - 2 * ratio)
}
