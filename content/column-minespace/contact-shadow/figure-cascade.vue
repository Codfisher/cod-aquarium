<template>
  <figure-frame
    title="分層陰影：近的切得細，遠的切得粗"
    caption="鏡頭前方依距離切成三層，切法跟著 lambda 走，這裡給 0.8，偏向對數切，越靠近鏡頭切得越細。下面三個方塊是三層各自的陰影貼圖，格線數量一樣多，涵蓋的世界範圍卻差了好幾倍，近層那格窄、遠層那格寬，分層陰影就這樣同時顧到近處的銳利與遠處的覆蓋。"
  >
    <svg
      viewBox="0 0 640 520"
      role="img"
      aria-label="鏡頭視錐依距離切成三層，層與層之間切點越靠近鏡頭越密；下方三個方塊代表三層各自的陰影貼圖，格線數量相同，但方塊越往右代表的世界範圍越大，格子也跟著變粗"
    >
      <!-- 視錐三層的色塊，越遠色調越深，只是方便區分 -->
      <polygon points="60,140 172.9,115 172.9,165" fill="#3d7fd6" opacity="0.09" />
      <polygon points="172.9,115 301.7,86.4 301.7,193.6 172.9,165" fill="#3d7fd6" opacity="0.16" />
      <polygon points="301.7,86.4 560,29.2 560,250.8 301.7,193.6" fill="#3d7fd6" opacity="0.24" />

      <!-- 視錐外框 -->
      <g stroke="currentColor" stroke-width="1.6" opacity="0.75" fill="none">
        <line x1="60" y1="140" x2="560" y2="29.2" />
        <line x1="60" y1="140" x2="560" y2="250.8" />
      </g>
      <!-- 切層的分隔線 -->
      <g stroke="#3d7fd6" stroke-width="1.6" opacity="0.7">
        <line x1="172.9" y1="115" x2="172.9" y2="165" />
        <line x1="301.7" y1="86.4" x2="301.7" y2="193.6" />
      </g>

      <!-- 鏡頭 -->
      <polygon points="46,128 46,152 66,140" fill="currentColor" opacity="0.85" />
      <text x="40" y="176" fill="currentColor" font-size="13" text-anchor="middle">鏡頭</text>

      <!-- 三層的編號，貼在視錐上緣 -->
      <text x="116" y="98" fill="#3d7fd6" font-size="14" text-anchor="middle">① 近層</text>
      <text x="237" y="66" fill="#3d7fd6" font-size="14" text-anchor="middle">② 中層</text>
      <text x="430" y="12" fill="#3d7fd6" font-size="14" text-anchor="middle">③ 遠層</text>

      <!-- 三層各自的陰影貼圖，底邊對齊，格線數量相同、格子大小不同 -->
      <g>
        <rect x="80" y="444" width="36" height="36" fill="#3d7fd6" opacity="0.14" stroke="#3d7fd6" stroke-width="1.6" />
        <g stroke="#3d7fd6" stroke-width="1" opacity="0.55">
          <line x1="89" y1="444" x2="89" y2="480" />
          <line x1="98" y1="444" x2="98" y2="480" />
          <line x1="107" y1="444" x2="107" y2="480" />
          <line x1="80" y1="453" x2="116" y2="453" />
          <line x1="80" y1="462" x2="116" y2="462" />
          <line x1="80" y1="471" x2="116" y2="471" />
        </g>
      </g>
      <g>
        <rect x="200" y="403" width="77" height="77" fill="#3d7fd6" opacity="0.14" stroke="#3d7fd6" stroke-width="1.6" />
        <g stroke="#3d7fd6" stroke-width="1" opacity="0.55">
          <line x1="219.25" y1="403" x2="219.25" y2="480" />
          <line x1="238.5" y1="403" x2="238.5" y2="480" />
          <line x1="257.75" y1="403" x2="257.75" y2="480" />
          <line x1="200" y1="422.25" x2="277" y2="422.25" />
          <line x1="200" y1="441.5" x2="277" y2="441.5" />
          <line x1="200" y1="460.75" x2="277" y2="460.75" />
        </g>
      </g>
      <g>
        <rect x="380" y="320" width="160" height="160" fill="#3d7fd6" opacity="0.14" stroke="#3d7fd6" stroke-width="1.6" />
        <g stroke="#3d7fd6" stroke-width="1" opacity="0.55">
          <line x1="420" y1="320" x2="420" y2="480" />
          <line x1="460" y1="320" x2="460" y2="480" />
          <line x1="500" y1="320" x2="500" y2="480" />
          <line x1="380" y1="360" x2="540" y2="360" />
          <line x1="380" y1="400" x2="540" y2="400" />
          <line x1="380" y1="440" x2="540" y2="440" />
        </g>
      </g>

      <text x="98" y="305" fill="#3d7fd6" font-size="14" text-anchor="middle">①</text>
      <text x="238.5" y="305" fill="#3d7fd6" font-size="14" text-anchor="middle">②</text>
      <text x="460" y="305" fill="#3d7fd6" font-size="14" text-anchor="middle">③</text>

      <text x="320" y="504" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">
        三張貼圖格線數量一樣多，方塊越大代表涵蓋的世界範圍越廣，格子也越粗
      </text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
