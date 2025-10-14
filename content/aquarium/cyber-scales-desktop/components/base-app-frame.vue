<template>
  <div
    ref="frameRef"
    class="base-app-window absolute top-0 left-0"
    :class="frameClass"
  >
    <base-window
      ref="windowRef"
      :title="props.title"
      :style="style"
      @pointerdown="handlePointerDown"
      @dragging="handleDragging"
      @drag-end="commitUpdate"
      @resizing="handleResizing"
      @resize-end="commitUpdate"
      @close="handleClose"
    >
      <slot />
    </base-window>
  </div>
</template>

<script setup lang="ts">
import type { ComponentProps } from 'vue-component-type-helpers'
import { promiseTimeout, refAutoReset, useElementHover, whenever } from '@vueuse/core'
import { useMachine } from '@xstate/vue'
import { fromKeys, identity, pipe, piped, when } from 'remeda'
import { computed, EmitFn, getCurrentInstance, useTemplateRef, watch } from 'vue'
import { createMachine } from 'xstate'
import { useAppStore } from '../stores/app-store'
import { ComponentStatus } from '../types'
import BaseWindow from './base-window/base-window.vue'

type BaseWindowProps = ComponentProps<typeof BaseWindow>

interface Props {
  appId: string;
  title?: string;
}

interface Emits {
  close: [done: (shouldClose: boolean) => void];
}

const props = withDefaults(defineProps<Props>(), {})
const emit = defineEmits<Emits>()

const instance = getCurrentInstance()
const windowRef = useTemplateRef('windowRef')
const frameRef = useTemplateRef('frameRef')

const frameClass = computed(() => {
  const status = windowRef.value?.status

  return {
    'pointer-events-auto': status !== ComponentStatus.HIDDEN,
    'pointer-events-none': status === ComponentStatus.HIDDEN,
  }
})

const appStore = useAppStore()

const style = computed(() => {
  const info = appStore.appMap.get(props.appId)
  if (!info) {
    return
  }
  const data = info.data
  return {
    width: `${data.width + data.offsetW}px`,
    height: `${data.height + data.offsetH}px`,
  }
})

/** 第一次從 hidden 至 visible 時，阻止所有狀態轉換
 *
 * TODO: 先使用時間判斷，未來在想更好的設計
 */
const isFirst = refAutoReset(false, 1000)
isFirst.value = true

const isHover = useElementHover(frameRef)
const isActive = computed(() =>
  appStore.appMap.get(props.appId)?.isActive ?? false,
)
// watch(() => [isActive, isHover, isFirst], async () => {
//   const status = windowRef.value?.status
//   if (!status || isFirst.value) {
//     return
//   }

//   if (status === ComponentStatus.HIDDEN) {
//     return
//   }
//   if (isActive.value && status === ComponentStatus.ACTIVE) {
//     return
//   }

//   if (
//     isActive.value
//     && [
//       ComponentStatus.VISIBLE,
//       ComponentStatus.HOVER,
//     ].includes(status)
//   ) {
//     windowRef.value?.setStatus('active')
//     return
//   }

//   if (!isActive.value && status === ComponentStatus.ACTIVE) {
//     windowRef.value?.setStatus('visible')
//     return
//   }

//   if (status === ComponentStatus.VISIBLE && isHover.value) {
//     windowRef.value?.setStatus('hover')
//     return
//   }

//   windowRef.value?.setStatus('visible')
// }, {
//   deep: true,
// })

/** 為了簡化以下寫法：
 *
 * // {
 * //   [ComponentStatus.VISIBLE]: ComponentStatus.VISIBLE,
 * //   [ComponentStatus.ACTIVE]: ComponentStatus.ACTIVE,
 * // },
 */
const getOnObject = fromKeys<ComponentStatus[], ComponentStatus>(identity())

const statusMachine = createMachine({
  initial: ComponentStatus.HIDDEN,
  states: {
    [ComponentStatus.HIDDEN]: {
      entry({ self }) {
        if (!isFirst.value) {
          self.stop()
        }
      },
      // on: {
      //   [ComponentStatus.VISIBLE]: ComponentStatus.VISIBLE,
      //   [ComponentStatus.ACTIVE]: ComponentStatus.ACTIVE,
      // },
      on: getOnObject([
        ComponentStatus.VISIBLE,
        ComponentStatus.ACTIVE,
      ]),
    },
    [ComponentStatus.VISIBLE]: {
      on: getOnObject([
        ComponentStatus.HIDDEN,
        ComponentStatus.ACTIVE,
        ComponentStatus.HOVER,
      ]),
    },
    [ComponentStatus.ACTIVE]: {
      on: getOnObject([
        ComponentStatus.HIDDEN,
        ComponentStatus.VISIBLE,
      ]),
    },
    [ComponentStatus.HOVER]: {
      on: getOnObject([
        ComponentStatus.HIDDEN,
        ComponentStatus.ACTIVE,
        ComponentStatus.VISIBLE,
      ]),
    },
  },
})

const { snapshot, send } = useMachine(statusMachine)

whenever(() => windowRef.value?.status, async (status) => {
  send({ type: status })
})
watch(() => [isActive, isHover, isFirst], async () => {
  if (isFirst.value) {
    return
  }

  const type = pipe(
    ComponentStatus.VISIBLE,
    when(() => isHover.value, () => ComponentStatus.HOVER),
    when(() => isActive.value, () => ComponentStatus.ACTIVE),
  )

  send({ type })
}, { deep: true })

watch(() => snapshot.value.value, (state) => {
  windowRef.value?.setStatus(state as ComponentStatus)
})

function handlePointerDown() {
  appStore.focus(props.appId)
}
const handleDragging: BaseWindowProps['onDragging'] = (data) => {
  appStore.focus(props.appId)
  appStore.update(props.appId, data)
}
const handleResizing: BaseWindowProps['onResizing'] = (data) => {
  appStore.focus(props.appId)
  appStore.update(props.appId, data)
}
function commitUpdate() {
  appStore.commitUpdate(props.appId)
}

function hasCloseListener() {
  const nodeProps = instance?.vnode.props as BaseWindowProps
  return !!nodeProps.onClose
}
const handleClose: BaseWindowProps['onClose'] = async () => {
  if (hasCloseListener()) {
    const ok = await new Promise<boolean>((resolve) => {
      emit('close', (value: boolean) => resolve(value))
    })
    if (!ok) {
      return
    }
  }

  windowRef.value?.setStatus('hidden')
  await promiseTimeout(1000)
  appStore.close(props.appId)
}

defineExpose({
  windowRef,
  frameRef,
  isHover,
  isActive,
})
</script>

<style scoped lang="sass">
// 擴展控制範圍
.base-app-window
  &::after
    content: ''
    position: absolute
    top: -20px
    left: -20px
    right: -20px
    bottom: -20px
    z-index: -1
</style>
