import type { RenderSettings, RenderSettingsMessage } from './protocol'
import { reactive } from 'vue'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { DEFAULT_SUNRISE_AZIMUTH, INITIAL_DAY_SPEED_RATIO } from '../weather/day-night'
import { DEFAULT_CAMERA_FOV } from './render-constants'

/**
 * 渲染端讀得到的設定
 *
 * worker 裡沒有 localStorage，也沒有 matchMedia，VueUse 的 useStorage 與 useMediaQuery 在那裡都不能用。
 * 所以持久化留在主執行緒（見 use-render-preference），這裡只是同一組欄位的響應式副本，
 * 由 init 與 settings 訊息寫入。渲染端的程式照舊讀 preset.value.cloudStepCount 這類介面，
 * 不必知道值是從哪來的
 *
 * devToggle 不放在這裡：它本來就是純響應式、不碰儲存，各執行緒各有一份自己的
 * （use-dev-toggles 的狀態建在模組層級，每條執行緒的模組各求值一次，所以是同一份），
 * 訊息直接寫進那一份。不能用 createSharedComposable 來做這件事：
 * 它在沒有 window 與 document 的環境（worker）會失效，每次呼叫都長出新的狀態
 */
export type RenderSettingsState = Omit<RenderSettings, 'devToggle'>

/**
 * 沒收到 init 之前的預設值
 *
 * 實際的值一律以主執行緒送來的為準，這份只是讓欄位有個合理的起點。
 * 預設值取自與主執行緒相同的常數，兩邊不會各說各話
 */
function createDefaultState(): RenderSettingsState {
  return {
    quality: 'high',
    cameraFov: DEFAULT_CAMERA_FOV,
    sunAzimuth: DEFAULT_SUNRISE_AZIMUTH,
    isAutoAdvance: true,
    daySpeedRatio: INITIAL_DAY_SPEED_RATIO,
    texturePackId: 'miniPixel',
    isBumpEnabled: true,
    locale: 'zh-hant',
  }
}

export const renderSettings = reactive<RenderSettingsState>(createDefaultState())

/** 套用主執行緒送來的設定，只動有給的欄位 */
export function applyRenderSettings(patch: RenderSettingsMessage['patch'] | RenderSettings): void {
  const { devToggle, ...rest } = patch

  Object.assign(renderSettings, rest)

  if (devToggle) {
    const { state } = useDevToggles()
    Object.assign(state, devToggle)
  }
}
