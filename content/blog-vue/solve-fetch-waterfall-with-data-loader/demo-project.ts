import type { Project } from '@stackblitz/sdk'

export const vueDataLoaderProject: Project = {
  title: 'vue-data-loader-demo',
  template: 'node',
  settings: {
    compile: { trigger: 'auto' },
  },
  files: {
    'package.json': `{
  "name": "vue-data-loader-demo",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build"
  },
  "dependencies": {
    "vue": "^3.5.0",
    "vue-router": "^4.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.0",
    "typescript": "^5.7.0",
    "unplugin-vue-router": "^0.10.0",
    "vite": "^6.0.0",
    "vue-tsc": "^2.2.0"
  }
}`,

    'index.html': `<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vue Data Loader Demo</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`,

    'vite.config.ts': `import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import VueRouter from "unplugin-vue-router/vite";

export default defineConfig({
  plugins: [
    VueRouter({
      dataFetching: true,
    }),
    vue(),
  ],
});`,

    'tsconfig.json': `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ESNext", "DOM"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "typed-router.d.ts"]
}`,

    'env.d.ts': `/// <reference types="vite/client" />
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}`,

    'src/main.ts': `import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { routes } from "vue-router/auto-routes";
import { DataLoaderPlugin } from "unplugin-vue-router/data-loaders";
import App from "./App.vue";

const router = createRouter({
  history: createWebHistory(),
  routes,
});

const app = createApp(App);
app.use(router);
app.use(DataLoaderPlugin, { router });
app.mount("#app");`,

    'src/api.ts': `function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Post {
  id: number;
  userId: number;
  title: string;
}

export interface Comment {
  id: number;
  postId: number;
  body: string;
}

export async function fetchPost(postId: number): Promise<Post> {
  await delay(1000);
  return { id: postId, userId: 1, title: "油魚並不是鱈魚" };
}

export async function fetchRelatedPosts(postId: number): Promise<Post[]> {
  await delay(1000);
  return [
    { id: 2, userId: 1, title: "如何分辨鱈魚和油魚？" },
  ];
}

export async function fetchCommentList(postId: number): Promise<Comment[]> {
  await delay(1000);
  return [
    { id: 1, postId, body: "隨便啦，所以說哪個便宜？" },
    { id: 2, postId, body: "反正都一樣油" },
  ];
}`,

    'src/fetch-log.ts': `import { ref } from "vue";

export interface FetchLogEntry {
  label: string;
  startTime: number;
  endTime: number;
}

const logEntryList = ref<FetchLogEntry[]>([]);
let baseTime = 0;

export function useFetchLog() {
  return { logEntryList, resetLog, trackFetch };
}

export function resetLog() {
  logEntryList.value = [];
  baseTime = Date.now();
}

export async function trackFetch<T>(
  label: string,
  fetcher: () => Promise<T>
): Promise<T> {
  if (baseTime === 0) {
    baseTime = Date.now();
  }
  const startTime = Date.now() - baseTime;
  const result = await fetcher();
  const endTime = Date.now() - baseTime;
  logEntryList.value.push({ label, startTime, endTime });
  return result;
}`,

    'src/App.vue': `<template>
  <div class="app">
    <nav>
      <router-link to="/">首頁</router-link>
      <router-link to="/waterfall">瀑布流問題</router-link>
      <router-link to="/with-loader">Data Loader</router-link>
    </nav>
    <router-view />
  </div>
</template>

<style>
@layer base, layout, components;

@layer base {
  :root {
    --color-teal: oklch(0.62 0.14 178);
    --color-teal-light: oklch(0.92 0.04 178);
    --color-teal-subtle: oklch(0.965 0.015 178);
    --color-coral: oklch(0.65 0.14 30);
    --color-coral-light: oklch(0.93 0.04 30);
    --color-coral-subtle: oklch(0.97 0.02 30);
    --color-surface: oklch(0.985 0.005 178);
    --color-surface-raised: oklch(0.995 0.003 178);
    --color-text: oklch(0.22 0.02 178);
    --color-text-secondary: oklch(0.48 0.01 178);
    --color-text-tertiary: oklch(0.62 0.008 178);
    --color-border: oklch(0.9 0.01 178);
    --font-display: "Bricolage Grotesque", "Noto Sans TC", sans-serif;
    --font-body: "Noto Sans TC", -apple-system, BlinkMacSystemFont, sans-serif;
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: var(--font-body);
    color: var(--color-text);
    background: var(--color-surface);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
}

@layer layout {
  .app { max-width: 640px; margin: 0 auto; padding: var(--space-lg) var(--space-md); }
}

@layer components {
  nav {
    display: flex;
    gap: var(--space-xs);
    margin-bottom: var(--space-xl);
    padding: var(--space-xs);
    background: oklch(0.95 0.01 178);
    border-radius: var(--radius-md);
  }

  nav a {
    color: var(--color-text-secondary);
    text-decoration: none;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    transition: color 0.2s, background 0.2s;
    flex: 1;
    text-align: center;
  }

  nav a:hover {
    color: var(--color-text);
    background: oklch(0.98 0.005 178);
  }

  nav a.router-link-active {
    color: var(--color-teal);
    background: var(--color-surface-raised);
    font-weight: 600;
    box-shadow: 0 1px 3px oklch(0 0 0 / 0.06);
  }
}
</style>`,

    'src/components/FetchTimeline.vue': `<template>
  <div class="timeline" :class="\`timeline--\${variant}\`">
    <div class="timeline-header">
      <h3>Fetch 時間軸</h3>
      <span v-if="logEntryList.length > 0" class="timeline-total" :class="\`total--\${variant}\`">
        {{ totalTime }}ms
      </span>
    </div>
    <div v-if="logEntryList.length === 0" class="empty">
      <span class="pulse"></span>
      載入中⋯
    </div>
    <div class="entry-list">
      <div v-for="(entry, index) in logEntryList" :key="entry.label" class="entry">
        <span class="label">{{ entry.label }}</span>
        <div class="bar-track">
          <div class="bar" :style="{
            left: \`\${(entry.startTime / maxTime) * 100}%\`,
            width: \`\${((entry.endTime - entry.startTime) / maxTime) * 100}%\`,
            background: getBarColor(index),
            animationDelay: \`\${index * 0.08}s\`,
          }">
            <span class="bar-text">{{ entry.endTime - entry.startTime }}ms</span>
          </div>
        </div>
        <span class="end-time">{{ entry.endTime }}ms</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useFetchLog } from "../fetch-log";

interface Props {
  variant?: "waterfall" | "loader";
}

const props = withDefaults(defineProps<Props>(), {
  variant: "waterfall",
});

const { logEntryList } = useFetchLog();

const maxTime = computed(() => {
  if (logEntryList.value.length === 0) return 1;
  return Math.max(...logEntryList.value.map((e) => e.endTime));
});

const totalTime = computed(() => {
  if (logEntryList.value.length === 0) return 0;
  return Math.max(...logEntryList.value.map((e) => e.endTime));
});

const waterfallColorList = [
  "oklch(0.68 0.14 45)",
  "oklch(0.62 0.15 30)",
  "oklch(0.58 0.16 15)",
];

const loaderColorList = [
  "oklch(0.62 0.13 178)",
  "oklch(0.56 0.12 195)",
  "oklch(0.52 0.12 210)",
];

function getBarColor(index: number): string {
  const colorList = props.variant === "loader" ? loaderColorList : waterfallColorList;
  return colorList[index % colorList.length];
}
</script>

<style scoped>
.timeline {
  margin-top: var(--space-lg);
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}
.timeline--waterfall { background: var(--color-coral-subtle); border-color: oklch(0.9 0.04 30); }
.timeline--loader { background: var(--color-teal-subtle); border-color: oklch(0.88 0.04 178); }
.timeline-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}
h3 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-tertiary); }
.timeline-total { font-family: var(--font-display); font-size: 28px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
.total--waterfall { color: var(--color-coral); }
.total--loader { color: var(--color-teal); }
.empty { display: flex; align-items: center; gap: var(--space-sm); color: var(--color-text-tertiary); font-size: 14px; padding: var(--space-sm) 0; }
.pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--color-text-tertiary); animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
.entry-list { display: flex; flex-direction: column; gap: var(--space-sm); }
.entry { display: flex; align-items: center; gap: var(--space-sm); }
.label { width: 64px; font-size: 13px; font-weight: 600; text-align: right; flex-shrink: 0; color: var(--color-text-secondary); }
.bar-track { flex: 1; height: 32px; background: oklch(0 0 0 / 0.04); border-radius: var(--radius-sm); position: relative; overflow: hidden; }
.bar {
  position: absolute; top: 3px; bottom: 3px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center; min-width: 52px;
  animation: barGrow 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  transform-origin: left center;
}
.bar-text { font-size: 12px; color: oklch(1 0 0); font-weight: 600; text-shadow: 0 1px 2px oklch(0 0 0 / 0.15); }
@keyframes barGrow { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
.end-time { width: 54px; font-size: 12px; color: var(--color-text-tertiary); flex-shrink: 0; font-variant-numeric: tabular-nums; }
</style>`,

    'src/components/PostRelatedList.vue': `<template>
  <div v-if="loading" class="loading">
    <span class="loading-dot"></span>
    載入推薦文章中⋯
  </div>
  <div v-else>
    <h4>推薦文章</h4>
    <ul>
      <li v-for="post in relatedList" :key="post.id">{{ post.title }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { fetchRelatedPosts, type Post } from "../api";
import { trackFetch } from "../fetch-log";

const props = defineProps<{ postId: number }>();
const relatedList = ref<Post[]>([]);
const loading = ref(true);

onMounted(async () => {
  relatedList.value = await trackFetch("Related", () => fetchRelatedPosts(props.postId));
  loading.value = false;
});
</script>

<style scoped>
h4 { font-size: 14px; font-weight: 600; margin: var(--space-md) 0 var(--space-sm); color: var(--color-text-secondary); }
ul { padding-left: 20px; font-size: 14px; }
li { margin-bottom: var(--space-xs); line-height: 1.5; }
.loading { display: flex; align-items: center; gap: var(--space-sm); color: var(--color-text-tertiary); font-size: 14px; padding: var(--space-sm) 0; }
.loading-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-text-tertiary); animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
</style>`,

    'src/components/PostCommentList.vue': `<template>
  <div v-if="loading" class="loading">
    <span class="loading-dot"></span>
    載入留言中⋯
  </div>
  <div v-else>
    <h4>留言</h4>
    <ul>
      <li v-for="comment in commentList" :key="comment.id">{{ comment.body }}</li>
    </ul>
    <PostRelatedList v-if="commentList.length > 0" :post-id="props.postId" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { fetchCommentList, type Comment } from "../api";
import { trackFetch } from "../fetch-log";
import PostRelatedList from "./PostRelatedList.vue";

const props = defineProps<{ postId: number }>();
const commentList = ref<Comment[]>([]);
const loading = ref(true);

onMounted(async () => {
  commentList.value = await trackFetch("Comment", () => fetchCommentList(props.postId));
  loading.value = false;
});
</script>

<style scoped>
h4 { font-size: 14px; font-weight: 600; margin: var(--space-md) 0 var(--space-sm); color: var(--color-text-secondary); }
ul { padding-left: 20px; font-size: 14px; }
li { margin-bottom: var(--space-xs); line-height: 1.5; }
.loading { display: flex; align-items: center; gap: var(--space-sm); color: var(--color-text-tertiary); font-size: 14px; padding: var(--space-sm) 0; }
.loading-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-text-tertiary); animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
</style>`,

    'src/pages/index.vue': `<template>
  <div class="home">
    <header class="hero">
      <h1>Vue Data Loader</h1>
      <p>比較兩種資料取得方式，理解 fetch 瀑布流問題與解法。</p>
    </header>
    <div class="scenario-list">
      <router-link to="/waterfall" class="scenario scenario--problem">
        <div class="scenario-header">
          <span class="scenario-badge">問題</span>
          <span class="scenario-time">~3 秒</span>
        </div>
        <h2>瀑布流 Fetch</h2>
        <p>子元件依序請求，層層等待</p>
        <div class="mini-timeline">
          <div class="mini-row">
            <span class="mini-label">Post</span>
            <div class="mini-track"><div class="mini-bar" style="--offset: 0; --bar-color: oklch(0.68 0.14 45);"></div></div>
          </div>
          <div class="mini-row">
            <span class="mini-label">Comment</span>
            <div class="mini-track"><div class="mini-bar" style="--offset: 1; --bar-color: oklch(0.62 0.15 30);"></div></div>
          </div>
          <div class="mini-row">
            <span class="mini-label">Related</span>
            <div class="mini-track"><div class="mini-bar" style="--offset: 2; --bar-color: oklch(0.58 0.16 15);"></div></div>
          </div>
        </div>
      </router-link>
      <router-link to="/with-loader" class="scenario scenario--solution">
        <div class="scenario-header">
          <span class="scenario-badge">解法</span>
          <span class="scenario-time">~1 秒</span>
        </div>
        <h2>Data Loader</h2>
        <p>路由層級平行取得，一次到位</p>
        <div class="mini-timeline">
          <div class="mini-row">
            <span class="mini-label">Post</span>
            <div class="mini-track"><div class="mini-bar" style="--offset: 0; --bar-color: oklch(0.62 0.13 178);"></div></div>
          </div>
          <div class="mini-row">
            <span class="mini-label">Comment</span>
            <div class="mini-track"><div class="mini-bar" style="--offset: 0; --bar-color: oklch(0.56 0.12 195);"></div></div>
          </div>
          <div class="mini-row">
            <span class="mini-label">Related</span>
            <div class="mini-track"><div class="mini-bar" style="--offset: 0; --bar-color: oklch(0.52 0.12 210);"></div></div>
          </div>
        </div>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.hero { margin-bottom: var(--space-xl); }
h1 { font-family: var(--font-display); font-size: clamp(26px, 5vw, 32px); font-weight: 700; letter-spacing: -0.02em; margin-bottom: var(--space-sm); }
.hero > p { color: var(--color-text-secondary); font-size: 15px; }
.scenario-list { display: flex; flex-direction: column; gap: var(--space-md); }
.scenario {
  display: block; padding: var(--space-lg); border-radius: var(--radius-lg);
  text-decoration: none; color: inherit;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
  border: 1px solid var(--color-border);
}
.scenario:hover { transform: translateY(-3px); box-shadow: 0 8px 24px oklch(0 0 0 / 0.06); }
.scenario--problem { background: var(--color-coral-subtle); border-color: oklch(0.9 0.04 30); }
.scenario--solution { background: var(--color-teal-subtle); border-color: oklch(0.88 0.04 178); }
.scenario-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-sm); }
.scenario-badge { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; padding: 2px 8px; border-radius: 4px; }
.scenario--problem .scenario-badge { background: var(--color-coral-light); color: oklch(0.45 0.12 30); }
.scenario--solution .scenario-badge { background: var(--color-teal-light); color: oklch(0.4 0.12 178); }
.scenario-time { font-family: var(--font-display); font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.scenario--problem .scenario-time { color: var(--color-coral); }
.scenario--solution .scenario-time { color: var(--color-teal); }
.scenario h2 { font-family: var(--font-display); font-size: 18px; font-weight: 600; margin-bottom: 2px; }
.scenario > p { color: var(--color-text-secondary); font-size: 14px; margin-bottom: var(--space-md); }
.mini-timeline { display: flex; flex-direction: column; gap: 5px; }
.mini-row { display: flex; align-items: center; gap: var(--space-sm); }
.mini-label { width: 56px; font-size: 12px; font-weight: 500; text-align: right; color: var(--color-text-tertiary); flex-shrink: 0; }
.mini-track { flex: 1; height: 8px; background: oklch(0 0 0 / 0.04); border-radius: 4px; position: relative; overflow: hidden; }
.mini-bar {
  position: absolute; top: 0; bottom: 0;
  left: calc(var(--offset) * 33.3%); width: 33.3%;
  border-radius: 4px; background: var(--bar-color);
  animation: miniGrow 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  animation-delay: calc(var(--offset) * 0.15s);
  transform-origin: left center; transform: scaleX(0);
}
@keyframes miniGrow { to { transform: scaleX(1); } }
@media (min-width: 480px) { .scenario-list { flex-direction: row; } .scenario { flex: 1; } }
</style>`,

    'src/pages/waterfall.vue': `<template>
  <div>
    <header class="page-header">
      <div>
        <h2>瀑布流問題</h2>
        <p class="desc">每個子元件等父元件 fetch 完才開始自己的 fetch，形成瀑布流。</p>
      </div>
      <button class="rerun-button" @click="rerun">重新執行</button>
    </header>
    <div class="content">
      <div v-if="loading" class="loading">
        <span class="loading-dot"></span>
        載入文章中⋯
      </div>
      <div v-else>
        <h3>文章：{{ post?.title }}</h3>
        <PostCommentList :post-id="post!.id" />
      </div>
    </div>
    <FetchTimeline variant="waterfall" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { fetchPost, type Post } from "../api";
import { resetLog, trackFetch } from "../fetch-log";
import PostCommentList from "../components/PostCommentList.vue";
import FetchTimeline from "../components/FetchTimeline.vue";

const post = ref<Post>();
const loading = ref(true);

async function run() {
  loading.value = true;
  resetLog();
  post.value = await trackFetch("Post", () => fetchPost(1));
  loading.value = false;
}

onMounted(run);

function rerun() { run(); }
</script>

<style scoped>
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-md); margin-bottom: var(--space-md); }
h2 { font-family: var(--font-display); font-size: 20px; font-weight: 700; margin-bottom: 2px; }
.desc { color: var(--color-text-secondary); font-size: 14px; }
.rerun-button {
  flex-shrink: 0; padding: var(--space-sm) var(--space-md);
  font-size: 13px; font-weight: 500; font-family: inherit;
  color: var(--color-text-secondary); background: var(--color-surface-raised);
  border: 1px solid var(--color-border); border-radius: var(--radius-sm); cursor: pointer;
  transition: color 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.rerun-button:hover { color: var(--color-text); border-color: oklch(0.8 0.02 178); box-shadow: 0 2px 6px oklch(0 0 0 / 0.05); }
.content { padding: var(--space-lg); background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
h3 { font-size: 15px; font-weight: 600; margin-bottom: var(--space-sm); }
.loading { display: flex; align-items: center; gap: var(--space-sm); color: var(--color-text-tertiary); font-size: 14px; }
.loading-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-text-tertiary); animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
</style>`,

    'src/pages/with-loader.vue': `<template>
  <div>
    <header class="page-header">
      <div>
        <h2>Data Loader</h2>
        <p class="desc">三個 loader 在導航時平行執行，資料載完才進入頁面。</p>
      </div>
      <button class="rerun-button" @click="rerun">重新執行</button>
    </header>
    <div class="content">
      <h3>文章：{{ post.title }}</h3>
      <h4>留言</h4>
      <ul>
        <li v-for="comment in commentList" :key="comment.id">{{ comment.body }}</li>
      </ul>
      <h4>推薦文章</h4>
      <ul>
        <li v-for="p in relatedList" :key="p.id">{{ p.title }}</li>
      </ul>
    </div>
    <FetchTimeline variant="loader" />
  </div>
</template>

<script lang="ts">
import { defineBasicLoader } from "unplugin-vue-router/data-loaders/basic";
import { fetchPost, fetchCommentList, fetchRelatedPosts } from "../api";
import { resetLog, trackFetch } from "../fetch-log";

export const usePostLoader = defineBasicLoader("/with-loader", async () => {
  resetLog();
  return trackFetch("Post", () => fetchPost(1));
});

export const useCommentListLoader = defineBasicLoader("/with-loader", async () => {
  return trackFetch("Comment", () => fetchCommentList(1));
});

export const useRelatedListLoader = defineBasicLoader("/with-loader", async () => {
  return trackFetch("Related", () => fetchRelatedPosts(1));
});
</script>

<script setup lang="ts">
import FetchTimeline from "../components/FetchTimeline.vue";

const { data: post, reload: reloadPost } = usePostLoader();
const { data: commentList, reload: reloadComments } = useCommentListLoader();
const { data: relatedList, reload: reloadRelated } = useRelatedListLoader();

function rerun() {
  // 同步觸發所有 loader 的重新讀取
  Promise.all([
    reloadPost(),
    reloadComments(),
    reloadRelated(),
  ]);
}
</script>

<style scoped>
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-md); margin-bottom: var(--space-md); }
h2 { font-family: var(--font-display); font-size: 20px; font-weight: 700; margin-bottom: 2px; }
.desc { color: var(--color-text-secondary); font-size: 14px; }
.rerun-button {
  flex-shrink: 0; padding: var(--space-sm) var(--space-md);
  font-size: 13px; font-weight: 500; font-family: inherit;
  color: var(--color-text-secondary); background: var(--color-surface-raised);
  border: 1px solid var(--color-border); border-radius: var(--radius-sm); cursor: pointer;
  transition: color 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.rerun-button:hover { color: var(--color-text); border-color: oklch(0.8 0.02 178); box-shadow: 0 2px 6px oklch(0 0 0 / 0.05); }
.content { padding: var(--space-lg); background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-md); }

h3 { font-size: 15px; font-weight: 600; margin-bottom: var(--space-sm); }
h4 { font-size: 14px; font-weight: 600; margin: var(--space-md) 0 var(--space-sm); color: var(--color-text-secondary); }
ul { padding-left: 20px; font-size: 14px; }
li { margin-bottom: var(--space-xs); line-height: 1.5; }
</style>`,
  },
}
