import { defineNuxtPlugin } from 'nuxt/app'

/** dev 時打開 Babylon 的「缺少副作用匯入」警告。
 *
 * 深層路徑匯入（@babylonjs/core/xxx）時，scene.enablePhysics 這類方法要另外匯入對應的元件才會註冊，
 * 漏了只會留下佔位函式，執行時才出現難以追查的錯誤（例如 No Physics Engine available）。
 * 打開後呼叫到佔位函式會在 console 指出缺了哪個類別的哪個方法。正式建置會移除這段
 */
export default defineNuxtPlugin({
  name: 'babylon-dev-warnings',
  async setup() {
    if (!import.meta.dev)
      return

    const { SetMissingSideEffectWarningsEnabled } = await import('@babylonjs/core/Misc/devTools')
    SetMissingSideEffectWarningsEnabled(true)
  },
})
