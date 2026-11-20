<template>
  <!-- 先放縮圖，點了才換成真正的 iframe：首頁原本一次嵌 12 個 YouTube iframe，每個都會下載數百 KB 的播放器 -->
  <div
    class="youtube-facade"
    :class="{ 'is-vertical': isVertical }"
  >
    <iframe
      v-if="isPlaying"
      :src="`https://www.youtube.com/embed/${videoId}?autoplay=1`"
      :title="title"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    />
    <button
      v-else
      type="button"
      class="poster"
      :aria-label="`播放影片：${title}`"
      @click="isPlaying = true"
    >
      <img
        :src="`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`"
        alt=""
        loading="lazy"
        decoding="async"
        width="480"
        height="360"
      >
      <span
        class="play-icon"
        aria-hidden="true"
      >
        <u-icon name="i-material-symbols:play-arrow-rounded" />
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  /** YouTube 影片 ID，例如 YU6zbUv6Okc */
  videoId: string;
  title: string;
  /** YouTube Shorts 等直式影片，改用 9:16 框 */
  isVertical?: boolean;
}
defineProps<Props>()

const isPlaying = ref(false)
</script>

<style scoped>
.youtube-facade {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--plate-line);
  /* 圓角與全站圖片一致。圓角要放在外層並裁切：只有內層縮圖有圓角時，外層黑底會從四個角露出來 */
  border-radius: 1rem;
  background: #000;
}

/* 直式影片：限制寬度避免在桌機欄位裡過高。
 * Shorts 的 hqdefault 縮圖是 4:3、直式畫面置中兩側黑邊，cover 裁成 9:16 剛好留下畫面本體 */
.youtube-facade.is-vertical {
  aspect-ratio: 9 / 16;
  width: min(100%, 270px);
  margin-inline: auto;
}

.youtube-facade iframe,
.poster {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}

.poster {
  padding: 0;
  cursor: pointer;
  background: none;
}

.poster img {
  width: 100%;
  height: 100%;
  margin: 0;
  object-fit: cover;
  /* 框線與圓角由外層負責，拿掉全站 img 預設的邊框與圓角 */
  border: none;
  border-radius: 0;
}

.play-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  font-size: 40px;
  color: #fff;
  background: oklch(0.42 0.1 175 / 0.88);
  border-radius: 999px;
  transform: translate(-50%, -50%);
  transition: background-color 0.25s, transform 0.25s;
}

.poster:hover .play-icon,
.poster:focus-visible .play-icon {
  background: oklch(0.42 0.1 175);
  transform: translate(-50%, -50%) scale(1.06);
}

.poster:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .play-icon {
    transition: none;
  }
}
</style>
