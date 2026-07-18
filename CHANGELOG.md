# Changelog

## [v0.6.18] - 2026-07-18

- Fix fifteen-twenty speech calls and fist finger counting. (7f075c3)

## [v0.6.17] - 2026-07-18

- Add WebRTC voice so players can hear each other's calls. (d456152)

## [v0.6.16] - 2026-07-18

- Use 4:3 camera viewports on mobile and settings. (8ab3782)

## [v0.6.15] - 2026-07-18

- Support multi-player fifteen-twenty and open media before match. (8d1af7a)

## [v0.6.14] - 2026-07-18

- Make fifteen-twenty a real-time speed race. (9eb26c9)

## [v0.6.13] - 2026-07-18

- Replace gesture fight with fifteen-twenty multiplayer. (47a19b6)

## [v0.6.12] - 2026-07-18

- Remap RPS emojis to ✋包／✌️剪／👊揼. (62d020b)

## [v0.6.11] - 2026-07-18

- Show RPS moves with matching emojis 👊✌️✋. (9251169)

## [v0.6.10] - 2026-07-18

- Store shared gesture loadouts on the server for all players. (2ef29ec)

## [v0.6.9] - 2026-07-17

- Move gesture-to-move loadouts into settings and hide them in game lobbies. (b05a16b)

## [v0.6.8] - 2026-07-17

- Add gesture retraining samples and live test mode in settings. (145950b)

## [v0.6.7] - 2026-07-17

- Add custom 4-char room codes and RPS countdown/win-lose SFX. (4bc538f)

## [v0.6.6] - 2026-07-17

- Merge pull request #3 from wongkino/cursor/rps-game-c018 (8c95ccb)
- Move admin login to home settings button and simplify settings (d86c261)
- Restructure home as game hub and move gestures to /settings (0d585f2)
- Fix false "not connected" error on game page load (dd5ab4a)
- Add best-of-3 match format setting for RPS game (a5d987b)

## [v0.6.5] - 2026-07-17

- Merge pull request #2 from wongkino/cursor/rps-game-c018 (43a1b65)
- Add multiplayer rock-paper-scissors game at /rps (92e732c)

## [v0.6.4] - 2026-07-17

- Merge pull request #1 from wongkino/cursor/multiplayer-fight-game-c018 (67251bd)
- Add multiplayer gesture fighting game at /fight (4eb0c76)

## [v0.6.3] - 2026-07-17

- fix: play gesture TTS via unlocked AudioContext/player (88c79df)

## [v0.6.2] - 2026-07-17

- fix: keep camera visible while recording on mobile (713f590)

## [v0.6.1] - 2026-07-17

- fix: harden TTS path that caused frequent playback errors (7985371)

## [v0.6.0] - 2026-07-17

- feat: auto-enable sound with camera start (6b1e290)

## [v0.5.4] - 2026-07-17

- fix: unstick gesture re-triggers blocked by hung iOS audio (acb9703)

## [v0.5.3] - 2026-07-17

- fix: allow gesture re-trigger after cooldown on iOS (42796fa)

## [v0.5.2] - 2026-07-17

- fix: keep camera RAF alive when audio pauses iOS video (900d360)

## [v0.5.1] - 2026-07-17

- fix: avoid freezing camera when unlocking audio on iOS (7759c2f)

## [v0.5.0] - 2026-07-17

- feat: local trial gestures and reliable iOS speech (cb85d9e)

## [v0.4.4] - 2026-07-17

- fix: unlock Web Speech on iOS/iPad with explicit user tap (460a0ab)

## [v0.4.3] - 2026-07-17

- style: apply square aspect-ratio to viewport on all breakpoints (ee522e0)

## [v0.4.2] - 2026-07-17

- style: make camera viewport a square frame (92fdbc3)

## [v0.4.1] - 2026-07-17

- fix: improve reaction buttons for iPad Safari (8133754)

## [v0.4.0] - 2026-07-17

- feat: auto-start listening when the page opens (ec69071)

## [v0.3.0] - 2026-07-17

- feat: use shared database directly instead of sync codes (150b0bc)

## [v0.2.1] - 2026-07-17

- fix: use list-form depends_on for Portainer compose parser (d1f663c)

## [v0.2.0] - 2026-07-17

- feat: require admin password to save gestures (722ba2b)

## [v0.1.0] - 2026-07-17

- feat: merge web and api into a single app service (8f8c765)
- fix: sync package-lock versions on every release bump [skip version] (514847a)

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
