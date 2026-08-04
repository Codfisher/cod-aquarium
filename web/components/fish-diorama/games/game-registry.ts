/** 迷你遊戲的註冊表。
 *
 * 只有靜態資料留在主 chunk（說明卡、里程碑、收藏冊需要），
 * 各遊戲的實作程式碼透過 loadFactory 動態 import，點開才載。
 */
import type { InteractionSpotKey } from '../tank-environment'
import type { MiniGameId, MiniGameMeta } from './game-contract'

export const miniGameMetaMap: Record<MiniGameId, MiniGameMeta> = {
  crayonSlide: {
    id: 'crayonSlide',
    title: '蠟筆滑道',
    description: '畫出蠟筆滑道引導鱈魚下潛，繞開海膽。',
    controlHint: '拖曳畫線，帶鱈魚繞開海膽',
    briefing: {
      goal: '鱈魚一路往下潛，海膽擋路就畫線繞開。',
      controlStepList: [
        '拖曳畫線，線是斜坡，魚會順著滑',
        '點一下線可以擦掉，退回蠟筆',
        '左上蠟筆是存量，不畫會回充',
      ],
      failCondition: '撞上海膽或牆刺，或卡住不動',
      scoreRule: '潛多深算幾公尺',
      demoKind: 'dragDraw',
    },
    scoreUnit: '公尺',
    clearScore: 60,
    milestoneList: [
      { score: 100, rewardId: 'crayonHat' },
      { score: 300, rewardId: 'rainbowTrail' },
    ],
    sceneOptions: {
      // 近乎全黑的深水藍：這關的主光是跟著魚的那盞潛水燈，背景色就是「照不到的地方」。
      // 留一點藍才不會黑成純黑的空洞，但明度壓到很低，光圈邊界才切得乾淨
      clearColorHex: '#04121b',
      darkClearColorHex: '#01070c',
      needsPhysics: true,
      // 垂直捲動：畫線範圍涵蓋全畫面，關掉移軸模糊。
      // 環境遮蔽壓低：深水本來就靠光衰減分出遠近，再疊接縫暗角只會糊成一片髒。
      // 暗角反而加重，替光圈收出一圈水壓般的暗邊
      look: {
        tiltShift: null,
        exposure: 1,
        // 顆粒壓到最低：近乎全黑的背景上，動態顆粒的雜訊最顯眼，會把黑度洗成灰
        grainIntensity: 1.5,
        ambientOcclusion: { radius: 0.8, strength: 0.35, maxZ: 45 },
        toneVariation: {
          highlightsHueOffset: 10,
          shadowsHueOffset: -20,
          shadowsDensityScale: 1,
          vignetteWeightScale: 1.15,
        },
      },
      // 環境光只留微光當底：四盞燈全開會把深水照成白天，潛水燈就沒戲了。
      // 陰影同時調淡，免得微光下的投影糊成一團看不出形狀
      lighting: { intensityScale: 0.42, shadowDarkness: 0.88 },
    },
    loadFactory: async () => (await import('./crayon-slide/crayon-slide-game')).createCrayonSlideGame,
  },

  shutterMusou: {
    id: 'shutterMusou',
    title: '快門無雙',
    description: '被一大群怪魚包圍，用閃光燈把牠們一片片收服。',
    controlHint: '按住哪一側就朝哪一側，放開發射',
    briefing: {
      goal: '怪魚從四面湧來，轉過去拍下就收服。',
      controlStepList: [
        '按住畫面，朝向跟著手指轉',
        '按越久範圍越大，放開發射',
        '一張拍到越多隻，倍率越高',
        '收服累積金條，滿了點右下角「全景快門」收服全場',
      ],
      failCondition: '被撞三次就輸惹',
      scoreRule: '收服幾隻算幾隻',
      demoKind: 'aimSweep',
    },
    scoreUnit: '隻',
    clearScore: 60,
    milestoneList: [
      { score: 200, rewardId: 'divingMask' },
      { score: 500, rewardId: 'flashBalloon' },
    ],
    sceneOptions: {
      clearColorHex: '#dfe8ee',
      darkClearColorHex: '#151e28',
      // 俯視全場：整座擂台都要看得清楚，關掉移軸模糊
      look: {
        tiltShift: null,
        ambientOcclusion: { radius: 1.1, strength: 0.55, maxZ: 70 },
        // 陽光競技場：亮部更橘、暗部更藍，同一套配方、自己的性格
        toneVariation: {
          highlightsHueOffset: 6,
          shadowsHueOffset: -12,
          shadowsDensityScale: 1.05,
          vignetteWeightScale: 1.1,
        },
      },
    },
    loadFactory: async () => (await import('./shutter-musou/shutter-musou-game')).createShutterMusouGame,
  },

  stoneHop: {
    id: 'stoneHop',
    title: '靈感溯源',
    description: '蓄力起跳，踩著筆記與鉛筆一路跳往靈感。',
    controlHint: '按住蓄力，放開起跳',
    briefing: {
      // 這關從箱庭的打字機走進來：寫過的稿紙順流而下、鱈魚逆流而上找源頭，
      // 但漂走的稿紙純粹是氛圍，沒有追稿紙這回事，文案不能寫得像多一條玩法。
      // 落腳點的說法一律用玩家看得到的東西（石頭、鉛筆）——
      // 只有約三分之一的石頭頂著稿紙，全寫成「筆記」會對不上畫面
      goal: '寫過的稿紙順流漂走，鱈魚逆流而上找靈感的源頭。',
      controlStepList: [
        '按住蓄力，力道來回跑',
        '地上的環就是落點',
        '對準石頭或鉛筆放開',
      ],
      failCondition: '落水。荷葉會沉、鉛筆會漂、苔石會滑',
      scoreRule: '跳幾次算幾步',
      demoKind: 'chargeJump',
    },
    scoreUnit: '步',
    clearScore: 12,
    milestoneList: [
      { score: 40, rewardId: 'waterFlask' },
      { score: 100, rewardId: 'swimFin' },
    ],
    sceneOptions: {
      clearColorHex: '#e6efe8',
      darkClearColorHex: '#1a2422',
      look: {
        tiltShift: { focusCenterY: 0.48, focusHalfHeight: 0.2, focusFalloff: 0.3, maxBlurRadius: 10 },
        // 溪谷個性：暗部更偏紫、暗角略輕，同一套後製配方下與另兩個世界拉開性格
        toneVariation: { highlightsHueOffset: -4, shadowsHueOffset: 10, shadowsDensityScale: 1, vignetteWeightScale: 0.92 },
      },
    },
    loadFactory: async () => (await import('./stone-hop/stone-hop-game')).createStoneHopGame,
  },
}

export const miniGameIdList = Object.keys(miniGameMetaMap) as MiniGameId[]

export function getMiniGameMeta(gameId: MiniGameId): MiniGameMeta {
  return miniGameMetaMap[gameId]
}

/** 三個互動裝飾各自綁定的遊戲。
 * 未綁定入口的遊戲仍可從 dev 選單直接試玩。
 */
export const spotGameMap: Record<InteractionSpotKey, MiniGameId> = {
  crayonSet: 'crayonSlide',
  typewriter: 'stoneHop',
  camera: 'shutterMusou',
}
