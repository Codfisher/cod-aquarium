<template>
  <figure-frame
    title="水面爬升的方向，法線倒向另一邊"
    caption="這條曲線是拿來算斜率的高度場，水面網格本身沒有動。P 點往右一步是 P + step，兩點的高度差換算成斜率方向，也就是圖上那條淺灰的切線。法線原本一路朝上，往斜率的反方向轉了大約二十四度，變成圖上那根藍色的 N。高度往哪邊爬升，法線就往哪邊的反面倒，兩個座標軸各自比一次，才湊出完整的擾動方向。"
  >
    <svg
      viewBox="0 0 640 300"
      role="img"
      aria-label="一條起伏的高度場曲線，P 點與右側一步之外的取樣點連出切線，法線因此從原本朝上的方向轉向斜率的反面"
    >
      <!-- 水面網格實際上仍是平的 -->
      <line x1="30" y1="220" x2="490" y2="220" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.25" />
      <text x="495" y="238" fill="currentColor" font-size="12" opacity="0.6">網格仍是平的</text>

      <!-- 高度場 h(x) -->
      <polyline
        points="40,253.81 48,254.57 56,254.95 64,254.95 72,254.57 80,253.81 88,252.68 96,251.19 104,249.35 112,247.2 120,244.75 128,242.03 136,239.06 144,235.89 152,232.54 160,229.06 168,225.48 176,221.83 184,218.17 192,214.52 200,210.94 208,207.46 216,204.11 224,200.94 232,197.97 240,195.25 248,192.8 256,190.65 264,188.81 272,187.32 280,186.19 288,185.43 296,185.05 304,185.05 312,185.43 320,186.19 328,187.32 336,188.81 344,190.65 352,192.8 360,195.25 368,197.97 376,200.94 384,204.11 392,207.46 400,210.94 408,214.52 416,218.17 424,221.83 432,225.48 440,229.06 448,232.54 456,235.89 464,239.06 472,242.03 480,244.75"
        fill="none"
        stroke="#3d7fd6"
        stroke-width="2.5"
      />
      <text x="330" y="172" fill="#3d7fd6" font-size="13" opacity="0.85">高度場 h(x)</text>

      <!-- 切線：P 與 P+step 兩點連出來的方向 -->
      <line x1="159.8" y1="228.8" x2="270.4" y2="180.5" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 3" />

      <!-- 取樣點 -->
      <circle cx="180" cy="220" r="5" fill="currentColor" />
      <text x="164" y="212" fill="currentColor" font-size="13">P</text>
      <circle cx="220" cy="202.5" r="5" fill="currentColor" />
      <text x="204" y="195" fill="currentColor" font-size="13">P + step</text>

      <!-- 取樣間距 -->
      <g stroke="currentColor" stroke-width="1" opacity="0.5">
        <line x1="180" y1="267" x2="220" y2="267" />
        <line x1="180" y1="262" x2="180" y2="272" />
        <line x1="220" y1="262" x2="220" y2="272" />
      </g>
      <text x="182" y="288" fill="currentColor" font-size="12" opacity="0.7">取樣間距 step</text>

      <!-- 未擾動的法線，一路朝上 -->
      <line x1="180" y1="220" x2="180" y2="132" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 4" />
      <polygon points="180,132 184.5,141 175.5,141" fill="#94a3b8" />
      <text x="184" y="120" fill="currentColor" font-size="13" opacity="0.85">N（未擾動）</text>

      <!-- 擾動後的法線，倒向斜率的反方向 -->
      <line x1="180" y1="220" x2="144.7" y2="139.4" stroke="#3d7fd6" stroke-width="3" />
      <polygon points="144.7,139.4 152.4,145.8 144.2,149.4" fill="#3d7fd6" />
      <text x="58" y="146" fill="currentColor" font-size="13">N（擾動後）</text>

      <!-- 兩根法線之間的夾角 -->
      <path d="M180 170 A50 50 0 0 0 160 174.2" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.6" />
      <text x="128" y="158" fill="currentColor" font-size="12" opacity="0.8">24°</text>

      <!-- 兩種狀態的對照 -->
      <g>
        <line x1="330" y1="256" x2="366" y2="256" stroke="#3d7fd6" stroke-width="3" />
        <text x="376" y="261" fill="currentColor" font-size="13">高度往右升，法線倒向左邊</text>

        <line x1="330" y1="282" x2="366" y2="282" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 4" />
        <text x="376" y="287" fill="currentColor" font-size="13">沒擾動時整片水共用同一個法線</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
