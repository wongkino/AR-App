# Gesture Lab

用手勢學習與觸發反應的 Web App：錄下手勢後，再次做出相同動作即可朗讀文字或播放音訊。

## 功能

- MediaPipe Hand Landmarker 即時手部追蹤（手機 / 筆電瀏覽器）
- 錄製手勢時間序列並以 DTW 比對
- 觸發反應：Web Speech API 朗讀（廣東話）、播放遠端音訊 URL
- **Postgres 雲端同步**：用同步碼跨裝置共用手勢

## Docker（建議）

一次啟動前端 + API + Postgres：

```bash
docker compose up --build -d
```

開啟 http://localhost:8080/

1. 在「雲端同步」按 **建立新同步碼**
2. 把同步碼記下來，其他裝置輸入同一組碼即可
3. 之後儲存／修改／刪除手勢會自動寫入資料庫

```bash
docker compose down
```

### 使用 GitHub Actions 打包的映像

`main` 推送後會自動建置並推到 GHCR：

- `ghcr.io/wongkino/ar-app-web`
- `ghcr.io/wongkino/ar-app-api`

直接拉映像跑（不必本機 build）：

```bash
docker compose pull
docker compose up -d
```

若套件是 private，先登入：

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

打 tag（例如 `v1.0.0`）也會產生對應版本標籤。

## 本機開發

需要先有 Postgres（或用 compose 只開資料庫）：

```bash
docker compose up -d db
```

```bash
# API
cd server && npm install && DATABASE_URL=postgres://gesture:gesture@localhost:5432/gesturelab npm run dev

# 前端（另開終端）
npm install && npm run dev
```

> 相機需要安全來源（`localhost` 或 HTTPS）。

## 使用流程

1. （建議）建立或加入同步碼
2. 開啟相機
3. 填寫手勢名稱與反應 → **開始錄製** → **停止並預覽** → **儲存手勢**
4. **開始監聽**，重複該手勢觸發反應

## 技術

- Vite + React + TypeScript
- `@mediapipe/tasks-vision` Hand Landmarker
- Hono API + PostgreSQL
- GitHub Actions → GHCR Docker images
