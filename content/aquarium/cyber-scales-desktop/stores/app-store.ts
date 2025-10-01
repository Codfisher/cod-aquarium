import type { Component } from 'vue'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { clone } from 'remeda'
import { markRaw, ref, shallowRef } from 'vue'

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
  const appList = ref<AppInfo[]>([])

  function open(type: AppType) {
    const id = nanoid()
    const data = clone(defaultAppData[type])
    appList.value.push({
      id,
      type,
      data: {
        ...data,
        component: markRaw(data.component),
      },
    })
  }

  return {
    appList,
    open,
  }
})
