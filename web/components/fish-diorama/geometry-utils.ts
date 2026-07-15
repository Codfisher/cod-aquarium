/** 箱庭共用的程序化幾何工具。 */
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { Scene } from '@babylonjs/core/scene'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'

export interface BeveledBoxOptions {
  width: number;
  height: number;
  depth: number;
  /** 倒角量（每條邊往內切的距離） */
  bevel: number;
}

interface Corner {
  sx: number;
  sy: number;
  sz: number;
  /** 沿 x 邊保留、y/z 內縮的頂點索引 */
  vX: number;
  /** 沿 y 邊保留 */
  vY: number;
  /** 沿 z 邊保留 */
  vZ: number;
}

/** 讓三角繞向符合 Babylon 左手座標系的正面朝外。
 *
 * Babylon 正面繞序為順時針，對應右手外積 cross(e1, e2) 需朝「內」，
 * 因此當外積與朝外的面中心方向同向（> 0）時，代表繞向錯了要翻轉。
 * 凸多面體：面中心相對原點即該面的朝外方向。
 */
function fixTriangleWinding(positionList: number[], indexList: number[]) {
  for (let triangle = 0; triangle < indexList.length; triangle += 3) {
    const a = indexList[triangle] ?? 0
    const b = indexList[triangle + 1] ?? 0
    const c = indexList[triangle + 2] ?? 0

    const ax = positionList[a * 3] ?? 0
    const ay = positionList[a * 3 + 1] ?? 0
    const az = positionList[a * 3 + 2] ?? 0
    const bx = positionList[b * 3] ?? 0
    const by = positionList[b * 3 + 1] ?? 0
    const bz = positionList[b * 3 + 2] ?? 0
    const cx = positionList[c * 3] ?? 0
    const cy = positionList[c * 3 + 1] ?? 0
    const cz = positionList[c * 3 + 2] ?? 0

    const e1x = bx - ax
    const e1y = by - ay
    const e1z = bz - az
    const e2x = cx - ax
    const e2y = cy - ay
    const e2z = cz - az

    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x

    const centerX = (ax + bx + cx) / 3
    const centerY = (ay + by + cy) / 3
    const centerZ = (az + bz + cz) / 3

    if (nx * centerX + ny * centerY + nz * centerZ > 0) {
      indexList[triangle + 1] = c
      indexList[triangle + 2] = b
    }
  }
}

/** 建立切角盒（beveled/chamfer box）：12 條邊各削成 45° 斜面、8 個角削成三角，
 * 消除生硬直角。低多邊、flat shading，質感接近 Kenney 素材。
 */
export function createBeveledBox(
  name: string,
  scene: Scene,
  options: BeveledBoxOptions,
  material: StandardMaterial,
): Mesh {
  const halfWidth = options.width / 2
  const halfHeight = options.height / 2
  const halfDepth = options.depth / 2
  const bevel = Math.min(
    options.bevel,
    halfWidth * 0.9,
    halfHeight * 0.9,
    halfDepth * 0.9,
  )

  const positionList: number[] = []
  const cornerList: Corner[] = []

  // 8 個角，各展開成 3 個沿邊內縮的頂點
  let vertexIndex = 0
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        positionList.push(sx * halfWidth, sy * (halfHeight - bevel), sz * (halfDepth - bevel))
        const vX = vertexIndex++
        positionList.push(sx * (halfWidth - bevel), sy * halfHeight, sz * (halfDepth - bevel))
        const vY = vertexIndex++
        positionList.push(sx * (halfWidth - bevel), sy * (halfHeight - bevel), sz * halfDepth)
        const vZ = vertexIndex++
        cornerList.push({ sx, sy, sz, vX, vY, vZ })
      }
    }
  }

  function corner(sx: number, sy: number, sz: number): Corner {
    return cornerList.find((item) => item.sx === sx && item.sy === sy && item.sz === sz)!
  }

  const indexList: number[] = []
  function addQuad(a: number, b: number, c: number, d: number) {
    indexList.push(a, b, c, a, c, d)
  }
  function addTriangle(a: number, b: number, c: number) {
    indexList.push(a, b, c)
  }

  // 6 個主面（各軸正負）
  for (const sx of [-1, 1]) {
    addQuad(
      corner(sx, -1, -1).vX,
      corner(sx, -1, 1).vX,
      corner(sx, 1, 1).vX,
      corner(sx, 1, -1).vX,
    )
  }
  for (const sy of [-1, 1]) {
    addQuad(
      corner(-1, sy, -1).vY,
      corner(-1, sy, 1).vY,
      corner(1, sy, 1).vY,
      corner(1, sy, -1).vY,
    )
  }
  for (const sz of [-1, 1]) {
    addQuad(
      corner(-1, -1, sz).vZ,
      corner(-1, 1, sz).vZ,
      corner(1, 1, sz).vZ,
      corner(1, -1, sz).vZ,
    )
  }

  // 12 條邊的斜面
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      // 平行 z 的邊
      addQuad(
        corner(sx, sy, -1).vX,
        corner(sx, sy, -1).vY,
        corner(sx, sy, 1).vY,
        corner(sx, sy, 1).vX,
      )
    }
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // 平行 y 的邊
      addQuad(
        corner(sx, -1, sz).vX,
        corner(sx, -1, sz).vZ,
        corner(sx, 1, sz).vZ,
        corner(sx, 1, sz).vX,
      )
    }
  }
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // 平行 x 的邊
      addQuad(
        corner(-1, sy, sz).vY,
        corner(-1, sy, sz).vZ,
        corner(1, sy, sz).vZ,
        corner(1, sy, sz).vY,
      )
    }
  }

  // 8 個角的三角面
  for (const item of cornerList) {
    addTriangle(item.vX, item.vY, item.vZ)
  }

  fixTriangleWinding(positionList, indexList)

  const mesh = new Mesh(name, scene)
  const vertexData = new VertexData()
  const normalList: number[] = []
  VertexData.ComputeNormals(positionList, indexList, normalList)
  vertexData.positions = positionList
  vertexData.indices = indexList
  vertexData.normals = normalList
  vertexData.applyToMesh(mesh)
  mesh.convertToFlatShadedMesh()
  mesh.material = material
  mesh.isPickable = false
  return mesh
}
