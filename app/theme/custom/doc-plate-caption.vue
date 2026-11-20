<script setup lang="ts">
import type { PlateSeries } from '../../../site/plate-series'
import { computed } from 'vue'
import { toPlateNumber } from './plate-number'

interface Props {
  plateSeries: PlateSeries;
  tagList?: string[];
}
const props = defineProps<Props>()

const currentPlate = computed(() => props.plateSeries.plateList[props.plateSeries.currentIndex])
const total = computed(() => props.plateSeries.plateList.length)
</script>

<template>
  <div
    class="doc-plate-caption"
    role="note"
    :aria-label="`${plateSeries.title}第 ${plateSeries.currentIndex + 1} 版，共 ${total} 版`"
  >
    <div
      class="plate-number"
      aria-hidden="true"
    >
      <!-- 換頁時版號淡出、新版號從下方升上來 -->
      <transition
        name="caption"
        mode="out-in"
      >
        <span
          :key="plateSeries.currentIndex"
          class="current"
        >{{ toPlateNumber(plateSeries.currentIndex) }}</span>
      </transition>
      <span class="total">／{{ toPlateNumber(total - 1) }}</span>
    </div>

    <transition
      name="caption"
      mode="out-in"
    >
      <dl
        :key="currentPlate?.link"
        class="caption-list"
      >
        <div class="caption-row">
          <dt>{{ plateSeries.isColumn ? '專欄' : '主題' }}</dt>
          <dd>{{ plateSeries.title }}</dd>
        </div>
        <div
          v-if="currentPlate?.date"
          class="caption-row"
        >
          <dt>發布</dt>
          <dd class="date">
            <time :datetime="currentPlate.date">{{ currentPlate.date }}</time>
          </dd>
        </div>
        <div
          v-if="tagList?.length"
          class="caption-row"
        >
          <dt>標籤</dt>
          <dd>{{ tagList.join('、') }}</dd>
        </div>
      </dl>
    </transition>
  </div>
</template>

<style scoped>
.doc-plate-caption {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-bottom: 24px;
}

.plate-number {
  display: flex;
  align-items: baseline;
  font-family: var(--display-font-family);
  /* 圖版編號是刻版感的標記，不是儀表板大數字：用站上已載入的最細字重 700，尺寸收斂 */
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--plate-ink);
  line-height: 0.85;
}

.current {
  font-size: 40px;
  letter-spacing: -0.03em;
}

.total {
  margin-left: 4px;
  font-size: 16px;
  font-weight: 700;
  color: var(--vp-c-text-2);
}

.caption-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.caption-row {
  display: flex;
  gap: 6px;
}

.caption-row dt {
  letter-spacing: 0.12em;
  color: var(--vp-c-text-2);
}

.caption-row dd {
  margin: 0;
  color: var(--vp-c-text-1);
}

.date {
  font-variant-numeric: tabular-nums;
}

.current {
  display: inline-block;
}

/* 只做進場、不做離場：換頁時內文已經換成新文章，舊版號若還要花 0.15 秒淡出，
   新內文就會配著舊圖說，看起來新舊同時出現。舊的立刻移除，新的直接從下方淡入 */
.caption-enter-active {
  transition: opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1), transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.caption-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

@media (prefers-reduced-motion: reduce) {
  .caption-enter-active {
    transition: none;
  }
}

/* 寬螢幕：圖說獨立成閱讀欄左側一欄，版號放大成圖版的主角 */
@media (min-width: 1280px) {
  .doc-plate-caption {
    position: sticky;
    top: calc(var(--vp-nav-height) + 32px);
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    margin-bottom: 0;
  }

  .current {
    font-size: 72px;
    letter-spacing: -0.02em;
  }

  .total {
    font-size: 20px;
  }

  .caption-list {
    flex-direction: column;
    gap: 0;
    margin-top: 20px;
    border-top: 1px solid var(--plate-line);
  }

  .caption-row {
    flex-direction: column;
    gap: 2px;
    padding: 10px 0;
    border-bottom: 1px solid var(--plate-line);
  }

  .caption-row dd {
    font-size: 14px;
    line-height: 1.6;
  }
}
</style>
