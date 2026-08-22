<template>
  <figure-frame
    title="十二個位置排成一圈，寫到十一之後繞回一"
    caption="位置只有十二個，寫到第十一個之後，下一個腳印會繞回去蓋掉腳印一，這是右邊比較的起點。回收那一刻如果那一株還沒站直，它會瞬間彈回原狀，恢復曲線根本沒機會在畫面上顯現。上排間距固定在 0.85 格，恢復給六秒，回收腳印一時它的年齡只有一點八秒，還壓著近八成。下排讓間距照速度與恢復時間一起算，年齡追上六秒才回收，回收的瞬間剛好是它站直的那一刻。"
  >
    <svg
      viewBox="0 0 640 300"
      role="img"
      aria-label="左邊是十二個位置排成一圈的示意圖，腳印一最舊，下一個腳印就會蓋在這裡；右邊是兩條時間軸，比較固定間距與依速度計算間距時，回收腳印一的年齡是否早於它站直所需的時間"
    >
      <text x="16" y="24" fill="currentColor" font-size="13" font-weight="600" opacity="0.75">十二個位置排成一圈</text>

      <!-- 環狀緩衝區的引導圓 -->
      <circle cx="155" cy="165" r="90" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.2" />

      <!-- 繞回去的那一段：從腳印十一指向腳印一 -->
      <line
        x1="100.2" y1="65.0" x2="147.1" y2="51.3"
        stroke="currentColor" stroke-width="1.6" stroke-dasharray="4 4" opacity="0.55"
      />
      <polygon points="147.1,51.3 137.4,57.0 136.7,47.0" fill="currentColor" opacity="0.55" />

      <!-- 位置 2～11，只標出頭尾兩個方便辨認方向 -->
      <g fill="currentColor" opacity="0.5">
        <circle cx="203.7" cy="89.3" r="5" />
        <circle cx="236.9" cy="127.6" r="5" />
        <circle cx="244.1" cy="177.8" r="5" />
        <circle cx="223.0" cy="223.9" r="5" />
        <circle cx="180.4" cy="251.4" r="5" />
        <circle cx="129.6" cy="251.4" r="5" />
        <circle cx="87.0" cy="223.9" r="5" />
        <circle cx="65.9" cy="177.8" r="5" />
        <circle cx="73.1" cy="127.6" r="5" />
        <circle cx="106.3" cy="89.3" r="5" />
      </g>
      <text x="216" y="83" fill="currentColor" font-size="11" opacity="0.6">2</text>
      <text x="90" y="83" fill="currentColor" font-size="11" opacity="0.6" text-anchor="end">11</text>

      <!-- 位置 1：最舊，下一個腳印會蓋在這裡 -->
      <circle cx="155" cy="75" r="7.5" fill="#e8a33d" />
      <text x="155" y="55" fill="#e8a33d" font-size="13" font-weight="600" text-anchor="middle">1</text>
      <text x="155" y="105" fill="currentColor" font-size="11" opacity="0.7" text-anchor="middle">最舊，下一個腳印蓋在這裡</text>

      <!-- 位置 0：人現在的位置，不參與輪替 -->
      <circle cx="155" cy="165" r="9" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.4" />
      <text x="155" y="169" fill="currentColor" font-size="11" text-anchor="middle" opacity="0.85">0</text>
      <text x="155" y="196" fill="currentColor" font-size="11" opacity="0.6" text-anchor="middle">現在位置，每幀覆寫</text>

      <!-- 分隔線 -->
      <line x1="310" y1="16" x2="310" y2="286" stroke="currentColor" stroke-width="1" opacity="0.12" />

      <!-- 右側：腳印一的年齡時間軸 -->
      <text x="345" y="24" fill="currentColor" font-size="13" font-weight="600" opacity="0.75">腳印 1 的年齡（秒）</text>

      <g stroke="currentColor" opacity="0.35">
        <line x1="340" y1="60" x2="622" y2="60" stroke-width="1" />
        <line x1="345" y1="57" x2="345" y2="63" stroke-width="1.2" />
        <line x1="389" y1="57" x2="389" y2="63" stroke-width="1.2" />
        <line x1="433" y1="57" x2="433" y2="63" stroke-width="1.2" />
        <line x1="477" y1="57" x2="477" y2="63" stroke-width="1.2" />
        <line x1="521" y1="57" x2="521" y2="63" stroke-width="1.2" />
        <line x1="565" y1="57" x2="565" y2="63" stroke-width="1.2" />
        <line x1="609" y1="57" x2="609" y2="63" stroke-width="1.2" />
      </g>
      <text x="345" y="76" fill="currentColor" font-size="11" opacity="0.6">0 秒</text>
      <text x="477" y="76" fill="currentColor" font-size="11" opacity="0.6" text-anchor="middle">3 秒</text>
      <text x="609" y="76" fill="currentColor" font-size="11" opacity="0.6" text-anchor="end">6 秒</text>

      <!-- 上排：間距固定 0.85 格，恢復給六秒 -->
      <text x="345" y="90" fill="currentColor" font-size="12" opacity="0.8">固定間距 0.85 格・速度 5.2 格/秒</text>
      <rect x="345" y="95" width="79" height="16" rx="2" fill="#e8a33d" opacity="0.85" />
      <rect x="424" y="95" width="185" height="16" rx="2" fill="#e8a33d" fill-opacity="0.08" stroke="#e8a33d" stroke-width="1.2" stroke-dasharray="4 4" />
      <line x1="424" y1="88" x2="424" y2="118" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 3" />
      <text x="428" y="132" fill="currentColor" font-size="12">回收時年齡 1.8 秒，還壓著 78%</text>
      <text x="565" y="107" fill="#e8a33d" font-size="11" opacity="0.75" text-anchor="middle">這段不會真的畫出來</text>

      <!-- 下排：間距照速度算 -->
      <text x="345" y="165" fill="currentColor" font-size="12" opacity="0.8">間距照速度算（5.2 × 6 ÷ 11 ≈ 2.84 格）</text>
      <rect x="345" y="170" width="264" height="16" rx="2" fill="#3d7fd6" opacity="0.85" />
      <line x1="609" y1="163" x2="609" y2="193" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 3" />
      <text x="605" y="207" fill="currentColor" font-size="12" text-anchor="end">回收落在年齡 6 秒，正是它站直的那一刻</text>

      <text x="16" y="286" fill="currentColor" font-size="11" opacity="0.55">實色＝還沒站直；虛線框＝已經回收，畫面上不會出現</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
