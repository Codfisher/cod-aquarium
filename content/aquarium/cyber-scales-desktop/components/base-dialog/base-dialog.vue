<template>
  <div class=" fixed inset-0 flex justify-center items-center">
    <div
      class=" absolute backdrop w-full h-full  duration-500"
      :class="backdropClass"
      @click.self="handleBackdrop"
    />

    <div
      ref="dialogRef"
      class="base-dialog relative flex"
    >
      <bg class="z-[-1]" />

      <content-wrapper class="content-bg flex-1 bg-white/80">
        <slot>
          <div class=" w-full h-full flex flex-col items-center gap-1 ">
            <material-icon
              :name="props.icon"
              :class="props.iconClass"
              size="6rem"
              weight="200"
              grade="-25"
              opsz="20"
              class="py-3"
            />

            <div class="flex flex-col justify-center items-center flex-1 pb-6 px-20">
              <div
                v-if="props.title"
                class="text-xl font-bold tracking-wider mb-2"
              >
                {{ props.title }}
              </div>

              <div
                v-if="props.description"
                class="  "
              >
                {{ props.description }}
              </div>
            </div>

            <div
              v-if="props.actionList.length > 0"
              class="flex justify-end w-full gap-1 p-2"
            >
              <base-btn
                v-for="btn, i in props.actionList"
                :key="i"
                v-bind="btn"
                class="px-4"
              />
            </div>
          </div>
        </slot>
      </content-wrapper>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ComponentProps } from 'vue-component-type-helpers'
import type { BaseDialogEmits } from './type'
import { until, useElementHover, useElementSize } from '@vueuse/core'
import { computed, nextTick, onMounted, provide, ref, useTemplateRef } from 'vue'
import { nextFrame } from '../../../../../common/utils'
import { useElement3dRotate } from '../../composables/use-element-3d-rotate'
import { ComponentStatus } from '../../types'
import BaseBtn from '../base-btn/base-btn.vue'
import MaterialIcon from '../material-icon.vue'
import Bg from './bg/bg.vue'
import ContentWrapper from './content-wrapper.vue'
import { baseDialogInjectionKey } from './type'

interface Props {
  icon?: string;
  iconClass?: string;
  title?: string;
  description: string;
  actionList?: Array<ComponentProps<typeof BaseBtn>>;
}

interface Slots {
  default?: () => unknown;
}

const props = withDefaults(defineProps<Props>(), {
  icon: 'warning',
  iconClass: 'text-red-400',
  actionList: () => [],
})

const emit = defineEmits<BaseDialogEmits>()

defineSlots<Slots>()

const status = ref(ComponentStatus.HIDDEN)

const dialogRef = useTemplateRef('dialogRef')
const dialogSize = useElementSize(dialogRef)
useElement3dRotate(dialogRef)

const isHover = useElementHover(dialogRef)

const backdropClass = computed(() => ({
  'opacity-0': status.value !== ComponentStatus.VISIBLE,
  'opacity-100': status.value === ComponentStatus.VISIBLE,
}))
function handleBackdrop() {
  emit('backdrop')
}

onMounted(async () => {
  // 確保 window 有尺寸
  await until(dialogSize.width).toBeTruthy()
  await until(dialogSize.height).toBeTruthy()

  // 確保 Vue 資料、畫面更新完畢
  await nextTick()
  await nextFrame()

  status.value = ComponentStatus.VISIBLE
})

const currentStatus = computed(() => {
  if (status.value === ComponentStatus.HIDDEN) {
    return ComponentStatus.HIDDEN
  }

  return isHover.value
    ? ComponentStatus.HOVER
    : status.value
})

defineExpose({
  status: computed(() => currentStatus.value),
  setStatus(value: `${ComponentStatus}`) {
    status.value = value as ComponentStatus
  },
})

provide(baseDialogInjectionKey, {
  status: computed(() => currentStatus.value),
  emit,
})
</script>

<style scoped lang="sass">
.base-dialog
  transform-style: preserve-3d
  perspective: 2000px
  min-width: 300px
  min-height: 200px

.content-bg
  backdrop-filter: blur(10px)
  transform-style: preserve-3d
  perspective: 2000px

.backdrop
  background: rgba(black, 0.1)
  backdrop-filter: blur(4px)
</style>
