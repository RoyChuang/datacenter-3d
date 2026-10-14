# 機房 3D（Three.js + Vite）

```bash
npm install
npm run dev
```

## 結構

```
src/
  data/                 ← 所有場景資料（從平面圖轉錄）
    room.json             房間尺寸、牆、門、封閉通道
    equipment-types.json  各類設備的共用規格（高度、深度、顏色、U 尺寸）
    racks.json            IT 機櫃擺放（63 台）
    rack-devices.json     單一機櫃內的設備清單（目前為假資料）
    rowcools.json         列間空調 R1–R16
    pdcs.json             配電櫃 PDC1–PDC7
    ups.json              UPS0–UPS2
    batteries.json        電池櫃
    points.json           點位：溫濕度感測器 TH-xx、攝影機 CAM-xx
  builders/             ← 每種設備一個 builder，讀資料產生 3D 物件
  interaction/picker.js ← hover / 點選
  ui/panel.js           ← 右側詳情面板
  live/mockLive.js      ← 假的即時資料，之後換成 WebSocket / API
```

## 座標慣例

- 單位：公尺。原點 = 平面圖左上角，**+x 往右、+z 往下**（和平面圖一致）。
- 地板一格 = `room.tileSize` = 0.6 m。
- 設備的 `x, z` 是**底面中心點**；`width` 沿著排的方向，`depth` 取自 `equipment-types.json`。
- `facing` = 正面朝向（`north | south | east | west`），目前都設為面向冷通道。
- 牆、門、封閉通道用矩形 `{x1, z1, x2, z2}`。

## 機櫃高度

`高度 = uHeight × uSize + plinth × 2`，預設 42U → 42 × 44.45 mm + 2 × 65 mm ≈ **1997 mm**。
單一機櫃可在 `racks.json` 覆寫 `uHeight`（例如 47U）。

## rack-devices.json

```json
{ "A1": [ { "u": 4, "size": 2, "type": "server", "name": "SRV-A1-01", "powerW": 654 } ] }
```

`u` = 設備最下面那一個 U 的位置（從 1 起算），`size` = 佔幾 U。`type`：`server | storage | switch | patch`。
機櫃正面貼圖由這份清單畫出，改資料就會反映到 3D 畫面上。
