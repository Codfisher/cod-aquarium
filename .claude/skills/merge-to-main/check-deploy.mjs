// merge-to-main 收尾：用 cf CLI 確認 Cloudflare Pages 的 production 部署成功，再檢查線上頁面。
// 用法：node .claude/skills/merge-to-main/check-deploy.mjs <main 的完整 commit hash>
// 結束碼：0 全部通過；1 有項目失敗（輸出會標出是哪一項）。
import { execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

// 釘版本：`npx cf` 不帶版本會撿到 npx 快取裡同名的舊套件（v0.15，指令完全不同）。
// cf 仍在 beta，升版前先手動跑一次本腳本，確認輸出格式沒變。
const CF = 'cf@1.0.0-beta.27'
const PROJECT = 'cod-aquarium'
const SITE = 'https://codlin.me'
const PAGES = [
  '/',
  '/article-overview',
  '/blog-program/what-is-mutation-testing-and-stryker',
  '/aquarium/meme-cache/',
  '/aquarium/codmarbles/',
  '/sitemap.xml',
  '/robots.txt',
  '/feed.rss',
]
// 首頁 HTML 正常約 10 萬字元，低於這個值代表 SSG 輸出被截斷或只剩殼
const HOME_MIN_LENGTH = 10_000
const POLL_MS = 30_000
// 一次 production build 約 7 到 10 分鐘，迷因匯入量大時 generateImages() 會更久，上限抓 40 分鐘
const BUILD_TIMEOUT_MS = 40 * 60_000
const FINISHED_STATUSES = ['success', 'failure', 'canceled']

let failed = false

function cf(...args) {
  // Windows 的 npx 是 .cmd，必須走 shell
  const out = execFileSync('npx', ['--yes', CF, ...args, '-q'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(out)
}

function report(ok, label, detail) {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? `：${detail}` : ''}`)
  if (!ok) failed = true
}

function findDeployment(commit) {
  return cf('pages', 'deployments', 'list', '--project-name', PROJECT, '--env', 'production', '--per-page', '10')
    .find(item => item.deployment_trigger?.metadata?.commit_hash === commit)
}

function isFinished(deployment) {
  const { latest_stage: latestStage, stages } = deployment
  const hasStageEnded = stages.some(stage => stage.status === 'failure' || stage.status === 'canceled')
  return hasStageEnded || (latestStage.name === 'deploy' && FINISHED_STATUSES.includes(latestStage.status))
}

async function waitForDeployment(commit) {
  const deadline = Date.now() + BUILD_TIMEOUT_MS
  while (Date.now() < deadline) {
    const deployment = findDeployment(commit)
    if (deployment && isFinished(deployment)) return deployment
    const state = deployment ? `${deployment.latest_stage.name} ${deployment.latest_stage.status}` : '尚未建立'
    console.log(`… deployment ${state}，${POLL_MS / 1000}s 後再查`)
    await sleep(POLL_MS)
  }
  return undefined
}

function printBuildLogTail(deploymentId, count) {
  const { data } = cf('pages', 'deployments', 'history', 'logs', 'get', deploymentId, '--project-name', PROJECT)
  for (const item of data.slice(-count)) console.log(`   ${item.line}`)
}

async function checkPages() {
  for (const path of PAGES) {
    const res = await fetch(`${SITE}${path}`)
    const body = await res.text()
    const isHomeTooShort = path === '/' && body.length < HOME_MIN_LENGTH
    report(res.status === 200 && !isHomeTooShort, `GET ${path}`, `${res.status}，${body.length} 字元`)
  }
}

async function main() {
  const commit = process.argv[2]
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error('請傳入完整 40 碼的 main commit hash（git rev-parse main）')

  const auth = cf('auth', 'whoami')
  if (!auth.authenticated || !auth.tokenValid) throw new Error(`cf 未登入，請使用者自行執行 npx ${CF} auth login`)

  const deployment = await waitForDeployment(commit)
  if (!deployment) throw new Error(`等了 ${BUILD_TIMEOUT_MS / 60_000} 分鐘仍找不到 ${commit.slice(0, 7)} 已結束的 production deployment`)

  const { latest_stage: latestStage } = deployment
  const isSuccess = latestStage.name === 'deploy' && latestStage.status === 'success'
  const failedStage = deployment.stages.find(stage => stage.status === 'failure' || stage.status === 'canceled')
  const elapsedMinutes = ((Date.parse(latestStage.ended_on) - Date.parse(deployment.created_on)) / 60_000).toFixed(1)
  report(isSuccess, 'Pages Build', isSuccess
    ? `success（${deployment.id}，耗時 ${elapsedMinutes} 分鐘）`
    : `${failedStage?.name ?? latestStage.name} ${failedStage?.status ?? latestStage.status}（${deployment.id}）`)
  if (!isSuccess) {
    console.log('--- build log 最後 40 行 ---')
    printBuildLogTail(deployment.id, 40)
    return
  }

  await checkPages()
}

try {
  await main()
}
catch (error) {
  report(false, '檢查中斷', error instanceof Error ? error.message : String(error))
}
process.exitCode = failed ? 1 : 0
