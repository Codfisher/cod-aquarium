# 音效來源

這個資料夾裡的音檔各有出處與授權，加新檔案時請一併補在這裡。
沒有記載的檔案是先前留下的，來源待補。

**只收實錄，禁止合成音效**：不論是自己合成，還是別人合成後放上音效庫的，一律不用（2026-11-28 使用者試聽後定的規矩，
當時刪掉了合成的竹子敲擊、帶手部雜音的放魚水花、聽起來像科幻音效的冰裂）。找不到實錄就寧可不放。

## wheat-wind.mp3

- **原名**：WIND, Wind through Wheatfield
- **作者**：Uganda
- **來源**：<https://freesound.org/people/Uganda/sounds/38976/>
- **授權**：CC0 1.0（公眾領域貢獻，不需標示、可商用）
- **原始描述**：風穿過麥田，帶著細碎的爆裂聲，背景有幾聲鳥。
- **處理**：原檔 1 分 44 秒。取第 10 到 70 秒，
  再把第 6 到 10 秒交叉淡入到結尾，做成 60 秒的無縫循環
  （`acrossfade`，兩端收在同一個取樣點上，接回去聽不出接縫）。
  接著補 19 dB 增益並過限幅器（`alimiter` 的 level 要關掉，
  它預設會把輸出自動正規化回 0 dB，壓多少都沒用），
  最後轉成單聲道 32 kHz / 56 kbps。
- **音量**：平均 −24.0 dB、峰值 −0.9 dB
- **加音檔一定要量音量**
  這裡踩過一次：先前選的另一份錄音（szelestamas / 620099，
  質地其實更準、而且完全沒有鳥）平均只有 −49.8 dB，
  比這個資料夾其他音檔輕了將近 30 dB。規格全部對齊、檔案也正常，
  但乘上音源的 volume 與距離衰減之後等於沒有聲音。
  這個資料夾的音檔平均落在 −19 到 −25 dB 之間，新加的要落進這個範圍。
  量法：`ffmpeg -i 檔名.mp3 -af volumedetect -f null -`
- **用在**：麥浪田的麥稈摩擦（`wheat-rustle-*`）

## jigoku-lava.mp3

- **原名**：Lava Loop 3
- **作者**：Fission9
- **來源**：<https://freesound.org/people/Fission9/sounds/474851/>
- **授權**：CC0 1.0（公眾領域貢獻，不需標示、可商用）
- **處理**：原檔為 48 kHz / 24 bit / 立體聲 WAV，
  轉成單聲道 32 kHz / 56 kbps MP3 以對齊本資料夾其他音檔的規格。
  長度維持原本的 39.6 秒未裁切——作者標明它完美循環，
  裁掉任何一段都會在接點留下一下可以聽出來的頓挫。
- **用在**：地獄谷裂縫裡的熔岩（`jigoku-churn-*`）

## jigoku-rumble.mp3

- **內容**：火山底部持續的低頻悶響（兩次噴發之間的平靜段，沒有爆音）
- **原名**：Volcano Mount Yasur, Tanna Island, from the bottom
- **作者**：felix.blume
- **來源**：<https://freesound.org/people/felix.blume/sounds/663040/>（2026-11-28 取用；上傳日 December 5th, 2022）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 570 秒起 17 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 14 秒的無縫循環（`acrossfade` c1=c2=qsin）；不加高通（保留低頻）；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −22.4 dB、峰值 −6.8 dB（循環，14.0 秒）
- **預計用在**：jigoku：地底悶響、遠火山方向；可取代目前 `y: 0` 的三顆

## jigoku-eruption.mp3

- **內容**：火山噴發的一聲悶爆加尾音
- **原名**：Volcano Mount Yasur, Tanna Island, from the bottom
- **作者**：felix.blume
- **來源**：<https://freesound.org/people/felix.blume/sounds/663040/>（2026-11-28 取用；上傳日 December 5th, 2022）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 16.1 秒起 6.5 秒，頭尾加短淡入淡出；不加高通（保留低頻）；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −19.4 dB、峰值 −12.2 dB（點綴，6.5 秒）
- **預計用在**：jigoku：遠火山噴發（搭方案 A6 對畫面）；或 interval 點綴

## jigoku-hot-spring.mp3

- **內容**：熱泉滾沸、冒泡與蒸氣嘶聲（亞速爾群島 Furnas）
- **原名**：Ambiance_Hot_Spring_Furnas_Caldeiras_Loop_Stereo_04
- **作者**：Nox_Sound
- **來源**：<https://freesound.org/people/Nox_Sound/sounds/829623/>（2026-11-28 取用；上傳日 October 15th, 2025）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 2 秒起 15 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 12 秒的無縫循環（`acrossfade` c1=c2=qsin）；60 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −23.4 dB、峰值 −9.7 dB（循環，12.0 秒）
- **預計用在**：jigoku：四池熱泉；也可小聲當噴氣孔的底

## jigoku-steam-vent.mp3

- **內容**：持續的蒸氣嘶聲（高頻為主）
- **原名**：G39-23-Steam Hiss.wav
- **作者**：craigsmith
- **來源**：<https://freesound.org/people/craigsmith/sounds/438640/>（2026-11-28 取用；上傳日 August 26th, 2018）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 23 秒起 12.5 秒，把開頭 2.5 秒以等功率曲線交叉淡入到結尾，做成 10 秒的無縫循環（`acrossfade` c1=c2=qsin）；150 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.2 dB、峰值 −11.8 dB（循環，10.0 秒）
- **預計用在**：jigoku：十二個噴氣孔

## chime-furin.mp3

- **內容**：日本風鈴（玻璃／金屬）敲一下的餘韻
- **原名**：Furin japanese wind chime.wav
- **作者**：ayustat2001
- **來源**：<https://freesound.org/people/ayustat2001/sounds/501168/>（2026-11-28 取用；上傳日 January 6th, 2020）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 0.42 秒起 3.85 秒，頭尾加短淡入淡出；300 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.7 dB、峰值 −2.7 dB（點綴，3.9 秒）
- **預計用在**：cicada 兩道緣廊簷下；rainvale 四座亭子簷角（共用）

## campfire-windmill.mp3

- **內容**：沙漠中風車抽水機獨自嘎吱作響（亞利桑那）
- **原名**：A windmill is squeaking alone in the desert (USA, Arizona)
- **作者**：felix.blume
- **來源**：<https://freesound.org/people/felix.blume/sounds/131924/>（2026-11-28 取用；上傳日 October 20th, 2011）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔約第 24 秒起 19 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 16 秒的無縫循環（`acrossfade` c1=c2=qsin）；120 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.5 dB、峰值 −6.2 dB（循環，16.0 秒）
- **預計用在**：campfire：風車抽水機

## beast-coyote-chorus.mp3

- **內容**：一群郊狼的嚎叫與吠叫（遠處）
- **原名**：coyotes howling in santa fe
- **作者**：buzzatsea
- **來源**：<https://freesound.org/people/buzzatsea/sounds/711262/>（2026-11-28 取用；上傳日 November 18th, 2023）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 5 秒起 10.5 秒，頭尾加短淡入淡出；400 Hz 高通；低通 5000 Hz；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −22.9 dB、峰值 −1.7 dB（點綴，10.5 秒）
- **預計用在**：campfire：取代借用的狼；夜裡

## beast-coyote-yip.mp3

- **內容**：單隻郊狼的一聲短嚎
- **原名**：coyotes howling in santa fe
- **作者**：buzzatsea
- **來源**：<https://freesound.org/people/buzzatsea/sounds/711262/>（2026-11-28 取用；上傳日 November 18th, 2023）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 36.3 秒起 3.2 秒，頭尾加短淡入淡出；450 Hz 高通；低通 5000 Hz；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −22.4 dB、峰值 −10.4 dB（點綴，3.2 秒）
- **預計用在**：campfire：與合唱交錯的單聲

## campfire-horse-snort.mp3

- **內容**：馬噴鼻兩聲
- **原名**：horse snort.wav
- **作者**：bruno.auzet
- **來源**：<https://freesound.org/people/bruno.auzet/sounds/538697/>（2026-11-28 取用；上傳日 October 9th, 2020）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 7.6 秒起 2.5 秒，頭尾加短淡入淡出；100 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.4 dB、峰值 −4.6 dB（點綴，2.5 秒）
- **預計用在**：campfire：拴馬橫木（若畫面有馬）

## bird-geese-flyover.mp3

- **內容**：一群灰雁從頭頂飛過的叫聲與振翅
- **原名**：Geese Flying Overhead.wav
- **作者**：mike_stranks
- **來源**：<https://freesound.org/people/mike_stranks/sounds/407490/>（2026-11-28 取用；上傳日 November 3rd, 2017）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 4.5 秒起 12 秒，頭尾加短淡入淡出；150 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −23.4 dB、峰值 −2.9 dB（點綴，12.0 秒）
- **預計用在**：autumn：雁群（西邊低空，可 orbit）

## beast-roe-deer.mp3

- **內容**：狍（小型鹿）的一聲吠叫
- **原名**：Roe Deer calls Forest of Saou
- **作者**：Sacha.Julien
- **來源**：<https://freesound.org/people/Sacha.Julien/sounds/724578/>（2026-11-28 取用；上傳日 February 23rd, 2024）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 21.05 秒起 2.6 秒，頭尾加短淡入淡出；600 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.4 dB、峰值 −3 dB（點綴，2.6 秒）
- **預計用在**：autumn：林地深處；也可給 forest

## autumn-leaves-gust.mp3

- **內容**：一陣乾落葉沙沙聲（做成漸強漸弱的一陣）
- **原名**：SteinbergPark_Leaves_Rustling
- **作者**：SMKoski02
- **來源**：<https://freesound.org/people/SMKoski02/sounds/854303/>（2026-11-28 取用；上傳日 May 16th, 2026）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔約第 24 秒起 5 秒，頭尾加短淡入淡出；200 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −25 dB、峰值 −2.2 dB（點綴，5.0 秒）
- **預計用在**：autumn：林地隨機（wander），比 forest-rustle 更近更脆

## bird-nightingale.mp3

- **內容**：夜鶯一段完整樂句
- **原名**：Nightingale Song
- **作者**：smand
- **來源**：<https://freesound.org/people/smand/sounds/521035/>（2026-11-28 取用；上傳日 June 3rd, 2020）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 17.3 秒起 4.5 秒，頭尾加短淡入淡出；600 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.4 dB、峰值 −3.3 dB（點綴，4.5 秒）
- **預計用在**：songbird：夜裡（補「夜裡整片無聲」）；也可給 forest 夜裡

## bird-robin.mp3

- **內容**：歐亞鴝（知更鳥）一段鳴唱
- **原名**：Robin song, good Quality, Forest south of France
- **作者**：Sacha.Julien
- **來源**：<https://freesound.org/people/Sacha.Julien/sounds/725331/>（2026-11-28 取用；上傳日 February 29th, 2024）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 9.2 秒起 3.6 秒，頭尾加短淡入淡出；1500 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.4 dB、峰值 −5.1 dB（點綴，3.6 秒）
- **預計用在**：songbird：園子各處

## bird-song-thrush.mp3

- **內容**：歌鶇一段反覆的鳴唱
- **原名**：Song Thrush
- **作者**：richwise
- **來源**：<https://freesound.org/people/richwise/sounds/785669/>（2026-11-28 取用；上傳日 January 18th, 2025）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 33.5 秒起 6 秒，頭尾加短淡入淡出；1500 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.4 dB、峰值 −3.8 dB（點綴，6.0 秒）
- **預計用在**：songbird：樹冠

## bird-dawn-chorus.mp3

- **內容**：鄉間黎明多種鳥的合唱
- **原名**：Dawn chorus - Hampshire countryside Springtime
- **作者**：richwise
- **來源**：<https://freesound.org/people/richwise/sounds/466242/>（2026-11-28 取用；上傳日 April 13th, 2019）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔約第 122 秒起 17 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 14 秒的無縫循環（`acrossfade` c1=c2=qsin）；1200 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −25 dB、峰值 −6.1 dB（循環，14.0 秒）
- **預計用在**：songbird：黎明整片（搭 A2）；也可給 forest、village 的黎明

## bird-starling-flock.mp3

- **內容**：椋鳥群在樹上吵雜，接著整群起飛的振翅聲
- **原名**：murmuration.wav
- **作者**：ilesinge
- **來源**：<https://freesound.org/people/ilesinge/sounds/545942/>（2026-11-28 取用；上傳日 November 23rd, 2020）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 6 秒起 9.5 秒，頭尾加短淡入淡出；150 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −23.2 dB、峰值 −5.3 dB（點綴，9.5 秒）
- **預計用在**：songbird：北邊樹冠上空（晨昏）

## beast-fox-scream.mp3

- **內容**：紅狐夜裡的兩聲尖叫
- **原名**：Fox screaming during the night
- **作者**：felix.blume
- **來源**：<https://freesound.org/people/felix.blume/sounds/832436/>（2026-11-28 取用；上傳日 November 5th, 2025）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 0.9 秒起 4.9 秒，頭尾加短淡入淡出；300 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.5 dB、峰值 −4.3 dB（點綴，4.9 秒）
- **預計用在**：forest：密林外圈、狐火行列那圈

## bird-nightjar.mp3

- **內容**：歐夜鷹持續的顫鳴（churring）
- **原名**：European Nightjar Nattskärra (Caprimulgus europaeus).wav
- **作者**：joakgust
- **來源**：<https://freesound.org/people/joakgust/sounds/548490/>（2026-11-28 取用；上傳日 December 19th, 2020）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔約第 62 秒起 15 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 12 秒的無縫循環（`acrossfade` c1=c2=qsin）；600 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.9 dB、峰值 −8.1 dB（循環，12.0 秒）
- **預計用在**：forest：林緣，夜裡的第二種夜鳥

## ruins-wind-howl.mp3

- **內容**：風灌進井道的低沉嗚咽（有音高的風嚎）
- **原名**：Burlingame howling wind.wav
- **作者**：Andron827
- **來源**：<https://freesound.org/people/Andron827/sounds/646874/>（2026-11-28 取用；上傳日 August 14th, 2022）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 30 秒起 18 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 15 秒的無縫循環（`acrossfade` c1=c2=qsin）；80 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.6 dB、峰值 −11.3 dB（循環，15.0 秒）
- **預計用在**：ruins：長廊與拱門，與雪稜的風分開

## ruins-rockfall.mp3

- **內容**：岩塊沿崖面滾落、帶下碎石
- **原名**：rockfall2a.wav
- **作者**：AlanCat
- **來源**：<https://freesound.org/people/AlanCat/sounds/389303/>（2026-11-28 取用；上傳日 April 24th, 2017）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 0 秒起 7.5 秒，頭尾加短淡入淡出；60 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.8 dB、峰值 −1.5 dB（點綴，7.5 秒）
- **預計用在**：ruins：遠處的落石；alpine 也可用

## bird-crow.mp3

- **內容**：大嘴烏鴉三聲啼叫（日本公園）
- **原名**：Corbeau 1.wav
- **作者**：trouxel
- **來源**：<https://freesound.org/people/trouxel/sounds/250095/>（2026-11-28 取用；上傳日 September 29th, 2014）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 2.15 秒起 2.3 秒，頭尾加短淡入淡出；400 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.4 dB、峰值 −6 dB（點綴，2.3 秒）
- **預計用在**：ruins：斷柱頂；wheatfield：枯樹（若決定加）

## village-anvil.mp3

- **內容**：鐵鎚敲鐵砧的一串連擊與餘響
- **原名**：Hammer and anvil
- **作者**：Duasun
- **來源**：<https://freesound.org/people/Duasun/sounds/321889/>（2026-11-28 取用；上傳日 September 12th, 2015）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 8.35 秒起 6.3 秒，頭尾加短淡入淡出；150 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −22.4 dB、峰值 −5.7 dB（點綴，6.3 秒）
- **預計用在**：village：鍛冶屋

## village-rooster.mp3

- **內容**：公雞一聲啼叫
- **原名**：Rooster Crow 1
- **作者**：BenjaminNelan
- **來源**：<https://freesound.org/people/BenjaminNelan/sounds/435508/>（2026-11-28 取用；上傳日 July 26th, 2018）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 0.12 秒起 2.04 秒，頭尾加短淡入淡出；200 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −21.4 dB、峰值 −6.6 dB（點綴，2.0 秒）
- **預計用在**：village：民家（黎明）

## village-dog.mp3

- **內容**：遠處一隻狗吠一聲
- **原名**：Dog Barking Distance - 2.wav
- **作者**：SpaceJoe
- **來源**：<https://freesound.org/people/SpaceJoe/sounds/485961/>（2026-11-28 取用；上傳日 September 22nd, 2019）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 0.3 秒起 0.77 秒，頭尾加短淡入淡出；150 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.5 dB、峰值 −6.4 dB（點綴，0.8 秒）
- **預計用在**：village：民家；campfire 也可用

## village-water-wheel.mp3

- **內容**：水車轉動、水落進木槽的規律拍打聲
- **原名**：Watermill.wav
- **作者**：Berwitz
- **來源**：<https://freesound.org/people/Berwitz/sounds/263583/>（2026-11-28 取用；上傳日 February 8th, 2015）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 2 秒起 18 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 15 秒的無縫循環（`acrossfade` c1=c2=qsin）；80 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.1 dB、峰值 −1.8 dB（循環，15.0 秒）
- **預計用在**：village：水車小屋

## cave-bats.mp3

- **內容**：洞裡一大群蝙蝠的吱吱聲與振翅（高頻為主）
- **原名**：Bat Sounds, Lod Cave, Thailand (March 10, 2019)
- **作者**：marc.om
- **來源**：<https://freesound.org/people/marc.om/sounds/806574/>（2026-11-28 取用；上傳日 May 13th, 2025）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 3 秒起 15 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 12 秒的無縫循環（`acrossfade` c1=c2=qsin）；200 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.7 dB、峰值 −9.8 dB（循環，12.0 秒）
- **預計用在**：cave：洞深處、頂上

## cave-stream.mp3

- **內容**：水流進地下坑道的低沉咕嚕與迴響
- **原名**：Water Flowing into Underground Sinkhole
- **作者**：hinchinbrook
- **來源**：<https://freesound.org/people/hinchinbrook/sounds/552485/>（2026-11-28 取用；上傳日 January 2nd, 2021）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 2 秒起 17 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 14 秒的無縫循環（`acrossfade` c1=c2=qsin）；40 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.5 dB、峰值 −9.7 dB（循環，14.0 秒）
- **預計用在**：cave：遠處的地下水流

## swamp-bittern.mp3

- **內容**：小葦鳽規律的低沉叫聲，夾著大葦鶯的粗啞鳴唱
- **原名**：Little Bittern and Great reed warber songs in the Salagou lake
- **作者**：Sacha.Julien
- **來源**：<https://freesound.org/people/Sacha.Julien/sounds/725451/>（2026-11-28 取用；上傳日 March 1st, 2024）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 2 秒起 16.8 秒，把開頭 2.4 秒以等功率曲線交叉淡入到結尾，做成 14.4 秒的無縫循環（`acrossfade` c1=c2=qsin）；100 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.4 dB、峰值 −4.4 dB（循環，14.4 秒）
- **預計用在**：swamp：枯木與蘆葦；lake 的蘆葦邊也可用

## mud-bubbling.mp3

- **內容**：熱泥池咕嘟冒泡
- **原名**：Hot Bubbling Mud
- **作者**：Breviceps
- **來源**：<https://freesound.org/people/Breviceps/sounds/456806/>（2026-11-28 取用；上傳日 January 17th, 2019）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 0.5 秒起 11.5 秒，把開頭 2.5 秒以等功率曲線交叉淡入到結尾，做成 9 秒的無縫循環（`acrossfade` c1=c2=qsin）；80 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.5 dB、峰值 −2.1 dB（循環，9.0 秒）
- **預計用在**：swamp：沼氣泡泡；jigoku 的泥池（但 jigoku 已用滿 300 KB 預算）

## bird-loon.mp3

- **內容**：潛鳥悠長的哀鳴
- **原名**：Late Summer Loons
- **作者**：itinerantmonk108
- **來源**：<https://freesound.org/people/itinerantmonk108/sounds/751848/>（2026-11-28 取用；上傳日 August 21st, 2024）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 15.9 秒起 6.7 秒，頭尾加短淡入淡出；300 Hz 高通；低通 4200 Hz；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.5 dB、峰值 −12.4 dB（點綴，6.7 秒）
- **預計用在**：lake：湖面遠處

## lake-reeds.mp3

- **內容**：風吹水邊蘆葦的沙沙聲
- **原名**：Japan_Matsudo_Waterside_Reed_1_24Bit_96KHz_MS-Stereo.wav
- **作者**：RutgerMuller
- **來源**：<https://freesound.org/people/RutgerMuller/sounds/361915/>（2026-11-28 取用；上傳日 October 8th, 2016）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 1 秒起 17 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 14 秒的無縫循環（`acrossfade` c1=c2=qsin）；200 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.6 dB、峰值 −5.4 dB（循環，14.0 秒）
- **預計用在**：lake：岸邊蘆葦；swamp、river 也可用

## water-lapping.mp3

- **內容**：平靜湖水輕拍岸邊
- **原名**：Water lapping on lake Pukaki,South Island,New Zealand.mp3
- **作者**：laughatlantic
- **來源**：<https://freesound.org/people/laughatlantic/sounds/528067/>（2026-11-28 取用；上傳日 July 15th, 2020）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 0.5 秒起 17 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 14 秒的無縫循環（`acrossfade` c1=c2=qsin）；80 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.8 dB、峰值 −1.6 dB（循環，14.0 秒）
- **預計用在**：lake：東岸短棧、小舟旁；coast：擱淺的小舟；swamp 也可用

## coast-rope-creak.mp3

- **內容**：繫船纜繩被拉緊的嘎吱聲
- **原名**：Mooring Rope.wav
- **作者**：Rmutt
- **來源**：<https://freesound.org/people/Rmutt/sounds/145721/>（2026-11-28 取用；上傳日 February 10th, 2012）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 31 秒起 3.4 秒，頭尾加短淡入淡出；200 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.4 dB、峰值 −1.4 dB（點綴，3.4 秒）
- **預計用在**：coast：擱淺的小舟、棧橋；lake 小舟也可用

## insect-night-chorus.mp3

- **內容**：夏夜曠野的蟲鳴合唱（與現有兩段蟋蟀不同頻段）
- **原名**：18090 Night summer insects thick crickets field clean PEC.mp3
- **作者**：TRP
- **來源**：<https://freesound.org/people/TRP/sounds/570994/>（2026-11-28 取用；上傳日 May 13th, 2021）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔約第 33 秒起 15 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 12 秒的無縫循環（`acrossfade` c1=c2=qsin）；300 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.9 dB、峰值 −9.2 dB（循環，12.0 秒）
- **預計用在**：夜裡共用：lake、river、village、meadow、wheatfield、coast（取代或疊在 insect-cricket／insect-bush-cricket 上）

## insect-japan-autumn.mp3

- **內容**：日本秋夜的鳴蟲（一種規律的脈衝、一種連續的顫鳴）
- **原名**：Japan_Kashiwa_Insects_Far_and_Upclose.wav
- **作者**：RutgerMuller
- **來源**：<https://freesound.org/people/RutgerMuller/sounds/365257/>（2026-11-28 取用；上傳日 October 27th, 2016）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 27 秒起 15 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 12 秒的無縫循環（`acrossfade` c1=c2=qsin）；1500 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.8 dB、峰值 −9.1 dB（循環，12.0 秒）
- **預計用在**：cicada：夜裡（蟬林的夜，補地面的洞）

## frog-tree-chorus.mp3

- **內容**：太平洋樹蛙的密集合唱
- **原名**：Pacific Tree Frogs in Secluded Pond, Petrolia, CA
- **作者**：CVLTIV8R
- **來源**：<https://freesound.org/people/CVLTIV8R/sounds/852657/>（2026-11-28 取用；上傳日 May 2nd, 2026）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔約第 105 秒起 15 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 12 秒的無縫循環（`acrossfade` c1=c2=qsin）；200 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.4 dB、峰值 −6.2 dB（循環，12.0 秒）
- **預計用在**：cicada：夜裡的樹蛙；swamp：夜裡加一片不同的蛙

## rain-frogs.mp3

- **內容**：夜裡細雨中的蛙與蟾蜍鳴叫
- **原名**：Light Rain, Frogs and Toads at Night - Rémire-Montjoly, French Guiana
- **作者**：felix.blume
- **來源**：<https://freesound.org/people/felix.blume/sounds/868995/>（2026-11-28 取用；上傳日 September 4th, 2026）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔約第 63 秒起 17 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 14 秒的無縫循環（`acrossfade` c1=c2=qsin）；80 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.4 dB、峰值 −4.3 dB（循環，14.0 秒）
- **預計用在**：rainvale：夜裡的蛙（下雨時）；swamp 下雨時也可用

## rain-leaves-heavy.mp3

- **內容**：大雨打在樹葉與濕地上
- **原名**：Rain, Heavy, Falling on Leaves
- **作者**：CHallSmith
- **來源**：<https://freesound.org/people/CHallSmith/sounds/870824/>（2026-11-28 取用；上傳日 September 17th, 2026）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔約第 42 秒起 17 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 14 秒的無縫循環（`acrossfade` c1=c2=qsin）；80 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.2 dB、峰值 −1.9 dB（循環，14.0 秒）
- **預計用在**：rainvale：雨勢大時疊在 rain-foliage 上（搭 A3）

## thunder-dry-roll.mp3

- **內容**：一聲雷響接長長的滾雷（無雨聲）
- **原名**：thunder 5 dry.wav
- **作者**：elmoustachio
- **來源**：<https://freesound.org/people/elmoustachio/sounds/476739/>（2026-11-28 取用；上傳日 July 13th, 2019）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 5.6 秒起 10 秒，頭尾加短淡入淡出；30 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −21.6 dB、峰值 −2.1 dB（點綴，10.0 秒）
- **預計用在**：rainvale：與現有 thunder 交替

## blizzard-whistle.mp3

- **內容**：風從門縫灌進來的口哨聲與陣風
- **原名**：Wind howling, Wind whispering, Wind whistles through my door
- **作者**：Borgory
- **來源**：<https://freesound.org/people/Borgory/sounds/728737/>（2026-11-28 取用；上傳日 March 25th, 2024）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔約第 41 秒起 13 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 10 秒的無縫循環（`acrossfade` c1=c2=qsin）；100 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.9 dB、峰值 −9 dB（循環，10.0 秒）
- **預計用在**：blizzard：雪丘背風面的另一種風；alpine 小屋也可用

## bird-skylark.mp3

- **內容**：雲雀在高空持續鳴唱
- **原名**：Single Skylark
- **作者**：Kinoton
- **來源**：<https://freesound.org/people/Kinoton/sounds/387426/>（2026-11-28 取用；上傳日 April 8th, 2017）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 13 秒起 17 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 14 秒的無縫循環（`acrossfade` c1=c2=qsin）；1500 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.6 dB、峰值 −4.6 dB（循環，14.0 秒）
- **預計用在**：meadow、wheatfield：田中央上空（orbit 高空）

## insect-grasshopper.mp3

- **內容**：草地上的螽斯／蚱蜢合唱
- **原名**：amb-grasshoppers_montenegro.aif
- **作者**：alfrd_jpn
- **來源**：<https://freesound.org/people/alfrd_jpn/sounds/101741/>（2026-11-28 取用；上傳日 July 21st, 2010）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 2 秒起 15 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 12 秒的無縫循環（`acrossfade` c1=c2=qsin）；1500 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.8 dB、峰值 −9 dB（循環，12.0 秒）
- **預計用在**：meadow、wheatfield：白天的草叢

## river-trickle.mp3

- **內容**：淺溪流過石頭的細碎水聲
- **原名**：Trickle Stream_1
- **作者**：lukabea
- **來源**：<https://freesound.org/people/lukabea/sounds/660506/>（2026-11-28 取用；上傳日 November 22nd, 2022）
- **授權**：Creative Commons 0（CC0 1.0，公眾領域貢獻，不需標示、可商用）
- **處理**：取原檔第 2 秒起 17 秒，把開頭 3 秒以等功率曲線交叉淡入到結尾，做成 14 秒的無縫循環（`acrossfade` c1=c2=qsin）；100 Hz 高通；調增益後過 `alimiter`（limit 0.83、level 關閉）；轉成單聲道 32 kHz / 56 kbps。來源是頁面上不需登入的高品質試聽檔（128 kbps 左右的 MP3），不是原始 WAV。
- **音量**：平均 −24.3 dB、峰值 −1.4 dB（循環，14.0 秒）
- **預計用在**：river：下游淺灘、木橋下（與主流分開）

## 新音檔實際擺在哪（2026-11-28）

上面各節的「預計用在」是找音檔時的打算；實際擺位如下（場景 id 與音源 id，`*` 是編號）。
音源定義在 `content/aquarium/minespace/domains/realm/<場景>/<場景>-sounds.ts`。
`campfire-horse-snort` 沒有用：拓荒原的拴馬處畫面上沒有馬。

| 音檔 | 用在 |
| --- | --- |
| `autumn-leaves-gust` | autumn（`autumn-realm-leaf-gust-*`） |
| `beast-coyote-chorus` | campfire（`frontier-coyote-*`） |
| `beast-coyote-yip` | campfire（`frontier-coyote-yip-*`） |
| `beast-fox-scream` | forest（`forest-sea-fox-*`） |
| `beast-roe-deer` | forest（`forest-sea-roe-deer`）；autumn（`autumn-realm-roe-deer-*`） |
| `bird-crow` | ruins（`ruins-temple-crow-*`）；wheatfield（`wheatfield-sea-crow`） |
| `bird-dawn-chorus` | songbird（`songbird-realm-dawn-bed-*`） |
| `bird-geese-flyover` | autumn（`autumn-realm-geese`） |
| `bird-loon` | lake（`lake-loon-*`） |
| `bird-nightingale` | forest（`forest-sea-nightingale-*`）；songbird（`songbird-realm-nightingale-*`） |
| `bird-nightjar` | forest（`forest-sea-nightjar-*`） |
| `bird-robin` | songbird（`songbird-realm-robin-*`） |
| `bird-skylark` | wheatfield（`wheatfield-sea-skylark`）；meadow（`meadow-downs-skylark-*`） |
| `bird-song-thrush` | songbird（`songbird-realm-thrush-*`） |
| `bird-starling-flock` | songbird（`songbird-realm-starling-flock`） |
| `blizzard-whistle` | blizzard（`blizzard-field-whistle-*`） |
| `campfire-horse-snort` | 沒有用到 |
| `campfire-windmill` | campfire（`frontier-windmill`） |
| `cave-bats` | cave（`cave-realm-bats-*`） |
| `cave-stream` | cave（`cave-realm-stream-*`） |
| `chime-furin` | rainvale（`rainvale-pavilion-chime-*`）；cicada（`cicada-realm-chime-*`） |
| `coast-rope-creak` | coast（`coast-isle-boat-rope`） |
| `frog-tree-chorus` | swamp（`swamp-realm-tree-frog-*`）；cicada（`cicada-realm-tree-frog-*`） |
| `insect-grasshopper` | meadow（`meadow-downs-grasshopper-*`） |
| `insect-japan-autumn` | cicada（`cicada-realm-autumn-insect-*`） |
| `insect-night-chorus` | village（`village-realm-field-cricket-fill-*`）；river（`river-realm-cricket-fill-*`）；meadow（`meadow-downs-far-night-insect-*`） |
| `jigoku-eruption` | jigoku（`jigoku-valley-rumble-far`） |
| `jigoku-hot-spring` | jigoku（`jigoku-valley-spring-*`、`jigoku-valley-foot-bath`） |
| `jigoku-rumble` | jigoku（`jigoku-valley-rumble-*`） |
| `jigoku-steam-vent` | jigoku（`jigoku-valley-vent-*`） |
| `lake-reeds` | lake（`lake-shore-reeds-*`）；river（`river-realm-bank-grass-*`） |
| `mud-bubbling` | swamp（`swamp-realm-mud-bubble-*`） |
| `rain-frogs` | rainvale（`rainvale-grove-night-frog-*`） |
| `rain-leaves-heavy` | rainvale（`rainvale-grove-heavy-rain-*`） |
| `river-trickle` | river（`river-realm-trickle-*`） |
| `ruins-rockfall` | alpine（`alpine-rockfall`）；ruins（`ruins-temple-rockfall-*`） |
| `ruins-wind-howl` | ruins（`ruins-temple-howl-*`） |
| `swamp-bittern` | swamp（`swamp-realm-bittern-*`） |
| `thunder-dry-roll` | rainvale（`rainvale-thunder-roll`） |
| `village-anvil` | village（`village-realm-anvil`） |
| `village-dog` | village（`village-realm-dog-*`） |
| `village-rooster` | village（`village-realm-rooster-*`） |
| `village-water-wheel` | village（`village-realm-water-wheel`） |
| `water-lapping` | lake（`lake-jetty-lapping`）；coast（`coast-isle-boat-lapping`） |
