# Social Tools

Widget hub + first widget (`counter`) with per-user saved state.

## Features

- Widget list page at `/`
- Counter widget at `/widgets/counter/index.html`
- Saved per `username`:
  - `count`
  - `label`
  - `countColor`
  - `labelColor`
  - `fontType` (`basic`, `resident-evil`, `god-of-war`)
  - `letterSpacing`
  - `wordSpacing`
  - `countFontSize`
  - `labelFontSize`
- Action files:
  - `/widgets/counter/increase.html?username=<name>`
  - `/widgets/counter/decrease.html?username=<name>`
  - `/widgets/counter/reset.html?username=<name>`

## Run with Docker

```bash
docker compose up -d --build
```

Open locally:

```text
http://localhost:4050
```

Open from LAN:

```text
http://<YOUR_LOCAL_IP>:4050
```

## API

- `GET /api/counter?username=<name>`
- `POST /api/counter/increase?username=<name>`
- `POST /api/counter/decrease?username=<name>`
- `POST /api/counter/reset?username=<name>`
- `POST /api/counter/settings`

Example body for settings:

```json
{
  "username": "streamer1",
  "label": "Deaths",
  "countColor": "#ff0000",
  "labelColor": "#ffffff",
  "fontType": "resident-evil",
  "letterSpacing": 2,
  "wordSpacing": 6,
  "countFontSize": 120,
  "labelFontSize": 48
}
```
