<!--
  情緒分類頁共用這份 md，site/pages.ts 依迷因資料展開成 /aquarium/meme-cache/emotion/<slug> 各頁，
  版面設定（frontmatter）、標題、描述與結構化資料由 site/pages.ts、site/head.ts 補上，這裡不寫 frontmatter。
  迷因清單只在 SSR 讀取並寫進 payload，見 emotion-page.vue
-->

<script setup>
import EmotionPage from '../emotion-page.vue'
</script>

<emotion-page />
