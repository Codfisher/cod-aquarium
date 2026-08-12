import type { ParticleSystem } from '@babylonjs/core'

/**
 * 讓粒子跟著日夜一起明暗
 *
 * 粒子不吃場景光照，顏色是寫死在系統上的常數。
 * 入夜之後整個世界暗下來，只有落葉、雨絲與霧氣還維持著大白天的亮度，
 * 浮在暗景前面像貼在螢幕上的貼紙——這是整套日夜循環最容易露餡的地方。
 *
 * 這裡在建立當下記住原本的顏色，之後每次都拿原色去乘，
 * 不是在現值上再乘一次；否則調個幾次就會越調越黑，再也回不來
 */
export interface ParticleDimmer {
  /** ratio 為 1 是原本的顏色，越小越暗 */
  setBrightness: (ratio: number) => void;
}

interface GradientBackup {
  entry: { color1: { r: number; g: number; b: number }; color2?: { r: number; g: number; b: number } };
  color1: [number, number, number];
  color2: [number, number, number] | null;
}

interface SystemBackup {
  system: ParticleSystem;
  color1: [number, number, number];
  color2: [number, number, number];
  colorDead: [number, number, number];
  gradientList: GradientBackup[];
}

export function createParticleDimmer(systemList: ParticleSystem[]): ParticleDimmer {
  const backupList: SystemBackup[] = systemList.map((system) => ({
    system,
    color1: [system.color1.r, system.color1.g, system.color1.b],
    color2: [system.color2.r, system.color2.g, system.color2.b],
    colorDead: [system.colorDead.r, system.colorDead.g, system.colorDead.b],
    /**
     * 用了顏色梯度的系統，color1 / color2 就形同虛設
     *
     * 粒子每一幀是從梯度上取色的，所以要改的是梯度本身。
     * 就地改梯度上的顏色物件即可，連活著的粒子都會跟著變
     */
    gradientList: (system.getColorGradients() ?? []).map((entry) => ({
      entry,
      color1: [entry.color1.r, entry.color1.g, entry.color1.b],
      color2: entry.color2 ? [entry.color2.r, entry.color2.g, entry.color2.b] : null,
    })),
  }))

  let lastRatio = 1

  return {
    setBrightness(ratio: number) {
      /** 差得夠多才動手，這是每一幀都會被呼叫的路徑 */
      if (Math.abs(ratio - lastRatio) < 0.01)
        return

      lastRatio = ratio

      for (const backup of backupList) {
        /**
         * 只縮放顏色，透明度原封不動
         *
         * alpha 是粒子一生的淡入淡出在用的，動到它葉子會憑空出現或消失
         */
        applyColor(backup.system.color1, backup.color1, ratio)
        applyColor(backup.system.color2, backup.color2, ratio)
        applyColor(backup.system.colorDead, backup.colorDead, ratio)

        for (const gradient of backup.gradientList) {
          applyColor(gradient.entry.color1, gradient.color1, ratio)
          if (gradient.entry.color2 && gradient.color2) {
            applyColor(gradient.entry.color2, gradient.color2, ratio)
          }
        }
      }
    },
  }
}

function applyColor(
  target: { r: number; g: number; b: number },
  base: [number, number, number],
  ratio: number,
): void {
  target.r = base[0] * ratio
  target.g = base[1] * ratio
  target.b = base[2] * ratio
}
