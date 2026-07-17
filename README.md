# Gesture Lab

用手勢學習與觸發反應的 Web App：錄下手勢後，再次做出相同動作即可朗讀文字或播放音訊。

## 功能

- MediaPipe Hand Landmarker 即時手部追蹤（手機 / 筆電瀏覽器）
- 錄製手勢時間序列並以 DTW 比對
- 觸發反應：Web Speech API 朗讀、播放遠端音訊 URL
- 手勢資料存於本機 `localStorage`

## 開始使用

```bash
npm install
npm run dev
```

用瀏覽器開啟終端機顯示的本機網址，允許相機權限後即可操作。

> 相機需要安全來源（`localhost` 或 HTTPS）。若要用手機連同一區網的筆電開發伺服器，請自行設定 HTTPS 或透過隧道。

## Docker

```bash
docker compose up --build -d
```

開啟 http://localhost:8080/

```bash
# 停止
docker compose down
```

或直接用 Docker：

```bash
docker build -t gesture-lab .
docker run --rm -p 8080:80 gesture-lab
```

## 使用流程

1. 開啟相機
2. 填寫手勢名稱與反應（朗讀 / 音訊網址）
3. **開始錄製** → 做完手勢 → **停止並預覽** → **儲存手勢**
4. **開始監聽**，重複該手勢觸發反應

## 技術

- Vite + React + TypeScript
- `@mediapipe/tasks-vision` Hand Landmarker
