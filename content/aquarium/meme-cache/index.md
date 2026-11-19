---
title: 快取梗圖｜梗圖搜尋器
description: 找不到記憶中的梗圖嗎？我來幫你找找 ԅ(´∀` ԅ) 輸入畫面描述或圖中台詞，從上千張迷因梗圖庫找梗圖。
# 社群縮圖（image、twitterImage、structuredImageList）與情緒分類頁共用，統一由 site/pages.ts 寫入
layout: false
---

<script setup>
import MemeCache from './meme-cache.vue'
import SeoContent from './seo-content.vue'

/** html 上的 vp-raw 由 app/app.vue 依 layout: false 於 SSR 時輸出，原因見該檔 */
</script>

<meme-cache />

<seo-content />
