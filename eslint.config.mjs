// 這份設定只為了檢查 Vue <template>：oxlint 目前還不能 lint .vue 的 template 區塊。
// script 區塊、.ts、.js 一律交給 oxlint（見 .oxlintrc.json），這裡不重複檢查，也不管排版。
//
// 退場方式：oxlint 支援 Vue template 後（看官方文件與 release notes 的 Vue template／.vue 支援說明），
// 整份刪除，連同 eslint、eslint-plugin-vue、vue-eslint-parser、@typescript-eslint/parser 四個套件、
// package.json 的 lint:vue、.vscode 的 ESLint 建議與設定。細節見 docs/development-notes.md「退場條件」。
import tsParser from '@typescript-eslint/parser'
import vue from 'eslint-plugin-vue'

// essential 內屬於 script 區塊、oxlint 已有同名規則的，關掉避免重複回報
const scriptRuleOffList = [
  'no-arrow-functions-in-watch',
  'no-async-in-computed-properties',
  'no-computed-properties-in-data',
  'no-deprecated-data-object-declaration',
  'no-deprecated-delete-set',
  'no-deprecated-destroyed-lifecycle',
  'no-deprecated-events-api',
  'no-deprecated-model-definition',
  'no-deprecated-props-default-this',
  'no-deprecated-vue-config-keycodes',
  'no-dupe-keys',
  'no-export-in-script-setup',
  'no-expose-after-await',
  'no-lifecycle-after-await',
  'no-reserved-component-names',
  'no-reserved-keys',
  'no-reserved-props',
  'no-shared-component-data',
  'no-side-effects-in-computed-properties',
  'no-watch-after-await',
  'prefer-import-from-vue',
  'require-prop-type-constructor',
  'require-render-return',
  'require-slots-as-functions',
  'return-in-computed-property',
  'return-in-emits-validator',
  'valid-define-emits',
  'valid-define-options',
  'valid-next-tick',
  // 命名慣例，舊設定本來就關；Nuxt 的 pages 與 app.vue 也會誤觸
  'multi-word-component-names',
]

export default [
  {
    // 與 .oxlintrc.json 的 ignorePatterns 保持一致
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.next/**',
      '**/.nuxt/**',
      '**/coverage/**',
      '**/build/**',
      '**/vendor/**',
      // 外部安裝的 skill，內含壓縮過的第三方腳本
      '.claude/skills/impeccable/**',
    ],
  },
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        // 讓 <script setup lang="ts"> 與 template 內的 TS 運算式能解析；不需要型別資訊
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    linterOptions: {
      // 原始碼裡有 oxlint 認得、這裡沒有的規則（no-new、regexp/* 等）的 disable 註解，不要報未使用
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      ...Object.fromEntries(scriptRuleOffList.map((name) => [`vue/${name}`, 'off'])),
      // 只有這一條因為既有程式的違規太多（六十幾處，多在搬來的主題裡）先降為 warn，新寫的不要再增加；其餘 essential 規則都是 error
      'vue/component-name-in-template-casing': ['warn', 'kebab-case', {
        registeredComponentsOnly: false,
        // Nuxt UI 元件（U 開頭）另外統一為 PascalCase，才能被 componentDetection 掃描到
        ignores: ['/^U[A-Z]/'],
      }],
      'vue/block-order': ['error', {
        order: [['script', 'template'], 'style'],
      }],
    },
  },
  {
    /**
     * 側欄項目用 <component :is="textTag" v-html="…">，textTag 只會是 p 或 h2 到 h6 這些原生標籤，
     * v-html 寫進去的就是那個元素自己的內容，不會蓋掉哪個元件的插槽。規則分不出這一點，只對這一支關掉
     */
    files: ['app/theme/components/VPSidebarItem.vue'],
    rules: {
      'vue/no-v-text-v-html-on-component': 'off',
    },
  },
]
