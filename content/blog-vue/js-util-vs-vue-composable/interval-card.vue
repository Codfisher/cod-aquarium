<template>
  <div
    class="rounded-lg border bg-[var(--ui-bg)] p-4 transition-colors duration-300"
    :class="show
      ? correct
        ? 'border-emerald-500/30 dark:border-emerald-500/20'
        : 'border-amber-500/30 dark:border-amber-500/20'
      : leaking
        ? 'border-red-500/40 dark:border-red-500/30'
        : 'border-[var(--ui-border)]'
    "
  >
    <!-- 標題列 -->
    <div class="flex items-center justify-between">
      <code class="text-xs">
        <span :class="correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'">
          {{ correct ? '✓' : '✗' }}
        </span>
        {{ label }}
      </code>

      <u-button
        class="rounded px-2 py-0.5 text-[11px] font-mono transition-colors"
        color="neutral"
        :label="show ? '解除元件' : '安裝元件'"
        @click="emit('toggle')"
      />
    </div>

    <!-- 計數器 -->
    <div class="mt-4 flex items-baseline gap-1 font-mono">
      <span
        class="text-4xl font-bold tabular-nums leading-none transition-colors duration-300"
        :class="leaking ? 'text-red-500 dark:text-red-400' : ''"
      >
        {{ count }}
      </span>
    </div>

    <!-- 狀態 -->
    <div class="mt-3 flex items-center gap-2 text-xs font-mono">
      <template v-if="show">
        <span class="relative flex size-1.5">
          <span
            class="absolute size-full animate-ping rounded-full"
            :class="correct ? 'bg-emerald-500' : 'bg-amber-500'"
          />
          <span
            class="relative size-1.5 rounded-full"
            :class="correct ? 'bg-emerald-500' : 'bg-amber-500'"
          />
        </span>
        <span class="text-[var(--ui-text-muted)]">
          <slot />
        </span>
      </template>
      <template v-else-if="leaking">
        <span class="relative flex size-1.5">
          <span class="absolute size-full animate-ping rounded-full bg-red-500" />
          <span class="relative size-1.5 rounded-full bg-red-500" />
        </span>
        <span class="text-red-500 dark:text-red-400">
          interval 未被清除
        </span>
      </template>
      <template v-else-if="stopped">
        <span class="size-1.5 rounded-full bg-emerald-500" />
        <span class="text-emerald-600 dark:text-emerald-400">
          元件已銷毀
        </span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  correct: boolean;
  show: boolean;
  count: number;
  leaking: boolean;
  stopped: boolean;
}>()

const emit = defineEmits<{
  toggle: [];
}>()
</script>
