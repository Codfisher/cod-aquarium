/** 共用的 low poly 調色盤。
 *
 * 與先前的紙工藝配色最大的差別是**彩度與明度階差**：
 * 紙材需要低彩度、相近明度才像同一疊紙；low poly 剛好相反，
 * 它靠「每個面各自吃到不同光」讀出形體，所以顏色要夠飽和、
 * 同色系的深淺要拉開，切面才會彼此分明而不糊成一團。
 *
 * 三階不是純明度階梯，而是 **hue-shift ramp**：deep 往藍紫轉
 * （呼應後製 split toning 的暗部色相 264°）、light 往暖黃轉（45°）。
 * 同色相等距升明度是「程式算出來的顏色」的特徵；手繪的暗部一定偏冷、
 * 亮部一定偏暖，材質層先帶這個偏移，後製再疊一層才夠力。
 *
 * 每組都給 deep / base / light 三階，供 applyHeightGradient 之外
 * 再做一次手動的面向區分（例如頂面用 light、側面用 base、底面用 deep）。
 */

export const LOW_POLY_PALETTE = {
  /** 水：深潭到淺灘。深水偏藍紫、淺灘往青綠走 */
  waterDeep: '#1a4578',
  water: '#2a93b8',
  waterLight: '#58d4c7',

  /** 岩石：偏冷的藍灰，與暖色的沙土拉開 */
  stoneDeep: '#394158',
  stone: '#61748a',
  stoneLight: '#8faab3',

  /** 沙土與泥地：暗部往焦赭紅走 */
  soilDeep: '#883a1f',
  soil: '#c08339',
  soilLight: '#e0bf5c',

  /** 植被：暗部偏藍綠、亮部偏黃綠 */
  leafDeep: '#276953',
  leaf: '#46a05e',
  leafLight: '#90c46f',

  /** 木頭：暗部偏紅褐 */
  woodDeep: '#5b271d',
  wood: '#8a5a2f',
  woodLight: '#b59a4a',

  /** 暖色重點：珊瑚紅，用在需要跳出來的東西。暗部往洋紅收 */
  coralDeep: '#b6283c',
  coral: '#e0644a',
  coralLight: '#f0ac6f',

  /** 金屬與高光重點：暗部是焦橘而非土黃 */
  goldDeep: '#c8540a',
  gold: '#f0b429',
  goldLight: '#ffd966',

  /** 淺色骨白，取代原本的紙白：略帶灰而非泛黃 */
  boneDeep: '#b3a79d',
  bone: '#dcd7c9',
  boneLight: '#f2efe4',

  /** 最深的暗部與描邊，統一往藍紫走 */
  inkDeep: '#191d30',
  ink: '#2a3a4d',
} as const

export type LowPolyColorName = keyof typeof LOW_POLY_PALETTE
