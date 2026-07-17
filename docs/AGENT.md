# Agent 指南（給 AI / 自動化代理）

> 本文件給 Cursor Agent、CI bot 或其他自動化代理閱讀。  
> 變更程式碼前請先讀完；與 [ARCHITECTURE.md](./ARCHITECTURE.md) 衝突時以架構文件與實際程式為準。

## 1. 專案一句话

**Gesture Lab**：瀏覽器手勢錄製／比對 Web App，可觸發廣東話朗讀或播歌；可選 Postgres 同步碼跨裝置。

## 2. 開始工作前檢查清單

1. 讀 `VERSION`、`CHANGELOG.md` 了解當前版本。
2. 讀 `docs/ARCHITECTURE.md` 了解邊界。
3. 前端改動：`src/`；API／DB：`server/`；部署：`Dockerfile*`、`docker-compose.yml`、`.github/workflows/`。
4. **不要**提交 `node_modules/`、`dist/`、`.env`、秘密金鑰。
5. 使用者規則要求繁體中文回覆；文件與 UI 文案亦優先繁體。

## 3. 目錄與「該改哪裡」

| 需求 | 主要檔案 |
|------|----------|
| 手勢比對靈敏度 | `src/lib/dtw.ts`（`MATCH_THRESHOLD`）、`src/lib/matcher.ts` |
| 雙手／正規化 | `src/lib/landmarks.ts`、`src/hooks/useHandLandmarker.ts` |
| 朗讀語言／語音 | `src/lib/reactions.ts` |
| UI 流程／同步 | `src/App.tsx`、`src/components/ControlPanel.tsx` |
| 本機儲存 key | `src/lib/storage.ts` |
| REST 客戶端 | `src/lib/api.ts` |
| API／Schema | `server/src/index.ts`、`server/src/db.ts` |
| 升版邏輯 | `scripts/bump-version.mjs`、`.github/workflows/release.yml` |
| 映像建置 | `.github/workflows/docker.yml`、兩個 `Dockerfile` |

## 4. 開發指令

```bash
# 前端
npm install
npm run dev          # http://localhost:5173 ，/api proxy → :3001

# API（需 Postgres）
docker compose up -d db
cd server && npm install
DATABASE_URL=postgres://gesture:gesture@localhost:5432/gesturelab npm run dev

# 全棧
docker compose up --build -d   # http://localhost:8080

# 本機升版（通常由 CI 做）
node scripts/bump-version.mjs patch   # 或 minor / major
node scripts/bump-version.mjs --set 0.0.1
```

## 5. 版本與發布規則（強制）

- **真實版本來源**：根目錄 `VERSION`（目前語意化 `MAJOR.MINOR.PATCH`）。
- 推送到 `main` 會觸發 `release.yml` **自動升版**並打 `vX.Y.Z` tag。
- 每次升版會同步更新：
  - `VERSION`
  - `package.json` / `package-lock.json`
  - `server/package.json` / `server/package-lock.json`
  - `CHANGELOG.md`
- Commit 訊息含 **`[skip version]`** → 不升版（僅限文件 typo、workflow 熱修等）。
- 升版 commit 格式：`chore(release): vX.Y.Z [skip version]`（由 bot 產生）。
- Conventional Commits 影響自動 bump 種類：
  - `feat:` → minor
  - `feat!:` / `BREAKING CHANGE` → major
  - 其他 → patch
- Tag 推送後 `docker.yml` 建置：
  - `ghcr.io/wongkino/ar-app-web:X.Y.Z` 與 `:latest`
  - `ghcr.io/wongkino/ar-app-api:X.Y.Z` 與 `:latest`

**Agent 推送程式功能時**：正常 commit 即可，讓 CI 升版；**不要**手動亂改版本除非使用者要求。

## 6. 編碼慣例

- TypeScript strict；前端 React 19 + Vite。
- 只改任務相關檔案；不做無關重構。
- 不要新增使用者未要求的 markdown，除非任務就是寫文件。
- UI：避免通用 AI 審美（紫漸層、奶油襯線等）；此專案已有 teal／石色視覺，延續即可。
- 相機相關功能必須考慮手機 + 桌面。
- API 變更若動到 JSON shape，需同時更新前端 `types.ts` / `api.ts` 與本文件／ARCHITECTURE。

## 7. 測試期望（最低）

合併／交付前盡量做到：

```bash
npm run build
cd server && npm run build
```

有 Docker 時：

```bash
docker compose up --build -d
curl -s http://localhost:8080/api/health   # {"ok":true}
```

手勢／相機無法在 CI 完整 E2E 時，至少保證 typecheck + 映像可建。

## 8. 安全紅線

- 禁止把 DB 密碼、token 寫進 repo。
- 不要關閉相機權限相關的使用者提示。
- 同步碼視為 secret；文件中可用範例格式，勿寫入真實生產碼。
- 不實作攻擊／exploit；只修本地漏洞。

## 9. 文件維護責任

重大變更時同步更新：

| 變更類型 | 更新 |
|----------|------|
| 新功能／行為 | `CHANGELOG.md`（CI 也會自動 prepend，但說明要清楚）、`docs/USER.md` |
| API／資料流／部署 | `docs/ARCHITECTURE.md` |
| 開發流程／目錄 | `docs/AGENT.md` |
| 快速開始 | `README.md` |

## 10. 常見陷阱

1. **僅改前端、忘記 API 在 Docker 網路名是 `api`**：nginx `proxy_pass http://api:3001`。
2. **本機 Vite 未開 API**：`/api` 會 502；先起 `server` 或 compose。
3. **升版迴圈**：release commit 必須含 `[skip version]`。
4. **雙手 frame 長度 42**：舊資料可能 21；`frameDistance` 已相容，勿隨意改壞。
5. **GHCR private**：使用者 pull 前需 login 或把 package 設 public。

## 11. 回覆使用者時

- 使用繁體中文。
- 先給結論，短句為主。
- 需要連結時用完整 URL 或相對路徑如 `docs/USER.md`。
