# 給 AI 的指示

這個 repo 把機房平面圖（通常是監控軟體截圖）轉成 Three.js 3D：`sites/<id>/site.yaml` → `scripts/site-compiler.mjs` → `src/generated/<id>/`。

## 建立或修改案場之前

先讀完 [docs/workflow.md](docs/workflow.md) 和 [docs/site-format.md](docs/site-format.md)，照裡面的步驟做。範例：[sites/dc-1f/](sites/dc-1f/)。

## 鐵律

1. **只寫 `sites/<id>/` 底下的檔案**（`site.yaml`、`notes.md`、平面圖）。`src/generated/` 一律由 `npm run sites` 產生，不可以手寫或修改
2. **只用 `docs/site-format.md` 裡有的欄位**，不要自創欄位。格式不夠用時寫進 `notes.md` 並回報，不要改程式或格式
3. **比例用程式量，不要用看的**：橫向、縱向分開量，數據寫進 `notes.md`（見 workflow.md 2.1）。疊圖對齊不能證明比例正確
4. **尺寸依 workflow.md「尺寸判定標準」**：照來源的優先順序判定，在 `notes.md` 記錄每類設備用的是哪一級；疊圖時中心和頭尾對不上就是判定錯了，不能交差
5. **看不懂、看不到的先問**：圖例、朝向、冷卻方式、電力拓樸，列成問題，不要猜
6. **數量對帳**：圖上看得到的設備不可以默默省略；被遮住的依同類推定建模或列成問題，`notes.md` 列出圖上與建模數量及每個差異的原因
7. **牆與門也要對齊**：門要落在門弧所在的那面牆上；圖上封閉的房間，3D 也要封閉
8. **`props` 只放要顯示給使用者的屬性**；判定依據、量測數據一律寫在 `notes.md`。沒有真實機櫃資料時 `mockDevices: true`
9. **定位基準**：排的 `from` 由第一台設備中心回推（中心 − 寬度 ÷ 2），不可以沿用別排的值；牆取牆線本身，門弧只用來判斷門在哪面牆
10. **未確定的選填值不要填**（例如 `airflow`），列成問題；必填值沒有依據時標為待確認
11. **驗收沒過要先修**，修不了才回報，並寫明試過什麼
12. **交件前逐項核對 workflow.md 的「交件檢查清單」**：`site.yaml`、`notes.md`、`npm run sites` 無 ✖、疊圖檢查，缺一項就不算完成，不可以回報完成；所有 ⚠ 列在回報中
