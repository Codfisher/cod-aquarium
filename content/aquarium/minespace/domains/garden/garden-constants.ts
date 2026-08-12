/**
 * 禪庭的高度基準
 *
 * 這裡只放純數字，因為地形生成跑在 Worker 裡，
 * 拉進 Babylon 的型別會把整包引擎帶進 Worker。
 * 顏色與霧氣一律放在 weather/atmosphere.ts
 */

/**
 * 白沙最上層方塊的高度
 *
 * 方塊中心落在整數座標，所以這一層的頂面在 6.5，
 * 站在沙上的腳底也就在 6.5
 */
export const SAND_LEVEL = 6
/** 站在白沙上的腳底整數高度，getGroundY 回傳的就是這個值 */
export const SAND_GROUND_Y = SAND_LEVEL + 1

/**
 * 木座下方墊的一圈石
 *
 * 木頭直接插進沙裡看起來像沉下去了，
 * 底下墊一圈白砂岩，木座才像是被架在沙上
 */
export const PLINTH_MARGIN = 1

/**
 * 循環邊界離最外側箱庭至少要留這麼遠
 *
 * 玩家跨過邊界的那一瞬間會被送到對面，
 * 兩邊在霧氣範圍內都必須是一模一樣的空白沙地，
 * 否則會看到景物瞬間跳掉。
 * 這個值必須大於霧氣的終點距離（見 atmosphere.ts 的 GARDEN_FOG_END）
 */
export const LOOP_CLEARANCE = 42
