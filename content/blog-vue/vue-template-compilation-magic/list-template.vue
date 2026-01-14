<script setup>
defineProps(['items'])
</script>

<template>
  <div class="root-container">
    <div v-for="item in items" :key="item.id" class="card-wrapper" data-test="static-attr">
      <div class="card-header" style="background: #eee; padding: 10px; border-bottom: 1px solid #ddd;">
        <h4 class="title" style="margin: 0; color: #333;">
          靜態標題 - Level 1
        </h4>
        <span class="badge" style="background: red; color: white; padding: 2px 5px;">Static Badge</span>
      </div>

      <div class="level-2-wrapper" style="display: flex; gap: 10px; padding: 10px;">
        <div class="static-col-left" style="width: 50px; background: #ccc;">
          Left
        </div>

        <div class="level-3-wrapper" style="flex: 1; border: 1px dashed blue;">
          <ul class="static-list" style="list-style: none; margin: 0; padding: 0;">
            <li style="padding: 5px;">
              Static List Item A
            </li>
            <li style="padding: 5px;">
              Static List Item B
            </li>

            <li class="level-4-target" style="padding: 5px; background: #eef;">
              <span class="label" style="font-weight: bold; margin-right: 10px;">Value:</span>

              <span class="dynamic-val" style="color: blue; font-size: 1.2em;">
                {{ item.text }}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div class="card-footer" style="padding: 5px; text-align: center; color: #999;">
        Copyright &copy; 2024 Static Inc.
      </div>
    </div>
  </div>
</template>
