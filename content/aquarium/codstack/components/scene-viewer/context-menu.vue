<template>
  <u-context-menu
    :items="contextMenuItems"
    :ui="{
      label: 'text-xs opacity-50',
    }"
  >
    <slot />

    <template
      v-if="selectedMeshes[0]"
      #rotate-x-label="{ item }: any"
    >
      <div>
        {{ item.label }}
      </div>

      <div
        class="flex gap-1 mt-1"
        @pointermove.stop
      >
        <u-button
          v-for="degree in [90, -90, 180, -180]"
          :key="degree"
          :label="`${degree}°`"
          size="xs"
          variant="soft"
          color="neutral"
          @click="emit('rotate', selectedMeshes[0], 'x', degree * Math.PI / 180)"
        />
      </div>
    </template>

    <template
      v-if="selectedMeshes[0]"
      #rotate-y-label="{ item }: any"
    >
      <div>
        {{ item.label }}
      </div>

      <div
        class="flex gap-1 mt-1"
        @pointermove.stop
      >
        <u-button
          v-for="degree in [90, -90, 180, -180]"
          :key="degree"
          :label="`${degree}°`"
          size="xs"
          variant="soft"
          color="neutral"
          @click="emit('rotate', selectedMeshes[0], 'y', degree * Math.PI / 180)"
        />
      </div>
    </template>

    <template
      v-if="selectedMeshes[0]"
      #rotate-z-label="{ item }: any"
    >
      <div>
        {{ item.label }}
      </div>

      <div
        class="flex gap-1 mt-1"
        @pointermove.stop
      >
        <u-button
          v-for="degree in [90, -90, 180, -180]"
          :key="degree"
          :label="`${degree}°`"
          size="xs"
          variant="soft"
          color="neutral"
          @click="emit('rotate', selectedMeshes[0], 'z', degree * Math.PI / 180)"
        />
      </div>
    </template>

    <template
      v-if="selectedMeshes[0]"
      #metadata
    >
      <div
        class="flex flex-col gap-1"
        @pointermove.stop
      >
        <u-form-field
          label="Name"
          orientation="horizontal"
        >
          <u-input
            type="text"
            :model-value="metadata?.name"
            @update:model-value="(val: string) => emit('updateSelectedMeta', { name: val })"
          />
        </u-form-field>

        <u-separator class="my-1" />

        <u-form-field
          label="Mass"
          orientation="horizontal"
        >
          <u-input
            type="number"
            :model-value="metadata?.mass"
            @update:model-value="(val: number) => emit('updateSelectedMeta', { mass: Number(val) })"
          />
        </u-form-field>

        <u-form-field
          label="Restitution"
          orientation="horizontal"
        >
          <u-input
            type="number"
            :model-value="metadata?.restitution"
            @update:model-value="(val: number) => emit('updateSelectedMeta', { restitution: Number(val) })"
          />
        </u-form-field>

        <u-form-field
          label="Friction"
          orientation="horizontal"
        >
          <u-input
            type="number"
            :model-value="metadata?.friction"
            @update:model-value="(val: number) => emit('updateSelectedMeta', { friction: Number(val) })"
          />
        </u-form-field>
      </div>
    </template>
  </u-context-menu>
</template>

<script setup lang="ts">
import type { AbstractMesh } from '@babylonjs/core'
import type { ContextMenuItem } from '@nuxt/ui/.'
import type { MeshMeta } from '../../type'
import { filter, isTruthy, pipe } from 'remeda'
import { computed } from 'vue'
import { getMeshMeta } from '../../utils/babylon'

const props = defineProps<{
  previewMesh?: AbstractMesh;
  selectedMeshes: AbstractMesh[];
  addedMeshList: AbstractMesh[];
  canUndo: boolean;
  canRedo: boolean;
}>()

const emit = defineEmits<{
  // preview
  cancelPreview: [];
  updatePreviewOffset: [data: Partial<{
    vertical: number;
    yRotation: number;
  }>];
  useAsPreview: [path: string];

  // selection
  selectAll: [];
  deselect: [];
  duplicateSelected: [];
  deleteSelected: [];

  // transform
  rotate: [mesh: AbstractMesh, axis: 'x' | 'y' | 'z', angleRad: number];
  enableGizmo: [mode: 'position' | 'rotation' | 'scale'];
  snapToGround: [];
  moveToOrigin: [];
  resetRotation: [];
  resetScale: [];
  alignAxis: [axis: 'x' | 'y' | 'z'];
  alignBounds: [axis: 'x' | 'y' | 'z', dir: 'max' | 'min'];

  // meta
  updateSelectedMeta: [patch: Partial<MeshMeta>];

  // history / view
  undo: [];
  redo: [];
  resetView: [];
}>()

defineSlots<{
  default: () => any;
}>()

const firstSelectedMesh = computed(() => props.selectedMeshes[0])
const metadata = computed(() => getMeshMeta(firstSelectedMesh.value))

/** 放置預覽的右鍵選單 */
const previewMenuItems = computed<ContextMenuItem[] | undefined>(() => {
  const previewMesh = props.previewMesh
  if (!previewMesh) {
    return
  }

  return [
    { label: 'Preview Mesh', type: 'label' },
    {
      icon: 'material-symbols:cancel-outline-rounded',
      label: 'Cancel Placement',
      kbds: ['escape'],
      onSelect: () => emit('cancelPreview'),
    },
    {
      icon: 'i-material-symbols:arrow-upward-rounded',
      label: 'Vertical Up',
      kbds: ['q'],
      onSelect: (e) => {
        emit('updatePreviewOffset', { vertical: 0.1 })
        e.preventDefault()
      },
    },
    {
      icon: 'material-symbols:arrow-downward-rounded',
      label: 'Vertical Down',
      kbds: ['e'],
      onSelect: (e) => {
        emit('updatePreviewOffset', { vertical: -0.1 })
        e.preventDefault()
      },
    },
    {
      icon: 'i-material-symbols:rotate-90-degrees-cw-outline-rounded',
      label: 'Rotate Y +45° (cw)',
      kbds: ['a'],
      onSelect: (e) => {
        emit('updatePreviewOffset', { yRotation: Math.PI / 180 * 45 })
        e.preventDefault()
      },
    },
    {
      icon: 'i-material-symbols:rotate-90-degrees-ccw-outline-rounded',
      label: 'Rotate Y -45° (ccw)',
      kbds: ['d'],
      onSelect: (e) => {
        emit('updatePreviewOffset', { yRotation: -Math.PI / 180 * 45 })
        e.preventDefault()
      },
    },
    {
      icon: 'i-material-symbols:check-circle-outline-rounded',
      label: 'Use as Preview',
      kbds: ['enter'],
      onSelect: () => emit('useAsPreview', previewMesh.name),
    },
  ]
})

/** 選取多個 Mesh 的右鍵選單  */
const multiSelectionMenuItems = computed<ContextMenuItem[] | undefined>(() => {
  const [firstMesh] = props.selectedMeshes
  if (props.selectedMeshes.length < 2 || !firstMesh) {
    return
  }

  return [
    { label: `${props.selectedMeshes.length} meshes selected`, type: 'label' },
    {
      icon: 'i-material-symbols:align-vertical-bottom',
      label: 'Align to First Selected (yellow)',
      children: [
        {
          icon: 'i-material-symbols:align-justify-center-rounded',
          label: 'Align X',
          kbds: ['a', 'x'],
          onSelect: () => emit('alignAxis', 'x'),
        },
        {
          icon: 'i-material-symbols:vertical-align-center',
          label: 'Align Y',
          kbds: ['a', 'y'],
          onSelect: () => emit('alignAxis', 'y'),
        },
        {
          icon: 'i-material-symbols:vertical-align-center',
          label: 'Align Z',
          kbds: ['a', 'z'],
          onSelect: () => emit('alignAxis', 'z'),
        },
      ],
    },
    {
      icon: 'i-material-symbols:align-vertical-bottom',
      label: 'Align to Bounds',
      children: [
        {
          icon: 'i-material-symbols:align-horizontal-left-rounded',
          label: 'Align to X Max',
          onSelect: () => emit('alignBounds', 'x', 'max'),
        },
        {
          icon: 'i-material-symbols:align-vertical-top-rounded',
          label: 'Align to Y Max',
          onSelect: () => emit('alignBounds', 'y', 'max'),
        },
        {
          icon: 'i-material-symbols:align-horizontal-left-rounded',
          label: 'Align to Z Max',
          onSelect: () => emit('alignBounds', 'z', 'max'),
        },
        { type: 'separator' },
        {
          icon: 'i-material-symbols:align-horizontal-right-rounded',
          label: 'Align to X Min',
          onSelect: () => emit('alignBounds', 'x', 'min'),
        },
        {
          icon: 'i-material-symbols:align-vertical-bottom-rounded',
          label: 'Align to Y Min',
          onSelect: () => emit('alignBounds', 'y', 'min'),
        },
        {
          icon: 'i-material-symbols:align-horizontal-right-rounded',
          label: 'Align to Z Min',
          onSelect: () => emit('alignBounds', 'z', 'min'),
        },
      ],
    },
    {
      icon: 'material-symbols:content-copy-outline-rounded',
      label: 'Duplicate',
      kbds: ['shift', 'd'],
      onSelect: () => emit('duplicateSelected'),
    },
    {
      icon: 'i-material-symbols:delete-outline-rounded',
      label: 'Delete',
      kbds: ['delete'],
      onSelect: () => emit('deleteSelected'),
    },
  ]
})

/** 選取單個 Mesh 的右鍵選單  */
const selectOneMenuItems = computed<ContextMenuItem[] | undefined>(() => {
  if (props.selectedMeshes.length !== 1) {
    return
  }
  const firstMesh = firstSelectedMesh.value
  if (!firstMesh)
    return

  const meta = getMeshMeta(firstMesh)
  if (!meta)
    return

  return [
    { label: meta.fileName, type: 'label' },
    {
      icon: 'i-material-symbols:database',
      label: 'Metadata',
      children: [
        {
          slot: 'metadata',
          onSelect: (e) => e.preventDefault(),
        },
      ] satisfies ContextMenuItem[],
    },
    {
      icon: 'hugeicons:three-d-move',
      label: 'Position',
      children: [
        {
          icon: 'i-material-symbols:drag-handle-rounded',
          label: 'Enable handles',
          kbds: ['g'],
          onSelect: () => emit('enableGizmo', 'position'),
        },
        {
          icon: 'i-material-symbols:download-2-rounded',
          label: 'Snap to ground',
          onSelect: () => emit('snapToGround'),
        },
        {
          icon: 'ri:reset-right-fill',
          label: 'Move to origin',
          onSelect: () => emit('moveToOrigin'),
        },
      ] satisfies ContextMenuItem[],
    },
    {
      icon: 'hugeicons:three-d-rotate',
      label: 'Rotation',
      children: [
        {
          icon: 'i-material-symbols:drag-handle-rounded',
          label: 'Enable handles',
          kbds: ['r'],
          onSelect: () => emit('enableGizmo', 'rotation'),
        },
        {
          icon: 'i-material-symbols:rotate-90-degrees-ccw-outline-rounded',
          label: 'Rotate on X axis',
          slot: 'rotate-x',
          onSelect: (e) => e.preventDefault(),
        },
        {
          icon: 'i-material-symbols:rotate-90-degrees-ccw-outline-rounded',
          label: 'Rotate on Y axis',
          slot: 'rotate-y',
          onSelect: (e) => e.preventDefault(),
        },
        {
          icon: 'i-material-symbols:rotate-90-degrees-ccw-outline-rounded',
          label: 'Rotate on Z axis',
          slot: 'rotate-z',
          onSelect: (e) => e.preventDefault(),
        },
        {
          icon: 'ri:reset-right-fill',
          label: 'Reset',
          onSelect: (e) => {
            emit('resetRotation')
            e.preventDefault()
          },
        },
      ] as const,
    },
    {
      icon: 'hugeicons:three-d-scale',
      label: 'Scale',
      children: [
        {
          icon: 'i-material-symbols:drag-handle-rounded',
          label: 'Enable handles',
          kbds: ['s'],
          onSelect: () => emit('enableGizmo', 'scale'),
        },
        {
          icon: 'ri:reset-right-fill',
          label: 'Reset',
          onSelect: () => emit('resetScale'),
        },
      ] as const,
    },
    {
      icon: 'i-material-symbols:preview',
      label: 'Use as Preview',
      onSelect: () => emit('useAsPreview', meta.path),
    },
    {
      icon: 'material-symbols:content-copy-outline-rounded',
      label: 'Duplicate',
      kbds: ['shift', 'd'],
      onSelect: () => emit('duplicateSelected'),
    },
    {
      icon: 'i-material-symbols:delete-outline-rounded',
      label: 'Delete',
      kbds: ['delete'],
      onSelect: () => emit('deleteSelected'),
    },
  ]
})

/** 基礎選單 */
const baseMenuItems = computed<ContextMenuItem[]>(() => {
  return [
    pipe(undefined, () => {
      const anyMeshEnabled = props.addedMeshList.some((mesh) => mesh.isEnabled())
      if (!anyMeshEnabled)
        return

      return {
        icon: 'material-symbols:select-all-rounded',
        label: 'Select All',
        kbds: ['ctrl', 'a'],
        onSelect: () => emit('selectAll'),
      }
    }),
    pipe(undefined, () => {
      if (!props.selectedMeshes.length)
        return

      return {
        icon: 'material-symbols:deselect-rounded',
        label: 'Deselect',
        kbds: ['escape'],
        onSelect: () => emit('deselect'),
      }
    }),
    {
      icon: 'material-symbols:undo-rounded',
      label: 'Undo',
      kbds: ['ctrl', 'z'],
      disabled: !props.canUndo,
      onSelect: () => emit('undo'),
    },
    {
      icon: 'material-symbols:redo-rounded',
      label: 'Redo',
      kbds: ['ctrl', 'y'],
      disabled: !props.canRedo,
      onSelect: () => emit('redo'),
    },
    {
      icon: 'material-symbols:flip-camera-ios-outline-rounded',
      label: 'Reset View',
      onSelect: () => emit('resetView'),
    },
  ].filter(isTruthy)
})

/** 右鍵選單 */
const contextMenuItems = computed(() => pipe(
  [
    previewMenuItems.value,
    multiSelectionMenuItems.value,
    selectOneMenuItems.value,
    baseMenuItems.value,
  ],
  filter(isTruthy),
))
</script>
