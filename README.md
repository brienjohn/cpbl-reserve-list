# 中職契約保留名簿

球迷模擬工具：排出中職各隊的 60 人契約保留名單（《中華職棒大聯盟規章》第 8 章第 10 條），並查看所有球迷的保留率統計。

- `docs/`：GitHub Pages 靜態網站（`index.html`、`app.js`、`style.css`、`data/teams.json`、`photos/`）
- `worker/`：Cloudflare Worker API + D1 資料庫
  - `GET /stats?team=AEO`：該隊送出份數與每位球員被保留次數
  - `GET /mine?team=AEO&voter=<uuid>`：此裝置送出的名單
  - `POST /picks`：`{team, voter, ids}` 送出或覆蓋名單（空陣列為撤回）

球員名單與照片取自中華職棒官網（2026-10-07）。已排除洋將與自主／自行培訓球員。本專案與中華職棒及各球團無關。
