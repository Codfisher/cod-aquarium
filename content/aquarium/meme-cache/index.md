---
title: 快取梗圖
description: 常常找不到記憶中的梗圖嗎？我來幫你找找 ԅ(´∀` ԅ) 可用描述或圖中文字搜尋近千張迷因梗圖。
image: https://codlin.me/meme-cache.webp
layout: false
---

<script setup>
import { onMounted, onUnmounted } from 'vue'
import MemeCache from './meme-cache.vue'
import SeoContent from './seo-content.vue'

/**
 * app 不再包在 whyframe 的 iframe 內，改直接渲染於本頁。
 *
 * 原本以為 iframe 是在隔離樣式，實測後發現隔離機制其實是這個 class：
 * postcss.config.mjs 的 postcssIsolateStyles 會把 VitePress 基礎重設的選擇器
 * 全部改寫成 `button:not(:where(.vp-raw, .vp-raw *))` 這種形式。那些規則沒有 layer，
 * 優先權高於 Tailwind 的 @layer utilities，不掛 vp-raw 的話 Nuxt UI 的按鈕與
 * 輸入框會被打回裸元素。原本是 _frame.md 在掛，現在由本頁自己掛。
 *
 * 掛在 documentElement 而非包裝元素，因為 Nuxt UI 的 toast、modal 會 teleport 到 body。
 * app 根節點是 client-only，內容等掛載後才畫，故不會閃過未套用的那一幀。
 */
onMounted(() => document.documentElement.classList.add('vp-raw'))
onUnmounted(() => document.documentElement.classList.remove('vp-raw'))
</script>

<meme-cache />

<seo-content />
