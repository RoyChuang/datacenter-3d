# 氣流視覺化（冷通道封閉 + 列間空調）移植說明

來源：`src/thermal/airflow.js`（單一檔案，只依賴 `three`）。移植時把整支檔案複製過去，再依本文接上資料、動畫迴圈與 UI。

這是**依配置推算的示意圖，不是 CFD 結果**。只適用「冷通道封閉、列間空調（in-row cooler）」的配置。

## 1. 呈現的物理模型

每台機櫃都畫成一個封閉迴圈：

```
空調前面（出冷風）-> 冷通道 -> 機櫃前面（吸入）-> 機櫃內加熱 -> 機櫃背面（排出）
  -> 列的後方 -> 空調背面（回風）-> 空調內冷卻 -> 空調前面
```

- 顏色：冷段藍 `#2563eb`，熱段紅 `#dc2626`；機櫃內由藍轉紅，空調內由紅轉藍
- 每台機櫃在兩個高度各一個迴圈（`HEIGHTS = [0.7, 1.5]` m），讓氣流蓋住整個櫃面
- 視覺風格參考 windy.com 風場：許多細短的流線，頭亮尾淡，各自出生、淡出、短暫消失後在稍前方再出現，整體會閃爍流動，而不是整齊行進
- 流線下方另有大而柔的霧團（mist），讓氣流看起來像一團空氣，而不只是線

## 2. 輸入資料

```js
buildAirflow({ containments, racks, coolers, depth })
```

| 參數 | 形狀 | 說明 |
|---|---|---|
| `containments` | `[{ id, rows: [rowId...], x1, z1, x2, z2 }]` | 封閉冷通道的矩形範圍（公尺，XZ 平面）與它兩側的列 id |
| `racks` | `[{ id, row, x, z, facing }]` | 機櫃中心座標；`facing` 是**正面**朝向 |
| `coolers` | `[{ id, row, x, z, facing }]` | 列間空調，欄位同上；正面出冷風、背面回風 |
| `depth` | `{ rack, rowcool }` | 機櫃與空調的深度（公尺） |

- 座標系：Y 向上，XZ 為地面，單位公尺
- `facing` 只能是 `north`(-Z) / `south`(+Z) / `east`(+X) / `west`(-X)；其他值的設備會被跳過
- 通道方向自動判斷：矩形較長的那一軸就是通道走向
- 沒有空調的通道會整個略過

範例（本專案 dc-1f）：

```json
{ "id": "AISLE-A", "rows": ["A-W", "A-E"], "x1": 2.25, "z1": 2.4, "x2": 3.45, "z2": 10.2 }
{ "id": "A1", "row": "A-W", "x": 1.65, "z": 2.7, "facing": "east" }
{ "id": "R3", "row": "A-W", "x": 1.65, "z": 4.5, "facing": "east" }
```

## 3. 回傳的 API

```js
const airflow = buildAirflow({...});
airflow.group          // THREE.Group，預設 visible = false，加進場景即可
airflow.tick(dt)       // 推進動畫 dt 秒並更新 buffer
airflow.setFocus(id)   // 只顯示某機櫃或空調參與的迴圈；null 顯示全部；id 沒有氣流時回傳 false
airflow.racksOf(coolerId) // 這台空調服務的機櫃 id 清單
```

## 4. 接入方式（本專案的做法）

```js
import { buildAirflow } from './thermal/airflow.js';

const airflow = buildAirflow({
  containments: room.containments,
  racks: data.racks,
  coolers: data.rowcools,
  depth: { rack: types.rack.depth, rowcool: types.rowcool.depth },
});
scene.add(airflow.group);

// 只有圖層可見時才跑動畫，並節流到約 30 fps
let elapsed = 0;
onFrame((dt) => {
  if (!airflow.group.visible) return;
  elapsed += dt;
  if (elapsed < 1 / 30) return;
  airflow.tick(elapsed);
  elapsed = 0;
  requestRender(); // 若是按需渲染
});
```

搭配的 UI 行為（可依需要取捨）：

- 打開氣流時，把機櫃半透明（ghost），空調保持實心；牆也調淡，讓流線透出來
- 選取機櫃或空調時呼叫 `airflow.setFocus(selectedId)`，關閉氣流或取消選取時傳 `null`
- 圖例：藍到紅漸層，標「冷風 / 熱風」，並註明是示意
- 本專案只在案場設定 `airflow: cold-aisle` 時才建立這個圖層；配置不符時寧可不顯示，也不要畫出錯的氣流

## 5. 演算法

### 5.1 機櫃配對空調

對通道內每台機櫃：優先找**同一列**中沿通道方向距離最近的空調；同列沒有空調時，才從對面那列找最近的。

### 5.2 巢狀迴圈（不交叉）

同一台空調、同一側（同列或對面列、前方或後方）服務的機櫃，依距離算出 `ring`（0..1，最遠的機櫃為 1）。近的機櫃迴圈小、遠的大，像同心圓一樣套在一起，所以不會互相交叉：

- 冷段往通道中心伸出 `reach` 倍（受 `MIN_TURN` 限制，避免空調旁的 U 型轉彎太急；在對面列的一定要跨過中心）
- 熱段在機櫃背後 `HOT_LANE × ring` 處回流

### 5.3 迴圈路徑點

每個迴圈依序經過下列路徑點（`[位置, 熱度]`，熱度 0 為冷、1 為熱）：

1. 空調前面 `0`
2. 往通道中心偏 `reach` `0`
3. 機櫃前方 `SWEEP` 處、同樣偏到通道內 `0`（斜切進機櫃，不走直角）
4. 機櫃前面 `0`
5. 機櫃背面 `1`
6. 熱回流道上、機櫃旁 `1`
7. 熱回流道上、空調旁 `1`
8. 空調背面 `1`
9. 回到 1

### 5.4 平滑

用封閉的 centripetal Catmull-Rom（`THREE.CatmullRomCurve3(points, true, 'centripetal')`）穿過路徑點，每段取 `STEPS = 12` 個樣本存成折線，並預算累積弧長，查詢時用二分搜尋。距離小於 `MERGE = 0.15` m 的路徑點會先合併，避免曲線在重複點打出小圈。

### 5.5 擴散

兩段開放空氣（空調到機櫃前、機櫃後到空調背）會擴散：`spread = sin(π · 段內進度)`，兩端為 0、中段最寬。流線離迴圈的偏移量乘上 `0.5 + SPREAD × spread`，霧團大小在 `FOG_SIZE` 間插值。兩端都是 0，所以進出口不會跳動。

### 5.6 流線生命週期

每條流線有自己的速度（`SPEED ±25%`）、存活時間 `LIFE`、空檔 `GAP`。活著時淡入淡出（`FADE`）；死後在空檔期間繼續沿迴圈前進但不顯示，重生時側向微移 `JITTER`（限制在 `BAND` 內）。初始年齡隨機，避免同時閃爍。剛出生時尾巴從頭部慢慢長出來。

## 6. 渲染

### 6.1 流線（Mesh + ShaderMaterial）

WebGL 的線永遠只有 1 px，在淺色地板上看不見，所以每條流線做成**面向相機的帶狀（ribbon）**：

- 每個尾巴樣本 2 個頂點（side = -1 / +1），屬性：`position`、`toward`（下一個樣本）、`rgba`、`side`、`width`
- vertex shader 把兩點投影到螢幕，算出螢幕方向的法線，沿法線推開 `width × pixelRatio` 像素，所以寬度是螢幕像素，不隨距離變化
- fragment shader 用 `alpha × (1 - side²)` 羽化邊緣，結尾 `#include <colorspace_fragment>`
- 頭到尾寬度 `WIDTH = [2.6, 0.8]`，透明度 `OPACITY × (1 - t)^1.5`
- `transparent: true`、`depthWrite: false`、`DoubleSide`、`frustumCulled = false`
- `onBeforeRender` 每幀更新 `resolution`（drawing buffer 尺寸）與 `pixelRatio`

### 6.2 霧團（Points + ShaderMaterial）

- 每團一個點，`gl_PointSize` 由世界尺寸換算成像素（透視相機）：`size × projectionMatrix[1][1] × viewHeight × 0.5 / -mv.z`
- fragment shader 用高斯 `exp(-3.5 · r²)` 做柔邊
- `renderOrder = -1` 畫在流線底下

### 6.3 更新

所有 buffer 都是 `DynamicDrawUsage`，`tick()` 直接寫 Float32Array 後設 `needsUpdate = true`，不重建 geometry。整個氣流只有兩次 draw call。

## 7. 可調參數（檔案開頭的常數）

| 常數 | 目前值 | 作用 |
|---|---|---|
| `HEIGHTS` | `[0.7, 1.5]` | 每台機櫃在這些高度各畫一個迴圈 |
| `PER_LOOP` | `24` | 每個迴圈的流線數，越多越滿 |
| `TRAIL_POINTS` / `TRAIL_STEP` | `9` / `0.04` m | 尾巴樣本數與間距，決定最大長度（約 0.3 m） |
| `BAND` | `0.14` m | 流線偏離迴圈的最大距離 |
| `SPREAD` | `0.5` | 中段擴散加寬的倍率 |
| `SWEEP` | `0.8` m | 在機櫃前後多遠開始斜切轉向 |
| `HOT_LANE` | `0.6` m | 最遠機櫃的熱回流道離櫃背的距離 |
| `MIN_TURN` | `0.3` m | 空調旁 U 型轉彎的最小半徑 |
| `SPEED` | `0.4` m/s | 流速 |
| `LIFE` | `[1.2, 2.4]` s | 每次顯示的時間，太短畫面會很空 |
| `GAP` | `[0.05, 0.15]` s | 消失到重生的空檔 |
| `FADE` | `0.35` s | 淡入淡出時間 |
| `JITTER` | `0.06` m | 重生時的側向微移 |
| `WIDTH` | `[2.6, 0.8]` px | 頭到尾的螢幕寬度 |
| `OPACITY` | `0.8` | 頭部透明度 |
| `FOG_PER_LOOP` | `10` | 每個迴圈的霧團數 |
| `FOG_SPEED` | `0.45` | 霧團速度相對 `SPEED` 的倍率 |
| `FOG_SIZE` | `[0.5, 1.1]` m | 進出口與中段的霧團直徑 |
| `FOG_LIFE` / `FOG_FADE` | `[3.2, 6.4]` / `0.6` s | 霧團存活與淡入淡出 |
| `FOG_OPACITY` | `0.1` | 霧團中心透明度，想讓紅藍底色更明顯就調高 |
| `FOG_BAND` | `1.6` | 霧團偏移範圍是 `BAND` 的幾倍 |

調整經驗：

- 只調慢 `SPEED` 而不加長 `LIFE`，流線會變短、畫面變空（流線長度約等於存活時間 × 速度，上限受 `TRAIL_POINTS × TRAIL_STEP` 限制）
- 流線太多太短會像雜訊，太少則看不出流向；目前取中等數量、較長、較亮

## 8. 移植檢查

1. 新專案的 three.js 版本要有 `#include <colorspace_fragment>`（r152 以後）；舊版改成 `#include <encodings_fragment>`
2. 座標要是 Y 向上、公尺；若場景單位不同，所有長度常數要一起換算
3. `facing` 要確實是**正面**（進風面）朝向；朝向錯了，冷熱段會整個反過來
4. 通道矩形的 `rows` 要涵蓋兩側列，且空調的 `row` 也在其中
5. 相機若是正交（OrthographicCamera），霧團的 `gl_PointSize` 公式要改，因為目前是依透視深度換算
6. 若是按需渲染（非每幀渲染），`tick` 之後要觸發重繪
