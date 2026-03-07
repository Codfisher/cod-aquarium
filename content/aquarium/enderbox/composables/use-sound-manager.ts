import { BlockId } from '../domains/block/block-constants'

const SOUND_BASE = '/assets/minecraft/sounds'

/** 音效材質類型，對應不同方塊踩踏/挖掘的聲音 */
export type SoundMaterial = 'grass' | 'stone' | 'wood' | 'gravel' | 'sand' | 'snow' | 'cloth' | 'coral' | 'wet_grass'

/** 方塊 ID 對應的音效材質 */
const BLOCK_SOUND_MATERIAL: Partial<Record<BlockId, SoundMaterial>> = {
  [BlockId.GRASS]: 'grass',
  [BlockId.STONE]: 'stone',
  [BlockId.WOOD]: 'wood',
  [BlockId.DIRT]: 'gravel',
  [BlockId.BEDROCK]: 'stone',
  [BlockId.SAND]: 'sand',
  [BlockId.COBBLESTONE]: 'stone',
  [BlockId.GLASS]: 'stone',
  [BlockId.OAK_LEAVES]: 'grass',
  [BlockId.BRICKS]: 'stone',
  [BlockId.OAK_LOG]: 'wood',
  [BlockId.STONE_BRICKS]: 'stone',
  [BlockId.DARK_OAK_LOG]: 'wood',
  [BlockId.DARK_OAK_PLANKS]: 'wood',
  [BlockId.SPRUCE_PLANKS]: 'wood',
  [BlockId.BOOKSHELF]: 'wood',
  [BlockId.CRAFTING_TABLE]: 'wood',
  [BlockId.BARREL]: 'wood',
  [BlockId.FURNACE]: 'stone',
  [BlockId.MOSSY_COBBLESTONE]: 'stone',
  [BlockId.CHISELED_STONE_BRICKS]: 'stone',
  [BlockId.HAY_BLOCK]: 'grass',
}

/** 各材質的腳步聲數量 */
const STEP_SOUND_COUNTS: Record<SoundMaterial, number> = {
  grass: 6,
  stone: 6,
  wood: 6,
  gravel: 4,
  sand: 5,
  snow: 4,
  cloth: 4,
  coral: 6,
  wet_grass: 6,
}

/** 各材質的挖掘聲數量 */
const DIG_SOUND_COUNTS: Record<SoundMaterial, number> = {
  grass: 4,
  stone: 4,
  wood: 4,
  gravel: 4,
  sand: 4,
  snow: 4,
  cloth: 4,
  coral: 4,
  wet_grass: 4,
}

export function getBlockSoundMaterial(blockId: BlockId): SoundMaterial {
  return BLOCK_SOUND_MATERIAL[blockId] ?? 'stone'
}

/**
 * 音效管理器
 *
 * 使用 Web Audio API 播放 Minecraft 風格的方塊音效，
 * 包含腳步聲、挖掘聲與破壞聲。
 * 音效檔案在首次播放時才會載入（lazy loading）並快取。
 */
export function useSoundManager() {
  let audioContext: AudioContext | null = null
  const audioBufferCache = new Map<string, AudioBuffer>()
  const loadingPromises = new Map<string, Promise<AudioBuffer | null>>()

  function getAudioContext(): AudioContext {
    if (!audioContext) {
      audioContext = new AudioContext()
    }
    return audioContext
  }

  async function loadSound(path: string): Promise<AudioBuffer | null> {
    if (audioBufferCache.has(path)) {
      return audioBufferCache.get(path)!
    }

    if (loadingPromises.has(path)) {
      return loadingPromises.get(path)!
    }

    const promise = fetch(path)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => getAudioContext().decodeAudioData(arrayBuffer))
      .then((buffer) => {
        audioBufferCache.set(path, buffer)
        loadingPromises.delete(path)
        return buffer
      })
      .catch(() => {
        loadingPromises.delete(path)
        return null
      })

    loadingPromises.set(path, promise)
    return promise
  }

  function playBuffer(buffer: AudioBuffer, volume: number, pitchVariation: number) {
    const context = getAudioContext()
    const source = context.createBufferSource()
    source.buffer = buffer

    const gainNode = context.createGain()
    gainNode.gain.value = volume

    /** 隨機音高變化，讓音效更自然 */
    source.playbackRate.value = 0.8 + Math.random() * pitchVariation

    source.connect(gainNode)
    gainNode.connect(context.destination)
    source.start(0)
  }

  /** 播放腳步聲 */
  function playStepSound(blockId: BlockId, volume = 0.3) {
    const material = getBlockSoundMaterial(blockId)
    const count = STEP_SOUND_COUNTS[material]
    const index = Math.floor(Math.random() * count) + 1
    const path = `${SOUND_BASE}/step/${material}${index}.ogg`

    loadSound(path).then((buffer) => {
      if (buffer) {
        playBuffer(buffer, volume, 0.4)
      }
    })
  }

  /** 播放挖掘聲（挖掘過程中持續播放） */
  function playDigSound(blockId: BlockId, volume = 0.5) {
    const material = getBlockSoundMaterial(blockId)
    const count = DIG_SOUND_COUNTS[material]
    const index = Math.floor(Math.random() * count) + 1
    const path = `${SOUND_BASE}/dig/${material}${index}.ogg`

    loadSound(path).then((buffer) => {
      if (buffer) {
        playBuffer(buffer, volume, 0.4)
      }
    })
  }

  /** 播放方塊破壞聲（挖掘完成時） */
  function playBreakSound(blockId: BlockId, volume = 0.7) {
    const material = getBlockSoundMaterial(blockId)
    const count = DIG_SOUND_COUNTS[material]
    const index = Math.floor(Math.random() * count) + 1
    const path = `${SOUND_BASE}/dig/${material}${index}.ogg`

    loadSound(path).then((buffer) => {
      if (buffer) {
        playBuffer(buffer, volume * 1.2, 0.3)
      }
    })
  }

  /** 播放放置方塊聲 */
  function playPlaceSound(blockId: BlockId, volume = 0.6) {
    const material = getBlockSoundMaterial(blockId)
    const count = DIG_SOUND_COUNTS[material]
    const index = Math.floor(Math.random() * count) + 1
    const path = `${SOUND_BASE}/dig/${material}${index}.ogg`

    loadSound(path).then((buffer) => {
      if (buffer) {
        playBuffer(buffer, volume, 0.2)
      }
    })
  }

  return {
    playStepSound,
    playDigSound,
    playBreakSound,
    playPlaceSound,
    getBlockSoundMaterial,
  }
}
