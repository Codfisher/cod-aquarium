# 專案概述

此專案為鱈魚（codlin）的個人部落格

## Coding Style

- 變數名稱禁止使用縮，除非是 url 這種廣為人知的縮寫
- 矩陣資料用 list 結尾。例如：Hole[]，應該命名為 holeList 而不是 holes。物件內多個參數才用複數結尾，例如 Vue 的 props、attrs
  此目的是為了與 Vue 本身的命名規則保持相容，避免混淆。
- Boolean 使用以下準則：
  - 前綴使用 is/has/can/should 等詞。例如：isValid、hasPermission、canExecute、shouldUpdate。
  - 當名稱本身已是明確且慣用的狀態形容詞，且單獨使用即可清楚表達布林語意時，可省略 is/has/can/should 前綴。例如：visible、enabled。
- Map、Set 資料用 map、set 結尾。例如：Map<string, Hole>，應該命名為 holeMap 而不是 holesMap。
- 變數命名禁止以動詞開頭。例如：showKnob 應該改為 knobVisible。
- 函數名稱應以動詞開頭，並從呼叫者角度描述要執行的動作，而非內部實作、角色或結果。例如 userData()、profileUpdated() 應改為 getUser()、updateProfile()。

- **TypeScript**:
  - 禁止使用 `any`，必須定義明確的 Interface 或 Type。

## AI 行為準則 (Instructions for AI)

當你生成程式碼或回答問題時，請遵守：

1. **回應語言**：除非另有指示，否則請使用正體中文，且結尾統一加上 `🐟` 符號。
2. **Commit Message**：請使用中文，並遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hant/v1.0.0/) 的格式。
3. **不要主動 commit**：除非使用者明確要求，否則不要自動 git commit。

## 寫作風格規則（Writing Style）

1. 請使用精煉、道地的用語，去除冗詞贅字。
2. 禁止翻譯腔、歐化中文等，少用『的』、『把』、『進行』等字眼。具體可參考此[文件](https://zh.wikipedia.org/zh-tw/%E6%AD%90%E5%8C%96%E4%B8%AD%E6%96%87)
3. 撰寫部落格文章時，請使用 `/write-style` skill 載入完整規則。
