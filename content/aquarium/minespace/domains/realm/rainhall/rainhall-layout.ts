import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 雨聽深院的尺寸與定點
 *
 * 地形 worker 與渲染端都讀這一份，所以只放純資料。
 *
 * 雨聽堂的用意：全庭唯一一座「從室內聽外面」的箱庭。三面牆、南面整片敞開，
 * 人坐在榻榻米上往外看；雨打在屋瓦、順著出簷落下來，在地上連成一條滴水線，而你是乾的。
 * 這裡把那間屋子放大成一座深院：北邊一間大堂（同樣三面牆、南面敞開），
 * 東西南三面一圈有頂的迴廊，中間是淋著滂沱大雨的石板中庭。
 * 人可以沿著迴廊繞一整圈，一路都在簷下、一路看著雨落進中庭
 *
 * 座標都是相對院子中心的格數（RAINHALL_CENTER），方塊頂面高度是 RAINHALL_FLOOR_Y
 */

export const RAINHALL_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 石板與木地板那一層的頂面高度，腳底整數高度是它加一 */
export const RAINHALL_FLOOR_Y = 10

/** 矩形範圍（含兩端），相對院子中心 */
export interface RainhallRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * 大堂：牆的那一圈
 *
 * 北、東、西三面是牆，南面（maxZ 那一排）整排敞開。牆高五格（雨聽堂四格，大堂高一格才撐得住這個寬），
 * 出簷比牆寬一格，屋頂再往上收兩層，與雨聽堂同一種收法（共三層，站在屋裡不會被當成洞穴壓暗）
 */
export const HALL_RECT: RainhallRect = { minX: -11, maxX: 11, minZ: -26, maxZ: -14 }
export const HALL_WALL_HEIGHT = 5

/**
 * 迴廊
 *
 * 外牆那一圈的矩形，迴廊在它裡面三格寬（外牆一格、走道三格、內側一排柱子），
 * 北面不走迴廊，改由一道牆封起來；大堂前兩角各一道短廊接到東西兩面的迴廊
 */
export const CLOISTER_OUTER_RECT: RainhallRect = { minX: -23, maxX: 23, minZ: -28, maxZ: 28 }
/** 迴廊牆高（四格），屋頂在它上面一層 */
export const CLOISTER_WALL_HEIGHT = 4
/** 走道寬（不含外牆），內側一排柱子落在走道最內那一格 */
export const CLOISTER_WIDTH = 4

/**
 * 大堂前兩角接到迴廊的短廊（渡廊）
 *
 * 從大堂敞開的那一排往東西兩邊伸出去，三格寬；
 * 短廊北邊是大堂側牆外的兩塊小庭（從大堂的側窗看得到），南邊是中庭
 */
export const BRIDGE_MIN_Z = -14
export const BRIDGE_MAX_Z = -12

/**
 * 回程門：大堂裡最深的那一處，貼著北牆、門洞朝南
 *
 * 大廳那一座立在雨聽堂屋裡（同樣貼著北牆、門洞朝南），人從屋前走進屋、穿過坐墊之間走進門裡；
 * 到了這裡是從大堂最裡面的門走出來，轉身就是整排敞開的南面與門外的大雨
 */
export const RAINHALL_PORTAL_POINT = { x: RAINHALL_CENTER.x, z: RAINHALL_CENTER.z + HALL_RECT.minZ + 1 }

/** 中庭正中那一大窪積水（滴水線上那幾窪放大） */
export const COURTYARD_POOL = { x: 0, z: 6, radius: 4.5 }

/** 邊界只是保險：外牆四面封住，推回線在牆外 */
export const RAINHALL_SLOW_RADIUS = 38
export const RAINHALL_PUSH_RADIUS = 46

/**
 * 大廳那座門在雨聽堂裡的位置（相對箱庭中心）
 *
 * 屋子裡面是 -2..2 見方的榻榻米，北牆在 -3。門貼著北牆立在 (0, -2)、門洞朝南，
 * 等於屋子最裡面的那一格「床之間」；坐墊在門前四格的開口邊上，回來時正好落在兩個坐墊中間
 */
export const RAINHALL_HUB_GATE_OFFSET = { x: 0, z: -2 } as const
