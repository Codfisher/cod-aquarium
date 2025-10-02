import type { Component } from 'vue'
import { throttle } from 'lodash-es'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { clamp, clone, pick, pipe } from 'remeda'

import { computed, markRaw, ref, shallowRef, triggerRef } from 'vue'
import AppCenter from '../components/app-center/app-center.vue'

type AppType = 'center'
interface AppInfo {
  id: string;
  type: AppType;
  data: {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    component: Component;
  };
  isActive: boolean;
  focusedAt: number;
}

const defaultAppData: Record<AppType, AppInfo['data']> = {
  center: {
    name: '應用程式',
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    component: AppCenter,
  },
}

export const useAppStore = defineStore('app', () => {
  const appMap = shallowRef(new Map<string, AppInfo>())
  const triggerAppUpdate = throttle(() => triggerRef(appMap), 15)

  const appList = computed(() => [...appMap.value.values()])

  function open(type: AppType) {
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
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  }>) {
    const target = id && appMap.value.get(id)
    if (!target)
      return

    target.data.x = pipe(
      data.x,
      (value) => {
        if (value !== undefined)
          return value

        return target.data.x + (data.offsetX ?? 0)
      },
      clamp({
        min: 0,
        max: window.innerWidth - target.data.width - 80,
      }),
    )

    target.data.y = pipe(
      data.y,
      (value) => {
        if (value !== undefined)
          return value

        return target.data.y + (data.offsetY ?? 0)
      },
      clamp({
        min: 0,
        max: window.innerHeight - target.data.height - 80,
      }),
    )

    target.data.width = data.width ?? target.data.width
    target.data.height = data.height ?? target.data.height

    triggerAppUpdate()
  }

  function close(id: string) {
    appMap.value.delete(id)
    triggerAppUpdate()
  }

  return {
    appList,
    open,
    focus,
    update,
    close,
  }
})
