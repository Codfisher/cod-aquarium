<template>
  <div
    ref="containerRef"
    class="bg absolute inset-0 w-full h-full pointer-events-none"
  >
    <svg
      class="absolute"
      v-bind="svgAttrs"
    >
      <polygon
        v-bind="graphAttrs"
        stroke="#888"
        fill="transparent"
      />
      <polygon
        v-bind="partAttrs"
        stroke="white"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { EaseString } from '../../../../../../composables/use-animatable'
import { useElementSize, usePrevious } from '@vueuse/core'
import { pipe } from 'remeda'
import { computed, inject, reactive, useTemplateRef } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
import { ComponentStatus, FieldStatus } from '../../../types'
import { hasChroma, resolveTransitionParamValue } from '../../../utils'
import { baseInputInjectionKey } from '../type'

interface Props {
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  duration: 400,
})

const mainProvider = inject(baseInputInjectionKey)
if (!mainProvider) {
  throw new Error('mainProvider is not provided')
}
const { status } = mainProvider
const pStatus = usePrevious(status, ComponentStatus.HIDDEN)

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
const containerSize = reactive(useElementSize(containerRef))

const outset = 100
const svgAttrs = computed(() => ({
  style: {
    inset: `-${outset}px`,
  } satisfies CSSProperties,
  viewBox: [
    -outset,
    -outset,
    containerSize.width + outset * 2,
    containerSize.height + outset * 2,
  ].join(' '),
}))

interface GraphParams {
  width: number;
  height: number;
  /** 倒角 */
  chamfer: number;
  opacity: number;
  partOffsetY: number;
  partColor: number;
}

const { data: graphParams } = useAnimatable(
  (): GraphParams => {
    const { width, height } = containerSize

    if (status.value === ComponentStatus.HIDDEN) {
      return {
        width,
        height,
        chamfer: 2,
        opacity: 0,
        partOffsetY: -4,
        partColor: 0x888888,
      }
    }

    if (status.value === ComponentStatus.DISABLED) {
      return {
        width,
        height,
        chamfer: 10,
        opacity: 0.7,
        partOffsetY: 0,
        partColor: 0x888888,
      }
    }

    if (status.value === ComponentStatus.HOVER) {
      return {
        width,
        height,
        chamfer: 10,
        opacity: 0.6,
        partOffsetY: 5,
        partColor: 0x888888,
      }
    }

    if (status.value === ComponentStatus.ACTIVE) {
      return {
        width,
        height,
        chamfer: 10,
        opacity: 0.98,
        partOffsetY: 0,
        partColor: 0x2DD4BF,
      }
    }

    return {
      width,
      height,
      chamfer: 10,
      opacity: 1,
      partOffsetY: 0,
      partColor: 0x888888,
    }
  },
  {
    delay: (fieldKey) => resolveTransitionParamValue<GraphParams, number>(
      {
        status: status.value,
        pStatus: pStatus.value,
        fieldKey,
        defaultValue: 0,
      },
      {
        'hidden-visible': {
          width: props.duration * 1.6,
          height: props.duration,
          chamfer: props.duration * 1.6,
        },
        'visible-disabled': {
          partOffsetY: props.duration * 0.6,
        },
      },
    ),
    duration: props.duration,
    ease: (fieldKey) => {
      if (fieldKey === 'opacity') {
        return 'outBounce'
      }

      return 'inOutQuint'
    },
    animationTriggerBy: status,
  },
)

/** 凹槽深度 */
const trench = 6
/** 凹槽右內距 */
const trenchRightPadding = 14
const graphAttrs = computed(() => {
  const { opacity, chamfer } = graphParams
  const qChamfer = chamfer / 4
  const hTrench = trench / 2
  const [x, y, width, height] = [
    containerSize.width / 2,
    containerSize.height / 2,
    graphParams.width / 2,
    graphParams.height / 2,
  ]

  return {
    points: [
      // 左上
      `${x - width},${y - height + chamfer}`,
      `${x - width + chamfer},${y - height}`,

      // 右上
      `${x + width - qChamfer},${y - height}`,
      `${x + width},${y - height + qChamfer}`,

      // 右下
      `${x + width},${y + height - qChamfer}`,
      `${x + width - qChamfer},${y + height}`,

      // 凹槽
      `${x + width - trenchRightPadding},${y + height}`,
      `${x + width - trenchRightPadding - hTrench},${y + height - trench}`,
      `${x + width - trenchRightPadding - hTrench - partLength},${y + height - trench}`,
      `${x + width - trenchRightPadding - hTrench - partLength - hTrench},${y + height}`,

      // 左下
      `${x - width + qChamfer},${y + height}`,
      `${x - width},${y + height - qChamfer}`,
    ].join(' '),
    opacity,
  }
})

/** part 與 graph 間隔 */
const partGap = 1
const partLength = 40
const partAttrs = computed(() => {
  const { opacity, partOffsetY } = graphParams
  const hTrench = trench / 2
  const [x, oriY, width, height] = [
    containerSize.width / 2,
    containerSize.height / 2,
    graphParams.width / 2,
    graphParams.height / 2,
  ]
  const y = oriY + partOffsetY

  const fill = pipe(
    Math.round(graphParams.partColor),
    (value) => `#${value.toString(16).padStart(6, '0')}`,
  )
  const hasColor = hasChroma(graphParams.partColor)
  const glow = hasColor
    ? `drop-shadow(0 0 0.75rem ${fill})`
    : 'none'

  return {
    points: [
      // 左下
      `${x + width - trenchRightPadding - hTrench - partLength - hTrench + partGap},${y + height}`,
      // 左上
      `${x + width - trenchRightPadding - hTrench - partLength + partGap},${y + height - trench + partGap}`,
      `${x + width - trenchRightPadding - hTrench - partGap},${y + height - trench + partGap}`,
      `${x + width - trenchRightPadding - partGap},${y + height}`,
    ].join(' '),
    opacity,
    fill,
    strokeWidth: hasColor ? '1' : '0',
    style: `filter: ${glow}`,
  }
})
</script>

<style scoped lang="sass">
.bg
  transform-style: preserve-3d
</style>
