<template>
  <transition
    name="boot-fade"
    @after-leave="emit('complete')"
  >
    <div
      v-if="!isDone"
      class="boot-sequence fixed inset-0 z-[9999] bg-white flex flex-col justify-center items-center font-orbitron overflow-hidden"
    >
      <!-- 掃描線效果 -->
      <div class="scanline" />

      <!-- 系統診斷文字（固定高度，從底部堆疊避免位移） -->
      <div class="w-full max-w-[600px] px-8 boot-lines-container flex flex-col justify-end">
        <div
          v-for="line, index in visibleLineList"
          :key="index"
          class="boot-line flex items-center gap-3 mb-1"
          :class="{ 'opacity-30': index < visibleLineList.length - 1 }"
        >
          <span
            class="text-xs tracking-widest shrink-0"
            :class="line.statusClass"
          >
            [{{ line.statusText }}]
          </span>
          <span class="text-xs tracking-wider opacity-60 truncate text-gray-400">
            {{ line.decodedText }}
          </span>
        </div>
      </div>

      <!-- 進度條 -->
      <div class="w-full max-w-[600px] px-8 mt-6">
        <div class="h-px bg-gray-200 relative overflow-hidden">
          <div
            class="h-full bg-gray-400 transition-all duration-300 ease-out"
            :style="{ width: `${progress}%` }"
          />
        </div>
        <div class="flex justify-between mt-2 text-[10px] tracking-widest text-gray-300">
          <span>SYSTEM BOOT</span>
          <span>{{ Math.round(progress) }}%</span>
        </div>
      </div>

    </div>
  </transition>
</template>

<script setup lang="ts">
import { promiseTimeout } from '@vueuse/core'
import { onMounted, ref, shallowRef } from 'vue'

interface Emits {
  complete: [];
}
const emit = defineEmits<Emits>()

interface BootLine {
  text: string;
  statusText: string;
  statusClass: string;
  decodedText: string;
}

const bootMessageList = [
  'CORE SYSTEM INITIALIZED',
  'NEURAL LINK ESTABLISHED',
  'HUD MODULE LOADED',
  'CURSOR SUBSYSTEM ONLINE',
  'GRID PULSE GENERATOR ACTIVE',
  'WINDOW MANAGER READY',
  'CYBER SCALES DESKTOP v2.0 — READY',
]

const visibleLineList = shallowRef<BootLine[]>([])
const progress = ref(0)
const isDone = ref(false)
const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&'

function decodeText(text: string, onUpdate: (decoded: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const charList = text.split('')
    const result = charList.map(() => charset[Math.floor(Math.random() * charset.length)])
    let decodedCount = 0
    const totalSteps = charList.length

    const interval = setInterval(() => {
      if (decodedCount >= totalSteps) {
        onUpdate(text)
        clearInterval(interval)
        resolve()
        return
      }

      // 每步解碼 1-2 個字元
      const decodeAmount = Math.random() > 0.5 ? 2 : 1
      for (let i = 0; i < decodeAmount && decodedCount < totalSteps; i++) {
        result[decodedCount] = charList[decodedCount]
        decodedCount++
      }

      // 未解碼的部分持續隨機變化
      for (let i = decodedCount; i < totalSteps; i++) {
        if (charList[i] === ' ') {
          result[i] = ' '
        }
        else {
          result[i] = charset[Math.floor(Math.random() * charset.length)]
        }
      }

      onUpdate(result.join(''))
    }, 25)
  })
}

async function runBootSequence() {
  const progressPerLine = 100 / bootMessageList.length

  for (let i = 0; i < bootMessageList.length; i++) {
    const message = bootMessageList[i] ?? ''
    const isLast = i === bootMessageList.length - 1

    const line: BootLine = {
      text: message,
      statusText: '....',
      statusClass: 'text-gray-300',
      decodedText: '',
    }

    visibleLineList.value = [...visibleLineList.value, line]

    await decodeText(message, (decoded) => {
      line.decodedText = decoded
      visibleLineList.value = [...visibleLineList.value]
    })

    line.statusText = isLast ? 'DONE' : 'OK'
    line.statusClass = isLast ? 'text-gray-500' : 'text-gray-400'
    visibleLineList.value = [...visibleLineList.value]

    progress.value = Math.min((i + 1) * progressPerLine, 100)

    await promiseTimeout(isLast ? 400 : 120)
  }

  progress.value = 100

  await promiseTimeout(600)

  isDone.value = true
}

onMounted(async () => {
  await promiseTimeout(300)
  await runBootSequence()
})
</script>

<style scoped lang="sass">
.boot-fade-leave-active
  transition: opacity 0.8s ease-out

.boot-fade-leave-to
  opacity: 0

.scanline
  position: absolute
  top: 0
  left: 0
  right: 0
  height: 1px
  background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.02), transparent)
  animation: scanline 3s linear infinite
  pointer-events: none

@keyframes scanline
  0%
    transform: translateY(0)
  100%
    transform: translateY(100vh)

.boot-line
  animation: line-appear 0.1s ease-out

@keyframes line-appear
  from
    opacity: 0
    transform: translateX(-10px)
  to
    opacity: 1
    transform: translateX(0)

.boot-lines-container
  height: 176px
</style>
