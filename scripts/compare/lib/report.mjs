import { SEVERITY_LIST } from './page-checks.mjs'

const SEVERITY_LABEL_MAP = {
  critical: 'CRITICAL',
  major: 'MAJOR',
  minor: 'MINOR',
  info: 'INFO',
}

function getSeverityRank(severity) {
  return SEVERITY_LIST.indexOf(severity)
}

function getWorstSeverity(findingList) {
  return findingList.reduce(
    (worst, finding) => getSeverityRank(finding.severity) < getSeverityRank(worst) ? finding.severity : worst,
    'info',
  )
}

function sortFindingList(findingList) {
  return [...findingList].sort((a, b) => getSeverityRank(a.severity) - getSeverityRank(b.severity))
}

function toDetailMarkdown(detail) {
  if (detail === undefined)
    return ''
  const json = JSON.stringify(detail, null, 2)
  const clippedJson = json.length > 3000 ? `${json.slice(0, 3000)}\n…（完整內容見 report.json）` : json
  return `\n\n  <details><summary>細節</summary>\n\n  \`\`\`json\n${clippedJson.split('\n').map((line) => `  ${line}`).join('\n')}\n  \`\`\`\n\n  </details>`
}

function toFindingMarkdown(finding) {
  return `- **[${SEVERITY_LABEL_MAP[finding.severity]}]** \`${finding.category}\` ${finding.message}${toDetailMarkdown(finding.detail)}`
}

/** 產生易讀的 Markdown 報告：整體摘要 → 全站檔案 → 各頁（依最嚴重程度排序） */
export function toMarkdownReport({ meta, siteFindingList, pageResultList }) {
  const allFindingList = [...siteFindingList, ...pageResultList.flatMap((result) => result.findingList)]
  const countMap = Object.fromEntries(SEVERITY_LIST.map((severity) => [
    severity,
    allFindingList.filter((finding) => finding.severity === severity).length,
  ]))
  const sortedPageResultList = [...pageResultList].sort((a, b) =>
    getSeverityRank(getWorstSeverity(a.findingList)) - getSeverityRank(getWorstSeverity(b.findingList))
    || b.findingList.filter((finding) => finding.severity !== 'info').length - a.findingList.filter((finding) => finding.severity !== 'info').length,
  )

  const lineList = [
    '# 正式站與本機建置比對報告',
    '',
    `- 時間：${meta.generatedAt}`,
    `- 正式站：${meta.remoteOrigin}`,
    `- 本機：${meta.localOrigin}（${meta.localSource}）`,
    `- 頁數：${pageResultList.length}${meta.isBrowserSkipped ? '（略過瀏覽器檢查）' : ''}`,
    '',
    '| 嚴重度 | 數量 |',
    '| --- | --- |',
    ...SEVERITY_LIST.map((severity) => `| ${SEVERITY_LABEL_MAP[severity]} | ${countMap[severity]} |`),
    '',
    '## 各頁概況',
    '',
    '| 頁面 | 最嚴重 | CRITICAL | MAJOR | MINOR |',
    '| --- | --- | --- | --- | --- |',
    ...sortedPageResultList.map((result) => {
      const count = (severity) => result.findingList.filter((finding) => finding.severity === severity).length
      return `| ${result.path} | ${SEVERITY_LABEL_MAP[getWorstSeverity(result.findingList)]} | ${count('critical')} | ${count('major')} | ${count('minor')} |`
    }),
    '',
    '## 全站檔案與行為',
    '',
  ]

  const siteTargetList = [...new Set(siteFindingList.map((finding) => finding.target))]
  for (const target of siteTargetList) {
    lineList.push(`### ${target}`, '')
    lineList.push(...sortFindingList(siteFindingList.filter((finding) => finding.target === target)).map(toFindingMarkdown), '')
  }

  lineList.push('## 各頁細節', '')
  for (const result of sortedPageResultList) {
    const visibleFindingList = sortFindingList(result.findingList)
    lineList.push(`### ${result.path}`, '')
    lineList.push(visibleFindingList.length ? visibleFindingList.map(toFindingMarkdown).join('\n') : '- 無差異', '')
  }

  return `${lineList.join('\n')}\n`
}
