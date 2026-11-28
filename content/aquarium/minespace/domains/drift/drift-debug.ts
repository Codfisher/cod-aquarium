/**
 * 神遊的除錯快照（只在開發模式用）
 *
 * 使用者看神遊時覺得哪裡不對（一直看山壁、飛太高、轉太快），光說「剛剛那一段」沒辦法查。
 * 開發模式下按 F10 打開除錯面板，渲染端每秒四次送一份快照上來：鏡頭在哪、朝哪、
 * 現在是哪個階段／段落／鏡位、視線對著什麼、看不看得到、正前方多深。面板可以把最近的快照複製成文字貼回來。
 *
 * 這個檔案只有型別與把快照排成一行文字的函式，渲染端與主執行緒共用；
 * 快照本身由 use-drift 的 getDebugSnapshot 產生（沒人要就不算，平常零成本）
 */

export interface DriftDebugSnapshot {
  /** 這一場神遊的短代號（每次開始神遊重抽）與已經過了幾秒 */
  sessionId: string;
  clock: number;
  realmId: string;
  /** 時刻（零到一）與時段（day、noon、golden、blue、night） */
  timeOfDay: number;
  slot: string;
  /** 鏡頭的位置（眼睛，世界座標） */
  x: number;
  y: number;
  z: number;
  /** 鏡頭的朝向（度）：偏航零是朝 +Z、順著 +X 遞增；俯仰正值往下看。含使用者拖曳的偏移 */
  yawDegree: number;
  pitchDegree: number;
  /** 視野（度），鏡頭沒有視野資料時是 null；zoom 是視野相對於使用者設定的比例 */
  fovDegree: number | null;
  zoom: number;
  /** 階段（walk、linger、fly）、段落（travel、approach、glide、visit:orbit…）、鏡位（follow、truck、orbit…） */
  phase: string;
  sequence: string;
  shot: string;
  /** 這個鏡位已經過了幾秒，以及預計總共幾秒（估計值；算不出來是 null） */
  shotElapsed: number;
  shotTotal: number | null;
  /** 這一趟路走了幾成（零到一），停留時是 null */
  tripProgress: number | null;
  /** 停留已經過了幾秒、預計停幾秒、現在這一段在做什麼（hold、pan、orbit、crane、tilt、anticipate）；不是停留時是 null */
  lingerElapsed: number | null;
  lingerDuration: number | null;
  beat: string | null;
  /**
   * 視線對著什麼：
   * path-tangent（前進方向）、path-tangent+room（前進方向加留白偏角）、feature（特色主體）、destination（目的地）、
   * origin（回頭看來處）、side-subject（側面的景物）、sound-source（音源）、path-lead（沿線前方）、
   * outward／inward（場景偏好的方向）、locked-direction（側移鎖定的方向）、pan（橫搖）、
   * next-path（轉向下一段路）、fallback:open-direction（沒有主體，看縱深最長的方向）
   */
  look: string;
  /** 視線對著的主體：名字與種類（不是特色主體時是 null）、水平距離（格）、三維視線有沒有被擋住 */
  targetName: string | null;
  targetKind: string | null;
  targetDistance: number | null;
  isTargetVisible: boolean | null;
  /** 畫面正中央那一束視線打到東西的距離（格，最遠五十），以及是不是近牆（不到十格） */
  viewDepth: number;
  isNearWall: boolean;
  /** 沿軌道的速度（格／秒） */
  speed: number;
  /** 這一趟要去的停留點（編號，是觀賞站位時附主體名字）；沒有是 null */
  destination: string | null;
  /** 鏡頭離正下方的地面（或樹冠、屋頂）多高（格） */
  altitude: number;
  isGlide: boolean;
  /** 使用者拖曳轉頭的偏航偏移（度） */
  userYawDegree: number;
}

/** 文字格式的版本：欄位有增減就加一，貼回來的文字才知道是哪一版 */
export const DRIFT_DEBUG_FORMAT_VERSION = 1

function formatNumber(value: number | null, digitCount: number): string {
  return value === null || !Number.isFinite(value) ? '-' : value.toFixed(digitCount)
}

/** 名字裡的空白換成底線：一行文字用空白分欄，名字不能自己帶空白 */
function formatName(value: string | null): string {
  return value === null || value === '' ? '-' : value.replace(/\s+/g, '_')
}

/**
 * 把快照排成一行文字
 *
 * 格式固定：開頭是 `drift/版本`，之後每一欄是 `鍵=值`、以一個空白分隔，沒有值的欄位是 `-`；
 * 欄位的順序與名稱不變（要改就把版本加一），所以貼回來的文字可以直接用空白與等號切開
 */
export function formatDriftDebugLine(snapshot: DriftDebugSnapshot): string {
  return [
    `drift/${DRIFT_DEBUG_FORMAT_VERSION}`,
    `sid=${snapshot.sessionId}`,
    `t=${formatNumber(snapshot.clock, 1)}`,
    `realm=${snapshot.realmId}`,
    `tod=${formatNumber(snapshot.timeOfDay, 3)}`,
    `slot=${snapshot.slot}`,
    `pos=${formatNumber(snapshot.x, 1)},${formatNumber(snapshot.y, 1)},${formatNumber(snapshot.z, 1)}`,
    `yaw=${formatNumber(snapshot.yawDegree, 1)}`,
    `pitch=${formatNumber(snapshot.pitchDegree, 1)}`,
    `fov=${formatNumber(snapshot.fovDegree, 1)}`,
    `zoom=${formatNumber(snapshot.zoom, 2)}`,
    `phase=${snapshot.phase}`,
    `seq=${formatName(snapshot.sequence)}`,
    `shot=${snapshot.shot}`,
    `shotT=${formatNumber(snapshot.shotElapsed, 0)}/${formatNumber(snapshot.shotTotal, 0)}`,
    `trip=${snapshot.tripProgress === null ? '-' : `${Math.round(snapshot.tripProgress * 100)}%`}`,
    `stay=${formatNumber(snapshot.lingerElapsed, 0)}/${formatNumber(snapshot.lingerDuration, 0)}`,
    `beat=${formatName(snapshot.beat)}`,
    `look=${snapshot.look}`,
    `target=${formatName(snapshot.targetName)}`,
    `kind=${formatName(snapshot.targetKind)}`,
    `dist=${formatNumber(snapshot.targetDistance, 0)}`,
    `vis=${snapshot.isTargetVisible === null ? '-' : snapshot.isTargetVisible ? 1 : 0}`,
    `depth=${formatNumber(snapshot.viewDepth, 1)}`,
    `wall=${snapshot.isNearWall ? 1 : 0}`,
    `speed=${formatNumber(snapshot.speed, 2)}`,
    `alt=${formatNumber(snapshot.altitude, 1)}`,
    `glide=${snapshot.isGlide ? 1 : 0}`,
    `dest=${formatName(snapshot.destination)}`,
    `user=${formatNumber(snapshot.userYawDegree, 0)}`,
  ].join(' ')
}
