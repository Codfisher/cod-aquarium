<template>
  <figure-frame
    title="同一道光，粗糙面散開、水膜收成一束"
    caption="乾燥、粗糙的表面法線東倒西歪，同一束光打在不同角度的小面上，反射方向散得到處都是。圖裡四個切面算出來的反射角分散在 7° 到 69° 之間，高光因此整片都很暗，看不出集中在哪。水膜蓋上去之後表面變得平整，法線全部指向同一個方向，五個取樣點的反射角精準落在同一個 25°，那束光才會收進同一個方向，亮出雨後路面那道刺眼的反光。"
  >
    <svg
      viewBox="0 0 640 320"
      role="img"
      aria-label="左邊乾燥粗糙的表面，同一道光打在四個不同角度的切面上，反射方向散開；右邊濕潤的水膜表面平整，五道反射光完全平行"
    >
      <defs>
        <marker
          id="wet-specular-arrow"
          viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="#3d7fd6" />
        </marker>
      </defs>

      <!-- 面板標題 -->
      <text x="160" y="34" fill="currentColor" font-size="14" font-weight="600" text-anchor="middle">乾燥、粗糙的表面</text>
      <text x="480" y="34" fill="currentColor" font-size="14" font-weight="600" text-anchor="middle">濕潤、水膜</text>

      <!-- ===== 左側：粗糙表面 ===== -->

      <!-- 實心材質 -->
      <polygon
        points="60,200 110,179.8 160,174.5 210,182.5 260,204.7 260,260 60,260"
        fill="#8a8578" stroke="#5f5b52" stroke-width="2" stroke-linejoin="round"
      />

      <!-- 入射光，四道，同一個方向 -->
      <g stroke="#e8a33d" stroke-width="1.8" stroke-dasharray="5 4" opacity="0.85">
        <line x1="101.1" y1="155.5" x2="85.0" y2="189.9" />
        <line x1="151.1" y1="142.7" x2="135.0" y2="177.2" />
        <line x1="201.1" y1="144.1" x2="185.0" y2="178.5" />
        <line x1="251.1" y1="159.2" x2="235.0" y2="193.6" />
      </g>

      <!-- 反射光，四道，角度各不相同 -->
      <g stroke="#3d7fd6" stroke-width="2.2" marker-end="url(#wet-specular-arrow)">
        <line x1="85.0" y1="189.9" x2="20.8" y2="165.9" />
        <line x1="135.0" y1="177.2" x2="94.7" y2="121.3" />
        <line x1="185.0" y1="178.5" x2="179.2" y2="110.6" />
        <line x1="235.0" y1="193.6" x2="260.9" y2="130.7" />
      </g>

      <!-- 取樣點 -->
      <g fill="#5f5b52">
        <circle cx="85.0" cy="189.9" r="4" />
        <circle cx="135.0" cy="177.2" r="4" />
        <circle cx="185.0" cy="178.5" r="4" />
        <circle cx="235.0" cy="193.6" r="4" />
      </g>

      <text x="160" y="290" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">
        反射角分散在 7°〜69° 之間
      </text>

      <!-- ===== 右側：濕潤水膜 ===== -->

      <!-- 實心材質 -->
      <rect x="330" y="200" width="240" height="60" fill="#8a8578" stroke="#5f5b52" stroke-width="2" />
      <!-- 水膜 -->
      <rect x="330" y="194" width="240" height="6" fill="#7ec8e3" opacity="0.55" />
      <line x1="330" y1="200" x2="570" y2="200" stroke="#3d7fd6" stroke-width="1.5" opacity="0.5" />
      <text x="580" y="199" fill="#3d7fd6" font-size="12" opacity="0.8">水膜</text>

      <!-- 入射光，五道，同一個方向 -->
      <g stroke="#e8a33d" stroke-width="1.8" stroke-dasharray="5 4" opacity="0.85">
        <line x1="386.1" y1="165.6" x2="370.0" y2="200.0" />
        <line x1="426.1" y1="165.6" x2="410.0" y2="200.0" />
        <line x1="466.1" y1="165.6" x2="450.0" y2="200.0" />
        <line x1="506.1" y1="165.6" x2="490.0" y2="200.0" />
        <line x1="546.1" y1="165.6" x2="530.0" y2="200.0" />
      </g>

      <!-- 反射光，五道，完全平行 -->
      <g stroke="#3d7fd6" stroke-width="2.2" marker-end="url(#wet-specular-arrow)">
        <line x1="370.0" y1="200.0" x2="342.5" y2="138.6" />
        <line x1="410.0" y1="200.0" x2="382.5" y2="138.6" />
        <line x1="450.0" y1="200.0" x2="422.5" y2="138.6" />
        <line x1="490.0" y1="200.0" x2="462.5" y2="138.6" />
        <line x1="530.0" y1="200.0" x2="502.5" y2="138.6" />
      </g>

      <!-- 取樣點 -->
      <g fill="#3d7fd6">
        <circle cx="370" cy="200" r="4" />
        <circle cx="410" cy="200" r="4" />
        <circle cx="450" cy="200" r="4" />
        <circle cx="490" cy="200" r="4" />
        <circle cx="530" cy="200" r="4" />
      </g>

      <text x="450" y="290" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">
        五道反射角完全一樣，都是 25°
      </text>

      <!-- 圖例 -->
      <g>
        <line x1="30" y1="308" x2="66" y2="308" stroke="#e8a33d" stroke-width="1.8" stroke-dasharray="5 4" />
        <text x="74" y="313" fill="currentColor" font-size="13" opacity="0.75">入射光</text>

        <line
          x1="180" y1="308" x2="216" y2="308"
          stroke="#3d7fd6" stroke-width="2.2" marker-end="url(#wet-specular-arrow)"
        />
        <text x="226" y="313" fill="currentColor" font-size="13" opacity="0.75">反射光</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
