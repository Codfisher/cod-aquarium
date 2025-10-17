if (import.meta.env.SSR) {
  const log = (label: string) => {
    const e = new Error(`[SSR] "${label}" was accessed`)
    console.error(e.stack)
  }
  try {
    for (const k of ['document', 'window', 'localStorage', 'matchMedia'] as const) {
      Object.defineProperty(globalThis as any, k, {
        configurable: true,
        get() {
          log(k)
          return undefined
        },
      })
    }
  }
  catch { }
}
