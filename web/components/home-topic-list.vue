<template>
  <!-- vp-raw：清單、連結樣式由 scoped 樣式負責 -->
  <ul class="home-topic-list vp-raw">
    <li
      v-for="topic in topicList"
      :key="topic.text"
    >
      <a
        :href="topic.link"
        class="topic-link"
      >
        <u-icon
          v-if="topic.icon"
          :name="topic.icon"
          class="watermark"
          :class="{ 'is-mirrored': topic.isIconMirrored }"
          aria-hidden="true"
        />
        <span class="topic-name">{{ topic.text }} →</span>
        <span class="topic-description">{{ topic.description }}</span>
      </a>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { DefaultTheme } from '../../app/theme/types/default-theme'
import { useData } from '#vp'
import { computed } from 'vue'

/** 各主題的介紹，原本寫在 index.md 的引言區塊 */
const TOPIC_DESCRIPTION_MAP: Record<string, string> = {
  蔚藍世界: '鱈魚眼中的 Real World，記錄各種實務上用到的技術或實現有趣需求的經驗',
  程式浮潛: '軟體開發雜談。和軟體有關，沒有特別分類文章',
  Vue: '與 Vue 一同打滾的點點滴滴',
}

/** 卡片浮水印用的 icon */
const TOPIC_ICON_MAP: Record<string, string> = {
  蔚藍世界: 'i-ph:waves',
  程式浮潛: 'i-ph:fish',
  Vue: 'i-mingcute:vue-line',
}
/** 浮水印要左右翻轉的主題：魚頭原本朝左，壓在右下角時像游出卡片，翻成朝右上游進來 */
const MIRRORED_ICON_TOPIC_SET = new Set(['程式浮潛'])

const { theme } = useData<DefaultTheme.Config>()

/** 主題入口連結與側欄設定共用（指向各主題最新一篇），不另外維護 */
const topicList = computed(() => {
  const sidebar = theme.value.sidebar
  const rootGroupList = sidebar && !Array.isArray(sidebar) ? sidebar['/'] : undefined
  const groupList = Array.isArray(rootGroupList) ? rootGroupList : []
  const topicGroup = groupList.find((group) => group.text === '主題')

  return (topicGroup?.items ?? [])
    .filter((item): item is DefaultTheme.SidebarItem & { text: string; link: string } => !!item.text && !!item.link)
    .map((item) => ({
      text: item.text,
      link: item.link,
      description: TOPIC_DESCRIPTION_MAP[item.text] ?? '',
      icon: TOPIC_ICON_MAP[item.text],
      isIconMirrored: MIRRORED_ICON_TOPIC_SET.has(item.text),
    }))
})
</script>

<style scoped>
.home-topic-list {
  display: grid;
  gap: 12px;
  margin: 16px 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 768px) {
  .home-topic-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.home-topic-list li {
  margin: 0;
}

.topic-link {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 16px;
  color: var(--vp-c-text-1);
  text-decoration: none !important;
  border: 1px solid var(--plate-line);
  border-radius: 1rem;
  transition: border-color 0.25s;
}

.topic-link:hover,
.topic-link:focus-visible {
  border-color: var(--plate-ink);
}

.topic-link:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.topic-name {
  font-size: 18px;
  font-weight: 800;
  color: var(--plate-ink);
}

.topic-description {
  font-size: 14px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}

/* 浮水印：icon 放大、淡化後壓在右下角，只是裝飾（與 work-link.vue 同一套） */
.watermark {
  position: absolute;
  right: -18px;
  bottom: -22px;
  z-index: -1;
  width: 96px;
  height: 96px;
  color: var(--plate-ink);
  opacity: 0.08;
  transform: scaleX(var(--watermark-flip, 1)) rotate(-12deg);
  transition: opacity 0.35s, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}

.watermark.is-mirrored {
  --watermark-flip: -1;
}

.topic-link:hover .watermark,
.topic-link:focus-visible .watermark {
  opacity: 0.14;
  transform: scaleX(var(--watermark-flip, 1)) rotate(-4deg) scale(1.08);
}

@media (prefers-reduced-motion: reduce) {
  .topic-link,
  .watermark {
    transition: none;
  }
}
</style>
