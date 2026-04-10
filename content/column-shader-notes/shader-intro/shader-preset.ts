import type { GeometryConfig } from './use-webgl'

export interface ShaderPreset {
  label: string;
  code: string;
  vertexCode?: string;
  geometry?: GeometryConfig;
}

export const PRESET_SOLID_COLOR: ShaderPreset = {
  label: '純色',
  code: `precision mediump float;

void main() {
  // RGB 值範圍是 0.0 ~ 1.0，不是 0 ~ 255
  // 試著修改這三個數字看看！
  gl_FragColor = vec4(0.2, 0.6, 1.0, 1.0);
}`,
}

export const PRESET_GRADIENT: ShaderPreset = {
  label: '漸層',
  code: `precision mediump float;
uniform vec2 u_resolution;

void main() {
  // 將座標正規化到 0.0 ~ 1.0
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // 用 x 座標產生水平漸層
  gl_FragColor = vec4(uv.x, uv.y, 0.8, 1.0);
}`,
}

export const PRESET_CIRCLE: ShaderPreset = {
  label: '圓形',
  code: `precision mediump float;
uniform vec2 u_resolution;

void main() {
  // UV 正規化
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // 把原點移到畫面中心（-0.5 ~ 0.5）
  vec2 center = uv - 0.5;

  // 修正長寬比，不然圓會變橢圓
  center.x *= u_resolution.x / u_resolution.y;

  // 算出目前像素到中心的距離
  float dist = length(center);

  // 圓內 1.0，圓外 0.0
  float circle = step(dist, 0.3);

  // 用 circle 混合兩個顏色
  vec3 color = mix(
    vec3(0.1, 0.1, 0.2),  // 背景色
    vec3(0.2, 0.8, 0.6),  // 圓的顏色
    circle
  );

  gl_FragColor = vec4(color, 1.0);
}`,
}

export const PRESET_WAVE: ShaderPreset = {
  label: '波浪',
  code: `precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // sin 波浪
  float wave = sin(uv.x * 10.0 + u_time * 2.0) * 0.1 + 0.5;

  // 用 smoothstep 畫出平滑的波浪線
  float line = smoothstep(wave - 0.02, wave, uv.y)
             - smoothstep(wave, wave + 0.02, uv.y);

  vec3 background = vec3(0.05, 0.05, 0.15);
  vec3 waveColor = vec3(0.3, 0.7, 1.0);

  vec3 color = mix(background, waveColor, line);

  // 波浪下方填色
  float fill = smoothstep(wave, wave - 0.15, uv.y);
  color = mix(color, vec3(0.1, 0.3, 0.6), fill * 0.4);

  gl_FragColor = vec4(color, 1.0);
}`,
}

export const PRESET_MOUSE: ShaderPreset = {
  label: '滑鼠互動',
  code: `precision mediump float;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 mouseUv = u_mouse / u_resolution;

  // 修正長寬比
  float aspect = u_resolution.x / u_resolution.y;
  vec2 diff = uv - mouseUv;
  diff.x *= aspect;

  // 計算到滑鼠位置的距離
  float distance = length(diff);

  // 用距離產生發光效果
  float glow = 0.05 / distance;
  glow = clamp(glow, 0.0, 1.0);

  // 加上隨時間變化的顏色
  vec3 color = vec3(
    0.5 + 0.5 * sin(u_time),
    0.5 + 0.5 * sin(u_time + 2.094),
    0.5 + 0.5 * sin(u_time + 4.189)
  );

  gl_FragColor = vec4(color * glow, 1.0);
}`,
}

export const shaderPresetList: ShaderPreset[] = [
  PRESET_SOLID_COLOR,
  PRESET_GRADIENT,
  PRESET_CIRCLE,
  PRESET_WAVE,
  PRESET_MOUSE,
]
