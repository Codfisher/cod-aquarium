import { type MaybeElementRef, reactiveComputed, throttleFilter, useMouseInElement, useRafFn } from '@vueuse/core'
import { pipe } from 'remeda'
import { computed, ref, toValue } from 'vue'

export function useWindowRotate(
  targetRef: MaybeElementRef<HTMLElement>,
) {
  const targetEl = computed(() => toValue(targetRef))

  const {
    elementX: mouseX,
    elementY: mouseY,
    elementWidth,
    elementHeight,
    isOutside,
  } = useMouseInElement(targetRef, {
    eventFilter: throttleFilter(35),
  })
  /** 計算滑鼠到與元素的中心距離 */
  const mousePosition = reactiveComputed(() => {
    const x = elementWidth.value / 2 - mouseX.value
    const y = elementHeight.value / 2 - mouseY.value

    return {
      x,
      y,
    }
  })

  const rotateData = ref({ x: 0, y: 0 })
  const style = computed(() => ({
    transform: `rotateX(${rotateData.value.x}deg) rotateY(${-rotateData.value.y}deg)`,
  }))

  useRafFn(() => {
    const { x, y } = mousePosition

    const target = pipe(undefined, () => {
      if (isOutside.value) {
        return {
          x: y / 100,
          y: x / 100,
        }
      }

      return { x: 0, y: 0 }
    })

    rotateData.value = {
      x: rotateData.value.x + (target.x - rotateData.value.x) * 0.2,
      y: rotateData.value.y + (target.y - rotateData.value.y) * 0.2,
    }

    if (targetEl.value) {
      targetEl.value.style.transform = style.value.transform
    }
  })
}
