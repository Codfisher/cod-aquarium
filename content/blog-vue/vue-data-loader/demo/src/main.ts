import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { routes } from 'vue-router/auto-routes';
import { DataLoaderPlugin } from 'unplugin-vue-router/data-loaders';
import App from './App.vue';

const router = createRouter({
  history: createWebHistory(),
  routes,
});

const app = createApp(App);
app.use(router);
app.use(DataLoaderPlugin, { router });
app.mount('#app');
