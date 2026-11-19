import type { DefaultTheme } from '../app/theme/types/default-theme'
import type { Article } from './articles'
import { filter, isTruthy } from 'remeda'
import { getArticleList, getLatestDocPath, getOldestDocPath, getSidebar } from './articles'
import { COPYRIGHT, HOSTNAME } from './constants'

/** RSS 訂閱圖示（Font Awesome square-rss），與原站相同 */
const RSS_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 448 512"><title>RSS</title><path d="M400 32H48C21.49 32 0 53.49 0 80v352c0 26.51 21.49 48 48 48h352c26.51 0 48-21.49 48-48V80c0-26.51-21.49-48-48-48zM112 416c-26.51 0-48-21.49-48-48s21.49-48 48-48s48 21.49 48 48s-21.49 48-48 48zm157.533 0h-34.335c-6.011 0-11.051-4.636-11.442-10.634c-5.214-80.05-69.243-143.92-149.123-149.123c-5.997-.39-10.633-5.431-10.633-11.441v-34.335c0-6.535 5.468-11.777 11.994-11.425c110.546 5.974 198.997 94.536 204.964 204.964c.352 6.526-4.89 11.994-11.425 11.994zm103.027 0h-34.334c-6.161 0-11.175-4.882-11.427-11.038c-5.598-136.535-115.204-246.161-251.76-251.76C68.882 152.949 64 147.935 64 141.774V107.44c0-6.454 5.338-11.664 11.787-11.432c167.83 6.025 302.21 141.191 308.205 308.205c.232 6.449-4.978 11.787-11.432 11.787z" fill="currentColor"></path></svg>'

export interface ThemeConfig extends DefaultTheme.Config {
  articleList: Article[];
}

/** 下拉選單內沒有有效連結的項目（例如全是草稿的專欄）整個濾掉 */
function getNavItem(data: DefaultTheme.NavItem) {
  if (!('items' in data))
    return data

  const itemList = data.items?.filter((item) => {
    if (!item)
      return false
    if ('link' in item)
      return !!item.link
    return true
  }) ?? []

  if (itemList.length === 0)
    return undefined

  return { ...data, items: itemList }
}

/** 主題設定，內容與原本 VitePress 的 themeConfig 相同 */
export function getThemeConfig(): ThemeConfig {
  return {
    articleList: getArticleList(),
    footer: {
      copyright: COPYRIGHT,
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
            { text: '用 Electron 仿造 PowerToys', link: getOldestDocPath('/column-cod-toys/') },
            { text: '來個 3D 白噪音混音器', link: getOldestDocPath('/column-hexazen/') },
            { text: '鱈魚的 Shader 筆記', link: getOldestDocPath('/column-shader-notes/') },
          ],
        }),
        getNavItem({
          text: '酷東西',
          items: [
            {
              text: 'MCU Windows',
              link: 'https://codfish-210716.notion.site/MCU-Windows-2f896774ea2f4742af974c753f947bd4#4fcf87c34f544b71bce9a76d96adb39a',
            },
            { text: '酷酷的元件', link: 'https://chillcomponent.codlin.me/' },
            { text: 'Cyber Scales Desktop', link: '/aquarium/cyber-scales-desktop/' },
            { text: '快取梗圖', link: '/aquarium/meme-cache/' },
            { text: '鱈魚的彈珠', link: '/aquarium/codmarbles/' },
            { text: 'CodStack', link: '/aquarium/codstack/' },
            { text: 'HexaZen', link: '/aquarium/hexazen/' },
            { text: 'EnderBox', link: '/aquarium/enderbox/' },
            { text: 'Minespace', link: '/aquarium/minespace/' },
            { text: '速速湊', link: 'https://susugo.codlin.me/' },
          ],
        }),
      ],
      isTruthy,
    ),
    logo: '/favicon.ico',
    sidebar: {
      '/': [
        {
          text: '主題',
          items: [
            { text: '蔚藍世界', link: getLatestDocPath('/blog-ocean-world/') },
            { text: '程式浮潛', link: getLatestDocPath('/blog-program/') },
            { text: 'Vue', link: getLatestDocPath('/blog-vue/') },
          ],
        },
        {
          text: '專欄',
          items: [
            { text: '自己的工具自己做，用 Electron 仿造 PowerToys！', link: getOldestDocPath('/column-cod-toys/') },
            { text: '來個 3D 白噪音混音器', link: getOldestDocPath('/column-hexazen/') },
            { text: '鱈魚的 Shader 筆記', link: getOldestDocPath('/column-shader-notes/') },
            { text: '從 Minecraft 開始的 babylon.js 之路', link: getOldestDocPath('/column-minespace/') },
            // 全是草稿的專欄沒有入口文章，link 為空字串，與 nav 的 getNavItem 一樣濾掉
          ].filter((item) => !!item.link),
        },
      ],
      ...getSidebar('/blog-ocean-world/', '蔚藍世界'),
      ...getSidebar('/blog-program/', '程式浮潛'),
      ...getSidebar('/blog-vue/', 'Vue'),
      ...getSidebar('/column-cod-toys/', '自己的工具自己做，用 Electron 仿造 PowerToys！', 'asc'),
      ...getSidebar('/column-hexazen/', '來個 3D 白噪音混音器', 'asc'),
      ...getSidebar('/column-shader-notes/', '鱈魚的 Shader 筆記', 'asc'),
      ...getSidebar('/column-minespace/', '從 Minecraft 開始的 babylon.js 之路', 'asc'),
    },
    socialLinks: [
      /** 原本由 vitepress-plugin-rss 自動加在最前面，圖示、網址與順序沿用 */
      { icon: { svg: RSS_ICON_SVG }, link: `${HOSTNAME}/feed.rss`, ariaLabel: 'RSS' },
      { icon: 'github', link: 'https://github.com/Codfisher/cod-aquarium' },
      { icon: 'gitlab', link: 'https://gitlab.com/codfish2140' },
      { icon: 'youtube', link: 'https://www.youtube.com/@codfish2140' },
      { icon: 'linkedin', link: 'https://www.linkedin.com/in/shih-chen-lin-codfish/' },
      { icon: 'threads', link: 'https://www.threads.com/@codfish2140' },
    ],
  }
}
