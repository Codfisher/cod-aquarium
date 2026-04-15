<template>
  <div class="timeline">
    <h3>Fetch 時間軸</h3>

    <div
      v-if="logEntryList.length === 0"
      class="empty"
    >
      載入中...
    </div>

    <div
      v-for="entry in logEntryList"
      :key="entry.label"
      class="entry"
    >
      <span class="label">{{ entry.label }}</span>
      <div class="bar-track">
        <div
          class="bar"
          :style="{
            left: `${(entry.startTime / maxTime) * 100}%`,
            width: `${((entry.endTime - entry.startTime) / maxTime) * 100}%`,
          }"
        >
          {{ entry.endTime - entry.startTime }}ms
        </div>
      </div>
      <span class="time">{{ entry.endTime }}ms</span>
    </div>

    <div
      v-if="logEntryList.length > 0"
      class="total"
    >
      總耗時：{{ totalTime }}ms
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFetchLog } from '../fetch-log';

const { logEntryList } = useFetchLog();

const maxTime = computed(() => {
  if (logEntryList.value.length === 0) return 1;
  return Math.max(...logEntryList.value.map((e) => e.endTime));
});

const totalTime = computed(() => {
  if (logEntryList.value.length === 0) return 0;
  return Math.max(...logEntryList.value.map((e) => e.endTime));
});
</script>

<style scoped>
.timeline {
  margin-top: 24px;
  padding: 16px;
  background: #f8f8f8;
  border-radius: 8px;
  border: 1px solid #e5e5e5;
}

h3 {
  font-size: 14px;
  color: #666;
  margin-bottom: 12px;
}

.empty {
  color: #999;
  font-size: 14px;
}

.entry {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.label {
  width: 80px;
  font-size: 13px;
  font-weight: 600;
  text-align: right;
  flex-shrink: 0;
}

.bar-track {
  flex: 1;
  height: 28px;
  background: #eee;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}

.bar {
  position: absolute;
  top: 2px;
  bottom: 2px;
  background: #42b883;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: white;
  font-weight: 600;
  min-width: 48px;
}

.time {
  width: 60px;
  font-size: 12px;
  color: #999;
  flex-shrink: 0;
}

.total {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e5e5;
  font-weight: 700;
  font-size: 15px;
  text-align: right;
}
</style>
