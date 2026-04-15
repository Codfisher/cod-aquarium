<template>
  <div>
    <h2>🌊 瀑布流問題</h2>
    <p class="desc">
      每個子元件等父元件 fetch 完才開始自己的 fetch，形成瀑布流。
    </p>

    <div class="content">
      <div v-if="loading" class="loading">
        載入使用者中...
      </div>
      <div v-else>
        <h3>使用者：{{ user?.name }}</h3>
        <UserPostList :user-id="user!.id" />
      </div>
    </div>

    <FetchTimeline />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fetchUser, type User } from '../api';
import { resetLog, trackFetch } from '../fetch-log';
import UserPostList from '../components/UserPostList.vue';
import FetchTimeline from '../components/FetchTimeline.vue';

const user = ref<User>();
const loading = ref(true);

onMounted(async () => {
  resetLog();
  user.value = await trackFetch('User', () => fetchUser(1));
  loading.value = false;
});
</script>

<style scoped>
h2 {
  font-size: 18px;
  margin-bottom: 4px;
}

.desc {
  color: #888;
  font-size: 13px;
  margin-bottom: 16px;
}

.content {
  padding: 16px;
  background: white;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
}

h3 {
  font-size: 15px;
  margin-bottom: 8px;
}

.loading {
  color: #999;
  font-size: 14px;
}
</style>
