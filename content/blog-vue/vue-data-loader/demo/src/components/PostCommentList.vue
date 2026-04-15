<template>
  <div v-if="loading" class="loading">
    載入留言中...
  </div>
  <div v-else>
    <h3>留言</h3>
    <ul>
      <li
        v-for="comment in commentList"
        :key="comment.id"
      >
        {{ comment.body }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fetchCommentList, type Comment } from '../api';
import { trackFetch } from '../fetch-log';

const props = defineProps<{
  postId: number;
}>();

const commentList = ref<Comment[]>([]);
const loading = ref(true);

onMounted(async () => {
  commentList.value = await trackFetch('Comment', () => fetchCommentList(props.postId));
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
