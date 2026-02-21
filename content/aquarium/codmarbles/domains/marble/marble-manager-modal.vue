<template>
  <u-modal
    v-model:open="isOpen"
    title="管理彈珠"
    description="新增或清空彈珠名稱"
    :ui="{
      content: 'rounded-2xl',
      footer: 'flex justify-end gap-4',
    }"
    @update:open="handleOpen"
  >
    <slot />

    <template #body>
      <div class="flex flex-col gap-4 p-2">
        <div class="flex gap-2 items-end">
          <u-form-field
            class="flex-1"
            label="彈珠名稱"
            description="可以使用 , 分隔多個名稱 "
          >
            <u-input
              v-model="newName"
              placeholder="ex: 煞氣的鱈魚"
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
          class="flex flex-col gap-1 overflow-y-auto h-[50dvh]"
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
          class="text-center text-sm text-gray-400 py-4 h-[50dvh]"
        >
          尚無彈珠，請新增名稱
        </div>
      </div>
    </template>

    <template #footer>
      <u-popover>
        <u-button
          label="清空所有彈珠"
          color="error"
          size="lg"
          variant="soft"
          icon="i-material-symbols:delete-outline-rounded"
          :disabled="form.list.length === 0"
        />

        <template #content="{ close }">
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
                @click="clearAll(); close()"
              />
            </div>
          </div>
        </template>
      </u-popover>

      <u-button
        label="確認"
        size="lg"
        :disabled="form.list.length === 0"
        @click="submit"
      />
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import { isTruthy } from 'remeda';
import { ref, useTemplateRef, watch } from 'vue';

interface Props {
  list?: string[];
}
const props = withDefaults(defineProps<Props>(), {
  list: () => [],
})

const emit = defineEmits<{
  submit: [list: string[]],
}>()

const isOpen = ref(false)

const form = ref({
  list: [...props.list],
})
function initForm() {
  form.value.list = [...props.list]
}
watch(() => props.list, (list) => {
  initForm()
})

function handleOpen(open: boolean) {
  if (open) {
    initForm()
  }
}

const newName = ref('')

function addMarble() {
  const trimmed = newName.value.trim()
  if (!trimmed) {
    return
  }
  const names = trimmed
    .split(/,|\s+/)
    .filter(isTruthy)
    .map(name => name.trim())

  form.value.list.push(...names)
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
  isOpen.value = false
}
</script>
