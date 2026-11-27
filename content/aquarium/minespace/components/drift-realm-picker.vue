<template>
  <div
    class="drift-picker"
    role="dialog"
    :aria-label="t('title')"
  >
    <div class="picker-head">
      <div>
        <div class="picker-title">
          {{ t('title') }}
        </div>
        <div class="picker-hint">
          {{ t('hint') }}
        </div>
      </div>

      <button
        class="mc-button back-button"
        @click="$emit('close')"
      >
        <UIcon
          name="i-material-symbols:arrow-back-rounded"
          class="text-base"
        />
        {{ t('back') }}
      </button>
    </div>

    <div class="realm-grid">
      <button
        v-for="realm in realmList"
        :key="realm.id"
        class="mc-button realm-card"
        @click="$emit('select', realm.id)"
      >
        <span class="realm-name">
          <UIcon
            :name="realm.icon"
            class="text-lg shrink-0"
          />
          {{ locale === 'en' ? realm.title.en : realm.title['zh-hant'] }}
        </span>
        <span class="realm-description">
          {{ locale === 'en' ? realm.description.en : realm.description['zh-hant'] }}
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RealmId } from '../domains/realm/realm-definition'
import { onKeyStroke } from '@vueuse/core'
import { useSimpleI18n } from '../composables/use-simple-i18n'
import { REALM_LIST } from '../domains/realm/realm-list'

const emit = defineEmits<{
  select: [realmId: RealmId];
  close: [];
}>()

/** 大廳不列：神遊要的是一座可以久留的大場景，大廳是各座箱庭之間的過道 */
const realmList = REALM_LIST.filter((realm) => realm.id !== 'hub')

onKeyStroke('Escape', () => emit('close'))

const { t, locale } = useSimpleI18n({
  'zh-hant': {
    title: '神遊',
    hint: '挑一處，鏡頭自己走，你只管聽',
    back: '返回',
  },
  'en': {
    title: 'Drift',
    hint: 'Pick a place. The camera wanders on its own — just listen',
    back: 'Back',
  },
} as const)
</script>

<style scoped lang="sass">
.drift-picker
  margin: auto
  width: 100%
  max-width: 760px
  color: #E6E6E6
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6)

.picker-head
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 12px
  margin-bottom: 16px

.picker-title
  font-size: 2rem
  font-weight: 900
  letter-spacing: 0.04em
  line-height: 1.1

.picker-hint
  margin-top: 6px
  font-size: 14px
  opacity: 0.75

.mc-button
  display: block
  background: #AAAAAA
  border: none
  color: white
  cursor: pointer
  text-align: left
  box-shadow: inset -2px -4px 0 #555555, inset 2px 2px 0 #FFFFFF
  text-shadow: 2px 2px 0 #3F3F3F
  transition: transform 0.1s
  padding: 10px 14px

  &:hover
    background: #C6C6C6

  &:active
    transform: scale(0.98)
    background: #777777
    box-shadow: inset 2px 4px 0 #555555, inset -2px -2px 0 #FFFFFF

.back-button
  flex: none
  display: flex
  align-items: center
  gap: 4px
  font-size: 14px

/**
 * 手機寬度塞不下三欄，退成兩欄；再窄（小於 340px）就一欄
 * minmax 的下限同時管住桌機：寬了自然多排幾欄
 */
.realm-grid
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))
  gap: 8px

@media (max-width: 520px)
  .realm-grid
    grid-template-columns: repeat(2, minmax(0, 1fr))

@media (max-width: 340px)
  .realm-grid
    grid-template-columns: minmax(0, 1fr)

.realm-card
  display: flex
  flex-direction: column
  gap: 4px
  min-height: 76px

.realm-name
  display: flex
  align-items: center
  gap: 6px
  font-size: 15px
  font-weight: 700

.realm-description
  font-size: 12px
  line-height: 1.5
  opacity: 0.88
</style>
