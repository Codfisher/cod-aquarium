<template>
  <!-- vp-raw：HUD 的淡入與提示動畫不受 VitePress 的 reduced-motion 全域歸零影響 -->
  <div
    class="game-hud vp-raw absolute inset-0"
    :class="{ 'is-dark-scene': hasDarkScene }"
  >
    <!-- 載入中：世界還在生成，先鋪一張紙 -->
    <transition name="fade">
      <div
        v-if="phase === 'loading'"
        class="hud-loading absolute inset-0 flex flex-col items-center justify-center"
      >
        <div class="loading-title">
          {{ meta.title }}
        </div>
        <div class="loading-subtitle">
          正在攤開場景...(´,,•ω•,,)
        </div>
      </div>
    </transition>

    <!-- 開始前的說明：背後是這款遊戲真正的世界（已渲染但尚未推進） -->
    <transition name="fade">
      <div
        v-if="phase === 'briefing'"
        class="hud-briefing absolute inset-0 flex items-center justify-center"
      >
        <div class="briefing-card">
          <div class="briefing-title">
            {{ meta.title }}
          </div>
          <p class="briefing-goal">
            {{ meta.briefing.goal }}
          </p>

          <!-- 操作示意：文字講不清楚的部分交給動畫 -->
          <div class="briefing-demo">
            <svg
              class="demo-svg"
              viewBox="0 0 200 96"
              aria-hidden="true"
            >
              <!-- 拖曳畫線：手指劃過，留下一條線，球滾過去 -->
              <template v-if="meta.briefing.demoKind === 'dragDraw'">
                <path
                  class="demo-ink demo-draw-path"
                  d="M28 40 L96 62 L172 48"
                />
                <circle
                  class="demo-solid demo-draw-ball"
                  r="7"
                />
                <circle
                  class="demo-finger demo-draw-finger"
                  r="9"
                />
              </template>

              <!-- 依序點擊：三個目標輪流亮起被點中 -->
              <template v-else-if="meta.briefing.demoKind === 'tapSequence'">
                <rect
                  v-for="(tapIndex, orderIndex) in [0, 1, 2]"
                  :key="tapIndex"
                  class="demo-solid demo-tap-tile"
                  :style="{ animationDelay: `${orderIndex * 0.6}s` }"
                  :x="34 + tapIndex * 52"
                  y="30"
                  width="34"
                  height="34"
                  rx="5"
                />
                <circle
                  class="demo-finger demo-tap-finger"
                  r="10"
                  cy="47"
                />
              </template>

              <!-- 按住掃描、對準放開 -->
              <template v-else-if="meta.briefing.demoKind === 'holdRelease'">
                <circle
                  class="demo-ink demo-target-ring"
                  cx="100"
                  cy="48"
                  r="15"
                />
                <circle
                  class="demo-solid demo-focus-ring"
                  cx="100"
                  cy="48"
                />
                <circle
                  class="demo-finger demo-hold-finger"
                  cx="100"
                  cy="48"
                  r="9"
                />
              </template>

              <!-- 蓄力跳：力道條往復，放開後拋物線 -->
              <template v-else-if="meta.briefing.demoKind === 'chargeJump'">
                <rect
                  class="demo-ink"
                  x="30"
                  y="76"
                  width="90"
                  height="7"
                  rx="3.5"
                  fill="none"
                />
                <rect
                  class="demo-solid demo-charge-fill"
                  x="30"
                  y="76"
                  height="7"
                  rx="3.5"
                />
                <ellipse
                  class="demo-ink"
                  cx="34"
                  cy="58"
                  rx="16"
                  ry="6"
                  fill="none"
                />
                <ellipse
                  class="demo-ink"
                  cx="158"
                  cy="58"
                  rx="16"
                  ry="6"
                  fill="none"
                />
                <circle
                  class="demo-solid demo-jump-fish"
                  r="7"
                />
              </template>

              <!-- 定點轉向：朝向跟著手指掃，放開時扇形爆開 -->
              <template v-else>
                <circle
                  class="demo-ink"
                  cx="100"
                  cy="48"
                  r="30"
                  stroke-dasharray="3 5"
                />
                <g class="demo-aim-group">
                  <path
                    class="demo-ink demo-aim-cone"
                    d="M100 48 L164 26 L164 70 Z"
                  />
                  <path
                    class="demo-solid demo-aim-flash"
                    d="M100 48 L164 26 L164 70 Z"
                  />
                  <circle
                    class="demo-finger demo-aim-finger"
                    cx="146"
                    cy="48"
                    r="9"
                  />
                </g>
                <circle
                  class="demo-solid"
                  cx="100"
                  cy="48"
                  r="7"
                />
              </template>
            </svg>
          </div>

          <ol class="briefing-step-list">
            <li
              v-for="(step, stepIndex) in meta.briefing.controlStepList"
              :key="stepIndex"
            >
              {{ step }}
            </li>
          </ol>

          <dl class="briefing-rule-list">
            <div class="rule-row">
              <dt>結束條件</dt>
              <dd>{{ meta.briefing.failCondition }}</dd>
            </div>
            <div class="rule-row">
              <dt>計分</dt>
              <dd>{{ meta.briefing.scoreRule }}</dd>
            </div>
            <div
              v-if="nextMilestone"
              class="rule-row"
            >
              <dt>下個獎勵</dt>
              <dd>{{ nextMilestone.score }} {{ meta.scoreUnit }} 解鎖「{{ nextRewardName }}」</dd>
            </div>
          </dl>

          <div class="briefing-button-row">
            <button
              type="button"
              class="result-button is-primary"
              @click="emit('begin')"
            >
              開始
            </button>
            <button
              type="button"
              class="result-button"
              @click="emit('close')"
            >
              回魚缸
            </button>
          </div>
        </div>
      </div>
    </transition>

    <template v-if="phase === 'playing' || phase === 'over'">
      <div class="hud-top-bar absolute flex items-start justify-between">
        <button
          type="button"
          class="hud-exit-button"
          aria-label="離開遊戲"
          @click="emit('close')"
        >
          <UIcon
            name="i-material-symbols:arrow-back-rounded"
            class="exit-icon"
            aria-hidden="true"
          />
          <span class="exit-label">回魚缸</span>
        </button>

        <div class="hud-score-block">
          <div class="score-value">
            {{ score }}<span class="score-unit">{{ meta.scoreUnit }}</span>
          </div>
          <div
            v-if="bestScore > 0"
            class="score-best"
          >
            最佳 {{ bestScore }}
          </div>
        </div>
      </div>

      <!-- 里程碑進度：只顯示下一個目標，達成過的不再佔畫面 -->
      <div
        v-if="nextMilestone"
        class="hud-milestone absolute"
      >
        <div class="milestone-track">
          <div
            class="milestone-fill"
            :style="{ width: `${milestoneProgressPercent}%` }"
          />
        </div>
        <div class="milestone-label">
          {{ nextMilestone.score }} {{ meta.scoreUnit }} 解鎖「{{ nextRewardName }}」
        </div>
      </div>

      <!-- 遊戲自訂儀表：電量、大絕槽、生命燈。內容由遊戲每幀回報 -->
      <div
        v-if="hasHudGaugeContent"
        class="hud-game-status absolute"
      >
        <div
          v-if="hudState.pipRowList.length"
          class="status-pip-group"
        >
          <div
            v-for="pipRow in hudState.pipRowList"
            :key="pipRow.key"
            class="status-pip-row"
            :class="`pip-${pipRow.tone}`"
          >
            <span
              v-for="pipIndex in pipRow.total"
              :key="pipIndex"
              class="status-pip"
              :class="{ 'is-filled': pipIndex <= pipRow.filled }"
            />
          </div>
        </div>

        <div
          v-for="gauge in hudState.gaugeList"
          :key="gauge.key"
          class="status-gauge"
          :class="[`gauge-${gauge.tone}`, { 'is-full': gauge.ratio >= 1 }]"
        >
          <div
            class="gauge-fill"
            :style="{ width: `${Math.min(100, Math.max(0, gauge.ratio * 100))}%` }"
          />
        </div>
      </div>

      <!-- 遊戲自訂按鈕（大絕）。沒得用時遊戲會直接不回報，畫面保持乾淨 -->
      <div
        v-if="readyHudActionList.length"
        class="hud-game-action absolute"
      >
        <button
          v-for="action in readyHudActionList"
          :key="action.key"
          type="button"
          class="game-action-button"
          @pointerdown.stop.prevent="emit('hudAction', action.key)"
        >
          {{ action.label }}
        </button>
      </div>
    </template>

    <transition name="fade">
      <div
        v-if="controlHintVisible"
        class="hud-control-hint absolute text-center"
      >
        {{ meta.controlHint }}
      </div>
    </transition>

    <transition name="toast">
      <div
        v-if="toastText"
        :key="`${toastText}-${toastSequence}`"
        class="hud-toast absolute text-center"
      >
        {{ toastText }}
      </div>
    </transition>

    <transition name="fade">
      <div
        v-if="phase === 'over'"
        class="hud-result absolute inset-0 flex items-center justify-center"
      >
        <div class="result-card">
          <div class="result-title">
            {{ isNewRecord ? '新紀錄！' : '結束了' }}
          </div>
          <div class="result-score">
            {{ score }}<span class="result-unit">{{ meta.scoreUnit }}</span>
          </div>
          <div class="result-best">
            最佳紀錄 {{ Math.max(score, bestScore) }} {{ meta.scoreUnit }}
          </div>

          <div
            v-if="newRewardList.length > 0"
            class="result-reward-list"
          >
            <div class="reward-list-title">
              解鎖了
            </div>
            <div
              v-for="reward in newRewardList"
              :key="reward.id"
              class="reward-item"
            >
              <UIcon
                name="i-material-symbols:styler-outline-rounded"
                class="reward-icon"
                aria-hidden="true"
              />
              <div class="reward-text">
                <div class="reward-name">
                  {{ reward.name }}
                </div>
                <div class="reward-description">
                  {{ reward.description }}
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="hasJustCleared"
            class="result-clear-note"
          >
            過關！魚缸裡的連結解鎖了
          </div>

          <div class="result-button-row">
            <button
              type="button"
              class="result-button is-primary"
              @click="emit('retry')"
            >
              再玩一次
            </button>
            <button
              type="button"
              class="result-button"
              @click="emit('close')"
            >
              回魚缸
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import type { GameHudState, MiniGameMeta } from './games/game-contract'
import type { RewardDefinition, RewardId } from './rewards/reward-registry'
import { computed, onUnmounted, ref, watch } from 'vue'
import { getNextMilestone } from './games/game-contract'
import { rewardDefinitionMap } from './rewards/reward-registry'

export type GameHudPhase = 'loading' | 'briefing' | 'playing' | 'over'

const props = defineProps<{
  meta: MiniGameMeta;
  phase: GameHudPhase;
  score: number;
  bestScore: number;
  toastText: string;
  /** 本場新解鎖的獎勵 */
  newRewardIdList: RewardId[];
  /** 本場首次達到過關門檻（作品連結剛解鎖） */
  hasJustCleared: boolean;
  /** 遊戲自訂的儀表與按鈕。沒有自訂 HUD 的遊戲永遠是空的 */
  hudState: GameHudState;
}>()

const emit = defineEmits<{
  /** 玩家看完說明按下開始 */
  begin: [];
  retry: [];
  close: [];
  /** HUD 上的自訂按鈕被按下，帶 GameHudAction 的 key */
  hudAction: [actionKey: string];
}>()

/** 沒得用的按鈕不佔畫面：留一顆按不動的灰按鈕只是干擾 */
const readyHudActionList = computed(() => props.hudState.actionList.filter((action) => action.isReady))

const hasHudGaugeContent = computed(
  () => props.hudState.gaugeList.length > 0 || props.hudState.pipRowList.length > 0,
)

/** 場景在淺色模式下是不是也暗的。
 *
 * HUD 的文字色跟著站台主題走（淺色模式用深藍灰），但遊戲場景的底色由自己決定——
 * 蠟筆滑道改成深水下潛後，淺色模式的底色也接近全黑，深色文字就整個埋進背景。
 * 從場景底色的亮度自己判斷，比多開一個旗標容易漏掉同步
 */
const hasDarkScene = computed(() => {
  const hex = props.meta.sceneOptions.clearColorHex.replace('#', '')
  if (hex.length !== 6) {
    return false
  }
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255
  return red * 0.299 + green * 0.587 + blue * 0.114 < 0.4
})

/** toast 文字可能連續重複（「連段 ×2」接著又是「連段 ×2」），
 * 用遞增序號併入 key，重複文字也能重播進場動畫
 */
const toastSequence = ref(0)
watch(() => props.toastText, () => {
  toastSequence.value += 1
})

/** 開場操作提示：進入遊玩後顯示數秒自動收起 */
const controlHintVisible = ref(false)
let controlHintTimer: ReturnType<typeof setTimeout> | undefined

watch(() => props.phase, (phase) => {
  clearTimeout(controlHintTimer)
  if (phase !== 'playing') {
    controlHintVisible.value = false
    return
  }
  controlHintVisible.value = true
  controlHintTimer = setTimeout(() => {
    controlHintVisible.value = false
  }, 3600)
}, { immediate: true })

onUnmounted(() => {
  clearTimeout(controlHintTimer)
})

const nextMilestone = computed(() => (
  getNextMilestone(props.meta, Math.max(props.score, props.bestScore))
))
const nextRewardName = computed(() => (
  nextMilestone.value ? rewardDefinitionMap[nextMilestone.value.rewardId].name : ''
))

/** 進度條以「上一個里程碑到下一個」為區間，
 * 否則每次都從 0 慢慢爬，後期里程碑的進度看起來永遠不動
 */
const milestoneProgressPercent = computed(() => {
  const milestone = nextMilestone.value
  if (!milestone) {
    return 100
  }
  const milestoneIndex = props.meta.milestoneList.indexOf(milestone)
  const previousScore = milestoneIndex > 0 ? props.meta.milestoneList[milestoneIndex - 1]!.score : 0
  const span = Math.max(1, milestone.score - previousScore)
  const progress = (props.score - previousScore) / span
  return Math.min(100, Math.max(0, progress * 100))
})

const isNewRecord = computed(() => props.score > props.bestScore)
const newRewardList = computed<RewardDefinition[]>(() => (
  props.newRewardIdList.map((rewardId) => rewardDefinitionMap[rewardId])
))
</script>

<style scoped lang="sass">
.game-hud
  pointer-events: none
  color: light-dark(oklch(0.36 0.05 220), oklch(0.92 0.02 220))

// 場景底色本身就暗：不管站台主題是淺是深，HUD 一律走亮色，
// 連帶把幾個「假設背景是淺色」的陰影與底色一起翻面
.game-hud.is-dark-scene
  color: oklch(0.92 0.02 220)

  // 全螢幕面板自帶跟著主題走的底色，跟著翻成亮字會變成淺底淺字，維持原本的配色
  .hud-loading,
  .hud-briefing,
  .hud-result
    color: light-dark(oklch(0.36 0.05 220), oklch(0.92 0.02 220))

  .score-value
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7)

  .milestone-track
    background: rgba(255, 255, 255, 0.16)

  .hud-exit-button
    border-color: rgba(255, 255, 255, 0.18)
    background: rgba(20, 28, 34, 0.85)

.hud-loading
  gap: 18px
  background: light-dark(rgba(245, 239, 226, 0.9), rgba(28, 34, 42, 0.9))

.loading-title
  font-size: 22px
  font-weight: 600
  letter-spacing: 6px
  text-indent: 6px

.loading-subtitle
  font-size: 13px
  letter-spacing: 3px
  opacity: 0.6

.hud-top-bar
  top: 14px
  left: 16px
  right: 16px

.hud-exit-button
  appearance: none
  pointer-events: auto
  display: flex
  align-items: center
  gap: 4px
  padding: 5px 12px 5px 8px
  border: 1px solid light-dark(rgba(62, 95, 82, 0.25), rgba(255, 255, 255, 0.16))
  border-radius: 999px
  font-family: inherit
  font-size: 13px
  letter-spacing: 1px
  cursor: pointer
  color: inherit
  background: light-dark(rgba(255, 253, 247, 0.88), rgba(36, 46, 52, 0.88))
  transition: background 0.2s, transform 0.15s

  &:hover
    transform: translateY(-1px)
    background: light-dark(rgba(255, 253, 247, 1), rgba(36, 46, 52, 1))

.exit-icon
  font-size: 16px

.exit-label
  white-space: nowrap

.hud-score-block
  text-align: right

// 分數字級大、字重高：遊玩中靠餘光就要讀得到
.score-value
  font-size: clamp(28px, 6vw, 40px)
  font-weight: 700
  line-height: 1
  font-variant-numeric: tabular-nums
  text-shadow: 0 1px 3px light-dark(rgba(255, 253, 247, 0.8), rgba(0, 0, 0, 0.6))

.score-unit
  margin-left: 3px
  font-size: 14px
  font-weight: 500
  opacity: 0.6

.score-best
  margin-top: 2px
  font-size: 12px
  letter-spacing: 1px
  opacity: 0.55

.hud-milestone
  left: 16px
  bottom: 16px
  width: min(240px, 46%)

.milestone-track
  height: 4px
  border-radius: 999px
  overflow: hidden
  background: light-dark(rgba(62, 95, 82, 0.18), rgba(255, 255, 255, 0.14))

.milestone-fill
  height: 100%
  border-radius: 999px
  background: light-dark(#4f9ac2, #6bb0d4)
  transition: width 0.3s ease-out

.milestone-label
  margin-top: 5px
  font-size: 12px
  letter-spacing: 0.5px
  opacity: 0.62

// --- 遊戲自訂儀表：疊在里程碑條上方，靠左與它對齊成一欄 ---
.hud-game-status
  left: 16px
  bottom: 62px
  display: flex
  flex-direction: column
  gap: 6px
  width: min(180px, 38%)

.status-pip-group
  display: flex
  flex-direction: column
  gap: 4px

.status-pip-row
  display: flex
  gap: 4px

.status-pip
  border-radius: 999px
  background: light-dark(rgba(62, 95, 82, 0.22), rgba(255, 255, 255, 0.16))
  transition: background 0.2s, transform 0.2s

// 生命：圓點夠大才讀得出剩幾條命，是最該一眼看到的資訊
.pip-life .status-pip
  width: 12px
  height: 12px

  &.is-filled
    background: light-dark(#e2564a, #ff6d5e)
    box-shadow: 0 0 0 1px light-dark(rgba(255, 253, 247, 0.7), rgba(0, 0, 0, 0.35))

.status-gauge
  position: relative
  height: 6px
  border-radius: 999px
  overflow: hidden
  background: light-dark(rgba(62, 95, 82, 0.18), rgba(255, 255, 255, 0.14))

.gauge-fill
  height: 100%
  border-radius: 999px
  transition: width 0.12s linear

// 電力用綠色：與下方大絕槽的金色分得更開，餘光掃過就知道看的是哪一條
.gauge-energy .gauge-fill
  background: light-dark(#4a9e63, #6cc088)

.gauge-ultimate
  height: 5px

  .gauge-fill
    background: light-dark(#d8952f, #f0b95a)

  // 蓄滿了整條轉亮並輕輕呼吸，餘光掃到就知道大絕能放了
  &.is-full .gauge-fill
    background: light-dark(#fff3d4, #fff6e0)
    animation: gauge-ready-pulse 1.1s ease-in-out infinite

@keyframes gauge-ready-pulse
  0%, 100%
    opacity: 1
  50%
    opacity: 0.55

// --- 遊戲自訂按鈕：右下角，拇指構得到又不擋畫面中央 ---
.hud-game-action
  right: 16px
  bottom: 62px
  display: flex
  flex-direction: column
  gap: 8px

.game-action-button
  appearance: none
  pointer-events: auto
  padding: 6px 12px
  border: 1px solid light-dark(rgba(216, 149, 47, 0.5), rgba(240, 185, 90, 0.45))
  border-radius: 999px
  font-family: inherit
  font-size: 12px
  font-weight: 600
  letter-spacing: 1px
  cursor: pointer
  color: light-dark(#6d4410, #2a1f0c)
  background: light-dark(rgba(255, 233, 186, 0.95), rgba(240, 185, 90, 0.92))
  box-shadow: 0 2px 10px light-dark(rgba(120, 80, 20, 0.25), rgba(0, 0, 0, 0.35))
  animation: action-ready-pulse 1.1s ease-in-out infinite
  transition: transform 0.12s

  &:active
    transform: scale(0.94)

@keyframes action-ready-pulse
  0%, 100%
    box-shadow: 0 2px 10px light-dark(rgba(120, 80, 20, 0.25), rgba(0, 0, 0, 0.35))
  50%
    box-shadow: 0 2px 18px light-dark(rgba(216, 149, 47, 0.6), rgba(240, 185, 90, 0.5))

.hud-control-hint
  left: 0
  right: 0
  bottom: 22%
  font-size: 15px
  letter-spacing: 2px
  color: #fff
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.85), 0 2px 10px rgba(15, 30, 40, 0.6)

.hud-toast
  left: 0
  right: 0
  top: 30%
  font-size: clamp(18px, 4vw, 26px)
  font-weight: 600
  letter-spacing: 3px
  color: #fff
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.85), 0 2px 12px rgba(15, 30, 40, 0.55)

// 開始前說明：底色留半透明，玩家看得到背後那款遊戲的世界
.hud-briefing
  background: light-dark(rgba(245, 239, 226, 0.55), rgba(20, 26, 33, 0.62))
  backdrop-filter: blur(2px)

.briefing-card
  pointer-events: auto
  width: min(360px, 88%)
  max-height: 88%
  overflow-y: auto
  padding: 20px 22px 18px
  border-radius: 16px
  background-color: light-dark(rgba(255, 253, 247, 0.97), rgba(34, 43, 50, 0.97))
  // 深色模式疊一層同色蓋色壓淡紙紋：貼著說明文字的卡片，紙紋比在大面積背景上顯眼很多，
  // 蓋色壓下去才夠淡；淺色模式蓋色 alpha 0，維持原樣
  background-image: linear-gradient(light-dark(rgba(34, 43, 50, 0), rgba(34, 43, 50, 0.6)), light-dark(rgba(34, 43, 50, 0), rgba(34, 43, 50, 0.6))), var(--paper-grain-url, none)
  background-repeat: repeat
  background-size: 200px 200px
  border: 1px solid light-dark(rgba(62, 95, 82, 0.24), rgba(255, 255, 255, 0.14))
  box-shadow: 0 14px 40px light-dark(rgba(27, 42, 51, 0.26), rgba(0, 0, 0, 0.55))

.briefing-title
  text-align: center
  font-size: 18px
  font-weight: 600
  letter-spacing: 5px
  text-indent: 5px

.briefing-goal
  margin: 10px 0 0
  font-size: 13px
  line-height: 1.75
  text-align: center
  opacity: 0.82

.briefing-demo
  margin-top: 12px
  padding: 6px 0
  border-radius: 10px
  background: light-dark(rgba(62, 95, 82, 0.06), rgba(255, 255, 255, 0.05))

.demo-svg
  display: block
  width: 100%
  height: 96px

// 示意圖統一語彙：ink 是輔助線（虛線細），solid 是實體，finger 是手指
.demo-ink
  fill: none
  stroke: light-dark(rgba(61, 79, 102, 0.5), rgba(200, 214, 230, 0.45))
  stroke-width: 2
  stroke-linecap: round

.demo-solid
  fill: light-dark(#4f9ac2, #6bb0d4)
  stroke: none

.demo-finger
  fill: light-dark(rgba(201, 111, 90, 0.28), rgba(232, 181, 74, 0.3))
  stroke: light-dark(#c96f5a, #e8b54a)
  stroke-width: 2

// 拖曳畫線：手指沿路徑走、線同步被畫出來，接著球滾過去
.demo-draw-path
  stroke: light-dark(#c96f5a, #e8b54a)
  stroke-width: 4
  stroke-dasharray: 160
  stroke-dashoffset: 160
  animation: demo-draw-line 3.2s ease-in-out infinite

.demo-draw-finger
  offset-path: path('M28 40 L96 62 L172 48')
  animation: demo-draw-finger 3.2s ease-in-out infinite

.demo-draw-ball
  offset-path: path('M28 33 L96 55 L172 41')
  opacity: 0
  animation: demo-draw-ball 3.2s ease-in-out infinite

@keyframes demo-draw-line
  0%
    stroke-dashoffset: 160
  35%
    stroke-dashoffset: 0
  100%
    stroke-dashoffset: 0

@keyframes demo-draw-finger
  0%
    offset-distance: 0%
    opacity: 1
  35%
    offset-distance: 100%
    opacity: 1
  45%, 100%
    offset-distance: 100%
    opacity: 0

@keyframes demo-draw-ball
  0%, 45%
    offset-distance: 0%
    opacity: 0
  50%
    offset-distance: 0%
    opacity: 1
  90%, 100%
    offset-distance: 100%
    opacity: 1

// 依序點擊：三塊字依序被點亮，手指跟著移動
.demo-tap-tile
  opacity: 0.3
  animation: demo-tap-tile 1.8s ease-in-out infinite

.demo-tap-finger
  animation: demo-tap-finger 1.8s ease-in-out infinite

@keyframes demo-tap-tile
  0%, 20%
    opacity: 0.3
  30%, 100%
    opacity: 1

@keyframes demo-tap-finger
  0%, 20%
    cx: 51px
    transform: scale(1)
  30%
    transform: scale(0.75)
  33%, 53%
    cx: 103px
    transform: scale(1)
  63%
    transform: scale(0.75)
  66%, 86%
    cx: 155px
    transform: scale(1)
  96%, 100%
    transform: scale(0.75)

// 按住對焦：對焦環由大縮到目標圈大小，合上就放開
.demo-focus-ring
  fill: none
  stroke: light-dark(#4f9ac2, #6bb0d4)
  stroke-width: 2.5
  animation: demo-focus-ring 2.6s ease-in-out infinite

.demo-hold-finger
  animation: demo-hold-finger 2.6s ease-in-out infinite

@keyframes demo-focus-ring
  0%
    r: 38px
    opacity: 0.5
  55%
    r: 15px
    opacity: 1
  70%
    r: 15px
    opacity: 1
  75%
    r: 22px
    opacity: 0
  100%
    r: 38px
    opacity: 0

@keyframes demo-hold-finger
  0%, 68%
    opacity: 0.9
    transform: scale(0.8)
  72%, 100%
    opacity: 0
    transform: scale(1.3)

// 蓄力跳：力道條往復，滿意的時機放開，魚跳到對岸
.demo-charge-fill
  width: 0
  animation: demo-charge-fill 2.8s ease-in-out infinite

.demo-jump-fish
  offset-path: path('M34 52 Q96 6 158 52')
  animation: demo-jump-fish 2.8s ease-in-out infinite

@keyframes demo-charge-fill
  0%
    width: 0
  40%
    width: 62px
  45%, 100%
    width: 0

@keyframes demo-jump-fish
  0%, 45%
    offset-distance: 0%
  85%, 100%
    offset-distance: 100%

// 定點轉向：整組（扇形＋手指）繞著中心的魚轉，停住的瞬間閃光爆開
.demo-aim-group
  transform-origin: 100px 48px
  animation: demo-aim-sweep 2.8s ease-in-out infinite

.demo-aim-flash
  opacity: 0
  animation: demo-aim-flash 2.8s ease-in-out infinite

.demo-aim-finger
  animation: demo-aim-press 2.8s ease-in-out infinite

@keyframes demo-aim-sweep
  0%
    transform: rotate(-62deg)
  46%, 60%
    transform: rotate(38deg)
  100%
    transform: rotate(-62deg)

@keyframes demo-aim-flash
  0%, 48%
    opacity: 0
  54%
    opacity: 0.9
  74%, 100%
    opacity: 0

@keyframes demo-aim-press
  0%, 46%
    opacity: 1
    r: 9
  54%
    r: 6.5
  62%, 100%
    opacity: 0
    r: 9

.briefing-step-list
  margin: 14px 0 0
  padding-left: 20px
  display: flex
  flex-direction: column
  gap: 6px
  font-size: 13px
  line-height: 1.65

  li
    padding-left: 2px

  li::marker
    color: light-dark(#4f9ac2, #6bb0d4)
    font-weight: 600

.briefing-rule-list
  margin: 14px 0 0
  padding-top: 12px
  border-top: 1px dashed light-dark(rgba(62, 95, 82, 0.25), rgba(255, 255, 255, 0.16))
  display: flex
  flex-direction: column
  gap: 7px

.rule-row
  display: flex
  align-items: baseline
  gap: 10px
  font-size: 12px
  line-height: 1.6

  dt
    flex-shrink: 0
    width: 4.5em
    letter-spacing: 1px
    opacity: 0.5

  dd
    margin: 0
    opacity: 0.82

.briefing-button-row
  margin-top: 16px
  display: flex
  gap: 8px

.hud-result
  background: light-dark(rgba(245, 239, 226, 0.82), rgba(24, 30, 38, 0.86))

.result-card
  pointer-events: auto
  width: min(320px, 82%)
  max-height: 84%
  overflow-y: auto
  padding: 20px 22px 18px
  border-radius: 16px
  text-align: center
  background: light-dark(rgba(255, 253, 247, 0.97), rgba(36, 46, 52, 0.97))
  border: 1px solid light-dark(rgba(62, 95, 82, 0.24), rgba(255, 255, 255, 0.14))
  box-shadow: 0 12px 34px light-dark(rgba(27, 42, 51, 0.24), rgba(0, 0, 0, 0.5))

.result-title
  font-size: 17px
  font-weight: 600
  letter-spacing: 4px
  text-indent: 4px

.result-score
  margin-top: 8px
  font-size: 42px
  font-weight: 700
  line-height: 1
  font-variant-numeric: tabular-nums

.result-unit
  margin-left: 4px
  font-size: 15px
  font-weight: 500
  opacity: 0.55

.result-best
  margin-top: 6px
  font-size: 12px
  letter-spacing: 1px
  opacity: 0.55

.result-reward-list
  margin-top: 16px
  padding-top: 14px
  border-top: 1px dashed light-dark(rgba(62, 95, 82, 0.25), rgba(255, 255, 255, 0.16))
  display: flex
  flex-direction: column
  gap: 10px

.reward-list-title
  font-size: 12px
  letter-spacing: 3px
  opacity: 0.55

.reward-item
  display: flex
  align-items: flex-start
  gap: 9px
  text-align: left

.reward-icon
  flex-shrink: 0
  margin-top: 2px
  font-size: 18px
  color: light-dark(#c9932f, #e8b54a)

.reward-text
  min-width: 0

.reward-name
  font-size: 13px
  font-weight: 600
  letter-spacing: 1px

.reward-description
  margin-top: 2px
  font-size: 12px
  line-height: 1.6
  opacity: 0.66

.result-clear-note
  margin-top: 14px
  padding: 7px 10px
  border-radius: 8px
  font-size: 12px
  letter-spacing: 1px
  color: light-dark(oklch(0.42 0.09 150), oklch(0.86 0.09 150))
  background: light-dark(rgba(125, 155, 118, 0.16), rgba(125, 155, 118, 0.22))

.result-button-row
  margin-top: 18px
  display: flex
  gap: 8px

.result-button
  appearance: none
  flex: 1
  padding: 9px 0
  border: 1px solid light-dark(rgba(62, 95, 82, 0.25), rgba(255, 255, 255, 0.16))
  border-radius: 999px
  font-family: inherit
  font-size: 13px
  font-weight: 600
  letter-spacing: 2px
  cursor: pointer
  color: inherit
  background: transparent
  transition: transform 0.15s, box-shadow 0.15s, background 0.2s

  &:hover
    transform: translateY(-1px)
    background: light-dark(rgba(27, 42, 51, 0.05), rgba(255, 255, 255, 0.07))

  &.is-primary
    border-color: transparent
    color: #fff
    background: light-dark(#4f9ac2, #3d7ba0)
    box-shadow: 0 3px 10px light-dark(rgba(27, 42, 51, 0.25), rgba(0, 0, 0, 0.4))

    &:hover
      box-shadow: 0 5px 14px light-dark(rgba(27, 42, 51, 0.35), rgba(0, 0, 0, 0.55))

.fade
  &-enter-active, &-leave-active
    transition: opacity 0.3s
  &-enter-from, &-leave-to
    opacity: 0

// toast 由下往上浮出再淡出，離場比進場快，連續回饋才跟得上節奏
// toast 的進場刻意不用 transition 而用 keyframes：
// 要的是「瞬間衝出來 → 煞車 → 果凍般晃兩下停住」的節奏，
// 這種先過衝再回彈的曲線 transition 做不出來。
// 傾斜也一起帶：正正方方地跳出來會很像系統通知，歪一點才有手作感
@keyframes toast-pop
  0%
    opacity: 0
    transform: translateY(14px) scale(0.55) rotate(-7deg)
  // 幾乎瞬間衝到最大：前 18% 就衝過頭，這一段是「跳出來」
  18%
    opacity: 1
    transform: translateY(-4px) scale(1.16) rotate(4deg)
  // 煞車：反向收過頭一點
  38%
    transform: translateY(1px) scale(0.94) rotate(-2.5deg)
  58%
    transform: translateY(0) scale(1.05) rotate(1.4deg)
  76%
    transform: scale(0.98) rotate(-0.6deg)
  100%
    opacity: 1
    transform: scale(1) rotate(0deg)

.toast
  &-enter-active
    // 果凍感全靠這條曲線的過衝，時長短才會有「彈」而不是「飄」
    animation: toast-pop 0.52s cubic-bezier(0.22, 1.4, 0.36, 1) both
  &-leave-active
    transition: opacity 0.24s ease-in, transform 0.24s ease-in
  &-leave-to
    opacity: 0
    transform: translateY(-14px) scale(0.9) rotate(2deg)
</style>
