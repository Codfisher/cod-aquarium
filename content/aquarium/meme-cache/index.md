---
title: 快取梗圖
description: 常常找不到記憶中的梗圖嗎？我來幫你找找 ԅ(´∀` ԅ) 可用描述或圖中文字搜尋近千張迷因梗圖。
image: https://codlin.me/meme-cache.webp
layout: false
---

<script setup>
import AdBanner from './ad-banner.vue'
import MemeCache from './meme-cache.vue'
import SeoContent from './seo-content.vue'
</script>

<div class="meme-cache-page fixed inset-0 flex flex-col">
  <ad-banner />
  <iframe data-why class="flex-1 w-full min-h-0">
    <meme-cache />
  </iframe>
</div>

<seo-content />

<style>
/** app 是全螢幕工具，宿主頁面不該捲動。
 * 廣告列屬於宿主頁面，滑鼠捲在上面會把整頁帶去下方的 seo-content，
 * 那段內容只給爬蟲讀，不需要人捲得到。
 * 用 :has 綁住本頁的容器，避免這條規則被打包進全站樣式後影響其他頁
 */
html:has(.meme-cache-page),
html:has(.meme-cache-page) body {
  overflow: hidden;
  overscroll-behavior: none;
}
</style>
