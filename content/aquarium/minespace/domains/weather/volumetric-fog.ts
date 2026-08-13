import type { DirectionalLight, RenderTargetTexture, Scene, UniversalCamera } from '@babylonjs/core'
import { Effect, Matrix, PostProcess, Texture, Vector3 } from '@babylonjs/core'
import { watch } from 'vue'
import { SUN_LIGHT_NAME } from '../../composables/use-babylon-scene'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'

/**
 * 沿著視線走幾步
 *
 * 每一步都要去陰影貼圖問一次「這裡照得到太陽嗎」，
 * 所以這個數字直接決定成本。二十四步配上抖動起點，
 * 在光束的尺度上已經看不出分層
 */
const STEP_COUNT = 24

/**
 * 最遠走多遠（格）
 *
 * 陰影貼圖只罩住鏡頭附近八十格見方，走出那個範圍就問不到遮蔽，
 * 空氣會整片亮起來。收在四十格以內，全程都在有效範圍裡
 */
const MAX_MARCH_DISTANCE = 40

/**
 * 空氣的濃度
 *
 * 這個值同時決定光束的亮度與衰減速度：越濃，近處越亮、也越快暗下去。
 * 禪庭的空氣是清的，只有晨昏的斜光才照得出那一層薄霧
 */
const FOG_DENSITY = 0.055

/**
 * 散射的方向性
 *
 * 零是各向同性，越接近一越集中在光線前進的方向。
 * 空氣中的塵埃是強烈前向散射的——這正是為什麼
 * 逆著光看得到光束，順著光什麼都沒有。
 *
 * 這個值不能照物理給。相位函數在正對太陽時的值是
 * (1 - g²) / (4π(1 - g)³)，g 給 0.72 時峰值是 1.75，
 * 而各向同性只有 0.08——差二十二倍。乘上累積的散射之後
 * 紅色通道會衝到三以上，泛光再把它抹成一大片白，太陽整個糊掉。
 *
 * 收到 0.55，峰值降到 0.61，方向性還在，但不會一望向太陽就爆掉
 */
const PHASE_G = 0.55

/**
 * 光束最強時的整體強度
 *
 * 與上面的相位一起決定正對太陽時會加上多少光。
 * 兩者相乘之後，逆光的峰值大約是 0.4，
 * 那是「看得出空氣裡有光」而不是「太陽變成一團白」
 */
const MAX_INTENSITY = 0.45

/**
 * 散射的上限
 *
 * 保險絲。上面兩個值是憑眼睛調的，日後任何一個被調大，
 * 或是某個角度剛好疊上太陽本身的光暈，都可能再爆一次。
 * 封頂在這裡，畫面就永遠不會被這道效果洗白
 */
const MAX_SCATTER = 0.85

const SHADER_NAME = 'minespaceVolumetricFog'

/**
 * 體積光的著色器
 *
 * 從鏡頭往場景表面一路走過去，每一步問陰影貼圖「這一點照得到太陽嗎」，
 * 照得到就把那一小段的散射加進來。走完之後乘上相位函數——
 * 也就是「這個角度看過去，空氣把光散向你的比例」。
 *
 * 這是 god rays 做不到的事。那個是螢幕空間的放射狀模糊，
 * 太陽必須在畫面上才有東西可以往外拉；這個問的是真正的遮蔽，
 * 所以太陽在牆後面、在畫面外，光束照樣從縫隙裡透出來
 */
Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = `
precision highp float;

varying vec2 vUV;

uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform highp sampler2DShadow shadowSampler;

uniform mat4 inverseViewProjection;
uniform mat4 shadowTransform;
uniform vec3 cameraPosition;
uniform vec3 cameraForward;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float cameraFarDistance;
uniform float intensity;
uniform float density;
uniform float phaseG;

/**
 * Henyey-Greenstein 相位函數
 *
 * 描述空氣把光散向某個角度的比例。g 為正時集中在前向，
 * 於是逆著光看得到光束、順著光看不到
 */
float measurePhase(float cosTheta, float g) {
  float g2 = g * g;
  float denominator = 1.0 + g2 - 2.0 * g * cosTheta;

  return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(denominator, 0.0001), 1.5));
}

void main(void) {
  vec3 sceneColor = texture2D(textureSampler, vUV).rgb;

  /** 這個像素對應的世界方向 */
  vec4 farPoint = inverseViewProjection * vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
  vec3 rayDirection = normalize(farPoint.xyz / farPoint.w - cameraPosition);

  /**
   * 場景表面在這條射線上的距離
   *
   * 深度圖存的是視空間的深度，也就是「沿著鏡頭正前方」的距離，
   * 不是沿著這條射線的距離。除以兩者的夾角餘弦才換得過來，
   * 否則畫面邊緣的光束會比中央短一截
   */
  float sceneDepth = texture2D(depthSampler, vUV).r * cameraFarDistance;
  float forwardCosine = max(dot(rayDirection, cameraForward), 0.001);
  float marchDistance = min(sceneDepth / forwardCosine, ${MAX_MARCH_DISTANCE}.0);

  float stepLength = marchDistance / float(${STEP_COUNT});

  /**
   * 起點錯開
   *
   * 每個像素都從同一個位置起步的話，取樣點會在空間中排成一層層的殼，
   * 畫面上就是一圈一圈的同心紋。讓每個像素的起點隨機錯開一小段，
   * 那些層次就被打散成雜訊，而雜訊在光束這種柔和的東西上看不出來
   */
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float travelled = stepLength * dither;

  float inScatter = 0.0;

  for (int index = 0; index < ${STEP_COUNT}; index++) {
    vec3 samplePosition = cameraPosition + rayDirection * travelled;

    vec4 lightClip = shadowTransform * vec4(samplePosition, 1.0);
    vec3 lightUv = lightClip.xyz / lightClip.w * 0.5 + 0.5;

    /**
     * 走出陰影貼圖就當作照得到
     *
     * 那是投影範圍以外，本來就沒有遮蔽資訊。
     * 反正下面的衰減會讓遠處的貢獻趨近於零
     */
    float lit = 1.0;
    bool isInside = lightUv.x > 0.0 && lightUv.x < 1.0
      && lightUv.y > 0.0 && lightUv.y < 1.0
      && lightUv.z > 0.0 && lightUv.z < 1.0;

    if (isInside) {
      /** 往光源方向推一點點，免得空氣把自己判定成被遮住 */
      lit = texture(shadowSampler, vec3(lightUv.xy, lightUv.z - 0.0015));
    }

    /** 越遠貢獻越小，那是空氣本身的吸收 */
    inScatter += lit * exp(-travelled * density);
    travelled += stepLength;
  }

  inScatter *= stepLength * density;

  float phase = measurePhase(dot(rayDirection, -sunDirection), phaseG);

  /**
   * 封頂
   *
   * 前向散射的峰值很尖，正對太陽時很容易把畫面推過泛光的門檻，
   * 然後被抹成一大片白。這裡直接限制這道效果最多能加多少光
   */
  vec3 scatter = min(sunColor * inScatter * phase * intensity, vec3(${MAX_SCATTER}));

  gl_FragColor = vec4(sceneColor + scatter, 1.0);
}
`

export interface VolumetricFog {
  /**
   * 設定光束強度，0 為完全關閉
   *
   * 關閉時連深度圖都會停掉——那是一趟把整個世界重畫一次的幾何通道，
   * 沒有光束的時候不該讓它跑
   */
  setStrength: (ratio: number) => void;
  dispose: () => void;
}

/**
 * 體積光
 *
 * 做法是螢幕空間的光線行進：對每一個像素，從鏡頭往場景表面走二十四步，
 * 每一步去問陰影貼圖「這一點照得到太陽嗎」，照得到就把那一小段的散射加起來。
 *
 * 與 god rays 的差別在於它問的是真正的遮蔽，不是把畫面上的亮點往外拉。
 * 所以太陽躲在鳥居後面、甚至跑到畫面外，光束照樣從縫隙裡透出來；
 * 光束的形狀也是真的由擋光的東西決定的。
 *
 * 代價是一張深度圖（一趟只寫深度的幾何通道）加上每像素二十四次陰影取樣，
 * 所以它與 god rays 一樣只在該出現的時候存在：晨昏那幾十秒
 */
export function createVolumetricFog(scene: Scene, camera: UniversalCamera): VolumetricFog {
  const { quality } = useGraphicsQuality()

  const sunLight = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
  if (!sunLight) {
    return { setStrength: () => {}, dispose: () => {} }
  }

  const postProcess = new PostProcess(
    'volumetric-fog',
    SHADER_NAME,
    [
      'inverseViewProjection',
      'shadowTransform',
      'cameraPosition',
      'cameraForward',
      'sunDirection',
      'sunColor',
      'cameraFarDistance',
      'intensity',
      'density',
      'phaseG',
    ],
    ['depthSampler', 'shadowSampler'],
    1,
    null,
    Texture.BILINEAR_SAMPLINGMODE,
    scene.getEngine(),
    false,
  )

  /** 每幀就地覆寫的暫存，不重新配置 */
  const inverseViewProjection = new Matrix()
  const cameraForward = new Vector3()
  let depthMap: RenderTargetTexture | null = null
  let intensity = 0
  let isEnabled = false

  postProcess.onApply = (effect) => {
    const shadowMap = sunLight.getShadowGenerator()?.getShadowMap()
    if (!depthMap || !shadowMap)
      return

    effect.setTexture('depthSampler', depthMap)
    /**
     * 陰影貼圖要當作「比較取樣器」綁進來
     *
     * 我們的陰影走 PCF，深度是存在深度附件上、由硬體做比較的，
     * 不是一張可以直接讀出數值的普通貼圖。
     * 用 setDepthStencilTexture 綁進來，著色器那邊宣告成 sampler2DShadow，
     * 一次取樣就直接回答「這一點照得到嗎」——正好是光線行進要問的問題
     */
    effect.setDepthStencilTexture('shadowSampler', shadowMap)

    scene.getTransformMatrix().invertToRef(inverseViewProjection)
    effect.setMatrix('inverseViewProjection', inverseViewProjection)
    effect.setMatrix('shadowTransform', sunLight.getShadowGenerator()!.getTransformMatrix())

    camera.getDirectionToRef(Vector3.Forward(), cameraForward)
    effect.setVector3('cameraPosition', camera.position)
    effect.setVector3('cameraForward', cameraForward)
    effect.setVector3('sunDirection', sunLight.direction)
    effect.setColor3('sunColor', sunLight.diffuse)
    effect.setFloat('cameraFarDistance', camera.maxZ)
    effect.setFloat('intensity', intensity)
    effect.setFloat('density', FOG_DENSITY)
    effect.setFloat('phaseG', PHASE_G)
  }

  function setEnabled(nextEnabled: boolean): void {
    if (nextEnabled === isEnabled)
      return

    isEnabled = nextEnabled

    if (nextEnabled) {
      /**
       * 深度圖存線性深度，而且要三十二位元浮點
       *
       * 預設是把深度打包進 RGBA 四個通道的，讀出來要自己解包；
       * 指定浮點之後 r 通道就是深度本身，著色器那邊乾淨得多
       */
      depthMap = scene.enableDepthRenderer(camera, false, true).getDepthMap()
      /**
       * 插在最前面
       *
       * 後製鏈的順序就是套用的順序。散射要在色調映射之前疊上去，
       * 才會跟著整個畫面一起被曝光曲線壓過；擺在後面則是疊在成品上，
       * 亮部會直接爆掉
       */
      camera.attachPostProcess(postProcess, 0)
      return
    }

    camera.detachPostProcess(postProcess)
    scene.disableDepthRenderer(camera)
    depthMap = null
  }

  const stopQualityWatch = watch(quality, (newQuality) => {
    if (newQuality === 'low') {
      setEnabled(false)
    }
  })

  return {
    setStrength(ratio: number) {
      const strength = quality.value === 'low' ? 0 : ratio

      setEnabled(strength > 0.01)
      intensity = MAX_INTENSITY * strength
    },
    dispose() {
      stopQualityWatch()
      setEnabled(false)
      postProcess.dispose(camera)
    },
  }
}
