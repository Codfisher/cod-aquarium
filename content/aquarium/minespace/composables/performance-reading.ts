/**
 * 效能讀數的資料形狀與顯示名稱
 *
 * 量測在渲染端（見 use-performance-probe），讀數經 frame-status 送到主執行緒顯示。
 * 型別與名稱對照表獨立成檔，主執行緒才不必為了這幾行把 Babylon 的計時器一起載進來
 */

export interface SectionReading {
  name: string;
  /** 每幀平均花幾毫秒 */
  averageMs: number;
}

/**
 * 區段名稱的英文說法
 *
 * measureSection 的名字直接寫在十幾個呼叫點上，那是刻意的：
 * 掛名的成本要低到隨手就能加一個，改成傳 key 反而沒人願意掛。
 *
 * 代價是那些名字是中文的。這裡補一份對照表，顯示時查一下就好，
 * 呼叫端一個字都不必動。查不到就原樣顯示，新加的區段
 * 頂多是英文介面上出現一個中文名字，不會變成空白
 */
const SECTION_LABEL_EN_MAP: Record<string, string> = {
  風: 'Wind',
  天氣: 'Weather',
  晨霧: 'Ground mist',
  空氣顆粒: 'Air motes',
  方塊動畫: 'Block animation',
  水下焦散: 'Caustics',
  水面: 'Water surface',
  方塊燈火: 'Block lights',
  日夜循環: 'Day & night',
  漫遊控制器: 'Roam controller',
  營火動畫: 'Campfire',
  陰影追蹤: 'Shadow tracking',
  體積雲: 'Volumetric clouds',
}

/** 依語系取得區段的顯示名稱 */
export function getSectionLabel(name: string, isEnglish: boolean): string {
  if (!isEnglish)
    return name

  return SECTION_LABEL_EN_MAP[name] ?? name
}

export interface PerformanceReading {
  /** 一幀送出幾批繪製呼叫 */
  drawCallCount: number;
  /** 這一幀有幾顆網格被判定為要畫 */
  activeMeshCount: number;
  /** 這一幀送出幾個三角形 */
  triangleCount: number;
  /** 整幀花了幾毫秒（CPU 這一側） */
  frameMs: number;
  /**
   * GPU 畫這一幀花了幾毫秒
   *
   * 與上面那個 CPU 的一比就知道該往哪修：
   * CPU 高、GPU 低是繪製呼叫或 JS 太重；反過來則是像素太多。
   *
   * 讀不到時是 0：這需要 EXT_disjoint_timer_query，
   * 有些瀏覽器基於時間側通道的顧慮預設關掉它
   */
  gpuMs: number;
  /** 兩幀之間的間隔，扣掉幀時間就是在等垂直同步 */
  interFrameMs: number;
  /** CPU 決定「哪些東西要畫」花了幾毫秒 */
  meshSelectionMs: number;
  /** 離屏貼圖（陰影）花了幾毫秒 */
  renderTargetMs: number;
  /** 粒子花了幾毫秒 */
  particleMs: number;
  /** 著色器編譯花了幾毫秒，只有卡頓的那一幀才會有數字 */
  shaderCompileMs: number;
  /** 所有 onBeforeRender 觀察者加起來花了幾毫秒 */
  observerMs: number;
  /** 各系統各自花了幾毫秒，由多到少排序 */
  sectionList: SectionReading[];
}

/** 沒有讀數時的空白值 */
export function createEmptyPerformanceReading(): PerformanceReading {
  return {
    drawCallCount: 0,
    activeMeshCount: 0,
    triangleCount: 0,
    frameMs: 0,
    gpuMs: 0,
    interFrameMs: 0,
    meshSelectionMs: 0,
    renderTargetMs: 0,
    particleMs: 0,
    shaderCompileMs: 0,
    observerMs: 0,
    sectionList: [],
  }
}
