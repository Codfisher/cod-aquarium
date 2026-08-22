<template>
  <figure-frame
    title="鏡頭翻過水面，東西全部原地不動"
    caption="鏡頭往水面上的 P 點看過去，那道視線本該在水面反射一次，折向岸邊的燈籠。把鏡頭沿水面鏡射到另一側，新的位置往同一點 P 直直看過去，正好對上燈籠，兩段距離相等，夾角也相等。鏡射後的鏡頭往前直直畫一張圖，畫出來的就是水面在 P 點該顯示的倒影，過程中燈籠沒有多一份複製，位置也完全沒有搬動。"
  >
    <svg
      viewBox="0 0 640 400"
      role="img"
      aria-label="真實鏡頭在水面上方看向水面上的一點，反射路徑彎去照到岸邊燈籠；鏡射到水面下方的鏡頭則直直看向同一點，正好對上同一顆燈籠"
    >
      <!-- 水面以下淡淡上色，標出鏡射發生的另一側 -->
      <rect x="0" y="200" width="640" height="200" fill="#3d7fd6" opacity="0.06" />

      <!-- 水面 -->
      <line x1="40" y1="200" x2="600" y2="200" stroke="currentColor" stroke-width="2" opacity="0.55" />
      <text x="46" y="192" fill="currentColor" font-size="13" opacity="0.75">水面</text>

      <!-- 等距標示：鏡頭與鏡射後的鏡頭到水面的距離相等 -->
      <g stroke="currentColor" stroke-width="1" opacity="0.4">
        <line x1="95" y1="50" x2="95" y2="350" stroke-dasharray="4 4" />
        <line x1="88" y1="50" x2="102" y2="50" />
        <line x1="88" y1="200" x2="102" y2="200" />
        <line x1="88" y1="350" x2="102" y2="350" />
      </g>
      <text x="60" y="128" fill="currentColor" font-size="12" opacity="0.6">距離相等</text>
      <text x="60" y="278" fill="currentColor" font-size="12" opacity="0.6">距離相等</text>

      <!--
        鏡射後鏡頭直直看向 L 的那條線，先畫在下面。
        它會穿過 P 點一路延伸到燈籠，稍後真實路徑的實線疊上來，
        水面之上的那一段自然被蓋成實線，只留水面之下那段虛線看得到
      -->
      <line
        x1="120" y1="350" x2="450" y2="110"
        stroke="#e8a33d" stroke-width="2.2" stroke-dasharray="7 5" opacity="0.85"
      />

      <!-- 真實路徑：鏡頭看向 P，在水面折一次，折去照到燈籠 -->
      <polyline
        points="120,50 326,200 450,110"
        fill="none" stroke="#3d7fd6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"
      />

      <!-- 法線提示，水面在 P 點的垂直參考線 -->
      <line x1="326" y1="178" x2="326" y2="222" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.45" />

      <!-- P 點 -->
      <circle cx="326" cy="200" r="5" fill="currentColor" />
      <text x="334" y="216" fill="currentColor" font-size="13">P</text>

      <!-- 真實鏡頭 -->
      <circle cx="120" cy="50" r="7" fill="#3d7fd6" />
      <text x="30" y="42" fill="#3d7fd6" font-size="14">鏡頭</text>

      <!-- 鏡射後的鏡頭（虛的，不會真的畫出來） -->
      <circle cx="120" cy="350" r="7" fill="none" stroke="#e8a33d" stroke-width="2.2" />
      <text x="10" y="374" fill="#e8a33d" font-size="14">鏡射後的鏡頭</text>

      <!-- 岸邊的石燈籠 -->
      <g fill="#8a8578" stroke="#5f5b52" stroke-width="1.2">
        <rect x="433" y="98" width="34" height="26" rx="2" />
        <rect x="440" y="124" width="20" height="67" rx="1" />
      </g>
      <text x="472" y="112" fill="currentColor" font-size="13" opacity="0.75">岸邊的燈籠</text>

      <!-- 圖例 -->
      <g>
        <line x1="378" y1="270" x2="412" y2="270" stroke="#3d7fd6" stroke-width="2.6" stroke-linecap="round" />
        <text x="420" y="275" fill="currentColor" font-size="13" opacity="0.85">真實路徑，水面折一次</text>

        <line x1="378" y1="298" x2="412" y2="298" stroke="#e8a33d" stroke-width="2.2" stroke-dasharray="7 5" />
        <text x="420" y="303" fill="currentColor" font-size="13" opacity="0.85">鏡射視線，直直穿過 P</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
