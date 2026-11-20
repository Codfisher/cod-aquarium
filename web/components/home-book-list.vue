<template>
  <!-- vp-raw：清單、連結樣式由 scoped 樣式負責 -->
  <ul class="home-book-list vp-raw">
    <li
      v-for="book in BOOK_LIST"
      :key="book.link"
    >
      <a
        :href="book.link"
        class="book-link"
        target="_blank"
        rel="noopener"
      >
        <u-icon
          name="i-ph:book-open-text"
          class="watermark"
          aria-hidden="true"
        />
        <span class="book-cover">
          <!-- 顯示寬 136px（手機 96px），取 280 寬涵蓋 2 倍高解析螢幕 -->
          <theme-image
            :src="book.cover"
            :alt="`《${book.title}》封面`"
            :width="280"
            :height="409"
            loading="lazy"
          />
        </span>
        <span class="book-body">
          <span class="book-title">{{ book.title }}</span>
          <span class="book-meta">{{ book.publisher }}｜{{ book.date }}｜{{ book.pageCount }} 頁</span>
          <span class="book-summary">{{ book.summary }}</span>
          <span class="book-action">到博客來看看 →</span>
        </span>
      </a>
    </li>
  </ul>
</template>

<script setup lang="ts">
import ThemeImage from './theme-image.vue'

interface Book {
  title: string;
  cover: string;
  publisher: string;
  date: string;
  pageCount: number;
  summary: string;
  link: string;
}

/** 首頁內文欄不寬，兩本並排時書名與簡介會被擠成窄長條，一本一列。
 * 封面取自博客來商品頁，轉成 600 寬 webp 放在 content/public/home
 */
const BOOK_LIST: Book[] = [
  {
    title: 'Arduino自造趣：結合 JavaScript x Vue x Phaser 輕鬆打造個人遊戲機',
    cover: '/home/book-arduino-game-console.webp',
    publisher: '博碩',
    date: '2022/12',
    pageCount: 384,
    summary: '改編自第 13 屆 iThome 鐵人賽。用瀏覽器的 Web Serial API 直接和 Arduino 溝通，從 Vue、Quasar、Firmata 到各種電路，一步步做出自己的遊戲機。',
    link: 'https://www.books.com.tw/products/0010942459?sloc=main',
  },
  {
    title: '甚麼？網頁也可以做派對遊戲？使用 Vue 和 babylon.js 打造 3D 派對遊戲吧！',
    cover: '/home/book-3d-party-game.webp',
    publisher: '深智數位',
    date: '2023/11',
    pageCount: 752,
    summary: '手機變身 joy-con，即時遙控遊戲角色。透過三款風格不同的遊戲，從 Vue、babylon.js 到 NestJS，整合成完整的 3D 網頁派對遊戲。',
    link: 'https://www.books.com.tw/products/0010972621?sloc=main',
  },
]
</script>

<style scoped>
.home-book-list {
  display: grid;
  gap: 16px;
  margin: 16px 0;
  padding: 0;
  list-style: none;
}

.home-book-list li {
  margin: 0;
}

.book-link {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  display: flex;
  gap: 20px;
  height: 100%;
  padding: 20px;
  color: var(--vp-c-text-1);
  text-decoration: none !important;
  border: 1px solid var(--plate-line);
  border-radius: 1rem;
  transition: border-color 0.25s;
}

.book-link:hover,
.book-link:focus-visible {
  border-color: var(--plate-ink);
}

.book-link:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.book-cover {
  flex: none;
  width: 96px;
}

@media (min-width: 640px) {
  .book-cover {
    width: 136px;
  }
}

/* 書封是直式實體書，圓角收小一點，像書角 */
.book-cover :deep(img) {
  display: block;
  width: 100%;
  height: auto;
  margin: 0;
  border-radius: 6px;
  box-shadow: 0 6px 16px -8px rgb(0 0 0 / 0.35);
}

.book-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.book-title {
  font-size: 16px;
  font-weight: 800;
  line-height: 1.5;
  color: var(--plate-ink);
  text-wrap: pretty;
}

.book-meta {
  font-size: 13px;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}

.book-summary {
  font-size: 14px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}

.book-action {
  margin-top: auto;
  font-size: 14px;
  font-weight: 700;
  color: var(--vp-c-brand-1);
}

/* 浮水印：icon 放大、淡化後壓在右下角，只是裝飾（與 work-link.vue 同一套） */
.watermark {
  position: absolute;
  right: -18px;
  bottom: -22px;
  z-index: -1;
  width: 140px;
  height: 140px;
  color: var(--plate-ink);
  opacity: 0.08;
  transform: rotate(-12deg);
  transition: opacity 0.35s, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}

.book-link:hover .watermark,
.book-link:focus-visible .watermark {
  opacity: 0.14;
  transform: rotate(-4deg) scale(1.08);
}

@media (prefers-reduced-motion: reduce) {
  .book-link,
  .watermark {
    transition: none;
  }
}
</style>
