import type { DefaultTheme } from 'vitepress'
import type { Article } from './utils'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import ui from '@nuxt/ui/vite'
import { whyframe } from '@whyframe/core'
import { whyframeVue } from '@whyframe/vue'
import dayjs from 'dayjs'
import { filter, isTruthy, map, piped } from 'remeda'
import Icons from 'unplugin-icons/vite'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { RssPlugin } from 'vitepress-plugin-rss'
import { markdownItBaseImg } from './plugin/markdown-it-base-img'
import { markdownItCodeBlockName } from './plugin/markdown-it-code-block-name'
import { markdownItNowrap } from './plugin/markdown-it-nowrap'
import { generateImages } from './scripts/resize-images'
import {
  getArticleList,
  getLatestDocPath,
  getOldestDocPath,
  getSidebar,
} from './utils'

export interface Config extends DefaultTheme.Config {
  articleList: Article[];
}

function getNavItem(data: DefaultTheme.NavItem) {
  if ('items' in data) {
    const items = data.items?.filter((item) => {
      if (!item)
        return false

      if ('link' in item) {
        return !!item.link
      }

      return true
    }) ?? []

    if (items.length === 0) {
      return undefined
    }
    return {
      ...data,
      items,
    }
  }

  return data
}

// https://vitepress.dev/reference/site-config
export default ({ mode }: { mode: string }) => {
  const articleList = getArticleList()

  const baseConfig = {
    title: '鱈魚的魚缸',
    description: '各種鱈魚滾鍵盤的雜記與研究',
    hostname: 'https://codlin.me',
    email: 'hi@codlin.me',
    lang: 'zh-Hant',
    copyright: 'Copyright © 2024-present <a href="mailto:hi@codlin.me">Cod Lin</a>',
  }
  return withMermaid({
    title: baseConfig.title,
    description: baseConfig.description,
    srcDir: 'content',
    assetsDir: 'public',
    ignoreDeadLinks: true,
    lang: baseConfig.lang,
    head: [
      ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
      ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'true' }],
      ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@100..900&display=swap' }],
      ['link', { rel: 'icon', href: '/favicon.ico' }],

    ],
    sitemap: {
      hostname: baseConfig.hostname,
      transformItems: piped(
        filter((item) => {
          const target = articleList.find((article) =>
            item.url.includes(article.link),
          )
          if (!target) {
            console.warn(`[ sitemap ] ${item.url} 不在 articleList 之中`)
            return false
          }

          return !target?.frontmatter?.draft
        }),
        map((item) => ({
          ...item,
          // 去除 .html，否則 search console 會因重新導向導致無法抓取
          url: item.url.replace('.html', ''),
        })),
      ),
    },
    rewrites(id) {
      // 去除檔名前面的日期
      const result = id.replace(/\d{6}\./, '')
      return result
    },
    transformHead({ page }) {
      const canonicalUrl = new URL(page.replace(/\.md$/, ''), baseConfig.hostname).toString()

      return [
        [
          'link',
          {
            rel: 'canonical',
            href: canonicalUrl,
          },
        ],
        [
          'script',
          {
            async: '',
            src: 'https://www.googletagmanager.com/gtag/js?id=G-WL47JJHL0R',
          },
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
        [
          'script',
          { type: 'text/javascript' },
          `(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "sbra2ic0u4");`,
        ],
        [
          'script',
          {
            async: '',
            src: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6608581811170481',
            crossorigin: 'anonymous',
          },
          '',
        ],
        [
          'meta',
          {
            name: 'google-adsense-account',
            content: 'ca-pub-6608581811170481',
          },
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
          content: pageData?.frontmatter?.image ?? `${baseConfig.hostname}/cover.webp`,
        }])
      }
    },

    lastUpdated: true,
    markdown: {
      lineNumbers: true,
      config(md) {
        md.use((md) => markdownItBaseImg(md, mode))
        md.use(markdownItNowrap)
        md.use(markdownItCodeBlockName)
      },
    },

    themeConfig: {
      articleList,
      footer: {
        copyright: baseConfig.copyright,
      },
      outline: {
        label: '目錄',
        level: [2, 3],
      },
      lastUpdated: {
        text: '更新於',
      },
      nav: filter(
        [
          { text: '總覽', link: '/article-overview' },
          {
            text: '主題',
            items: [
              { text: '蔚藍世界', link: getLatestDocPath('/blog-ocean-world/') },
              { text: '程式浮潛', link: getLatestDocPath('/blog-program/') },
              { text: 'Vue', link: getLatestDocPath('/blog-vue/') },
            ],
          },
          getNavItem({
            text: '專欄',
            items: [
              {
                text: '用 Electron 仿造 PowerToys',
                link: getOldestDocPath('/column-cod-toys/'),
              },
              {
                text: '來個 3D 白噪音混音器',
                link: getOldestDocPath('/column-sound-blocks/'),
              },
              {
                text: '酷酷元件背後的星點',
                link: getOldestDocPath('/column-chill-components/'),
              },
            ],
          }),
          getNavItem({
            text: '酷東西',
            items: [
              {
                text: 'MCU Windows',
                link: 'https://codfish-210716.notion.site/MCU-Windows-2f896774ea2f4742af974c753f947bd4#4fcf87c34f544b71bce9a76d96adb39a',
              },
              {
                text: '酷酷的元件',
                link: 'https://chillcomponent.codlin.me/',
              },
              {
                text: 'Cyber Scales Desktop',
                link: '/aquarium/cyber-scales-desktop/',
              },
              {
                text: '快取梗圖',
                link: '/aquarium/meme-cache/',
              },
              {
                text: '鱈魚的彈珠',
                link: '/aquarium/codmarbles/',
              },
              {
                text: 'CodStack',
                link: '/aquarium/codstack/',
              },
            ],
          }),
        ],
        isTruthy,
      ),
      logo: '/favicon.ico',

      sidebar: {
        '/': filter(
          [
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
                  link: getOldestDocPath('/column-cod-toys/'),
                },
                {
                  text: '來個 3D 白噪音混音器',
                  link: getOldestDocPath('/column-sound-blocks/'),
                },
                // {
                //   text: '酷酷元件背後的星點',
                //   link: getOldestDocPath('/column-chill-components/'),
                // },
              ],
            },
          ],
          isTruthy,
        ),
        ...getSidebar(
          '/blog-ocean-world/',
          '蔚藍世界',
        ),
        ...getSidebar(
          '/blog-program/',
          '程式浮潛',
        ),
        ...getSidebar(
          '/blog-vue/',
          'Vue',
        ),

        ...getSidebar(
          '/column-cod-toys/',
          '自己的工具自己做，用 Electron 仿造 PowerToys！',
          'asc',
        ),
        ...getSidebar(
          '/column-sound-blocks/',
          '來個 3D 白噪音混音器',
          'asc',
        ),
        // ...getSidebar(
        //   '/column-chill-components/',
        //   '酷酷元件背後的星點',
        //   'asc',
        // ),
      },

      socialLinks: [
        { icon: 'github', link: 'https://github.com/Codfisher/cod-aquarium' },
        { icon: 'gitlab', link: 'https://gitlab.com/codfish2140' },
        { icon: 'youtube', link: 'https://www.youtube.com/@codfish2140' },
        { icon: 'linkedin', link: 'https://www.linkedin.com/in/shih-chen-lin-codfish/' },
        { icon: 'threads', link: 'https://www.threads.com/@codfish2140' },
      ],
      search: {
        provider: 'local',
        options: {
          _render(src, env, md) {
            const html = md.render(src, env)
            if (env.frontmatter?.draft)
              return ''

            return html
          },
        },
      },
    } as Config,

    vite: {
      optimizeDeps: {
        exclude: ['@babylonjs/havok'],
      },
      css: {
        preprocessorOptions: {
          sass: {
            api: 'modern-compiler',
          },
        },
      },
      resolve: {
        alias: {
          'vue-i18n': 'vue-i18n/dist/vue-i18n.cjs.js',
        },
      },
      plugins: [
        VueI18nPlugin({
          strictMessage: false,
          include: resolve(dirname(
            fileURLToPath(import.meta.url),
          ), 'locales/**'),
        }),
        /** 強制停用 vitepress data loader 功能
         *
         * 避免 build 時出現以下錯誤：
         * KHR_animation_pointer.data.js: config must export or return an object.
         *
         * https://github.com/vuejs/vitepress/issues/4482
         */
        {
          name: 'disable-vp-static-data-plugin',
          configResolved(config) {
            (config.plugins as any).splice(
              config.plugins.findIndex((p) => p.name === 'vitepress:data'),
              1,
            )
          },
        },
        Icons({
          autoInstall: true,
          compiler: 'vue3',
        }),
        RssPlugin({
          title: baseConfig.title,
          description: baseConfig.description,
          language: baseConfig.lang,
          baseUrl: baseConfig.hostname,
          copyright: baseConfig.copyright,
          author: {
            name: 'Cod Lin',
            email: baseConfig.email,
          },
          filter(post) {
            const article = articleList.find(
              ({ link }) => post.url.includes(link),
            )
            if (!article) {
              return false
            }

            if (post.frontmatter.pubDate) {
              post.date = dayjs(`${post.frontmatter.pubDate}`, 'YYYYMMDD').format()
            }

            return true
          },
        }),
        ui({
          router: false,
        }),

        whyframe({
          defaultSrc: '/_frame',
        }),
        whyframeVue({
          include: /\.(?:vue|md)$/,
        }),
      ],
    },
    async buildEnd() {
      await generateImages()
    },
  })
}
