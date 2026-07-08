# ExifFrame

[![CI](https://github.com/amemya/ExifFrame/actions/workflows/ci.yml/badge.svg)](https://github.com/amemya/ExifFrame/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/amemya/ExifFrame/branch/main/graph/badge.svg)](https://codecov.io/gh/amemya/ExifFrame)
[![Release](https://img.shields.io/github/v/release/amemya/ExifFrame)](https://github.com/amemya/ExifFrame/releases)
[![Go Version](https://img.shields.io/github/go-mod/go-version/amemya/ExifFrame)](https://github.com/amemya/ExifFrame)
[![Wails](https://img.shields.io/badge/Wails-v3-red.svg)](https://v3alpha.wails.io/)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

*[Read this in English](README.md)*

ExifFrame（エグジフ・フレーム）は、写真のEXIF/XMPメタデータを読み取り、撮影情報（カメラ、レンズ、F値、シャッタースピード、ISOなど）を記載した美しい「フレーム（余白）」付きの画像を生成するクロスプラットフォームのデスクトップアプリケーションです。

SNSへの投稿や作品のポートフォリオ作成において、撮影時の設定をスタイリッシュに共有するのに最適です。

## 主な機能と特徴

- **美しいフレーム生成**:
  - 写真の下部に撮影情報（EXIF）を配置したフレーム画像を生成します。
  - アスペクト比（1:1, 4:5, 16:9 などのプリセットやカスタム比率）、余白の色、テキストの色を自由にカスタマイズ可能です。
  - システムフォントに対応し、好みのフォントでテキストを描画できます。

- **自動メタデータ抽出**:
  - 画像からカメラ機種、レンズ、焦点距離、絞り値（F値）、シャッタースピード、ISO感度を自動で読み取ります。
  - **Adobe XMPフォールバック**: Lightroom等から書き出し、EXIFが欠損している画像であっても、XMPデータから撮影情報を復元可能です。

- **一括処理（バッチ処理）と監視フォルダ**:
  - 複数ファイルやディレクトリ全体を一括で読み込み、まとめてフレーム付き画像として書き出し（Export All）が可能です。
  - **監視フォルダ（Watch Folder）**: 指定したフォルダに画像が追加されると、バックグラウンドで自動的にフレームを適用してエクスポートする自動化機能も備えています。

- **高度なカスタマイズとプリセット**:
  - **フィルム＆現像データ対応**: デジタルカメラの撮影設定だけでなく、アナログカメラ用の情報（使用フィルム、現像液（Developer）、希釈率、液温、現像時間）の記載にも対応しています。内蔵の「Film Recipes」データベースから設定を簡単に呼び出すことも可能です。
  - 現在の設定を「Auto-Export Default」として保存し、以降の処理に自動適用できます。

- **モダンな技術スタック**:
  - **バックエンド**: [Go](https://golang.org/) と [Wails v3](https://wails.io/) を採用し、高速かつ軽量に動作します。
  - **フロントエンド**: React + TypeScript + Vite による快適でモダンな操作感を提供します。

## 必要な環境・ビルド方法

### 前提条件
- [Go 1.25+](https://golang.org/doc/install)
- [Node.js 20+](https://nodejs.org/en/download/)
- [Wails v3 CLI](https://v3alpha.wails.io/)

### 開発モード
フロントエンドのホットリロードを有効にして起動するには：
```bash
wails3 dev
```

### ビルド
スタンドアロンの実行可能ファイルをビルドするには：
```bash
wails3 build
```
ビルドされたバイナリは `build/bin/` フォルダに出力されます。

## コントリビューション
プルリクエストやIssueの報告は歓迎します。大きな機能追加の際は、事前にIssueにてご相談ください。
