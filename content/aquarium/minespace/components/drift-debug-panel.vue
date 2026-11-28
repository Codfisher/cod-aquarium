<template>
  <div
    v-if="visible"
    class="drift-debug"
  >
    <div class="drift-debug-title">
      <span>{{ t('title') }}</span>
      <UButton
        size="xs"
        color="neutral"
        variant="subtle"
        :icon="copied ? 'i-material-symbols:check' : 'i-material-symbols:content-copy-outline'"
        :label="copied ? t('copied') : t('copy')"
        @click="copySnapshot()"
      />
    </div>

    <template v-if="snapshot">
      <div
        v-for="row in rowList"
        :key="row.label"
        class="drift-debug-row"
      >
        <span class="drift-debug-label">{{ row.label }}</span>
        <span :class="{ 'drift-debug-alert': row.isAlert }">{{ row.value }}</span>
      </div>
    </template>
    <div
      v-else
      class="drift-debug-row"
    >
      {{ t('idle') }}
    </div>

    <div class="drift-debug-hint">
      {{ t('hint') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DriftDebugSnapshot } from '../domains/drift/drift-debug'
import { useClipboard, useEventListener } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { reportDiagnostic } from '../composables/use-error-logger'
import { useSimpleI18n } from '../composables/use-simple-i18n'
import { formatDriftDebugLine } from '../domains/drift/drift-debug'

/**
 * 神遊除錯面板（只在開發模式掛上來）
 *
 * 使用者看神遊時覺得哪一段不好（一直看山壁、飛太高、轉太快），要能說出「當時鏡頭在做什麼」。
 * F10 開關面板，開著時渲染端每秒四次送快照上來（關著不送、不算）；面板不跟著其他介面淡出。
 * F2 或「複製」把現在這一刻、最近二十秒（每秒一行）與最近十次換鏡位的紀錄複製成文字，貼回來就能查。
 * 文字格式見 domains/drift/drift-debug 的 formatDriftDebugLine
 */

interface Props {
  /** 渲染端送上來的最新快照；沒在神遊、或面板剛打開還沒收到是 null */
  snapshot: DriftDebugSnapshot | null;
}

const props = defineProps<Props>()

const emit = defineEmits<{
  /** 面板開或關：主執行緒據此要渲染端開始或停止送快照 */
  toggle: [isEnabled: boolean];
}>()

const { t } = useSimpleI18n({
  'zh-hant': {
    title: '神遊除錯',
    copy: '複製',
    copied: '已複製',
    idle: '沒有在神遊（開始神遊後這裡才有資料）',
    hint: 'F10 開關 · F2 複製（現在＋最近 20 秒＋換鏡位紀錄）',
    position: '位置',
    view: '鏡頭',
    stage: '階段',
    shot: '鏡位',
    look: '視線',
    depth: '前方',
    motion: '移動',
    session: '場次',
    nearWall: '近牆',
    hidden: '被擋住',
    visible: '看得到',
  },
  'en': {
    title: 'Drift debug',
    copy: 'Copy',
    copied: 'Copied',
    idle: 'Not drifting (data appears once drift starts)',
    hint: 'F10 toggle · F2 copy (now + last 20 s + shot changes)',
    position: 'Position',
    view: 'Camera',
    stage: 'Stage',
    shot: 'Shot',
    look: 'Look',
    depth: 'Ahead',
    motion: 'Motion',
    session: 'Session',
    nearWall: 'near wall',
    hidden: 'blocked',
    visible: 'visible',
  },
} as const)

/** 歷史留幾行（每秒一行）、換鏡位的紀錄留幾筆 */
const HISTORY_LINE_MAX = 20
const SHOT_LOG_MAX = 10

const visible = ref(false)
/** 最近每秒一行的快照文字，與每次換鏡位那一刻的快照文字 */
const historyLineList: string[] = []
const shotLineList: string[] = []
let lastHistorySecond = -1
let lastShotKey = ''
let shotLogIndex = 0

const { copy, copied } = useClipboard({ legacy: true })

function formatValue(value: number | null, digitCount = 0): string {
  return value === null ? '-' : value.toFixed(digitCount)
}

/** 面板上顯示的幾列：人看的，欄位比複製出去的那一行少，只留判斷「鏡頭在做什麼」最常用的 */
const rowList = computed(() => {
  const snapshot = props.snapshot
  if (!snapshot)
    return []

  const targetText = snapshot.targetName
    ? `${snapshot.targetName}（${snapshot.targetKind}）`
    : ''
  const visibleText = snapshot.isTargetVisible === null ? '' : snapshot.isTargetVisible ? t('visible') : t('hidden')
  const stayText = snapshot.lingerDuration === null ? '' : ` · ${formatValue(snapshot.lingerElapsed)}/${formatValue(snapshot.lingerDuration)}s ${snapshot.beat ?? ''}`
  const tripText = snapshot.tripProgress === null ? '' : ` · ${Math.round(snapshot.tripProgress * 100)}%`

  return [
    { label: t('session'), value: `${snapshot.realmId} · ${snapshot.sessionId} · ${formatValue(snapshot.clock)}s · ${snapshot.timeOfDay.toFixed(3)} ${snapshot.slot}`, isAlert: false },
    { label: t('position'), value: `${snapshot.x.toFixed(1)}, ${snapshot.y.toFixed(1)}, ${snapshot.z.toFixed(1)} · +${snapshot.altitude.toFixed(1)}`, isAlert: false },
    { label: t('view'), value: `yaw ${snapshot.yawDegree.toFixed(0)}° pitch ${snapshot.pitchDegree.toFixed(0)}° fov ${formatValue(snapshot.fovDegree)}°`, isAlert: false },
    { label: t('stage'), value: `${snapshot.phase}${snapshot.isGlide ? '(glide)' : ''} · ${snapshot.sequence}${stayText}${tripText}`, isAlert: false },
    { label: t('shot'), value: `${snapshot.shot} ${formatValue(snapshot.shotElapsed)}/${formatValue(snapshot.shotTotal)}s`, isAlert: false },
    { label: t('look'), value: `${snapshot.look} ${targetText} ${snapshot.targetDistance === null ? '' : `${formatValue(snapshot.targetDistance)}m`} ${visibleText}`.trim(), isAlert: snapshot.isTargetVisible === false },
    { label: t('depth'), value: `${snapshot.viewDepth.toFixed(1)}${snapshot.isNearWall ? ` · ${t('nearWall')}` : ''}`, isAlert: snapshot.isNearWall },
    { label: t('motion'), value: `${snapshot.speed.toFixed(2)}/s · ${snapshot.destination ?? '-'}`, isAlert: false },
  ]
})

/** 每秒留一行歷史；換鏡位（或換段落）的那一刻另外記一筆，順手印到 console，之後翻紀錄看得到 */
watch(() => props.snapshot, (snapshot) => {
  if (!snapshot)
    return

  const line = formatDriftDebugLine(snapshot)
  const second = Math.floor(snapshot.clock)
  if (second !== lastHistorySecond) {
    lastHistorySecond = second
    historyLineList.push(line)
    if (historyLineList.length > HISTORY_LINE_MAX)
      historyLineList.shift()
  }

  const shotKey = `${snapshot.sessionId}|${snapshot.phase}|${snapshot.sequence}|${snapshot.shot}|${snapshot.look}`
  if (shotKey !== lastShotKey) {
    lastShotKey = shotKey
    shotLineList.push(line)
    if (shotLineList.length > SHOT_LOG_MAX)
      shotLineList.shift()
    /** 開發工具的紀錄：console 看得到，也寫進 F6 匯出的執行時狀態（輪流用十個名目，留最近十次） */
    // eslint-disable-next-line no-console
    console.info(`[DriftDebug] ${line}`)
    reportDiagnostic(`神遊換鏡位 ${shotLogIndex % SHOT_LOG_MAX}`, line)
    shotLogIndex++
  }
})

/** 複製：第一行是現在，接著是最近每秒一行的歷史（舊到新），最後是最近幾次換鏡位那一刻 */
function copySnapshot() {
  const snapshot = props.snapshot
  const lineList = [
    snapshot ? formatDriftDebugLine(snapshot) : 'drift/idle',
    '# history (1/s, old to new)',
    ...historyLineList,
    '# shot changes (old to new)',
    ...shotLineList,
  ]
  void copy(lineList.join('\n'))
}

function setVisible(isVisible: boolean) {
  visible.value = isVisible
  if (!isVisible) {
    historyLineList.length = 0
    shotLineList.length = 0
    lastHistorySecond = -1
    lastShotKey = ''
  }
  emit('toggle', isVisible)
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.repeat)
    return

  /** F10 在瀏覽器是選單列的快速鍵，攔下來 */
  if (event.code === 'F10') {
    event.preventDefault()
    setVisible(!visible.value)
  }
  else if (event.code === 'F2' && visible.value) {
    event.preventDefault()
    copySnapshot()
  }
})
</script>

<style scoped lang="sass">
/**
 * 與效果開關面板（右下）錯開，放左下；要點得到（複製鈕），所以 pointer-events 開著。
 * 不掛 hud-fadable：神遊中其他介面會淡出，這一份開著就一直在
 */
.drift-debug
  position: absolute
  left: 12px
  bottom: 12px
  z-index: 30
  display: flex
  flex-direction: column
  gap: 2px
  padding: 8px 10px
  max-width: min(560px, calc(100vw - 24px))
  background: rgba(0, 0, 0, 0.6)
  border: 1px solid rgba(255, 255, 255, 0.18)
  color: rgba(255, 255, 255, 0.92)
  font-family: ui-monospace, monospace
  font-size: 12px
  line-height: 1.45
  pointer-events: auto

.drift-debug-title
  display: flex
  align-items: center
  justify-content: space-between
  gap: 12px
  margin-bottom: 4px
  font-weight: 600

.drift-debug-row
  display: flex
  gap: 8px
  word-break: break-all

.drift-debug-label
  flex: 0 0 3.5em
  color: rgba(255, 255, 255, 0.55)

.drift-debug-alert
  color: #ffb86b

.drift-debug-hint
  margin-top: 4px
  color: rgba(255, 255, 255, 0.5)
</style>
