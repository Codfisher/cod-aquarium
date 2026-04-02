# 專案概述

此專案為鱈魚（codlin）的個人部落格

## Coding Style

- 變數名稱禁止使用縮，除非是 url 這種廣為人知的縮寫
- 矩陣資料用 list 結尾。例如：Hole[]，應該命名為 holeList 而不是 holes。物件內多個參數才用複數結尾，例如 Vue 的 props、attrs
  此目的是為了與 Vue 本身的命名規則保持相容，避免混淆。
- Map、Set 資料用 map、set 結尾。例如：Map<string, Hole>，應該命名為 holeMap 而不是 holesMap。

- **TypeScript**:
  - 禁止使用 `any`，必須定義明確的 Interface 或 Type。

## AI 行為準則 (Instructions for AI)

當你生成程式碼或回答問題時，請遵守：

1. **回應語言**：除非另有指示，否則請使用正體中文，且結尾統一加上 `🐟` 符號。
2. **Commit Message**：請使用中文，並遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hant/v1.0.0/) 的格式。
3. **不要主動 commit**：除非使用者明確要求，否則不要自動 git commit。

## 寫作風格規則（Writing Style）

撰寫部落格文章時，請使用 `/write-style` skill 載入完整規則。
