<template>
  <div class="h-[40vh] overflow-y-auto p-10 rounded-lg border-3 border-gray-200">
    <div class="flex items-start h-[60vh] relative">
      <div class="h-[20vh] relative text-center top-0 p-4 rounded-lg bg-sky-200 text-sky-700 font-semibold">
        relative
      </div>

      <div class="h-[20vh] absolute text-center top-0 left-0 translate-x-2/1 p-4 rounded-lg bg-emerald-200 text-emerald-700 font-semibold">
        absolute
      </div>

      <div class=" h-[20vh] rounded-lg bg-rose-200 text-rose-700 font-semibold">
        <div class="sticky text-center top-0 p-4 font-semibold">
          sticky
        </div>
      </div>
    </div>
  </div>
</template>
