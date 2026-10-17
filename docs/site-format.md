# site.yaml 格式

**單位規則**：位置一律用「地板格」，設備尺寸一律用 mm。
原點 = 平面圖左上角，x 往右、z 往下。範例：[sites/dc-1f/site.yaml](../sites/dc-1f/site.yaml)。

## 基本

```yaml
id: dc-1f                # 必須和資料夾名稱相同
name: 機房 1F
grid: { tileSize: 600, cols: 33, rows: 22.5 }   # 地板格尺寸 (mm)、房間寬深 (格)
plan: { image: plan.png, pxPerTile: 31, originPx: [0, 0] }
wallHeight: 2600         # mm
perimeter: true          # 自動產生外牆
mockDevices: true        # 沒有 devices.json 時用假資料填機櫃
```

## rows：設備排

```yaml
rows:
  - id: A-W              # 排的名稱（封閉通道會用到）
    axis: z              # 排往哪個方向延伸：x（橫排）或 z（直排）
    line: 2.75           # 排的中心線位置（格）
    from: 4              # 第一台設備的起點邊緣（格）
    facing: east         # 正面朝向：north / south / east / west
    widths: { rowcool: 600 }   # （選用）這一排某類設備的寬度
    units: [A1, A2, R3, { gap: 600 }, A4, PDC1]   # 依序排列；{ gap: mm } 表示空位
```

設備類型由編號自動判斷：

| 編號開頭 | 類型 | 預設寬 × 深 × 高 (mm) |
|---|---|---|
| `PDC` | pdc 配電櫃 | 600 × 1200 × 2000 |
| `R` + 數字 | rowcool 列間空調 | 300 × 1200 × 2000 |
| `UPS` | ups | 600 × 1000 × 1900 |
| `BATT` | battery 電池櫃 | 600 × 1000 × 1900 |
| `ACP` | panel 壁掛配電箱 | 600 × 250 × 900，離地 900 |
| 其他 | rack 機櫃 | 600 × 1200，42U |

規則和尺寸都可以在 site.yaml 覆寫：

```yaml
typeRules:
  - { match: '^AC', type: rowcool }
  - { match: '.*', type: rack }
types:
  rack: { uHeight: 47 }
```

## 單台設備的覆寫

```yaml
widths: { B3: 800, C1: 800 }          # 寬度 (mm)
props:  { UPS0: { capacityKVA: 200 } } # 附加屬性，會顯示在詳情面板
equipment:                             # 不屬於任何一排的單獨設備
  - { id: UPS9, type: ups, at: [12, 18], facing: south }
```

## 牆、門、封閉通道

```yaml
walls:
  - [16.28, 0, 16.62, 22.5]            # [x1, z1, x2, z2]（格）
doors:
  - { id: DR-1, rect: [16.28, 1.93, 16.62, 4.03] }            # 實心門，會自動切開牆
  - { id: GL-1, kind: glass, rect: [3.58, 1.87, 3.75, 4] }    # 玻璃隔間
  - { id: SD-1, kind: sliding, rect: [2.25, 10.2, 3.45, 10.3] } # 玻璃滑門（有把手）
aisles:
  - { id: AISLE-A, between: [A-W, A-E], doors: [start, end] } # 自動算範圍、頂板、端門（玻璃滑門）
```

## 點位

```yaml
points:
  - { type: sensor, prefix: TH,  height: 1600, at: [[5, 3.26], [4.03, 4.52]] }
  - { type: camera, prefix: CAM, height: 2500, at: [[0.9, 1.45]] }
```

編號會依序自動產生，例如 `TH-01`、`TH-02`。

## power：電力拓樸（選用）

```yaml
power:
  external: [EMP1-1, EMP1-2]       # （選用）不在平面圖上的上游設備，3D 只顯示來源標籤；不需要就省略，連同下面兩行
  feeds:
    - { path: A, from: EMP1-1, to: UPS1 }
    - { path: A, from: UPS1, to: [PDC1, PDC3, PDC5, PDC7, ACP-1] }
    - { path: B, from: EMP1-2, to: UPS2 }
    - { path: B, from: UPS2, to: [PDC2, PDC4, PDC6, ACP-2] }
  redundancy: [[PDC1, PDC2], [PDC3, PDC4]]   # 互為備援的兩台
  serves:                                     # 每台設備供電給哪些機櫃：排名稱或機櫃編號
    PDC1: [A-W, A-E]
  servesAssumed: true                         # 供電範圍是推定的（面板會標示「推定」）
```

| 欄位 | 說明 |
|---|---|
| `path` | `A` 或 `B`，決定線的顏色（藍 / 橙） |
| `from` / `to` | 設備編號；`to` 可以是清單。`external` 裡的編號可以當 `from` |
| `redundancy` | 備援配對；點選其中一台時，另一台的路徑會一起亮起 |
| `serves` | 每台設備供電給誰：寫排名稱代表該排所有機櫃和列間空調，寫設備編號代表那一台；UPS 會自動彙總下游的範圍 |

電池櫃的 `props.ups` 會自動畫成到該 UPS 的直流線（只限出現在拓樸裡的 UPS）。

編譯時會檢查：找不到的編號、`path` 寫錯、供電迴圈（錯誤）；備援的兩台走同一路、`serves` 對不到機櫃（警告）。

## devices.json（選用，真實機櫃內容）

```json
{ "A1": [ { "u": 4, "size": 2, "type": "server", "name": "SRV-01", "powerW": 650 } ] }
```

`u` = 設備最下面那一個 U 的位置（從 1 起算），`size` = 佔幾 U，`type` 可以是 `server | storage | switch | patch`。
