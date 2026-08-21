import type { BaseTexture, Material, UniformBuffer } from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'
import { LEVEL_ENCODE_RANGE } from './caustic-scene'
import { WATER_CELL_GLSL, WATER_HASH_GLSL } from './cell-noise'

/**
 * 水下焦散的材質外掛
 *
 * 陽光穿過皺起來的水面會被聚成一張晃動的亮網打在水底。
 * 材質外掛的完整機制見 EP05，這裡只用片段的宣告區與漫射色那一段
 */

/** 多高的脊線才算一條亮線，柔邊給得很窄，焦散是一張細細的亮網 */
const EDGE_THRESHOLD = 0.075
const EDGE_SOFTNESS = 0.02

/** 焦散的顏色，偏青的白 */
const CAUSTIC_COLOR = '0.72, 0.95, 1.0'

export interface CausticState {
  time: number;
  /** 亮網最亮到什麼程度，零就是整段跳過 */
  strength: number;
  /** 每深一格衰減多少 */
  depthFalloff: number;
  /** 全世界最高的那一片水面，著色器拿它當早退門檻 */
  maxSurfaceY: number;
  /** 網有多密，每格幾個細胞 */
  cellScale: number;
  /** 網蠕動的快慢 */
  cellSpeed: number;
  /** 兩個細胞靠多近才開始互相抹平 */
  blend: number;
  /** 第二層佔多少，零就是只有一層 */
  secondLayerRatio: number;
  /** 有沒有查水位圖，關掉就只剩「比水面矮」這個條件 */
  hasWaterMap: boolean;
}

export interface CreateCausticPluginParam {
  babylon: BabylonModule;
  state: CausticState;
  waterLevelTexture: BaseTexture;
  /** 水位圖蓋住世界的哪一塊 */
  mapOrigin: number;
  mapSpan: number;
}

export function createCausticPluginClass({
  babylon,
  state,
  waterLevelTexture,
  mapOrigin,
  mapSpan,
}: CreateCausticPluginParam) {
  return class DemoCausticPlugin extends babylon.MaterialPluginBase {
    constructor(material: Material) {
      /** 第六個參數是「一律啟用」，強弱全由 state 決定 */
      super(material, 'DemoWaterCaustics', 205, {}, true, true)
    }

    getClassName(): string {
      return 'DemoCausticPlugin'
    }

    getSamplers(samplerList: string[]): void {
      samplerList.push('causticWaterSampler')
    }

    getUniforms() {
      return {
        ubo: [
          { name: 'causticParam', size: 4, type: 'vec4' },
          { name: 'causticMap', size: 4, type: 'vec4' },
          { name: 'causticLayer', size: 4, type: 'vec4' },
        ],
      }
    }

    bindForSubMesh(uniformBuffer: UniformBuffer): void {
      uniformBuffer.updateFloat4(
        'causticParam',
        state.time,
        state.strength,
        state.depthFalloff,
        state.maxSurfaceY,
      )
      uniformBuffer.updateFloat4(
        'causticMap',
        mapOrigin,
        mapOrigin,
        1 / mapSpan,
        state.hasWaterMap ? 1 : 0,
      )
      uniformBuffer.updateFloat4(
        'causticLayer',
        state.cellScale,
        state.cellSpeed,
        state.blend,
        state.secondLayerRatio,
      )

      uniformBuffer.setTexture('causticWaterSampler', waterLevelTexture)
    }

    getCustomCode(shaderType: string): { [pointName: string]: string } | null {
      if (shaderType !== 'fragment')
        return null

      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `
          uniform sampler2D causticWaterSampler;

          ${WATER_HASH_GLSL}
          ${WATER_CELL_GLSL}
        `,
        /**
         * 三層條件由外往內收，最貴的細胞紋排在最裡面
         *
         * 第一道刷掉沒開這個效果的時候，第二道刷掉「比全世界最高的水面
         * 還高」的片元，那是絕大多數，而且不必查圖。
         * 撐到第三道才真的去問那張水位圖
         */
        CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
          if (causticParam.y > 0.0 && vPositionW.y < causticParam.w) {
            float causticSurfaceY = causticParam.w;
            float causticHasWater = 1.0;

            if (causticMap.w > 0.5) {
              vec4 causticWater = texture2D(
                causticWaterSampler,
                (vPositionW.xz - causticMap.xy) * causticMap.z
              );
              causticHasWater = step(0.5, causticWater.b);
              causticSurfaceY = (causticWater.r * 65280.0 + causticWater.g * 255.0)
                / 65535.0 * ${LEVEL_ENCODE_RANGE.toFixed(1)};
            }

            float causticDepth = causticSurfaceY - vPositionW.y;

            if (causticHasWater > 0.5 && causticDepth > 0.05) {
              vec2 causticPoint = waterQuantize(vPositionW.xz);

              float causticEdge = waterCellEdge(
                causticPoint * causticLayer.x,
                causticParam.x * causticLayer.y,
                causticLayer.z
              );
              float caustic = smoothstep(
                ${(EDGE_THRESHOLD - EDGE_SOFTNESS).toFixed(4)},
                ${(EDGE_THRESHOLD + EDGE_SOFTNESS).toFixed(4)},
                causticEdge
              );

              /**
               * 第二層
               *
               * 尺度與速度都跟第一層錯開，而且往反方向走。
               * 兩層一起看才有「水在流」的樣子，單層只是整片一起蠕動
               */
              if (causticLayer.w > 0.0) {
                float causticEdgeSecond = waterCellEdge(
                  causticPoint * causticLayer.x * 0.63,
                  causticParam.x * causticLayer.y * -1.7,
                  causticLayer.z
                );
                caustic = max(caustic, smoothstep(
                  ${(EDGE_THRESHOLD - EDGE_SOFTNESS).toFixed(4)},
                  ${(EDGE_THRESHOLD + EDGE_SOFTNESS).toFixed(4)},
                  causticEdgeSecond
                ) * causticLayer.w);
              }

              baseColor.rgb += vec3(${CAUSTIC_COLOR})
                * caustic
                * exp(-causticDepth * causticParam.z)
                * causticParam.y;
            }
          }
        `,
      }
    }
  }
}
