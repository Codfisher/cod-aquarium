import type { BaseTexture, Material, Scene } from '@babylonjs/core'
import {
  Color3,
  PBRMaterial,
  StandardMaterial,
  WhenTextureReadyAsync,
} from '@babylonjs/core'
import { GradientMaterial } from '@babylonjs/materials'

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x))
}

function luminance(c: Color3) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
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

function multiplyColor(a: Color3, b: Color3) {
  return new Color3(a.r * b.r, a.g * b.g, a.b * b.b)
}

/** 抽樣貼圖一小塊算平均色（代表色） */
async function averageColorFromTexture(tex: BaseTexture, sampleSize = 16): Promise<Color3 | null> {
  try {
    // 等貼圖真的 ready（下載/轉換/mipmap 等）
    await WhenTextureReadyAsync(tex) // :contentReference[oaicite:2]{index=2}

    // 讀左上角 sampleSize x sampleSize（readPixels 目前是 async Promise）:contentReference[oaicite:3]{index=3}
    const buf = await tex.readPixels(
      undefined, // faceIndex
      0, // level
      null,
      true, // flushRenderer
      false, // noDataConversion
      0,
      0,
      sampleSize,
      sampleSize,
    )

    if (!buf)
      return null

    const isFloat = buf instanceof Float32Array
    const arr: ArrayLike<number> = buf as any

    let r = 0; let g = 0; let b = 0; let n = 0
    for (let i = 0; i + 3 < arr.length; i += 4) {
      const a = arr[i + 3]
      const alpha = isFloat ? a : a / 255
      if (alpha < 0.05)
        continue

      const rr = isFloat ? arr[i] : arr[i] / 255
      const gg = isFloat ? arr[i + 1] : arr[i + 1] / 255
      const bb = isFloat ? arr[i + 2] : arr[i + 2] / 255

      r += rr; g += gg; b += bb; n++
    }
    if (n === 0)
      return null

    const avg = new Color3(r / n, g / n, b / n)

    // 若抽到幾乎純黑（常見於還沒載好/暫存貼圖），當作無效
    if (luminance(avg) < 0.02)
      return null

    return avg
  }
  catch {
    return null
  }
}

async function getBaseColorFromMaterialAsync(mat: Material | null | undefined): Promise<Color3> {
  // 安全 fallback（避免黑一片）
  const SAFE = new Color3(0.80, 0.80, 0.80)
  if (!mat)
    return SAFE

  // PBR / glTF
  if (mat instanceof PBRMaterial) {
    const factor = mat.albedoColor?.clone?.() ?? new Color3(1, 1, 1)
    const tex = mat.albedoTexture ?? null

    if (tex) {
      const avg = await averageColorFromTexture(tex)
      if (avg)
        return multiplyColor(factor, avg)
    }

    // 若 factor 本身很黑，就別直接回黑，給個安全值（你也可以改成 lighten(factor, 0.6)）
    return luminance(factor) < 0.02 ? SAFE : factor
  }

  // Standard
  if (mat instanceof StandardMaterial) {
    const factor = mat.diffuseColor?.clone?.() ?? new Color3(1, 1, 1)
    const tex = mat.diffuseTexture ?? null

    if (tex) {
      const avg = await averageColorFromTexture(tex)
      if (avg)
        return multiplyColor(factor, avg)
    }

    return luminance(factor) < 0.02 ? SAFE : factor
  }

  // 其他材質：盡量抓常見欄位
  const anyMat = mat as any
  const c: Color3
    = anyMat.albedoColor?.clone?.()
      ?? anyMat.diffuseColor?.clone?.()
      ?? new Color3(1, 1, 1)

  return luminance(c) < 0.02 ? SAFE : c
}

function getGradientFromBaseColor(base: Color3, scene: Scene, name = 'grad'): GradientMaterial {
  const grad = new GradientMaterial(name, scene)
  grad.topColor = lighten(base, 0.14)
  grad.bottomColor = darken(base, 0.10)

  grad.smoothness = 1.0
  grad.scale = 0.85
  grad.offset = 0.15
  grad.disableLighting = false
  return grad
}

// 用 Promise cache：避免同材質重複抽樣貼圖
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
    return getGradientFromBaseColor(base, scene, `grad_${key}`)
  })()

  gradientCache.set(key, task)
  return await task
}
