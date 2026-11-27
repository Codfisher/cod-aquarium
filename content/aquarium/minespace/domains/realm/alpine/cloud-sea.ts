import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Color3, Effect, MeshBuilder, ShaderMaterial, Vector2 } from '@babylonjs/core'
import { optOutOfFog } from '../../renderer/fog-opt-out'

/**
 * 雪稜腳下的雲海
 *
 * 體積雲的雲底最低只到七十格（見 active-realm 的 getRealmCloudBaseHeight），世界才四十格高，
 * 「雲在腳下」只能另外畫。這裡是一整片鋪到地平線的雲面：
 * 斷崖插進去、遠山的山腳埋在裡面，雲面以下那一層方塊都是不畫的 LAKE_BED，有它蓋著就看不到切口。
 *
 * 雲面不是平的一片白：幾層慢慢飄的雜訊做出一團一團的起伏，
 * 朝太陽那一側亮、背光那一側帶著天光的藍，遠處往地平線色混，
 * 最遠那一圈與天邊接成一條線。顏色跟著日夜走，夜裡是暗藍的一片。
 *
 * 一次繪製，著色器只有幾次二維雜訊，佔畫面一大半時也很便宜。
 * 屬於世界層：換場景時跟著布景一起拆
 */

/** 雲面往外鋪多遠（從中心量），與世界外的水面同一個範圍，蓋過最遠那圈山的山腳 */
const CLOUD_SEA_EXTENT = 1200

/** 雲團飄的速度（格／秒），跟著風往東南走 */
const DRIFT_SPEED = new Vector2(0.9, 0.5)

/** 雲的反照率：比雪暗一點，雪面與雲面一眼分得出來 */
const CLOUD_ALBEDO = 0.78
/** 雲的光：天光是主體，直射光補亮面；與遠山同一套算法，只是直射光多一點 */
const CLOUD_AMBIENT_WEIGHT = 0.9
const CLOUD_SUN_WEIGHT = 0.55

/** 與遠山同一層：天空那一層的不透明佇列，地形的深度已經寫好 */
const CLOUD_SEA_RENDERING_GROUP = 1

const SHADER_NAME = 'minespaceCloudSea'

const VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec3 vWorld;

void main() {
  vec4 worldPosition = world * vec4(position, 1.0);
  vWorld = worldPosition.xyz;
  gl_Position = viewProjection * worldPosition;
}
`

const FRAGMENT = `
precision highp float;
varying vec3 vWorld;

uniform vec3 cameraPosition;
uniform vec2 drift;
/** 由中心指向太陽的水平方向，亮面朝它 */
uniform vec2 sunFlat;
uniform vec3 litColor;
uniform vec3 shadeColor;
uniform vec3 horizonColor;
uniform float veilRatio;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 blend = local * local * (3.0 - 2.0 * local);
  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

/**
 * 三層雜訊：大團、中團、邊上的細碎
 *
 * detail 是細碎那兩層的份量：遠處一格畫素蓋好幾團雲，細的那層只會變成閃爍的斜紋，要收掉
 */
float cloudField(vec2 point, float detail) {
  float value = valueNoise(point) * 0.55;
  value += valueNoise(point * 2.3 + 17.0) * 0.3 * detail;
  value += valueNoise(point * 5.1 - 9.0) * 0.15 * detail;
  return value + (1.0 - detail) * 0.225;
}

void main() {
  float distance = length(vWorld.xz - cameraPosition.xz);
  float detail = 1.0 - smoothstep(120.0, 520.0, distance);

  /** 先用一層低頻雜訊把座標推歪：雲團才是一坨一坨翻滾的，不是一格一格排好的 */
  vec2 point = (vWorld.xz + drift) * 0.012;
  vec2 warp = vec2(valueNoise(point * 0.45 + 3.1), valueNoise(point * 0.45 - 7.3)) - 0.5;
  point += warp * 1.4;
  float field = cloudField(point, detail);
  /**
   * 假的打光：往太陽那一側挪一點再取一次，比較兩次的高低。
   * 朝太陽升起的那一面亮，背面帶天光的藍；雲團之間的凹處暗一點。
   * 對比給太強會變成一條一條發亮的金屬紋，雲頂要是軟的
   */
  float toward = cloudField(point + sunFlat * 0.3, detail);
  float lit = clamp(0.68 + (field - toward) * 1.8 + (field - 0.5) * 0.5, 0.0, 1.0);
  vec3 color = mix(shadeColor, litColor, lit) * mix(0.9, 1.0, smoothstep(0.25, 0.62, field));

  /** 越遠越淡進地平線色；最遠那一圈全是地平線色，與天邊接成一條線 */
  float haze = pow(smoothstep(40.0, 1100.0, distance), 0.65);
  haze = max(haze, veilRatio);
  gl_FragColor = vec4(mix(color, horizonColor, haze), 1.0);
}
`

export interface CloudSea {
  dispose: () => void;
}

interface CreateCloudSeaParam {
  scene: Scene;
  centerX: number;
  centerZ: number;
  surfaceY: number;
  atmosphere: AtmosphereState;
}

export function createCloudSea({ scene, centerX, centerZ, surfaceY, atmosphere }: CreateCloudSeaParam): CloudSea {
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT

  const material = new ShaderMaterial('backdrop-cloud-sea', scene, SHADER_NAME, {
    attributes: ['position'],
    uniforms: ['world', 'viewProjection', 'cameraPosition', 'drift', 'sunFlat', 'litColor', 'shadeColor', 'horizonColor', 'veilRatio'],
  })
  /** 掉到雲面底下時（照理走不到）也看得到它，不會整片穿幫 */
  material.backFaceCulling = false

  const size = CLOUD_SEA_EXTENT * 2
  const mesh = MeshBuilder.CreateGround('backdrop-cloud-sea', { width: size, height: size }, scene)
  mesh.position.set(centerX, surfaceY, centerZ)
  mesh.material = material
  mesh.isPickable = false
  mesh.renderingGroupId = CLOUD_SEA_RENDERING_GROUP
  mesh.alwaysSelectAsActiveMesh = true
  optOutOfFog(mesh, '只在雪稜出現，沒有邊界白霧要收；自己往地平線色混，轉場時由 veilRatio 與霧幕蓋住')

  const drift = new Vector2()
  const sunFlat = new Vector2(1, 0)
  const litColor = new Color3()
  const shadeColor = new Color3()

  const observer = scene.onBeforeRenderObservable.add(() => {
    const deltaSecond = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)
    drift.x += DRIFT_SPEED.x * deltaSecond
    drift.y += DRIFT_SPEED.y * deltaSecond

    const ambient = atmosphere.ambientIntensity * atmosphere.ambientRatio * CLOUD_AMBIENT_WEIGHT
    const sun = atmosphere.lightIntensity * atmosphere.lightRatio * CLOUD_SUN_WEIGHT
    litColor.set(
      CLOUD_ALBEDO * (atmosphere.ambientSkyColor.r * ambient + atmosphere.lightColor.r * sun),
      CLOUD_ALBEDO * (atmosphere.ambientSkyColor.g * ambient + atmosphere.lightColor.g * sun),
      CLOUD_ALBEDO * (atmosphere.ambientSkyColor.b * ambient + atmosphere.lightColor.b * sun),
    )
    /** 背光面只有天光，帶著天的藍 */
    shadeColor.set(
      CLOUD_ALBEDO * atmosphere.ambientSkyColor.r * ambient * 0.82,
      CLOUD_ALBEDO * atmosphere.ambientSkyColor.g * ambient * 0.86,
      CLOUD_ALBEDO * atmosphere.ambientSkyColor.b * ambient * 0.95,
    )
    const sunLength = Math.hypot(atmosphere.sunDirection.x, atmosphere.sunDirection.z)
    if (sunLength > 0.001) {
      sunFlat.set(atmosphere.sunDirection.x / sunLength, atmosphere.sunDirection.z / sunLength)
    }

    material.setVector3('cameraPosition', scene.activeCamera?.globalPosition ?? mesh.position)
    material.setVector2('drift', drift)
    material.setVector2('sunFlat', sunFlat)
    material.setColor3('litColor', litColor)
    material.setColor3('shadeColor', shadeColor)
    material.setColor3('horizonColor', atmosphere.fogColor)
    /** 與遠山同一個係數：轉場的霧還沒蓋滿之前雲海就先化進霧色 */
    material.setFloat('veilRatio', Math.min(1, atmosphere.edgeRatio * 1.6))
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      mesh.dispose()
      material.dispose(false, true)
    },
  }
}
