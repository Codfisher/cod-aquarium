<template>
  <div>
    <h1>Vue Data Loader Demo</h1>
    <p>點擊上方連結，比較兩種資料取得方式的差異。</p>

    <div class="card-list">
      <router-link
        to="/waterfall"
        class="card bad"
      >
        <span class="icon">🌊</span>
        <strong>瀑布流問題</strong>
        <p>元件依序 fetch，總耗時約 3 秒</p>
      </router-link>

      <router-link
        to="/with-loader"
        class="card good"
      >
        <span class="icon">⚡</span>
        <strong>Data Loader</strong>
        <p>平行 fetch，總耗時約 1 秒</p>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
h1 {
  font-size: 22px;
  margin-bottom: 8px;
}

p {
  color: #666;
  font-size: 14px;
  margin-bottom: 20px;
}

.card-list {
  display: flex;
  gap: 12px;
}

.card {
  flex: 1;
  padding: 20px;
  border-radius: 10px;
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s;
  border: 1px solid;
}

.card:hover {
  transform: translateY(-2px);
}

.card.bad {
  background: #fff5f5;
  border-color: #fecaca;
}

.card.good {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.icon {
  font-size: 28px;
  display: block;
  margin-bottom: 8px;
}

.card strong {
  font-size: 16px;
  display: block;
  margin-bottom: 4px;
}

.card p {
  font-size: 13px;
  color: #888;
  margin: 0;
}
</style>
