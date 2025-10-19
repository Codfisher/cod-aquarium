<template>
  <div
    :id
    ref="boxRef"
    class="box absolute"
    :style="boxStyle"
  >
    <div
      ref="textRef"
      class="text p-4 whitespace-pre"
      contenteditable
      :style="textStyle"
      @input="handleInput"
    />

    <div
      :style="toolbarStyle"
      class=" absolute left-0 top-0 flex gap-2 rounded"
    >
      <UButton
        icon="i-lucide-trash-2"
        class="p-2!"
        @click="emit('delete')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/** 不知道為甚麼，控制點都按不到 */
// import Moveable from 'moveable'
import type { CSSProperties } from 'vue'
import { useElementSize } from '@vueuse/core'
import interact from 'interactjs'
import { computed, onMounted, reactive, useId, useTemplateRef } from 'vue'

interface Props {
  isEditing?: boolean;
  /** 建立後自動 focus */
  autoFocus?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  isEditing: false,
  autoFocus: true,
})

const emit = defineEmits<{
  delete: [];
}>()

const id = useId()

const settings = defineModel({
  default: {
    text: '點擊編輯',
    x: 0,
    y: 0,
    fontSize: 16,
    fontWeight: 400,
    color: '#000000',
    backgroundColor: 'transparent',
  },
})

const boxRef = useTemplateRef('boxRef')
const boxSize = reactive(useElementSize(boxRef))
const boxStyle = computed<CSSProperties>(() => ({
  transform: `translate(${settings.value.x}px, ${settings.value.y}px)`,
  userSelect: props.isEditing ? 'text' : 'none',
}))

const textRef = useTemplateRef('textRef')
const textStyle = computed<CSSProperties>(() => ({
  fontSize: `${settings.value.fontSize}px`,
  fontWeight: settings.value.fontWeight,
  color: settings.value.color,
  backgroundColor: settings.value.backgroundColor,
  outline: props.isEditing ? '1px solid #3b82f6' : 'none',
}))

function handleInput(event: InputEvent) {
  const el = event.target as HTMLElement
  settings.value.text = el.textContent
}

const toolbarStyle = computed<CSSProperties>(() => ({
  transform: `translate(${boxSize.width / 2}px, -50%)`,
}))

onMounted(() => {
  const box = boxRef.value
  const text = textRef.value
  if (!box || !text) {
    return
  }

  text.textContent = settings.value.text

  interact(box)
    .draggable({
      listeners: {
        move(event) {
          const target = event.target
          settings.value.x += event.dx
          settings.value.y += event.dy

          target.style.transform = `translate(${settings.value.x}px, ${settings.value.y}px)`
        },
      },
    })

  if (props.autoFocus) {
    box.focus()
  }
})
</script>

<style scoped lang="sass">
.box
  touch-action: none !important
.text
  transform: translate(-50%, -50%)
</style>
