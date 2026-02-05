import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export const useMainStore = defineStore('main', () => {
  const rootFsHandle = shallowRef<FileSystemDirectoryHandle>()

  return {
    rootFsHandle,
  }
})
