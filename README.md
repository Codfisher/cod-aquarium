# 鱈魚的魚缸

嘗試使用 Nuxt Content 建立個人部落格

主題基於 [docus](https://docus.dev/)

## 2024/12/03 更新

因為 Nuxt Content 將文章放在 server 資源中，導致 server 過大，無法部屬至 Cloudflare Pages

就算部屬至 Firebase Hosting，也會因為此設計導致流量費有夠貴

所以決定使用 vitepress 全面重構
