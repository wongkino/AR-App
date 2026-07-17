# 架構說明（Architecture）

> Gesture Lab `v0.0.1`  
> 本文件描述系統組件、資料流、部署與擴充邊界，供開發與維運參考。

## 1. 系統總覽

Gesture Lab 是一個瀏覽器端手勢互動應用：以相機擷取手部關鍵點，錄製成可重播比對的時間序列，匹配成功後觸發朗讀或播放音訊。可選透過同步碼將手勢持久化到 PostgreSQL，跨裝置共用。

```text
┌─────────────┐     HTTP :8080      ┌──────────────────┐     SQL      ┌────────────┐
│  Browser    │ ◄─────────────────► │  app (單一服務)   │ ───────────► │ PostgreSQL │
│  React SPA  │   /  +  /api/*      │  Hono + static   │              │            │
│  MediaPipe  │                     └──────────────────┘              └────────────┘
└─────────────┘
```

## 2. 儲存庫結構

```text
AR-App/
├── src/                    # 前端（Vite + React + TypeScript）
│   ├── components/         # UI（ControlPanel 等）
│   ├── hooks/              # useHandLandmarker
│   ├── lib/                # DTW、matcher、storage、api、reactions
│   ├── App.tsx             # 主流程狀態機
│   └── types.ts
├── server/                 # 後端 API
│   ├── src/db.ts           # Postgres pool + schema init
│   └── src/index.ts        # Hono routes
├── scripts/
│   └── bump-version.mjs    # 自動升版
├── .github/workflows/
│   ├── release.yml         # 推 main → bump + tag
│   └── docker.yml          # tag → 建置 GHCR 映像
├── Dockerfile              # 前端靜態站（nginx）
├── server/Dockerfile       # API 映像
├── docker-compose.yml
├── VERSION                 # 單一真實版本號來源
├── CHANGELOG.md
├── README.md
└── docs/
    ├── ARCHITECTURE.md     # 本檔
    ├── AGENT.md
    └── USER.md
```

## 3. 前端架構

### 3.1 執行時依賴

| 模組 | 職責 |
|------|------|
| MediaPipe Hand Landmarker | 即時雙手 21 點關鍵點（最多 2 手） |
| `normalizeFrame` / `packDualHand` | 腕部原點 + 尺度正規化；左 21 + 右 21 = 42 點 |
| `GestureMatcher` + DTW | 滑動視窗比對已存手勢 |
| `runReaction` | `speak`（zh-HK 粵語）或 `play`（Audio URL） |
| `localStorage` | 本機快取手勢與同步碼 |
| `/api/*` | 有同步碼時與 Postgres 同步 |

### 3.2 應用模式（`AppMode`）

```text
idle ──開始錄製──► recording ──停止──► idle（pendingFrames）
  │                                      │
  │                                      └──儲存──► gestures[]
  └──開始監聽──► listening ──匹配成功──► runReaction()
```

### 3.3 同步策略

1. 本機永遠寫入 `localStorage`（離線可用）。
2. 若有 `syncKey`：手勢變更後 debounce ~600ms，`PUT` 全量覆蓋該 workspace 的 gestures。
3. 進入同步／重新下載：`GET` 覆蓋本機列表。

> 目前採 **last-write-wins 全量同步**，適合個人／小規模共用，非即時 CRDT。

## 4. 後端架構

### 4.1 API（Hono）

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/health` | 健康檢查 |
| POST | `/api/workspaces` | 建立 workspace，回傳 syncKey |
| GET | `/api/workspaces/:syncKey` | 驗證同步碼 |
| GET | `/api/workspaces/:syncKey/gestures` | 列出手勢 |
| PUT | `/api/workspaces/:syncKey/gestures` | 全量覆寫手勢 |
| DELETE | `/api/workspaces/:syncKey/gestures/:id` | 刪除單一手勢 |

同步碼格式：`XXX-XXX-XXX`（排除易混淆字元）。

### 4.2 資料模型（PostgreSQL）

```sql
workspaces (
  id UUID PK,
  sync_key TEXT UNIQUE,
  created_at TIMESTAMPTZ
)

gestures (
  id TEXT PK,
  workspace_id UUID → workspaces,
  name TEXT,
  frames JSONB,      -- HandFrame[]
  reaction JSONB,    -- { kind: 'speak'|'play', ... }
  created_at BIGINT,
  updated_at TIMESTAMPTZ
)
```

Schema 於 API 啟動時 `CREATE TABLE IF NOT EXISTS`。

## 5. 部署架構

### 5.1 Docker Compose

| Service | Image / Build | Port |
|---------|---------------|------|
| `app` | `ghcr.io/wongkino/ar-app`（web + api 合併） | 8080→8080 |
| `db` | `postgres:16-alpine` | 內部 5432 |

單一 Node 行程同時提供靜態前端與 `/api/*`。

### 5.2 CI/CD

```text
push main
  → release.yml：升版 → tag vX.Y.Z
  → 建置並推送單一映像
       ghcr.io/wongkino/ar-app:X.Y.Z / :latest
```

版本來源：`VERSION` 檔（並同步 `package.json`、`server/package.json`、`CHANGELOG.md`）。

## 6. 安全與隱私邊界

- 相機畫面**不上傳**；僅手勢關鍵點序列（正規化後）可能存 DB。
- 同步碼等同分享密鑰：知道碼即可讀寫該 workspace（無個別使用者帳號）。
- 預設 compose 資料庫帳密為開發用，正式環境請改密與限制網路。
- 相機需安全來源（`localhost` 或 HTTPS）。

## 7. 已知限制與擴充方向

| 現況 | 可擴充 |
|------|--------|
| 全量 PUT 同步 | 差分 CRUD、衝突合併 |
| 同步碼認證 | OAuth / 帳號 |
| 僅瀏覽器 TTS／音訊 URL | 本機檔案上傳、更多反應類型 |
| DTW 閾值固定 | 可調靈敏度 UI |
| amd64 映像 | 加 arm64 multi-arch |

## 8. 相關文件

- [使用者指南](./USER.md)
- [Agent 指南](./AGENT.md)
- [Changelog](../CHANGELOG.md)
- [README](../README.md)
