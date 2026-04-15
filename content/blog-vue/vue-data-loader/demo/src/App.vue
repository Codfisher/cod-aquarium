<template>
  <div class="app">
    <nav>
      <router-link to="/">
        首頁
      </router-link>
      <router-link to="/waterfall">
        瀑布流問題
      </router-link>
      <router-link to="/with-loader">
        Data Loader
      </router-link>
    </nav>

    <router-view />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #1a1a1a;
  background: #fafafa;
}

.app {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px;
}

nav {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e5e5e5;
}

nav a {
  color: #666;
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 14px;
  transition: all 0.2s;
}

nav a:hover {
  background: #f0f0f0;
}

nav a.router-link-active {
  color: #42b883;
  background: #42b88315;
  font-weight: 600;
}
</style>
