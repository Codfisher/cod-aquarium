/**
 * 細胞紋的 GLSL
 *
 * 焦散的亮網與範例裡那張二維的圖用的是同一段程式碼，
 * 抽出來才不會兩邊各寫一份、改一邊忘了另一邊
 */

/** 一格方塊上有幾個貼圖像素，紋路的最小單位是它的倒數 */
export const CELL_TEXEL_SCALE = 16

/** 每個細胞中心的亂數源 */
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
 * blend 是兩個值要靠多近才開始互相抹平。給零就退化成一般的 min，
 * 相減之後整張圖是全黑，細胞邊界完全消失
 */
float waterSmoothMin(float left, float right, float blend) {
  float weight = max(blend - abs(left - right), 0.0) / blend;
  return min(left, right) - weight * weight * weight * blend / 6.0;
}

/**
 * 細胞中心會在自己的格子裡繞圈
 *
 * 這一項是水「活著」的來源。兩趟取樣必須用同一個式子，
 * 否則相減出來的不是邊界而是雜訊
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
       * 那是 GLSL 的內建函式名。宣告同名的變數在規格上是允許的，
       * 但那份寬容不是每張驅動都一樣，而編譯失敗的樣子是整片水不見
       */
      float cellDistance = length(neighbor + waterCellPoint(waterHash2(cell + neighbor), time) - offset);
      nearest = min(nearest, cellDistance);
      smoothNearest = waterSmoothMin(smoothNearest, cellDistance, blend);
    }
  }

  return nearest - smoothNearest;
}

/** 只取最近的那個中心，沒有相減的那一張碗 */
float waterCellDistance(vec2 point, float time) {
  vec2 cell = floor(point);
  vec2 offset = fract(point);

  float nearest = 8.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      float cellDistance = length(neighbor + waterCellPoint(waterHash2(cell + neighbor), time) - offset);
      nearest = min(nearest, cellDistance);
    }
  }

  return nearest;
}

/** 把世界座標對齊到貼圖的像素格 */
vec2 waterQuantize(vec2 worldPoint) {
  return floor(worldPoint * ${CELL_TEXEL_SCALE.toFixed(1)}) / ${CELL_TEXEL_SCALE.toFixed(1)};
}
`
