import type { DefaultTheme } from 'vitepress'
import type { Article } from './utils'
import { defineConfig } from 'vitepress'
import { markdownItBaseImg } from './plugin/markdown-it-base-img'
import { generateImages } from './scripts/resize-images'
import {
  getArticleList,
  getLatestDocPath,
  getSidebar,
} from './utils'

export interface Config extends DefaultTheme.Config {
  articleList: Article[];
}

// https://vitepress.dev/reference/site-config
export default ({ mode }) => {
  return defineConfig({
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
      ['link', { rel: 'icon', href: '/favicon.ico' }],
    ],
    sitemap: {
      hostname: 'https://codlin.me',
    },
    rewrites(id) {
      // 去除檔名前面的日期
      const result = id.replace(/\d{6}\./, '')
      return result
    },
    transformHead() {
      return [
        [
          'script',
          { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-WL47JJHL0R' },
          '',
        ],
        [
          'script',
          {},
          `window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-WL47JJHL0R');`,
        ],
      ]
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
          content: pageData?.frontmatter?.image ?? 'https://codlin.me/cover.webp',
        }])
      }
    },

    lastUpdated: true,
    markdown: {
      lineNumbers: true,
      config(md) {
        md.use((md) => markdownItBaseImg(md, mode))
      },
    },

    themeConfig: {
      articleList: getArticleList(),
      footer: {
        copyright: 'Copyright © 2024-present <a href="mailto:hi@codlin.me">Cod Lin</a>',
      },
      outline: {
        label: '目錄',
        level: [2, 3],
      },
      lastUpdated: {
        text: '更新於',
      },
      nav: [
        { text: '文章總攬', link: '/article-overview' },
        {
          text: '所有主題',
          items: [
            { text: '蔚藍世界', link: getLatestDocPath('/blog-ocean-world/') },
            { text: '程式浮潛', link: getLatestDocPath('/blog-program/') },
            { text: 'Vue', link: getLatestDocPath('/blog-vue/') },
          ],
        },
        {
          text: '專欄',
          items: [
            {
              text: '自己的工具自己做，用 Electron 仿造 PowerToys！',
              link: getLatestDocPath('/column-cod-toys/'),
            },
          ],
        },

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
                text: '自己的工具自己做，用 Electron 仿造 PowerToys！',
                link: getLatestDocPath('/column-cod-toys/'),
              },
            ],
          },
        ],
        ...getSidebar('/blog-ocean-world/', '蔚藍世界'),
        ...getSidebar('/blog-program/', '程式浮潛'),
        ...getSidebar('/blog-vue/', 'Vue'),

        ...getSidebar('/column-cod-toys/', '自己的工具自己做，用 Electron 仿造 PowerToys！'),
      },

      socialLinks: [
        { icon: 'youtube', link: 'https://www.youtube.com/@codfish2140' },
        { icon: 'gitlab', link: 'https://gitlab.com/codfish2140' },
        { icon: 'linkedin', link: 'https://www.linkedin.com/in/shih-chen-lin-codfish/' },
      ],
      search: {
        provider: 'local',
      },
    } as Config,

    vite: {
      css: {
        preprocessorOptions: {
          sass: {
            api: 'modern-compiler',
          },
        },
      },
    },
    async buildEnd() {
      await generateImages()
    },
  })
}
