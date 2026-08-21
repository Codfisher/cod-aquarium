import type { Matrix, RenderTargetTexture, Scene, UniversalCamera } from '@babylonjs/core'
import { Camera, Color4, Constants, DepthRenderer, TargetCamera, Texture, Vector3 } from '@babylonjs/core'

/**
 * 這張圖畫多大
 *
 * 只給光束用，不是拿來畫地面陰影的——它的取樣點散在空氣裡、
 * 而且沿路平均過幾十次，一千零二十四已經比實際看得出來的細
 */
const SHADOW_MAP_SIZE = 1024

/**
 * 罩住鏡頭附近多大一塊（半邊長）
 *
 * 要略大於光束行進的上限（見 volumetric-light 的 MAX_DISTANCE），
 * 不然射線走到一半就出了圖，後半段會突然全部變成「照得到」
 */
const SHADOW_HALF_EXTENT = 56

/** 光源沿著光線的反方向退開多遠，要大到把最高的岩體整個含進去 */
const SHADOW_BACK_DISTANCE = 140

/**
 * 深度比較的容差（格）
 *
 * 太小會讓表面自己遮住自己，空氣裡浮出一層一層的條紋；
 * 太大則讓貼著地面的那一段陰影漏光。半格是量的單位，
 * 而這張圖的取樣點本來就在空氣裡、不貼著任何表面，
 * 所以這裡可以給得比一般的地面陰影寬鬆
 */
const SHADOW_BIAS = 0.6

export interface VolumetricShadow {
  /** 每幀呼叫，把這張圖挪到鏡頭附近並對準太陽 */
  update: (sunDirection: Vector3) => void;
  getTexture: () => RenderTargetTexture;
  /**
   * 從鏡頭看出去的深度圖，決定光束走到哪裡停下來
   *
   * 這裡不能共用 scene-depth 那一張。那一張刻意把會被風吹動的網格
   * 濾掉了（見 scene-depth 的說明：深度那一趟套不上風擺動的頂點外掛，
   * 草會在畫面上擺、深度圖裡卻停在原位，在水面上印出一片不動的白沫）。
   *
   * 而樹葉正是會擺動的網格。少了它們，葉片那一格拿到的深度
   * 是「葉子後面那塊木頭」的距離——光束的加成因此照著背景幾何的
   * 形狀走，木頭的輪廓就印穿了整片樹冠。
   *
   * 光束對「葉子停在沒擺動的原位」這種零點幾格的誤差完全不敏感：
   * 它的結果沿路平均過幾十次，本來就是糊的。所以這裡自己開一張
   * 不做任何過濾的，兩邊各取所需
   */
  getCameraDepthTexture: () => RenderTargetTexture;
  /** 世界座標 → 太陽的裁切空間，拿來算取樣點落在圖上的哪裡 */
  getViewProjection: () => Matrix;
  /** 世界座標 → 太陽的視空間，拿來算取樣點離太陽多遠 */
  getView: () => Matrix;
  getBias: () => number;
  dispose: () => void;
}

/**
 * 只給光束用的一張陰影圖
 *
 * ── 為什麼不共用場景本來那張 ──
 *
 * 這個場景的陰影在高畫質以上是分層的（CSM）：貼圖是一疊圖層，
 * 每一層有自己的矩陣，要在著色器裡挑層、算各層的邊界。
 * 那是一整套獨立的機制，而光束只需要「這一點照不照得到太陽」
 * 這個最單純的問題。
 *
 * ── 為什麼不用體素網格 ──
 *
 * 一開始是這麼做的：拿體素全局光那張粗網格的 alpha 欄（見 voxel-gi），
 * 那一欄存的正是「這一格照得到多少陽光」。想法沒錯，資料也是對的，
 * 但粗細不夠——量出來的數字說得很清楚：地表往上每一層，
 * 四千九百格裡有四千八百格以上照得到太陽。
 *
 * 一格粗格是水平四格、垂直兩格；一叢五格寬的樹冠只佔一到兩格，
 * 而且葉子稀疏、不透明度只有三成，擋不出任何邊界分明的陰影體積。
 * 可見度場處處都是一，光束就沒有東西可以顯現——
 * 那不是強度或相位調得不對，是資料裡根本沒有對比。
 *
 * 所以改成正規做法：另外畫一張真正的深度圖，逐方塊解析度，
 * 樹葉的縫隙因此在空氣裡投下真的洞
 */
export function createVolumetricShadow(scene: Scene, camera: UniversalCamera): VolumetricShadow {
  /**
   * 用正交投影，而且是一台不參與算繪的鏡頭
   *
   * 太陽是平行光，投影必須是正交的——透視投影會讓影子近大遠小。
   * 這台鏡頭只是拿來定義「從太陽看過去是什麼樣子」，
   * 不會被加進 scene.activeCameras，也就不會真的畫到畫面上
   */
  const shadowCamera = new TargetCamera('volumetric-shadow-camera', Vector3.Zero(), scene, false)
  shadowCamera.mode = Camera.ORTHOGRAPHIC_CAMERA
  shadowCamera.orthoLeft = -SHADOW_HALF_EXTENT
  shadowCamera.orthoRight = SHADOW_HALF_EXTENT
  shadowCamera.orthoTop = SHADOW_HALF_EXTENT
  shadowCamera.orthoBottom = -SHADOW_HALF_EXTENT
  shadowCamera.minZ = 1
  shadowCamera.maxZ = SHADOW_BACK_DISTANCE + 120

  /**
   * 存太陽視空間的 Z，不是正規化過的深度
   *
   * 另一條路存的是零到一的深度，比較時得把近遠平面再乘回來，
   * 而那組數字散在鏡頭上，日後有人動了範圍這裡會靜靜地算錯。
   * 存原始的距離，著色器那邊拿同一個視矩陣算一次就比得了
   */
  const depthRenderer = new DepthRenderer(
    scene,
    Constants.TEXTURETYPE_FLOAT,
    shadowCamera,
    false,
    Texture.NEAREST_SAMPLINGMODE,
    true,
    'volumetric-shadow-depth',
  )

  const depthMap = depthRenderer.getDepthMap()
  depthMap.renderList = null
  depthMap.activeCamera = shadowCamera
  /**
   * 沒有東西的地方要當成無限遠
   *
   * 預設底色是零，那等於「實體就貼在太陽上」——整片天空會被判成
   * 遮住了自己，空氣因此全部落在陰影裡。改成遠平面之後，
   * 沒有幾何的地方就是照得到
   */
  depthMap.clearColor = new Color4(shadowCamera.maxZ, 0, 0, 1)

  /**
   * 這張圖不跟著主鏡頭走
   *
   * 預設只有在「正在算繪的就是它綁的那台鏡頭」時才畫，
   * 而這台鏡頭永遠不會是主鏡頭。關掉之後它每一幀都會畫一次
   */
  depthRenderer.useOnlyInActiveCamera = false
  scene.customRenderTargets.push(depthMap)

  /**
   * 從鏡頭看出去的那一張，什麼都不濾
   *
   * 與 scene-depth 那一張是兩回事，理由見介面上 getCameraDepthTexture
   * 的說明。這裡直接 new 一個而不是走 scene.enableDepthRenderer：
   * 後者每台鏡頭只留一份、會拿到 scene-depth 已經設好過濾的那一張
   */
  const cameraDepthRenderer = new DepthRenderer(
    scene,
    Constants.TEXTURETYPE_FLOAT,
    camera,
    false,
    Texture.NEAREST_SAMPLINGMODE,
    true,
    'volumetric-camera-depth',
  )
  const cameraDepthMap = cameraDepthRenderer.getDepthMap()
  /** 沒有東西的地方是無限遠，理由與上面那張相同 */
  cameraDepthMap.clearColor = new Color4(camera.maxZ, 0, 0, 1)
  cameraDepthRenderer.useOnlyInActiveCamera = false
  scene.customRenderTargets.push(cameraDepthMap)

  /** 光源空間的三軸與暫存，每幀就地覆寫，不重新配置 */
  const forward = new Vector3()
  const right = new Vector3()
  const up = new Vector3()
  const center = new Vector3()

  /** 一個取樣格有多大，投影中心要對齊到它上面 */
  const texelSize = (SHADOW_HALF_EXTENT * 2) / SHADOW_MAP_SIZE

  function update(sunDirection: Vector3): void {
    /**
     * 投影中心對齊取樣格
     *
     * 連續跟著鏡頭走的話，同一道邊緣每一幀落在不同的取樣點上，
     * 空氣裡的光束邊界會沿著走路的方向不停爬動。
     * 對齊的座標系必須是光源自己的三軸——這與 use-babylon-scene 的
     * trackShadowToCamera 是同一件事，那裡有完整的說明
     */
    forward.copyFrom(sunDirection).normalize()
    Vector3.CrossToRef(Vector3.UpReadOnly, forward, right)
    right.normalize()
    Vector3.CrossToRef(forward, right, up)

    const position = camera.globalPosition
    const alongRight = Math.round(Vector3.Dot(position, right) / texelSize) * texelSize
    const alongUp = Math.round(Vector3.Dot(position, up) / texelSize) * texelSize
    const alongForward = Math.round(Vector3.Dot(position, forward) / texelSize) * texelSize

    center.set(
      right.x * alongRight + up.x * alongUp + forward.x * alongForward,
      right.y * alongRight + up.y * alongUp + forward.y * alongForward,
      right.z * alongRight + up.z * alongUp + forward.z * alongForward,
    )

    shadowCamera.position.set(
      center.x - forward.x * SHADOW_BACK_DISTANCE,
      center.y - forward.y * SHADOW_BACK_DISTANCE,
      center.z - forward.z * SHADOW_BACK_DISTANCE,
    )
    shadowCamera.setTarget(center)
  }

  return {
    update,
    getTexture: () => depthMap,
    getCameraDepthTexture: () => cameraDepthMap,
    /** 這兩個矩陣每次取都是當下的，鏡頭挪過之後不必自己重算 */
    getViewProjection: () => shadowCamera.getTransformationMatrix(),
    getView: () => shadowCamera.getViewMatrix(),
    getBias: () => SHADOW_BIAS,
    dispose: () => {
      for (const target of [depthMap, cameraDepthMap]) {
        const index = scene.customRenderTargets.indexOf(target)
        if (index !== -1) {
          scene.customRenderTargets.splice(index, 1)
        }
      }
      depthRenderer.dispose()
      cameraDepthRenderer.dispose()
      shadowCamera.dispose()
    },
  }
}
