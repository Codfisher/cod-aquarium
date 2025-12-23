<template>
  <div class="h-[20vh] overflow-y-auto p-10 rounded-lg border-3 border-gray-200">
    <div class="flex items-start h-screen relative">
      <div class="h-[15vh] relative text-center top-0 p-4 rounded-lg bg-sky-300 text-sky-700 font-semibold">
        relative
      </div>

      <div class="h-[15vh] absolute text-center top-0 left-0 translate-x-2/1 p-4 rounded-lg bg-emerald-300 text-emerald-700 font-semibold">
        absolute
      </div>

      <div class=" h-[15vh] rounded-lg bg-rose-300 text-rose-700 font-semibold">
        <div class="sticky text-center top-0 p-4 font-semibold">
          sticky
        </div>
      </div>
    </div>
  </div>
</template>
