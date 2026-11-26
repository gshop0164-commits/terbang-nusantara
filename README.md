# Terbang Nusantara

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/gshop0164-commits/terbang-nusantara/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/gshop0164-commits/terbang-nusantara/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Game terbang antar pulau untuk bounty [Make the best flight game](https://make.fun/c/best-flight-game-20261126-0057) di make.fun.

Lepas landas dari Bintan, terbang melewati cincin di atas laut dan Gunung Merapi, lalu mendarat di Batam, Karimun, dan Lombok di bawah langit senja. Tiga leg, bahan bakar yang harus dijaga, pendaratan yang harus mulus, dan skor terbaik yang tersimpan.

## Main

Buka `game/index.html` di browser desktop, atau jalankan `node serve.ts` lalu buka http://localhost:8080.

- **WASD / panah**: terbang (pitch dan belok)
- **Shift**: gas, **Ctrl**: kurangi gas
- **Spasi**: flap
- **C**: tampilan kokpit, **P**: jeda
- **Enter**: mulai / lanjut

## Struktur

- `game/` — game sebagai file statis (tanpa build, tanpa network)
  - `game/src/config.js` — semua angka yang bisa di-tune
  - `game/src/world.js` — rute, terrain, dan model terbang (murni logika)
  - `game/src/render.js` — langit, terrain pseudo-3D, pesawat, HUD, instrumen
  - `game/src/main.js` — loop game dan layar-layar
  - `game/src/input.js` — keyboard dan mouse
  - `game/src/shots.js` — adegan screenshot (`?shot=cover|flight|ring|landing`)
- `main.ts` — program penyerahan (menyalin `game/` + `screenshots/` ke `/output`, menulis `dossier.json`)
- `screenshots/` — 4 screenshot dari kode game sendiri
- `vendor/makefun-game.ts` — library make.fun, tidak diubah
