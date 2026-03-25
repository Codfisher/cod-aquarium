import type { AssetContainer, Mesh, Scene, ShadowGenerator } from '@babylonjs/core'
import {
  Color3,
  LoadAssetContainerAsync,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core'

const TILE_INDEX_MAP: Record<number, string> = {
  0: 'decoration-empty.glb',
  1: 'decoration-forest.glb',
  2: 'decoration-tents.glb',
  3: 'track-corner.glb',
  4: 'track-finish.glb',
  5: 'track-bump.glb',
  6: 'track-straight.glb',
}

/**
 * 從賽道連接需求反推的正確旋轉映射
 */
const ORIENTATION_TO_ROTATION_Y: Record<number, number> = {
  0: 0,
  10: Math.PI,
  16: Math.PI / 2,
  22: -Math.PI / 2,
}

const GRID_MAP_CELL_SIZE = 9.99
const GRID_MAP_SCALE = 0.75
const GRID_MAP_Y_OFFSET = -0.5
const MODEL_PATH = '/assets/kenny-Starter-Kit-Racing-godot-4.6/models/'

/** 有碰撞的 tile（賽道磚塊 + 有實體的裝飾物） */
const PHYSICS_TILE_INDEX_SET = new Set([1, 2, 3, 4, 5, 6])

function toSigned16(value: number): number {
  return value > 32767 ? value - 65536 : value
}

interface GridCell {
  gridX: number;
  gridZ: number;
  tileIndex: number;
  rotationY: number;
  worldX: number;
  worldZ: number;
}

function decodeGridMapData(packedData: number[]): GridCell[] {
  const cellList: GridCell[] = []
  for (let i = 0; i < packedData.length; i += 3) {
    const xRaw = packedData[i]!
    const zRaw = packedData[i + 1]!
    const data = packedData[i + 2]!
    const gridX = toSigned16(xRaw)
    const gridZ = toSigned16(zRaw)
    const tileIndex = data & 0xFFFF
    const orientation = (data >> 16) & 0x1F
    cellList.push({
      gridX,
      gridZ,
      tileIndex,
      rotationY: ORIENTATION_TO_ROTATION_Y[orientation] ?? 0,
      worldX: gridX * GRID_MAP_CELL_SIZE * GRID_MAP_SCALE,
      worldZ: gridZ * GRID_MAP_CELL_SIZE * GRID_MAP_SCALE,
    })
  }
  return cellList
}

// eslint-disable-next-line @stylistic/comma-spacing
const GRID_MAP_RAW_DATA = [65533,0,0,65533,1,1441793,65533,2,1048577,1,65535,655361,1,0,655361,1,1,655361,1,2,0,1,3,655361,0,3,0,65535,3,655361,65534,3,655361,65533,3,655361,65532,65534,655362,65532,65535,0,65532,65532,655361,65532,65533,1048577,65533,65532,655361,65534,65532,655361,65535,65532,1441794,0,65532,655361,1,65532,655361,1,65533,655361,1,65534,655361,65532,0,1048577,65532,1,1048577,65532,2,1048576,65532,3,0,65532,4,655361,65533,4,0,65534,4,655361,65535,4,655361,0,4,655361,1,4,655361,2,4,655361,2,3,655361,2,2,655361,2,1,655361,2,0,655361,2,65535,655361,2,65534,0,2,65533,655361,2,65532,655361,2,65531,655361,1,65531,655361,0,65531,655361,0,65530,0,65535,65530,655361,65535,65531,655361,65534,65531,655361,65533,65531,0,65532,65531,655361,65532,65530,0,65533,65530,0,65534,65530,0,1,65530,655361,2,65530,655361,65531,4,655361,65531,3,0,65531,2,1048576,65531,1,1048576,65531,0,1048577,65531,65535,1048576,65531,65534,655361,65531,65533,1048576,65531,65532,0,65531,65531,655361,65531,65530,655361,65530,65530,0,65530,65531,655361,65530,65532,0,65530,65533,1048576,65530,65534,1048576,65530,65535,1048576,65530,0,655361,65530,1,655361,65530,2,655361,65530,3,655361,65530,4,655361,65530,65529,655361,65531,65529,655361,65532,65529,0,65533,65529,0,65534,65529,655361,65535,65529,655361,0,65529,655361,1,65529,655361,2,65529,655361,2,65528,655361,1,65528,655361,0,65528,655361,65535,65528,655361,65534,65528,655361,65533,65528,655361,65532,65528,655361,65531,65528,655361,65530,65528,655361,65529,65528,655361,65529,65529,655361,65529,65530,655361,65529,65531,655361,65529,65532,655361,65529,65533,655361,65529,65534,655361,65529,65535,655361,65529,0,655361,65529,1,655361,65529,2,655361,65529,3,655361,65529,4,655361,65528,4,655361,65528,3,655361,65528,2,655361,65528,1,655361,65528,0,655361,65528,65535,655361,65528,65534,655361,65528,65533,655361,65528,65532,655361,65528,65531,655361,65528,65530,655361,65528,65529,655361,65528,65528,655361,65528,65527,655361,65529,65527,655361,65530,65527,655361,65531,65527,655361,65532,65527,655361,65533,65527,655361,65534,65527,655361,65535,65527,655361,0,65527,655361,1,65527,655361,2,65527,655361,65535,65535,1441793,65535,65534,1441793,65534,65534,1441793,65535,1,1441794,65535,0,1441793,0,0,4,0,65535,6,65534,0,655366,65534,1,655366,65533,65534,6,65534,65533,1441798,65535,65533,1441798,0,65534,6,65535,2,1048582,65533,65533,1048579,65533,65535,655363,65534,65535,3,0,65533,3,0,2,1441795,65534,2,655363,0,1,6]

export function useTrackBuilder() {
  async function buildTrack(
    scene: Scene,
    shadowGenerator: ShadowGenerator,
  ): Promise<{
      trackMeshList: Mesh[];
      spawnPosition: Vector3;
      spawnRotation: number;
    }> {
    const cellList = decodeGridMapData(GRID_MAP_RAW_DATA)
    const trackMeshList: Mesh[] = []

    const uniqueTileIndexSet = new Set(cellList.map((c) => c.tileIndex))
    const containerMap = new Map<number, AssetContainer>()

    console.group('[TrackBuilder] 載入 tile 模型')
    for (const tileIndex of uniqueTileIndexSet) {
      const fileName = TILE_INDEX_MAP[tileIndex]
      if (!fileName) continue
      try {
        const container = await LoadAssetContainerAsync(`${MODEL_PATH}${fileName}`, scene)
        containerMap.set(tileIndex, container)
        console.log(`  ✓ tile ${tileIndex} (${fileName})`)
      }
      catch (error) {
        console.error(`  ✗ tile ${tileIndex} (${fileName}):`, error)
      }
    }
    console.groupEnd()

    let placedCount = 0
    let physicsBodyCount = 0
    let physicsErrorCount = 0

    for (const cell of cellList) {
      const assetContainer = containerMap.get(cell.tileIndex)
      if (!assetContainer) continue

      const instance = assetContainer.instantiateModelsToScene(
        (name) => `${name}_${cell.gridX}_${cell.gridZ}`,
      )

      const root = instance.rootNodes[0]
      if (!root) continue

      const wrapper = new TransformNode(`cell_${cell.gridX}_${cell.gridZ}`, scene)
      wrapper.position.set(cell.worldX, GRID_MAP_Y_OFFSET, cell.worldZ)
      wrapper.rotation.set(0, cell.rotationY, 0)
      wrapper.scaling.setAll(GRID_MAP_SCALE)

      root.parent = wrapper

      const meshList = wrapper.getChildMeshes()
      for (const mesh of meshList) {
        mesh.receiveShadows = true
        if (mesh.getTotalVertices() > 0) {
          shadowGenerator.addShadowCaster(mesh)

          // 為有實體的 tile 加入 Havok 物理碰撞體（靜態，mass=0）
          if (PHYSICS_TILE_INDEX_SET.has(cell.tileIndex)) {
            try {
              // eslint-disable-next-line no-new
              new PhysicsAggregate(
                mesh,
                PhysicsShapeType.MESH,
                { mass: 0, friction: 0.0, restitution: 0.1 },
                scene,
              )
              physicsBodyCount++
            }
            catch (error) {
              physicsErrorCount++
              if (physicsErrorCount <= 3) {
                console.warn(`[TrackBuilder] 物理碰撞建立失敗: cell(${cell.gridX},${cell.gridZ}) mesh=${mesh.name}`, error)
              }
            }
          }
        }
      }

      placedCount++
    }

    console.log(`[TrackBuilder] 放置完成: ${placedCount} tile, ${physicsBodyCount} 物理碰撞體, ${physicsErrorCount} 失敗`)

    // 碰撞用的隱形地面（對應 Godot 的 CSGBox3D transparency=1）
    // 頂面在 y=0，與 Godot 碰撞平面一致
    const collisionGround = MeshBuilder.CreateBox('collisionGround', { width: 200, height: 1, depth: 200 }, scene)
    collisionGround.position.y = -0.5
    collisionGround.isVisible = false
    // eslint-disable-next-line no-new
    new PhysicsAggregate(collisionGround, PhysicsShapeType.BOX, { mass: 0, friction: 5.0 }, scene)

    // 可見的綠色地面（在磚塊下方，不遮擋賽道）
    const visibleGround = MeshBuilder.CreateGround('visibleGround', { width: 200, height: 200 }, scene)
    visibleGround.position.y = -0.55
    const groundMat = new StandardMaterial('groundMat', scene)
    groundMat.diffuseColor = new Color3(0.45, 0.65, 0.35)
    groundMat.specularColor = new Color3(0.05, 0.05, 0.05)
    visibleGround.material = groundMat
    visibleGround.receiveShadows = true
    trackMeshList.push(visibleGround)

    console.log('[TrackBuilder] 地面物理建立完成', {
      position: collisionGround.position.toString(),
      size: '200x1x200',
      topSurfaceY: 0,
    })

    return {
      trackMeshList,
      spawnPosition: new Vector3(0, 0, 0),
      spawnRotation: 0,
    }
  }

  return { buildTrack }
}
