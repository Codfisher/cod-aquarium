/** 卡通描邊的共用配方：一圈深藍紫細線，讓低多邊模型像被細筆勾過邊。
 * 少了這一層，同一批模型看起來就是廉價的塑膠塊。
 */
import type { Engine } from '@babylonjs/core/Engines/engine'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { isCoarsePointerDevice } from '../shared/device-tier'

/** 描邊色。箱庭、六個世界與配件新建的網格都沿用同一個值 */
export const OUTLINE_COLOR = Color3.FromHexString('#2c2747')

/** 描邊寬度的基準值，與下方基準倍率成對使用。
 * 這個數字是在桌機 1.5 倍超取樣下調出來的，看起來約 0.6 個渲染像素寬
 */
const BASE_OUTLINE_WIDTH = 0.006
const BASE_SUPER_SAMPLE = 1.5

/** 手機的描邊加粗倍率。
 *
 * 按解析度等比換算後，手機的線在螢幕上仍然偏細，有兩個原因：實體像素密度高，
 * 同樣的渲染像素數攤在 dpr 3 的螢幕上顯得更細；而且手機關掉了 FXAA，
 * 細線少了後製收邊。加粗讓它回到「看得出是被筆勾過一圈」的份量。
 * 覺得還是太細或反而太重，動這個值就好
 */
const MOBILE_OUTLINE_BOOST = 2

/** 依引擎目前的渲染解析度換算描邊寬度。
 *
 * Babylon 的 outlineWidth 吃的是世界單位，換算到螢幕的粗細會隨渲染解析度浮動。
 * 手機取消超取樣後，同一個數值只剩三分之一個渲染像素寬——而低於一個像素的
 * 深色細線正是鋸齒的最壞情況：它無法連續覆蓋像素，只能斷斷續續地點在像素
 * 網格上，看起來就是一條碎掉的階梯，而不是一條變細的線。
 *
 * hardwareScalingLevel 是「一個渲染像素對應幾個 CSS 像素」，值越大解析度越低；
 * 寬度按同一比例補償，線在各裝置上就維持差不多的像素粗細
 */
export function resolveOutlineWidth(engine: Engine): number {
  const deviceBoost = isCoarsePointerDevice() ? MOBILE_OUTLINE_BOOST : 1
  return BASE_OUTLINE_WIDTH * BASE_SUPER_SAMPLE * engine.getHardwareScalingLevel() * deviceBoost
}
