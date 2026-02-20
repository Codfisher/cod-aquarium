<!-- <template></template> -->

<script setup lang="ts">
interface Props {
  label?: string;
}
const props = withDefaults(defineProps<Props>(), {
  label: '',
})

const emit = defineEmits<{
  'update:model-value': [value: string];
}>()

defineSlots<{
  default: (props: { msg: string }) => any;
}>()
</script>

<style scoped lang="sass">
</style>
