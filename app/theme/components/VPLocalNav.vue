<script lang="ts" setup>
import { useWindowScroll } from '@vueuse/core'
import { onContentUpdated } from '#vp'
import { computed, onMounted, ref } from 'vue'
import { useData } from '../composables/data'
import { useLocalNav } from '../composables/local-nav'
import { getHeaders } from '../composables/outline'
import { useSidebar } from '../composables/sidebar'
import VPLocalNavOutlineDropdown from './VPLocalNavOutlineDropdown.vue'

defineProps<{
  open: boolean
}>()

defineEmits<{
  (e: 'open-menu'): void
}>()

const { theme, frontmatter, page } = useData()
const { hasSidebar } = useSidebar()
const { headers } = useLocalNav()
const { y } = useWindowScroll()

const navHeight = ref(0)

onMounted(() => {
  navHeight.value = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue(
      '--vp-nav-height'
    )
  )
})

onContentUpdated(() => {
  headers.value = getHeaders(frontmatter.value.outline ?? theme.value.outline)
})

const empty = computed(() => {
  return headers.value.length === 0
})

/** 標題清單要在 client 才算得出來（SSR 時一律是空的）。若依「沒標題也沒側欄」隱藏，
 * 沒有側欄的頁面（圖版文章頁、首頁）SSR 不會輸出這條列，hydration 後才出現，把內文往下推 48px（CLS 0.05）。
 * 只要頁面沒有關閉目錄（frontmatter.outline: false）就一律輸出，佔位從首次繪製就固定
 */
const emptyAndNoSidebar = computed(() => {
  return empty.value && !hasSidebar.value && frontmatter.value.outline === false
})

const classes = computed(() => {
  return {
    VPLocalNav: true,
    'has-sidebar': hasSidebar.value,
    /** 圖版頁在 960 以上已有右側章節清單（見 VPDoc），不必再顯示這條 */
    'is-plate': !!page.value.plateSeries,
    empty: empty.value,
    fixed: emptyAndNoSidebar.value
  }
})
</script>

<template>
  <div
    v-if="frontmatter.layout !== 'home' && (!emptyAndNoSidebar || y >= navHeight)"
    :class="classes"
  >
    <div class="container">
      <button
        v-if="hasSidebar"
        class="menu"
        :aria-expanded="open"
        aria-controls="VPSidebarNav"
        @click="$emit('open-menu')"
      >
        <span class="vpi-align-left menu-icon"></span>
        <span class="menu-text">
          {{ theme.sidebarMenuLabel || 'Menu' }}
        </span>
      </button>

      <VPLocalNavOutlineDropdown :headers="headers" :navHeight="navHeight" />
    </div>
  </div>
</template>

<style scoped>
.VPLocalNav {
  position: sticky;
  top: 0;
  /*rtl:ignore*/
  left: 0;
  z-index: var(--vp-z-index-local-nav);
  border-bottom: 1px solid var(--vp-c-gutter);
  padding-top: var(--vp-layout-top-height, 0px);
  width: 100%;
  background-color: var(--vp-local-nav-bg-color);
}

.VPLocalNav.fixed {
  position: fixed;
}

@media (min-width: 960px) {
  .VPLocalNav {
    top: var(--vp-nav-height);
  }

  .VPLocalNav.has-sidebar {
    padding-left: var(--vp-sidebar-width);
  }

  .VPLocalNav.empty,
  .VPLocalNav.is-plate {
    display: none;
  }
}

@media (min-width: 1280px) {
  .VPLocalNav {
    display: none;
  }
}

@media (min-width: 1440px) {
  .VPLocalNav.has-sidebar {
    padding-left: calc((100vw - var(--vp-layout-max-width)) / 2 + var(--vp-sidebar-width));
  }
}

.container {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.menu {
  display: flex;
  align-items: center;
  padding: 12px 24px 11px;
  line-height: 24px;
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  transition: color 0.5s;
}

.menu:hover {
  color: var(--vp-c-text-1);
  transition: color 0.25s;
}

@media (min-width: 768px) {
  .menu {
    padding: 0 32px;
  }
}

@media (min-width: 960px) {
  .menu {
    display: none;
  }
}

.menu-icon {
  margin-right: 8px;
  font-size: 14px;
}

.VPOutlineDropdown {
  padding: 12px 24px 11px;
}

@media (min-width: 768px) {
  .VPOutlineDropdown {
    padding: 12px 32px 11px;
  }
}
</style>
