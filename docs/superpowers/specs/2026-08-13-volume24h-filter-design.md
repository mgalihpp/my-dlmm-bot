# Desain: Filter 24h Volume (minVolume24h / maxVolume24h)

Tanggal: 2026-08-13
Status: Disetujui

## Tujuan

Menambah filter screening berdasarkan volume 24 jam, configurable lewat config file dan `/config` bot. User ingin bisa menscreening pool dengan 24h volume > 500k (atau threshold lain).

## Keputusan Kunci

- **Server-side filtering** via key `volume_24h` pada Meteora Pool Discovery API — sudah diverifikasi live bahwa key valid dan bekerja (`filter_by=pool_type=dlmm&&volume_24h>=500000` → 45 hasil; threshold absurd → 0 hasil).
- Filter configurable: `minVolume24h` / `maxVolume24h`, mengikuti pola `minVolume` / `maxVolume` existing.
- Tidak ada client-side rejection — prinsip "all filtering happens at the API level" di README tetap berlaku.

## Data Flow

Tidak berubah dari existing:

```
ScreeningService.screen
  → buildDiscoveryFilter(poolCfg)  → filter_by string, termasuk volume_24h>=...
  → api.discoverPools({ filterBy, timeframe, category })
  → hasil sudah terfilter oleh server (finalizeScreen filtered: 0 tetap benar)
```

Berlaku otomatis di semua consumer: CLI (`vexis pool list`), Telegram (`/pools`, menu, AI agent), dan web dashboard — semua memanggil `ScreeningService.screen`.

## Perubahan

### 1. `src/domain/config.ts`

`PoolsConfig` tambah dua field optional, berdampingan dengan `minVolume`/`maxVolume` (baris 21–30):

```ts
minVolume24h?: number;
maxVolume24h?: number;
```

### 2. `src/lib/screening.ts`

Di `buildDiscoveryFilter`, tepat setelah filter volume existing (baris 59–60):

```ts
if (s.minVolume24h != null) filters.push(`volume_24h>=${s.minVolume24h}`);
if (s.maxVolume24h != null) filters.push(`volume_24h<=${s.maxVolume24h}`);
```

### 3. `src/telegram/handlers/config-editor.ts`

- `EDITABLE_FIELDS` tambah dua entry:
  - `{ key: "pools.minVolume24h", label: "Min Vol 24h", type: "number" }`
  - `{ key: "pools.maxVolume24h", label: "Max Vol 24h", type: "number" }`
- Keduanya masuk keyboard page 3 (TVL/Vol, tempat `pools.minVolume`/`pools.maxVolume` berada) — update `buildConfigKeyboard` dan `pageForKey`.
- Parsing number dan reset `null` sudah ditangani logic existing — tidak ada perubahan.

### 4. `vexis.config.example.json`

Blok `pools` tambah contoh:

```json
"minVolume24h": 500000,
"maxVolume24h": null,
```

### 5. `README.md`

Tabel "Screening Filters" tambah baris:

```
| 24h Volume | `minVolume24h` / `maxVolume24h` | Min/max 24h trading volume |
```

### 6. Test — `test/screening.test.ts`

Di test `buildDiscoveryFilter`, assert bahwa saat `minVolume24h`/`maxVolume24h` diisi, string filter mengandung `volume_24h>=...` / `volume_24h<=...`.

## Error Handling

Tidak ada yang baru. Config-editor sudah menangani parsing number (`Number(raw)`) dan reset via `"null"`/`"default"`/kosong.

## Testing / Verifikasi

- `npm run check` (biome)
- `npm run typecheck`
- `npm test` (vitest)

## Non-Goals

- Tidak mengubah config pribadi user (`vexis.config.json` gitignored) — user set sendiri.
- Tidak menambah CLI flag atau form field web untuk filter ini (konsisten dengan filter lain yang hanya via config).
- Tidak menambah client-side post-filter.
