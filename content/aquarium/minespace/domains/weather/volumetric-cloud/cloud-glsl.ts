import { TWILIGHT_ALTITUDE_LIFT, TWILIGHT_STOP_HEIGHT, TWILIGHT_SUNWARD_LIFT } from '../twilight'

/**
 * 體積雲的著色器
 *
 * 幾支著色器共用同一份密度與光照：行進主畫面的那一支、算地面雲影的那一支、
 * 水鏡倒影直接行進的那一支。三份若各寫一次，哪天調了雲的形狀，
 * 地上的影子與池裡的倒影就會對不上頭頂那朵雲——與 voxel-gi 的
 * VOXEL_GI_SAMPLE_GLSL 同一個理由，只留一份字串，各自貼進去。
 *
 * ── 這裡的字串裡不要寫註解 ──
 *
 * Babylon 的前處理器逐行掃條件編譯指令，不先拿掉註解（見 cloud-shadow 那段說明）。
 * 要解釋的都寫在 TS 這一側，這裡的字不會進到著色器
 *
 * ── 雲的模型 ──
 *
 * 整套參照的是 Guerrilla 的 Nubis 與 Frostbite 的 Hillaire：
 *
 *   形狀：天氣圖決定哪裡有雲、是哪一種雲；高度剖面決定雲在垂直方向怎麼收；
 *         低頻的 Perlin-Worley 給大形，高頻的 Worley 在邊緣啃缺口
 *         （Schneider 2015、2017）
 *   積分：每一步用解析解積分散射與消光，步距再大能量也守恆，
 *         不會因為步數少就整朵雲變亮或變暗（Hillaire 2016）
 *   多重散射：雲之所以是白的而不是灰的，是光在裡面彈了幾十次。
 *         逐次追蹤太貴，改用 Wrenninge 2013 的八度近似：每多一階，
 *         散射量、消光與相位的方向性各打一個折扣，疊幾階就有那種內部透亮的感覺
 *   相位：前向一瓣、後向一瓣。前向那一瓣是逆光時雲邊那圈銀邊，
 *         後向那一瓣讓背光看過去的雲不至於死灰
 *   粉末效應：背對太陽看時，薄雲邊緣反而比較暗，雲才有那種一球一球的立體感
 *         （Schneider 2015 的 powder，物理上是內部多重散射累積不足的結果）
 *
 * ── 雲層是一圈球殼，不是兩片平面 ──
 *
 * 平的雲層在地平線附近會一路延伸到無限遠，望向天邊的那條射線永遠走不完，
 * 遠處的雲全部疊在地平線上方那一小條裡（舊方塊雲那道白帶就是這樣來的）。
 * 包成一顆大星球的外殼之後，雲層會順著曲率往下彎，
 * 望向天邊的射線在幾千格內就穿出殼外——遠方的雲自然地沉到地平線下面
 */

/**
 * 所有雲的 uniform 名字
 *
 * EffectWrapper 與 ShaderMaterial 建立時都要把名字列出來，
 * 綁定時則由 applyCloudUniforms 一次寫齊
 */
export const CLOUD_UNIFORM_NAME_LIST = [
  'cloudLayer',
  'cloudShape',
  'cloudScale',
  'cloudOrigin',
  'cloudSunDirection',
  'cloudSunColor',
  'cloudAmbientTop',
  'cloudAmbientBottom',
  'cloudHazeColor',
  'cloudHaze',
  'cloudCirrus',
  'cloudLighting',
  'cloudCameraPosition',
  'cloudWindDirection',
  'cloudMarchSetting',
  'cloudEvolve',
  'cloudWeather',
  'cloudAltocumulus',
  'cloudBounceColor',
  'cloudNoctilucent',
  'cloudWindShift',
  'cloudTwilight',
  'cloudTwilightRose',
  'cloudTwilightCrimson',
  'cloudTwilightOrange',
  'cloudTwilightGold',
]

export const CLOUD_SAMPLER_NAME_LIST = [
  'cloudBaseSampler',
  'cloudDetailSampler',
  'cloudWeatherSampler',
  'cloudCirrusSampler',
  'cloudMacroSampler',
]

/**
 * 雲多的地方讓雲團連成一大片
 *
 * 基底雜訊只有最高的那一段才算雲（shape 那道 0.72～0.93 的門檻），
 * 切出來的是一顆一顆孤立的雲團。覆蓋率再高，也只是「顆數變多」，
 * 永遠連不成一大片——滿天都是同一種碎碎的積雲，不管哪一天都一樣。
 *
 * 真正的天空不是這樣：雲多的那一區，雲團會彼此黏起來，
 * 變成一整片底部平、頂上鼓成好幾團的雲；只有雲少的地方才是零散的小朵。
 *
 * 所以門檻跟著區域的雲量走：regional 從 MERGE_START 到 MERGE_FULL，
 * 門檻由 0.72～0.93 降到 MERGE_LOW～MERGE_HIGH，原本被切開的雲團之間的鞍部也長出雲來。
 * 同一段裡雲核的細節侵蝕也減輕一點（MERGE_EROSION_CUT），
 * 大片雲的內部不該被啃得跟小朵的邊一樣碎。
 *
 * 這幾個數字不能再往下壓。第一版給到門檻 0.5～0.82、侵蝕減四成，
 * 雲是連起來了，但整片密度頂到飽和，基底雜訊的起伏被抹平，
 * 剩下細節雜訊在撐——它是每二十六格就重複的小貼圖，
 * 一整片雲上看得到規則的斜紋，頭頂也成了沒有團塊的陰天。
 * 連起來的雲仍要保留基底那一層的鼓起與縫隙
 */
const CLOUD_MERGE_GLSL = `
const float CLOUD_MERGE_START = 0.6;
const float CLOUD_MERGE_FULL = 0.95;
const float CLOUD_MERGE_LOW = 0.64;
const float CLOUD_MERGE_HIGH = 0.9;
const float CLOUD_MERGE_EROSION_CUT = 0.1;
`

/** 數字寫進 GLSL 時一定要帶小數點 */
function toGlslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`
}

/**
 * 晨昏的逐點照明：火燒雲
 *
 * 白天整片雲共用一個光色（cloudSunColor）。晨昏不行：太陽貼近地平線時，
 * 每一朵雲看到的太陽不一樣——高的雲還照得到、低的已經進了星球的影子；
 * 朝太陽那一側的雲是金的、頭頂是紅的、背對太陽那一側已經暗了。
 *
 * cloudTwilightLight 對雲裡的一點算「朝太陽的光線離地面最近時有多高」（掠地高度），
 * 再照高度查色階（玫瑰、緋紅、橘、金，四個顏色由 CPU 算好送進來，已含當天的燃燒強度）。
 * 式子與 weather/twilight 的 getGrazingHeight、sampleTwilightLight 相同，改一邊要改另一邊。
 *
 * 每條視線只算幾個點，不是每個取樣點都算：積雲在進雲、中點、出雲三處各算一次，
 * 取樣點照沿途的位置在三者之間線性內插（高積雲薄，兩處就夠；卷雲只有一個交點）。
 * 掠地高度沿著一條直線幾乎是線性變化的，三點內插與逐點算在畫面上看不出差別，
 * 每個取樣點省下一次內積、一次開根號與幾次 smoothstep。
 * 沒有貼圖取樣。成本量不出來：開關交替量二十輪，行進那一趟的差在正負零點一毫秒內
 * （逐點算的版本也一樣）。量的時候一定要交替：雲會飄，同一個視角的行進成本
 * 一分鐘內可以掉三四毫秒，「開著量一段、關掉量一段」量到的是雲飄走了多少
 *
 * 另外三處跟著晨昏變（都由 cloudTwilight 的分量控制，為零時就是原本的式子）：
 * - 粉末效應假設光從上面來，把雲底壓暗。太陽在地平線下時光是從下面打上來的，
 *   雲底才是受光面，所以這時把那道壓暗放掉（w）
 * - 同一個比例把雲頂的直射光打折（CLOUD_TWILIGHT_TOP_DIM）：光貼著地面斜射上來，
 *   要穿過整朵雲才到得了雲頂，光線步數走不了那麼遠，補一個隨高度的衰減
 * - 卷雲的直射項側看只有零點二七倍，幾乎全是天光的顏色，整片染不上霞色；
 *   晨昏時多加一份不看方向的（y）。卷雲又薄（不透明度最多四成），亮度被壓在一以內的話，
 *   疊在藍天上只剩一抹灰紫；晨昏時把壓縮的上限放寬（CLOUD_TWILIGHT_CIRRUS_GLOW），
 *   靠近太陽的卷雲才亮得出金色
 *
 * cloudTwilight.x 為零時 cloudSunLight 直接回傳 cloudSunColor，正午與深夜一個運算都不多
 */
const CLOUD_TWILIGHT_GLSL = `
const float CLOUD_TWILIGHT_SHADOW = ${toGlslFloat(TWILIGHT_STOP_HEIGHT.shadow)};
const float CLOUD_TWILIGHT_ROSE = ${toGlslFloat(TWILIGHT_STOP_HEIGHT.rose)};
const float CLOUD_TWILIGHT_CRIMSON = ${toGlslFloat(TWILIGHT_STOP_HEIGHT.crimson)};
const float CLOUD_TWILIGHT_ORANGE = ${toGlslFloat(TWILIGHT_STOP_HEIGHT.orange)};
const float CLOUD_TWILIGHT_GOLD = ${toGlslFloat(TWILIGHT_STOP_HEIGHT.gold)};
const float CLOUD_TWILIGHT_SUNWARD_LIFT = ${toGlslFloat(TWILIGHT_SUNWARD_LIFT)};
const float CLOUD_TWILIGHT_ALTITUDE_LIFT = ${toGlslFloat(TWILIGHT_ALTITUDE_LIFT)};
const float CLOUD_TWILIGHT_TOP_DIM = 0.45;
const float CLOUD_TWILIGHT_CIRRUS_GLOW = 1.2;

vec3 cloudTwilightLight(vec3 position) {
  vec3 offset = position - cloudPlanetCenter();
  float along = dot(offset, cloudSunDirection);
  float distanceToCenter = length(offset);
  float altitude = distanceToCenter - cloudLayer.z;
  float grazing = along >= 0.0
    ? altitude + along * CLOUD_TWILIGHT_SUNWARD_LIFT
    : sqrt(max(distanceToCenter * distanceToCenter - along * along, 0.0)) - cloudLayer.z;
  grazing += altitude * CLOUD_TWILIGHT_ALTITUDE_LIFT;

  vec3 tint = mix(cloudTwilightRose, cloudTwilightCrimson, smoothstep(CLOUD_TWILIGHT_ROSE, CLOUD_TWILIGHT_CRIMSON, grazing));
  tint = mix(tint, cloudTwilightOrange, smoothstep(CLOUD_TWILIGHT_CRIMSON, CLOUD_TWILIGHT_ORANGE, grazing));
  tint = mix(tint, cloudTwilightGold, smoothstep(CLOUD_TWILIGHT_ORANGE, CLOUD_TWILIGHT_GOLD, grazing));
  return tint * smoothstep(CLOUD_TWILIGHT_SHADOW, CLOUD_TWILIGHT_ROSE, grazing);
}

vec3 cloudSunLight(vec3 position) {
  if (cloudTwilight.x <= 0.0) {
    return cloudSunColor;
  }
  return mix(cloudSunColor, cloudTwilightLight(position), cloudTwilight.x);
}

float cloudTwilightTopDim(float heightRatio) {
  return mix(1.0, mix(1.0, CLOUD_TWILIGHT_TOP_DIM, smoothstep(0.3, 0.9, heightRatio)), cloudTwilight.w);
}
`

/**
 * uniform 的排法
 *
 * cloudLayer    雲底高度、雲頂高度、星球半徑、時間（秒）
 * cloudShape    覆蓋率、消光係數、反照率、雲頂往下風處歪多少（格）
 * cloudScale    基底雜訊的頻率、細節雜訊的頻率、天氣圖的頻率、細節侵蝕的強度
 * cloudOrigin   雲的座標原點（風吹過的距離加上循環世界的平移），w 是細節雜訊自己的翻滾時間
 * cloudHaze     遠方化進天色的距離、開始變透明的距離、完全透明的距離、整體濃度
 * cloudCirrus   卷雲高度、卷雲覆蓋率、卷雲不透明度、卷雲頻率
 * cloudLighting 太陽增益、環境光增益、粉末效應強度、閃電
 * cloudMarchSetting 最短步距、從多遠開始省略細節與光線步數、跳過空白時放大幾倍步距、未用
 * cloudEvolve   基底雜訊相對天氣圖的位移（雲自己長、自己散），w 是細節扭曲的強度
 * cloudWeather  今天的天氣給積雲的影響（見 cloud-daily-weather）：層雲程度、雲塔程度、
 *               雲層現在的厚度是基準厚度的幾倍（雲塔那天雲層會往上加高）
 * cloudAltocumulus 高積雲：層底高度、層頂高度、覆蓋率、消光係數的倍率
 * cloudBounceColor 地面反上來的光（已乘上反照率、太陽高度與增益），雲底被白沙照亮的那一份
 * cloudNoctilucent 夜光雲：濃度（已含亮度）、貼圖頻率、太陽方位的水平分量（x、z）
 * cloudWindShift 風吹過的距離（x、z）與循環世界的平移（x、z），把 cloudOrigin 拆開給高空的雲用。
 *               高空的雲要把風放大幾倍才會比積雲飄得快，但世界平移只能乘一：
 *               它補的是鏡頭被搬了一整個世界寬，多乘或少乘，搬的那一瞬間那層雲就會跳
 * cloudTwilight 晨昏（見 weather/twilight 與上面的 CLOUD_TWILIGHT_GLSL）：
 *               x 是晨昏的比例（雲的光色照它換成逐點算的色階，零就整段跳過）、
 *               y 是卷雲多加的那一份不看方向的直射光、
 *               z 是高光保色壓縮的比例、w 是雲底受光的比例（光從下面打上來）。
 *               cloudSoftClip 原本逐通道把亮度收進一，逆光的橘色雲邊出來是純白；
 *               z 大於零時改成往「照最亮的通道等比例縮」混過去，色相留得住。
 *               正午與深夜四個分量都是零，mix 的第三個參數為零就是原本的結果
 * cloudTwilightRose、Crimson、Orange、Gold 晨昏的色階，由低到高四個顏色（已乘燃燒強度與亮度）
 */
export const CLOUD_COMMON_GLSL = `
precision highp sampler3D;

${CLOUD_MERGE_GLSL}

uniform sampler3D cloudBaseSampler;
uniform sampler3D cloudDetailSampler;
uniform sampler2D cloudWeatherSampler;
uniform sampler2D cloudCirrusSampler;
uniform sampler2D cloudMacroSampler;

uniform vec4 cloudLayer;
uniform vec4 cloudShape;
uniform vec4 cloudScale;
uniform vec4 cloudOrigin;
uniform vec3 cloudSunDirection;
uniform vec3 cloudSunColor;
uniform vec3 cloudAmbientTop;
uniform vec3 cloudAmbientBottom;
uniform vec3 cloudHazeColor;
uniform vec4 cloudHaze;
uniform vec4 cloudCirrus;
uniform vec4 cloudLighting;
uniform vec3 cloudCameraPosition;
uniform vec2 cloudWindDirection;
uniform vec4 cloudMarchSetting;
uniform vec4 cloudEvolve;
uniform vec3 cloudWeather;
uniform vec4 cloudAltocumulus;
uniform vec3 cloudBounceColor;
uniform vec4 cloudNoctilucent;
uniform vec4 cloudWindShift;
uniform vec4 cloudTwilight;
uniform vec3 cloudTwilightRose;
uniform vec3 cloudTwilightCrimson;
uniform vec3 cloudTwilightOrange;
uniform vec3 cloudTwilightGold;

const float CLOUD_PI = 3.14159265;

float cloudRemap(float value, float low, float high, float newLow, float newHigh) {
  return newLow + (value - low) / (high - low) * (newHigh - newLow);
}

vec3 cloudPlanetCenter() {
  return vec3(cloudCameraPosition.x, -cloudLayer.z, cloudCameraPosition.z);
}

float cloudAltitude(vec3 position) {
  return length(position - cloudPlanetCenter()) - cloudLayer.z;
}

float cloudHeightRatio(vec3 position) {
  return clamp((cloudAltitude(position) - cloudLayer.x) / (cloudLayer.y - cloudLayer.x), 0.0, 1.0);
}

vec2 cloudSphereHit(vec3 origin, vec3 direction, float radius) {
  vec3 offset = origin - cloudPlanetCenter();
  float halfB = dot(offset, direction);
  float c = dot(offset, offset) - radius * radius;
  float discriminant = halfB * halfB - c;
  if (discriminant < 0.0) {
    return vec2(-1.0);
  }
  float root = sqrt(discriminant);
  return vec2(-halfB - root, -halfB + root);
}

vec2 cloudShellRange(vec3 origin, vec3 direction) {
  float radius = cloudLayer.z;
  float altitude = cloudAltitude(origin);
  vec2 ground = cloudSphereHit(origin, direction, radius);
  vec2 bottom = cloudSphereHit(origin, direction, radius + cloudLayer.x);
  vec2 top = cloudSphereHit(origin, direction, radius + cloudLayer.y);

  if (altitude < cloudLayer.x) {
    if (ground.x > 0.0) {
      return vec2(-1.0);
    }
    return vec2(bottom.y, top.y);
  }

  if (altitude < cloudLayer.y) {
    float exitDistance = top.y;
    if (bottom.x > 0.0) {
      exitDistance = min(exitDistance, bottom.x);
    }
    return vec2(0.0, exitDistance);
  }

  if (top.x < 0.0) {
    return vec2(-1.0);
  }
  float exitDistance = top.y;
  if (bottom.x > 0.0) {
    exitDistance = bottom.x;
  }
  return vec2(top.x, exitDistance);
}

${CLOUD_TWILIGHT_GLSL}

float cloudHeightProfile(float heightRatio, float cloudType) {
  float topLimit = mix(0.38, 1.0, cloudType);
  float base = smoothstep(0.0, 0.07 + 0.08 * (1.0 - cloudType), heightRatio);
  float crown = 1.0 - smoothstep(topLimit * 0.4, topLimit, heightRatio);
  return base * crown;
}

vec3 cloudSamplePoint(vec3 position, float heightRatio) {
  vec3 point = position + cloudOrigin.xyz;
  point.xz -= cloudWindDirection * heightRatio * cloudWeather.z * cloudShape.w;
  return point;
}

float cloudDensityLevel(vec3 position, float heightRatio, int detailLevel) {
  vec3 point = cloudSamplePoint(position, heightRatio);
  vec4 weather = textureLod(cloudWeatherSampler, point.xz * cloudScale.z, 0.0);

  vec4 macro = textureLod(cloudMacroSampler, point.xz * cloudScale.z * 0.31 + vec2(0.17, 0.53), 0.0);
  float regional = clamp(weather.r * 0.6 + macro.r * 0.6 - 0.1, 0.0, 1.0);
  regional = regional * regional * (3.0 - 2.0 * regional);
  regional = mix(regional, 0.72, cloudWeather.x * 0.65);
  float coverage = clamp(cloudShape.x * mix(0.2, 1.7, regional), 0.0, 1.0);
  float mergeRatio = smoothstep(CLOUD_MERGE_START, CLOUD_MERGE_FULL, regional);

  float towerMask = smoothstep(0.62, 0.95, weather.r) * smoothstep(0.35, 0.7, regional);
  float shapeRatio = heightRatio * cloudWeather.z / (1.0 + (cloudWeather.z - 1.0) * towerMask);
  float cloudType = clamp(weather.g * 1.3 + 0.1, 0.0, 1.0);
  cloudType = mix(cloudType, cloudType * 0.3, cloudWeather.x);
  cloudType = max(cloudType, cloudWeather.y * towerMask * 0.9);

  float profile = cloudHeightProfile(shapeRatio, cloudType);
  if (profile <= 0.0) {
    return 0.0;
  }

  vec3 basePoint = point + cloudEvolve.xyz;
  basePoint.xz += (macro.gb - 0.5) * 420.0;
  vec4 base = textureLod(cloudBaseSampler, basePoint * cloudScale.x, 0.0);
  float lowFbm = dot(base.gba, vec3(0.625, 0.25, 0.125));
  float shape = clamp(cloudRemap(base.r, lowFbm - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  shape = clamp(cloudRemap(
    shape,
    mix(0.72, CLOUD_MERGE_LOW, mergeRatio),
    mix(0.93, CLOUD_MERGE_HIGH, mergeRatio),
    0.0,
    1.0
  ), 0.0, 1.0);
  float erosion = cloudScale.w * (1.0 - CLOUD_MERGE_EROSION_CUT * mergeRatio);

  float density = clamp(cloudRemap(shape * profile, 1.0 - coverage, 1.0, 0.0, 1.0), 0.0, 1.0);
  density *= mix(0.4, 1.0, smoothstep(0.0, 0.3, shapeRatio));
  if (density <= 0.0 || detailLevel == 2) {
    return density;
  }
  if (detailLevel == 1) {
    float meanEroded = clamp(cloudRemap(density, 0.5 * erosion, 1.0, 0.0, 1.0), 0.0, 1.0);
    return min(meanEroded * 1.5, 1.0);
  }

  vec3 swirl = (base.gba - 0.5) * cloudEvolve.w * (1.0 - heightRatio * 0.5);
  vec3 detailPoint = basePoint * cloudScale.y + swirl
    + vec3(cloudOrigin.w * 0.6, -cloudOrigin.w * 0.25, cloudOrigin.w * 0.15);
  vec3 detail = textureLod(cloudDetailSampler, detailPoint, 0.0).rgb;
  float detailFbm = clamp(cloudRemap(dot(detail, vec3(0.625, 0.25, 0.125)), 0.3, 0.68, 0.0, 1.0), 0.0, 1.0);
  float modifier = mix(detailFbm, 1.0 - detailFbm, clamp(shapeRatio * 4.0, 0.0, 1.0));

  float eroded = clamp(cloudRemap(density, modifier * erosion, 1.0, 0.0, 1.0), 0.0, 1.0);
  return min(eroded * mix(0.55, 1.15, detailFbm) * 1.8, 1.0);
}

float cloudDensity(vec3 position, float heightRatio, bool isCheap) {
  return cloudDensityLevel(position, heightRatio, isCheap ? 2 : 0);
}

float cloudHenyeyGreenstein(float cosAngle, float anisotropy) {
  float squared = anisotropy * anisotropy;
  float denominator = 1.0 + squared - 2.0 * anisotropy * cosAngle;
  return (1.0 - squared) / (4.0 * CLOUD_PI * pow(max(denominator, 0.0001), 1.5));
}

float cloudPhase(float cosAngle, float anisotropyScale) {
  float forward = cloudHenyeyGreenstein(cosAngle, 0.8 * anisotropyScale);
  float backward = cloudHenyeyGreenstein(cosAngle, -0.3 * anisotropyScale);
  return mix(forward, backward, 0.3);
}

float cloudLightOpticalDepth(vec3 position, int lightStepCount) {
  float thickness = cloudLayer.y - cloudLayer.x;
  float stepLength = thickness / cloudWeather.z * 0.025;
  float travelled = 0.0;
  float opticalDepth = 0.0;

  for (int index = 0; index < 8; index++) {
    if (index >= lightStepCount) {
      break;
    }
    float segment = stepLength;
    vec3 samplePosition = position + cloudSunDirection * (travelled + segment * 0.5);
    float altitude = cloudAltitude(samplePosition);
    if (altitude > cloudLayer.y) {
      break;
    }
    float heightRatio = clamp((altitude - cloudLayer.x) / thickness, 0.0, 1.0);
    opticalDepth += cloudDensity(samplePosition, heightRatio, index > 1) * segment;
    travelled += segment;
    stepLength *= 2.0;
  }

  return opticalDepth * cloudShape.y;
}

vec3 cloudSunScattering(float lightOpticalDepth, float cosAngle, vec3 sunColor) {
  float total = 0.0;
  float scatterWeight = 1.0;
  float extinctionWeight = 1.0;
  float anisotropyScale = 1.0;

  for (int octave = 0; octave < 4; octave++) {
    total += scatterWeight * exp(-lightOpticalDepth * extinctionWeight) * cloudPhase(cosAngle, anisotropyScale);
    scatterWeight *= 0.5;
    extinctionWeight *= 0.3;
    anisotropyScale *= 0.5;
  }

  return sunColor * total * cloudLighting.x;
}

float cloudGroundScattering(float opticalDepth) {
  float total = exp(-opticalDepth) + 0.5 * exp(-opticalDepth * 0.3) + 0.25 * exp(-opticalDepth * 0.09);
  return total / 1.75;
}

float cloudNoiseFrame(vec2 pixel, float frame) {
  float spatial = fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
  return fract(spatial + frame * 0.61803398875);
}

float cloudInScatterProbability(float density, float heightRatio) {
  float depthProbability = 0.05 + pow(density, cloudRemap(clamp(heightRatio, 0.3, 0.85), 0.3, 0.85, 0.5, 2.0));
  float verticalProbability = pow(clamp(cloudRemap(heightRatio, 0.07, 0.22, 0.1, 1.0), 0.1, 1.0), 0.8);
  return clamp(depthProbability * verticalProbability, 0.0, 1.0);
}

vec3 cloudSoftClip(vec3 radiance, float opacity) {
  vec3 color = radiance / max(opacity, 0.0001);
  vec3 knee = vec3(0.75);
  vec3 overflow = max(color - knee, vec3(0.0));
  vec3 compressed = min(color, knee) + (1.0 - knee) * (1.0 - exp(-overflow / (1.0 - knee)));
  if (cloudTwilight.z > 0.0) {
    float peak = max(max(color.r, color.g), max(color.b, 0.0001));
    float peakOverflow = max(peak - 0.75, 0.0);
    float peakCompressed = min(peak, 0.75) + 0.25 * (1.0 - exp(-peakOverflow / 0.25));
    compressed = mix(compressed, color * (peakCompressed / peak), cloudTwilight.z);
  }
  return compressed * opacity;
}

vec4 cloudMarch(vec3 origin, vec3 direction, int stepCount, int lightStepCount, float jitter, out float cloudDistance) {
  cloudDistance = -1.0;
  vec2 range = cloudShellRange(origin, direction);
  if (range.y <= 0.0 || range.x >= cloudHaze.z) {
    return vec4(0.0);
  }

  float startDistance = max(range.x, 0.0);
  float endDistance = min(range.y, cloudHaze.z);
  float marchLength = endDistance - startDistance;
  if (marchLength <= 0.0) {
    return vec4(0.0);
  }

  int adaptiveStepCount = int(clamp(marchLength / cloudMarchSetting.x, float(stepCount) * 0.4, float(stepCount)));
  float stepLength = marchLength / float(adaptiveStepCount);
  float coarseLength = stepLength * cloudMarchSetting.z;
  float travelled = startDistance + stepLength * jitter;
  float cosAngle = dot(direction, cloudSunDirection);
  float thickness = cloudLayer.y - cloudLayer.x;
  float powderBlend = clamp(0.5 - 0.5 * cosAngle, 0.0, 1.0) * cloudLighting.z;

  vec3 sunLightNear = cloudSunLight(origin + direction * startDistance);
  vec3 sunLightMiddle = cloudSunLight(origin + direction * (startDistance + marchLength * 0.5));
  vec3 sunLightFar = cloudSunLight(origin + direction * endDistance);

  vec3 radiance = vec3(0.0);
  float transmittance = 1.0;
  float weightedDistance = 0.0;
  float weightTotal = 0.0;
  bool isInside = false;
  int emptyCount = 0;

  for (int index = 0; index < 256; index++) {
    if (index >= adaptiveStepCount * 2 || travelled > endDistance || transmittance < 0.02) {
      break;
    }

    vec3 samplePosition = origin + direction * travelled;
    float heightRatio = clamp((cloudAltitude(samplePosition) - cloudLayer.x) / thickness, 0.0, 1.0);

    if (!isInside) {
      float probe = cloudDensity(samplePosition, heightRatio, true);
      if (probe <= 0.0) {
        travelled += coarseLength;
        continue;
      }
      isInside = true;
      emptyCount = 0;
      travelled = max(startDistance, travelled - coarseLength + stepLength);
      continue;
    }

    bool isFar = travelled > cloudMarchSetting.y;
    float density = cloudDensityLevel(samplePosition, heightRatio, isFar ? 1 : 0);

    if (density <= 0.0) {
      emptyCount++;
      if (emptyCount >= 3) {
        isInside = false;
      }
      travelled += stepLength;
      continue;
    }
    emptyCount = 0;

    float extinction = density * cloudShape.y;
    int sampleLightStepCount = (isFar || transmittance < 0.3) ? max(lightStepCount / 2, 2) : lightStepCount;
    float lightDepth = cloudLightOpticalDepth(samplePosition, sampleLightStepCount);

    vec3 sunLight = cloudSunColor;
    if (cloudTwilight.x > 0.0) {
      float alongRatio = clamp((travelled - startDistance) / marchLength, 0.0, 1.0) * 2.0;
      sunLight = alongRatio < 1.0
        ? mix(sunLightNear, sunLightMiddle, alongRatio)
        : mix(sunLightMiddle, sunLightFar, alongRatio - 1.0);
    }
    vec3 sunTerm = cloudSunScattering(lightDepth, cosAngle, sunLight);
    sunTerm *= mix(1.0, mix(cloudInScatterProbability(density, heightRatio), 1.0, cloudTwilight.w), powderBlend);
    sunTerm *= cloudTwilightTopDim(heightRatio);

    bool hasOcclusionSample = !isFar && transmittance > 0.3;

    float aboveNear = 0.0;
    float aboveFar = 0.0;
    if (heightRatio < 0.9) {
      aboveNear = cloudDensity(samplePosition + vec3(0.0, thickness * 0.1, 0.0), heightRatio + 0.1, true);
    }
    if (hasOcclusionSample && heightRatio < 0.7) {
      aboveFar = cloudDensity(samplePosition + vec3(0.0, thickness * 0.3, 0.0), heightRatio + 0.3, true);
    }
    float skyDepth = (aboveNear * 0.1 + aboveFar * 0.2) * thickness * cloudShape.y;
    float ambientOcclusion = mix(exp(-skyDepth * 0.35), exp(-skyDepth * 0.1), 0.3);

    float groundDepth = density * heightRatio * thickness * cloudShape.y;
    if (hasOcclusionSample && heightRatio > 0.15 && heightRatio < 0.5) {
      float belowDensity = cloudDensity(samplePosition - vec3(0.0, heightRatio * thickness * 0.5, 0.0), heightRatio * 0.5, true);
      float sampledDepth = (density + belowDensity) * 0.5 * heightRatio * thickness * cloudShape.y;
      groundDepth = mix(sampledDepth, groundDepth, smoothstep(0.35, 0.5, heightRatio));
    }
    vec3 bounce = cloudBounceColor * cloudGroundScattering(groundDepth);

    float ambientShade = mix(0.45, 1.0, heightRatio) * ambientOcclusion
      * mix(1.0, cloudInScatterProbability(density, heightRatio), 0.35);
    vec3 ambient = mix(cloudAmbientBottom, cloudAmbientTop, smoothstep(0.0, 1.0, heightRatio)) * ambientShade;
    ambient *= cloudLighting.y;
    ambient += vec3(cloudLighting.w);

    vec3 source = (sunTerm + ambient + bounce) * cloudShape.z;
    float stepTransmittance = exp(-extinction * stepLength);
    vec3 integrated = source * (1.0 - stepTransmittance);

    radiance += transmittance * integrated;
    float absorbed = transmittance * (1.0 - stepTransmittance);
    weightedDistance += travelled * absorbed;
    weightTotal += absorbed;
    transmittance *= stepTransmittance;

    travelled += stepLength;
  }

  float opacity = 1.0 - transmittance;
  if (weightTotal <= 0.0) {
    return vec4(0.0);
  }

  radiance = cloudSoftClip(radiance, opacity);
  cloudDistance = weightedDistance / weightTotal;
  float haze = 1.0 - exp(-cloudDistance / cloudHaze.x);
  radiance = mix(radiance, cloudHazeColor * opacity, haze);

  float farFade = 1.0 - smoothstep(cloudHaze.y, cloudHaze.z, cloudDistance);
  return vec4(radiance, opacity) * farFade * cloudHaze.w;
}

vec2 cloudAltocumulusFlow(vec3 position) {
  return position.xz + cloudWindShift.zw + cloudWindShift.xy * 1.4;
}

float cloudAltocumulusShape(vec3 position, float heightRatio, bool isCheap, vec4 field, vec4 broad) {
  vec2 flow = cloudAltocumulusFlow(position);
  float regional = clamp(field.r * 0.55 + broad.r * 0.65 - 0.1, 0.0, 1.0);
  regional = regional * regional * (3.0 - 2.0 * regional);
  float coverage = clamp(cloudAltocumulus.z * mix(0.1, 1.9, regional), 0.0, 1.0);
  if (coverage <= 0.02) {
    return 0.0;
  }

  float profile = smoothstep(0.0, 0.22, heightRatio) * (1.0 - smoothstep(0.5, 1.0, heightRatio));
  if (profile <= 0.0) {
    return 0.0;
  }

  vec2 warped = flow + (vec2(field.g, broad.g) - 0.5) * 360.0;
  vec2 turned = vec2(warped.x * 0.8 - warped.y * 0.6, warped.x * 0.6 + warped.y * 0.8);
  float lift = heightRatio * 14.0 + cloudEvolve.y * 0.5;
  vec4 primary = textureLod(cloudBaseSampler, vec3(warped.x, lift, warped.y) * cloudScale.x * 1.0, 0.0);
  float secondary = textureLod(cloudBaseSampler, vec3(turned.x, lift * 0.7 + 17.0, turned.y) * cloudScale.x * 1.65, 0.0).r;
  float lowFbm = dot(primary.gba, vec3(0.625, 0.25, 0.125));
  float shape = clamp(cloudRemap(mix(primary.r, secondary, 0.4), lowFbm - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  shape = clamp(cloudRemap(shape, 0.62, 0.92, 0.0, 1.0), 0.0, 1.0);

  float density = clamp(cloudRemap(shape * profile, 1.0 - coverage, 1.0, 0.0, 1.0), 0.0, 1.0);
  if (density <= 0.0 || isCheap) {
    return density;
  }

  vec3 detailPoint = vec3(warped.x, lift, warped.y) * cloudScale.y * 0.6
    + vec3(cloudOrigin.w * 0.6, -cloudOrigin.w * 0.25, cloudOrigin.w * 0.15);
  vec3 detail = textureLod(cloudDetailSampler, detailPoint, 0.0).rgb;
  float detailFbm = clamp(cloudRemap(dot(detail, vec3(0.625, 0.25, 0.125)), 0.3, 0.68, 0.0, 1.0), 0.0, 1.0);
  float eroded = clamp(cloudRemap(density, detailFbm * 0.5, 1.0, 0.0, 1.0), 0.0, 1.0);
  return min(eroded * mix(0.6, 1.2, detailFbm) * 1.15, 1.0);
}

vec4 cloudAltocumulusLayer(vec3 origin, vec3 direction, int stepCount, float jitter) {
  if (cloudAltocumulus.z * 1.9 < 0.03) {
    return vec4(0.0);
  }
  vec2 ground = cloudSphereHit(origin, direction, cloudLayer.z);
  if (ground.x > 0.0) {
    return vec4(0.0);
  }
  vec2 bottom = cloudSphereHit(origin, direction, cloudLayer.z + cloudAltocumulus.x);
  vec2 top = cloudSphereHit(origin, direction, cloudLayer.z + cloudAltocumulus.y);
  float startDistance = bottom.y;
  float endDistance = min(top.y, cloudHaze.z * 1.4);
  if (startDistance <= 0.0 || startDistance >= endDistance) {
    return vec4(0.0);
  }

  float thickness = cloudAltocumulus.y - cloudAltocumulus.x;
  float stepLength = (endDistance - startDistance) / float(stepCount);
  float travelled = startDistance + stepLength * jitter;
  float cosAngle = dot(direction, cloudSunDirection);
  float powderBlend = clamp(0.5 - 0.5 * cosAngle, 0.0, 1.0) * cloudLighting.z;
  float extinctionScale = cloudShape.y * cloudAltocumulus.w;
  vec3 sunLightNear = cloudSunLight(origin + direction * startDistance);
  vec3 sunLightFar = cloudSunLight(origin + direction * endDistance);

  vec3 radiance = vec3(0.0);
  float transmittance = 1.0;
  float weightedDistance = 0.0;
  float weightTotal = 0.0;

  for (int index = 0; index < 12; index++) {
    if (index >= stepCount || transmittance < 0.03) {
      break;
    }

    vec3 samplePosition = origin + direction * travelled;
    float heightRatio = clamp((cloudAltitude(samplePosition) - cloudAltocumulus.x) / thickness, 0.0, 1.0);
    vec2 flow = cloudAltocumulusFlow(samplePosition);
    vec4 broad = textureLod(cloudWeatherSampler, flow * cloudScale.z * 0.17 + vec2(0.58, 0.23), 0.0);
    float bestRegional = clamp(0.45 + broad.r * 0.65, 0.0, 1.0);
    bestRegional = bestRegional * bestRegional * (3.0 - 2.0 * bestRegional);
    if (cloudAltocumulus.z * mix(0.1, 1.9, bestRegional) <= 0.02) {
      travelled += stepLength;
      continue;
    }
    vec4 field = textureLod(cloudWeatherSampler, flow * cloudScale.z * 0.62 + vec2(0.37, 0.81), 0.0);
    float density = cloudAltocumulusShape(samplePosition, heightRatio, travelled > cloudMarchSetting.y * 2.0, field, broad);
    if (density <= 0.0) {
      travelled += stepLength;
      continue;
    }

    float lightDepth = 0.0;
    for (int lightIndex = 0; lightIndex < 2; lightIndex++) {
      vec3 lightPosition = samplePosition + cloudSunDirection * thickness * (0.6 + float(lightIndex) * 1.2);
      float lightRatio = (cloudAltitude(lightPosition) - cloudAltocumulus.x) / thickness;
      if (lightRatio > 1.0) {
        break;
      }
      lightDepth += cloudAltocumulusShape(lightPosition, max(lightRatio, 0.0), true, field, broad) * thickness * 1.2;
    }
    lightDepth *= extinctionScale;

    vec3 sunLight = cloudSunColor;
    if (cloudTwilight.x > 0.0) {
      sunLight = mix(sunLightNear, sunLightFar, clamp((travelled - startDistance) / (endDistance - startDistance), 0.0, 1.0));
    }
    vec3 sunTerm = cloudSunScattering(lightDepth, cosAngle, sunLight);
    sunTerm *= mix(1.0, mix(cloudInScatterProbability(density, mix(0.35, 0.8, heightRatio)), 1.0, cloudTwilight.w), powderBlend);

    vec3 ambient = mix(cloudAmbientBottom, cloudAmbientTop, heightRatio) * mix(0.7, 1.0, heightRatio);
    ambient = ambient * cloudLighting.y + vec3(cloudLighting.w);
    vec3 bounce = cloudBounceColor * cloudGroundScattering(density * heightRatio * thickness * extinctionScale);

    vec3 source = (sunTerm + ambient + bounce) * cloudShape.z;
    float stepTransmittance = exp(-density * extinctionScale * stepLength);
    float absorbed = transmittance * (1.0 - stepTransmittance);
    radiance += source * absorbed;
    weightedDistance += travelled * absorbed;
    weightTotal += absorbed;
    transmittance *= stepTransmittance;

    travelled += stepLength;
  }

  float opacity = 1.0 - transmittance;
  if (weightTotal <= 0.0) {
    return vec4(0.0);
  }

  radiance = cloudSoftClip(radiance, opacity);
  float cloudDistance = weightedDistance / weightTotal;
  float haze = 1.0 - exp(-cloudDistance / (cloudHaze.x * 1.3));
  radiance = mix(radiance, cloudHazeColor * opacity, haze);

  float farFade = 1.0 - smoothstep(cloudHaze.y * 1.4, cloudHaze.z * 1.4, cloudDistance);
  return vec4(radiance, opacity) * farFade * cloudHaze.w;
}

vec4 cloudNoctilucentLayer(vec3 direction) {
  if (cloudNoctilucent.x <= 0.0 || direction.y <= 0.03) {
    return vec4(0.0);
  }

  vec2 planar = direction.xz / (direction.y + 0.18);
  vec2 ripple = vec2(-cloudWindDirection.y, cloudWindDirection.x);
  vec2 uv = vec2(dot(planar, ripple), dot(planar, cloudWindDirection)) * cloudNoctilucent.y + cloudWindShift.xy * 0.002;

  vec4 map = textureLod(cloudCirrusSampler, uv, 0.0);
  float fine = textureLod(cloudCirrusSampler, uv * vec2(3.3, 4.7) + vec2(0.21, 0.63), 0.0).r;
  float band = smoothstep(0.5, 0.9, map.g);
  float wisp = smoothstep(0.2, 0.65, map.r * 0.65 + fine * 0.55);
  float elevationFade = smoothstep(0.03, 0.2, direction.y);
  float sunSide = mix(0.35, 1.0, smoothstep(-0.3, 0.9, dot(normalize(direction.xz + vec2(0.0001)), cloudNoctilucent.zw)));

  float opacity = band * wisp * elevationFade * sunSide * cloudNoctilucent.x;
  vec3 color = vec3(0.55, 0.72, 1.0) * mix(1.5, 0.9, direction.y);
  return vec4(color * opacity, opacity * 0.6);
}

vec4 cloudCirrusLayer(vec3 origin, vec3 direction) {
  if (cloudCirrus.z <= 0.0) {
    return vec4(0.0);
  }
  vec2 hit = cloudSphereHit(origin, direction, cloudLayer.z + cloudCirrus.x);
  float distanceToLayer = hit.y;
  if (distanceToLayer <= 0.0 || distanceToLayer > cloudHaze.z * 1.4) {
    return vec4(0.0);
  }

  vec2 position = (origin + direction * distanceToLayer).xz + cloudWindShift.zw + cloudWindShift.xy * 1.6;
  vec2 alongWind = cloudWindDirection;
  vec2 acrossWind = vec2(-alongWind.y, alongWind.x);
  vec2 cirrusUv = vec2(dot(position, alongWind), dot(position, acrossWind)) * cloudCirrus.w;

  vec4 cirrusMap = textureLod(cloudCirrusSampler, cirrusUv, 0.0);
  float fineFiber = textureLod(cloudCirrusSampler, cirrusUv * vec2(2.71, 3.37) + vec2(0.37, 0.61), 0.0).r;
  float band = smoothstep(1.0 - cloudCirrus.y, 1.0 - cloudCirrus.y * 0.35, cirrusMap.g);
  float amount = cirrusMap.r * band * mix(0.7, 1.2, fineFiber);
  float opacity = amount * cloudCirrus.z;
  if (opacity <= 0.0) {
    return vec4(0.0);
  }

  float cosAngle = dot(direction, cloudSunDirection);
  vec3 sunLight = cloudSunLight(origin + direction * distanceToLayer);
  vec3 light = sunLight * cloudLighting.x * cloudHenyeyGreenstein(cosAngle, 0.6) * 0.6
    + cloudAmbientTop * cloudLighting.y;
  light += sunLight * cloudTwilight.y;
  float haze = 1.0 - exp(-distanceToLayer / (cloudHaze.x * 1.3));
  float glowCeiling = 1.0 + CLOUD_TWILIGHT_CIRRUS_GLOW * cloudTwilight.x;
  vec3 color = cloudSoftClip(mix(light, cloudHazeColor, haze) / glowCeiling, 1.0) * glowCeiling;
  float farFade = 1.0 - smoothstep(cloudHaze.y * 1.4, cloudHaze.z * 1.4, distanceToLayer);

  return vec4(color * opacity, opacity) * farFade * cloudHaze.w;
}

vec4 cloudComposeSky(vec3 origin, vec3 direction, int stepCount, int lightStepCount, float jitter, out float cloudDistance) {
  vec4 cumulus = cloudMarch(origin, direction, stepCount, lightStepCount, jitter, cloudDistance);
  if (cumulus.a >= 0.98) {
    return cumulus;
  }
  vec4 altocumulus = cumulus.a >= 0.9
    ? vec4(0.0)
    : cloudAltocumulusLayer(origin, direction, clamp(stepCount / 12, 3, 12), jitter);
  vec4 cirrus = cloudCirrusLayer(origin, direction);
  vec4 noctilucent = cloudNoctilucentLayer(direction);
  vec4 high = cirrus + (1.0 - cirrus.a) * noctilucent;
  vec4 middle = altocumulus + (1.0 - altocumulus.a) * high;
  return cumulus + (1.0 - cumulus.a) * middle;
}
`

/**
 * 全螢幕效果共用的頂點著色器
 *
 * 不用 Babylon 內建的 postprocess 頂點：那一支要靠 ShaderStore 裡已經有它，
 * 而這裡的效果沒經過 PostProcess，載入順序沒有保證
 */
export const CLOUD_FULLSCREEN_VERTEX = `
precision highp float;

attribute vec2 position;

varying vec2 vUV;

void main() {
  vUV = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

/** 從畫面座標還原出這條視線的方向，三支全螢幕效果都要 */
const VIEW_RAY_GLSL = `
uniform mat4 inverseViewProjection;

vec3 cloudViewRay(vec2 uv) {
  vec4 farPoint = inverseViewProjection * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize(farPoint.xyz / farPoint.w - cloudCameraPosition);
}
`

/**
 * 行進
 *
 * 畫在降過解析度的圖上，每一幀起點抖動不同，由下一趟的時間累積把雜訊磨平。
 *
 * ── 曾經試過棋盤重建，又拿掉了 ──
 *
 * Nubis 每幀只算十六分之一的像素，其餘靠重投影補。照著做成「2×2 輪流算一格」之後，
 * 雲一飄就出現四幀一循環的抖動：重投影只能猜雲有多遠（見 CLOUD_RESOLVE_FRAGMENT），
 * 猜錯的那一點位移在沒輪到的三幀裡一路累積，第四幀新值進來又被拉回去。
 * 沒輪到的格子還要混一點放大過的四分之一圖，整片雲因此越來越糊。
 * Nubis 付得起是因為它存了雲的真實深度；這裡省下那張深度圖，
 * 就得讓每一格每一幀都是新算的——省錢改靠跳過空白與遠處降階
 *
 * ── 後來又加回一個保守得多的版本（預設表的 cloudInterlace） ──
 *
 * 行進仍是整支管線最貴的一趟（高畫質 21 毫秒、占 GPU 一半以上），所以換個做法再試：
 * 兩相而不是四相、以三十二像素的方塊為單位而不是逐像素，沒輪到的方塊只取重投影的歷史，
 * 不混放大過的舊圖。重投影猜錯的位移最多累積一幀就被新值拉回，
 * 不會累積到三幀；方塊內部每一幀都是連續的，抖動也不會細到逐像素閃。
 * 量到行進 21.4 → 12.0 毫秒；靜止與轉頭的截圖、連續畫面的閃爍量都與原版看不出差別。
 * 若哪天雲飄得快時又看到規律的抖動，把預設表的 cloudInterlace 關掉就回到每格每幀都算
 */
export const CLOUD_MARCH_FRAGMENT = `
precision highp float;

varying vec2 vUV;

${CLOUD_COMMON_GLSL}
${VIEW_RAY_GLSL}

uniform vec4 marchSetting;

void main() {
  vec3 direction = cloudViewRay(vUV);
  float jitter = cloudNoiseFrame(gl_FragCoord.xy, marchSetting.z);
  float cloudDistance;
  gl_FragColor = cloudComposeSky(cloudCameraPosition, direction, int(marchSetting.x), int(marchSetting.y), jitter, cloudDistance);
}
`

/**
 * 時間累積
 *
 * 這一格雲上一幀在畫面的哪裡：沿著視線取雲層裡的一點，
 * 加上雲這一幀被吹動的距離，用上一幀的矩陣投影回去。
 *
 * 那一點取在「進入雲層之後再走一個雲層厚度」的中段，而不是雲底入口：
 * 轉頭與雲的距離無關，但風吹的位移換算成畫面上的角度要除以距離，
 * 用入口去算會高估，雲越斜、高估越多。中段比較接近雲真正的位置。
 *
 * 舊值要先夾進這一幀鄰近九格的範圍裡（變異數裁切，Salvi 2016）。
 * 少了這一步，雲飄走之後原地會留一道拖影——那是上一幀的雲，
 * 這一幀那裡已經沒有了
 */
export const CLOUD_RESOLVE_FRAGMENT = `
precision highp float;

varying vec2 vUV;

uniform sampler2D currentSampler;
uniform sampler2D historySampler;
uniform mat4 previousViewProjection;
uniform vec3 cloudShift;
uniform vec4 resolveSetting;
uniform vec2 interlaceSetting;

${CLOUD_COMMON_GLSL}
${VIEW_RAY_GLSL}

void main() {
  vec4 current = texture2D(currentSampler, vUV);

  if (resolveSetting.x >= 1.0) {
    gl_FragColor = current;
    return;
  }

  /**
   * 隔幀更新時，這一格這一幀有沒有被行進畫到
   *
   * 與行進那一趟的棋盤同一套算法：方塊座標的奇偶加上這一幀的奇偶。
   * 沒被畫到的格子，當前那張圖上留的是兩幀前的舊值，不能拿來混，
   * 只取投影回來的歷史
   */
  bool isStale = false;
  if (interlaceSetting.x > 0.0) {
    vec2 tile = floor(gl_FragCoord.xy / interlaceSetting.x);
    isStale = mod(tile.x + tile.y + interlaceSetting.y, 2.0) > 0.5;
  }

  vec3 direction = cloudViewRay(vUV);
  vec2 range = cloudShellRange(cloudCameraPosition, direction);
  float thickness = cloudLayer.y - cloudLayer.x;
  float hitDistance = range.x > 0.0
    ? min(range.y, range.x + thickness * 1.5)
    : 400.0;
  vec3 worldPoint = cloudCameraPosition + direction * hitDistance + cloudShift;

  vec4 previousClip = previousViewProjection * vec4(worldPoint, 1.0);
  if (previousClip.w <= 0.0) {
    gl_FragColor = current;
    return;
  }
  vec2 previousUv = previousClip.xy / previousClip.w * 0.5 + 0.5;
  if (previousUv.x < 0.0 || previousUv.x > 1.0 || previousUv.y < 0.0 || previousUv.y > 1.0) {
    gl_FragColor = current;
    return;
  }

  if (isStale) {
    gl_FragColor = texture2D(historySampler, previousUv);
    return;
  }

  vec2 texel = resolveSetting.yz;
  vec4 mean = vec4(0.0);
  vec4 meanSquared = vec4(0.0);
  for (int offsetY = -1; offsetY <= 1; offsetY++) {
    for (int offsetX = -1; offsetX <= 1; offsetX++) {
      vec4 neighbor = texture2D(currentSampler, vUV + vec2(float(offsetX), float(offsetY)) * texel);
      mean += neighbor;
      meanSquared += neighbor * neighbor;
    }
  }
  mean /= 9.0;
  meanSquared /= 9.0;
  vec4 deviation = sqrt(max(meanSquared - mean * mean, vec4(0.0)));
  vec4 lowBound = mean - deviation * resolveSetting.w;
  vec4 highBound = mean + deviation * resolveSetting.w;

  vec4 history = clamp(texture2D(historySampler, previousUv), lowBound, highBound);
  gl_FragColor = mix(history, current, resolveSetting.x);
}
`

/**
 * 地面的雲影
 *
 * 一張俯視的圖：每一格代表雲底那個高度上的一個點，
 * 從那裡朝太陽往上走穿整層雲，記下還剩多少光透得下來。
 * 地面的材質外掛只要把自己沿著光線推回雲底的高度、查這張圖就知道
 */
export const CLOUD_SHADOW_FRAGMENT = `
precision highp float;

varying vec2 vUV;

${CLOUD_COMMON_GLSL}

uniform vec4 shadowArea;

void main() {
  vec2 worldXZ = shadowArea.xy + (vUV - 0.5) * shadowArea.z;
  vec3 position = vec3(worldXZ.x, cloudLayer.x, worldXZ.y);
  float thickness = cloudLayer.y - cloudLayer.x;
  float sunHeight = max(cloudSunDirection.y, 0.08);
  float pathLength = thickness / sunHeight;
  float stepLength = pathLength / cloudWeather.z / 16.0;

  float opticalDepth = 0.0;
  for (int index = 0; index < 28; index++) {
    vec3 samplePosition = position + cloudSunDirection * (stepLength * (float(index) + 0.5));
    if (samplePosition.y > cloudLayer.y) {
      break;
    }
    float heightRatio = clamp((samplePosition.y - cloudLayer.x) / thickness, 0.0, 1.0);
    opticalDepth += cloudDensity(samplePosition, heightRatio, false) * stepLength;
  }

  float transmittance = exp(-opticalDepth * cloudShape.y * shadowArea.w);
  gl_FragColor = vec4(transmittance, transmittance, transmittance, 1.0);
}
`

/**
 * 天空罩的頂點著色器
 *
 * 盒子以鏡頭為中心，頂點的區域座標就是視線方向（與 sky-gradient 同一招）。
 * 深度直接壓到遠平面上：任何實體都擋得住雲，雲也不會因為
 * 盒子只有一百多格大就把更遠的沙地蓋掉
 */
export const CLOUD_DOME_VERTEX = `
precision highp float;

attribute vec3 position;

uniform mat4 worldViewProjection;

varying vec3 vDirection;

void main() {
  vDirection = position;
  vec4 clipPosition = worldViewProjection * vec4(position, 1.0);
  gl_Position = clipPosition.xyww;
}
`

/**
 * 合成：把降解析度累積好的那張圖貼回主畫面
 *
 * 輸出是預乘過的顏色：rgb 已經乘過不透明度，混合用 ONE、ONE_MINUS_SRC_ALPHA。
 *
 * 放大用 Catmull-Rom 而不是硬體的雙線性。雙線性在半解析度下會把雲邊抹成一圈糊，
 * 頭頂最近的那幾朵最明顯；Catmull-Rom 是銳利的三次內插，
 * 九次取樣（利用雙線性合併掉一半）換回接近原解析度的輪廓。
 *
 * 它的負瓣會在反差大的邊界過衝與下衝。逆光時雲的亮度遠超過一，
 * 雲邊外側被下衝成幾乎零的顏色、不透明度卻還是正的，
 * 預乘混合下那一圈等於把天空壓暗——積雲與卷雲靠近太陽時都描上一道藍邊（踩過）。
 * 所以結果要夾在最近四個原始格子的最小與最大之間（抗振鈴夾限），
 * 銳利度留著，只是不准跑出原本的範圍。
 *
 * 太陽方向附近再把雲加厚（thickenOverSun）：太陽是一塊十五格的方形，
 * 半透明的雲蓋在上面時，方形的輪廓會透過雲照出來，雲裡浮出一圈硬邊（踩過）。
 * 真實的太陽在薄雲後面是被散射成一團光，看不到輪廓。
 * 在方塊外接圓（約五點五度）以內把不透明度往一推，到九度平滑放掉，
 * 預乘的顏色跟著同比例放大，雲本身的色調不變；光暈是另一塊網格，照常露出
 *
 * 雲縫光（見 cloud-ray）也在這裡疊：rayColor 的 rgb 是光的顏色、a 是強度，
 * 只加顏色不加不透明度，在預乘混合下就是相加。a 為零時整段跳過，連那張圖都不取樣；
 * 取樣用 textureLod，落在分支裡的取樣不能要微分
 */
export const CLOUD_COMPOSITE_FRAGMENT = `
precision highp float;

varying vec3 vDirection;

uniform sampler2D cloudSampler;
uniform vec4 compositeSetting;

uniform vec2 cloudTexelSize;

vec4 sampleCatmullRom(vec2 uv) {
  vec2 texSize = 1.0 / cloudTexelSize;
  vec2 samplePosition = uv * texSize;
  vec2 center = floor(samplePosition - 0.5) + 0.5;
  vec2 f = samplePosition - center;

  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);

  vec2 w12 = w1 + w2;
  vec2 offset12 = w2 / w12;

  vec2 uv0 = (center - 1.0) * cloudTexelSize;
  vec2 uv3 = (center + 2.0) * cloudTexelSize;
  vec2 uv12 = (center + offset12) * cloudTexelSize;

  vec4 result = vec4(0.0);
  result += texture2D(cloudSampler, vec2(uv0.x, uv0.y)) * w0.x * w0.y;
  result += texture2D(cloudSampler, vec2(uv12.x, uv0.y)) * w12.x * w0.y;
  result += texture2D(cloudSampler, vec2(uv3.x, uv0.y)) * w3.x * w0.y;
  result += texture2D(cloudSampler, vec2(uv0.x, uv12.y)) * w0.x * w12.y;
  result += texture2D(cloudSampler, vec2(uv12.x, uv12.y)) * w12.x * w12.y;
  result += texture2D(cloudSampler, vec2(uv3.x, uv12.y)) * w3.x * w12.y;
  result += texture2D(cloudSampler, vec2(uv0.x, uv3.y)) * w0.x * w3.y;
  result += texture2D(cloudSampler, vec2(uv12.x, uv3.y)) * w12.x * w3.y;
  result += texture2D(cloudSampler, vec2(uv3.x, uv3.y)) * w3.x * w3.y;

  vec2 nearestBase = (floor(samplePosition - 0.5) + 0.5) * cloudTexelSize;
  vec4 corner00 = texture2D(cloudSampler, nearestBase);
  vec4 corner10 = texture2D(cloudSampler, nearestBase + vec2(cloudTexelSize.x, 0.0));
  vec4 corner01 = texture2D(cloudSampler, nearestBase + vec2(0.0, cloudTexelSize.y));
  vec4 corner11 = texture2D(cloudSampler, nearestBase + cloudTexelSize);
  vec4 lowBound = min(min(corner00, corner10), min(corner01, corner11));
  vec4 highBound = max(max(corner00, corner10), max(corner01, corner11));

  return clamp(result, lowBound, highBound);
}

uniform vec4 compositeSun;
uniform sampler2D raySampler;
uniform vec4 rayColor;

vec4 thickenOverSun(vec4 cloud, vec3 direction) {
  float towardSun = dot(normalize(direction), compositeSun.xyz);
  float sunCover = smoothstep(0.9877, 0.9954, towardSun) * compositeSun.w;
  if (sunCover <= 0.0 || cloud.a <= 0.001) {
    return cloud;
  }
  float thickened = 1.0 - pow(1.0 - cloud.a, 1.0 + sunCover * 7.0);
  return vec4(cloud.rgb * (thickened / cloud.a), thickened);
}

void main() {
  vec2 uv = gl_FragCoord.xy * compositeSetting.xy;
  vec4 cloud = sampleCatmullRom(uv);
  cloud.a = min(cloud.a, 1.0);
  cloud = thickenOverSun(cloud, vDirection);
  if (rayColor.a > 0.0) {
    cloud.rgb += rayColor.rgb * (textureLod(raySampler, uv, 0.0).r * rayColor.a);
  }
  gl_FragColor = cloud * compositeSetting.z;
}
`

/**
 * 倒影：水鏡那幾張小圖直接行進，不走降解析度與時間累積
 *
 * 倒影的鏡頭是翻過來的，螢幕空間那張圖對不上它的方向。
 * 好在倒影的圖只有兩三百格見方、又被水面糊過一層，直接走少少幾步就夠了
 */
export const CLOUD_REFLECTION_FRAGMENT = `
precision highp float;

varying vec3 vDirection;

${CLOUD_COMMON_GLSL}

uniform vec4 compositeSetting;

void main() {
  vec3 direction = normalize(vDirection);
  float jitter = cloudNoiseFrame(gl_FragCoord.xy, 0.0);
  float cloudDistance;
  gl_FragColor = cloudComposeSky(cloudCameraPosition, direction, 28, 3, jitter, cloudDistance) * compositeSetting.z;
}
`
