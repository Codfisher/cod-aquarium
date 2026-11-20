<template>
  <!-- vp-raw：避開 base.css 的無層級重設；這區的清單與連結樣式都由下方 scoped 樣式負責 -->
  <section
    class="home-latest-plates vp-raw"
    aria-labelledby="home-latest-title"
  >
    <div class="header">
      <div
        id="home-latest-title"
        role="heading"
        aria-level="2"
        class="title"
      >
        最新文章
      </div>
      <a
        class="more-link"
        href="/article-overview"
      >看全部文章 →</a>
    </div>

    <ol class="plate-grid">
      <li
        v-for="article in latestArticleList"
        :key="article.link"
        class="plate"
      >
        <a
          :href="article.link"
          class="plate-link"
        >
          <span class="plate-frame">
            <!-- 顯示約 170px，取 300 寬：高解析手機上略軟但省下約 30% 傳輸量（使用者決定） -->
            <theme-image
              :src="article.image"
              alt=""
              width="300"
              height="300"
              class="plate-image"
            />
          </span>
          <span class="plate-meta">
            <span class="section-name">{{ article.sectionName }}</span>
            <time :datetime="article.date">{{ article.date }}</time>
          </span>
          <span class="plate-title">{{ article.title }}</span>
        </a>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import latestArticleList from '#site/latest-article-list'
import ThemeImage from './theme-image.vue'
</script>

<style scoped>
.home-latest-plates {
  margin: 48px 0 16px;
}

.header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--plate-line);
}

.title {
  font-size: 24px;
  font-weight: 800;
  color: var(--vp-c-text-1);
}

.more-link {
  font-size: 14px;
  font-weight: 700;
  color: var(--vp-c-brand-1);
  text-decoration: none !important;
}

.more-link:hover {
  text-decoration: underline !important;
}

/* 圖版格：手機兩欄、平板以上四欄，每張同比例、沿各列基線對齊 */
.plate-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28px 20px;
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 768px) {
  .plate-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.plate {
  margin: 0;
}

.plate-link {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--vp-c-text-1);
  text-decoration: none !important;
  border-radius: 16px;
}

.plate-link:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 6px;
}

.plate-frame {
  display: block;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--plate-line);
  /* 與全站圖片一致的 1rem 圓角 */
  border-radius: 16px;
  transition: border-color 0.25s;
}

.plate-frame :deep(picture),
.plate-frame :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
}

.plate-frame :deep(img) {
  /* 與文章頁圖版帶相同：完整呈現封面不裁切；框線與圓角由 .plate-frame 負責，拿掉全站 img 預設的邊框與圓角 */
  object-fit: cover;
  border: none;
  border-radius: 0;
}

.plate-link:hover .plate-frame,
.plate-link:focus-visible .plate-frame {
  border-color: var(--plate-ink);
}

.plate-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}

.section-name {
  font-weight: 700;
  color: var(--plate-ink);
}

.plate-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
  text-wrap: pretty;
}

.plate-link:hover .plate-title {
  color: var(--vp-c-brand-1);
}

@media (prefers-reduced-motion: reduce) {
  .plate-frame {
    transition: none;
  }
}
</style>
