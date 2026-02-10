import type {
  AbstractMesh,
  Camera,
  Scene,
} from '@babylonjs/core'
import type { Ref } from 'vue'
import {
  Color3,
  HighlightLayer,
  Mesh,
  Quaternion,
  Vector3,
} from '@babylonjs/core'
import { whenever } from '@vueuse/core'
import { shallowRef } from 'vue'

/** TODO: 將 Mesh 分組，點其中一個 Mesh 時，會選取所有同組的 Mesh */
export function useMeshGrouping() {
  function groupMeshes(meshes: AbstractMesh[]) {

  }
  function ungroupMeshes(mesh: AbstractMesh) {

  }
  return {
    groupMeshes,
    ungroupMeshes,
  }
}
