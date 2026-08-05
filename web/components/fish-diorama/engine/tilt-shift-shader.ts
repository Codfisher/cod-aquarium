/** 移軸微縮（tilt-shift）模糊的 fragment shader 產生器。
 *
 * 箱庭與六個迷你世界各自建立自己的後製管線，但模糊的配方必須是同一份——
 * 取樣數這種會影響發熱的參數若兩邊各改各的，手機降級就只會生效一半。
 */
import { isCoarsePointerDevice } from '../shared/device-tier'

/** 移軸微縮的清晰帶設定。垂直捲動類遊戲把 halfHeight 放大，
 * 才不會把玩家正在操作的上下區域糊掉
 */
export interface TiltShiftOptions {
  /** 清晰帶中心（0 = 畫面底、1 = 頂） */
  focusCenterY: number;
  /** 清晰帶半高（畫面高度比例） */
  focusHalfHeight: number;
  /** 由清晰到最模糊的過渡帶寬度 */
  focusFalloff: number;
  /** 最大模糊半徑（px） */
  maxBlurRadius: number;
}

export const DEFAULT_TILT_SHIFT: TiltShiftOptions = {
  focusCenterY: 0.52,
  focusHalfHeight: 0.12,
  focusFalloff: 0.3,
  maxBlurRadius: 10,
}

/** 盤形取樣的方向數。
 *
 * 手機減半。這個 pass 佔了畫面約四分之三的面積（中央清晰帶走 early-out），
 * 每像素少讀六次紋理，是持續發熱最直接的一刀——iOS Safari 的看門狗
 * 正是因為長時間的填充率負擔才回收 WebGL context。
 * 取樣數減半會讓模糊區浮現一圈圈重影，靠每像素旋轉取樣盤打散（見 shader）
 */
export function getTiltShiftTapCount(): number {
  return isCoarsePointerDevice() ? 6 : 12
}

/** 產生指定清晰帶與取樣數的移軸模糊 shader 原始碼 */
export function buildTiltShiftShaderSource(options: TiltShiftOptions, tapCount: number): string {
  const angleStep = (Math.PI * 2) / tapCount
  return /* glsl */ `
    precision highp float;
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform vec2 texelSize;

    const float FOCUS_CENTER_Y = ${options.focusCenterY.toFixed(4)};
    const float FOCUS_HALF_HEIGHT = ${options.focusHalfHeight.toFixed(4)};
    const float FOCUS_FALLOFF = ${options.focusFalloff.toFixed(4)};
    const float MAX_BLUR_RADIUS = ${options.maxBlurRadius.toFixed(2)};
    const int TAP_COUNT = ${tapCount};
    const float TAP_ANGLE_STEP = ${angleStep.toFixed(6)};

    void main(void) {
      vec4 centerColor = texture2D(textureSampler, vUV);
      float bandDistance = max(0.0, abs(vUV.y - FOCUS_CENTER_Y) - FOCUS_HALF_HEIGHT);
      float blurStrength = smoothstep(0.0, FOCUS_FALLOFF, bandDistance);
      if (blurStrength < 0.02) {
        gl_FragColor = centerColor;
        return;
      }
      float radius = blurStrength * MAX_BLUR_RADIUS;
      // 每像素把整個取樣盤轉一個隨機角度：取樣數少的時候，固定角度的盤形取樣
      // 會讓高對比邊緣在模糊區留下一圈圈可辨識的重影；打散成細微雜訊自然得多
      float dither = fract(sin(dot(vUV, vec2(12.9898, 78.233))) * 43758.5453);
      float baseAngle = dither * TAP_ANGLE_STEP;
      // 盤形取樣的簡化模糊，半徑以黃金比例交錯避免環狀感
      vec4 accumulated = centerColor;
      for (int index = 0; index < TAP_COUNT; index++) {
        float angle = baseAngle + float(index) * TAP_ANGLE_STEP;
        float sampleRadius = radius * (0.45 + 0.55 * fract(float(index) * 0.618));
        vec2 sampleOffset = vec2(cos(angle), sin(angle)) * texelSize * sampleRadius;
        accumulated += texture2D(textureSampler, vUV + sampleOffset);
      }
      gl_FragColor = accumulated / ${(tapCount + 1).toFixed(1)};
    }
  `
}
