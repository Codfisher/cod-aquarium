import type { AbstractMesh, Node } from '@babylonjs/core'

export function findTopLevelMesh(mesh: AbstractMesh, list: AbstractMesh[]): AbstractMesh | undefined {
  let current: Node | null = mesh
  while (current) {
    if (list.includes(current as AbstractMesh)) {
      return current as AbstractMesh
    }
    current = current.parent
  }
  return undefined
}

export function getMeshMeta<Meta>(mesh: AbstractMesh) {
  return mesh.metadata as Meta | undefined
}
