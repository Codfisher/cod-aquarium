import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export const useMainStore = defineStore('main', () => {
  const rootFsHandle = shallowRef<FileSystemDirectoryHandle>()
  const version = '0.1.0'

  return {
    rootFsHandle,
    version,
  }
})
