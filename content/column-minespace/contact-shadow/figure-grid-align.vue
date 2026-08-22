<template>
  <figure-frame
    title="取樣格長在光源自己的座標軸上"
    caption="灰色虛線是世界座標格，藍色實線是陰影貼圖真正使用的光源座標格，兩者角度不同。鏡頭位置四捨五入到最近的世界格（紅圈）之後，投影到光源座標剛好落在格子正中央，完全對不上光源的格線；把座標先投影到光源自己的兩條軸上再四捨五入（藍點），才會精準落在光源格線的交點。"
  >
    <svg
      viewBox="0 0 560 460"
      role="img"
      aria-label="灰色的世界座標格與藍色的光源座標格互相傾斜，鏡頭位置對齊世界格後落在光源格子正中央，改成對齊光源自己的軸才落在光源格線交點上"
    >
      <!-- 世界座標格：跟畫面一樣正的格線 -->
      <g stroke="currentColor" stroke-width="1" stroke-dasharray="4 4" opacity="0.3">
        <line x1="12" y1="0" x2="12" y2="460" />
        <line x1="74" y1="0" x2="74" y2="460" />
        <line x1="136" y1="0" x2="136" y2="460" />
        <line x1="198" y1="0" x2="198" y2="460" />
        <line x1="260" y1="0" x2="260" y2="460" />
        <line x1="322" y1="0" x2="322" y2="460" />
        <line x1="384" y1="0" x2="384" y2="460" />
        <line x1="446" y1="0" x2="446" y2="460" />
        <line x1="508" y1="0" x2="508" y2="460" />
        <line x1="0" y1="436" x2="560" y2="436" />
        <line x1="0" y1="374" x2="560" y2="374" />
        <line x1="0" y1="312" x2="560" y2="312" />
        <line x1="0" y1="250" x2="560" y2="250" />
        <line x1="0" y1="188" x2="560" y2="188" />
        <line x1="0" y1="126" x2="560" y2="126" />
        <line x1="0" y1="64" x2="560" y2="64" />
        <line x1="0" y1="2" x2="560" y2="2" />
      </g>

      <!--
        光源座標格：跟著光線方向轉，這裡轉 25 度只是示意，
        重點是它跟世界格不同角度，而陰影貼圖的取樣格長在這上面。
        每條線都已經算過跟畫布邊界的交點，長度不是隨手拉的
      -->
      <g stroke="#3d7fd6" stroke-width="1.2" opacity="0.4">
        <line x1="84.3" y1="460" x2="0" y2="279.2" />
        <line x1="152.7" y1="460" x2="0" y2="132.5" />
        <line x1="221.1" y1="460" x2="6.6" y2="0" />
        <line x1="289.5" y1="460" x2="75" y2="0" />
        <line x1="426.3" y1="460" x2="211.8" y2="0" />
        <line x1="494.7" y1="460" x2="280.2" y2="0" />
        <line x1="560" y1="306.5" x2="417.1" y2="0" />
        <line x1="560" y1="159.8" x2="485.5" y2="0" />

        <line x1="396.5" y1="460" x2="560" y2="383.7" />
        <line x1="249.8" y1="460" x2="560" y2="315.3" />
        <line x1="103.1" y1="460" x2="560" y2="246.9" />
        <line x1="0" y1="439.6" x2="560" y2="178.5" />
        <line x1="0" y1="302.8" x2="560" y2="41.7" />
        <line x1="0" y1="234.4" x2="502.7" y2="0" />
        <line x1="0" y1="166" x2="356" y2="0" />
        <line x1="0" y1="97.6" x2="209.3" y2="0" />
      </g>
      <!-- 這兩條光源格線剛好交會在「對齊光源格」那個點上，加粗標出來 -->
      <g stroke="#3d7fd6" stroke-width="2.2" opacity="0.9">
        <line x1="560" y1="453.2" x2="348.7" y2="0" />
        <line x1="0" y1="371.2" x2="560" y2="110.1" />
      </g>

      <!-- 圖例 -->
      <g font-size="12.5" fill="currentColor" opacity="0.8">
        <line x1="20" y1="22" x2="52" y2="22" stroke="currentColor" stroke-width="1" stroke-dasharray="4 4" opacity="0.6" />
        <text x="60" y="26">世界座標格</text>
        <line x1="20" y1="42" x2="52" y2="42" stroke="#3d7fd6" stroke-width="1.6" opacity="0.75" />
        <text x="60" y="46">光源座標格</text>
      </g>

      <!-- 鏡頭的連續位置 -->
      <circle cx="439.2" cy="132.8" r="5" fill="#334155" stroke="#fff" stroke-width="1.2" />
      <path d="M 358 196 L 428 145" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4" />
      <text x="352" y="198" fill="currentColor" font-size="13" text-anchor="end">鏡頭的連續位置</text>

      <!-- 世界座標對齊：落在世界格線交點，但沒對到光源格 -->
      <line x1="439.2" y1="132.8" x2="446" y2="126" stroke="#c0506b" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.85" />
      <circle cx="446" cy="126" r="7" fill="none" stroke="#c0506b" stroke-width="2.4" />
      <g stroke="#c0506b" stroke-width="2" stroke-linecap="round">
        <line x1="442.5" y1="122.5" x2="449.5" y2="129.5" />
        <line x1="449.5" y1="122.5" x2="442.5" y2="129.5" />
      </g>
      <path d="M 460 106 L 452 121" fill="none" stroke="#c0506b" stroke-width="1" opacity="0.5" />
      <text x="463" y="88" fill="#c0506b" font-size="13">只對齊世界格</text>
      <text x="463" y="105" fill="#c0506b" font-size="13">光源格對不到</text>

      <!-- 光源座標對齊：先投影到光源軸，剛好落在光源格線交點 -->
      <line x1="439.2" y1="132.8" x2="428.6" y2="171.4" stroke="#3d7fd6" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.85" />
      <circle cx="428.6" cy="171.4" r="6" fill="#3d7fd6" stroke="#fff" stroke-width="1.4" />
      <path d="M 445 210 L 434 178" fill="none" stroke="#3d7fd6" stroke-width="1" opacity="0.5" />
      <text x="448" y="222" fill="#3d7fd6" font-size="13">光源座標對齊</text>
      <text x="448" y="239" fill="#3d7fd6" font-size="13">剛好落在交點</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
