# Changelog

本專案所有重要變更會記錄在此檔。版本遵循 [Semantic Versioning](https://semver.org/)。

推送到 `main` 時，GitHub Actions 會自動升版並更新本檔；commit 訊息含 `[skip version]` 則略過升版。

## [v0.0.1] - 2026-07-17

### Added
- Gesture Lab Web App：MediaPipe 雙手偵測、手勢錄製與 DTW 比對
- 反應系統：廣東話朗讀（Web Speech）、播放遠端音訊
- 已儲存手勢可編輯反應
- Postgres + Hono API 雲端同步（同步碼跨裝置）
- Docker Compose 一鍵部署（web / api / db）
- GitHub Actions：自動升版、建置並推送 GHCR 映像
- 文件：README、ARCHITECTURE、AGENT、USER、CHANGELOG
