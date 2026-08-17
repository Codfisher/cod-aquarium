/**
 * 水的雜湊與細胞紋
 *
 * 兩段 GLSL，兩種讀者。
 *
 * 雜湊那一段誰都會用到——水面的亮片靠它決定哪幾格此刻在閃，
 * 細胞紋則拿它當每個細胞中心的亂數源。
 *
 * 細胞紋目前只有水底的焦散在用。水面上曾經也鋪過一層（當成水自己的
 * 紋理），拿掉了——理由寫在 water-surface 的說明裡。兩段分開放，
 * 水面就不必為了一個雜湊把整套細胞紋也編進去。
 *
 * ── 細胞邊界是怎麼取出來的 ──
 *
 * Voronoi 給的是「離最近的細胞中心多遠」，那是一張以中心為零的碗，
 * 邊界在碗與碗相接的地方——但那個相接處在數值上並不特別，
 * 挑不出一條線來。
 *
 * 訣竅是再算一次同樣的東西，只是把 min 換成平滑的 min：
 * 平滑版在細胞中心與原版完全一致（那裡只有一個碗，沒得平滑），
 * 到了兩碗相接處才被抹掉一角。兩者相減，中心是零、邊界是正值，
 * 一條沿著細胞邊界的脊線就浮出來了。
 *
 * 兩趟共十八次雜湊，這是整個效果最貴的地方
 *
 * ── 為什麼取樣座標要先量化 ──
 *
 * 這套美術是十六格見方的像素畫：貼圖用最近鄰、法線用最近鄰、
 * 刻意不開 FXAA。一張平滑的細胞圖疊上去，會是全場唯一
 * 帶著平滑曲線的東西——像在一幅點陣圖上蓋了一層向量圖形。
 *
 * 把世界座標先對齊到貼圖的像素格再送進雜湊，出來的紋路
 * 就只能沿著格線轉折，與方塊表面上那些方方正正的像素同一個節奏
 */

/** 一格方塊上有幾個貼圖像素，紋路的最小單位是它的倒數 */
export const WATER_TEXEL_SCALE = 16

/**
 * 每個人都要的那一個雜湊
 *
 * 同一份材質上的兩個外掛不能各自注入一次，那是重複宣告、整份編譯失敗。
 * 目前不會發生：水的材質不掛焦散（見 pixel-material），
 * 而水面只注入這一段、焦散注入這一段加下面那一段
 */
export const WATER_HASH_GLSL = `
vec2 waterHash2(vec2 point) {
  point = vec2(dot(point, vec2(127.1, 311.7)), dot(point, vec2(269.5, 183.3)));
  return fract(sin(point) * 43758.5453);
}
`

/**
 * 細胞紋
 *
 * 要與 {@link WATER_HASH_GLSL} 一起注入，它靠 waterHash2 生細胞中心
 */
export const WATER_CELL_GLSL = `

/**
 * 平滑的 min
 *
 * k 是兩個值要靠多近才開始互相抹平。給零就退化成一般的 min，
 * 相減之後整張圖是全黑——細胞邊界完全消失
 */
float waterSmoothMin(float left, float right, float blend) {
  float weight = max(blend - abs(left - right), 0.0) / blend;
  return min(left, right) - weight * weight * weight * blend / 6.0;
}

/**
 * 細胞中心會在自己的格子裡繞
 *
 * 這一項是水「活著」的來源：中心繞圈，邊界就跟著蠕動。
 * 兩趟取樣必須用同一個式子，否則相減出來的不是邊界而是雜訊
 */
vec2 waterCellPoint(vec2 seed, float time) {
  return 0.5 + 0.5 * sin(time + 6.2831 * seed);
}

/** 細胞邊界：中心為零，邊界為正 */
float waterCellEdge(vec2 point, float time, float blend) {
  vec2 cell = floor(point);
  vec2 offset = fract(point);

  float nearest = 8.0;
  float smoothNearest = 8.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      /**
       * 不要把這個變數叫 distance
       *
       * 那是 GLSL 的內建函式名。宣告同名的變數在規格上是允許的
       * （使用者變數可以蓋掉內建函式），但那份寬容不是每張驅動都一樣，
       * 而編譯失敗的樣子是整片水不見
       */
      float cellDistance = length(neighbor + waterCellPoint(waterHash2(cell + neighbor), time) - offset);
      nearest = min(nearest, cellDistance);
      smoothNearest = waterSmoothMin(smoothNearest, cellDistance, blend);
    }
  }

  return nearest - smoothNearest;
}

/** 把世界座標對齊到貼圖的像素格 */
vec2 waterQuantize(vec2 worldPoint) {
  return floor(worldPoint * ${WATER_TEXEL_SCALE.toFixed(1)}) / ${WATER_TEXEL_SCALE.toFixed(1)};
}
`
