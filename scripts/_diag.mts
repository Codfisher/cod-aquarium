/** 暫時的診斷：找出「色調被關掉、但圖卻是從退路資料夾來的」那些格子 */
import { MINI_PIXEL_TEXTURE_MAP, resolveTexture, TEXTURE_PACK_LIST } from '../content/aquarium/minespace/domains/block/texture-pack'

const keyList = Object.keys(MINI_PIXEL_TEXTURE_MAP) as (keyof typeof MINI_PIXEL_TEXTURE_MAP)[]

for (const pack of TEXTURE_PACK_LIST) {
  const badList: string[] = []
  for (const key of keyList) {
    const resolved = resolveTexture(pack, key)
    if (!resolved.url)
      continue
    const isOwn = resolved.url.startsWith(`${pack.baseUrl}/`)
    const saysNoTint = resolved.tint === null || resolved.pixelTint === null
    if (!isOwn && saysNoTint) {
      badList.push(`${key} → ${resolved.url}`)
    }
  }
  console.log(`${pack.title['zh-hant']}：${badList.length} 格`)
  for (const line of badList) {
    console.log(`   ${line}`)
  }
}
