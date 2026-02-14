<template>
  <div class=" relative leading-none">
    <div class=" flex flex-col justify-center items-center text-white">
      <div class=" text-[3rem] md:text-[6rem] stroke font-game jelly-bounce">
        CodMarbles
      </div>
    </div>
  </div>
</template>

<style scoped lang="sass">
.stroke
  -webkit-text-stroke: 16px #4a3410
  paint-order: stroke fill
.font-game
  font-family: 'Titan One'

.jelly-bounce
  animation: jelly-bounce 3.2s infinite
  transform-origin: 50% 100%

@keyframes jelly-bounce
  0%, 70%, 100%
    transform: scale( 1 )
  75%
    transform: scale( 1.2, 0.8 )
  80%
    transform: scale( 0.85, 1.15 )
  85%
    transform: scale( 1.05, 0.95 )
  90%
    transform: scale( 0.98, 1.02 )
  95%
    transform: scale( 1.01, 0.99 )

.joy-bounce
  animation: joy-bounce 1s infinite
  transform-origin: 50% 100%

@keyframes joy-bounce
  0%, 100%
    transform: scale( 1 )
    animation-timing-function: cubic-bezier(0.895, 0.030, 0.685, 0.220)
  50%
    transform: scale( 1.05, 0.9 )
    animation-timing-function: cubic-bezier(0.165, 0.840, 0.440, 1.000)
</style>
