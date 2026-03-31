import {
  Effect,
  PostProcess,
} from '@babylonjs/core'
import type { Camera, Scene } from '@babylonjs/core'

const OUTLINE_FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform vec2 screenSize;
uniform float edgeWidth;
uniform vec3 edgeColor;

void main() {
  vec2 texelSize = edgeWidth / screenSize;

  // Sobel filter on depth
  float d00 = texture2D(depthSampler, vUV + vec2(-texelSize.x, -texelSize.y)).r;
  float d10 = texture2D(depthSampler, vUV + vec2(0.0, -texelSize.y)).r;
  float d20 = texture2D(depthSampler, vUV + vec2(texelSize.x, -texelSize.y)).r;
  float d01 = texture2D(depthSampler, vUV + vec2(-texelSize.x, 0.0)).r;
  float d21 = texture2D(depthSampler, vUV + vec2(texelSize.x, 0.0)).r;
  float d02 = texture2D(depthSampler, vUV + vec2(-texelSize.x, texelSize.y)).r;
  float d12 = texture2D(depthSampler, vUV + vec2(0.0, texelSize.y)).r;
  float d22 = texture2D(depthSampler, vUV + vec2(texelSize.x, texelSize.y)).r;

  float sobelX = d00 + 2.0 * d01 + d02 - d20 - 2.0 * d21 - d22;
  float sobelY = d00 + 2.0 * d10 + d20 - d02 - 2.0 * d12 - d22;
  float edge = sqrt(sobelX * sobelX + sobelY * sobelY);

  // 增強邊緣對比
  edge = smoothstep(0.001, 0.005, edge);

  vec4 color = texture2D(textureSampler, vUV);
  vec3 finalColor = mix(color.rgb, edgeColor, edge * 0.8);
  gl_FragColor = vec4(finalColor, color.a);
}
`

let shaderRegistered = false

function registerOutlineShader() {
  if (shaderRegistered) return
  shaderRegistered = true

  Effect.ShadersStore['outlineEdgeFragmentShader'] = OUTLINE_FRAGMENT_SHADER
}

export function createOutlinePostProcess(
  scene: Scene,
  camera: Camera,
): PostProcess {
  registerOutlineShader()

  // 啟用 depth renderer
  const depthRenderer = scene.enableDepthRenderer(camera, false, false)

  const postProcess = new PostProcess(
    'outlineEdge',
    'outlineEdge',
    ['screenSize', 'edgeWidth', 'edgeColor'],
    ['depthSampler'],
    1.0,
    camera,
  )

  postProcess.onApply = (effect) => {
    effect.setFloat2('screenSize', postProcess.width, postProcess.height)
    effect.setFloat('edgeWidth', 1.5)
    effect.setFloat3('edgeColor', 0.1, 0.1, 0.15)
    effect.setTexture('depthSampler', depthRenderer.getDepthMap())
  }

  return postProcess
}
