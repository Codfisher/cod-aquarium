---
name: merge-to-main
description: 把 develop 合併進 main 並推送，含各 aquarium 子專案獨立版號的自動推進
---

# Merge to Main

把目前的 develop 合併進 main 並推送到遠端。

## 前置檢查

1. `git status --short` 確認工作區乾淨；有未提交變更就先跑 `/commit-and-push`，不要把未提交的東西夾帶進合併。
2. `git log --oneline main..develop` 確認 develop 確實領先 main；沒有領先就直接回報「無可合併內容」並停止。
3. 子專案版號自動推進（此專案沒有全域版本號，根目錄 `package.json` 沒有 `version` 欄位；版號是每個 `content/aquarium/<子專案>/` 各自獨立管理，通常是該子專案 `constants/index.ts` 或 `constants/version.ts` 匯出的 `version`，並在畫面上顯示 `v{{ version }}`）：
   - `git diff --stat main..develop -- content/aquarium/` 找出這次有變動的子專案。
   - 對每個有變動的子專案，找出它的 version 檔案（沒有的話代表這個子專案不掛版號，略過），比對 `git show main:<路徑>` 與工作區同檔案的 version 值是否不同。
   - 版號沒變時，用 `git log --oneline main..develop -- content/aquarium/<子專案>/` 看這批 commit 的 type 判斷該推哪一級：出現任一 `feat` 就推 minor；沒有 `feat` 但有 `fix`／其他程式行為異動就推 patch；commit 全部是 `docs`、資料調整這類不影響程式行為的異動則不推。
   - **判定要推版號就直接推，不用先問使用者**：修改該子專案的 version 檔案（對應 semver 位數 +1，minor 進位時 patch 歸零），以 `chore(<子專案>): 版本號升級至 x.y.z` 單獨 commit 到 develop 並 `git push origin develop`，再繼續走下面的合併步驟。只有在版號檔案格式特殊、無法判斷怎麼加一時才停下來問使用者。

## 合併步驟

1. `git checkout main`
2. `git fetch origin main`，確認本地 main 與 `origin/main` 沒有落差。
   - **不要用 `git pull --ff-only`**：這個專案的 fetch refspec 設定會讓它報 `Cannot fast-forward to multiple branches`，改用 `git fetch origin main` 後自行比對即可。
   - 本地 main 落後就 `git merge --ff-only origin/main` 追上；有分歧則停下來回報，不要自行 rebase 或強推。
3. `git merge --no-ff develop -m "merge: 合併 develop 的<這次變更摘要>"`
   - 一律 `--no-ff`，保留合併點（與既有歷史一致）。
   - 訊息格式固定用 `merge:` 前綴（不是 `chore(release):`，也不含版號——此專案沒有全域版號可放），摘要取 `main..develop` 這批 commit 的重點，簡短中文描述即可。
   - 有衝突就停下來回報衝突檔案，不要自行猜測解法。
4. `git push origin main`
5. `git checkout develop` 切回開發分支收尾。

## 注意事項

- 合併訊息使用中文，格式為 `merge: 合併 develop 的<摘要>`。
- 禁止 `--force` 推送 main。
- 禁止在 commit message 加上 Co Author。
- 收尾回報要寫清楚：合併後的 main commit hash、目前所在分支，以及前置檢查自動推進過的子專案版號清單（沒有就說沒有）。
