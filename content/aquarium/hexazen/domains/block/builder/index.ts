import type {
  Scene,
  ShadowGenerator,
} from '@babylonjs/core'
import type { Hex, HexLayout } from '../../hex-grid'
import type { Block, BlockType } from '../type'
import {
  Color4,
  ImportMeshAsync,
  ParticleSystem,
  PBRMaterial,
  Quaternion,
  Texture,
  TransformNode,
  Vector3,
} from '@babylonjs/core'
import { forEach, pipe } from 'remeda'
import { blockDefinitions } from './data'

export interface CreateBlockParams {
  type: BlockType;
  scene: Scene;
  shadowGenerator?: ShadowGenerator;
  hex: Hex;
  hexLayout: HexLayout;
}

export async function createBlock(
  {
    type,
    scene,
    shadowGenerator,
    hex,
    hexLayout,
  }: CreateBlockParams,
): Promise<Block> {
  const blockDefinition = blockDefinitions[type]

  const resultList = await Promise.all(
    blockDefinition.content.partList.map(async ({ path, position, rotationQuaternion, scaling, metadata }) => {
      const fullPath = `${blockDefinition.content.rootFolderName}/${path}`
      const model = await ImportMeshAsync(
        fullPath,
        scene,
      )

      const rootMesh = model.meshes[0]
      if (rootMesh) {
        rootMesh.name = metadata.name
      }

      model.meshes.forEach((mesh) => {
        if (mesh.material instanceof PBRMaterial) {
          mesh.material.metallic = 0
          mesh.material.roughness = 0.4

          const texture = mesh.material.albedoTexture

          if (texture instanceof Texture) {
            /**
             * 強制使用三線性過濾 (Trilinear Sampling)，這會讓紋理像素的邊緣被柔化「抹平」
             *
             * 否則草皮表面會在旋轉時一直閃爍，超不舒服
             */
            texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE)
          }
        }
      })

      return {
        model,
        position,
        rotationQuaternion,
        scaling,
      }
    }),
  )

  const rootNode = new TransformNode('block-root', scene)

  pipe(
    resultList,
    forEach((result) => {
      const { model, position, rotationQuaternion, scaling } = result
      const [rootMesh] = model.meshes

      if (!rootMesh) {
        return
      }

      rootMesh.receiveShadows = true
      rootMesh.position = new Vector3(...position)
      rootMesh.rotationQuaternion = new Quaternion(...rotationQuaternion)
      rootMesh.scaling = new Vector3(...scaling)
      rootMesh.parent = rootNode

      rootMesh.getChildMeshes().forEach((mesh) => {
        mesh.receiveShadows = true
        shadowGenerator?.addShadowCaster(mesh)
      })
    }),
  )

  rootNode.position.copyFrom(hexLayout.hexToWorld(hex))

  const smoothParticleSystem = pipe(0, () => {
    if (type !== 'c1') {
      return
    }

    const campfireMesh = rootNode.getChildMeshes().find((mesh) => mesh.name === 'campfire')
    if (!campfireMesh || !campfireMesh.position) {
      return
    }
    const position = campfireMesh.position

    const particleSystem = new ParticleSystem('smokeParticles', 2000, scene)
    particleSystem.particleTexture = new Texture('assets/textures/cloud.png', scene)

    particleSystem.emitter = position

    particleSystem.minEmitBox = new Vector3(0, 0, 0)
    particleSystem.maxEmitBox = new Vector3(0, 0, 0)

    particleSystem.color1 = new Color4(0.6, 0.6, 0.6, 0.5)
    particleSystem.colorDead = new Color4(0, 0, 0, 0.0)

    particleSystem.minSize = 0.1
    particleSystem.maxSize = 0.15

    particleSystem.minLifeTime = 3.0
    particleSystem.maxLifeTime = 3.0

    particleSystem.emitRate = 2

    particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD

    particleSystem.gravity = new Vector3(0, 0, 0)
    particleSystem.direction1 = new Vector3(0, 2, 0)
    particleSystem.direction2 = new Vector3(0, 2, 0)

    particleSystem.minEmitPower = 0.2
    particleSystem.maxEmitPower = 0.2
    particleSystem.updateSpeed = 0.01

    particleSystem.start()

    return particleSystem
  })

  function dispose() {
    rootNode.dispose()
    smoothParticleSystem?.dispose()
  }

  return {
    type,
    rootNode,
    hex,
    dispose,
  }
}
