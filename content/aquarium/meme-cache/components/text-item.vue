<template>
  <div
    ref="targetRef"
    :id
    class="target absolute p-4 whitespace-pre"
    contenteditable
    :style="targetStyle"
    @click="handleClick"
    @input="handleInput"
  />
</template>

<script setup lang="ts">
import { onClickOutside } from '@vueuse/core';
/** 不知道為甚麼，控制點都按不到 */
// import Moveable from 'moveable'
import { computed, CSSProperties, onMounted, ref, useId, useTemplateRef, watch } from 'vue'
import interact from 'interactjs'

interface Props { }
const props = withDefaults(defineProps<Props>(), {})

const emit = defineEmits<{}>()

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

const isEditing = ref(false)
const targetRef = useTemplateRef('targetRef')
const targetStyle = computed<CSSProperties>(() => ({
  fontSize: `${settings.value.fontSize}px`,
  fontWeight: settings.value.fontWeight,
  color: settings.value.color,
  backgroundColor: settings.value.backgroundColor,
  transform: `translate(${settings.value.x}px, ${settings.value.y}px)`,
  outline: isEditing.value ? '1px solid #3b82f6' : 'none',
  userSelect: isEditing.value ? 'text' : 'none',
}))

function handleClick() {
  isEditing.value = true
}
function handleInput(event: InputEvent) {
  const el = event.target as HTMLElement
  settings.value.text = el.innerText
}
onClickOutside(targetRef, () => {
  isEditing.value = false
})


onMounted(() => {
  const el = targetRef.value
  if (!el) {
    return
  }

  el.textContent = settings.value.text

  interact(el)
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
})

</script>

<style scoped lang="sass">
.target
  touch-action: none !important
  user-select: none !important
</style>
