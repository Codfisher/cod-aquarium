import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Color3, Vector2 } from '@babylonjs/core'
import { SONGBIRD_MURMURATION_ANCHOR } from '../realm-signature-direction'
import { createQuadListMesh, createSignatureLayer, GLSL_NOISE, GLSL_SKY_DIRECTION, SIGNATURE_SHELL_RADIUS } from '../realm-signature-kit'

/**
 * 百囀林苑晨昏的椋鳥群舞（渲染端，屬於世界層）
 *
 * 白天滿園子的鳥各唱各的，到了黃昏牠們聚成一大群，在北邊的樹冠上空像一團煙一樣翻捲、拉長、對折再散開。
 * 兩百四十隻鳥是同一個網格裡的兩百四十張小方片；整群的中心緩緩遊走，每一隻在一個會伸縮扭轉的橢圓裡繞，
 * 再疊一道從群頭傳到群尾的波——全在頂點著色器裡算，CPU 一隻都不追蹤。
 * 深色的小方點，用一般混合蓋在晚霞上。
 *
 * 只在晨昏出現（twilightRatio）：太陽升高或天黑之後淡出，下雨或陰天罩蓋上來時一起收。
 * 成本：兩百四十張方片共四百八十個三角形、一次繪製（效能檔減到約九十隻）；每隻約零點四度見方
 */

const BIRD_COUNT = 240

const MURMURATION_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
uniform float birdCount;
uniform vec2 home;
${GLSL_NOISE}
${GLSL_SKY_DIRECTION}

void main() {
  float index = position.z;
  float seedA = hash11(index * 1.37);
  float seedB = hash11(index * 2.71 + 5.0);
  float seedC = hash11(index * 0.53 + 9.0);

  /** 整群的中心在一塊天空裡慢慢遊走 */
  float centerAzimuth = home.x + 0.34 * sin(time * 0.11) + 0.12 * sin(time * 0.29 + 1.3);
  float centerElevation = home.y + 0.09 * sin(time * 0.17 + 0.7) + 0.04 * sin(time * 0.41);

  /** 每一隻在橢圓裡繞自己的圈；橢圓一下拉長、一下壓扁，群的形狀就一直在變 */
  float stretch = 1.5 + 0.7 * sin(time * 0.19);
  float squash = 0.55 + 0.25 * cos(time * 0.23 + 1.0);
  float orbit = seedA * 6.2831853 + time * (0.25 + seedB * 0.35);
  float reach = sqrt(seedC) * 0.17;
  float offsetAzimuth = cos(orbit) * reach * stretch;
  float offsetElevation = sin(orbit * 1.3 + seedB * 4.0) * reach * squash;

  /** 一道從群頭傳到群尾的波，加上整群的扭轉：翻捲的感覺從這兩項來 */
  offsetElevation += 0.045 * sin(offsetAzimuth * 11.0 - time * 1.3) * (0.6 + 0.4 * sin(time * 0.31));
  offsetElevation += offsetAzimuth * 0.35 * sin(time * 0.13);

  vec3 center = skyDirection(centerAzimuth + offsetAzimuth, max(centerElevation + offsetElevation, 0.04));
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), center));
  vec3 up = cross(center, right);
  vec3 direction = normalize(center + (right * position.x + up * position.y) * 0.0034);

  gl_Position = index < birdCount
    ? viewProjection * world * vec4(direction * ${SIGNATURE_SHELL_RADIUS.toFixed(1)}, 1.0)
    : vec4(2.0, 2.0, 2.0, 1.0);
}
`

const MURMURATION_FRAGMENT = `
precision highp float;
uniform float strength;
uniform vec3 tint;

void main() {
  gl_FragColor = vec4(tint, strength);
}
`

export function createSongbirdMurmuration({ scene, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  const home = new Vector2(SONGBIRD_MURMURATION_ANCHOR.azimuth, SONGBIRD_MURMURATION_ANCHOR.elevation)
  const tint = new Color3()

  return createSignatureLayer({
    scene,
    atmosphere,
    name: 'songbird-murmuration',
    shaderName: 'minespaceSongbirdMurmuration',
    vertexSource: MURMURATION_VERTEX,
    fragmentSource: MURMURATION_FRAGMENT,
    uniformList: ['birdCount', 'home', 'tint'],
    mesh: createQuadListMesh(scene, 'songbird-murmuration', BIRD_COUNT),
    blend: 'alpha',
    space: 'sky',
    fogHandling: '透明度是 twilightRatio（晨昏乘 skyBodyFade 與露天程度），下雨、霧幕與洞裡整群淡掉',
    update(frame, material) {
      /** 剪影的顏色：此刻的霧色壓到很暗 */
      tint.set(atmosphere.fogColor.r * 0.14, atmosphere.fogColor.g * 0.14, atmosphere.fogColor.b * 0.16)
      material.setColor3('tint', tint)
      material.setVector2('home', home)
      material.setFloat('birdCount', Math.round(BIRD_COUNT * frame.detailRatio))
      return frame.twilightRatio * 0.88
    },
  })
}
