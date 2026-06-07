# セットアップと配布

確認日: 2026年6月7日

## 開発環境の前提

開発対象は Windows です。Windows 10 または Windows 11 上で、次のツールを使用します。

- Node.js 22.12.0 以上、23.0.0 未満
- Git for Windows

ソースコードも `node_modules/` も Windows ファイルシステム上に置き、PowerShell から操作します。
2026年6月7日時点では Node.js 22.22.3 で動作確認しています。

## 初回セットアップ

1. リポジトリを取得します。

   ```powershell
   git clone <repository-url>
   cd vanilla-deck
   ```

2. 依存関係と開発用 Electron を用意します。

   ```powershell
   npm run setup
   ```

3. 起動します。

   ```powershell
   npm start
   ```

`npm run setup` は `package-lock.json` に従って依存関係を入れた後、Windows 用 Electron バイナリを用意します。`npm start` と `npm run dev` は、開発用 Electron を `tmp` に複製して Fuse を設定し、そのコピーで TypeScript ビルド済みのアプリを起動します。

## 起動時の補足

- 画面が小さすぎる場合は `$env:VANILLA_DECK_ZOOM_FACTOR = '1.25'; npm start` のようにズーム倍率を上げられます。
- DevTools を開くには F12 を押します。

## Windows 向け配布物

PowerShell で Windows x64 向けのポータブル版を作成します。

```powershell
npm run package:win
```

生成後、次のファイルを起動して確認します。

```text
out\vanilla-deck-win32-x64\vanilla-deck.exe
```

`package:win` は配布版 EXE に Fuse を設定します。Cookie 暗号化と不要な Node 実行入口の無効化は配布版で有効にし、ASAR 整合性検証と `OnlyLoadAppFromAsar` も配布版だけで有効にします。未指定の新しい Fuse が追加された場合は package を失敗させます。

これは動作確認用の未署名ビルドです。

## GitHub Releases で配布する場合

公開配布は、タグを打って GitHub Releases に ZIP を添付する運用を想定しています。

1. リリース用タグを切ります。
2. GitHub Actions が Windows 向けビルドを作成します。
3. 生成した ZIP を Release の添付ファイルとして公開します。

この方式では、利用者は ZIP を展開して `vanilla-deck.exe` を起動します。インストーラーではないため、アプリの更新は新しい Release を配布する運用になります。

## `scripts/` ディレクトリ

`scripts/` には、ビルドや配布を補助するための小さな Node.js スクリプトを置いています。

- `generate-icons.js`: Windows 用の `.ico` と `.png` を生成する
- `clean-build.js`: build 前に古い `dist/` を削除する
- `harden-electron.js`: 開発用または配布用の Electron Fuse を検証・設定する

アプリ本体の機能ではなく、開発・配布の手順を短くするための補助コードです。
