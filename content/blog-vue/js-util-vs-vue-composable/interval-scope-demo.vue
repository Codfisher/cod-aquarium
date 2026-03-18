<template>
  <interval-card
    label="effectScope 補救"
    :correct="true"
    :show="showScope"
    :count="scopeCount"
    :leaking="!showScope && scopeCount > scopeCountWhenDestroyed"
    :stopped="!showScope && scopeCount <= scopeCountWhenDestroyed"
    @toggle="toggleScope()"
  >
    <interval-effect-scope v-if="showScope" />
  </interval-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import IntervalCard from './interval-card.vue'
import IntervalEffectScope from './interval-effect-scope.vue'
import { resetScopeCount, scopeCount } from './interval-store'

const showScope = ref(true)
const scopeCountWhenDestroyed = ref(0)

function toggleScope() {
  if (showScope.value) {
    scopeCountWhenDestroyed.value = scopeCount.value
  }
  else {
    resetScopeCount()
    scopeCountWhenDestroyed.value = 0
  }
  showScope.value = !showScope.value
}
</script>
