import type { Ref } from 'vue'
import interact from 'interactjs'
import { clamp } from 'remeda'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { DEFAULT_STITCH_FIT_MODE, DEFAULT_STITCH_FOCAL, getStitchFillOption } from './stitch-layout'

export interface StitchCellCropSetting {
  fillValue?: string;
  fitMode?: 'cover' | 'contain';
  focalX?: number;
  focalY?: number;
}

interface UseStitchCellCropOptions {
  setting: Ref<StitchCellCropSetting>;
  /** 實際顯示圖片的元素（img 或 canvas 皆可，object-fit / object-position 兩者都吃） */
  elementRef: Ref<HTMLElement | null | undefined>;
  /** 拖曳中即時觸發，focalX / focalY 皆為 0~100 */
  onReposition: (focalX: number, focalY: number) => void;
  /** 裁切模式下圖片吃走了 pointerdown，點擊（非拖曳）要靠這個事件轉發給畫板補開文字 */
  onTap: (clientX: number, clientY: number) => void;
}

/**
 * 拼接格子與底圖共用的裁切互動邏輯：object-fit / object-position 的計算、
 * 拖曳調整可視範圍、點擊轉發。抽成 composable 而非塞進單一元件，
 * 是因為底圖顯示的是 img 或 canvas（動圖走 canvas），沒有固定的標籤可以共用元件範本，
 * 但兩者要的物件定位與拖曳邏輯完全一樣，值得共用
 */
export function useStitchCellCrop(options: UseStitchCellCropOptions) {
  const hasCustomRatio = computed(() => getStitchFillOption(options.setting.value.fillValue).ratio !== null)
  const fitMode = computed(() => options.setting.value.fitMode ?? DEFAULT_STITCH_FIT_MODE)

  /** 原始比例下格子與圖片必定吻合，object-fit 給哪個值都一樣，統一用 contain */
  const objectFitClass = computed(
    () => hasCustomRatio.value && fitMode.value === 'cover' ? 'object-cover' : 'object-contain',
  )

  /**
   * 只有「裁切填滿」才有可視範圍可拖：原始比例下格子與圖片必定吻合，
   * 「完整顯示」則整張圖本來就看得到，兩者都沒有可拖曳的意義
   */
  const draggable = computed(() => hasCustomRatio.value && fitMode.value === 'cover')

  const objectPositionStyle = computed(() => ({
    objectPosition: `${options.setting.value.focalX ?? DEFAULT_STITCH_FOCAL}% ${options.setting.value.focalY ?? DEFAULT_STITCH_FOCAL}%`,
  }))

  let interactable: ReturnType<typeof interact> | undefined

  function attachInteractable() {
    const el = options.elementRef.value
    if (!el)
      return

    interactable = interact(el)
      .draggable({
        listeners: {
          move(event) {
            const rect = el.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0)
              return

            options.onReposition(
              clamp((options.setting.value.focalX ?? DEFAULT_STITCH_FOCAL) - (event.dx / rect.width) * 100, { min: 0, max: 100 }),
              clamp((options.setting.value.focalY ?? DEFAULT_STITCH_FOCAL) - (event.dy / rect.height) * 100, { min: 0, max: 100 }),
            )
          },
        },
      })
      // 圖片為了拖曳裁切吃走了 pointer 事件，點擊穿不到畫板，改靠 tap 手勢補發訊號，
      // 讓「點空白處加文字」在裁切圖片上一樣成立；真的拖動時 interact 不會觸發 tap
      .on('tap', (event: { clientX: number; clientY: number }) => {
        options.onTap(event.clientX, event.clientY)
      })
  }

  function detachInteractable() {
    interactable?.unset()
    interactable = undefined
  }

  onMounted(() => {
    if (draggable.value) {
      attachInteractable()
    }
  })
  onBeforeUnmount(detachInteractable)

  /**
   * 兩種情況都要重新掛：切到沒有可視範圍可拖的模式時卸載，避免留下看得到卻沒效果的
   * 拖曳手感；元素本身換掉時也要重掛，底圖動圖／靜圖之間會切換 canvas／img 兩種標籤，
   * 不是同一個 DOM 節點，舊的 interactable 已經對著被移除的元素，等於失效
   */
  watch([draggable, options.elementRef], () => {
    detachInteractable()
    if (draggable.value) {
      attachInteractable()
    }
  })

  return {
    objectFitClass,
    objectPositionStyle,
    draggable,
  }
}
