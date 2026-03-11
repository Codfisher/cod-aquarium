import type { MaybeRefOrGetter } from 'vue'
import { Color3, Color4, Engine, FreeCamera, HemisphericLight, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core'
import { useElementSize } from '@vueuse/core'
import { onBeforeUnmount, onMounted, reactive, toValue, watch } from 'vue'

export function useBabylonSimple(
  canvasRef: MaybeRefOrGetter<HTMLCanvasElement | null>,
  options: { hue: number } = { hue: 0 },
) {
  let engine: Engine | null = null
  let scene: Scene | null = null

  onMounted(() => {
    const canvas = toValue(canvasRef)
    if (!canvas)
      return

    engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
    scene = new Scene(engine)
    scene.clearColor = new Color4(0, 0, 0, 0)

    const camera = new FreeCamera('camera1', new Vector3(0, 0, -5), scene)
    camera.setTarget(Vector3.Zero())

    const light = new HemisphericLight('light1', new Vector3(0, 1, 0), scene)
    light.intensity = 1

    const box = MeshBuilder.CreateBox('box', { size: 1.5 }, scene)
    const mat = new StandardMaterial('mat', scene)
    mat.diffuseColor = Color3.FromHSV(options.hue, 1, 1)
    box.material = mat

    scene.onBeforeRenderObservable.add(() => {
      box.rotation.y += 0.01
      box.rotation.x += 0.005
    })

    engine.runRenderLoop(() => {
      scene?.render()
    })
  })

  onBeforeUnmount(() => {
    scene?.dispose()
    scene = null
    engine?.dispose()
    engine = null
  })

  const canvasSize = reactive(useElementSize(canvasRef))
  watch(canvasSize, () => {
    engine?.resize()
  })

  return {
    engine,
    scene,
  }
}
