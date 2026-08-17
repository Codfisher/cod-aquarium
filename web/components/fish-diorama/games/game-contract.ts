/** 迷你遊戲的契約層。
 *
 * 每款遊戲拿到一個由 game-host 建好的獨立 Scene（已套好箱庭風格的燈光與後製），
 * 只需在裡面蓋自己的世界、每幀 update、把分數回報出去。
 * 引擎生命週期、渲染迴圈、暫停、resize、HUD 全部由 host 處理。
 */
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { Scene } from '@babylonjs/core/scene'
import type { DioramaLighting, DioramaLightingOptions } from '../engine/diorama-lighting'
import type { DioramaLookOptions } from '../engine/diorama-look'
import type { RewardId } from '../rewards/reward-registry'

export type MiniGameId =
  | 'crayonSlide'
  | 'shutterMusou'
  | 'stoneHop'

/** 指標事件。座標同時給正規化比例（做畫面判定）與 client 座標（做 scene.pick） */
export interface GamePointerEvent {
  type: 'down' | 'move' | 'up' | 'cancel';
  /** canvas 內的水平比例，0 = 左緣、1 = 右緣 */
  xRatio: number;
  /** canvas 內的垂直比例，0 = 上緣、1 = 下緣 */
  yRatio: number;
  clientX: number;
  clientY: number;
}

/** HUD 儀表條的視覺調性。遊戲只表達「這條是什麼性質」，配色交給 HUD 決定，
 * 每款遊戲才不會各自調出一套不搭的顏色
 */
export type GameHudGaugeTone = 'energy' | 'ultimate'

/** HUD 燈號的視覺調性。目前只有生命，之後有別種再擴充這個聯集 */
export type GameHudPipTone = 'life'

export interface GameHudGauge {
  key: string;
  /** 0~1。HUD 自己夾範圍，遊戲不必先算好 */
  ratio: number;
  tone: GameHudGaugeTone;
}

export interface GameHudPipRow {
  key: string;
  /** 總格數與已點亮的格數 */
  total: number;
  filled: number;
  tone: GameHudPipTone;
}

/** HUD 上可點的按鈕（大絕、道具這類）。按下時 host 會呼叫遊戲的 handleHudAction */
export interface GameHudAction {
  key: string;
  label: string;
  /** false 時 HUD 直接不顯示——沒得用的按鈕留在畫面上只是干擾 */
  isReady: boolean;
}

/** 遊戲自訂的 HUD 內容。用 DOM 畫而不是在場景裡疊網格：
 * 疊圖得自己處理近裁切面、深度排序、觸控命中，還做不出漂亮的字與圓角
 */
export interface GameHudState {
  gaugeList: GameHudGauge[];
  pipRowList: GameHudPipRow[];
  actionList: GameHudAction[];
}

export interface MiniGameContext {
  /** 專屬於這款遊戲的 Scene，host 已套好燈光與後製 */
  scene: Scene;
  /** 已建立的主相機。遊戲可自由改 alpha/beta/radius/target 或整個換掉 */
  camera: ArcRotateCamera;
  /** 燈光組。需要投影的網格記得 addShadowCaster */
  lighting: DioramaLighting;
  /** Havok 是否可用。宣告 needsPhysics 的遊戲仍須處理 false 的降級路徑 */
  hasPhysics: boolean;
  /** 網站深色模式。遊戲世界的天空與霧色可據此調整 */
  isDark: boolean;
  /** 畫面寬高比。小於 0.9 視為直式（手機），取景要改直向構圖 */
  getAspectRatio: () => number;
  /** 回報目前分數。host 每幀讀最新值顯示於 HUD，變動時才呼叫即可 */
  reportScore: (score: number) => void;
  /** 遊戲結束。host 接手顯示結算、寫入最佳分數與里程碑解鎖 */
  reportGameOver: () => void;
  /** 短暫的畫面提示（「完美！」「連段 ×3」），host 在 HUD 中央淡入淡出 */
  reportToast: (text: string) => void;
  /** 回報自訂 HUD 內容（電量、大絕槽、生命燈、按鈕）。
   * 每幀呼叫沒關係，host 會自己比對、內容沒變就不觸發重繪
   */
  reportHudState: (state: GameHudState) => void;
}

export interface MiniGameInstance {
  /** 資源建好、進場演出開始。host 在轉場揭幕時呼叫 */
  start: () => void;
  /** 每幀更新。deltaSeconds 已由 host 夾在 34ms 上限內，不會因掉幀瞬移 */
  update: (deltaSeconds: number) => void;
  handlePointer?: (event: GamePointerEvent) => void;
  handleKey?: (event: KeyboardEvent) => void;
  /** HUD 上的按鈕被按下，帶 GameHudAction 的 key */
  handleHudAction?: (actionKey: string) => void;
  /** 容器尺寸變更。遊戲需要重新取景時實作 */
  resize?: () => void;
  /** 只需釋放自己額外建立的資源（Blob URL、計時器）。
   * Scene 內的網格與材質由 host 統一 scene.dispose() 處理
   */
  dispose: () => void;
}

export type MiniGameFactory = (context: MiniGameContext) => MiniGameInstance

/** 遊戲對場景的需求。host 依此建立 Scene 再交給 factory */
export interface MiniGameSceneOptions {
  /** 世界背景色（hex）。遊戲場景是不透明的，與箱庭的透明畫布不同 */
  clearColorHex: string;
  /** 深色模式的背景色。省略則沿用 clearColorHex */
  darkClearColorHex?: string;
  /** 後製調整。省略的欄位用箱庭預設值 */
  look?: Partial<Omit<DioramaLookOptions, 'namePrefix'>>;
  /** 燈光調整。省略的欄位用箱庭預設值 */
  lighting?: Partial<Omit<DioramaLightingOptions, 'namePrefix'>>;
  /** 是否需要 Havok 物理。host 會先 await 載入再建立遊戲 */
  needsPhysics?: boolean;
}

export interface MiniGameMilestone {
  /** 達到此分數即解鎖 */
  score: number;
  rewardId: RewardId;
}

/** 開始前說明卡的操作示意動畫。HUD 依此挑對應的 SVG 演示 */
export type BriefingDemoKind =
  /** 按住拖曳畫出一條線 */
  | 'dragDraw'
  /** 依序點擊多個目標 */
  | 'tapSequence'
  /** 按住不放，時機到了放開 */
  | 'holdRelease'
  /** 按住蓄力，力道往復，放開起跳 */
  | 'chargeJump'
  /** 轉動朝向，放開往那個方向炸開 */
  | 'aimSweep'

/** 開始前的說明。玩家看完按「開始」才真的進入遊戲——
 * 只給一行提示又讓世界同時開始跑，玩家會在還沒搞懂前就先輸一次
 */
export interface MiniGameBriefing {
  /** 一句話講清楚要幹嘛 */
  goal: string;
  /** 操作步驟，一步一條 */
  controlStepList: string[];
  /** 什麼情況會結束 */
  failCondition: string;
  /** 分數怎麼算 */
  scoreRule: string;
  demoKind: BriefingDemoKind;
}

/** 遊戲的靜態資料。留在主 chunk 供說明卡、收藏冊、dev 選單使用；
 * 實作程式碼走 loadFactory 動態載入
 */
export interface MiniGameMeta {
  id: MiniGameId;
  title: string;
  /** 說明卡上的玩法簡介 */
  description: string;
  /** 開場的操作提示，一句話講完怎麼玩。遊玩中短暫浮現，提醒用 */
  controlHint: string;
  /** 開始前的完整說明，玩家看完按「開始」才進入遊戲 */
  briefing: MiniGameBriefing;
  /** 分數單位，接在數字後面顯示（「公尺」「層」「張」） */
  scoreUnit: string;
  /** 解鎖對應作品連結的門檻分數 */
  clearScore: number;
  /** 高分里程碑，須由低到高排序 */
  milestoneList: MiniGameMilestone[];
  sceneOptions: MiniGameSceneOptions;
  loadFactory: () => Promise<MiniGameFactory>;
}

/** 取得下一個尚未達成的里程碑，供 HUD 顯示目標。全達成回傳 undefined */
export function getNextMilestone(
  meta: MiniGameMeta,
  bestScore: number,
): MiniGameMilestone | undefined {
  return meta.milestoneList.find((milestone) => bestScore < milestone.score)
}

/** 取出此次遊玩新達成的里程碑（超過舊紀錄、且不高於本次分數的那些） */
export function collectNewMilestoneList(
  meta: MiniGameMeta,
  previousBestScore: number,
  currentScore: number,
): MiniGameMilestone[] {
  return meta.milestoneList.filter((milestone) => (
    milestone.score > previousBestScore && milestone.score <= currentScore
  ))
}
