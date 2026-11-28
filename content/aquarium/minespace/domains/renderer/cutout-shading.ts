import type { Material } from '@babylonjs/core'
import { MaterialPluginBase } from '@babylonjs/core'

/** 外掛的名字，取材質上那一份實例時要用同一個字串 */
const PLUGIN_NAME = 'MinespaceCutoutShading'

/**
 * 鏤空方塊（樹葉、花草、玻璃片、鐵鏈）的兩條捷徑：接陰影改用 PCF、透明的像素提早丟掉
 *
 * 林子、麥田、草原裡，畫面上大半是一層疊一層的鏤空貼圖：從葉縫看進去，同一個像素要畫好幾層。
 * 每一層都跑完整支像素著色器，這是有樹的大場景比禪庭慢的主因
 * （見 docs/development-notes.md 的「效能優化」）。
 *
 * 太陽的陰影是接觸硬化（PCSS）：先做一輪遮蔽搜尋找出擋光的東西有多遠，再依距離決定模糊多寬，
 * 是整支像素著色器裡最貴的一段。樹冠正是它最划不來的地方：擋住葉子的是隔壁的葉子，
 * 遮蔽物永遠貼得很近，搜尋的結果幾乎都是「銳利」，換成固定寬度的 PCF 看起來差不多。
 * 地面、樹幹、房子照舊是接觸硬化，柱腳與樹根的影子仍是銳利的。
 * 太陽的陰影產生器仍是 PCSS，綁進來的資料是 PCSS 那一套：
 * shadowsInfo 的 y 是貼圖邊長的倒數（PCF 那一套 y 是邊長、z 是倒數），這裡自己換算。
 * 最省那一級本來就是 PCF，比對不到那一行，什麼都不換
 */
class CutoutShadingPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    /** 不帶任何 define 也不帶 uniform，只是在著色器組好之後換一行，所以直接啟用 */
    super(material, PLUGIN_NAME, 230, {}, true, true)
  }

  override getClassName(): string {
    return 'CutoutShadingPlugin'
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== 'fragment')
      return null

    return {
      /**
       * 透明的像素一讀完貼圖就丟掉，後面整段光照不算
       *
       * 專案的鏤空材質都指定了 transparencyMode，Babylon 因此把 alpha 測試排到
       * 「所有 alpha 都算完之後」（ALPHATEST_AFTERALLALPHACOMPUTATIONS），位置在整段光照的後面：
       * 葉縫、草葉之間那些最後會被丟掉的像素，照樣先算完陰影、叢集燈火、全局光、雲影才丟。
       * 這裡在貼圖取樣之後就先測一次。之後 alpha 只會再乘上不大於一的實例色，
       * 這裡丟得掉的，後面那一次也一定丟，畫面逐像素相同。
       *
       * discard 後面要接 return：D3D 的 discard 只是標記這個像素不寫出去，不會中止執行。
       * 而且只有在後面沒有任何「要算螢幕微分的貼圖取樣」時，這個提早返回才有機會真的跳過
       * （否則 HLSL 會把分支攤平成照算）。所以雲影、全局光、焦散的取樣都改成 textureLod，
       * 陰影的比較取樣改成 textureGrad（見 sun-shadow）。
       *
       * 收益不大：實測（高畫質，交錯兩輪）蟬雨深林少 0.4 毫秒、松韻林海 0.1 到 0.3，其餘量不出來。
       * 主因是「函式中途 return」在 HLSL 裡多半不是真的跳過（sun-shadow 有同一個教訓），
       * 而這裡沒辦法改成用 if 把後面整段光照包起來。留著是因為畫面完全相同、只有幾行
       */
      'CUSTOM_FRAGMENT_UPDATE_ALPHA': `
        #ifdef ALPHATEST
          if (alpha < alphaCutOff) {
            discard;
            return;
          }
        #endif
      `,

      /**
       * 分層陰影的接觸硬化取樣（十六、三十二、六十四次搜尋都是同一個樣子），
       * $1 是光源的編號，lightFragment 展開之後每一盞光各自一行。
       *
       * 結尾的分號要一起比對、一起換掉：Babylon 會在注入的字串後面補一個換行，
       * 只換到右括號的話分號被擠到下一行獨立成行，之後的處理會把那一行丟掉，整支著色器編不過
       */
      '!computeShadowWithCSMPCSS(?:16|32|64)\\(float\\(index(\\d+)\\),vPositionFromLight\\1\\[index\\1\\],vDepthMetric\\1\\[index\\1\\],depthTexture\\1,shadowTexture\\1,light\\1\\.shadowsInfo\\.y,light\\1\\.shadowsInfo\\.z,light\\1\\.shadowsInfo\\.x,light\\1\\.shadowsInfo\\.w,lightSizeUVCorrection\\1\\[index\\1\\],depthCorrection\\1\\[index\\1\\],penumbraDarkness\\1\\);':
        'computeShadowWithCSMPCF3(float(index$1),vPositionFromLight$1[index$1],vDepthMetric$1[index$1],shadowTexture$1,vec2(1.0/light$1.shadowsInfo.y,light$1.shadowsInfo.y),light$1.shadowsInfo.x,light$1.shadowsInfo.w);',
    }
  }
}

/** 替一份鏤空材質換成便宜的陰影取樣 */
export function attachCutoutShading(material: Material): void {
  /** 外掛在建構時就把自己掛上材質的外掛管理器，不必另外保存 */
  void new CutoutShadingPlugin(material)
}
