import type { SoundEmitterDefinition } from '../../soundscape/type'
import { CAMP_FIRE_LIST } from './campfire-layout'

/**
 * 營火谷的音源
 *
 * 爐火壇只有一種聲音：一團持續的低頻劈啪（campfire-fire），貼著火塘、高一格。
 * 這裡照搬，每一個火塘一顆：大篝火那顆大聲、傳得遠，谷裡走到哪都還聽得到一點；
 * 小營地的各自只管身邊十幾格，從一處走到另一處，一堆火淡下去、另一堆浮上來。
 * 不加鳥、不加風：這座谷要說的只有火
 */
export const CAMPFIRE_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = CAMP_FIRE_LIST.map(
  (fire, index): SoundEmitterDefinition => ({
    id: fire.isBonfire ? 'campfire-hollow-bonfire' : `campfire-hollow-fire-${index}`,
    sound: 'campfire',
    title: fire.isBonfire
      ? { 'zh-hant': '大篝火劈啪', 'en': 'Crackling bonfire' }
      : { 'zh-hant': '營火劈啪', 'en': 'Crackling campfire' },
    zone: 'campfire',
    x: fire.x,
    z: fire.z,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: fire.isBonfire ? 1 : 0.75,
    minDistance: fire.isBonfire ? 3 : 2,
    maxDistance: fire.isBonfire ? 34 : 17,
  }),
)
