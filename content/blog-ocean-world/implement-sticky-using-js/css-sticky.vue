<template>
  <div class="flex items-start h-[30vh] overflow-y-auto p-10 rounded-lg border-3 border-gray-200">
    <div class="h-screen relative">
      <div class="relative top-0 p-4 rounded-lg bg-blue-300 text-blue-700 font-semibold">
        relative
      </div>

      <div class=" absolute top-0 left-1/1 p-4 rounded-lg bg-green-300 text-green-700 font-semibold">
        absolute
      </div>

      <div class="sticky top-0 p-4 rounded-lg bg-red-300 text-red-700 font-semibold">
        sticky
      </div>
    </div>
  </div>
</template>
