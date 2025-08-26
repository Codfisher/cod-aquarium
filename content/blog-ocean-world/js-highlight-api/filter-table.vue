<template>
  <div class="w-full border rounded p-2">
    <div class="border rounded p-2 w-full">
      <input
        v-model="keyword"
        type="text"
        placeholder="輸入關鍵字篩選資料"
        class="w-full"
      >
    </div>

    <div class="h-[30vh] overflow-auto mt-2">
      <table class="w-full !table !m-0">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col"
            >
              {{ col }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filteredRows"
            :key="row.id"
          >
            <td
              v-for="col, i in columns"
              :key="col"
              :class="{ 'break-all': i === 2 }"
            >
              {{ row[col] }}
            </td>
          </tr>

          <tr v-if="filteredRows.length === 0">
            <td
              :colspan="columns.length"
              class="text-center py-2"
            >
              查無資料
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface Row {
  id: number;
  name: string;
  value: string;
  [key: string]: string | number;
}

const columns = ['id', 'name', 'value']
const rows = ref<Row[]>([
  { id: 1, name: 'Cod', value: '鱈魚是一種生活在寒冷海域的魚類，肉質細嫩，常用於西式料理和炸魚薯條。聽說少數個體會使用電腦，真是匪夷所思' },
  { id: 2, name: 'Salmon', value: '鮭魚富含 Omega-3 脂肪酸，常見於生魚片、燒烤及煙燻料理，是營養價值極高的魚類。' },
  { id: 3, name: 'Tuna', value: '鮪魚體型巨大，肉質結實，常用於壽司和罐頭食品，也是重要的經濟魚種。' },
  { id: 4, name: 'Mackerel', value: '鯖魚油脂豐富，味道濃郁，適合煎烤或醃漬，是亞洲料理中常見的食材。' },
])

const keyword = defineModel({ default: '' })
const filteredRows = computed(() => {
  if (!keyword.value.trim()) {
    return rows.value
  }
  const k = keyword.value.trim().toLowerCase()
  return rows.value.filter((row) =>
    columns.some((col) => String(row[col]).toLowerCase().includes(k)),
  )
})
</script>

<style scoped lang="sass">
</style>
