import { defineConfig } from 'vitepress'
import { getSidebar } from './utils'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "鱈魚的魚缸",
  description: "各種鱈魚滾鍵盤的雜記與研究",
  srcDir: 'content',
  assetsDir: 'public',
  ignoreDeadLinks: true,
  // rewrites(id) {
  //   const paths = id.split('/')
  //   const filename = paths.pop()

  //   if (filename) {
  //     // 去除檔名日期部分。檔名固定為 YYMMDD.filename.md
  //     const list = filename.split('.')
  //     if (list.length === 3) {
  //       const [_, name, extension] = list

  //       return [
  //         ...paths,
  //         name
  //       ].join('/')
  //     }
  //   }

  //   return id
  // },
  lang: 'zh-hant',
  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'true' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@100..900&display=swap' }],
    ['link', { rel: 'icon', href: '/favicon.webp' }],
  ],

  lastUpdated: true,

  themeConfig: {
    lastUpdated: {
      text: '最後更新時間',
    },
    nav: [
      { text: '首頁', link: '/' },
      { text: '蔚藍世界', link: '/1.index' }
    ],

    sidebar: {
      '/': [
        {
          text: '主題',
          items: [
            {
              text: '蔚藍世界',
              link: '/blog-ocean-world/240628.unleash-the-magic-of-type-script-with-ts-rest'
            },
            {
              text: '程式浮潛',
              link: '/blog-program/240324.remeda-pipe'
            },
            {
              text: 'Vue',
              link: '/blog-vue/240410.do-not-always-fetch-api-in-on-mounted'
            },
          ]
        },
        {
          text: '專欄',
          items: [
            {
              text: '要不要 Vue 點酷酷的元件',
            },
          ]
        }
      ],
      ...(await getSidebar('/blog-ocean-world/', '蔚藍世界')),
      ...(await getSidebar('/blog-program/', '程式浮潛')),
      ...(await getSidebar('/blog-vue/', 'Vue')),
    },

    socialLinks: [
      { icon: 'youtube', link: 'https://www.youtube.com/@codfish2140' },
      { icon: 'gitlab', link: 'https://gitlab.com/codfish2140' },
      { icon: 'linkedin', link: 'https://www.linkedin.com/in/shih-chen-lin-codfish/' },
    ],
    search: {
      provider: 'local'
    }
  }
})
