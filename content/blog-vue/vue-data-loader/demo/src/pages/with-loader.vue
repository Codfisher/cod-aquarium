<template>
  <div>
    <h2>⚡ Data Loader</h2>
    <p class="desc">
      三個 loader 在導航時平行執行，資料載完才進入頁面。
    </p>

    <div class="content">
      <h3>使用者：{{ user.name }}</h3>

      <h4>文章列表</h4>
      <ul>
        <li
          v-for="post in postList"
          :key="post.id"
        >
          {{ post.title }}
        </li>
      </ul>

      <h4>留言</h4>
      <ul>
        <li
          v-for="comment in commentList"
          :key="comment.id"
        >
          {{ comment.body }}
        </li>
      </ul>
    </div>

    <FetchTimeline />
  </div>
</template>

<script lang="ts">
import {
  defineBasicLoader,
} from 'unplugin-vue-router/data-loaders/basic';
import { fetchUser, fetchPostList, fetchCommentList } from '../api';
import { resetLog, trackFetch } from '../fetch-log';

export const useUserLoader = defineBasicLoader('/with-loader', async () => {
  resetLog();
  return trackFetch('User', () => fetchUser(1));
});

export const usePostListLoader = defineBasicLoader('/with-loader', async () => {
  return trackFetch('Post', () => fetchPostList(1));
});

export const useCommentListLoader = defineBasicLoader('/with-loader', async () => {
  return trackFetch('Comment', () => fetchCommentList(1));
});
</script>

<script setup lang="ts">
import FetchTimeline from '../components/FetchTimeline.vue';

const { data: user } = useUserLoader();
const { data: postList } = usePostListLoader();
const { data: commentList } = useCommentListLoader();
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

h4 {
  font-size: 14px;
  margin: 12px 0 6px;
}

ul {
  padding-left: 20px;
  font-size: 14px;
}

li {
  margin-bottom: 4px;
}
</style>
