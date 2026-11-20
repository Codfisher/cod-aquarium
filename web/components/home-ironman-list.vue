<template>
  <!-- vp-raw：清單、連結樣式由 scoped 樣式負責 -->
  <ul class="home-ironman-list vp-raw">
    <li
      v-for="series in SERIES_LIST"
      :key="series.link"
    >
      <a
        :href="series.link"
        class="series-link"
        target="_blank"
        rel="noopener"
      >
        <u-icon
          :name="series.icon"
          class="watermark"
          aria-hidden="true"
        />
        <span class="series-icon">
          <u-icon
            :name="series.icon"
            aria-hidden="true"
          />
        </span>
        <span class="series-body">
          <span class="series-meta">
            <span
              v-if="series.edition"
              class="series-edition"
            >iThome 鐵人賽 {{ series.edition }}</span>
            <span
              v-if="series.award"
              class="series-award"
            >
              <u-icon
                name="i-material-symbols:trophy-rounded"
                aria-hidden="true"
              />
              {{ series.award }}
            </span>
          </span>
          <span class="series-title">{{ series.title }}</span>
          <span class="series-summary">{{ series.summary }}</span>
          <span class="series-action">看系列文章 →</span>
        </span>
      </a>
    </li>
  </ul>
</template>

<script setup lang="ts">
interface IronmanSeries {
  title: string;
  /** 只寫查證過的屆數，未確認就留空 */
  edition?: string;
  /** 得獎紀錄，同樣只寫確認過的 */
  award?: string;
  icon: string;
  summary: string;
  link: string;
}

/** 一個系列一列：三欄並排時卡片太窄，簡介只放得下一句。
 * 簡介只寫查證過的內容（書籍介紹、首頁作品說明、系列文章），不補沒把握的細節
 */
const SERIES_LIST: IronmanSeries[] = [
  {
    title: '你渴望連結嗎？將 Web 與硬體連上線吧！',
    edition: '第 13 屆（2021）',
    award: '佳作',
    icon: 'i-material-symbols:cable-rounded',
    summary: '網頁也能直接控制硬體！透過瀏覽器的 Web Serial API 和 Arduino 串列通訊，以遊戲為情境，從 Vue、Quasar、Firmata 到各種電路，一步步把電子訊號變成網頁上的互動。系列文章後來改編成《Arduino自造趣》出版。',
    link: 'https://ithelp.ithome.com.tw/users/20140213/ironman/4765',
  },
  {
    title: '派對動物嗨起來！',
    edition: '第 14 屆（2022）',
    icon: 'i-material-symbols:sports-esports-rounded',
    summary: '瀏覽器能存取加速度計、麥克風、攝影機等硬體訊號，又能用 WebGL、WebGPU 跑 3D，網頁早就夠格當遊戲機了。這個系列用 Vue 與 babylon.js 打造 3D 派對遊戲，手機像 joy-con 一樣當搖桿，即時遙控遊戲角色。',
    link: 'https://ithelp.ithome.com.tw/users/20140213/ironman/5661',
  },
  {
    title: '要不要 Vue 點酷酷的元件？',
    edition: '第 16 屆（2024）',
    icon: 'i-material-symbols:widgets-rounded',
    summary: '30 天實驗各種 Web 技術，開發新奇古怪的 Vue 元件。例如用 Matter.js 讓畫面元素有重力、會碰撞的物理包裝器，還有跟著游標跑來跑去的游標小跟班。',
    link: 'https://ithelp.ithome.com.tw/users/20140213/ironman/7201',
  },
]
</script>

<style scoped>
.home-ironman-list {
  display: grid;
  gap: 16px;
  margin: 16px 0;
  padding: 0;
  list-style: none;
}

.home-ironman-list li {
  margin: 0;
}

.series-link {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  display: flex;
  gap: 20px;
  height: 100%;
  padding: 24px;
  color: var(--vp-c-text-1);
  text-decoration: none !important;
  border: 1px solid var(--plate-line);
  border-radius: 1rem;
  transition: border-color 0.25s;
}

.series-link:hover,
.series-link:focus-visible {
  border-color: var(--plate-ink);
}

.series-link:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.series-icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  font-size: 26px;
  color: var(--plate-ink);
  background: color-mix(in oklch, var(--vp-c-brand-1) 12%, transparent);
  border-radius: 14px;
}

.series-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.series-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.series-award {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--plate-ink);
  background: color-mix(in oklch, var(--vp-c-brand-1) 12%, transparent);
  border-radius: 999px;
}

.series-edition {
  font-size: 13px;
  font-weight: 700;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}

.series-title {
  font-size: 17px;
  font-weight: 800;
  line-height: 1.5;
  color: var(--plate-ink);
  text-wrap: pretty;
}

.series-summary {
  font-size: 14px;
  line-height: 1.8;
  color: var(--vp-c-text-2);
}

.series-action {
  margin-top: 4px;
  font-size: 14px;
  font-weight: 700;
  color: var(--vp-c-brand-1);
}

/* 手機寬度不夠放左側 icon，改成疊在標題上方 */
@media (max-width: 639px) {
  .series-link {
    flex-direction: column;
    gap: 14px;
    padding: 20px;
  }
}

/* 浮水印：icon 放大、淡化後壓在右下角，只是裝飾（與 work-link.vue 同一套） */
.watermark {
  position: absolute;
  right: -18px;
  bottom: -22px;
  z-index: -1;
  width: 128px;
  height: 128px;
  color: var(--plate-ink);
  opacity: 0.08;
  transform: rotate(-12deg);
  transition: opacity 0.35s, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}

.series-link:hover .watermark,
.series-link:focus-visible .watermark {
  opacity: 0.14;
  transform: rotate(-4deg) scale(1.08);
}

@media (prefers-reduced-motion: reduce) {
  .series-link,
  .watermark {
    transition: none;
  }
}
</style>
