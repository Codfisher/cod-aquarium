<template>
  <div v-if="loading" class="loading">
    載入文章中...
  </div>
  <div v-else>
    <h3>文章列表</h3>
    <ul>
      <li
        v-for="post in postList"
        :key="post.id"
      >
        {{ post.title }}
      </li>
    </ul>

    <PostCommentList
      v-if="postList.length > 0"
      :post-id="postList[0].id"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fetchPostList, type Post } from '../api';
import { trackFetch } from '../fetch-log';
import PostCommentList from './PostCommentList.vue';

const props = defineProps<{
  userId: number;
}>();

const postList = ref<Post[]>([]);
const loading = ref(true);

onMounted(async () => {
  postList.value = await trackFetch('Post', () => fetchPostList(props.userId));
  loading.value = false;
});
</script>

<style scoped>
h3 {
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

.loading {
  color: #999;
  font-size: 14px;
  padding: 8px 0;
}
</style>
