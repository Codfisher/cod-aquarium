// .vitepress/ssr-guard.ts
if (import.meta.env.SSR) {
  const log = (label: string) => {
    try {
      const e = new Error(`[SSR] "${label}" was accessed`)
      console.error(e.stack) // 這裡會印出存取者的原始檔與行號（若該檔有 sourcemap）
    }
    catch { }
  }

  try {
    Object.defineProperty(globalThis as any, 'document', {
      configurable: true,
      get() {
        log('document')
        return undefined
      },
    })
    Object.defineProperty(globalThis as any, 'window', {
      configurable: true,
      get() {
        log('window')
        return undefined
      },
    })
    Object.defineProperty(globalThis as any, 'localStorage', {
      configurable: true,
      get() {
        log('localStorage')
        return undefined
      },
    })
    Object.defineProperty(globalThis as any, 'matchMedia', {
      configurable: true,
      get() {
        log('matchMedia')
        return undefined
      },
    })
  }
  catch { }
}
