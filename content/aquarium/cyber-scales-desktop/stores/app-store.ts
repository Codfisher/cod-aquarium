import type { Component } from 'vue'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { clone } from 'remeda'
import { shallowRef } from 'vue'

import AppList from '../components/app-list/app-list.vue'

type AppType = 'list'

interface AppInfo {
  id: string;
  name: string;
  type: AppType;
  data: {
    x: number;
    y: number;
    width: number;
    height: number;
    component: Component;
  };
}

const defaultAppData: Record<AppType, AppInfo['data']> = {
  list: {
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    component: AppList,
  },
}

export const useAppStore = defineStore('app', () => {
  const appList = shallowRef<AppInfo[]>([])

  function add(type: AppType, name: string) {
    const id = nanoid()
    appList.value.push({
      id,
      name,
      type,
      data: clone(defaultAppData[type]),
    })
  }

  return {
    appList,
    add,
  }
})
