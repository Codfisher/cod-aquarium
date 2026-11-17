<template>
  <!-- 結構化資料（JSON-LD）由 .vitepress/config.mts 的 transformHead 注入 head，
       元件內以 script 標籤輸出會被 SSR 跳脫成 HTML 實體，導致 Google 無法剖析 -->
  <section
    aria-labelledby="meme-gallery-title"
    class="gallery-wrap"
  >
    <h1
      id="meme-gallery-title"
      class="page-title"
    >
      梗圖搜尋器
    </h1>

    <p class="lead">
      快取梗圖是免費的梗圖（哏圖、迷因圖）搜尋器，收錄 {{ seoMemeTotal }} 張。
      只記得畫面或台詞也找得到：輸入畫面描述、圖中文字、角色或作品名稱即可。
    </p>

    <h2 class="section-title">
      依情緒找梗圖
    </h2>

    <seo-emotion-link-list class="emotion-link-list" />

    <h2 class="section-title">
      最新收錄的梗圖
    </h2>

    <seo-meme-grid :meme-list="seoMemeList" />
  </section>
</template>

<script setup lang="ts">
import { seoMemeList, seoMemeTotal } from 'virtual:seo-meme-list'
import SeoEmotionLinkList from './seo-emotion-link-list.vue'
import SeoMemeGrid from './seo-meme-grid.vue'
</script>

<style scoped lang="sass">
/** 主體 app 為 fixed 全螢幕，不佔文件流高度，此區塊若貼齊頂端會直接蓋住 app。
 * app 掛載後頁面鎖住捲動，此區塊實際只給爬蟲看，間距要大到圖片不會被 lazy load 提前下載：
 * Chrome 在慢速網路會預載距視窗 2500px 內的 lazy 圖片，原本的 200vh 在手機上只有約 1650px，
 * 9 張原尺寸大圖（約 1.5 MB）因此在首屏就與清單資料搶頻寬
 */
.gallery-wrap
  max-width: 1100px
  margin: 0 auto
  padding: 1rem 1rem 2rem
  padding-top: calc(100vh + 3000px)

.page-title
  font-size: clamp(1.5rem, 2.5vw, 2rem)
  margin: 0 0 1rem

.lead
  color: var(--vp-c-text-2)
  line-height: 1.7
  margin: 0 0 1.5rem

.section-title
  font-size: 1.25rem
  margin: 0 0 1rem

.emotion-link-list
  margin-bottom: 2rem
</style>
