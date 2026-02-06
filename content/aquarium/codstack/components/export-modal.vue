<template>
  <u-modal
    title="Export Scene"
    :description="`${validMeshList.length} objects`"
    @update:open="updateTime"
  >
    <slot />

    <template #body>
      <u-textarea
        autoresize
        readonly
        class="w-full"
        :ui="{ base: 'bg-gray-900 text-green-400 font-mono resize-none text-xs' }"
        :value="jsonString"
      />
    </template>

    <template #footer>
      <div class="grid grid-cols-2 gap-2 w-full">
        <u-button
          color="primary"
          icon="i-material-symbols:download-2-rounded"
          label="Download JSON file"
          @click="downloadJSON"
        />

        <u-button
          v-if="isSupported"
          color="neutral"
          variant="outline"
          icon="i-material-symbols:content-copy-rounded"
          @click="copyToClipboard"
        >
          Copy to clipboard
          <u-kbd value="Ctrl + C" />
        </u-button>
      </div>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import { type AbstractMesh, Quaternion } from '@babylonjs/core'
import { useClipboard, useMagicKeys, whenever } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, ref } from 'vue'
import { nextFrame } from '../../../../web/common/utils'
import { sceneDataVersion } from '../constants'
import { useMainStore } from '../stores/main-store'
import { getMeshMeta } from '../utils/babylon'
import { cleanFloat } from '../utils/math'
import { pipe, tap } from 'remeda'

interface Props {
  meshList?: AbstractMesh[];
}
const props = withDefaults(defineProps<Props>(), {
  meshList: () => [],
})

const mainStore = useMainStore()
const toast = useToast()

/** 強制更新用 */
const updatedAt = ref(0)
function updateTime() {
  updatedAt.value = Date.now()
}

const rootName = computed(() => mainStore.rootFsHandle?.name ?? '')

const validMeshList = computed(() => {
  // 依賴 openedAt，確保每次打開都重新計算
  const value = updatedAt.value

  return props.meshList.filter((mesh) => mesh.isEnabled())
})

function serializeQuaternion(q: Quaternion) {
  const qn = q.normalizeToNew()

  const arr = qn.asArray().map((n) => cleanFloat(n, 8))

  // 因為 rounding 會破壞 unit，再正規化一次
  const q2 = Quaternion.FromArray(arr).normalize()

  // 統一符號（q 和 -q 等價），避免接近 180° 時跳號
  if (q2.w < 0)
    q2.scaleInPlace(-1)

  return q2.asArray().map((n) => cleanFloat(n, 8))
}

const extractedData = computed(() => {
  if (!validMeshList.value.length)
    return []

  return validMeshList.value.map((mesh) => {
    // 處理旋轉：優先使用 Quaternion，若無則從 Euler 轉換
    const quaternion = pipe(
      mesh.rotationQuaternion?.clone() ?? Quaternion.RotationYawPitchRoll(mesh.rotation.y, mesh.rotation.x, mesh.rotation.z),
      // 因為有 bake 過，所以會和一般的 babylonjs 差 Y 軸 180 度旋轉
      tap((quaternion) =>
        quaternion.multiplyInPlace(new Quaternion(0, 1, 0, 0))
      ),
    )

    const meta = getMeshMeta(mesh)
    const path = meta?.path ?? ''

    return {
      path,
      position: mesh.position.asArray().map((n) => cleanFloat(n, 8)),
      rotationQuaternion: serializeQuaternion(quaternion),
      scaling: mesh.scaling.asArray().map((n) => cleanFloat(n, 8)),
      metadata: meta
        ? {
          name: meta?.name,
          mass: meta?.mass,
          restitution: meta?.restitution,
          friction: meta?.friction,
        }
        : undefined,
    }
  })
})

const jsonString = computed(() => {
  const json = JSON.stringify({
    version: sceneDataVersion,
    rootFolderName: rootName.value,
    partList: extractedData.value,
  }, null, 2)

  // 把換行的矩陣換成單行
  return json.replace(/\[[\d\s.,+\-e]+\]/g, (match) =>
    match.replace(/\s/g, '').replace(/,/g, ', '))
})
const { copy, isSupported } = useClipboard({ source: jsonString })

function downloadJSON() {
  const blob = new Blob([jsonString.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `scene_data_${dayjs().format('YYYYMMDD_HHmmss')}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function copyToClipboard() {
  try {
    await copy()
    toast.add({
      title: 'Copied to clipboard',
      description: 'You can now paste the scene data to another application.',
      color: 'success',
    })
  }
  catch (err) {
    console.error('Failed to copy', err)
  }
}

const { ctrl_c: ctrlCKey } = useMagicKeys()
whenever(() => ctrlCKey?.value, async () => {
  updateTime()
  await nextFrame()
  copyToClipboard()
})
</script>

<style scoped lang="sass">
</style>
