<!--
  不寫 frontmatter：動態路由的內容開頭會被插入參數前綴，vitepress-plugin-llms 又會在前綴與 frontmatter 之間塞入提示，
  frontmatter 因此解析失敗、整段 YAML 被當成內文印出。版面設定改由 .vitepress/config.mts 的 transformPageData 寫入
-->

<script setup>
import EmotionPage from '../emotion-page.vue'
</script>

<emotion-page />
