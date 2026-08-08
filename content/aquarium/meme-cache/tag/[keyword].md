---
layout: page
---

<script setup>
import { useData } from 'vitepress'
import TagPage from './tag-page.vue'

const { params } = useData()
</script>

<tag-page
  :keyword="params.keyword"
  :meme-list-json="params.memeListJson"
/>
