import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "鱈魚的魚缸",
  description: "各種鱈魚滾鍵盤的雜記與研究",
  srcDir: 'content',
  assetsDir: 'public',
  ignoreDeadLinks: true,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Examples', link: '/1.index' }
    ],

    sidebar: [
      {
        text: 'Examples',
        items: [
          { text: 'Markdown Examples', link: '/1.index' },
          { text: 'Vue ref', link: '/blog-vue/240905.vue-3-5-update-on-watcher-cleanup-with-the-forgotten-on-cleanup' },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ]
  }
})
