import type { Engine, Scene, StandardMaterial, SubMesh, UniformBuffer } from '@babylonjs/core'
import { MaterialPluginBase } from '@babylonjs/core'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { measureSection } from '../../composables/use-performance-probe'
import { PLAYER_EYE_HEIGHT } from '../player/collision'

/**
 * 隨風搖擺
 *
 * 交叉立板的花草在頂點著色器裡擺動。這件事只能在著色器裡做：
 * 全世界有上萬株草，全部是 thin instance 共用同一份頂點資料，
 * CPU 這邊連「單獨移動其中一株」的餘地都沒有。
 *
 * 風由三層疊起來，各管一件事：
 *
 * 一是柏林噪聲的陣風，決定「這一帶此刻風多大」。取樣點隨時間往風的方向
 * 平移，強弱就像一陣一陣的風掃過草原。但它的起伏有十一格寬，
 * 相鄰兩株取到的值幾乎一樣——它管得了範圍，管不了順序。
 *
 * 二是沿著風向前進的行進波，相位只看「這一株在風向上站得多前面」。
 * 六格一個週期，隔壁那株差六十度：這一株彎到底時下一株才剛開始傾，
 * 一排草因此是接力倒下去的。順序感全靠這一層。
 *
 * 三是每一株自己的細碎顫動，讓同一小塊裡的草不會整齊得像一塊布。
 */

/**
 * 花草的擺動幅度（格）
 *
 * 一株草才一格見方，頂端偏移零點一四格大約是八度。
 * 再大就不像風吹，像草自己在跳舞
 */
export const PLANT_SWAY_AMPLITUDE = 0.14

/**
 * 樹葉的擺動幅度（格）
 *
 * 只有花草的三分之一，而且整塊一起移動、不從底部彎。
 * 樹冠是一團互相緊貼的方塊，各自彎腰的話塊與塊之間會裂開；
 * 整團同進同出才是一棵樹被風推的樣子。
 *
 * 幅度壓小還有一個理由：樹葉會投影子，而陰影貼圖走的是另一支著色器，
 * 影子不會跟著擺。差零點零五格看不出來，差零點一五就對不上了
 */
export const LEAF_SWAY_AMPLITUDE = 0.05

/**
 * 噪聲場的疏密
 *
 * 數字越小，一陣風的範圍越大。零點零九約是十一格一個起伏，
 * 差不多是一座箱庭的三分之一——看得出「一陣」的形狀，
 * 又不會整座木座同進同出
 */
const WIND_FIELD_SCALE = 0.09

/** 風往哪個方向吹，與雲層的飄移同向，天上地下才是同一場風 */
const WIND_DIRECTION: [number, number] = [0.94, 0.34]

/** 陣風掃過的速度（格／秒） */
const WIND_SPEED = 2.6

/**
 * 一道波多長（格）
 *
 * 噪聲場只管「這一帶的風多大」，管不了「一株接一株倒下去」——
 * 十一格才一個起伏，相鄰兩株在噪聲場上只差零點零九，
 * 取到的值幾乎一模一樣，於是整片草看起來是同時動的。
 *
 * 真正看得出順序的是這道沿著風向前進的波。六格一個週期，
 * 隔壁那一株就差六十度的相位——這一株彎到底時，
 * 下一株才剛開始傾，一排草因此是接力倒下去的
 */
const PLANT_RIPPLE_WAVELENGTH = 6

/**
 * 樹葉的波要長得多
 *
 * 樹冠是一團互相緊貼的方塊。波長若與草一樣短，
 * 相鄰兩塊葉子會往不同方向偏，塊與塊之間裂出縫來。
 * 拉到二十四格之後同一棵樹幾乎整團同進同出，
 * 波的作用只剩「這棵樹與那棵樹不同步」
 */
const LEAF_RIPPLE_WAVELENGTH = 24

/**
 * 人走過去時，草往外倒的範圍（格）
 *
 * 一格半差不多是一個人張開手臂：走過去時貼著身體的那一圈草讓開，
 * 再遠一點的維持原狀。這個數字曾經放到四格半——那讓整片草地
 * 以人為中心攤平成一個大圓，看起來不像被趟過去，像有一台壓路機
 */
const TRAMPLE_RADIUS = 1.5

/**
 * 圈裡面還有一個滿檔的核心（格）
 *
 * 衰減若從距離零就開始算，力道最強的地方永遠是腳底下那一株——
 * 而那一株在畫面上根本看不到，看得到的那些全落在曲線的尾巴上。
 * 核心之內一律滿檔，草才是「整片一起讓開」而不是一株一株輪流動一下。
 *
 * 必須小於 TRAMPLE_RADIUS：這兩個數字是 smoothstep 的上下界，
 * 顛倒過來在 GLSL 是未定義行為，畫面上會變成整片草莫名其妙地抽動
 */
const TRAMPLE_CORE_RADIUS = 0.6

/**
 * 草被推開多遠（格）
 *
 * 風的擺幅是 0.14，這裡給五倍多。風是整片草一起晃，看的是節奏；
 * 踩踏是「這幾株被讓開了」，看的是對比——推得不夠明顯就等於沒做。
 *
 * 配上下壓那一項，草尖從正上方倒到大約五十度，
 * 是「被人趟過去」而不是「被風吹歪」
 */
const TRAMPLE_PUSH = 0.75

/**
 * 往外倒的同時往下壓多少（佔推開量的比例）
 *
 * 只有橫推的話，草是「平移」而不是「被踩」——整株往旁邊挪，
 * 高度卻一點沒變。人的重量要看得出來，頂端就得同時矮下去一截。
 *
 * 五成五配上 0.75 的推開量，草尖大約從一格高沉到六成，
 * 同時橫移四分之三格——那是伏倒，不是傾斜。
 * 這一項與橫推同樣乘在 leverage 上，而 leverage 在根部是零，
 * 所以壓下去的永遠是上半截，草的根不會沉進土裡
 */
const TRAMPLE_PRESS_RATIO = 0.55

/**
 * 高度差超過這麼多就不算踩到
 *
 * 沒有這一項的話，站在木橋上、坐在屋頂上、跳起來的那一刻，
 * 底下的草都會跟著往外倒——那看起來像有一團看不見的東西在飄
 */
const TRAMPLE_HEIGHT_REACH = 2.2

/**
 * 軌跡記得幾個腳印
 *
 * 第一個永遠是「人此刻站在哪裡」，其餘是走過的腳印，各自在恢復中。
 * 十二個配上下面的間距，身後大約留得住十格的路。
 *
 * 這個數字直接是每一個花草頂點每一幀的迴圈次數，
 * 不能無限加。要留更長的痕，先加間距而不是加數量
 */
const TRAIL_MARK_COUNT = 12

/**
 * 走多遠蓋一個腳印（格）
 *
 * 這個間距不是寫死的，是每一幀照人走多快算出來的，理由見下面
 * measureStampDistance。這兩個數字只是上下限：
 *
 * 下限管的是「慢慢晃過去」時不要蓋得太密，
 * 上限管的是兩個腳印之間不能脫節——滿檔的核心直徑是四格四，
 * 間距超過那個數字，走過的路就會斷成一串圓點
 */
const TRAIL_STAMP_DISTANCE_MIN = 0.8
const TRAIL_STAMP_DISTANCE_MAX = 4

/**
 * 一個腳印多久站回來（秒）
 *
 * 這一段是整個效果的重點，也是它與「即時推開」的差別：
 * 沒有記憶的話，人一走開草立刻彈回原狀，那看起來像草在躲人；
 * 有了記憶，身後才留得下一條闔上的徑——
 * 那是「我剛剛從那裡走過來」唯一說得出口的證據。
 *
 * 兩秒半是「回頭還看得到」與「草是活的」之間的那個點。
 * 這裡曾經給到六秒，那是照著「走十來步回頭還看得見來時路」抓的，
 * 但實際走起來太黏——身後那條徑遲遲不闔上，看起來不像草被壓過，
 * 像地上留著一條被踩出來的凹痕。真正的草只需要一兩秒就撐回去了。
 *
 * 改這個數字不必再動別的：腳印的間距是照它與速度算出來的
 * （見 measureStampDistance），縮短恢復時間，間距會自己跟著縮
 */
const TRAIL_RECOVER_SECOND = 2.5

/**
 * 速度估計的跟隨快慢（每秒收斂幾成）
 *
 * 直接拿這一幀的位移除以時間會抖得很厲害——撞到方塊、跳起來、
 * 掉幀都會讓某一幀的瞬時速度暴衝，而腳印的間距跟著暴衝
 * 就會在路上開一個洞。平滑過再用
 */
const TRAIL_SPEED_FOLLOW = 4

/**
 * 行進方向最快轉多少（弧度／秒）
 *
 * ── 為什麼不能用內插 ──
 *
 * 這裡原本是「往目標方向線性內插再正規化」，那個做法在轉一百八十度時
 * 必然出事：兩個相反的單位向量內插，中途會經過零向量，
 * 而零向量正規化出來的方向是跳的——前一幀還指著北，下一幀就指著南。
 * 原地前後走的時候每一次改變方向都踩到這件事，草因此在兩個姿勢之間彈。
 *
 * 改成用角度：每一幀往目標角度轉一小段，轉不過去就下一幀繼續。
 * 一百八十度的迴轉要花大半秒轉完，中間會經過側面——
 * 那正是「草被掃過去」的樣子，而不是「草忽然改倒向另一邊」。
 *
 * 四弧度大約是每秒兩百三十度
 */
const TRAIL_FLOW_TURN_RATE = 4

/**
 * 走多慢就不算在改變方向（格／秒）
 *
 * 站著不動時位移是幾乎為零的抖動，方向由它決定的話會亂轉。
 * 低於這個速度就沿用上一次的方向：人停在草叢裡的那一刻，
 * 草不該因為「他不動了」而開始緩緩轉向
 */
const TRAIL_FLOW_MIN_SPEED = 0.5

/**
 * 速度估計的上限（格／秒）
 *
 * 快速前往是瞬移，那一幀的位移是幾十格。沒有這個夾子的話，
 * 平滑後的速度會被那一下推高好幾秒，期間的腳印全部散開到上限
 */
const TRAIL_SPEED_MAX = 12

/**
 * 寫成 GLSL 的浮點字面值
 *
 * 直接把數字內插進著色器有個陷阱：常數若哪天被調成整數，
 * JS 會印出「3」，而 GLSL 的 3 是 int，vec2 乘 int 直接編譯失敗。
 * 一律補到小數點後三位，改成什麼值都不會踩到
 */
function toGlslFloat(value: number): string {
  return value.toFixed(3)
}

/**
 * 每一株自己的抖動
 *
 * 只有陣風的話，同一小塊裡的草會整齊得像一塊布。
 * 疊一層又快又小的擾動，每一株的相位由它自己的座標決定，
 * 葉尖那種細碎的顫動就出來了。
 *
 * 幅度寫成佔擺幅的比例，這樣調整主擺幅時顫動會跟著等比縮放，
 * 不會出現「樹葉幾乎不動、卻抖得跟草一樣厲害」
 */
const FLUTTER_RATIO = 0.25
const FLUTTER_SPEED = 2.2

/**
 * 整場風的強弱怎麼變
 *
 * 三條週期互不整除的正弦疊起來：七十九秒、三十二秒、一百五十三秒。
 * 大部分時候它們互相抵消，風就維持在中等；偶爾三條同時走到高點，
 * 那一下就是一陣把整片草壓下去的大風。
 * 因為週期永遠對不回同一個相位，那樣的時刻不會照著節拍出現
 */
const SQUALL_PERIOD_LIST = [79, 32, 153]
/** 風最小與最大各是基準的幾倍 */
const SQUALL_RANGE: [number, number] = [0.3, 1.75]

/**
 * 這一刻整場的風有多大
 *
 * 與位置無關，所以在這裡算一次、所有材質共用，不必進著色器逐頂點重算
 */
function measureSquall(elapsedSecond: number): number {
  let total = 0
  for (const [index, period] of SQUALL_PERIOD_LIST.entries()) {
    total += Math.sin(elapsedSecond * (Math.PI * 2 / period) + index * 1.7)
  }

  const normalized = total / SQUALL_PERIOD_LIST.length
  const [min, max] = SQUALL_RANGE

  return min + (max - min) * (normalized * 0.5 + 0.5)
}

/**
 * 人踩過哪裡
 *
 * 與風的時間分開放：風是每一幀由 createWindSway 推進的，
 * 而這一份還要能被除錯開關關掉。強度全歸零時著色器那段整個跳過。
 *
 * 第零個位置是活的——每一幀覆寫成人此刻的位置，所以站著不動時
 * 腳邊那一圈會一直伏著。其餘是走過留下的腳印，各自照自己的年齡恢復
 */
const trailState = {
  /** 每四個數字一個腳印：世界 XYZ 與此刻的強度。強度為零代表空位 */
  markList: new Float32Array(TRAIL_MARK_COUNT * 4),
  /**
   * 草此刻該倒向哪一邊，以角度存（弧度）
   *
   * 全場共用一個方向，不是每個腳印各記一個。這是刻意的取捨：
   * 各記各的會讓一條走過又走回來的路上出現方向相反的腳印，
   * 而把它們加起來就是互相抵銷——合力歸零，草在人還站在旁邊時
   * 就站了起來。共用一個方向則永遠不會抵銷，代價是轉彎時
   * 身後那條舊的痕會跟著轉過來。
   *
   * 存角度而不是向量，是為了轉向能限速（見 TRAIL_FLOW_TURN_RATE）
   */
  flowAngle: 0,
  /** 各腳印蓋下來幾秒了，第零個永遠是活的所以不看年齡 */
  ageList: new Float32Array(TRAIL_MARK_COUNT),
  /** 下一個腳印要蓋在哪一個位置，第零個是活的所以從一開始輪 */
  nextMarkIndex: 1,
  /** 上一個腳印蓋在哪，走遠了才蓋下一個 */
  lastStampX: 0,
  lastStampZ: 0,
  /** 上一幀人在哪，兩幀之差就是這一幀走了多遠 */
  lastFootX: 0,
  lastFootZ: 0,
  /** 平滑過的移動速度（格／秒），腳印的間距看它 */
  speed: 0,
}

/** 腳印從蓋下來到完全站回原狀的恢復曲線，一是全倒、零是站直 */
function measureRecovery(age: number): number {
  const ratio = Math.min(1, Math.max(0, age / TRAIL_RECOVER_SECOND))

  /** 平滑收尾，草不該在恢復的最後一刻「啪」地彈回去 */
  return 1 - ratio * ratio * (3 - 2 * ratio)
}

/**
 * 這一刻該隔多遠蓋一個腳印
 *
 * ── 為什麼不能是一個固定值 ──
 *
 * 位置只有十二個，蓋滿之後最舊的那一個會被新的覆寫掉。
 * 被覆寫的那一刻，它壓著的那片草是「瞬間」站回原狀的——
 * 不是恢復，是消失。而它當時往往還壓著八成。
 *
 * 這件事有多快發生，取決於蓋腳印的速度：間距固定 0.85 格、
 * 人走 5.2 格／秒，一秒六個，十一個位置一點八秒就繞完一圈。
 * 恢復要六秒，於是每一秒多都有一片草無聲地彈起來。
 * 「慢慢站回來」寫在恢復曲線裡，畫面上卻永遠看不到——
 * 因為沒有一個腳印活得到那個時候。
 *
 * ── 解法是讓一圈的長度追上恢復的時間 ──
 *
 * 一圈涵蓋的路是「間距 × 位置數」，走完它要「那段路 ÷ 速度」秒。
 * 要它不短於恢復時間，間距就得跟著速度走：跑起來時腳印散開，
 * 慢慢晃時腳印變密。於是最舊的那一個總是在恢復完之後才被回收，
 * 覆寫掉的永遠是一個已經站直的位置——彈回去的那一下就不存在了。
 *
 * 這也是為什麼這裡要自己估速度，而不是去跟漫遊控制器要一個常數：
 * 那個常數改了，這裡不會知道；而位移是量得到的
 */
function measureStampDistance(speed: number): number {
  const span = speed * TRAIL_RECOVER_SECOND / (TRAIL_MARK_COUNT - 1)

  return Math.min(TRAIL_STAMP_DISTANCE_MAX, Math.max(TRAIL_STAMP_DISTANCE_MIN, span))
}

/**
 * 推進這一幀的軌跡
 *
 * 人的位置從場景的作用中鏡頭來，不從外面傳鏡頭進來：
 * 這個模組只需要「有人在那裡」這件事，而場景本來就知道鏡頭在哪。
 * 相機的高度是眼睛，草要看的是腳——差一個身高，那正好是一株草的兩倍高
 */
function updateTrail(scene: Scene, deltaSecond: number, isEnabled: boolean): void {
  const { markList, ageList } = trailState
  const camera = scene.activeCamera

  if (!camera || !isEnabled) {
    /** 關掉時整條軌跡一起收乾淨，再打開不會憑空冒出一條舊的路 */
    markList.fill(0)
    ageList.fill(0)
    return
  }

  const footX = camera.position.x
  const footY = camera.position.y - PLAYER_EYE_HEIGHT
  const footZ = camera.position.z

  /**
   * 這一幀往哪走
   *
   * 只有真的在走才更新方向，而且一次只轉一小段。
   * 兩件事都是為了「不要跳」：站著不動時的抖動不該轉動整片草，
   * 而一百八十度的迴轉要用轉的、不能用切的
   */
  const moveX = footX - trailState.lastFootX
  const moveZ = footZ - trailState.lastFootZ
  const moveLength = Math.hypot(moveX, moveZ)
  if (deltaSecond > 0 && moveLength / deltaSecond > TRAIL_FLOW_MIN_SPEED) {
    const targetAngle = Math.atan2(moveZ, moveX)
    /** 把差角收進正負一百八十度，才不會為了轉三十度而繞一圈 */
    let deltaAngle = (targetAngle - trailState.flowAngle) % (Math.PI * 2)
    if (deltaAngle > Math.PI)
      deltaAngle -= Math.PI * 2
    if (deltaAngle < -Math.PI)
      deltaAngle += Math.PI * 2

    const turnLimit = TRAIL_FLOW_TURN_RATE * deltaSecond
    trailState.flowAngle += Math.min(turnLimit, Math.max(-turnLimit, deltaAngle))
  }

  /** 第零個是活的：人站著不動時，腳邊那一圈要一直伏著 */
  markList[0] = footX
  markList[1] = footY
  markList[2] = footZ
  markList[3] = TRAMPLE_PUSH

  /**
   * 這一幀走了多快
   *
   * 夾住上限再平滑：快速前往是瞬移，那一幀的位移有幾十格，
   * 不夾的話平滑後的速度會被那一下推高好幾秒
   */
  const frameSpeed = deltaSecond > 0
    ? Math.hypot(footX - trailState.lastFootX, footZ - trailState.lastFootZ) / deltaSecond
    : 0
  trailState.lastFootX = footX
  trailState.lastFootZ = footZ
  trailState.speed += (Math.min(TRAIL_SPEED_MAX, frameSpeed) - trailState.speed)
    * Math.min(1, deltaSecond * TRAIL_SPEED_FOLLOW)

  /**
   * 走遠了才蓋下一個腳印
   *
   * 照時間蓋的話，站著不動會把整條軌跡蓋在同一個點上，
   * 十二個位置全被同一個地方吃光，一走開身後什麼都沒留下
   */
  const stampDistance = Math.hypot(footX - trailState.lastStampX, footZ - trailState.lastStampZ)
  if (stampDistance >= measureStampDistance(trailState.speed)) {
    const offset = trailState.nextMarkIndex * 4
    markList[offset] = footX
    markList[offset + 1] = footY
    markList[offset + 2] = footZ
    markList[offset + 3] = TRAMPLE_PUSH
    ageList[trailState.nextMarkIndex] = 0

    trailState.lastStampX = footX
    trailState.lastStampZ = footZ
    /** 繞回一而不是零：第零個位置是活的，不參與輪替 */
    trailState.nextMarkIndex = trailState.nextMarkIndex + 1 >= TRAIL_MARK_COUNT
      ? 1
      : trailState.nextMarkIndex + 1
  }

  /** 舊腳印各自站回來，站直了就把位置讓出來 */
  for (let index = 1; index < TRAIL_MARK_COUNT; index++) {
    const offset = index * 4
    if (markList[offset + 3] === 0)
      continue

    const age = ageList[index]! + deltaSecond
    ageList[index] = age
    markList[offset + 3] = TRAMPLE_PUSH * measureRecovery(age)
  }
}

/**
 * 這裡不要自己宣告 windTime
 *
 * 它已經登記在 getUniforms 的 ubo 裡，Babylon 會把宣告注入
 * 材質的 uniform 區塊（頂點與片段兩支都會拿到）。
 * 在這裡再寫一次 uniform float windTime 就是重複宣告，
 * 著色器編譯直接失敗——而編譯失敗的材質不會報錯，只會整批不畫，
 * 畫面上看到的就是「所有的草突然消失」
 */
const VERTEX_DEFINITIONS = `
/**
 * 柏林噪聲
 *
 * 梯度噪聲，不是值噪聲：格點上存的是方向而非高度，
 * 內插出來的場沒有格子的痕跡，這是「像風」的關鍵
 */
vec2 windHash(vec2 point) {
  point = vec2(dot(point, vec2(127.1, 311.7)), dot(point, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(point) * 43758.5453123);
}

float windNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 offset = fract(point);
  /** 平滑係數，讓格線兩側的斜率接得上 */
  vec2 weight = offset * offset * (3.0 - 2.0 * offset);

  return mix(
    mix(
      dot(windHash(cell), offset),
      dot(windHash(cell + vec2(1.0, 0.0)), offset - vec2(1.0, 0.0)),
      weight.x
    ),
    mix(
      dot(windHash(cell + vec2(0.0, 1.0)), offset - vec2(0.0, 1.0)),
      dot(windHash(cell + vec2(1.0, 1.0)), offset - vec2(1.0, 1.0)),
      weight.x
    ),
    weight.y
  );
}
`

const VERTEX_UPDATE_POSITION = `
{
  /**
   * 這一株長在哪裡
   *
   * thin instance 的矩陣是純平移，第四行就是它的世界座標。
   * 這一段插在 instancesVertex 之前，finalWorld 還沒算出來，
   * 但 world3 這個屬性已經在了
   */
  #ifdef INSTANCES
    vec3 plantOrigin = world3.xyz;
  #else
    vec3 plantOrigin = vec3(0.0);
  #endif

  vec2 windDirection = normalize(vec2(${toGlslFloat(WIND_DIRECTION[0])}, ${toGlslFloat(WIND_DIRECTION[1])}));

  /**
   * 取樣點隨時間往風的方向退，噪聲場因此像一陣風掃過草原
   *
   * 兩層疊起來：大的那層是一陣一陣的強弱，
   * 小的那層讓陣與陣之間不會是同一個形狀
   */
  vec2 samplePoint = plantOrigin.xz * ${toGlslFloat(WIND_FIELD_SCALE)}
    - windDirection * windTime * ${toGlslFloat(WIND_FIELD_SCALE)} * ${toGlslFloat(WIND_SPEED)};
  float gust = windNoise(samplePoint) * 0.68
    + windNoise(samplePoint * 2.3 + 17.0) * 0.32;

  /**
   * 陣風只決定「這一帶此刻風多大」
   *
   * 壓成一個恆正的包絡：風會忽強忽弱，但不會反過來吹。
   * 下限留一點，草地永遠有一絲微風，不會出現整片完全靜止的死角。
   *
   * 範圍收得比整場的強弱窄：這一層負責的是「同一時刻各處的差別」，
   * 「這一陣風有多大」交給 windSquall
   */
  float gustStrength = clamp(0.7 + gust * 0.45, 0.35, 1.15);

  /**
   * 整場風的強弱
   *
   * 只隨時間走、與位置無關，所以在 CPU 那邊算好再送進來。
   * 少了它，風的大小永遠落在同一個區間裡，聽起來像一台定速的風扇；
   * 有了它才會偶爾來一陣把整片草壓下去的大風，然後慢慢緩下來
   */
  float strength = clamp(gustStrength * windSquall, 0.1, 1.7);

  /**
   * 沿著風向前進的那道波
   *
   * 相位只看「這一株在風向上站得多前面」，減去時間就成了一道
   * 往下游跑的行進波。它與陣風用同一個速度前進，
   * 所以看到的是「一陣風掃過來，草一株接一株倒下去」，
   * 而不是波與陣風各走各的
   */
  float rippleTravel = dot(plantOrigin.xz, windDirection) - windTime * ${toGlslFloat(WIND_SPEED)};
  float ripple = sin(windRippleFrequency * rippleTravel);

  /**
   * 每一株自己的細碎顫動
   *
   * 相位由它的座標決定，快慢則跟著整場的風走——風大時葉尖抖得急，
   * 風緩下來就慢慢晃。這裡用的是 CPU 累積好的相位而不是「時間乘上速度」：
   * 速度會變，而 t 乘上一個變動的速度，t 一大就會在速度改變的瞬間
   * 把相位甩出去一大段，看起來是整片草突然抽動一下
   */
  float flutterPhase = plantOrigin.x * 1.7 + plantOrigin.z * 2.3;
  float flutter = sin(windFlutterPhase + flutterPhase);

  /**
   * 越高擺得越開，或整塊一起動
   *
   * 區域座標從負零點五到正零點五，加上零點五就是「離地多高」。
   * 再平方一次：根部幾乎釘在地上，只有頂端在動——
   * 草是從底下長出來的，不是浮在空中的一片布。
   *
   * 樹葉則要整塊一起動（windHeightLeverage 給零）：
   * 樹冠是一團互相緊貼的方塊，各自彎腰的話塊與塊之間會裂開
   */
  float height = clamp(positionUpdated.y + 0.5, 0.0, 1.0);
  float leverage = mix(1.0, height * height, windHeightLeverage);

  float amplitude = windAmplitude * strength * (ripple + flutter * ${toGlslFloat(FLUTTER_RATIO)});
  vec2 sway = windDirection * amplitude * leverage;

  /**
   * 人走過去，草順著他走的方向伏倒；走開之後站回來
   *
   * 風是整片一起晃的，那是背景；這一項是「因為我在這裡」——
   * 世界對人有反應，那是走進去與看著它的差別。
   *
   * 清單裡第一個是人此刻的位置，其餘是走過的腳印。
   * 每一個腳印帶著兩份資料：它在哪裡（決定影響到誰），
   * 以及它被蓋下來時人往哪走（決定草倒向哪一邊）。
   * 強度由 CPU 照年齡算好（見 measureRecovery），
   * 所以這裡不必知道時間。
   *
   * 只有從底部彎的花草會被踩到（windHeightLeverage 是一，樹葉是零）：
   * 人走過樹底下不該讓三格高的樹冠往旁邊倒
   */
  float trampleAmount = 0.0;

  /**
   * 樹葉整個跳過這一段
   *
   * 它們的 windHeightLeverage 是零，跑完十二個腳印算出來的結果
   * 最後也會被乘成零。而樹冠的頂點數遠多於地上的花草——
   * 這一個分支省下的是全場最大一批頂點的迴圈
   */
  if (windHeightLeverage > 0.0) {
    for (int markIndex = 0; markIndex < ${TRAIL_MARK_COUNT}; markIndex++) {
      vec4 trampleMark = windTrampleList[markIndex];
      if (trampleMark.w <= 0.0) continue;

      float trampleDistance = length(plantOrigin.xz - trampleMark.xz);

      float trampleFalloff = 1.0 - smoothstep(
        ${toGlslFloat(TRAMPLE_CORE_RADIUS)},
        ${toGlslFloat(TRAMPLE_RADIUS)},
        trampleDistance
      );
      /** 高度差太多就不算踩到：橋上、屋頂上與跳起來的那一刻都不該推到草 */
      trampleFalloff *= 1.0 - smoothstep(
        0.0,
        ${toGlslFloat(TRAMPLE_HEIGHT_REACH)},
        abs(plantOrigin.y - trampleMark.y)
      );

      /**
       * 十二個腳印取最重的那一個，不是加起來
       *
       * 這一段前後改過三次，把過程記在這裡，免得日後又被改回去。
       *
       * 相加會出事，而且是兩種不同的出事：腳印各自「往外推」時，
       * 人走過去之後那一株草的前後都有腳印，兩邊方向相反、互相抵銷；
       * 改成腳印各自記住當時的行進方向也一樣，原地來回走會留下
       * 一組方向相反的腳印。兩者的症狀相同——合力歸零，
       * 草在人還站在旁邊時就站了起來，下一個腳印蓋下去又倒回去。
       *
       * 取最大值則永遠不會抵銷。而最大值是連續的：
       * 每一項都連續，逐項取 max 出來的包絡也連續，
       * 換誰當最大的那一刻兩者剛好相等，接得上
       */
      trampleAmount = max(trampleAmount, trampleMark.w * trampleFalloff);
    }
  }

  /**
   * 倒向哪一邊由全場共用的那一個方向決定
   *
   * 不由「這一株與腳印的相對位置」決定，也不由各個腳印各自記住的方向
   * 決定——那兩種做法都會在某些走法下互相抵銷（見上面那段）。
   *
   * 共用一個方向的代價是轉彎時身後那條舊的痕會跟著轉過來，
   * 換到的是「任何走法都不會跳」。而那個方向本身是限速轉的，
   * 迴轉要花大半秒（見 TRAIL_FLOW_TURN_RATE）
   */
  vec2 trampleDirection = windTrampleFlow.xy;

  /**
   * 位移一律乘上 leverage
   *
   * 這是「底部釘在原地」的保證：leverage 在根部是零、在頂端是一，
   * 而立板只有上下兩排頂點，所以底邊在數學上不可能移動。
   * 橫推與下壓都走這一項，草才是彎腰而不是整株平移
   */
  float tramplePush = trampleAmount * windHeightLeverage * leverage;
  sway += trampleDirection * tramplePush;

  positionUpdated.x += sway.x;
  positionUpdated.z += sway.y;
  /** 被踩到的同時矮下去一截，那是重量，不是風 */
  positionUpdated.y -= tramplePush * ${toGlslFloat(TRAMPLE_PRESS_RATIO)};
}
`

/**
 * 把搖擺掛上材質
 *
 * 走材質外掛而不是自己寫一份 ShaderMaterial：
 * 這些草照樣要吃平行光、環境光、霧氣與鏤空裁切，
 * 自己寫一份等於把 StandardMaterial 的那一整套重寫一遍
 */
class WindSwayPlugin extends MaterialPluginBase {
  /** 從場景開始到現在經過幾秒，風的節奏全靠它推 */
  private elapsedSecond = 0
  /** 這一刻整場的風有多大 */
  private squall = 1
  /** 顫動累積到哪個相位，由外面依當下的風速一點一點加上來 */
  private flutterPhase = 0

  constructor(
    material: StandardMaterial,
    private amplitude: number,
    /** 一為從底部彎（花草），零為整塊一起移動（樹葉） */
    private heightLeverage: number,
    /** 行進波的角頻率，由波長換算而來 */
    private rippleFrequency: number,
  ) {
    super(material, 'WindSway', 200, { WIND_SWAY: true })
    this._enable(true)
  }

  getClassName(): string {
    return 'WindSwayPlugin'
  }

  /**
   * 只登記 ubo，不要再給 vertex 宣告字串
   *
   * 兩個都給的話 Babylon 會照單全收：ubo 那份注入 uniform 區塊、
   * vertex 那份原樣貼進頂點著色器，同一個名字宣告兩次
   */
  getUniforms() {
    return {
      ubo: [
        { name: 'windTime', size: 1, type: 'float' },
        { name: 'windAmplitude', size: 1, type: 'float' },
        { name: 'windHeightLeverage', size: 1, type: 'float' },
        { name: 'windRippleFrequency', size: 1, type: 'float' },
        { name: 'windSquall', size: 1, type: 'float' },
        { name: 'windFlutterPhase', size: 1, type: 'float' },
        { name: 'windTrampleList', size: 4, type: 'vec4', arraySize: TRAIL_MARK_COUNT },
        { name: 'windTrampleFlow', size: 4, type: 'vec4' },
      ],
    }
  }

  /** 由外面每一幀推進，材質自己不知道時間過了多久 */
  setWindState(elapsedSecond: number, squall: number, flutterPhase: number): void {
    this.elapsedSecond = elapsedSecond
    this.squall = squall
    this.flutterPhase = flutterPhase
  }

  bindForSubMesh(uniformBuffer: UniformBuffer, _scene: Scene, _engine: Engine, _subMesh: SubMesh): void {
    uniformBuffer.updateFloat('windTime', this.elapsedSecond)
    uniformBuffer.updateFloat('windAmplitude', this.amplitude)
    uniformBuffer.updateFloat('windHeightLeverage', this.heightLeverage)
    uniformBuffer.updateFloat('windRippleFrequency', this.rippleFrequency)
    uniformBuffer.updateFloat('windSquall', this.squall)
    uniformBuffer.updateFloat('windFlutterPhase', this.flutterPhase)
    uniformBuffer.updateFloatArray('windTrampleList', trailState.markList)
    /** 方向在這裡才換算成向量，著色器不必為每一個頂點算一次三角函數 */
    uniformBuffer.updateFloat4(
      'windTrampleFlow',
      Math.cos(trailState.flowAngle),
      Math.sin(trailState.flowAngle),
      0,
      0,
    )
  }

  getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== 'vertex')
      return null

    return {
      CUSTOM_VERTEX_DEFINITIONS: VERTEX_DEFINITIONS,
      CUSTOM_VERTEX_UPDATE_POSITION: VERTEX_UPDATE_POSITION,
    }
  }
}

/** 一份場景共用的計時，掛上去的材質全部讀同一個數字 */
export interface WindSway {
  /**
   * 讓一份材質跟著風走
   *
   * followsHeight 為真時從底部彎（花草），為假時整塊一起移動（樹葉）
   */
  attach: (material: StandardMaterial, amplitude: number, followsHeight: boolean) => void;
  dispose: () => void;
}

export function createWindSway(scene: Scene): WindSway {
  const pluginList: WindSwayPlugin[] = []
  let elapsedSecond = 0
  let squall = measureSquall(0)
  /**
   * 顫動的相位一點一點累積
   *
   * 不能在著色器裡寫「時間 × 當下的速度」：速度是會變的，
   * 而那個乘積的變化率是「速度加上時間乘上速度的變化率」——
   * 跑了十分鐘之後，速度稍微一動就會把相位甩出去好幾圈，
   * 畫面上是整片草莫名其妙抽動一下。
   * 每一幀只加上「這一幀該轉多少」就沒有這個問題
   */
  let flutterPhase = 0

  const { state: devToggle } = useDevToggles()

  const observer = scene.onBeforeRenderObservable.add(() => {
    measureSection('風', () => {
      const deltaSecond = scene.getEngine().getDeltaTime() / 1000
      elapsedSecond += deltaSecond
      squall = measureSquall(elapsedSecond)
      /** 風越大抖得越急，但再緩也還在動 */
      flutterPhase += deltaSecond * FLUTTER_SPEED * (0.55 + squall * 0.5)

      updateTrail(scene, deltaSecond, devToggle.grassTrample)

      for (const plugin of pluginList) {
        plugin.setWindState(elapsedSecond, squall, flutterPhase)
      }
    })
  })

  return {
    attach(material, amplitude, followsHeight) {
      /**
       * 花草與樹葉的波長差很多
       *
       * 「從底部彎」的正是地上的花草，它們要一株接一株倒下去；
       * 「整塊一起動」的是樹葉，波長必須拉長到整棵樹幾乎同步，
       * 否則相鄰的葉子方塊會被推往不同方向而裂開
       */
      const wavelength = followsHeight ? PLANT_RIPPLE_WAVELENGTH : LEAF_RIPPLE_WAVELENGTH
      const plugin = new WindSwayPlugin(material, amplitude, followsHeight ? 1 : 0, Math.PI * 2 / wavelength)
      plugin.setWindState(elapsedSecond, squall, flutterPhase)
      pluginList.push(plugin)
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      pluginList.length = 0
    },
  }
}
