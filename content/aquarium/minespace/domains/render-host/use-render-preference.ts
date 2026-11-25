import type { GraphicsQuality } from '../../composables/use-graphics-quality'
import type { TexturePackId } from '../block/texture-pack'
import type { RenderSettings } from './protocol'
import { createSharedComposable, useMediaQuery, useStorage } from '@vueuse/core'
import { computed } from 'vue'
import { DEV_TOGGLE_LIST, useDevToggles } from '../../composables/use-dev-toggles'
import { QUALITY_PRESET_MAP } from '../../composables/use-graphics-quality'
import { checkSupportsBump } from '../../composables/use-texture-pack'
import { getTexturePack, TEXTURE_PACK_LIST } from '../block/texture-pack'
import { DEFAULT_SUNRISE_AZIMUTH, INITIAL_DAY_SPEED_RATIO } from '../weather/day-night'
import { DEFAULT_CAMERA_FOV } from './render-constants'

/**
 * 使用者的畫面與時間偏好（主執行緒）
 *
 * 全部記在瀏覽器裡，下次進來還是同一種待法。
 * 渲染端在 worker 裡，沒有 localStorage 與 matchMedia，所以持久化留在這一邊，
 * 值再用訊息送過去（見 use-render-host）。
 *
 * 選單與主畫面共用同一份，所以是共用的 composable
 */
function _useRenderPreference() {
  const isMobile = useMediaQuery('(pointer: coarse)')

  /**
   * 沒選過是 null，不是預設值
   *
   * 直接把裝置判斷的結果當預設存進去是不行的：useMediaQuery 要等
   * 媒體查詢回報才知道答案，第一拍可能還是 false——手機上那一拍
   * 會把「高」寫進儲存並從此固定下來，之後再也回不到裝置該有的預設。
   *
   * 存 null 表示「使用者還沒表示意見」，這時每次都重新問裝置；
   * 一旦動過選單才寫進去。兩種狀態分開，誤判就不會被記成選擇
   */
  const storedQuality = useStorage<GraphicsQuality | null>('minespace-graphics-quality', null)

  /** 畫面等級：手機預設「效能」，電腦預設「高」，使用者可在系統選單中切換 */
  const quality = computed<GraphicsQuality>({
    get: () => {
      const stored = storedQuality.value
      /**
       * 存進去的可能已經不是有效的等級
       *
       * 這一版把等級從兩級擴成四級，舊值 low 與 high 都還在表裡；
       * 但哪天再改名，讀到認不得的字串時要退回裝置預設，
       * 而不是讓整套設定查到一個 undefined
       */
      if (stored && stored in QUALITY_PRESET_MAP)
        return stored

      return isMobile.value ? 'low' : 'high'
    },
    set: (value) => {
      storedQuality.value = value
    },
  })

  /**
   * 目前用哪一套材質包
   *
   * 挑材質包這件事比畫質更「這是我的世界該長什麼樣」，
   * 下次進來當然要還是同一套
   */
  const packId = useStorage<TexturePackId>('minespace-texture-pack', 'miniPixel')

  /**
   * 立體紋理
   *
   * 法線貼圖會讓每一顆方塊的表面真的凹凸起來，石縫與磚縫因此
   * 會隨太陽移動改變明暗——而不是把陰影畫死在圖上。
   *
   * 但它是有代價的：每一份材質多一次貼圖取樣，著色器也多一段
   * 切線空間的計算。開關獨立出來，機器跑不動的人可以只要高解析度的圖
   */
  const bumpEnabled = useStorage('minespace-texture-bump', true)

  /**
   * 記著的那一套可能已經不在了
   *
   * 材質包被移掉之後，瀏覽器裡存的還是舊的名字。
   * 這時要退回第一套，而不是讓整個世界找不到貼圖
   */
  const pack = computed(() => getTexturePack(packId.value))

  /** 這一套有沒有法線可用，沒有的話設定頁那個開關要收起來 */
  const supportsBump = computed(() => checkSupportsBump(pack.value))

  /**
   * 鏡頭的視野角度
   *
   * 視野寬窄是很個人的事：寬的看得到兩側的木座、走起來有速度感，
   * 窄的則像站定了在看一幅畫。記在瀏覽器裡，下次進來還是同一個視角
   */
  const cameraFov = useStorage('minespace-camera-fov', DEFAULT_CAMERA_FOV)

  /** 太陽從哪個方位升起，玩家自己決定的事 */
  const sunAzimuth = useStorage('minespace-sun-azimuth', DEFAULT_SUNRISE_AZIMUTH)

  /**
   * 時間會不會自己走
   *
   * 關掉之後天色就停在當下這一刻，滾輪與時間軸照樣能撥。
   * 有人是為了看日出來的，也有人只想在某個光線裡待著；
   * 這個選擇記在瀏覽器裡，下次進來還是同一種待法
   */
  const isAutoAdvance = useStorage('minespace-day-cycle', true)
  /** 一天走多快，0 為最緩、1 為最快，同樣記在瀏覽器裡 */
  const daySpeedRatio = useStorage('minespace-day-speed', INITIAL_DAY_SPEED_RATIO)

  const { state: devToggle } = useDevToggles()

  /** 整份設定的快照，init 與比對差異都用它。回傳的是純資料，過得了結構化複製 */
  function getSettings(): RenderSettings {
    return {
      quality: quality.value,
      cameraFov: cameraFov.value,
      sunAzimuth: sunAzimuth.value,
      isAutoAdvance: isAutoAdvance.value,
      daySpeedRatio: daySpeedRatio.value,
      texturePackId: packId.value,
      isBumpEnabled: bumpEnabled.value,
      devToggle: Object.fromEntries(
        DEV_TOGGLE_LIST.map((item) => [item.key, devToggle[item.key]]),
      ) as RenderSettings['devToggle'],
    }
  }

  return {
    isMobile,
    quality,
    packId,
    packList: TEXTURE_PACK_LIST,
    pack,
    bumpEnabled,
    supportsBump,
    cameraFov,
    sunAzimuth,
    isAutoAdvance,
    daySpeedRatio,
    getSettings,
  }
}

export const useRenderPreference = createSharedComposable(_useRenderPreference)
