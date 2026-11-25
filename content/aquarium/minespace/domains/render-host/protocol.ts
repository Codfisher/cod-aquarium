import type { PerformanceReading } from '../../composables/performance-reading'
import type { DevToggleKey } from '../../composables/use-dev-toggles'
import type { GraphicsQuality } from '../../composables/use-graphics-quality'
import type { TexturePackId } from '../block/texture-pack'
import type { ReloadHandoff } from '../scene/reload-handoff'
import type { SoundZone, Weather } from '../soundscape/type'
import type { DayPhase } from '../weather/day-night'

/**
 * 主執行緒與渲染端之間的訊息協定
 *
 * 渲染端可能是 Dedicated Worker（畫在 OffscreenCanvas 上），
 * 也可能是同一條執行緒上的退路（OffscreenCanvas 的 WebGL2 不能用時）。
 * 兩條路收發的是同一批訊息，所以這裡的型別只能放「可以結構化複製」的東西：
 * 純資料、型別陣列、OffscreenCanvas。不放函式、不放 Vue 的響應式物件、不放 Babylon 物件
 */

/**
 * 渲染端關心的設定
 *
 * 主執行緒負責持久化（useStorage），渲染端只是同一組欄位的唯讀副本。
 * 兩邊的預設值必須一致，所以預設值都出自同一批常數，見 render-settings.ts
 */
export interface RenderSettings {
  /** 畫質等級，建立當下就決定了一半的東西，換了就整頁重來 */
  quality: GraphicsQuality;
  /** 鏡頭的視野角度（弧度） */
  cameraFov: number;
  /** 太陽從哪個方位升起，0 ～ 360 度 */
  sunAzimuth: number;
  /** 時間會不會自己走 */
  isAutoAdvance: boolean;
  /** 一天走多快，0 為最緩、1 為最快 */
  daySpeedRatio: number;
  /** 目前用哪一套材質包 */
  texturePackId: TexturePackId;
  /** 使用者要不要立體紋理（還要材質包本身有法線才會真的掛上） */
  isBumpEnabled: boolean;
  /** 除錯用的效果開關，不持久化，重新整理就回到全開 */
  devToggle: Record<DevToggleKey, boolean>;
}

/** 視窗尺寸，單位是 CSS 像素 */
export interface RenderViewport {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
}

/* ────────────────────────── 下行：主執行緒 → 渲染端 ────────────────────────── */

/**
 * 能力偵測
 *
 * 只有 worker 這條路會用到。在 worker 裡開一塊用完即丟的 OffscreenCanvas 試著拿 webgl2，
 * 並確認巢狀 worker 能建（地形、區塊、全局光、雲雜訊都靠它）——
 * 這件事要在把真的畫布交出去之前確認，因為 transferControlToOffscreen 只能做一次
 */
export interface RenderProbeMessage {
  type: 'probe';
}

export interface RenderInitMessage extends RenderViewport {
  type: 'init';
  /** worker 路徑是轉移過去的 OffscreenCanvas，退路則是原本那塊 canvas 元素 */
  canvas: HTMLCanvasElement | OffscreenCanvas;
  settings: RenderSettings;
  /** 畫質切換整頁重來時寄放的位置、視角與時刻 */
  handoff: ReloadHandoff | null;
}

export interface RenderResizeMessage extends RenderViewport {
  type: 'resize';
}

/** 只送有變的欄位，devToggle 也是只送有變的那幾項 */
export interface RenderSettingsMessage {
  type: 'settings';
  patch: Partial<Omit<RenderSettings, 'devToggle'>> & {
    devToggle?: Partial<Record<DevToggleKey, boolean>>;
  };
}

/** 移動鍵的狀態 */
export interface RenderMoveKeys {
  isForwardPressed: boolean;
  isBackwardPressed: boolean;
  isLeftPressed: boolean;
  isRightPressed: boolean;
  isJumpPressed: boolean;
  isSprintPressed: boolean;
}

/**
 * 輸入
 *
 * 主執行緒每幀最多送一次。位移是「自上次送出以來累積的量」，
 * 逐事件送的話一次滑鼠事件就是一則訊息，高輪詢率的滑鼠會把佇列塞滿
 */
export interface RenderInputMessage {
  type: 'input';
  keys: RenderMoveKeys;
  /** 觸控搖桿，-1 ~ 1 */
  joystick: { x: number; z: number };
  /** 搖桿偏移比例，0 ~ 1，類比速度用 */
  joystickMagnitude: number;
  /** 觸控按鈕 */
  isTouchJumping: boolean;
  isTouchSprinting: boolean;
  /** 滑鼠累積位移（像素），已經過異常值的夾限 */
  mouseDeltaX: number;
  mouseDeltaY: number;
  /** 觸控視角累積位移（弧度） */
  touchLookDeltaX: number;
  touchLookDeltaY: number;
}

export type RenderCommand =
  /** 開始漫遊：建立天氣與粒子，時間開始走 */
  | { command: 'start' }
  /**
   * 暫停與游標的狀態
   *
   * 這兩個旗標由主執行緒決定（它們跟著 pointer lock 走），渲染端只是照著動作：
   * 暫停時時間停住，放開滑鼠時鍵盤失效
   */
  | { command: 'set-control'; isPaused: boolean; isCursorFree: boolean }
  /** 快速前往，渲染端自己找一個站得住腳的位置 */
  | { command: 'travel'; x: number; z: number }
  /** 直接指定時刻，0 為子夜、0.5 為正午 */
  | { command: 'set-time'; value: number }
  /** 撥動時間，正值往未來走，單位是一整天的比例 */
  | { command: 'add-time'; delta: number }
  /** F3 效能面板 */
  | { command: 'toggle-probe' }
  /** F7 換下一種體積光除錯檢視 */
  | { command: 'cycle-debug-mode' }
  /** 要一份目前位置、視角與時刻的快照，畫質切換重新整理前用 */
  | { command: 'request-handoff' }
  /**
   * 頁面可見或隱藏
   *
   * 渲染端在 worker 裡，自己看不到頁面的可見性，而 worker 的 rAF 不會在背景分頁被降頻。
   * 隱藏時它得停下算繪迴圈與回報的計時器，可見時再恢復
   */
  | { command: 'set-visibility'; isVisible: boolean }

export interface RenderCommandMessage {
  type: 'command';
  payload: RenderCommand;
}

export interface RenderDisposeMessage {
  type: 'dispose';
}

export type RenderDownMessage =
  | RenderProbeMessage
  | RenderInitMessage
  | RenderResizeMessage
  | RenderSettingsMessage
  | RenderInputMessage
  | RenderCommandMessage
  | RenderDisposeMessage

/* ────────────────────────── 上行：渲染端 → 主執行緒 ────────────────────────── */

/**
 * worker 的入口模組已經載入並求值完
 *
 * 能力偵測的時限要從這一刻才開始算：模組要下載整個 Babylon，
 * 慢網路上可能要好幾十秒，那段時間不是「不支援」，只是還沒到
 */
export interface RenderLoadedMessage {
  type: 'loaded';
}

export interface RenderProbeResultMessage {
  type: 'probe-result';
  isSupported: boolean;
  /** 不支援時的原因，給診斷紀錄看 */
  reason?: string;
}

export interface RenderReadyMessage {
  type: 'ready';
  /**
   * 世界的方塊資料
   *
   * 音景要靠它種音源、算遮蔽。渲染端自己還要用，所以是複製過來的，不是轉移
   */
  worldState: Uint8Array;
}

export interface RenderInitErrorMessage {
  type: 'init-error';
  message: string;
}

/**
 * WebGL 上下文丟失
 *
 * 與 init-error 分開：上下文有機會恢復（Babylon 會重建資源），
 * 恢復時要能把提示收掉，所以得有一對事件，而不是一則永遠留著的錯誤
 */
export interface RenderContextLostMessage {
  type: 'context-lost';
}

export interface RenderContextRestoredMessage {
  type: 'context-restored';
}

/**
 * 約每四分之一秒一份的狀態
 *
 * HUD 與音景讀的都是這一份。每幀變動的東西（位置、視角）不在這裡，見 pose
 */
export interface RenderFrameStatusMessage {
  type: 'frame-status';
  fps: number;
  /** 一天的時刻，0 為子夜、0.5 為正午 */
  timeOfDay: number;
  clockText: string;
  phase: DayPhase;
  /** 白晝的程度，0 為全暗、1 為大白天，音景的日夜交替吃這個 */
  dayRatio: number;
  isNight: boolean;
  /** 目前站在哪一座箱庭上，走在白沙上是 null */
  zone: SoundZone | null;
  weather: Weather;
  isUnderground: boolean;
  /** F3 效能面板有沒有開，開著才會帶讀數 */
  isProbeVisible: boolean;
  probe: PerformanceReading | null;
  /** 體積光除錯檢視目前是哪一種 */
  debugModeLabel: string;
}

/**
 * 鏡頭的位置與朝向，約每秒三十次
 *
 * 音景的聽者跟著它走。位置是鏡頭的，不是腳底
 */
export interface RenderPoseMessage {
  type: 'pose';
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
}

/** 要主執行緒播一個觸發型的音源，目前只有聽雨亭的雷 */
export interface RenderSoundMessage {
  type: 'sound';
  id: string;
  volume?: number;
}

export interface RenderLogIssue {
  level: 'error' | 'warn';
  message: string;
  stack?: string;
  /** 這段期間同一則出現了幾次，渲染端先彙整過 */
  count: number;
}

export interface RenderLogDiagnostic {
  label: string;
  value: string;
}

/**
 * 錯誤、警告與執行時狀態
 *
 * worker 的例外與 console 接不進主執行緒的 window.onerror，
 * 渲染端自己收集、彙整，隔一段時間成批送上來，匯進同一份紀錄
 */
export interface RenderLogMessage {
  type: 'log';
  issueList: RenderLogIssue[];
  diagnosticList: RenderLogDiagnostic[];
}

export interface RenderHandoffSnapshotMessage {
  type: 'handoff-snapshot';
  handoff: ReloadHandoff;
}

export type RenderUpMessage =
  | RenderLoadedMessage
  | RenderProbeResultMessage
  | RenderReadyMessage
  | RenderInitErrorMessage
  | RenderContextLostMessage
  | RenderContextRestoredMessage
  | RenderFrameStatusMessage
  | RenderPoseMessage
  | RenderSoundMessage
  | RenderLogMessage
  | RenderHandoffSnapshotMessage

/* ────────────────────────── 傳輸層 ────────────────────────── */

/**
 * 主執行緒這一端看到的傳輸層
 *
 * 實作有兩種：真正的 Worker，以及跑在同一條執行緒上的退路。
 * 上面的程式不必知道是哪一種
 */
export interface RenderHostTransport {
  kind: 'worker' | 'in-process';
  /**
   * 把畫布整理成渲染端要的樣子
   *
   * worker 要把畫布的控制權轉移走（只能做一次），之後主執行緒這端的 canvas 元素
   * 只剩一塊顯示用的空殼；退路則原封不動，直接在這塊 canvas 上畫
   */
  prepareCanvas: (canvas: HTMLCanvasElement) => HTMLCanvasElement | OffscreenCanvas;
  post: (message: RenderDownMessage, transferList?: Transferable[]) => void;
  /** 只留一個接收者，後設的蓋掉先設的 */
  setMessageHandler: (handler: (message: RenderUpMessage) => void) => void;
  dispose: () => void;
}

/** 渲染端那一端看到的通道，與 RenderHostTransport 是一對 */
export interface RenderChannel {
  post: (message: RenderUpMessage, transferList?: Transferable[]) => void;
  setMessageHandler: (handler: (message: RenderDownMessage) => void) => void;
}
