import type { Component } from 'vue'
import { throttle } from 'lodash-es'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { clamp, clone, pick, pipe } from 'remeda'
import { computed, markRaw, ref, shallowRef, triggerRef } from 'vue'

export type AppType = 'about' | 'center' | 'note' | 'portfolio'
interface AppInfo {
  id: string;
  type: AppType;
  data: {
    // 起點座標
    x: number;
    y: number;
    // 偏移量
    offsetX: number;
    offsetY: number;

    width: number;
    height: number;

    offsetW: number;
    offsetH: number;
  };
  isActive: boolean;
  focusedAt: number;
}

const appConfigMap: Partial<
  Record<AppType, {
    /** 只能開啟一個 */
    singleton: boolean;
  }>
> = {
  center: {
    singleton: true,
  },
}

export const useAppStore = defineStore('app', () => {
  const defaultAppData: Record<AppType, AppInfo['data']> = pipe(
    window ?? { innerWidth: 0, innerHeight: 0 },
    ({ innerWidth, innerHeight }) => {
      return {
        about: {
          x: 0,
          y: 0,
          offsetX: 0,
          offsetY: 0,
          width: Math.min(innerWidth / 2, 500),
          height: innerHeight / 2,
          offsetW: 0,
          offsetH: 0,
        },
        center: {
          x: 0,
          y: 0,
          offsetX: 0,
          offsetY: 0,
          width: Math.min(innerWidth / 2, 350),
          height: 300,
          offsetW: 0,
          offsetH: 0,
        },
        note: pipe(undefined, () => {
          const [width, height] = [
            Math.min(innerWidth / 2, 500),
            innerHeight / 2,
          ]

          return {
            x: innerWidth - width * 1.5,
            y: innerHeight - height * 1.5,
            offsetX: 0,
            offsetY: 0,
            width,
            height,
            offsetW: 0,
            offsetH: 0,
          }
        }),
        portfolio: {
          x: 0,
          y: 0,
          offsetX: 0,
          offsetY: 0,
          width: innerWidth / 2,
          height: 300,
          offsetW: 0,
          offsetH: 0,
        },
      }
    },
  )

  const appMap = shallowRef(new Map<string, AppInfo>())
  const triggerAppUpdate = throttle(
    () => triggerRef(appMap),
    15,
    { trailing: true },
  )

  const appList = computed(() => [...appMap.value.values()])

  function open(type: AppType) {
    const config = appConfigMap[type]
    if (config?.singleton) {
      const exist = appList.value.find((item) => item.type === type)
      if (exist) {
        focus(exist.id)
        return exist.id
      }
    }

    const defaultData = clone(defaultAppData[type])
    const position = pipe(
      pick(defaultData, ['x', 'y']),
      (data) => {
        appList.value.forEach((item) => {
          if (item.data.x === data.x && item.data.y === data.y) {
            data.x += 20
            data.y += 20
          }
        })

        return data
      },
    )

    const id = nanoid()
    appMap.value.set(id, {
      id,
      type,
      isActive: false,
      focusedAt: new Date().getTime(),
      data: {
        ...defaultData,
        ...position,
      },
    })

    setTimeout(() => {
      focus(id)
    }, 1000)

    triggerAppUpdate()
    return id
  }

  function focus(id?: string) {
    appMap.value.forEach((item) => {
      item.isActive = false
    })

    const target = id && appMap.value.get(id)
    if (target) {
      target.isActive = true
      target.focusedAt = new Date().getTime()
    }

    triggerAppUpdate()
  }

  function update(id: string, data: Partial<{
    offsetX: number;
    offsetY: number;
    offsetW: number;
    offsetH: number;
  }>) {
    const target = id && appMap.value.get(id)
    if (!target)
      return

    target.data.offsetX = data.offsetX ?? 0
    target.data.offsetY = data.offsetY ?? 0

    target.data.offsetW = data.offsetW ?? 0
    target.data.offsetH = data.offsetH ?? 0

    triggerAppUpdate()
  }
  function commitUpdate(id: string) {
    const target = appMap.value.get(id)
    if (!target)
      return
    target.data.x += target.data.offsetX
    target.data.y += target.data.offsetY
    target.data.offsetX = 0
    target.data.offsetY = 0

    target.data.width += target.data.offsetW
    target.data.height += target.data.offsetH
    target.data.offsetW = 0
    target.data.offsetH = 0

    triggerAppUpdate()
  }

  function close(id: string) {
    appMap.value.delete(id)
    triggerAppUpdate()
  }

  return {
    appMap,
    appList,
    open,
    focus,
    update,
    /** 將 offsetX 和 offsetY 的值提交到最終位置（x, y） */
    commitUpdate,
    close,
  }
})
