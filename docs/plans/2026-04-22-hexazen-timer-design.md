# Hexazen 計時器功能設計

## 概述

在 hexazen 底部左側新增時鐘 icon，點擊後展開懸浮面板，支援「睡眠計時器」與「番茄鐘」兩種模式。

## 需求摘要

| 功能 | 說明 |
|------|------|
| 入口 | 底部左側新增時鐘 icon 按鈕 |
| 模式 | 睡眠計時器 / 番茄鐘，同一面板切換 |
| 睡眠計時器結束 | 3 秒內音量漸進淡出至靜音 |
| 番茄鐘結束 | 視覺提示 ＋ Web Audio API beep |
| 睡眠時長設定 | 快速選項（15/30/60/90 分）＋ 自訂輸入 |
| 番茄鐘設定 | 快速組合（25/5、50/10、90/20）＋ 自訂工作/休息時長 |

## 架構

### 新增檔案

```
domains/timer/
├── type.ts              # TimerMode、TimerState 型別定義
├── use-timer.ts         # 計時器核心邏輯 composable
└── timer-panel.vue      # 滑出面板 UI 元件
```

### 修改檔案

- `hexazen.vue`：新增時鐘 icon 按鈕、整合 use-timer、傳入音量淡出 callback

### 資料流

1. `hexazen.vue` 底部左側渲染時鐘 icon
2. 點擊 icon → 控制 `timer-panel.vue` 顯示/隱藏
3. `use-timer.ts` 管理所有計時器狀態
4. 睡眠計時器結束 → 呼叫 hexazen.vue 音量淡出邏輯（操作 `globalVolume` ref）
5. 番茄鐘切換工作/休息 → 播放 beep ＋ 更新 icon 視覺狀態

## 狀態設計

```typescript
type TimerMode = 'sleep' | 'pomodoro'

interface TimerState {
  mode: TimerMode
  isRunning: boolean
  remainingSeconds: number
  pomodoroPhase: 'work' | 'break'
  workSeconds: number
  breakSeconds: number
}
```

## UI 設計

### 時鐘 icon 狀態

- **待機**：與現有 weather、mix icon 風格一致
- **睡眠計時進行中**：icon 變藍色，下方顯示剩餘時間 `mm:ss`
- **番茄鐘進行中**：icon 變橘色，下方顯示剩餘時間 `mm:ss`

### 面板佈局

**睡眠計時器模式：**
```
┌─────────────────────┐
│  [睡眠]  [番茄鐘]   │
├─────────────────────┤
│  15  30  60  90 min │
│  [ 自訂：___min ]   │
├─────────────────────┤
│     ▶ 開始          │
└─────────────────────┘
```

**番茄鐘模式：**
```
┌─────────────────────┐
│  [睡眠]  [番茄鐘]   │
├─────────────────────┤
│ 25/5  50/10  90/20  │
│ 工作[__] 休息[__]min│
├─────────────────────┤
│  🟢 工作中  23:45   │
│     ▶ 開始 / ⏸ 暫停│
└─────────────────────┘
```

**樣式**：沿用 `chamfer-border-card` 切角卡片風格，`v-show` + CSS transition 控制滑出動畫。

## 行為細節

### 睡眠計時器淡出
- 結束時啟動 3 秒淡出：每 100ms 將 `globalVolume` 減少 `originalVolume / 30`
- 淡出完成後觸發靜音（`isMuted = true`）

### 番茄鐘提示音
- 使用 Web Audio API 產生 beep，不依賴外部音效檔
- 工作結束：高頻短促 beep × 2
- 休息結束：低頻長 beep × 1

### 番茄鐘循環
- 工作結束 → 自動切換休息並倒數
- 休息結束 → 自動切換工作並倒數
- 循環持續至使用者手動停止
