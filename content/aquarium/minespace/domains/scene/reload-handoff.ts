/**
 * 重新整理前後的交接
 *
 * 有些設定改了之後畫面才對得起來——畫質就是這種。
 * 那一級決定的東西裡有一半是建立當下才接得上去的：
 * 多重取樣的數目、後製鏈上有哪幾支、體素全局光要不要開工。
 * 已經建好的場景改不動它們，於是切過去只換到一半的效果，
 * 剩下那一半要等下一次進來才會出現——而使用者看到的是
 * 「這個選項好像沒作用」。
 *
 * 最誠實的做法是整頁重來。代價是人被丟回出生點、
 * 天色跳回預設的時刻，那比沒作用還糟。
 *
 * 所以重來之前先把「人在哪、看著哪、幾點鐘」寄放一份，
 * 新的一輪起來時原地接回去。畫面上是閃一下然後一切照舊，
 * 差別只在那些原本接不上去的效果現在都在了
 */

/**
 * 寄放在哪
 *
 * 用 sessionStorage 而不是 localStorage：這份東西只該活到
 * 下一次載入為止。存進 localStorage 的話，隔一週再開同一個網址
 * 會被丟到上次離開的位置——那不是交接，那是存檔，
 * 而這座禪庭本來就該從鳥居前面開始
 */
const STORAGE_KEY = 'minespace-reload-handoff'

export interface ReloadHandoff {
  /** 玩家腳底的世界座標 */
  position: { x: number; y: number; z: number };
  /** 鏡頭的俯仰與偏航（弧度） */
  rotation: { pitch: number; yaw: number };
  /** 一天的時刻，0 為子夜、0.5 為正午 */
  timeOfDay: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * 存進去的東西不保證還認得
 *
 * 這份資料的格式與程式碼是綁在一起的，而重新整理的中間
 * 剛好是最容易換版本的一刻：使用者停在舊版的分頁上按了畫質，
 * 重來時拿到的已經是新版。認不得就當作沒有，回出生點——
 * 那比讓 undefined 一路流進物理運算裡好
 */
function parseHandoff(raw: string): ReloadHandoff | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ReloadHandoff>
    const { position, rotation, timeOfDay } = parsed

    if (!position || !rotation || !isFiniteNumber(timeOfDay))
      return null

    if (!isFiniteNumber(position.x) || !isFiniteNumber(position.y) || !isFiniteNumber(position.z))
      return null

    if (!isFiniteNumber(rotation.pitch) || !isFiniteNumber(rotation.yaw))
      return null

    return { position, rotation, timeOfDay } as ReloadHandoff
  }
  catch {
    return null
  }
}

/**
 * 一載入就取走，而且只取這一次
 *
 * 讀完立刻從儲存裡刪掉：留著的話，之後每一次手動重新整理
 * 都會被丟回同一個位置，那已經不是交接了。
 *
 * 讀進模組變數而不是每次去查儲存，是因為有兩個讀者
 * （操控者要位置與視角、日夜循環要時刻），
 * 「讀完就刪」那條路上誰先問誰就拿光了
 */
const handoff = readHandoffOnce()

function readHandoffOnce(): ReloadHandoff | null {
  if (typeof window === 'undefined')
    return null

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    window.sessionStorage.removeItem(STORAGE_KEY)

    return raw ? parseHandoff(raw) : null
  }
  catch {
    /** 無痕模式或擋了儲存，沒有交接就照原本的方式開始 */
    return null
  }
}

/** 上一輪留下的狀態，沒有就是 null */
export function getReloadHandoff(): ReloadHandoff | null {
  return handoff
}

/** 記下這一刻的狀態，然後立刻重新整理 */
export function reloadWithHandoff(next: ReloadHandoff): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  catch {
    /** 存不進去就算了，位置會回到出生點，但畫質照樣換得成 */
  }

  window.location.reload()
}
