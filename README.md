# 機房 3D（Three.js + Vite）

從平面圖產生 3D 機房。每個案場只需要維護一份 `site.yaml`，其餘由程式產生。

```bash
npm install
npm run dev        # 開發；存檔 site.yaml 會自動更新畫面
npm run sites      # 只編譯並驗證所有案場
npm run build      # 正式打包（驗證失敗會中止）
```

多個案場時，網址加 `?site=<案場id>` 切換，畫面左上也會出現選單。

## 新增案場

照 [docs/workflow.md](docs/workflow.md) 的流程做，格式說明在 [docs/site-format.md](docs/site-format.md)。
設計理由、驗證狀態、已知限制記錄在 [docs/design-notes.md](docs/design-notes.md)。

## 結構

```
sites/<id>/
  site.yaml             ← 唯一手動維護的檔案
  plan.png              原始平面圖（疊圖比對用）
  devices.json          （選用）真實機櫃內容
  notes.md              判讀紀錄（假設與已確認事項）
scripts/
  site-compiler.mjs     site.yaml → JSON，並做驗證（重疊、重複、範圍、編號）
  build-sites.mjs       編譯所有案場，輸出到 src/generated/（不進版控）
src/
  builders/             每種設備一個 builder
  interaction/          hover / 點選
  ui/                   詳情面板
  live/mockLive.js      假的即時資料，之後換成 WebSocket / API
```

## 機櫃高度

`高度 = uHeight × 44.45 mm + 2 × 65 mm`，預設 42U ≈ 1997 mm，可以在 `site.yaml` 的 `types.rack.uHeight` 修改。
