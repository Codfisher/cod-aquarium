<template>
  <figure-frame
    title="反彈留在原側，穿透送到另一側"
    caption="左邊不透明，光一碰到表面就彈開，往四面八方差不多亮，眼睛不管在哪一側的上方，看到的都是同一種反彈光。右邊是葉子，光鑽進葉肉，彈跳幾次才找到出口。出口在光原本要走的那一側，方向也大致順著原路，只是稍微散開。逆光站在那一側，眼睛看到的正是這道穿透的光。"
  >
    <svg
      viewBox="0 0 640 320"
      role="img"
      aria-label="左邊不透明方塊，光在表面就往四面八方彈開；右邊是葉子剖面，光鑽進去彈跳幾次，從另一側大致順著原方向散開穿出"
    >
      <!-- 兩個場景的分隔線 -->
      <line x1="320" y1="16" x2="320" y2="300" stroke="currentColor" stroke-width="1" opacity="0.15" stroke-dasharray="4 6" />

      <!-- 左：不透明表面，光就地彈開 -->
      <text x="20" y="24" fill="currentColor" font-size="14" opacity="0.85">不透明</text>

      <g>
        <!-- 方塊 -->
        <rect x="40" y="190" width="220" height="90" fill="#8a8578" stroke="#5f5b52" stroke-width="1.5" />

        <!-- 太陽 -->
        <circle cx="88" cy="46" r="11" fill="#e8a33d" />
        <g stroke="#e8a33d" stroke-width="2" opacity="0.7" stroke-linecap="round">
          <line x1="88" y1="24" x2="88" y2="31" />
          <line x1="63" y1="46" x2="70" y2="46" />
          <line x1="102" y1="60" x2="107" y2="65" />
        </g>
        <text x="60" y="70" fill="#e8a33d" font-size="13">太陽</text>

        <!-- 入射光，實線 -->
        <line x1="96" y1="58" x2="160" y2="190" stroke="#e8a33d" stroke-width="2" opacity="0.85" />

        <!-- 打中的那一點 -->
        <circle cx="160" cy="190" r="4" fill="#e8a33d" />

        <!-- 就地彈開的散射扇，四個方向都差不多亮 -->
        <g stroke="#e8a33d" stroke-width="1.3" opacity="0.32">
          <line x1="160" y1="190" x2="75.4" y2="159.2" />
          <line x1="160" y1="190" x2="160" y2="100" />
          <line x1="160" y1="190" x2="211.6" y2="116.3" />
          <line x1="160" y1="190" x2="244.6" y2="159.2" />
        </g>

        <!-- 剛好朝著眼睛過來的那一道 -->
        <line
          x1="160" y1="190" x2="94" y2="95.8"
          stroke="#e8a33d" stroke-width="2" opacity="0.9" stroke-dasharray="6 4"
        />

        <!-- 眼睛 -->
        <path d="M72 95.8 q22 -17 44 0 q-22 17 -44 0 Z" fill="none" stroke="currentColor" stroke-width="2" />
        <circle cx="94" cy="95.8" r="6" fill="currentColor" />

        <text x="40" y="306" fill="currentColor" font-size="13" opacity="0.7">光就地彈開，往四面八方差不多亮</text>
      </g>

      <!-- 右：葉子剖面，光鑽進去再穿出來 -->
      <text x="350" y="24" fill="currentColor" font-size="14" opacity="0.85">葉子（次表面散射）</text>

      <g>
        <!-- 太陽 -->
        <circle cx="398" cy="58" r="11" fill="#e8a33d" />
        <g stroke="#e8a33d" stroke-width="2" opacity="0.7" stroke-linecap="round">
          <line x1="398" y1="36" x2="398" y2="43" />
          <line x1="373" y1="58" x2="380" y2="58" />
          <line x1="412" y1="72" x2="417" y2="77" />
        </g>
        <text x="370" y="82" fill="#e8a33d" font-size="13">太陽</text>

        <!-- 入射光，實線 -->
        <line x1="407" y1="64" x2="460" y2="95" stroke="#e8a33d" stroke-width="2" opacity="0.85" />

        <!-- 葉子剖面，半透明的一片薄葉肉 -->
        <rect
          x="456" y="85" width="26" height="105" rx="6"
          fill="#568c3e" opacity="0.55" stroke="#3f6b2c" stroke-width="1.5"
        />

        <!-- 光在葉肉裡彈跳幾次才找到出口 -->
        <polyline
          points="460,95 478,122 460,149 478,176"
          fill="none" stroke="#fef3c7" stroke-width="2" opacity="0.95"
        />
        <g fill="#e8a33d">
          <circle cx="478" cy="122" r="3" />
          <circle cx="460" cy="149" r="3" />
        </g>
        <circle cx="478" cy="176" r="4" fill="#e8a33d" />

        <!-- 出口的散射扇，兩側是次要方向，中間那道朝著眼睛過來 -->
        <g stroke="#e8a33d" stroke-width="1.3" opacity="0.32">
          <line x1="478" y1="176" x2="531.2" y2="213.3" />
          <line x1="478" y1="176" x2="488.2" y2="240.2" />
        </g>
        <line
          x1="478" y1="176" x2="535.2" y2="267.6"
          stroke="#e8a33d" stroke-width="2" opacity="0.9" stroke-dasharray="6 4"
        />

        <!-- 眼睛 -->
        <path d="M513.2 267.6 q22 -17 44 0 q-22 17 -44 0 Z" fill="none" stroke="currentColor" stroke-width="2" />
        <circle cx="535.2" cy="267.6" r="6" fill="currentColor" />

        <text x="350" y="306" fill="currentColor" font-size="13" opacity="0.7">彈跳幾次，仍大致順著原方向穿出</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
