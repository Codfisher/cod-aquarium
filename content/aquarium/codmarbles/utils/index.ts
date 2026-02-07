import type { BaseTexture, Material, Scene } from '@babylonjs/core'
import {
  Color3,
  PBRMaterial,
  StandardMaterial,
} from '@babylonjs/core'
import { GradientMaterial } from '@babylonjs/materials'

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x))
}

function lighten(c: Color3, t = 0.12) {
  return new Color3(
    clamp01(c.r + (1 - c.r) * t),
    clamp01(c.g + (1 - c.g) * t),
    clamp01(c.b + (1 - c.b) * t),
  )
}

function darken(c: Color3, t = 0.12) {
  return new Color3(
    clamp01(c.r * (1 - t)),
    clamp01(c.g * (1 - t)),
    clamp01(c.b * (1 - t)),
  )
}

function looksLikeWhite(c: Color3, eps = 1e-3) {
  return Math.abs(c.r - 1) < eps && Math.abs(c.g - 1) < eps && Math.abs(c.b - 1) < eps
}

/**
 * 從貼圖讀一小塊像素算平均色（代表色）
 * - 只讀 16x16 區域，成本相對可控
 * - 透明像素(alpha~0)會略過，避免被透明區稀釋
 */
async function averageColorFromTexture(tex: BaseTexture, sampleSize = 16): Promise<Color3 | null> {
  try {
    const p = tex.readPixels(
      undefined, // faceIndex
      0, // level（mipmap level）
      null,
      true, // flushRenderer
      false, // noDataConversion -> 讓 babylon 幫你轉成 Uint8Array/Float32Array
      0,
      0,
      sampleSize,
      sampleSize,
    )
    if (!p)
      return null

    const buf = await p

    let r = 0
    let g = 0
    let b = 0
    let n = 0

    const isFloat = buf instanceof Float32Array
    const arr: ArrayLike<number> = buf as any

    for (let i = 0; i + 3 < arr.length; i += 4) {
      const a = arr[i + 3]!
      // alpha 可能是 0~255 或 0~1，這邊都處理
      const alpha = isFloat ? a : a / 255
      if (alpha < 0.05)
        continue

      const rr = isFloat ? arr[i] : arr[i]! / 255
      const gg = isFloat ? arr[i + 1] : arr[i + 1]! / 255
      const bb = isFloat ? arr[i + 2] : arr[i + 2]! / 255

      r += rr
      g += gg
      b += bb
      n++
    }

    if (n === 0)
      return null
    return new Color3(r / n, g / n, b / n)
  }
  catch {
    // 壓縮貼圖/某些情況 readPixels 可能失敗：直接回 null，讓上層用 factor 顏色 fallback
    return null
  }
}

function multiplyColor(a: Color3, b: Color3) {
  return new Color3(a.r * b.r, a.g * b.g, a.b * b.b)
}

/** ✅ 取得「原材質的代表色」：優先用 factor*textureAvg，否則用 factor */
async function getBaseColorFromMaterialAsync(mat: Material | null | undefined): Promise<Color3> {
  if (!mat)
    return new Color3(0.85, 0.85, 0.85)

  // glTF 常見：PBRMaterial
  if (mat instanceof PBRMaterial) {
    const factor = mat.albedoColor?.clone?.() ?? new Color3(1, 1, 1)
    const tex = mat.albedoTexture ?? null

    // 如果 factor 幾乎是白，而且有貼圖：用貼圖平均色當主色
    if (tex && looksLikeWhite(factor)) {
      const avg = await averageColorFromTexture(tex)
      if (avg)
        return avg
    }

    // 有貼圖但 factor 不是白：用 factor * avg（接近 glTF 規則）
    if (tex) {
      const avg = await averageColorFromTexture(tex)
      if (avg)
        return multiplyColor(factor, avg)
    }

    return factor
  }

  // StandardMaterial
  if (mat instanceof StandardMaterial) {
    const factor = mat.diffuseColor?.clone?.() ?? new Color3(1, 1, 1)
    const tex = mat.diffuseTexture ?? null

    if (tex && looksLikeWhite(factor)) {
      const avg = await averageColorFromTexture(tex)
      if (avg)
        return avg
    }

    if (tex) {
      const avg = await averageColorFromTexture(tex)
      if (avg)
        return multiplyColor(factor, avg)
    }

    return factor
  }

  // 其他材質：嘗試抓常見欄位
  const anyMat = mat as any
  const fallback
    = (anyMat.albedoColor?.clone?.() ?? anyMat.diffuseColor?.clone?.() ?? new Color3(1, 1, 1)) as Color3

  return fallback
}

/** 用 baseColor 生成柔和漸層 */
function getGradientFromBaseColor(base: Color3, scene: Scene): GradientMaterial {
  const grad = new GradientMaterial(`grad_${Math.random().toString(16).slice(2)}`, scene)

  grad.topColor = lighten(base, 0.14)
  grad.bottomColor = darken(base, 0.10)

  grad.smoothness = 1.0
  grad.scale = 0.85
  grad.offset = 0.15

  grad.disableLighting = false
  return grad
}

/** ✅ async cache：避免同材質重複讀貼圖像素 */
const gradientCache = new Map<number, Promise<GradientMaterial>>()

export async function getGradientFromOriginalAsync(
  original: Material | null | undefined,
  scene: Scene,
): Promise<GradientMaterial> {
  const key = (original as any)?.uniqueId ?? -1

  const cached = gradientCache.get(key)
  if (cached)
    return await cached

  const task = (async () => {
    const base = await getBaseColorFromMaterialAsync(original)
    return getGradientFromBaseColor(base, scene)
  })()

  gradientCache.set(key, task)
  return await task
}
