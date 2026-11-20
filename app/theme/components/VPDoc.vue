<script setup lang="ts">
import { useRoute } from '#vp'
import { computed, defineAsyncComponent, hydrateOnVisible } from 'vue'
import { useData } from '../composables/data'
import { useSidebar } from '../composables/sidebar'
import Content from './Content'
import { defineIdleHydrated } from '../support/lazy-hydrate'

/** 首屏不需立即互動的區塊閒置時才 hydration，拆開原本一整段的 hydration 長任務（見 support/lazy-hydrate.ts） */
const VPDocAside = defineIdleHydrated(() => import('./VPDocAside.vue'))
const DocPlateBand = defineIdleHydrated(() => import('../custom/doc-plate-band.vue'))
const DocPlateCaption = defineIdleHydrated(() => import('../custom/doc-plate-caption.vue'))

/** 文末的更新時間與上一篇／下一篇，捲到附近才 hydration */
const VPDocFooter = defineAsyncComponent({
  loader: () => import('./VPDocFooter.vue'),
  hydrate: hydrateOnVisible({ rootMargin: '300px' }),
})

const { theme, frontmatter, page } = useData()

/** 主題與專欄文章：上方圖版帶、左側圖說，取代側欄 */
const plateSeries = computed(() => page.value.plateSeries)
const tagList = computed<string[]>(() => Array.isArray(frontmatter.value.tags) ? frontmatter.value.tags : [])

const route = useRoute()
const { hasSidebar, hasAside, leftAside } = useSidebar()

const pageName = computed(() =>
  route.path.replace(/[./]+/g, '_').replace(/_html$/, '')
)

/** 交給 Pagefind 建立索引的內容區；草稿不進站內搜尋 */
const isSearchIndexed = computed(() => !frontmatter.value.draft)
</script>

<template>
  <div
    class="VPDoc"
    :class="{ 'has-sidebar': hasSidebar, 'has-aside': hasAside, 'is-plate': plateSeries }"
  >
    <slot name="doc-top" />
    <doc-plate-band
      v-if="plateSeries"
      class="plate-band"
      :plate-series="plateSeries"
    />
    <div class="container">
      <div
        v-if="plateSeries"
        class="plate-caption"
      >
        <doc-plate-caption
          :plate-series="plateSeries"
          :tag-list="tagList"
        />
      </div>

      <div v-if="hasAside" class="aside" :class="{'left-aside': leftAside}">
        <div class="aside-curtain" />
        <div class="aside-container">
          <div class="aside-content">
            <VPDocAside>
              <template #aside-top><slot name="aside-top" /></template>
              <template #aside-bottom><slot name="aside-bottom" /></template>
              <template #aside-outline-before><slot name="aside-outline-before" /></template>
              <template #aside-outline-after><slot name="aside-outline-after" /></template>
              <template #aside-ads-before><slot name="aside-ads-before" /></template>
              <template #aside-ads-after><slot name="aside-ads-after" /></template>
            </VPDocAside>
          </div>
        </div>
      </div>

      <div class="content">
        <div class="content-container">
          <slot name="doc-before" />
          <main class="main">
            <Content
              class="vp-doc"
              :class="[
                pageName,
                theme.externalLinkIcon && 'external-link-icon-enabled'
              ]"
              :data-pagefind-body="isSearchIndexed ? '' : undefined"
            />
          </main>
          <VPDocFooter>
            <template #doc-footer-before><slot name="doc-footer-before" /></template>
          </VPDocFooter>
          <slot name="doc-after" />
        </div>
      </div>
    </div>
    <slot name="doc-bottom" />
  </div>
</template>

<style scoped>
.VPDoc {
  padding: 32px 24px 96px;
  width: 100%;
}

@media (min-width: 768px) {
  .VPDoc {
    padding: 48px 32px 128px;
  }
}

@media (min-width: 960px) {
  .VPDoc {
    padding: 48px 32px 0;
  }

  .VPDoc:not(.has-sidebar) .container {
    display: flex;
    justify-content: center;
    max-width: 992px;
  }

  .VPDoc:not(.has-sidebar) .content {
    max-width: 752px;
  }
}

@media (min-width: 1280px) {
  .VPDoc .container {
    display: flex;
    justify-content: center;
  }

  .VPDoc .aside {
    display: block;
  }
}

@media (min-width: 1440px) {
  .VPDoc:not(.has-sidebar) .content {
    max-width: 784px;
  }

  .VPDoc:not(.has-sidebar) .container {
    max-width: 1104px;
  }
}

.container {
  margin: 0 auto;
  width: 100%;
}

.aside {
  position: relative;
  display: none;
  order: 2;
  flex-grow: 1;
  padding-left: 32px;
  width: 100%;
  max-width: 256px;
}

.left-aside {
  order: 1;
  padding-left: unset;
  padding-right: 32px;
}

.aside-container {
  position: fixed;
  top: 0;
  padding-top: calc(var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + var(--vp-doc-top-height, 0px) + 48px);
  width: 224px;
  height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
}

.aside-container::-webkit-scrollbar {
  display: none;
}

.aside-curtain {
  position: fixed;
  bottom: 0;
  z-index: 10;
  width: 224px;
  height: 32px;
  background: linear-gradient(transparent, var(--vp-c-bg) 70%);
}

.aside-content {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - (var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + 48px));
  padding-bottom: 32px;
}

.content {
  position: relative;
  margin: 0 auto;
  width: 100%;
}

@media (min-width: 960px) {
  .content {
    padding: 0 32px 128px;
  }
}

@media (min-width: 1280px) {
  .content {
    order: 1;
    margin: 0;
    min-width: 640px;
  }
}

.content-container {
  margin: 0 auto;
}

.VPDoc.has-aside .content-container {
  max-width: 688px;
}

/* 圖版對開：上方圖版帶，下方圖說、閱讀欄、本篇章節三欄 */
.VPDoc.is-plate .plate-band,
.VPDoc.is-plate .plate-caption {
  max-width: 688px;
  margin-inline: auto;
}

.VPDoc.is-plate .container {
  display: block;
  max-width: none;
}

@media (min-width: 960px) {
  .VPDoc.is-plate .plate-band,
  .VPDoc.is-plate .plate-caption {
    max-width: 752px;
    padding-inline: 32px;
  }
}

/* 960–1279：沒有側欄後空間夠放章節清單，圖說改在閱讀欄上方，右側維持本篇章節 */
@media (min-width: 960px) and (max-width: 1279px) {
  .VPDoc.is-plate .plate-band {
    max-width: 944px;
  }

  .VPDoc.is-plate .container {
    display: grid;
    grid-template-columns: minmax(0, 688px) 200px;
    column-gap: 32px;
    justify-content: center;
    max-width: 944px;
    padding-inline: 0;
  }

  .VPDoc.is-plate .plate-caption {
    grid-column: 1;
    grid-row: 1;
    max-width: none;
    margin: 0;
    padding: 0;
  }

  .VPDoc.is-plate .content {
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
    padding: 0 0 128px;
  }

  .VPDoc.is-plate .aside {
    display: block;
    grid-column: 2;
    grid-row: 1 / span 2;
    max-width: none;
    padding-left: 0;
  }
}

@media (min-width: 960px) {
  /* 圖版帶在上方，章節不能用原本貼齊視窗頂端的 fixed，改為跟著欄位黏住 */
  .VPDoc.is-plate .aside-container {
    position: sticky;
    top: calc(var(--vp-nav-height) + 32px);
    width: auto;
    height: auto;
    max-height: calc(100vh - var(--vp-nav-height) - 64px);
    padding-top: 0;
  }

  .VPDoc.is-plate .aside-curtain {
    display: none;
  }

  .VPDoc.is-plate .aside-content {
    min-height: 0;
  }
}

@media (min-width: 1280px) {
  .VPDoc.is-plate .plate-band {
    max-width: 1184px;
    padding-inline: 0;
  }

  .VPDoc.is-plate .container {
    display: grid;
    grid-template-columns: 176px minmax(0, 688px) 224px;
    column-gap: 48px;
    justify-content: center;
    max-width: 1184px;
  }

  .VPDoc.is-plate .plate-caption {
    grid-column: 1;
    grid-row: 1;
    max-width: none;
    margin: 0;
    padding: 0;
  }

  .VPDoc.is-plate .content {
    grid-column: 2;
    grid-row: 1;
    min-width: 0;
    padding: 0 0 128px;
  }

  .VPDoc.is-plate .aside {
    grid-column: 3;
    grid-row: 1;
    max-width: none;
    padding-left: 0;
  }
}
</style>
