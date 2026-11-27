import { computed } from 'vue'
import { renderSettings } from '../domains/render-host/render-settings'

/**
 * 畫質等級
 *
 * 名字刻意保留 low 與 high 這兩個舊名：瀏覽器裡存的是字串，
 * 改名等於把所有老使用者的選擇丟掉。中間插進來的兩級用新名字，
 * 舊值原封不動還讀得回來
 */
export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra'

/** 選單上的排列順序，由省到奢 */
export const GRAPHICS_QUALITY_LIST: GraphicsQuality[] = ['low', 'medium', 'high', 'ultra']

/** 最省的那一級，除錯開關要「退到最省」時用它，不要寫死字串 */
export const LOWEST_QUALITY: GraphicsQuality = 'low'

/**
 * 一級畫質長什麼樣
 *
 * 這張表是整個分級系統唯一的真相。
 *
 * 之所以不讓各處自己比對字串，是因為原本就是那樣寫的——
 * 每一處都寫 `quality === 'low'` 或 `!== 'low'`，也就是
 * 「最省的那一級」與「其餘」二分。等級一多，那些 `!== 'low'`
 * 會安靜地把新加的每一級都當成最高級，而型別檢查一個字都不會說。
 *
 * 改成讀這張表的具名欄位之後，新增一級就是多一欄設定值，
 * 漏了哪一項是編譯期的錯誤，不是上線後才發現的畫面問題
 */
export interface QualityPreset {
  /**
   * 畫布是否開多重取樣，讓方塊稜線平順
   *
   * 倍數由瀏覽器決定（通常是四倍），程式只能開或關。目前各級都關：整幀實測掉一到五 FPS；
   * 上下文建好就不能改，換畫質會重新整理頁面才生效（見 use-babylon-scene 的 createEngine）
   */
  antialiasEnabled: boolean;
  /**
   * 實際算繪的像素上限，相對於 CSS 像素
   *
   * 在兩倍的螢幕上照著裝置像素比走代表要畫四倍的像素，
   * 幀率一低，轉動視角就會一段一段跳
   */
  pixelRatioLimit: number;
  /** 陰影貼圖的邊長 */
  shadowMapSize: number;
  /**
   * 陰影分成幾層，一等於單張不分層
   *
   * 分層陰影（CSM）把視野依距離切成幾段，各給一張貼圖：
   * 近處那張罩得小、每格分到的像素多，遠處那張罩得大但夠用。
   * 單張的做法只罩得住鏡頭附近幾十格，再遠就完全沒有影子
   */
  shadowCascadeCount: number;
  /** 陰影涵蓋多遠，只有分層陰影用得到 */
  shadowDistance: number;
  /**
   * 陰影的濾波方式
   *
   * 接觸硬化（PCSS）會依遮蔽物的距離決定模糊寬度，影子在物體根部
   * 是銳利的、離遠了才散開；百分比漸近（PCF）則是一律同樣柔軟
   */
  shadowFilter: 'pcf' | 'pcss';
  /** 濾波的取樣數等級 */
  shadowFilterQuality: 'low' | 'medium' | 'high';
  /**
   * 視差
   *
   * off 是純平面；offset 只依視角推一次取樣座標，幾乎不要錢；
   * occlusion 會沿著視線在高度圖裡一路行進找真正的交點，
   * 石縫因此有遮擋關係而不只是滑動——代價是每個像素一個取樣迴圈
   */
  parallax: 'off' | 'offset' | 'occlusion';
  /** 體素全局光要不要算 */
  voxelGi: boolean;
  /** 全局光粗網格的水平與垂直格距，越小越細也越貴 */
  giCellSizeXZ: number;
  giCellSizeY: number;
  /** 全局光跑幾輪反彈 */
  giBouncePassCount: number;
  /**
   * 光束
   *
   * screen 是螢幕空間的放射狀模糊，便宜但只在正對太陽時成立；
   * raymarch 沿著視線行進、逐步取樣陰影圖，任何角度都有光束穿過枝葉。
   * raymarch 也會一併開著 screen 那一份，只取它在太陽周圍抹出的光暈（見 god-rays.ts）
   */
  volumetric: 'off' | 'screen' | 'raymarch';
  /** 光線行進取樣幾步 */
  volumetricStepCount: number;
  /** 場景深度圖，光暈的柔性淡出與水面的岸線交線光共用它 */
  sceneDepth: boolean;
  /** 水鏡的倒影貼圖邊長，零等於整個不做 */
  mirrorSizeSmall: number;
  mirrorSizeLarge: number;
  /** 水下焦散 */
  waterCaustics: boolean;
  /** 岸線與漣漪 */
  waterShoreline: boolean;
  /**
   * 體積雲的累積解析度，相對於算繪解析度的邊長比例
   *
   * 每一格每一幀都要行進，成本與這個數字的平方成正比。
   * 雲是柔的，半解析度大致看不出差別；高與極致多給一點，
   * 頭頂最近那幾朵的輪廓才不會糊
   */
  cloudResolutionRatio: number;
  /**
   * 體積雲的行進是否隔幀只畫一半的格子（棋盤式，見 volumetric-cloud 的 INTERLACE_TILE_SIZE）
   *
   * 行進是最貴的一趟，這個選項把它的成本砍半。畫面靠時間累積，
   * 每格換成兩幀更新一次，累積的長度不變。最省的一級格子本來就少、
   * 行進才兩毫秒，不值得拿累積的雜訊去換，所以那一級不開
   */
  cloudInterlace: boolean;
  /** 體積雲沿著視線走幾步，時間累積會再把它乘上十倍左右 */
  cloudStepCount: number;
  /** 每一步朝太陽探幾次，決定雲底與背光面暗得多真 */
  cloudLightStepCount: number;
  /** 粒子數量相對於基準的倍率 */
  particleRatio: number;
  /** 一盞燈的光暈圓盤切成幾邊 */
  glowTessellation: number;
}

/**
 * 四級畫質
 *
 * 兩端是新加的：最省那一級給跑不動的機器，最奢那一級把幾項
 * 原本沒有的東西打開。中間兩級對應原本的低與高，
 * 老使用者切回來看到的還是同一個畫面
 */
export const QUALITY_PRESET_MAP: Record<GraphicsQuality, QualityPreset> = {
  /**
   * 效能
   *
   * 手機的預設，也是「畫面能動就好」那一級。
   * 除了色調映射之外幾乎什麼都不留——那一項不能拿掉，
   * 少了它整片白沙會過曝成一張紙
   */
  low: {
    antialiasEnabled: false,
    pixelRatioLimit: 1 / 3,
    shadowMapSize: 1024,
    shadowCascadeCount: 1,
    shadowDistance: 80,
    shadowFilter: 'pcf',
    shadowFilterQuality: 'low',
    parallax: 'off',
    voxelGi: false,
    giCellSizeXZ: 8,
    giCellSizeY: 4,
    giBouncePassCount: 1,
    volumetric: 'off',
    volumetricStepCount: 0,
    sceneDepth: false,
    mirrorSizeSmall: 0,
    mirrorSizeLarge: 0,
    waterCaustics: false,
    waterShoreline: false,
    cloudResolutionRatio: 0.5,
    cloudInterlace: false,
    cloudStepCount: 40,
    cloudLightStepCount: 3,
    particleRatio: 0.36,
    glowTessellation: 10,
  },

  /**
   * 標準
   *
   * 新加的一級，補的是原本「低與高之間什麼都沒有」那個大洞。
   * 效果幾乎都在，只是每一項都收一號：影子還是柔的、水還是有岸線，
   * 但不做全局光、不推視差
   */
  medium: {
    antialiasEnabled: false,
    pixelRatioLimit: 1,
    shadowMapSize: 2048,
    shadowCascadeCount: 1,
    shadowDistance: 80,
    shadowFilter: 'pcss',
    shadowFilterQuality: 'low',
    parallax: 'offset',
    voxelGi: false,
    giCellSizeXZ: 8,
    giCellSizeY: 4,
    giBouncePassCount: 2,
    volumetric: 'screen',
    volumetricStepCount: 0,
    sceneDepth: true,
    mirrorSizeSmall: 128,
    mirrorSizeLarge: 256,
    waterCaustics: true,
    waterShoreline: true,
    cloudResolutionRatio: 0.5,
    cloudInterlace: true,
    cloudStepCount: 56,
    cloudLightStepCount: 4,
    particleRatio: 0.7,
    glowTessellation: 16,
  },

  /**
   * 高
   *
   * 電腦的預設，對應原本那一級的「高」。
   * 唯一的差別是陰影改成分層的——原本單張只罩得住腳邊四十格，
   * 而霧要到一百格才開始收，中間那一整圈看得一清二楚卻沒有影子
   */
  high: {
    antialiasEnabled: false,
    pixelRatioLimit: 1.5,
    shadowMapSize: 2048,
    shadowCascadeCount: 2,
    shadowDistance: 160,
    shadowFilter: 'pcss',
    shadowFilterQuality: 'medium',
    parallax: 'offset',
    voxelGi: true,
    giCellSizeXZ: 4,
    giCellSizeY: 2,
    giBouncePassCount: 4,
    volumetric: 'screen',
    volumetricStepCount: 0,
    sceneDepth: true,
    mirrorSizeSmall: 256,
    mirrorSizeLarge: 512,
    waterCaustics: true,
    waterShoreline: true,
    cloudResolutionRatio: 0.6,
    cloudInterlace: true,
    cloudStepCount: 72,
    cloudLightStepCount: 5,
    particleRatio: 1,
    glowTessellation: 24,
  },

  /**
   * 極致
   *
   * 新加的一級，三項只有這裡才有的東西：
   * 四層陰影一路鋪到霧裡、視差改成會遮擋的那一種、
   * 光束改成沿著視線行進——太陽在背後也看得到光穿過枝葉的縫隙
   */
  ultra: {
    antialiasEnabled: false,
    /**
     * 與「高」同樣壓在一點五
     *
     * 這裡原本是二。在兩倍的螢幕上那代表要畫四倍的像素，
     * 而這一級同時開著四層陰影、遮擋視差與光線行進——
     * 每一項都是逐像素的成本，乘起來就是十五幀。
     *
     * 極致該奢在效果，不是奢在解析度：那多出來的像素換到的
     * 是幾乎看不出的銳利度，卻讓最貴的三項各自多付兩倍多的錢
     */
    pixelRatioLimit: 1.5,
    shadowMapSize: 2048,
    /**
     * 三層而不是四層
     *
     * 每多一層就是把場景的幾何整個再畫一趟。量出來的數字說得很清楚：
     * 幀 GPU 34.6 毫秒、幀 CPU 只有 14.3——瓶頸整個在 GPU 那一側，
     * 而繪製呼叫是一千六百多次，遠高於這個世界本身的八百多次，
     * 多出來的正是那幾趟陰影。
     *
     * 第四層罩的是最遠那一段，而霧在一百格就開始收——
     * 那一層畫出來的東西多半已經看不清楚了
     */
    shadowCascadeCount: 3,
    shadowDistance: 200,
    shadowFilter: 'pcss',
    shadowFilterQuality: 'high',
    parallax: 'occlusion',
    voxelGi: true,
    giCellSizeXZ: 4,
    giCellSizeY: 2,
    giBouncePassCount: 6,
    volumetric: 'raymarch',
    /**
     * 三十二步，不是四十八
     *
     * 這是全螢幕逐像素的迴圈，步數與成本成正比。
     * 光束的結果沿路平均過，本來就是糊的——步數從四十八收到三十二
     * 看不出差別，省下的卻是三分之一的取樣
     */
    volumetricStepCount: 32,
    sceneDepth: true,
    mirrorSizeSmall: 256,
    mirrorSizeLarge: 512,
    waterCaustics: true,
    waterShoreline: true,
    cloudResolutionRatio: 0.75,
    cloudInterlace: true,
    cloudStepCount: 96,
    cloudLightStepCount: 6,
    particleRatio: 1,
    glowTessellation: 24,
  },
}

/**
 * 渲染端讀到的畫質
 *
 * 值是主執行緒送來的（見 render-settings），這裡不碰儲存也不問裝置：
 * worker 裡沒有 localStorage 與 matchMedia。
 * 「手機預設效能、電腦預設高」與「選過就記住」是主執行緒的事，見 use-render-preference
 */
export function useGraphicsQuality() {
  const quality = computed<GraphicsQuality>(() => renderSettings.quality)

  /** 這一級的完整設定，各處讀具名欄位，不要自己比對等級字串 */
  const preset = computed<QualityPreset>(() => QUALITY_PRESET_MAP[quality.value])

  return { quality, preset }
}

/**
 * 決定實際要渲染多少像素
 *
 * 在兩倍的螢幕上照著裝置像素比走，代表要畫四倍的像素，
 * 幀率掉下來之後轉動視角會一段一段跳——因為視角轉多少是由
 * 滑鼠位移決定的，與幀率無關，幀率一低，同樣的角度就被切成
 * 更少、更大的步進。所以每一級各有一個像素上限
 */
export function getHardwareScalingLevel(preset: QualityPreset, devicePixelRatio: number): number {
  return 1 / Math.min(devicePixelRatio, preset.pixelRatioLimit)
}
