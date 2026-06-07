# <img src="assets/icon.png" alt="logo" width="30" height="30" style="vertical-align: text-bottom;"> vanilla-deck

English version follows below.

## 日本語

vanilla-deck は、Twitter（現 X）の公式 Web 画面を、セッションを分けた複数カラムで同時に表示するデスクトップアプリです。
Windows ネイティブアプリです。

独自 API、スクレイピング、自動投稿、Twitter 画面への DOM 注入は使わず、Electron に組み込まれた Chromium で公式 Web 画面をそのまま表示します。Twitter 側の UI 変更に対して、専用クライアントより依存箇所を少なくすることを目的にしています。

### 起動

- [GitHub Releases](https://github.com/TSUKAMOTO-Yuta/vanilla-deck/releases/latest) から最新の Windows ZIP をダウンロードして展開し、`vanilla-deck.exe` を起動します。

### 画面の見方

- `Columns 3 | Active 2nd` は、カラムが 3 つあり、左から 2 番目のカラムがアクティブだという意味です。
- `View` の `- / 420px / +` で全カラムの幅をまとめて変えられます。
- `View` の `- / 100% / +` で全カラムのズームをまとめて変えられます。
- `Columns` の `↻` でアクティブカラムだけを再読み込みします。
- `Columns` の `← / →` でアクティブカラムを 1 つずつ移動します。
- `＋` でカラムを追加し、`－` で現在のアクティブカラムを削除します。
- 右上の `…` から、あまり使わない操作をまとめて開けます。
  - `Reset X session…` で、保存された全カラムのデータを消して `x.com/home` からやり直します。実行前に確認ダイアログが出ます。
- 下部のスクロールバーをドラッグすると、カラムを左右に移動できます。
- 最後にクリックしたカラムがアクティブになります。
- `F12` でアクティブカラムの DevTools を切り替えられます。

### ログインの挙動

新しいカラムを追加すると、最後に使っていたカラムのログイン状態を引き継ぎます。空の新規カラムではないので、複数アカウントをそのまま使い始めやすくなっています。推奨セットアップ法として、初回立ち上げ時に、最初のカラムで使うアカウント全てログインしてからカラムを複製すると捗ります。

### 注意事項

vanilla-deck は Electron 製のため、実行ファイルや同梱ファイルは小さくありません。
また、カラムごとに session を保存するので、一時ファイルや保存領域の容量も大きめになりがちです。

### ドキュメント

- [ドキュメント目次](doc/index.md)
- [セットアップと配布](doc/setup-and-distribution.md)
- [アーキテクチャとセキュリティ](doc/architecture-and-security.md)
- [X の用語対応表](doc/x-terms.md)

### ライセンス / 免責 / 問い合わせ

- ライセンス: [LICENSE](LICENSE)
- 免責: 本ソフトウェアは現状有姿で提供され、明示または黙示を問わず、いかなる保証もありません。
- 問い合わせ: リリース配布元のリポジトリで issue を立てるか、リポジトリオーナーの bio に記載された連絡先をご利用ください。

## English

vanilla-deck is a desktop app that shows Twitter's official web UI in multiple session-separated columns at the same time.
It is a Windows-native app.

It does not use a custom API, scraping, auto-posting, or DOM injection into the Twitter page. Instead, it uses Chromium bundled with Electron to display the official web experience as-is, with fewer moving parts than a dedicated client when Twitter changes its UI.

### Launch

- Download the latest Windows ZIP from [GitHub Releases](https://github.com/TSUKAMOTO-Yuta/vanilla-deck/releases/latest), extract it, and launch `vanilla-deck.exe`.

### Screen guide

- `Columns 3 | Active 2nd` means there are three columns and the second one from the left is active.
- In `View`, `- / 420px / +` changes the width of all columns together.
- In `View`, `- / 100% / +` changes the zoom level of all columns together.
- In `Columns`, `↻` reloads only the active column.
- In `Columns`, `← / →` moves the active column one step at a time.
- `＋` adds a column, and `－` removes the currently active column.
- `More` in the upper-right opens less-used actions.
  - `Reset X session…` clears the saved data for all columns and starts over from `x.com/home`. A confirmation dialog appears before it runs.
- Drag the bottom scrollbar to move left and right across the columns.
- The last column you click becomes the active one.
- Press `F12` to toggle DevTools for the active column.

### Login behavior

When you add a new column, it inherits the login state from the last-used column. It is not a blank column, so it is easy to start with multiple accounts already logged in.
As a recommended first-time setup, log in to all accounts you plan to use in the first column, then duplicate that column.

### Notes

Because vanilla-deck is built with Electron, the executable and bundled files are not tiny.
It also keeps a session per column, so temporary files and saved data can grow fairly large.

### Docs

- [Documentation index](doc/index.md)
- [Setup and distribution](doc/setup-and-distribution.md)
- [Architecture and security](doc/architecture-and-security.md)
- [X term mapping](doc/x-terms.md)

### License / Disclaimer / Contact

- License: [LICENSE](LICENSE)
- Disclaimer: This software is provided as-is, without warranty of any kind, express or implied.
- Contact: please open an issue in the repository that ships the release.
