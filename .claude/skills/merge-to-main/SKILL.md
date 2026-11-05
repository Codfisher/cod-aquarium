---
name: merge-to-main
description: 把 develop 合併進 main 並推送（觸發 Cloudflare Pages 部署），含各 aquarium 子專案獨立版號的自動推進，再用 cf CLI 確認部署成功，並到正式網域用瀏覽器檢查網頁正常
---

# Merge to Main

把目前的 develop 合併進 main 並推送到遠端。push main 會觸發 Cloudflare Pages 的 production 部署，所以合併前務必確認範圍。

## 前置檢查

1. `git status --short` 確認工作區乾淨；有未提交變更就先跑 `/commit-and-push`，不要把未提交的東西夾帶進合併。
2. `git fetch origin` 後 `git log --oneline main..develop` 確認 develop 確實領先 main；沒有領先就直接回報「無可合併內容」並停止。
3. 確認目前在 develop，且與 `origin/develop` 同步（`git status -sb`）。
4. 子專案版號自動推進（此專案沒有全域版本號，根目錄 `package.json` 沒有 `version` 欄位；版號是每個 `content/aquarium/<子專案>/` 各自獨立管理，通常是該子專案 `constants/index.ts` 或 `constants/version.ts` 匯出的 `version`，並在畫面上顯示 `v{{ version }}`）：
   - `git diff --stat main..develop -- content/aquarium/` 找出這次有變動的子專案。
   - 對每個有變動的子專案，找出它的 version 檔案（沒有的話代表這個子專案不掛版號，略過），比對 `git show main:<路徑>` 與工作區同檔案的 version 值是否不同。
   - 版號沒變時，用 `git log --oneline main..develop -- content/aquarium/<子專案>/` 看這批 commit 的 type 判斷該推哪一級：出現任一 `feat` 就推 minor；沒有 `feat` 但有 `fix`／其他程式行為異動就推 patch；commit 全部是 `docs`、資料調整這類不影響程式行為的異動則不推。
   - **判定要推版號就直接推，不用先問使用者**：修改該子專案的 version 檔案（對應 semver 位數 +1，minor 進位時 patch 歸零），以 `chore(<子專案>): 版本號升級至 x.y.z` 單獨 commit 到 develop 並 `git push origin develop`，再繼續走下面的合併步驟。只有在版號檔案格式特殊、無法判斷怎麼加一時才停下來問使用者。

## 合併步驟

1. `git checkout main`
2. `git fetch origin main`，用 `git rev-parse main origin/main` 確認本地 main 與 `origin/main` 沒有落差。
   - **不要用 `git pull --ff-only`**：這個專案的 fetch refspec 設定會讓它報 `Cannot fast-forward to multiple branches`，改用 `git fetch origin main` 後自行比對即可。
   - 本地 main 落後就 `git merge --ff-only origin/main` 追上；有分歧則停下來回報，不要自行 rebase 或強推。
3. `git merge --no-ff develop -m "merge: 合併 develop 的<這次變更摘要>"`
   - 一律 `--no-ff`，非 ff、不開 PR，保留合併點（與既有歷史一致，可用 `git log --merges -5 --format=%s` 對照）。
   - 訊息格式固定用 `merge:` 前綴（不是 `chore(release):`，也不含版號——此專案沒有全域版號可放），摘要取 `main..develop` 這批 commit 的重點，簡短中文描述即可。
   - 有衝突就停下來回報衝突檔案，不要自行猜測解法。
4. `git push origin main`
5. `git checkout develop` 切回開發分支收尾。

## 部署檢查（cf CLI）

push main 後 Cloudflare Pages（專案 `cod-aquarium`，網域 `codlin.me`）會自動建置並部署，一次 production build 約 7 到 10 分鐘。推送完一律跑部署檢查，確認線上正常才算完成：

```sh
node .claude/skills/merge-to-main/check-deploy.mjs "$(git rev-parse main)"
```

- 腳本用 Cloudflare 新的 `cf` CLI（目前 beta）依序檢查，每項印 ✅／❌，有任何 ❌ 時 exit 1：
  1. `cf auth whoami`：確認已登入。
  2. `cf pages deployments list --project-name cod-aquarium --env production` 每 30 秒輪詢，找出 `commit_hash` 等於這次 main commit 的 deployment，等到 `deploy` 階段結束（上限 40 分鐘），確認是 `success`；任何階段 `failure` 或 `canceled` 就中止，並用 `cf pages deployments history logs get <deployment-id>` 印出 build log 最後 40 行。
  3. 線上頁面：`/`、`/article-overview`、一篇代表性文章、`/aquarium/meme-cache/`、`/aquarium/codmarbles/`、`/sitemap.xml`、`/robots.txt`、`/feed.rss` 皆 200，首頁 HTML 不得短於 1 萬字元（SSG 輸出被截斷的症狀）。
- 用 Bash 工具 `run_in_background` 執行，完成時會自動收到通知；**不要另外 sleep 或自行重複查詢**。
- push develop 也會觸發 preview build，不影響檢查：腳本只看 `--env production` 且 commit hash 吻合的那一筆。
- 腳本把 cf 釘在 `cf@1.0.0-beta.27` 透過 `npx` 執行：**`npx cf` 不帶版本會撿到 npx 快取裡同名的舊套件（v0.15，指令完全不同）**。要升 cf 版本時先手動跑一次腳本確認輸出格式沒變，再改腳本內的 `CF` 常數。
- cf 有自己的登入（不沿用 wrangler 的）。未登入時腳本會中斷並提示，`auth login` 需開瀏覽器授權，請使用者自己執行，不要代跑。
- 手動查其他指令時先用 `npx --yes cf@1.0.0-beta.27 cli search "<要做的事>"` 找指令，再對該指令加 `--help`；cf 輸出預設是 JSON。
- 檢查失敗時的處理：
  - build 失敗：依 build log 判斷原因回報（逾時見 [docs/development-notes.md](../../../docs/development-notes.md) 的「build 逾時」），不要自行改 main 或強推修補。
  - 頁面失敗：回報失敗項目與狀態碼，由使用者決定是否回滾（Pages 回滾屬對外操作，須先取得同意）。

## 正式網域瀏覽器檢查

部署檢查全數 ✅ 後，再到正式網域 `https://codlin.me` 用真的瀏覽器逐頁檢查。上一步的 HTTP 檢查只看得到 SSG 吐出的 HTML，hydration 之後才出現的問題要靠這一步：

```sh
node .claude/skills/merge-to-main/check-site.mjs "<scratchpad>/site-check"
```

- 用專案的 `playwright`（Chromium）以桌機 1280×800 與手機 Pixel 7 各開一次 `/`、`/article-overview`、一篇代表性文章、`/aquarium/meme-cache/`、`/aquarium/codmarbles/`，每頁檢查：
  - 回應 200，且 h1 包含該頁預期的標題文字（`layout: false` 的整頁式子專案沒有 h1，改驗 `document.title`）。
  - 沒有 JS 錯誤（`pageerror`）、`console.error`、hydration mismatch 警告；headless Chromium 自己丟的 `Permissions policy violation` 是瀏覽器雜訊，腳本已排除。
  - 同網域的請求沒有 4xx／5xx 或載入失敗；頁面沒有破圖；沒有橫向溢出（手機版跑版）。
- 最後收集所有頁面上的站內連結逐一請求，確認沒有死連結。
- 每頁存一張首屏截圖到指定目錄（不指定時放在系統暫存的 `cod-site-check`），路徑印在輸出最後。**至少用 Read 看過桌機與手機的首頁、一個子專案頁截圖**，確認版面、字型、圖片正常，不是只看 ✅。
- 用 Bash 工具前景執行、timeout 設 `600000`；有 ❌ 時 exit 1，失敗細節會縮排列在該頁底下。
- 新增子專案或改了頁面 h1 文字時，同步更新腳本裡的 `PAGES`。

## 注意事項

- 合併訊息使用中文，格式為 `merge: 合併 develop 的<摘要>`。
- 禁止 `--force` 推送 main；禁止改寫歷史。
- 禁止在 commit message 加上 Co Author。
- 不要自行開 dev server 或跑 `npm run build`；部署的 build 由 Cloudflare 端執行。
- 收尾回報要寫清楚：合併後的 main commit hash、目前所在分支、前置檢查自動推進過的子專案版號清單（沒有就說沒有）、部署檢查結果（deployment id 與耗時、頁面檢查是否全數通過）、正式網域瀏覽器檢查結果（頁面數、連結數、目視截圖的觀察）；有 ❌ 就列出失敗項目。
