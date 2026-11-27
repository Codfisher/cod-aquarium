import type { Scene, UniversalCamera } from '@babylonjs/core'
import type { RealmTransition } from './realm-definition'
import {
  Color3,
  Color4,
  Constants,
  DynamicTexture,
  Effect,
  Mesh,
  ParticleSystem,
  ShaderMaterial,
  Texture,
  Vector3,
  VertexData,
} from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../composables/use-babylon-scene'
import { optOutOfFog } from '../renderer/fog-opt-out'

/**
 * 換場景的轉場：霧從四周湧上蓋滿畫面，換完再散開
 *
 * 分兩層做，缺一不可：
 *
 * 1. 場景的霧。轉場的程度寫進 realmTransitionState，漫遊控制器把它當成邊界白霧的程度
 *    （霧距收到幾格、灰罩蓋住天、雲與粒子淡掉），天氣把霧色往目的地的霧色拉。
 *    世界是「被霧吞掉」的，不是被一張圖蓋住——近的東西最後才消失。
 * 2. 一片蓋滿畫面的霧幕。邊界白霧最濃也還看得到身邊幾格，而換場景時整個世界會被拆掉，
 *    那一下絕不能被看到。霧幕從畫面四周往中間長，蓋滿之後才拆。
 *
 * 霧裡夾帶目的地的粒子（湖是往下落的水珠），音效由主執行緒播（見 render-runtime 的 realm-transition）。
 *
 * 這一份屬於引擎層：整個工作階段只建一次，換場景時不拆
 */

/** 霧蓋滿畫面要幾秒 */
export const TRANSITION_COVER_SECOND = 1.5
/** 換好之後霧散開要幾秒 */
export const TRANSITION_REVEAL_SECOND = 2

/**
 * 粒子與霧幕畫在哪一層
 *
 * 霧幕排在天氣那一層的半透明佇列最後面（雨絲之上）。
 * 粒子得畫在霧幕前面，但 Babylon 在同一層裡是先畫粒子、後畫半透明網格，
 * 所以粒子另外放到最上面那一層
 */
const PARTICLE_RENDERING_GROUP = 3

/**
 * 轉場進行到哪裡
 *
 * 與 activeRealmState 同一種寫法：模組層級的單例，讀的人各自來讀。
 * ratio 是 0（沒有轉場）到 1（霧已蓋滿）；fogColor 是這一刻霧該往哪個顏色收
 */
export const realmTransitionState = {
  ratio: 0,
  fogColor: new Color3(1, 1, 1),
}

const OVERLAY_VERTEX = `
precision highp float;
attribute vec3 position;
varying vec2 vUV;

void main() {
  /** 頂點直接就是裁切座標，不吃任何矩陣，永遠蓋滿整個畫面 */
  vUV = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const OVERLAY_FRAGMENT = `
precision highp float;
varying vec2 vUV;

uniform float coverRatio;
uniform float time;
uniform float aspect;
uniform vec3 fogColor;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 blend = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(hash(cell), hash(cell + vec2(1.0, 0.0)), blend.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), blend.x),
    blend.y
  );
}

float fbm(vec2 point) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int index = 0; index < 4; index++) {
    total += valueNoise(point) * amplitude;
    point *= 2.03;
    amplitude *= 0.5;
  }
  return total;
}

void main() {
  /**
   * 離畫面中心多遠，四個角是一
   *
   * 霧從四周往中間長：前緣是一條往內收的等高線，
   * 再用兩層緩緩飄動的噪音把它啃成一團一團，才像湧上來的霧而不是一個圓圈
   */
  vec2 centered = (vUV - 0.5) * vec2(aspect, 1.0);
  float maxRadius = length(vec2(aspect, 1.0) * 0.5);
  float edge = length(centered) / maxRadius;

  vec2 flow = vec2(time * 0.045, -time * 0.025);
  float billow = fbm(centered * 2.4 + flow);
  float wisp = fbm(centered * 6.5 - flow * 1.8);

  float front = 1.0 - coverRatio * 1.35;
  float density = edge + (billow - 0.5) * 0.6 + (wisp - 0.5) * 0.2;
  float alpha = smoothstep(front - 0.05, front + 0.4, density);

  /** 最後兩成一定蓋滿，世界拆掉的那一下不能從任何縫隙露出來 */
  alpha = max(alpha, smoothstep(0.8, 1.0, coverRatio));
  alpha *= smoothstep(0.0, 0.06, coverRatio);

  vec3 color = fogColor * (0.92 + 0.16 * billow);
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  color += (grain - 0.5) / 255.0;

  gl_FragColor = vec4(color, alpha);
}
`

const OVERLAY_SHADER_NAME = 'minespaceRealmTransition'

function createOverlay(scene: Scene, camera: UniversalCamera): { mesh: Mesh; material: ShaderMaterial } {
  Effect.ShadersStore[`${OVERLAY_SHADER_NAME}VertexShader`] = OVERLAY_VERTEX
  Effect.ShadersStore[`${OVERLAY_SHADER_NAME}FragmentShader`] = OVERLAY_FRAGMENT

  const material = new ShaderMaterial('realm-transition-overlay', scene, OVERLAY_SHADER_NAME, {
    attributes: ['position'],
    uniforms: ['coverRatio', 'time', 'aspect', 'fogColor'],
    needAlphaBlending: true,
  })
  material.backFaceCulling = false
  material.disableDepthWrite = true
  material.depthFunction = Constants.ALWAYS

  const mesh = new Mesh('realm-transition-overlay', scene)
  const vertexData = new VertexData()
  vertexData.positions = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]
  vertexData.indices = [0, 1, 2, 0, 2, 3]
  vertexData.applyToMesh(mesh)
  mesh.material = material
  /**
   * 掛在鏡頭上
   *
   * 頂點不吃矩陣，掛不掛都畫在同一個位置；掛上去是為了排序：
   * 半透明佇列依「離鏡頭多遠」由遠到近畫，放在原點的話它會被當成遠在天邊、第一個畫，
   * 之後的雨絲與水面會蓋在霧幕上面
   */
  mesh.parent = camera
  mesh.alwaysSelectAsActiveMesh = true
  mesh.isPickable = false
  mesh.renderingGroupId = WEATHER_RENDERING_GROUP
  mesh.setEnabled(false)
  optOutOfFog(mesh, '它本身就是霧，只在轉場時出現，轉場結束就整片關掉')

  return { mesh, material }
}

/**
 * 一顆硬邊的方形小點，水珠與細沙共用
 *
 * 與空氣裡的浮塵同一種畫法（見 air-motes）：這個世界連水滴都是看得出邊界的方塊，
 * 柔邊的散景反而突兀。取樣用 NEAREST 保住硬邊
 */
function createDotTexture(scene: Scene): DynamicTexture {
  const size = 4
  const texture = new DynamicTexture('realm-transition-dot', { width: size, height: size }, scene, false, Texture.NEAREST_SAMPLINGMODE)
  const context = texture.getContext()
  context.clearRect(0, 0, size, size)
  context.fillStyle = 'rgba(255, 255, 255, 1)'
  context.fillRect(1, 1, 2, 2)
  texture.update()
  texture.hasAlpha = true
  return texture
}

function createParticleList(scene: Scene, camera: UniversalCamera): ParticleSystem {
  const particleSystem = new ParticleSystem('realm-transition-particle', 900, scene)
  particleSystem.particleTexture = createDotTexture(scene)
  particleSystem.renderingGroupId = PARTICLE_RENDERING_GROUP
  particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD
  optOutOfFog(particleSystem, '只在轉場時跟著鏡頭出現，轉場結束就停掉')

  /** 生在鏡頭周圍幾格的一個箱子裡，往哪邊飄由目的地決定 */
  particleSystem.emitter = camera.position
  particleSystem.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    /** 離鏡頭至少一格半：貼在眼前的那幾顆會大到像一塊色塊 */
    const angle = Math.random() * Math.PI * 2
    const radius = 1.5 + Math.random() * 4.5
    positionToUpdate.set(
      camera.position.x + Math.cos(angle) * radius,
      camera.position.y + (Math.random() * 2 - 1) * 2.5,
      camera.position.z + Math.sin(angle) * radius,
    )
  }
  particleSystem.minSize = 0.025
  particleSystem.maxSize = 0.07
  particleSystem.minLifeTime = 1.4
  particleSystem.maxLifeTime = 2.6
  particleSystem.emitRate = 0
  particleSystem.minEmitPower = 0.2
  particleSystem.maxEmitPower = 0.6
  particleSystem.direction1 = new Vector3(-0.4, -0.2, -0.4)
  particleSystem.direction2 = new Vector3(0.4, 0.2, 0.4)
  particleSystem.updateSpeed = 0.016

  return particleSystem
}

export interface RealmTransitionEffect {
  /** 霧正在湧上、蓋滿或散開的途中 */
  readonly isActive: boolean;
  /** 霧湧上來，蓋滿時 resolve */
  cover: (transition: RealmTransition) => Promise<void>;
  /** 霧散開，散完時 resolve */
  reveal: () => Promise<void>;
  dispose: () => void;
}

interface CreateRealmTransitionParam {
  scene: Scene;
  camera: UniversalCamera;
  /**
   * 日夜給的基準霧色
   *
   * 轉場的霧色是它乘上目的地的倍率：夜裡穿過門，霧是暗的
   */
  getBaseFogColor: () => Color3;
}

type Phase = 'idle' | 'cover' | 'hold' | 'reveal'

export function createRealmTransition({ scene, camera, getBaseFogColor }: CreateRealmTransitionParam): RealmTransitionEffect {
  scene.setRenderingAutoClearDepthStencil(PARTICLE_RENDERING_GROUP, false)

  const { mesh: overlayMesh, material: overlayMaterial } = createOverlay(scene, camera)
  const particleSystem = createParticleList(scene, camera)

  let phase: Phase = 'idle'
  let progress = 0
  let elapsedSecond = 0
  let transition: RealmTransition | null = null
  let resolvePhase: (() => void) | null = null
  const fogColor = new Color3()
  const particleColor = new Color4()

  function finishPhase(): void {
    const resolve = resolvePhase
    resolvePhase = null
    resolve?.()
  }

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (phase === 'idle' || !transition)
      return

    const deltaSecond = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)
    elapsedSecond += deltaSecond

    if (phase === 'cover') {
      progress = Math.min(1, progress + deltaSecond / TRANSITION_COVER_SECOND)
    }
    else if (phase === 'reveal') {
      progress = Math.max(0, progress - deltaSecond / TRANSITION_REVEAL_SECOND)
    }

    /** 進退都走平滑曲線，開頭與結尾才不會像被推了一下 */
    const ratio = progress * progress * (3 - 2 * progress)
    realmTransitionState.ratio = ratio

    const base = getBaseFogColor()
    const [tintR, tintG, tintB] = transition.fogTint
    fogColor.set(
      Math.min(1, base.r * tintR),
      Math.min(1, base.g * tintG),
      Math.min(1, base.b * tintB),
    )
    realmTransitionState.fogColor.copyFrom(fogColor)

    overlayMaterial.setFloat('coverRatio', ratio)
    overlayMaterial.setFloat('time', elapsedSecond)
    overlayMaterial.setFloat('aspect', scene.getEngine().getAspectRatio(camera))
    overlayMaterial.setColor3('fogColor', fogColor)

    /** 粒子跟著霧的亮度走：基準霧色的亮度大約就是這一刻的天光 */
    const brightness = Math.min(1, Math.max(0.2, (base.r + base.g + base.b) / 2.7))
    const [particleR, particleG, particleB] = transition.particleColor
    particleColor.set(particleR * brightness, particleG * brightness, particleB * brightness, 0.85)
    particleSystem.color1.copyFrom(particleColor)
    particleSystem.color2.set(particleColor.r, particleColor.g, particleColor.b, 0.55)
    particleSystem.colorDead.set(particleColor.r, particleColor.g, particleColor.b, 0)
    /** 霧越濃粒子越多，散開時跟著收 */
    particleSystem.emitRate = 420 * ratio

    if (phase === 'cover' && progress >= 1) {
      phase = 'hold'
      finishPhase()
    }
    else if (phase === 'reveal' && progress <= 0) {
      phase = 'idle'
      transition = null
      realmTransitionState.ratio = 0
      overlayMesh.setEnabled(false)
      particleSystem.stop()
      finishPhase()
    }
  })

  return {
    get isActive() {
      return phase !== 'idle'
    },
    cover(nextTransition) {
      transition = nextTransition
      phase = 'cover'
      progress = 0
      elapsedSecond = 0
      overlayMesh.setEnabled(true)

      /** 水珠往下落、細沙往上浮：重力的方向與大小照目的地給的值 */
      particleSystem.gravity.set(0, nextTransition.particleRise * 3, 0)
      particleSystem.reset()
      particleSystem.start()

      return new Promise((resolve) => {
        resolvePhase = resolve
      })
    },
    reveal() {
      if (phase === 'idle')
        return Promise.resolve()

      phase = 'reveal'
      return new Promise((resolve) => {
        resolvePhase = resolve
      })
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      finishPhase()
      realmTransitionState.ratio = 0
      particleSystem.dispose()
      overlayMaterial.dispose()
      overlayMesh.dispose()
    },
  }
}
