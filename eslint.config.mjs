import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.next/**',
      '**/.nuxt/**',
      '**/coverage/**',
      '**/build/**',
      '**/vendor/**',
    ],
  },
  {
    files: ['**/*.{js,cjs,mjs,ts,cts,mts,jsx,tsx,vue}'],
    rules: {
      'no-console': 'warn',
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': 'warn',
      'ts/no-use-before-define': 'off',
      'style/arrow-parens': ['error', 'always'],
      'style/member-delimiter-style': [
        'error',
        {
          multiline: {
            delimiter: 'semi',
            requireLast: true,
          },
          singleline: {
            delimiter: 'semi',
            requireLast: false,
          },
          multilineDetection: 'brackets',
        },
      ],
      'jsdoc/multiline-blocks': [
        'error',
        {
          noZeroLineText: false,
        },
      ],
      'perfectionist/sort-exports': [
        'error',
        {
          partitionByNewLine: true,
        },
      ],
    },
  },
  {
    files: ['**/*.vue'],
    rules: {
      'vue/component-name-in-template-casing': ['error', 'kebab-case', {
        registeredComponentsOnly: false,
        ignores: [],
      }],
      'vue/block-order': ['error', {
        order: [['script', 'template'], 'style'],
      }],
    },
  },
  {
    files: ['**/*.json'],
    rules: {
      'style/eol-last': 'off',
    },
  },
  {
    // 文章內的程式碼片段以可讀性為主，不套用排版與誤判規則
    files: ['**/*.md/**'],
    rules: {
      // Effect 慣例寫 yield*，不加空格
      'style/yield-star-spacing': 'off',
      // 示範用的錯誤片段中 yield* 會被解析成乘法運算子
      'style/space-infix-ops': 'off',
      // Data.TaggedError、Schema.TaggedError 是 class factory，加上 new 反而是錯的
      'unicorn/throw-new-error': 'off',
      // 片段不會真的執行，允許宣告後未使用
      'unused-imports/no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
)
