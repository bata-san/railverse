# RailVerse (仮) - Prototype

次世代架空鉄道シミュレーター「RailVerse」のUIプロトタイプです。
企画書の「地下鉄モード（X-ray View）」の挙動を確認できます。

## バージョン

- **[index.html](index.html)**: OpenLayers + CartoDB Tiles (APIキー不要)

## 実行方法

1. **ファイルの実行**
   - `index.html` をブラウザで開いてください。
   - **APIキーは不要です**。すぐに動作を確認できます。

2. **駅データ.jp連携について**
   - デフォルトでは「デモデータ」が表示されます。
   - 「駅データ.jp」を選択すると、APIから実際の路線データを取得して表示します。
   - **データソース**: [ny-a/ekidata](https://github.com/ny-a/ekidata) (GitHub Pages) を利用しています。
     - CORS制限がなく、高速かつ安定してデータを取得できます。
     - プロキシサーバーを経由しないため、セキュリティ的にも安心です。

## 操作方法

- **モード切替**: 左上のスイッチで「DAY（地上）」と「NIGHT（地下）」を切り替えられます。
  - **DAYモード**: 通常の地図。地下鉄は点線で薄く表示されます。
  - **NIGHTモード**: 地図がダークモードになり、地下鉄がネオンのように発光して表示されます。
- **地図操作**:
  - 左クリックドラッグ: 移動
  - ホイール: ズーム

## 技術メモ

- **OpenLayers v8**: 地図描画エンジン。APIキー不要で利用可能。
- **CartoDB Basemaps**: 地図タイルとして採用。Dayモードは「Positron」、Nightモードは「Dark Matter」を使用し、CSSフィルタなしで美しいダークモードを実現。
- **Style Function**: OpenLayersの強力なスタイル関数を利用し、ズームレベルやモード（Day/Night）に応じた動的なスタイル変更（ネオン発光など）を実装。
- **CORS Proxy**: クライアントサイドのみで外部APIを叩くため、AllOriginsプロキシを利用。
- **Polyline Stacking**: 2本のPolyline（太い半透明＋細い実線）を重ねることで、CSS Filterが使えないGoogle Maps上で「ネオン発光」を再現しています。
- **Ekidata API**: XML形式のデータをパースして描画するロジックを実装済み。

## 今後の実装予定（Next.js版）

本プロトタイプはHTML単体で動作しますが、製品版は以下の構成で開発予定です。

- Frontend: Next.js + React
- Map: Google Maps JavaScript API (React Wrapper)
- Backend: NestJS + PostGIS
