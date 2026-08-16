import { createSharedComposable } from '@vueuse/core'
import { reactive, ref } from 'vue'

/**
 * 可以單獨關掉的效果
 *
 * 每一項都對應到一個看得見的東西。名字是給人看的，
 * 不是給程式配對的——面板上顯示什麼就寫什麼。
 *
 * 標籤跟著箱庭與音源那一套走，直接把兩種語言擺在一起。
 * 這種「一份資料自帶兩種說法」的東西不必進 useSimpleI18n：
 * 那份是給介面的固定字句用的，而這裡的清單本身就是資料
 */
export const DEV_TOGGLE_LIST = [
  { key: 'lampGlow', label: { 'zh-hant': '燈火光暈', 'en': 'Lamp glow' } },
  { key: 'skyGlow', label: { 'zh-hant': '日月光暈', 'en': 'Sun & moon glow' } },
  { key: 'aerialPerspective', label: { 'zh-hant': '大氣透視', 'en': 'Aerial perspective' } },
  { key: 'cloudShadow', label: { 'zh-hant': '雲影', 'en': 'Cloud shadow' } },
  { key: 'leafTranslucency', label: { 'zh-hant': '葉片透光', 'en': 'Leaf translucency' } },
  { key: 'pixelShadow', label: { 'zh-hant': '像素對齊陰影', 'en': 'Pixel-aligned shadow' } },
  { key: 'dithering', label: { 'zh-hant': '打散色階', 'en': 'Dithering' } },
  { key: 'multiSample', label: { 'zh-hant': '多重取樣', 'en': 'Multisampling' } },
  { key: 'contactShadow', label: { 'zh-hant': '接觸硬化陰影', 'en': 'Contact-hardening shadow' } },
  { key: 'airMotes', label: { 'zh-hant': '空氣顆粒', 'en': 'Air motes' } },
  { key: 'groundMist', label: { 'zh-hant': '貼地晨霧', 'en': 'Ground mist' } },
  { key: 'wetness', label: { 'zh-hant': '雨後濕潤', 'en': 'Wetness' } },
  { key: 'pondMirror', label: { 'zh-hant': '水面倒影', 'en': 'Water reflection' } },
  { key: 'waterGlint', label: { 'zh-hant': '水面高光', 'en': 'Water glint' } },
] as const

export type DevToggleKey = typeof DEV_TOGGLE_LIST[number]['key']

/**
 * 開發用的效果開關
 *
 * 這個場景的視覺是十幾層效果疊出來的，而它們是分好幾次加上去的。
 * 畫面上一旦冒出說不上來的東西——一圈輪廓、一片霧、一道邊——
 * 光靠讀程式碼幾乎不可能指出是誰做的：每一層單看都合理，
 * 疊在一起才出問題。
 *
 * 唯一可靠的辦法是一項一項關掉看。這份開關就是為此存在的：
 * 全部預設開著，按 F4 叫出面板，關掉哪一項畫面上的東西跟著消失，
 * 就是那一項。
 *
 * 不記進瀏覽器：這是除錯用的，重新整理該回到正常的樣子，
 * 免得哪天忘了自己關過什麼，對著少一半效果的畫面找半天
 */
function _useDevToggles() {
  const visible = ref(false)

  const state = reactive(
    Object.fromEntries(DEV_TOGGLE_LIST.map(({ key }) => [key, true])),
  ) as Record<DevToggleKey, boolean>

  function toggle(key: DevToggleKey): void {
    state[key] = !state[key]
  }

  function togglePanel(): void {
    visible.value = !visible.value
  }

  function resetAll(): void {
    for (const { key } of DEV_TOGGLE_LIST) {
      state[key] = true
    }
  }

  return { visible, state, toggle, togglePanel, resetAll }
}

export const useDevToggles = createSharedComposable(_useDevToggles)
