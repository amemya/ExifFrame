# ExifFrame

*[Read this in English](README.md)*

ExifFrame（エグジフ・フレーム）は、写真からEXIFメタデータを自動的に抽出し、閲覧するためのクロスプラットフォーム・デスクトップアプリケーションです。プロの現場で使われるAdobe Lightroomのような、洗練されたダークテーマのワークスペースを提供します。

## 主な機能

- **プロフェッショナルUI**: モダンな写真編集ツール（Adobe Lightroom等）からインスピレーションを得た、スタイリッシュなダークテーマインターフェース。
- **OSネイティブの統合**: MacおよびWindows上で完全にネイティブな操作感を実現する、ドラッグ可能なフレームレスタイトルバー。
- **EXIFの自動抽出**: カメラ機種、レンズ、焦点距離、絞り値（F値）、シャッタースピード、ISO感度を画像から自動で読み取ります。
- **XMPへのフォールバック**: LightroomやPhotoshopから書き出した写真との互換性を保つため、Adobe XMPタグから直接メタデータを読み込む機能もサポートしています。
- **書き出し（Export）機能**: フォーマットされた写真を簡単に保存できるエクスポート機能。

## 技術スタック

- **バックエンド**: [Go](https://golang.org/) & [Wails v2](https://wails.io/)
- **フロントエンド**: [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- **EXIF解析**: [goexif](https://github.com/rwcarlsen/goexif)

## 必要な環境

ローカルでビルドして実行するには、以下が必要です：

1. [Go 1.18+](https://golang.org/doc/install)
2. [Node.js 16+](https://nodejs.org/en/download/)
3. [Wails CLI](https://wails.io/docs/gettingstarted/installation)

## 使い方

### 開発モード

フロントエンドのホットリロードを有効にして開発モードでアプリを起動するには、以下のコマンドを実行します：

```bash
wails dev
```

### ビルド

お使いのOS向けにスタンドアロンの実行可能ファイルをビルドするには：

```bash
wails build
```

ビルドされたアプリケーションは `build/bin/` ディレクトリに生成されます。

## コントリビューション

プルリクエストを歓迎します！大きな変更を加える場合は、まずIssueを開いてどのような変更を加えたいかご相談ください。
