import { defineConfig } from 'vitepress'
import { getLatestDocPath, getSidebar } from './utils'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: '鱈魚的魚缸',
  description: '各種鱈魚滾鍵盤的雜記與研究',
  srcDir: 'content',
  assetsDir: 'public',
  ignoreDeadLinks: true,
  lang: 'zh-hant',
  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'true' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@100..900&display=swap' }],
    ['link', { rel: 'icon', href: '/favicon.webp' }],
  ],
  sitemap: {
    hostname: 'https://codlin.me',
  },
  transformPageData(pageData) {
    pageData.frontmatter.head ??= []

    if (pageData?.frontmatter?.description) {
      pageData.frontmatter.head.push(['meta', {
        property: 'og:description',
        content: pageData?.frontmatter?.description ?? '',
      }])
    }

    if (pageData?.frontmatter?.image) {
      pageData.frontmatter.head.push(['meta', {
        property: 'og:image',
        content: pageData?.frontmatter?.image ?? '',
      }])
    }
  },

  lastUpdated: true,

  themeConfig: {
    footer: {
      copyright: 'Copyright © 2024-present <a href="https://gitlab.com/codfish2140">Codfish</a>',
    },
    outline: {
      label: '目錄',
      level: 'deep',
    },
    lastUpdated: {
      text: '最後更新時間',
    },
    nav: [
      { text: '首頁', link: '/' },
      { text: '蔚藍世界', link: '/1.index' },
    ],
    logo: '/favicon.ico',

    sidebar: {
      '/': [
        {
          text: '主題',
          items: [
            {
              text: '蔚藍世界',
              link: getLatestDocPath('/blog-ocean-world/'),
            },
            {
              text: '程式浮潛',
              link: getLatestDocPath('/blog-program/'),
            },
            {
              text: 'Vue',
              link: getLatestDocPath('/blog-vue/'),
            },
          ],
        },
        {
          text: '專欄',
          items: [
            {
              text: '要不要 Vue 點酷酷的元件',
            },
          ],
        },
      ],
      ...getSidebar('/blog-ocean-world/', '蔚藍世界'),
      ...getSidebar('/blog-program/', '程式浮潛'),
      ...getSidebar('/blog-vue/', 'Vue'),
    },

    socialLinks: [
      { icon: 'youtube', link: 'https://www.youtube.com/@codfish2140' },
      { icon: 'gitlab', link: 'https://gitlab.com/codfish2140' },
      { icon: 'linkedin', link: 'https://www.linkedin.com/in/shih-chen-lin-codfish/' },
    ],
    search: {
      provider: 'local',
    },
  },
})
