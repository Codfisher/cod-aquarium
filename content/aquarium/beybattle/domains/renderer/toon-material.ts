import {
  Color3,
  Constants,
  Effect,
  ShaderMaterial,
  Vector3,
} from '@babylonjs/core'
import type { Scene } from '@babylonjs/core'

const TOON_VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 worldViewProjection;
uniform mat4 world;

varying vec3 vNormalW;

void main() {
  vNormalW = normalize((world * vec4(normal, 0.0)).xyz);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

const TOON_FRAGMENT_SHADER = `
precision highp float;

uniform vec3 diffuseColor;
uniform vec3 lightDirection;
uniform vec3 ambientColor;
uniform float opacity;

varying vec3 vNormalW;

void main() {
  vec3 normal = normalize(vNormalW);
  vec3 lightDir = normalize(lightDirection);

  float ndotl = dot(normal, lightDir);

  float intensity;
  if (ndotl > 0.6) {
    intensity = 1.0;
  } else if (ndotl > 0.2) {
    intensity = 0.7;
  } else {
    intensity = 0.45;
  }

  vec3 finalColor = diffuseColor * intensity + ambientColor * 0.15;
  gl_FragColor = vec4(finalColor, opacity);
}
`

let shaderRegistered = false

function registerToonShader() {
  if (shaderRegistered) return
  shaderRegistered = true

  Effect.ShadersStore['toonVertexShader'] = TOON_VERTEX_SHADER
  Effect.ShadersStore['toonFragmentShader'] = TOON_FRAGMENT_SHADER
}

export function createToonMaterial(
  name: string,
  color: Color3,
  scene: Scene,
): ShaderMaterial {
  registerToonShader()

  const material = new ShaderMaterial(name, scene, {
    vertex: 'toon',
    fragment: 'toon',
  }, {
    attributes: ['position', 'normal'],
    uniforms: [
      'worldViewProjection',
      'world',
      'diffuseColor',
      'lightDirection',
      'ambientColor',
      'opacity',
    ],
    needAlphaBlending: true,
  })

  material.setColor3('diffuseColor', color)
  material.setVector3('lightDirection', new Vector3(0.5, 1.0, 0.3))
  material.setColor3('ambientColor', new Color3(0.3, 0.3, 0.4))
  material.setFloat('opacity', 1.0)
  material.backFaceCulling = true
  material.alphaMode = Constants.ALPHA_COMBINE

  return material
}

/** 設定 toon material 的透明度 */
export function setToonOpacity(material: ShaderMaterial, value: number) {
  material.setFloat('opacity', value)
}
