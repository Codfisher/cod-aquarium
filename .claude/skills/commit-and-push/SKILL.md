---
name: commit-and-push
description: 產生符合 Conventional Commits 的中文 commit 訊息並 push 到遠端
---

# Commit and Push

## 步驟

1. 執行 `git status` 查看所有變更檔案
2. 執行 `git diff` 和 `git diff --cached` 檢視具體變更內容
3. 根據變更內容判斷 commit 類型：
   - `feat`: 新功能
   - `fix`: 修復 Bug
   - `refactor`: 重構
   - `docs`: 文件變更
   - `style`: 程式碼風格調整
   - `test`: 測試相關
   - `chore`: 建置、依賴更新等雜項
4. 產生中文 commit 訊息，格式：`<type>(<scope>): <中文描述>`
5. 將相關檔案加入暫存區（排除 .env、credentials 等敏感檔案）
6. 執行 `git commit`
7. 執行 `git push` 推送到遠端

## 注意事項

- Commit 訊息必須使用中文
- 遵循 Conventional Commits 格式
- 描述應簡潔明確，說明「為什麼」而非「做了什麼」
- 推送前確認目前分支與遠端分支的對應關係
- 不要加上 Co Author
