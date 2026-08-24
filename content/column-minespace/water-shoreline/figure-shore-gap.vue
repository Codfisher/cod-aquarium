<template>
  <figure-frame
    title="深度差量的是「沿著視線」的距離"
    caption="水面片元與它背後那塊沙地，量的是沿著同一條視線走了多遠，這段距離會跟著視角變，並非固定的垂直水深。兩邊的垂直水深其實一樣，左邊低頭往下看，視線幾乎垂直穿過水面，gap 跟水深差不多；右邊視線壓得很平，幾乎貼著水面看過去，同樣深的水，沿視線要走的路卻變長了，gap 因此拉長到將近三倍。白沫的濃淡照 gap 算，這也是為什麼平視時白沫會整片攤開。"
  >
    <svg
      viewBox="0 0 720 300"
      role="img"
      aria-label="兩個視線角度穿過同樣深的水，左邊接近垂直、gap 較短，右邊接近水平、gap 拉長將近三倍"
    >
      <!-- 水體與沙地的底色 -->
      <rect x="40" y="96" width="640" height="68" fill="#3d7fd6" opacity="0.12" />
      <rect x="40" y="164" width="640" height="50" fill="#cfc7b4" opacity="0.55" />

      <!-- 水面與沙地的分界線 -->
      <line x1="40" y1="96" x2="680" y2="96" stroke="#3d7fd6" stroke-width="2" opacity="0.8" />
      <line x1="40" y1="164" x2="680" y2="164" stroke="#8a8578" stroke-width="2" opacity="0.9" />

      <text x="48" y="88" fill="currentColor" font-size="13" opacity="0.7">水面</text>
      <text x="48" y="182" fill="currentColor" font-size="13" opacity="0.7">沙地</text>

      <!-- 兩個場景的分隔線 -->
      <line x1="300" y1="6" x2="300" y2="252" stroke="currentColor" stroke-width="1" stroke-dasharray="4 4" opacity="0.22" />

      <!-- 左邊：低頭看，視線接近垂直 -->
      <text x="150" y="18" fill="currentColor" font-size="14" text-anchor="middle" opacity="0.85">低頭看</text>

      <!-- 鏡頭到水面：只是路過的一段，用淡色虛線 -->
      <line x1="128.1" y1="35.9" x2="150" y2="96" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.4" />
      <circle cx="128.1" cy="35.9" r="5" fill="currentColor" opacity="0.85" />
      <text x="136" y="39" fill="currentColor" font-size="12" opacity="0.75">鏡頭</text>

      <!-- 垂直水深參考線 -->
      <line x1="150" y1="96" x2="150" y2="164" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.65" />
      <text x="132" y="133" fill="#64748b" font-size="12" text-anchor="end" opacity="0.85">水深</text>

      <!-- 水面到沙地：gap，重點線段 -->
      <line x1="150" y1="96" x2="174.7" y2="164" stroke="#e8a33d" stroke-width="4" stroke-linecap="round" />
      <circle cx="150" cy="96" r="4" fill="#e8a33d" />
      <circle cx="174.7" cy="164" r="4" fill="#8a8578" stroke="#5f5b52" stroke-width="1" />
      <text x="184" y="140" fill="#e8a33d" font-size="13">gap</text>

      <!-- 右邊：平視，視線接近水平 -->
      <text x="510" y="18" fill="currentColor" font-size="14" text-anchor="middle" opacity="0.85">平視</text>

      <line x1="399.9" y1="74.1" x2="460" y2="96" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.4" />
      <circle cx="399.9" cy="74.1" r="5" fill="currentColor" opacity="0.85" />
      <text x="368" y="80" fill="currentColor" font-size="12" opacity="0.75">鏡頭</text>

      <line x1="460" y1="96" x2="460" y2="164" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.65" />
      <text x="442" y="133" fill="#64748b" font-size="12" text-anchor="end" opacity="0.85">水深</text>

      <line x1="460" y1="96" x2="646.8" y2="164" stroke="#e8a33d" stroke-width="4" stroke-linecap="round" />
      <circle cx="460" cy="96" r="4" fill="#e8a33d" />
      <circle cx="646.8" cy="164" r="4" fill="#8a8578" stroke="#5f5b52" stroke-width="1" />
      <text x="560" y="180" fill="#e8a33d" font-size="13">gap（拉長了）</text>

      <!-- 圖例 -->
      <g>
        <line x1="252" y1="270" x2="284" y2="270" stroke="#e8a33d" stroke-width="4" stroke-linecap="round" />
        <text x="292" y="275" fill="currentColor" font-size="13" opacity="0.75">gap：沿視線量到的距離，白沫照這個算</text>
      </g>
      <g>
        <line x1="252" y1="292" x2="284" y2="292" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4 4" />
        <text x="292" y="297" fill="currentColor" font-size="13" opacity="0.75">水深：垂直量到的深度，兩邊其實相同</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
