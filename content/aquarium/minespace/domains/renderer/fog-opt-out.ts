import type { Scene } from '@babylonjs/core'

/**
 * 不吃霧的東西要自己交代怎麼收
 *
 * 世界邊界那道白幕靠的是霧：能見度收到六格，凡是照距離吃霧的東西
 * 一律自己糊掉，跨過邊界的前後兩側都是同一片白，循環才藏得住。
 *
 * 會壞事的只有一種東西——自己跳出霧的那些。天空、太陽月亮、雲、
 * 燈暈都不吃霧，因為它們本來就不該按距離褪色；代價是邊界那道簾子
 * 對它們一律無效，每一個都得另外接一條收乾淨的路。
 *
 * 這件事過去是靠記性的，而漏掉的症狀是「走到邊界還看得到某個東西」，
 * 通常要等到有人真的走過去才會發現。改成登記制之後，
 * 忘了接的那一個會在開發模式的主控台自己講出來
 */

/** 能吃霧的東西：網格與粒子系統都有這兩個欄位 */
interface FogAware {
  applyFog: boolean;
  name: string;
}

/**
 * 登記過的跳出者
 *
 * 用弱參考，場景丟掉時這裡不會拖著它們不放
 */
const handledMap = new WeakMap<FogAware, string>()

/**
 * 宣告這個東西不吃霧，並說明它在世界邊界怎麼收
 *
 * edgeHandling 那句話是寫給下一個人看的：
 * 到邊界時是誰把它收掉、收到哪裡去。想不出來就表示還沒接
 */
export function optOutOfFog(target: FogAware, edgeHandling: string): void {
  target.applyFog = false
  handledMap.set(target, edgeHandling)
}

function isFogAware(value: object): value is FogAware {
  return 'applyFog' in value
    && typeof (value as { applyFog: unknown }).applyFog === 'boolean'
    && 'name' in value
}

/**
 * 掃一遍場景，把沒登記就跳出霧的東西報出來
 *
 * 只在開發模式呼叫。它不會攔阻任何事，只負責讓人在加東西的當下就知道
 * 「這個到邊界不會自己消失」，而不是等到走過去才發現
 */
export function auditFogOptOut(scene: Scene): void {
  const missingList: string[] = []

  const targetList: object[] = [...scene.meshes, ...scene.particleSystems]

  for (const target of targetList) {
    if (!isFogAware(target))
      continue
    if (target.applyFog)
      continue
    if (handledMap.has(target))
      continue

    missingList.push(target.name)
  }

  if (missingList.length === 0)
    return

  const nameList = missingList.map((name) => `  - ${name}`).join('\n')

  console.warn(
    `[fog-opt-out] 這些東西不吃霧，但沒交代到了世界邊界要怎麼收：\n${nameList}\n`
    + `改用 optOutOfFog(目標, '到邊界時怎麼收') 登記，或讓它吃霧`,
  )
}
