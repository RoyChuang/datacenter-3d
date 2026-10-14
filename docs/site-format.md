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
aisles:
  - { id: AISLE-A, between: [A-W, A-E], doors: [start, end] } # 自動算範圍、頂板、端門
```

## 點位

```yaml
points:
  - { type: sensor, prefix: TH,  height: 1600, at: [[5, 3.26], [4.03, 4.52]] }
  - { type: camera, prefix: CAM, height: 2500, at: [[0.9, 1.45]] }
```

編號會依序自動產生，例如 `TH-01`、`TH-02`。

## devices.json（選用，真實機櫃內容）

```json
{ "A1": [ { "u": 4, "size": 2, "type": "server", "name": "SRV-01", "powerW": 650 } ] }
```

`u` = 設備最下面那一個 U 的位置（從 1 起算），`size` = 佔幾 U，`type` 可以是 `server | storage | switch | patch`。
