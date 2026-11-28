// 依序跑 oxlint（script）與 ESLint（只檢查 .vue template），兩個都跑完才回報，任一個失敗就以非 0 結束。
// 用 Node 而不是 shell 串接，是因為 Windows 的 npm script 走 cmd.exe，POSIX 語法不通用。
// 傳 --fix 會兩邊都帶上修正；其餘參數原樣轉給兩個工具，例如 `npm run lint:fix -- path/to/file.vue`。
// ESLint 在 oxlint 支援 Vue template 後退場，屆時刪掉這支腳本、改回 `oxlint`。
import { spawnSync } from 'node:child_process'

const argList = process.argv.slice(2)
const fileList = argList.filter((arg) => !arg.startsWith('-'))
const flagList = argList.filter((arg) => arg.startsWith('-'))

function run(label, command) {
  process.stdout.write(`\n=== ${label} ===\n`)
  const result = spawnSync(command, { stdio: 'inherit', shell: true })
  return result.status ?? 1
}

const quotedFileList = fileList.map((file) => `"${file}"`).join(' ')
const flagText = flagList.join(' ')
const vueTarget = fileList.length > 0 ? quotedFileList : '"**/*.vue"'

const oxcStatus = run('oxlint', `npx oxlint ${flagText} ${quotedFileList}`.trim())
const vueStatus = run('eslint（Vue template）', `npx eslint ${flagText} ${vueTarget}`.trim())

process.stdout.write(`\noxlint exit ${oxcStatus}，eslint exit ${vueStatus}\n`)
process.exit(oxcStatus || vueStatus ? 1 : 0)
