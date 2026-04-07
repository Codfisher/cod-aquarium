import type { ShaderPreset } from '../shader-intro-for-js-developers/shader-preset'
import type { GeometryConfig } from '../shader-intro-for-js-developers/use-webgl'

// ── 共用幾何資料 ──────────────────────────────────

/** 五邊形頂點（用於繪圖模式展示） */
const PENTAGON_POSITION_LIST = [
  0.0, 0.6,
  -0.57, 0.18,
  -0.35, -0.49,
  0.35, -0.49,
  0.57, 0.18,
]

// ── Attribute Demo ──────────────────────────────────

const ATTRIBUTE_VERTEX_CODE = `attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  gl_PointSize = 12.0;
}`

const ATTRIBUTE_FRAGMENT_CODE = `precision mediump float;

void main() {
  gl_FragColor = vec4(0.2, 0.8, 0.6, 1.0);
}`

const ATTRIBUTE_GEOMETRY: GeometryConfig = {
  attributeList: [{
    name: 'a_position',
    size: 2,
    data: [
      0.0, 0.5,
      -0.5, -0.3,
      0.5, -0.3,
      -0.3, 0.2,
      0.4, 0.1,
    ],
  }],
  drawMode: 'POINTS',
  vertexCount: 5,
}

export const PRESET_ATTRIBUTE: ShaderPreset = {
  label: 'Attribute',
  code: ATTRIBUTE_FRAGMENT_CODE,
  vertexCode: ATTRIBUTE_VERTEX_CODE,
  geometry: ATTRIBUTE_GEOMETRY,
}

// ── 繪圖模式 Demo ──────────────────────────────────

const DRAW_MODE_FRAGMENT_CODE = `precision mediump float;

void main() {
  gl_FragColor = vec4(0.2, 0.8, 0.6, 1.0);
}`

function createDrawModePreset(
  label: string,
  drawMode: GeometryConfig['drawMode'],
  vertexCode?: string,
): ShaderPreset {
  return {
    label,
    code: DRAW_MODE_FRAGMENT_CODE,
    vertexCode: vertexCode ?? `attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  gl_PointSize = 8.0;
}`,
    geometry: {
      attributeList: [{
        name: 'a_position',
        size: 2,
        data: [...PENTAGON_POSITION_LIST],
      }],
      drawMode,
      vertexCount: 5,
    },
  }
}

export const drawModePresetList: ShaderPreset[] = [
  createDrawModePreset('POINTS', 'POINTS'),
  createDrawModePreset('LINES', 'LINES'),
  createDrawModePreset('LINE_STRIP', 'LINE_STRIP'),
  createDrawModePreset('LINE_LOOP', 'LINE_LOOP'),
  createDrawModePreset('TRIANGLE_STRIP', 'TRIANGLE_STRIP'),
  createDrawModePreset('TRIANGLE_FAN', 'TRIANGLE_FAN'),
]

// ── gl_PointSize Demo ──────────────────────────────────

const POINT_SIZE_VERTEX_CODE = `attribute vec2 a_position;
attribute float a_size;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);

  // 每個頂點用自己的 a_size
  gl_PointSize = a_size;
}`

const POINT_SIZE_FRAGMENT_CODE = `precision mediump float;

void main() {
  // gl_PointCoord 是 POINTS 模式限定
  // 範圍 0.0~1.0，代表該點正方形內的座標
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);

  // 畫圓，丟棄圓外的像素
  if (dist > 0.5) discard;

  float alpha = 1.0 - smoothstep(0.35, 0.5, dist);
  gl_FragColor = vec4(0.2, 0.8, 0.6, alpha);
}`

export const PRESET_POINT_SIZE: ShaderPreset = {
  label: 'gl_PointSize',
  code: POINT_SIZE_FRAGMENT_CODE,
  vertexCode: POINT_SIZE_VERTEX_CODE,
  geometry: {
    attributeList: [
      {
        name: 'a_position',
        size: 2,
        data: [
          -0.6, 0.3,
          -0.2, -0.4,
          0.3, 0.5,
          0.6, -0.2,
          0.0, 0.0,
        ],
      },
      {
        name: 'a_size',
        size: 1,
        data: [20.0, 35.0, 15.0, 45.0, 28.0],
      },
    ],
    drawMode: 'POINTS',
    vertexCount: 5,
  },
}

// ── Varying Demo ──────────────────────────────────

const VARYING_VERTEX_CODE = `attribute vec2 a_position;
attribute vec3 a_color;

// varying：從 Vertex 傳給 Fragment 的橋樑
varying vec3 v_color;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);

  // 把顏色交給 varying，GPU 會自動插值
  v_color = a_color;
}`

const VARYING_FRAGMENT_CODE = `precision mediump float;

// 接收 Vertex Shader 傳來的 varying
varying vec3 v_color;

void main() {
  // 每個像素拿到的 v_color 都不一樣
  // 是 GPU 根據三個頂點顏色自動插值的結果
  gl_FragColor = vec4(v_color, 1.0);
}`

export const PRESET_VARYING: ShaderPreset = {
  label: 'Varying',
  code: VARYING_FRAGMENT_CODE,
  vertexCode: VARYING_VERTEX_CODE,
  geometry: {
    attributeList: [
      {
        name: 'a_position',
        size: 2,
        data: [
          -0.6, -0.5,
          0.6, -0.5,
          0.0, 0.6,
        ],
      },
      {
        name: 'a_color',
        size: 3,
        data: [
          1.0, 0.0, 0.0,
          0.0, 1.0, 0.0,
          0.0, 0.0, 1.0,
        ],
      },
    ],
    drawMode: 'TRIANGLES',
    vertexCount: 3,
  },
}

// ── 成品展示：彩色粒子散佈 ──────────────────────────────────

const COMBINED_VERTEX_CODE = `attribute vec2 a_position;
attribute float a_size;
attribute vec3 a_color;

varying vec3 v_color;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`

const COMBINED_FRAGMENT_CODE = `precision mediump float;

varying vec3 v_color;

void main() {
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);

  if (dist > 0.5) discard;

  float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
  gl_FragColor = vec4(v_color, alpha);
}`

export const PRESET_COMBINED: ShaderPreset = {
  label: '組合技',
  code: COMBINED_FRAGMENT_CODE,
  vertexCode: COMBINED_VERTEX_CODE,
  geometry: {
    attributeList: [
      {
        name: 'a_position',
        size: 2,
        data: [
          -0.7, 0.4,
          -0.3, -0.6,
          0.1, 0.3,
          0.5, -0.3,
          -0.5, -0.1,
          0.3, 0.6,
          0.7, 0.1,
          -0.1, -0.4,
          0.6, -0.6,
          -0.6, 0.7,
          0.0, 0.0,
          -0.4, 0.5,
        ],
      },
      {
        name: 'a_size',
        size: 1,
        data: [
          25.0, 18.0, 35.0, 22.0, 40.0, 15.0,
          30.0, 20.0, 28.0, 12.0, 45.0, 16.0,
        ],
      },
      {
        name: 'a_color',
        size: 3,
        data: [
          1.0, 0.4, 0.3,
          0.3, 0.9, 0.6,
          0.4, 0.6, 1.0,
          1.0, 0.8, 0.2,
          0.8, 0.3, 1.0,
          0.2, 1.0, 0.8,
          1.0, 0.5, 0.7,
          0.5, 0.8, 0.3,
          0.3, 0.5, 1.0,
          1.0, 0.6, 0.1,
          0.6, 1.0, 0.5,
          0.9, 0.3, 0.5,
        ],
      },
    ],
    drawMode: 'POINTS',
    vertexCount: 12,
  },
}
