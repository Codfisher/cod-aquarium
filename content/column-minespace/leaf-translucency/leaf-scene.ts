import type {
  Mesh,
  Scene,
  StandardMaterial,
  UniformBuffer,
} from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'

/**
 * 逆光樹冠的共用場景
 *
 * 四個範例用的是同一棵樹、同一道低角度的陽光，
 * 差別只在透光那幾個參數。場景抽出來，範例本身就只剩下
 * 「拉這根滑桿會改到哪一個 uniform」
 */

/** 葉子貼圖的邊長，維持十六格見方的像素味 */
const LEAF_TEXTURE_SIZE = 16

/** 太陽在樹的正後方，貼著地平線往鏡頭這一側照過來 */
export const SUN_DIRECTION: readonly [number, number, number] = [0, -0.28, -0.96]

/** 兩種葉子的顏色，透綠與透橘那個範例拿來對照 */
export const GREEN_LEAF: readonly [number, number, number] = [86, 140, 62]

export const MAPLE_LEAF: readonly [number, number, number] = [198, 92, 40]

/**
 * 一份材質的透光參數
 *
 * 全部走 uniform，拉滑桿不會重新編譯著色器
 */
export interface LeafTranslucencyHandle {
  /** 這份材質透多少光，零等於不是會透光的東西 */
  setAmount: (value: number) => void;
  /** 透光集中在多窄的角度裡 */
  setForwardPower: (value: number) => void;
  /** 出射方向被法線扳開多少 */
  setNormalDistortion: (value: number) => void;
  /** 一是只加在背光面，零是兩面都加 */
  setBackFacingRatio: (value: number) => void;
  /** 一是乘上葉子自己的顏色，零是直接加白光 */
  setTintRatio: (value: number) => void;
}

/**
 * 可重現的亂數
 *
 * 樹冠的形狀每次重整頁面都一樣，讀者拉滑桿比較前後才有意義
 */
function createRandom(seed: number) {
  let state = seed

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296

    return state / 4294967296
  }
}

/**
 * 一張帶著顆粒的純色貼圖
 *
 * 顏色要進到貼圖裡。透光那一行乘的是 baseColor，
 * 那是貼圖取樣的結果，材質上的 diffuseColor 進不去
 */
export function createLeafTexture(
  babylon: BabylonModule,
  scene: Scene,
  name: string,
  color: readonly [number, number, number],
) {
  const texture = new babylon.DynamicTexture(
    name,
    { width: LEAF_TEXTURE_SIZE, height: LEAF_TEXTURE_SIZE },
    scene,
    false,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  const random = createRandom(20260821)

  const [red, green, blue] = color
  for (let y = 0; y < LEAF_TEXTURE_SIZE; y++) {
    for (let x = 0; x < LEAF_TEXTURE_SIZE; x++) {
      const shade = 0.82 + random() * 0.28
      context.fillStyle = `rgb(${Math.round(red * shade)}, ${Math.round(green * shade)}, ${Math.round(blue * shade)})`
      context.fillRect(x, y, 1, 1)
    }
  }

  texture.update()
  texture.updateSamplingMode(babylon.Texture.NEAREST_SAMPLINGMODE)

  return texture
}

/**
 * 把葉片透光掛到一份材質上
 *
 * 材質外掛的完整機制見 EP05，這裡只用到三件事：
 * 宣告 uniform、每次綁定寫進去、把一段 GLSL 插進指定的位置
 */
export function attachLeafTranslucency(
  babylon: BabylonModule,
  material: StandardMaterial,
): LeafTranslucencyHandle {
  const state = {
    red: 1,
    green: 0.95,
    blue: 0.82,
    amount: 0.8,
    forwardPower: 3.5,
    normalDistortion: 0.35,
    backFacingRatio: 1,
    tintRatio: 1,
  }

  class LeafTranslucencyPlugin extends babylon.MaterialPluginBase {
    getClassName(): string {
      return 'DemoLeafTranslucencyPlugin'
    }

    getUniforms() {
      return {
        ubo: [
          { name: 'leafColor', size: 4, type: 'vec4' },
          { name: 'leafSun', size: 4, type: 'vec4' },
          { name: 'leafMode', size: 4, type: 'vec4' },
        ],
        /** 不支援統一緩衝區時的退路 */
        fragment: `
          uniform vec4 leafColor;
          uniform vec4 leafSun;
          uniform vec4 leafMode;
        `,
      }
    }

    bindForSubMesh(uniformBuffer: UniformBuffer): void {
      uniformBuffer.updateFloat4(
        'leafColor',
        state.red * state.amount,
        state.green * state.amount,
        state.blue * state.amount,
        state.normalDistortion,
      )
      uniformBuffer.updateFloat4(
        'leafSun',
        SUN_DIRECTION[0],
        SUN_DIRECTION[1],
        SUN_DIRECTION[2],
        state.forwardPower,
      )
      uniformBuffer.updateFloat4('leafMode', state.backFacingRatio, state.tintRatio, 0, 0)
    }

    getCustomCode(shaderType: string): { [pointName: string]: string } | null {
      if (shaderType !== 'fragment')
        return null

      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `
          vec3 demoLeafTranslucency(vec3 viewDirection, vec3 surfaceNormal) {
            float backFacing = 1.0 - max(dot(surfaceNormal, -leafSun.xyz), 0.0);
            backFacing = mix(1.0, backFacing, leafMode.x);

            vec3 throughDirection = normalize(
              leafSun.xyz - surfaceNormal * leafColor.a
            );
            float forward = pow(
              max(dot(viewDirection, throughDirection), 0.0),
              leafSun.w
            );

            return leafColor.rgb * forward * backFacing;
          }
        `,
        CUSTOM_FRAGMENT_BEFORE_FOG: `
          color.rgb += demoLeafTranslucency(viewDirectionW, normalW)
            * mix(vec3(1.0), baseColor.rgb, leafMode.y);
        `,
      }
    }
  }

  /** 建出來就掛上去了，實例本身不必留著 */
  // eslint-disable-next-line no-new
  new LeafTranslucencyPlugin(material, 'DemoLeafTranslucency', 220, {}, true, true)

  return {
    setAmount(value) {
      state.amount = value
    },
    setForwardPower(value) {
      state.forwardPower = value
    },
    setNormalDistortion(value) {
      state.normalDistortion = value
    },
    setBackFacingRatio(value) {
      state.backFacingRatio = value
    },
    setTintRatio(value) {
      state.tintRatio = value
    },
  }
}

export interface LeafTree {
  /** 樹冠那份材質，滑桿要改的是它身上的外掛 */
  translucency: LeafTranslucencyHandle;
  crown: Mesh;
}

export interface CreateLeafTreeParam {
  babylon: BabylonModule;
  scene: Scene;
  name: string;
  /** 葉子的顏色，零到二五五 */
  leafColor: readonly [number, number, number];
  /** 樹種在哪裡 */
  offsetX?: number;
  offsetZ?: number;
}

/**
 * 一棵方塊樹
 *
 * 樹幹一根，樹冠是一堆一格見方的葉子方塊合併成的橢球。
 * 合併之後整棵樹只有一次繪製呼叫，範例才跑得順
 */
export function createLeafTree({
  babylon,
  scene,
  name,
  leafColor,
  offsetX = 0,
  offsetZ = 0,
}: CreateLeafTreeParam): LeafTree {
  const trunkMaterial = new babylon.StandardMaterial(`${name}-trunk-material`, scene)
  trunkMaterial.diffuseTexture = createLeafTexture(
    babylon,
    scene,
    `${name}-trunk-texture`,
    [96, 68, 44],
  )
  trunkMaterial.specularColor = new babylon.Color3(0, 0, 0)

  const trunk = babylon.MeshBuilder.CreateBox(
    `${name}-trunk`,
    { width: 1, height: 4, depth: 1 },
    scene,
  )
  trunk.position.set(offsetX, 2, offsetZ)
  trunk.material = trunkMaterial

  const leafMaterial = new babylon.StandardMaterial(`${name}-leaf-material`, scene)
  leafMaterial.diffuseTexture = createLeafTexture(babylon, scene, `${name}-leaf-texture`, leafColor)
  leafMaterial.specularColor = new babylon.Color3(0, 0, 0)

  const random = createRandom(1234567)
  const blockList: Mesh[] = []

  for (let x = -3; x <= 3; x++) {
    for (let y = -2; y <= 2; y++) {
      for (let z = -3; z <= 3; z++) {
        const radius = (x / 3.2) ** 2 + (y / 2.4) ** 2 + (z / 3.2) ** 2
        if (radius > 0.85 + random() * 0.3)
          continue

        const block = babylon.MeshBuilder.CreateBox(
          `${name}-leaf-${x}-${y}-${z}`,
          { size: 1 },
          scene,
        )
        block.position.set(offsetX + x, 5.2 + y, offsetZ + z)
        blockList.push(block)
      }
    }
  }

  /**
   * 整團葉子合併成一顆網格
   *
   * 八十幾顆方塊各自一次繪製呼叫，一頁上放四個範例就開始卡了
   */
  const merged = babylon.Mesh.MergeMeshes(blockList, true, true)
  const crown = merged ?? babylon.MeshBuilder.CreateBox(`${name}-crown`, { size: 5 }, scene)
  crown.name = `${name}-crown`
  crown.material = leafMaterial

  return {
    crown,
    translucency: attachLeafTranslucency(babylon, leafMaterial),
  }
}

export interface LeafSceneOption {
  babylon: BabylonModule;
  scene: Scene;
  /** 地面要不要鋪出來，並排比較的範例可以省掉 */
  groundVisible?: boolean;
}

/**
 * 逆光的基本佈置
 *
 * 一道貼著地平線、往鏡頭方向照過來的陽光，加上一點天光。
 * 天光刻意壓得很低，背光面本來就該是暗的
 */
export function createLeafScene({ babylon, scene, groundVisible = true }: LeafSceneOption) {
  const sun = new babylon.DirectionalLight(
    'sun',
    new babylon.Vector3(...SUN_DIRECTION),
    scene,
  )
  sun.intensity = 1.6
  sun.diffuse = new babylon.Color3(1, 0.95, 0.82)
  sun.specular = new babylon.Color3(0, 0, 0)

  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.34
  ambient.diffuse = new babylon.Color3(0.52, 0.6, 0.78)
  ambient.groundColor = new babylon.Color3(0.24, 0.22, 0.2)
  ambient.specular = new babylon.Color3(0, 0, 0)

  if (groundVisible) {
    const ground = babylon.MeshBuilder.CreateGround('ground', { width: 40, height: 40 }, scene)
    const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
    groundMaterial.diffuseColor = new babylon.Color3(0.26, 0.28, 0.2)
    groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
    ground.material = groundMaterial
  }

  return { sun, ambient }
}
