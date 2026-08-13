import type { Scene } from '@babylonjs/core'
import { Constants, RawTexture3D } from '@babylonjs/core'

/**
 * 查找表一邊有幾格
 *
 * 這裡曾經是十六，理由是「十六是通用尺寸，再細人眼也分不出來」。
 * 那句話對絕對誤差是成立的，對**斜率**卻完全不成立——
 * 而畫面上看得見的正是斜率。
 *
 * 取樣走的是三線性內插，也就是把一條平滑的曲線換成十五段折線。
 * 每一個節點上斜率會跳一下，落差大約是格距乘上二階導數。
 * 平常看不出來，但這個場景有兩片極平滑的東西疊在一起：
 * 天空的漸層，加上光暈那層放射狀的亮度。兩者相加之後，
 * 某一圈等亮度線剛好壓在節點上——那一圈就浮出來，
 * 看起來像光源外面套了一個淡淡的輪廓。
 *
 * 三十二格把格距與斜率落差各砍一半，成本是 32³ × 4 = 一二八 KB，
 * 對一張只建一次的表來說不算什麼
 */
const LUT_SIZE = 32

/**
 * 暗部抬起多少（0 ～ 1 的座標）
 *
 * 純黑在畫面上是一個洞：那裡沒有顏色，也就沒有空氣。
 * 抬起一點點之後，洞穴深處與夜色的暗部會浮出一層很淡的藍——
 * 那是天光照進來的樣子，也是「暗」與「什麼都沒有」的差別
 */
const SHADOW_LIFT: [number, number, number] = [0.012, 0.018, 0.032]

/**
 * 亮部往暖色偏多少
 *
 * 陽光是暖的。整套光照裡陽光已經是偏黃的了，但經過 ACES 色調映射
 * 之後，越亮的地方越往白色收——那是色調映射本來就在做的去飽和。
 * 這裡把那一段補回來：只補最亮的那幾階，中間調完全不動
 */
const HIGHLIGHT_WARMTH: [number, number, number] = [0.03, 0.012, -0.022]

/**
 * S 形曲線的強度
 *
 * 暗的更暗、亮的更亮，中間調維持原位。這與管線上那個 contrast
 * 不是同一件事：那個是整體線性拉伸，會把暗部一起壓死；
 * 這條曲線在兩端是收斂的，暗部只是變沉，不會變成一團黑
 */
const CONTRAST_STRENGTH = 0.16

/**
 * 綠色收斂多少
 *
 * 這座禪庭有大量的草、苔與松。貼圖上的綠是飽和的像素綠，
 * 一整片鋪開會壓過白沙與木頭那些低飽和的顏色，
 * 整個畫面的重心就跑到草地上去了。
 * 只對「綠明顯高過紅與藍」的那些顏色減一點飽和，
 * 天空的藍與夕陽的橘完全不受影響
 */
const GREEN_TAME = 0.12

/**
 * 綠超出多少才算滿檔
 *
 * 這一段是過渡帶的寬度。給得太窄，收斂的力道等於是瞬間到位，
 * 那與硬分支沒有分別；給到三分之一，從「有點綠」到「很綠」
 * 之間是一整段連續的變化
 */
const GREEN_TAME_RANGE = 0.34

/**
 * 整張畫面的色彩分級
 *
 * 日夜循環已經在用色調曲線做逐幀的色相與濃度漂移，那是「這一刻的天色」。
 * 這一張查找表管的是另一件事：不論幾點，這個世界看起來是什麼調子。
 *
 * 兩者不衝突，而且順序剛好對：影像處理的著色器是先套查找表、
 * 再套色調曲線，所以這裡定的是底，日夜在上面漂。
 *
 * 表本身是算出來的，不是畫出來的。這個場景所有的貼圖——太陽、月亮、
 * 星空、火焰、水滴、浮塵——都是當場畫進畫布的，沒有一個外部檔案；
 * 一張色彩分級表沒有理由破例。何況寫成程式之後，
 * 每一項調整都看得到它在做什麼，而不是一堆查不出來歷的數字
 */
function gradeChannel(value: number, index: number): number {
  /** 抬暗部：低處整段往上推，亮部幾乎不動 */
  const lifted = value + SHADOW_LIFT[index]! * (1 - value) ** 3

  /** 補亮部的暖：只有最亮那幾階吃得到 */
  const warmed = lifted + HIGHLIGHT_WARMTH[index]! * lifted ** 3

  /**
   * S 形曲線
   *
   * 平滑階梯函數與原值的差就是「這條曲線把它推去哪裡」，
   * 乘上強度再加回去，就得到一條可以無段調整的 S
   */
  const smooth = warmed * warmed * (3 - 2 * warmed)

  return warmed + (smooth - warmed) * CONTRAST_STRENGTH
}

/**
 * 把偏綠的顏色往它自己的灰度收一點
 *
 * 收多少要平滑地跟著「綠超出多少」走，中間不能有折角。
 *
 * 這裡原本是「不夠綠就原封不動回傳，夠綠才開始收」加上一個 min(1, x)，
 * 兩處都是折角。折角在顏色空間裡是一整片折面，烘進查找表之後
 * 就成了畫面上一道說不出來歷的界線。
 *
 * 換成平滑階梯函數之後，值與斜率在兩端都是連續的，
 * 綠色照樣收得住，卻不會在任何一個顏色上留下轉折
 */
function tameGreen(red: number, green: number, blue: number): [number, number, number] {
  const greenness = (green - Math.max(red, blue)) / GREEN_TAME_RANGE
  const clamped = Math.min(1, Math.max(0, greenness))
  const ratio = GREEN_TAME * clamped * clamped * (3 - 2 * clamped)

  const luma = red * 0.3 + green * 0.59 + blue * 0.11

  return [
    red + (luma - red) * ratio,
    green + (luma - green) * ratio,
    blue + (luma - blue) * ratio,
  ]
}

/**
 * 建立色彩分級用的立體查找表
 *
 * 影像處理只要求它是一張立體貼圖，三個軸依序是紅、綠、藍，
 * 取樣時直接拿畫面顏色當座標。所以這裡逐格算出
 * 「這個顏色進來，應該變成什麼顏色」，一次寫進緩衝區
 */
export function createColorGradeTexture(scene: Scene): RawTexture3D {
  const data = new Uint8Array(LUT_SIZE * LUT_SIZE * LUT_SIZE * 4)
  const step = 1 / (LUT_SIZE - 1)

  let offset = 0
  /** 藍是最外層，紅是最內層，順序要與著色器取樣的座標軸一致 */
  for (let blueIndex = 0; blueIndex < LUT_SIZE; blueIndex++) {
    for (let greenIndex = 0; greenIndex < LUT_SIZE; greenIndex++) {
      for (let redIndex = 0; redIndex < LUT_SIZE; redIndex++) {
        const [red, green, blue] = tameGreen(
          gradeChannel(redIndex * step, 0),
          gradeChannel(greenIndex * step, 1),
          gradeChannel(blueIndex * step, 2),
        )

        data[offset++] = toByte(red)
        data[offset++] = toByte(green)
        data[offset++] = toByte(blue)
        data[offset++] = 255
      }
    }
  }

  const texture = new RawTexture3D(
    data,
    LUT_SIZE,
    LUT_SIZE,
    LUT_SIZE,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
  )

  /**
   * 三個軸都要夾住
   *
   * 查找表的邊界就是純黑與純白。讓它循環的話，
   * 稍微超過一點的顏色會繞回另一端——畫面上會看到
   * 最亮的地方突然變成黑點
   */
  texture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE
  texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE
  texture.wrapR = Constants.TEXTURE_CLAMP_ADDRESSMODE
  texture.name = 'minespace-color-grade'

  return texture
}

function toByte(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
}
