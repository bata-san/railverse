import geopandas as gpd
import json
import os
import glob

# ユーザー設定
INPUT_SHAPEFILE_DIR = "N02-20_GML" # ダウンロードして解凍したフォルダ名に合わせてください
OUTPUT_DIR = "railway_geojson"
SIMPLIFY_TOLERANCE = 0.001 # 簡素化の度合い (度単位)。大きくすると軽くなりますが粗くなります。

def convert_railway_data():
    # 出力ディレクトリ作成
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    # Shapefileを探す (.shp)
    shp_files = glob.glob(os.path.join(INPUT_SHAPEFILE_DIR, "*.shp"))
    if not shp_files:
        print(f"エラー: {INPUT_SHAPEFILE_DIR} 内に.shpファイルが見つかりません。")
        return

    for shp_path in shp_files:
        print(f"読み込み中: {shp_path}")
        try:
            # GeoDataFrameとして読み込み (エンコーディングはShift-JISが多いですが、Geopandasが自動判定する場合も)
            gdf = gpd.read_file(shp_path, encoding='cp932')
            
            # 必要なカラムだけに絞る (例: 路線名、運営会社など)
            # N02-XXの仕様に合わせて調整してください。以下は一般的な例。
            # N02_001: 鉄道区分, N02_002: 事業者種別, N02_003: 路線名, N02_004: 運営会社
            columns_to_keep = ['N02_003', 'N02_004'] 
            if set(columns_to_keep).issubset(gdf.columns):
                gdf = gdf[columns_to_keep + ['geometry']]
                gdf.rename(columns={'N02_003': 'line_name', 'N02_004': 'company'}, inplace=True)
            
            # 座標系をWGS84 (Web用) に変換
            if gdf.crs is None or gdf.crs.to_string() != 'EPSG:4326':
                gdf = gdf.to_crs(epsg=4326)

            # 形状の簡素化 (軽量化)
            print("形状を簡素化しています...")
            gdf['geometry'] = gdf.geometry.simplify(SIMPLIFY_TOLERANCE)

            # GeoJSONとして出力
            output_filename = os.path.basename(shp_path).replace('.shp', '.geojson')
            output_path = os.path.join(OUTPUT_DIR, output_filename)
            
            print(f"保存中: {output_path}")
            gdf.to_file(output_path, driver='GeoJSON')
            
            # 都道府県ごとに分割したい場合 (データに都道府県コードが含まれている必要があります)
            # 今回のN02データは全国一括か、DL時に都道府県を選ぶ形式が多いため、
            # DLした単位でGeoJSON化するのが基本です。

        except Exception as e:
            print(f"変換エラー: {e}")

if __name__ == "__main__":
    print("--- 鉄道データ GeoJSON変換ツール ---")
    print("前提: 国土数値情報(N02-XX)のShapefileが必要です。")
    convert_railway_data()
