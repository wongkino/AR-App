# Gesture Lab

用手勢學習與觸發反應的 Web App：錄下手勢，再次做出相同動作即可朗讀廣東話或播放音訊。手勢直接存於 PostgreSQL，所有裝置共用。

**目前版本：`v0.0.1`**（見 [`VERSION`](./VERSION)）

| 文件 | 說明 |
|------|------|
| [使用者指南](./docs/USER.md) | 安裝、錄製、監聽、FAQ |
| [架構說明](./docs/ARCHITECTURE.md) | 系統設計、API、部署 |
| [Agent 指南](./docs/AGENT.md) | 給 AI／自動化代理的開發規範 |
| [Changelog](./CHANGELOG.md) | 版本更新紀錄 |

## 功能

- MediaPipe 雙手即時追蹤（手機／筆電）
- 手勢錄製 + DTW 比對
- 廣東話朗讀、遠端音訊播放
- 已儲存手勢可改反應
- 手勢直接存 PostgreSQL（所有裝置共用同一份資料）
- Docker 一鍵部署（`app` + `db`；web／API 合併）；GitHub Actions 推送 `ghcr.io/wongkino/ar-app`

## 快速開始（Docker）

```bash
docker compose up --build -d
```

開啟 http://localhost:8080/  

- **一般**：開啟即可監聽（自動載入資料庫手勢）  
- **管理員**：密碼解鎖後才能錄製／儲存（預設 `gesture-admin`，可用 `ADMIN_PASSWORD` 改）

```bash
docker compose down
```

### 拉取 CI 建置的映像

```bash
docker compose pull
docker compose up -d
```

- `ghcr.io/wongkino/ar-app:<version>`（前端 + API 同一映像）

## 本機開發

```bash
docker compose up -d db

# 終端 1：API
cd server && npm install
DATABASE_URL=postgres://gesture:gesture@localhost:5432/gesturelab npm run dev

# 終端 2：前端
npm install && npm run dev
```

## 版本怎麼自動更新？

1. 開發者推送到 `main`
2. `release.yml` 依 Conventional Commits 自動 bump（預設 patch）
3. 更新 `VERSION`、`package.json`、`package-lock.json`、`server/package.json`、`server/package-lock.json`、`CHANGELOG.md`
4. 打上 `vX.Y.Z` tag 並推送
5. `docker.yml`／release 建置並推送單一映像 `ghcr.io/wongkino/ar-app`

手動指定升版種類：GitHub → Actions → Release → Run workflow → 選 patch／minor／major。

Commit 含 `[skip version]` 可略過升版（例如純文件修正）。

本機預覽升版：

```bash
node scripts/bump-version.mjs patch
```

## 使用流程（摘要）

1. 開啟頁面（自動從資料庫載入手勢）
2. 開啟相機
3. （管理員）錄製 → 停止 → 儲存手勢
4. 開始監聽，重複手勢觸發反應

完整說明：[docs/USER.md](./docs/USER.md)

## 技術摘要

| 層 | 技術 |
|----|------|
| 前端 | Vite、React 19、TypeScript、MediaPipe Tasks Vision |
| 後端 | Hono、Node.js、PostgreSQL |
| 部署 | Docker Compose、nginx、GHCR、GitHub Actions |

架構細節：[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

## License

Private / 依倉庫設定。
