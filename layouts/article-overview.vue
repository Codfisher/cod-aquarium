<template>
  <div class=" flex flex-col items-center py-10">
    <div class=" md:w-1/2 flex flex-col gap-4">

      <p>可以使用 Tag 快速過濾文章！(๑•̀ㅂ•́)و✧</p>
      <div class="flex gap-2">
        <badge
          v-for="tag in tagList"
          :key="tag.name"
          class="tag-filter cursor-pointer duration-300"
          :class="{ 'badge-active': tag.selected }"
          @click="toggleTag(tag.name)"
        >
          {{ tag.name }}
        </badge>
      </div>

      <h1 class="text-4xl font-bold mt-6">文章列表</h1>

      <!-- 文章列表 -->
      <transition-group
        name="list"
        tag="div"
      >
        <div
          v-for="content in contents"
          :key="content._path"
          class=" my-6 flex flex-col gap-2"
        >
          <div class="text-xl font-bold">
            {{ content.title }}
          </div>
          <div class="text-xs opacity-50">
            {{ content.description }}
          </div>

          <div class="flex gap-2">
            <div
              v-for="tag in content.tags"
              :key="tag"
              class="border px-3 py-1 rounded-full bg-gray-100 opacity-80 text-xs cursor-pointer"
              @click="toggleTag(tag)"
            >
              {{ tag }}
            </div>
          </div>
        </div>
      </transition-group>

      <pre>
        {{ contents }}
      </pre>
    </div>
  </div>
</template>

<script
  setup
  lang="ts"
>


const selectedTags = ref<string[]>([]);
function toggleTag(name: string) {
  const index = selectedTags.value.indexOf(name);

  if (index < 0) {
    selectedTags.value.push(name);
  } else {
    selectedTags.value.splice(index, 1);
  }
}

const { data: tags } = await useAsyncData('tags',
  async () => {
    const result = new Set();

    const data = await queryContent()
      .only(['tags'])
      .find()

    data
      .flatMap(({ tags }) => tags)
      .forEach((tag) => {
        if (!tag) return;
        result.add(tag);
      });

    return [...result];
  },
)

const tagList = computed(() => {
  return tags.value.map((name) => {
    const selected = selectedTags.value.indexOf(name) >= 0;

    return { name, selected }
  });
});


const { data: contents } = await useAsyncData('contents',
  () => queryContent()
    .where({
      _path: { $regex: 'blog' },
      _type: 'markdown',
      _draft: false,
    })
    .without(['body'])
    .find(),
)


</script>

<style scoped>
.tag-filter {
  opacity: 0.4;
}

.badge-active {
  opacity: 1;
}

.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.5s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.list-leave-active {
  position: absolute;
}
</style>