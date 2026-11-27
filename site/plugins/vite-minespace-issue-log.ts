import type { Plugin } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 與 content/aquarium/minespace/composables/issue-log-channel.ts 的事件名一致 */
const EVENT_NAME = 'minespace:issue-log'

/** 寫在專案根目錄底下；`*.log*` 已在 .gitignore 裡，不會進版控 */
const LOG_PATH = 'logs/minespace-issues.log'

/**
 * 專案根目錄，從這支檔案的位置往上推
 *
 * 不能用 server.config.root：Nuxt 把 Vite 的 root 設成 srcDir（app/），
 * 拿它來解析會寫到 app/logs 底下，終端機印的路徑卻是 logs/，找不到檔案
 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

interface IssueLogPayload {
  /** auto：出現新種類的錯誤或警告時自動送；manual：按 F6 */
  reason: 'auto' | 'manual';
  errorTotal: number;
  warningTotal: number;
  report: string;
}

function isIssueLogPayload(data: unknown): data is IssueLogPayload {
  if (typeof data !== 'object' || data === null)
    return false

  const payload = data as Record<string, unknown>
  return typeof payload.report === 'string'
    && typeof payload.errorTotal === 'number'
    && typeof payload.warningTotal === 'number'
}

/**
 * Minespace 的錯誤紀錄經 HMR 通道送到 dev server，寫進檔案
 *
 * 原本是在瀏覽器裡自動下載一份 txt：每次出錯就多一個檔案，
 * 還得從下載資料夾撿回來才看得到。改成由 dev server 直接寫進專案裡的固定位置，
 * 檔案永遠是最新的一份完整紀錄，終端機另外印一行摘要。
 *
 * 只在 dev server 掛上（apply: 'serve'），正式建置不受影響
 */
export function viteMinespaceIssueLog(): Plugin {
  return {
    name: 'site:minespace-issue-log',
    apply: 'serve',
    configureServer(server) {
      const filePath = resolve(PROJECT_ROOT, LOG_PATH)

      server.ws.on(EVENT_NAME, async (data: unknown) => {
        if (!isIssueLogPayload(data))
          return

        try {
          await mkdir(resolve(filePath, '..'), { recursive: true })
          await writeFile(filePath, data.report, 'utf8')
          const reasonText = data.reason === 'manual' ? 'F6' : '自動'
          server.config.logger.info(
            `[minespace] ${reasonText}寫入問題紀錄：錯誤 ${data.errorTotal}、警告 ${data.warningTotal} → ${LOG_PATH}`,
            { timestamp: true },
          )
        }
        catch (error) {
          server.config.logger.error(`[minespace] 寫入問題紀錄失敗：${String(error)}`)
        }
      })
    },
  }
}
