<template>
  <figure-frame
    title="光柵化只問中心點"
    caption="每一格只在正中央問一次「這一點在三角形裡面嗎」。中心點在線內，整格塗成三角形的顏色；中心點在線外，整格維持空白。真正的邊界是那條連續的橘線，塗色的結果卻只能一階一階地跳，這就是鋸齒的來源。"
  >
    <svg
      viewBox="0 0 640 340"
      role="img"
      aria-label="六乘六的像素格，一條橘色斜線是真正的邊界。中心點落在線內的格子塗成藍色，落在線外的維持空白，兩者交界排成一階一階的台階"
    >
      <!--
        6x6 網格，格線與座標都是算好的

        邊界線方程式 y = 5.7 - x（格子座標），每一格只看正中央那一點
        (col+0.5, row+0.5) 落在線的哪一側，逐欄算出來的塗色格數是
        5, 4, 3, 2, 1, 0，剛好排成一道台階
      -->
      <g stroke="currentColor" stroke-width="1" opacity="0.25">
        <line x1="70" y1="40" x2="70" y2="316" />
        <line x1="116" y1="40" x2="116" y2="316" />
        <line x1="162" y1="40" x2="162" y2="316" />
        <line x1="208" y1="40" x2="208" y2="316" />
        <line x1="254" y1="40" x2="254" y2="316" />
        <line x1="300" y1="40" x2="300" y2="316" />
        <line x1="346" y1="40" x2="346" y2="316" />

        <line x1="70" y1="40" x2="346" y2="40" />
        <line x1="70" y1="86" x2="346" y2="86" />
        <line x1="70" y1="132" x2="346" y2="132" />
        <line x1="70" y1="178" x2="346" y2="178" />
        <line x1="70" y1="224" x2="346" y2="224" />
        <line x1="70" y1="270" x2="346" y2="270" />
        <line x1="70" y1="316" x2="346" y2="316" />
      </g>

      <!-- 中心點落在線內的格子，塗成三角形的顏色 -->
      <g fill="#3d7fd6" opacity="0.82">
        <rect x="70" y="40" width="46" height="46" />
        <rect x="70" y="86" width="46" height="46" />
        <rect x="70" y="132" width="46" height="46" />
        <rect x="70" y="178" width="46" height="46" />
        <rect x="70" y="224" width="46" height="46" />
        <rect x="116" y="40" width="46" height="46" />
        <rect x="116" y="86" width="46" height="46" />
        <rect x="116" y="132" width="46" height="46" />
        <rect x="116" y="178" width="46" height="46" />
        <rect x="162" y="40" width="46" height="46" />
        <rect x="162" y="86" width="46" height="46" />
        <rect x="162" y="132" width="46" height="46" />
        <rect x="208" y="40" width="46" height="46" />
        <rect x="208" y="86" width="46" height="46" />
        <rect x="254" y="40" width="46" height="46" />
      </g>

      <!-- 真正的邊界：連續的斜線，不受格子限制 -->
      <line
        x1="70" y1="302.2" x2="332.2" y2="40"
        stroke="#e8a33d" stroke-width="2.6" stroke-linecap="round"
      />

      <!-- 中心點：塗色的格子用實心點，空白的格子用空心點 -->
      <g fill="#ffffff" stroke="#3d7fd6" stroke-width="1.6">
        <circle cx="93" cy="63" r="4" />
        <circle cx="93" cy="109" r="4" />
        <circle cx="93" cy="155" r="4" />
        <circle cx="93" cy="201" r="4" />
        <circle cx="93" cy="247" r="4" />
        <circle cx="139" cy="63" r="4" />
        <circle cx="139" cy="109" r="4" />
        <circle cx="139" cy="155" r="4" />
        <circle cx="139" cy="201" r="4" />
        <circle cx="185" cy="63" r="4" />
        <circle cx="185" cy="109" r="4" />
        <circle cx="185" cy="155" r="4" />
        <circle cx="231" cy="63" r="4" />
        <circle cx="231" cy="109" r="4" />
        <circle cx="277" cy="63" r="4" />
      </g>
      <g fill="currentColor" opacity="0.35">
        <circle cx="93" cy="293" r="3.2" />
        <circle cx="139" cy="247" r="3.2" />
        <circle cx="139" cy="293" r="3.2" />
        <circle cx="185" cy="201" r="3.2" />
        <circle cx="185" cy="247" r="3.2" />
        <circle cx="185" cy="293" r="3.2" />
        <circle cx="231" cy="155" r="3.2" />
        <circle cx="231" cy="201" r="3.2" />
        <circle cx="231" cy="247" r="3.2" />
        <circle cx="231" cy="293" r="3.2" />
        <circle cx="277" cy="109" r="3.2" />
        <circle cx="277" cy="155" r="3.2" />
        <circle cx="277" cy="201" r="3.2" />
        <circle cx="277" cy="247" r="3.2" />
        <circle cx="277" cy="293" r="3.2" />
        <circle cx="323" cy="63" r="3.2" />
        <circle cx="323" cy="109" r="3.2" />
        <circle cx="323" cy="155" r="3.2" />
        <circle cx="323" cy="201" r="3.2" />
        <circle cx="323" cy="247" r="3.2" />
        <circle cx="323" cy="293" r="3.2" />
      </g>

      <!--
        挑一格空白格出來算給大家看

        這格 (col0, row5) 的真實覆蓋面積 = 0.7² / 2 = 0.245，
        算式在旁邊的節點註解，這裡只標出結果
      -->
      <rect
        x="70" y="270" width="46" height="46"
        fill="none" stroke="#e8a33d" stroke-width="2.4"
      />
      <path
        d="M116 293 L372 224"
        fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.45"
      />
      <text x="380" y="216" fill="currentColor" font-size="13">
        線蓋住了這格將近四分之一
      </text>
      <text x="380" y="234" fill="currentColor" font-size="13">
        中心點在外側，這格照樣算空白
      </text>

      <!-- 圖例 -->
      <g>
        <rect x="380" y="46" width="20" height="20" fill="#3d7fd6" opacity="0.82" />
        <text x="410" y="61" fill="currentColor" font-size="13">中心點在線內，整格塗色</text>

        <rect x="380" y="82" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.5" />
        <text x="410" y="97" fill="currentColor" font-size="13">中心點在線外，整格空白</text>

        <line x1="380" y1="128" x2="400" y2="128" stroke="#e8a33d" stroke-width="2.6" stroke-linecap="round" />
        <text x="410" y="133" fill="currentColor" font-size="13">真正的邊界是連續的斜線</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
