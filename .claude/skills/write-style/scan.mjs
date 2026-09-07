// 寫作規則的機械掃描：把文章拆成句子，逐條規則列出候選句，供人工逐句判定。
// 用法：node .claude/skills/write-style/scan.mjs <文章路徑>
// 這支腳本只負責「不漏看」，判定違規或例外仍要對照 SKILL.md 的判定方式逐句做。
import fs from 'node:fs'

const filePath = process.argv[2]
if (!filePath) {
  console.error('用法：node scan.mjs <文章路徑>')
  process.exit(1)
}

const lineList = fs.readFileSync(filePath, 'utf8').split('\n')

// 只取散文行：跳過 front matter、程式碼區塊、表格、空行
const proseList = []
let inCode = false
let inFrontMatter = false
lineList.forEach((line, index) => {
  const number = index + 1
  if (number === 1 && line.startsWith('---')) {
    inFrontMatter = true
    return
  }
  if (inFrontMatter) {
    if (line.startsWith('---')) inFrontMatter = false
    return
  }
  if (line.startsWith('```')) {
    inCode = !inCode
    return
  }
  if (inCode || line.startsWith('|') || line.trim() === '') return
  proseList.push({ number, line })
})

const sentenceList = []
for (const { number, line } of proseList) {
  for (const piece of line.split(/(?<=[。？！])/)) {
    if (piece.trim()) sentenceList.push({ number, sentence: piece.trim(), line })
  }
}

const physicalVerb = '消失|撐|收掉|收|壓|燒|砍|切碎|攤開|擋|疊|塞|丟|翻|抓|扛|卡住|垮|埋|踩|跑|走|長出|吃|吐|掉|拔|拉|推|逼|殺|咬|打|站|立|撞|洗|刷|掃'
const abstractNoun = '理由|價值|問題|重複|巢狀|複雜度|前提|結論|需求|規則|指標|門檻|成本|正確率|錯誤|測試|分支|路徑|分數|形狀|劣化|侵蝕|品質|效果|影響|關鍵|差異|結果|意義|邏輯|概念|狀態|行為'

const ruleList = [
  { name: '甲1 「是⋯的」收尾（含是真的、是假的、是對的）', pattern: new RegExp(`是[^，。；「」]{0,12}的[。，；！？」]|是(真|假|對|錯)的`) },
  { name: '甲2 名詞化判斷句', pattern: /是[^，。]{0,15}的(東西|地方|部分|原因|事情|關鍵)/ },
  { name: '甲2 變形 「X 做的是 Y」（動詞躲在主語）', pattern: /[^，。「」]{1,10}的(是|都是|只有)/ },
  { name: '甲3 空泛名詞後接代名詞補述', pattern: /(麻煩|問題|好處|影響|罩門|重點|前提)[，,]\s*(它|這|那)/ },
  { name: '甲4 虛詞動詞與名詞化動作', pattern: /進行|作出|予以|加以|的方式|的動作|的行為/ },
  { name: '甲5 「就是」加指示詞', pattern: /就是(那個|這個|那種|這種|那件|這件)/ },
  { name: '甲4 變形 萬用動詞（靠人看、交給 AI 弄）', pattern: /(靠|由|讓|交給)\s?(人工|人|AI|它|我)\s?(來)?(看|弄|搞|做|處理)|用(看|弄)的/ },
  { name: '乙7 物理動詞配抽象名詞（逐句念「動詞加受詞」）', pattern: new RegExp(`(${physicalVerb})[^，。；]{0,4}(${abstractNoun})|(${abstractNoun})[^，。；]{0,6}(${physicalVerb})`) },
  { name: '丙9 「是XX，不是OO」對比句型', pattern: /不是[^，。]{1,15}[，、](而是|也不是|是)|是[^，。]{1,15}，不是/ },
  { name: '丙10 「連⋯都」', pattern: /連[^，。]{1,10}都/ },
  { name: '丁11 情緒預告', pattern: /有趣的是|等一下|待會|後面會|留到|稍後|這筆帳|會很痛/ },
  { name: '戊13 內文冒號（標題與對話除外）', pattern: /：/, filter: ({ line }) => !line.startsWith('#') && !/^(鱈魚|路人)：/.test(line.trim()) && !/：\s*$/.test(line.trim()) },
  { name: '歐化 被字（慣用語除外）', pattern: /被(?!誤殺|打臉|笑)/ },
  { name: '歐化 冗贅「一個」（計量用法除外）', pattern: /(?<!第|每|哪|另|翻|加了|只翻|一次)一個(?![ `\d])/ },
  { name: '歐化 抽象後綴堆疊', pattern: /(性|化)(與|和|、|跟)[^，。]{0,4}(性|化)|可讀性|可維護性/ },
  { name: '禁用詞彙、自創詞與符號', pattern: /最有感|日常最常撞到|攤開來講|筆者|判分|守門員|三臂|——|·/ },
  { name: '顏文字沒有用 % 包住', pattern: /[ω∀╯╰◉◞◟ﾉ]/, filter: ({ sentence }) => !/%[^%]*%/.test(sentence) },
]

let total = 0
for (const rule of ruleList) {
  const hitList = sentenceList.filter((item) => rule.pattern.test(item.sentence) && (!rule.filter || rule.filter(item)))
  total += hitList.length
  console.log(`\n== ${rule.name}：${hitList.length} 句`)
  for (const { number, sentence } of hitList) console.log(`  L${number}: ${sentence.slice(0, 80)}`)
}
console.log(`\n候選句合計 ${total}，每一句都要寫下判定（違規或引用哪條例外），不得跳過。`)
