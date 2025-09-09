import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

interface AppInfo {
  id: string;
  name: string;
  icon: string;
  version: string;
  description: string;
}

export const useAppStore = defineStore('app', () => {
  const appList = shallowRef([])

  return {}
})
