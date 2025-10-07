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
        fill="#888"
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
import { resolveTransitionParamValue } from '../../../utils'
import { baseItemInjectionKey } from '../type'

interface Props {
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  duration: 400,
})

const mainProvider = inject(baseItemInjectionKey)
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
  partOffsetX: number;
  partHScale: number;
}

const { data: graphParams } = useAnimatable(
  (): GraphParams => {
    const { width, height } = containerSize

    if (status.value === ComponentStatus.HIDDEN) {
      return {
        width: 5,
        height,
        chamfer: 2,
        opacity: 0,
        partOffsetX: -4,
        partHScale: 1,
      }
    }

    if (status.value === ComponentStatus.DISABLED) {
      return {
        width,
        height,
        chamfer: 10,
        opacity: 0.7,
        partOffsetX: 3,
        partHScale: 0.6,
      }
    }

    if (status.value === ComponentStatus.HOVER) {
      return {
        width,
        height,
        chamfer: 10,
        opacity: 0.6,
        partOffsetX: -3,
        partHScale: 1,
      }
    }

    if (status.value === ComponentStatus.ACTIVE) {
      return {
        width: width - 1,
        height: height - 1,
        chamfer: 10,
        opacity: 0.98,
        partOffsetX: 0,
        partHScale: 1,
      }
    }

    return {
      width,
      height,
      chamfer: 10,
      opacity: 1,
      partOffsetX: 0,
      partHScale: 1,
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
          partOffsetX: props.duration * 0.6,
        },
        'disabled-visible': {
          partHScale: props.duration * 0.6,
        },
      },
    ),
    duration: (fieldKey) => resolveTransitionParamValue<GraphParams, number>(
      {
        status: status.value,
        pStatus: pStatus.value,
        fieldKey,
        defaultValue: props.duration,
      },
      {
        active: 100,
      },
    ),
    ease: (fieldKey) => {
      if (fieldKey === 'opacity') {
        return 'outBounce'
      }

      return resolveTransitionParamValue<GraphParams, EaseString>(
        {
          status: status.value,
          pStatus: pStatus.value,
          fieldKey,
          defaultValue: 'inOutQuint',
        },
        {
          visible: 'inOutQuint',
          hover: 'outBounce',
        },
      )
    },
    animationTriggerBy: status,
  },
)

// 左側凹槽深度
const trench = 6
const graphAttrs = computed(() => {
  const { opacity, chamfer } = graphParams
  const qChamfer = chamfer / 4
  const [x, y, width, height] = [
    containerSize.width / 2,
    containerSize.height / 2,
    graphParams.width / 2,
    graphParams.height / 2,
  ]

  return {
    points: [
      // 左上
      `${x - width},${y - height + qChamfer}`,
      `${x - width + qChamfer},${y - height}`,

      // 右上
      `${x + width - chamfer},${y - height}`,
      `${x + width},${y - height + chamfer}`,

      // 右下
      `${x + width},${y + height - qChamfer}`,
      `${x + width - qChamfer},${y + height}`,

      // 左下
      `${x - width + qChamfer},${y + height}`,
      `${x - width},${y + height - qChamfer}`,

      // 左側凹槽
      `${x - width + trench},${y + height - qChamfer - trench}`,
      `${x - width + trench},${y - height + qChamfer + trench}`,
    ].join(' '),
    opacity,
  }
})

// part 與 graph 間隔
const partGap = 1
const partFill = computed(() => {
  if (status.value === ComponentStatus.ACTIVE) {
    return '#7dd3fc'
  }

  return '#888'
})
const partAttrs = computed(() => {
  const { opacity, chamfer, partOffsetX, partHScale } = graphParams
  const qChamfer = chamfer / 4
  const [x, y, width, oriHeight] = [
    containerSize.width / 2,
    containerSize.height / 2,
    graphParams.width / 2,
    graphParams.height / 2,
  ]

  const height = oriHeight * partHScale
  return {
    points: [
      // 左上
      `${x - width + partOffsetX},${y - height + qChamfer + partGap}`,
      // 右上
      `${x - width + trench - partGap + partOffsetX},${y - height + qChamfer + trench + partGap}`,
      `${x - width + trench - partGap + partOffsetX},${y + height - qChamfer - trench - partGap}`,
      `${x - width + partOffsetX},${y + height - qChamfer - partGap}`,
    ].join(' '),
    opacity,
    fill: partFill.value,
  }
})
</script>

<style scoped lang="sass">
.bg
  transform-style: preserve-3d
</style>
