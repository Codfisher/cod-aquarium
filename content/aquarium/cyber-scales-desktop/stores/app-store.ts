import type { Component } from 'vue'
import { throttle } from 'lodash-es'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { clamp, clone, pick, pipe } from 'remeda'
import { computed, markRaw, ref, shallowRef, triggerRef } from 'vue'

import AppAbout from '../components/app-about/app-about.vue'
import AppCenter from '../components/app-center/app-center.vue'

type AppType = 'about' | 'center'
interface AppInfo {
  id: string;
  type: AppType;
  data: {
    name: string;
    // 起點座標
    x: number;
    y: number;
    // 偏移量
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    component: Component;
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

const defaultAppData: Record<AppType, AppInfo['data']> = {
  about: {
    name: '關於我',
    x: 0,
    y: 0,
    offsetX: 0,
    offsetY: 0,
    width: window.innerWidth / 2,
    height: window.innerHeight / 2,
    component: AppAbout,
  },
  center: {
    name: '應用程式',
    x: 0,
    y: 0,
    offsetX: 0,
    offsetY: 0,
    width: window.innerWidth / 3,
    height: 300,
    component: AppCenter,
  },
}

export const useAppStore = defineStore('app', () => {
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
        component: markRaw(defaultData.component),
      },
    })

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
    width: number;
    height: number;
  }>) {
    const target = id && appMap.value.get(id)
    if (!target)
      return

    target.data.offsetX = data.offsetX ?? 0
    target.data.offsetY = data.offsetY ?? 0

    target.data.width = data.width ?? target.data.width
    target.data.height = data.height ?? target.data.height

    triggerAppUpdate()
  }
  function commitPosition(id: string) {
    const target = appMap.value.get(id)
    if (!target)
      return
    target.data.x += target.data.offsetX
    target.data.y += target.data.offsetY
    target.data.offsetX = 0
    target.data.offsetY = 0
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
    commitPosition,
    close,
  }
})
