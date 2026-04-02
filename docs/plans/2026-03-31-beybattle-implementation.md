# BeyBattle — 實作計畫

## 依賴順序

```
Phase 1 (骨架) → Phase 2 (場地+陀螺) → Phase 3 (物理) → Phase 4 (戰鬥循環+QTE) ← 首個可玩原型
  → Phase 5~9 可平行開發 → Phase 10 (收尾)
```

---

## Phase 1：專案骨架與場景啟動

**目標**：空專案能在部落格中渲染 Babylon.js 畫布。

1.1. 建立 `index.md`，使用 whyframe iframe 嵌入模式（參考 hexazen/index.md）
1.2. 建立 `beybattle.vue` 根元件，包裹 `<u-app>`、設定 light mode、載入字體、渲染 `<main-scene>`
1.3. 複製並調整 composables（use-babylon-scene、use-font-loader、use-simple-i18n），相機改為固定 45° 俯視的 `ArcRotateCamera`（鎖定 beta、禁用平移）
1.4. 建立 `main-scene.vue`，僅含畫布 + 半球光 + 清除色
1.5. 建立 `constants/version.ts`
1.6. 建立 `types/index.ts`，定義 `BeybladeStats`、`BeybladeState`、`BattlePhase` enum、零件型別

**驗收**：瀏覽部落格頁面可看到空的 3D 畫布。

**參考**：hexazen/index.md、hexazen.vue、composables/use-babylon-scene.ts、main-scene.vue

---

## Phase 2：競技場與陀螺占位幾何體

**目標**：碗狀場地 + 旋轉中的基礎陀螺。

2.1. 建立 `domains/arena/arena-builder.ts`，用 `CreateLathe` 生成碗狀場地，低飽和灰白材質 + 格線 DynamicTexture + 邊緣裝飾 Torus
2.2. 建立 `domains/beyblade/parts.ts`，定義所有零件資料（`attackRingPartList`、`weightDiskPartList`、`spinTipPartList`）
2.3. 建立 `domains/beyblade/builder.ts`，`createBeybladeModel()` 用基本幾何體（圓柱+圓錐）組合占位模型
2.4. 建立 `domains/beyblade/stats.ts`，三零件屬性加總計算
2.5. 串接場景：場地中央放一個旋轉陀螺

**驗收**：俯視 45° 可看到碗狀場地中有一個旋轉的占位陀螺。

---

## Phase 3：2D 物理引擎

**目標**：陀螺在碗面上移動、減速、碰撞。

3.1. 建立 `domains/physics/spin-physics.ts`，純函式 `updateBeybladePhysics()`：碗面向心力、摩擦力、轉速衰減、速度上限、出界判定
3.2. 建立 `domains/physics/collision.ts`，圓形碰撞偵測 + 擊退回應（attack × spinRate vs defense × weight）
3.3. 串接物理：renderLoop 中更新陀螺狀態，同步 3D 位置

**驗收**：陀螺在碗中繞行、逐漸減速、最終停止或飛出。

---

## Phase 4：戰鬥狀態機與最小 QTE（首個可玩原型）

**目標**：完整遊戲循環 — 簡易 QTE → 雙陀螺對戰 → 結果畫面。

4.1. 建立 `domains/battle/battle-manager.ts`，composable `useBattleManager()`，管理 `CONFIGURE → QTE_CHARGE → QTE_AIM → QTE_LAUNCH → BATTLE → RESULT` 狀態機
4.2. 建立 `domains/qte/qte-engine.ts`，composable `useQteEngine()`：三階段判定邏輯
4.3. 建立 `domains/qte/qte-stages.ts`，階段設定常數（區間邊界、速度、時限）
4.4. 建立 `domains/qte/qte-panel.vue`，QTE 覆蓋 UI（能量條、準心、箭頭），支援空白鍵 + 觸控
4.5. 建立 `domains/battle/ai-controller.ts`，AI 的 QTE 結果 + 零件選擇策略
4.6. 建立 `domains/battle/battle-result.vue`，勝負畫面 + 重新開始
4.7. 串接全部：beybattle.vue 控制流程，main-scene.vue 同步物理與 3D

**驗收**：可玩的完整遊戲循環。

---

## Phase 5：零件配置 UI

**目標**：玩家可挑選零件、檢視屬性。

5.1. 建立 `components/base-btn.vue`
5.2. 建立 `domains/beyblade/part-picker.vue`，卡片式三層選擇（觸控友好 ≥44px）
5.3. 建立 `domains/beyblade/stats-display.vue`，四項屬性雷達圖（canvas 2D 或 SVG）
5.4. CONFIGURE 階段在場地中央顯示組裝後的陀螺 3D 預覽
5.5. 串接 beybattle.vue，CONFIGURE 時顯示選擇器 + 雷達圖 + 「準備」按鈕

**驗收**：選零件 → 雷達圖更新 → 3D 預覽 → 進入戰鬥。

---

## Phase 6：卡通渲染風格

**目標**：cel-shading + 描邊的卡通視覺。

6.1. 實作 toon shader（CellMaterial 或自訂 ShaderMaterial，2~3 色階）
6.2. 邊緣偵測描邊後處理（depth + normal）
6.3. 場地半透明化 + 底部光暈
6.4. 雙方陀螺配色區分（玩家紅金、AI 藍紫）
6.5. 方向光 + 陰影

**驗收**：明確的卡通/動漫風格。

---

## Phase 7：程式化陀螺幾何體

**目標**：每種零件有獨特造型。

7.1. 攻擊環：鋸齒（鋸齒頂點）、圓滑（平滑 Torus）、三角（三突起）、六翼（翼片）
7.2. 重量盤：重力盤（外厚）、輕量盤（薄小）、平衡盤（均勻）、偏心盤（偏移重心）
7.3. 軸心：尖銳（細長錐）、平坦（扁平柱）、球形（球體）、彈簧（線圈）
7.4. `createBeybladeModel()` 依零件定義分派幾何建構

**驗收**：64 種組合（4×4×4）各有視覺區分。

---

## Phase 8：戰鬥特效

**目標**：碰撞有衝擊感、QTE 有回饋感。

8.1. 碰撞火花粒子（星形 DynamicTexture）
8.2. 畫面微震（camera offset + animejs 回彈）
8.3. 強力碰撞慢動作（0.3 秒 deltaTime 縮放）
8.4. QTE Perfect 閃白 + 文字彈出動畫
8.5. 雙方轉速條 HUD
8.6. 基礎音效（Web Audio API，選做）

**驗收**：碰撞與 QTE 有明確視覺回饋。

---

## Phase 9：QTE 3D 場景整合

**目標**：瞄準與發射階段直接在 3D 場地上操作。

9.1. 瞄準階段：十字準心 Mesh 在場地上方繞圓軌跡移動
9.2. 發射階段：方向箭頭 Mesh 從落點旋轉
9.3. qte-panel.vue 在 3D 視覺啟用時僅保留文字提示
9.4. 陀螺入場動畫：從上方落下 + 彈跳（animejs）

**驗收**：QTE 瞄準/發射在空間上與場地連結。

---

## Phase 10：難度設定、i18n 與最終收尾

**目標**：完整的遊戲體驗。

10.1. CONFIGURE 畫面加入難度選擇（簡單/中等/困難），連接 AI 策略
10.2. 完成所有 i18n 字串（zh-hant + en）
10.3. 左上角返回按鈕、右上角設定齒輪
10.4. 手機響應式調整（觸控尺寸、橫直屏）
10.5. 效能：hardware scaling、行動裝置粒子減量
10.6. 首次造訪公告 modal

**驗收**：雙語、觸控友好、效能良好的完整遊戲。
