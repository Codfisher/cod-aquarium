<template>
  <u-modal
    title="管理彈珠"
    description="新增或清空彈珠名稱"
    :ui="{
      content: 'rounded-2xl',
      footer: 'flex justify-end gap-4',
    }"
  >
    <slot />

    <template #body>
      <div class="flex flex-col gap-4 p-2">
        <!-- 新增彈珠 -->
        <div class="flex gap-2 items-end">
          <u-form-field
            label="彈珠名稱"
            class="flex-1"
          >
            <u-input
              v-model="newName"
              placeholder="輸入名稱..."
              class="w-full"
              @keydown.enter="addMarble"
            />
          </u-form-field>
          <u-button
            label="新增"
            :disabled="newName.trim() === ''"
            @click="addMarble"
          />
        </div>

        <!-- 彈珠清單 -->
        <div
          v-if="form.list.length > 0"
          class="flex flex-col gap-1 max-h-60 overflow-y-auto"
        >
          <div
            v-for="(name, index) in form.list"
            :key="index"
            class="flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800"
          >
            <span class="text-sm">{{ name }}</span>
            <u-button
              icon="i-material-symbols:close-rounded"
              variant="ghost"
              color="neutral"
              size="xs"
              @click="removeMarble(index)"
            />
          </div>
        </div>

        <div
          v-else
          class="text-center text-sm text-gray-400 py-4"
        >
          尚無彈珠，請新增名稱
        </div>

        <!-- 清空按鈕 + Popover 確認 -->
        <div class="flex justify-end">
          <u-popover>
            <u-button
              label="清空所有"
              color="error"
              variant="soft"
              icon="i-material-symbols:delete-outline-rounded"
              :disabled="form.list.length === 0"
            />

            <template #content>
              <div class="flex flex-col gap-3 p-4 w-56">
                <p class="text-sm font-medium">
                  確定要清空所有彈珠嗎？
                </p>
                <p class="text-xs text-gray-500">
                  此操作無法復原
                </p>
                <div class="flex justify-end gap-2">
                  <u-button
                    label="取消"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                  />
                  <u-button
                    label="清空"
                    color="error"
                    size="sm"
                    @click="clearAll"
                  />
                </div>
              </div>
            </template>
          </u-popover>
        </div>
      </div>
    </template>

    <template #footer>
      <u-button
        label="確認"
        size="lg"
        @click="submit"
      />
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  list?: string[];
}
const props = withDefaults(defineProps<Props>(), {
  list: () => [],
})

const emit = defineEmits<{
  submit: [list: string[]],
}>()

const form = ref({
  list: [...props.list],
})

const newName = ref('')

function addMarble() {
  const trimmed = newName.value.trim()
  if (!trimmed) {
    return
  }
  form.value.list.push(trimmed)
  newName.value = ''
}

function removeMarble(index: number) {
  form.value.list.splice(index, 1)
}

function clearAll() {
  form.value.list = []
}

function submit() {
  emit('submit', form.value.list)
}
</script>
