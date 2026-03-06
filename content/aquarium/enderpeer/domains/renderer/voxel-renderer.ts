import type { DirectionalLight, Mesh, Scene, ShadowGenerator } from '@babylonjs/core'
import type { BlockTextureDef } from '../block/block-constants'
import {
  Color3,
  Material,
  Matrix,
  MeshBuilder,
  StandardMaterial,
  Texture,
} from '@babylonjs/core'
import { SUN_LIGHT_NAME } from '../../composables/use-babylon-scene'
import {
  BLOCK_DEFS,
  BlockId,
} from '../block/block-constants'
import {
  CHUNK_SIZE,
  CHUNKS_PER_AXIS,
  coordinateToIndex,
  getChunkIndex,
  WORLD_HEIGHT,
  WORLD_SIZE,
  worldToChunkCoordinate,
} from '../world/world-constants'

interface BlockMeshEntry {
  mesh: Mesh;
  material: StandardMaterial;
}

/**
 * 體素渲染器
 *
 * 使用 Babylon.js ThinInstances 批次渲染同類型方塊。
 * 每個區塊 (Chunk) 有自己的一組 ThinInstance 網格，
 * 這樣更新一個方塊時只需重建對應區塊，而非整個世界。
 */
export interface VoxelRenderer {
  /** 根據目前 worldState 重建所有區塊 */
  rebuildInstances: (worldState: Uint8Array) => void;
  /** 重建指定區塊 */
  rebuildChunk: (worldState: Uint8Array, cx: number, cz: number) => void;
  /** 重建指定座標及其鄰近區塊 */
  rebuildAt: (worldState: Uint8Array, x: number, z: number) => void;
  /** 釋放所有資源 */
  dispose: () => void;
}

/**
 * 建立像素風格材質
 */
export function createPixelMaterial(
  name: string,
  texturePath: string,
  scene: Scene,
  tint?: [number, number, number],
): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  const texture = new Texture(texturePath, scene, {
    samplingMode: Texture.NEAREST_SAMPLINGMODE,
  })
  material.diffuseTexture = texture
  material.specularColor = new Color3(0.1, 0.1, 0.1)
  material.backFaceCulling = false

  if (tint) {
    material.diffuseColor = new Color3(tint[0], tint[1], tint[2])
  }

  return material
}

function needsPerFaceRendering(textureDef: BlockTextureDef): boolean {
  return !textureDef.all && !!(textureDef.top || textureDef.side || textureDef.bottom)
}

/**
 * 區塊渲染器：管理單一 16x16x64 區域的 ThinInstances
 */
class ChunkRenderer {
  private allEntries = new Map<string, BlockMeshEntry>()
  private perFaceBlocks = new Set<BlockId>()

  constructor(
    private scene: Scene,
    private cx: number,
    private cz: number,
    shadowGenerator: ShadowGenerator | null,
  ) {
    const blockIds = Object.values(BlockId).filter((v) => typeof v === 'number') as BlockId[]

    for (const blockId of blockIds) {
      const blockDef = BLOCK_DEFS[blockId]
      if (blockDef.isHidden || !blockDef.textures)
        continue

      const textureDef = blockDef.textures

      if (needsPerFaceRendering(textureDef)) {
        this.perFaceBlocks.add(blockId)
        this.initPerFaceMeshes(blockId, textureDef)
      }
      else {
        this.initSingleMaterialMesh(blockId, blockDef, textureDef)
      }
    }

    if (shadowGenerator) {
      for (const { mesh } of this.allEntries.values()) {
        mesh.receiveShadows = true
        shadowGenerator.addShadowCaster(mesh)
      }
    }
  }

  private initPerFaceMeshes(blockId: BlockId, textureDef: BlockTextureDef) {
    const prefix = `chunk_${this.cx}_${this.cz}_block_${blockId}`

    const addFace = (name: string, tex: string, rotX: number, rotY: number, posOffset: { x: number; y: number; z: number }, tint?: [number, number, number]) => {
      const mat = createPixelMaterial(`${prefix}_${name}_mat`, tex, this.scene, tint)
      const mesh = MeshBuilder.CreatePlane(`${prefix}_${name}`, { size: 1 }, this.scene)
      mesh.rotation.x = rotX
      mesh.rotation.y = rotY
      mesh.position.set(posOffset.x, posOffset.y, posOffset.z)
      mesh.bakeCurrentTransformIntoVertices()
      mesh.material = mat
      mesh.isVisible = false
      this.allEntries.set(`${blockId}_${name}`, { mesh, material: mat })
    }

    addFace('top', textureDef.top ?? textureDef.side ?? '', Math.PI / 2, 0, { x: 0, y: 0.5, z: 0 }, textureDef.topTint)
    addFace('bottom', textureDef.bottom ?? textureDef.side ?? '', -Math.PI / 2, 0, { x: 0, y: -0.5, z: 0 })
    addFace('front', textureDef.side ?? '', 0, 0, { x: 0, y: 0, z: 0.5 })
    addFace('back', textureDef.side ?? '', 0, Math.PI, { x: 0, y: 0, z: -0.5 })
    addFace('left', textureDef.side ?? '', 0, -Math.PI / 2, { x: -0.5, y: 0, z: 0 })
    addFace('right', textureDef.side ?? '', 0, Math.PI / 2, { x: 0.5, y: 0, z: 0 })
  }

  private initSingleMaterialMesh(blockId: BlockId, blockDef: any, textureDef: BlockTextureDef) {
    const name = `chunk_${this.cx}_${this.cz}_block_${blockId}`
    const mat = createPixelMaterial(`${name}_mat`, textureDef.all ?? '', this.scene, textureDef.tint)

    if (blockDef.alpha !== undefined && blockDef.alpha < 1) {
      mat.alpha = blockDef.alpha
      mat.transparencyMode = Material.MATERIAL_ALPHABLEND
      mat.backFaceCulling = true
      mat.needDepthPrePass = true
    }

    const mesh = MeshBuilder.CreateBox(name, { size: 1 }, this.scene)
    mesh.material = mat
    mesh.isVisible = false
    this.allEntries.set(`${blockId}`, { mesh, material: mat })
  }

  rebuild(state: Uint8Array): void {
    const matricesMap = new Map<string, number[]>()
    for (const key of this.allEntries.keys()) {
      matricesMap.set(key, [])
    }

    const startX = this.cx * CHUNK_SIZE
    const startZ = this.cz * CHUNK_SIZE

    // 預先建立一個 Matrix 物件供重複使用，減少 GC
    const reusableMatrix = new Matrix()

    for (let x = startX; x < startX + CHUNK_SIZE; x++) {
      for (let z = startZ; z < startZ + CHUNK_SIZE; z++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const index = coordinateToIndex(x, y, z)
          const blockId = state[index] as BlockId
          if (blockId === BlockId.AIR)
            continue

          const blockDef = BLOCK_DEFS[blockId]
          const isTransparent = (blockDef.alpha !== undefined && blockDef.alpha < 1) || blockId === BlockId.GLASS

          // 隱藏面剔除 (Culling): 檢查 6 個鄰居
          // 如果鄰居是不透明方塊，則不需要渲染該面
          const checkFace = (nx: number, ny: number, nz: number) => {
            if (nx < 0 || nx >= WORLD_SIZE || nz < 0 || nz >= WORLD_SIZE || ny < 0 || ny >= WORLD_HEIGHT) {
              return true // 邊界外視為可見
            }
            const nIndex = coordinateToIndex(nx, ny, nz)
            const nBlockId = state[nIndex] as BlockId
            if (nBlockId === BlockId.AIR)
              return true

            const nBlockDef = BLOCK_DEFS[nBlockId]
            const nIsTransparent = (nBlockDef.alpha !== undefined && nBlockDef.alpha < 1) || nBlockId === BlockId.GLASS

            // 如果自己透明，鄰居也透明，且是同一種透明方塊，通常可以剔除內面（視需求）
            // 但最基本的是：如果不透明鄰居擋住了，就不用畫
            return nIsTransparent && !isTransparent ? true : nIsTransparent
          }

          const hasTop = checkFace(x, y + 1, z)
          const hasBottom = checkFace(x, y - 1, z)
          const hasFront = checkFace(x, y, z + 1)
          const hasBack = checkFace(x, y, z - 1)
          const hasLeft = checkFace(x - 1, y, z)
          const hasRight = checkFace(x + 1, y, z)

          // 如果 6 個面都被擋住了，整個方塊都不用畫
          if (!hasTop && !hasBottom && !hasFront && !hasBack && !hasLeft && !hasRight)
            continue

          // 更新矩陣並存入
          Matrix.TranslationToRef(x, y, z, reusableMatrix)
          const matrixArray = reusableMatrix.toArray()

          if (this.perFaceBlocks.has(blockId)) {
            if (hasTop)
              matricesMap.get(`${blockId}_top`)?.push(...matrixArray)
            if (hasBottom)
              matricesMap.get(`${blockId}_bottom`)?.push(...matrixArray)
            if (hasFront)
              matricesMap.get(`${blockId}_front`)?.push(...matrixArray)
            if (hasBack)
              matricesMap.get(`${blockId}_back`)?.push(...matrixArray)
            if (hasLeft)
              matricesMap.get(`${blockId}_left`)?.push(...matrixArray)
            if (hasRight)
              matricesMap.get(`${blockId}_right`)?.push(...matrixArray)
          }
          else {
            matricesMap.get(`${blockId}`)?.push(...matrixArray)
          }
        }
      }
    }

    for (const [key, entry] of this.allEntries.entries()) {
      const matrices = matricesMap.get(key)
      if (!matrices || matrices.length === 0) {
        entry.mesh.isVisible = false
        entry.mesh.thinInstanceSetBuffer('matrix', new Float32Array(0), 16, false)
        continue
      }

      entry.mesh.isVisible = true
      entry.mesh.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16, false)
    }
  }

  dispose(): void {
    for (const { mesh, material } of this.allEntries.values()) {
      mesh.dispose()
      material.dispose()
    }
    this.allEntries.clear()
  }
}

export function createVoxelRenderer(scene: Scene, worldState: Uint8Array): VoxelRenderer {
  const sunLight = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
  const shadowGenerator = sunLight?.getShadowGenerator() as ShadowGenerator | null

  const chunks: ChunkRenderer[] = []

  for (let cx = 0; cx < CHUNKS_PER_AXIS; cx++) {
    for (let cz = 0; cz < CHUNKS_PER_AXIS; cz++) {
      chunks.push(new ChunkRenderer(scene, cx, cz, shadowGenerator))
    }
  }

  function rebuildInstances(state: Uint8Array): void {
    for (const chunk of chunks) {
      chunk.rebuild(state)
    }
  }

  function rebuildChunk(state: Uint8Array, cx: number, cz: number): void {
    const idx = getChunkIndex(cx, cz)
    if (chunks[idx]) {
      chunks[idx].rebuild(state)
    }
  }

  function rebuildAt(state: Uint8Array, x: number, z: number): void {
    const cx = worldToChunkCoordinate(x)
    const cz = worldToChunkCoordinate(z)
    rebuildChunk(state, cx, cz)

    // 檢查是否位於區塊邊界，若是則需要重建鄰近區塊以正確計算隱藏面
    const lx = x % CHUNK_SIZE
    const lz = z % CHUNK_SIZE

    if (lx === 0 && cx > 0)
      rebuildChunk(state, cx - 1, cz)
    if (lx === CHUNK_SIZE - 1 && cx < CHUNKS_PER_AXIS - 1)
      rebuildChunk(state, cx + 1, cz)
    if (lz === 0 && cz > 0)
      rebuildChunk(state, cx, cz - 1)
    if (lz === CHUNK_SIZE - 1 && cz < CHUNKS_PER_AXIS - 1)
      rebuildChunk(state, cx, cz + 1)
  }

  /** 初次渲染 */
  rebuildInstances(worldState)

  function dispose(): void {
    for (const chunk of chunks) {
      chunk.dispose()
    }
    chunks.length = 0
  }

  return {
    rebuildInstances,
    rebuildChunk,
    rebuildAt,
    dispose,
  }
}
