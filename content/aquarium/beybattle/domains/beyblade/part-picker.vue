<template>
  <div class="picker">
    <div
      v-for="(section, sectionIndex) in sectionList"
      :key="section.category"
      class="picker__section"
      :class="{
        'picker__section--expanded': expandedCategory === section.category,
        [`picker__section--${section.themeColor}`]: true,
      }"
    >
      <!-- 標題列 -->
      <button
        class="picker__header"
        @click="toggleCategory(section.category)"
      >
        <div class="picker__header-left">
          <div class="picker__indicator" />
          <span class="picker__category-name">{{ section.label }}</span>
        </div>
        <span class="picker__selected-name">{{ section.selectedRef.value.name[locale] }}</span>
      </button>

      <!-- 展開的零件清單 -->
      <transition name="expand">
        <div v-if="expandedCategory === section.category" class="picker__content">
          <button
            v-for="part in section.partList"
            :key="part.id"
            class="picker__part-button"
            :class="{
              'picker__part-button--active': section.selectedRef.value.id === part.id,
            }"
            @click="section.selectedRef.value = part"
          >
            {{ part.name[locale] }}
          </button>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BeybladeConfig, PartDefinition } from '../../types'
import { PartCategory } from '../../types'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useSimpleI18n } from '../../composables/use-simple-i18n'
import { attackRingPartList, spinTipPartList, weightDiskPartList } from './parts'

const emit = defineEmits<{
  change: [config: BeybladeConfig];
  focusCategory: [category: PartCategory | null];
}>()

const expandedCategory = ref<PartCategory | null>(PartCategory.ATTACK_RING)

const selectedAttackRing = ref<PartDefinition>(attackRingPartList[0])
const selectedWeightDisk = ref<PartDefinition>(weightDiskPartList[0])
const selectedSpinTip = ref<PartDefinition>(spinTipPartList[0])

interface SectionConfig {
  category: PartCategory;
  label: string;
  themeColor: string;
  partList: readonly PartDefinition[];
  selectedRef: Ref<PartDefinition>;
}

const { t, locale } = useSimpleI18n({
  'zh-hant': {
    attackRing: 'ATTACK RING',
    weightDisk: 'WEIGHT DISK',
    spinTip: 'SPIN TIP',
  },
  'en': {
    attackRing: 'ATTACK RING',
    weightDisk: 'WEIGHT DISK',
    spinTip: 'SPIN TIP',
  },
} as const)

const sectionList = computed<SectionConfig[]>(() => [
  {
    category: PartCategory.ATTACK_RING,
    label: t('attackRing'),
    themeColor: 'red',
    partList: attackRingPartList,
    selectedRef: selectedAttackRing,
  },
  {
    category: PartCategory.WEIGHT_DISK,
    label: t('weightDisk'),
    themeColor: 'blue',
    partList: weightDiskPartList,
    selectedRef: selectedWeightDisk,
  },
  {
    category: PartCategory.SPIN_TIP,
    label: t('spinTip'),
    themeColor: 'purple',
    partList: spinTipPartList,
    selectedRef: selectedSpinTip,
  },
])

function toggleCategory(category: PartCategory) {
  if (expandedCategory.value === category) {
    expandedCategory.value = null
    emit('focusCategory', null)
  }
  else {
    expandedCategory.value = category
    emit('focusCategory', category)
  }
}

const config = computed<BeybladeConfig>(() => ({
  attackRing: selectedAttackRing.value,
  weightDisk: selectedWeightDisk.value,
  spinTip: selectedSpinTip.value,
}))

watch(config, (value) => {
  emit('change', value)
}, { immediate: true, deep: true })

watch(selectedAttackRing, () => emit('focusCategory', PartCategory.ATTACK_RING))
watch(selectedWeightDisk, () => emit('focusCategory', PartCategory.WEIGHT_DISK))
watch(selectedSpinTip, () => emit('focusCategory', PartCategory.SPIN_TIP))
</script>

<style lang="sass" scoped>
// --- 主題色 CSS 變數 ---
.picker__section--red
  --accent: #ef4444
  --accent-dim: rgba(239, 68, 68, 0.15)
  --accent-glow: rgba(239, 68, 68, 0.4)

.picker__section--blue
  --accent: #3b82f6
  --accent-dim: rgba(59, 130, 246, 0.15)
  --accent-glow: rgba(59, 130, 246, 0.4)

.picker__section--purple
  --accent: #a855f7
  --accent-dim: rgba(168, 85, 247, 0.15)
  --accent-glow: rgba(168, 85, 247, 0.4)

.picker
  display: flex
  flex-direction: column
  gap: 2px

.picker__section
  position: relative
  overflow: hidden
  transition: background 0.3s ease

  &::before
    content: ''
    position: absolute
    left: 0
    top: 0
    bottom: 0
    width: 2px
    background: rgba(255,255,255,0.06)
    transition: all 0.3s ease

  &--expanded
    background: rgba(255,255,255,0.03)

    &::before
      background: var(--accent)
      box-shadow: 0 0 8px var(--accent-glow)

.picker__header
  width: 100%
  display: flex
  align-items: center
  justify-content: space-between
  padding: 0.6rem 0.75rem 0.6rem 1rem
  cursor: pointer
  min-height: 2.5rem
  user-select: none
  background: none
  border: none
  color: inherit
  transition: color 0.2s ease

.picker__header-left
  display: flex
  align-items: center
  gap: 0.5rem

.picker__indicator
  width: 5px
  height: 5px
  background: rgba(255,255,255,0.15)
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)
  transition: all 0.3s ease

  .picker__section--expanded &
    background: var(--accent)
    box-shadow: 0 0 6px var(--accent-glow)

.picker__category-name
  font-family: 'Rajdhani', sans-serif
  font-weight: 700
  font-size: 0.65rem
  letter-spacing: 0.2em
  color: rgba(255,255,255,0.3)
  transition: color 0.3s ease

  .picker__section--expanded &
    color: var(--accent)

.picker__selected-name
  font-family: 'Rajdhani', sans-serif
  font-weight: 500
  font-size: 0.65rem
  color: rgba(255,255,255,0.25)
  letter-spacing: 0.05em

.picker__content
  display: flex
  gap: 0.35rem
  padding: 0 0.75rem 0.6rem 1rem
  overflow-x: auto
  scrollbar-width: none

  &::-webkit-scrollbar
    display: none

.picker__part-button
  flex-shrink: 0
  padding: 0.4rem 0.8rem
  font-family: 'Rajdhani', sans-serif
  font-weight: 600
  font-size: 0.75rem
  letter-spacing: 0.05em
  color: rgba(255,255,255,0.4)
  background: rgba(255,255,255,0.04)
  border: 1px solid rgba(255,255,255,0.06)
  cursor: pointer
  min-height: 2rem
  clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)
  transition: all 0.2s ease
  white-space: nowrap

  &:hover
    color: rgba(255,255,255,0.7)
    background: rgba(255,255,255,0.08)
    border-color: rgba(255,255,255,0.12)

  &--active
    color: white
    background: var(--accent-dim)
    border-color: var(--accent)
    box-shadow: 0 0 12px var(--accent-glow)
    text-shadow: 0 0 8px var(--accent-glow)

.expand
  &-enter-active, &-leave-active
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1)
    max-height: 60px
    overflow: hidden
  &-enter-from, &-leave-to
    max-height: 0
    opacity: 0
    padding-bottom: 0
</style>
