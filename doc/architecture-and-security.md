# 設計とセキュリティ

確認日: 2026年6月7日

## 概要

vanilla-deck は、Electron に組み込まれた Chromium で Twitter の公式 Web 画面を複数並べるデスクトップアプリです。

独自のタイムライン取得処理や投稿処理は持ちません。各カラムは通常のブラウザ画面として `https://x.com/home` を読み込み、表示、投稿、通知などの機能は Twitter が配信する Web アプリをそのまま利用します。

そのため、Twitter の非公開 API、HTML 構造、CSS クラス名などへ強く依存する専用クライアントよりも、Twitter 側の変更の影響を受けにくい設計です。ただし、Electron に含まれる Chromium と Twitter Web の互換性が失われた場合まで動作を保証するものではありません。

## ソースコードの境界

`src/` は Electron の実行境界に合わせて分けています。

```text
src/
├── main/       Electronメインプロセス。ウィンドウ、カラム、セッション、永続化
├── preload/    メインプロセスと画面をつなぐ限定ブリッジ
├── renderer/   ツールバーとスクロールバーのHTML、CSS、画面ロジック
└── shared/     プロセス間で共有する型定義
```

Twitterを表示するカラム自体は `renderer/` の独自画面ではなく、`main/` が作成する `WebContentsView` です。カラム内で動く限定preloadだけを `preload/column.ts` に置いています。

## Twitter からどう見えるか

Twitter から見ると、vanilla-deck の各カラムは Electron に内蔵された Chromium で Twitter Web を開いているブラウザです。Twitter Web の HTML と JavaScript を Chromium が実行し、利用者の操作も通常のブラウザ通信として送信されます。独自 API クライアントや自動操作ツールとして通信するものではありません。

利用者から見た理解としては、「セッションをカラムごとに分離できる内蔵ブラウザで、公式 Twitter Web をそのまま見ている」と考えて差し支えありません。

## 「セッション分離タブ分割 Chrome」

アプリの構造は、概念的には次のようになります。

```text
vanilla-deck ウィンドウ
├── 操作用ツールバー
├── カラム1: Chromium画面 + 永続セッションA
├── カラム2: Chromium画面 + 永続セッションB
├── カラム3: Chromium画面 + 永続セッションC
└── 横スクロールバー
```

各カラムには一意な Electron partition を割り当てます。

```text
persist:vanilla-deck:column:<ランダムUUID>
```

`persist:` 付き partition は、Electron の仕様上、同じ partition 名を使う画面だけで共有される永続ブラウザセッションです。異なるカラムは異なる partition を使うため、Cookie、localStorage、キャッシュなどのブラウザ保存領域が分離されます。

これにより、カラム1をアカウントA、カラム2をアカウントBでログインした状態として同時に維持できます。

公式資料: [Electron session](https://www.electronjs.org/docs/latest/api/session#sessionfrompartitionpartition-options)

## 新規カラムの作成

完全な空セッションを追加すると毎回ログインが必要になるため、新規カラム作成時には次の処理を行います。

1. 新しい一意な永続 partition を作る
2. コピー元カラムの Cookie ストアを読み取る
3. 有効期限内の Cookie を新しい partition へ一度だけコピーする
4. コピー完了後に Twitter を読み込む
5. 以後は別セッションとして独立して動作する

コピー対象は、コピー元 partition に保存されている有効期限内の `twitter.com`、`x.com` とそのサブドメインの Cookie です。localStorage と IndexedDB はコピーしていません。

この処理はログイン状態を初期継承するためのものであり、カラム間でCookieを継続同期するものではありません。追加後に一方のカラムでログインアカウントを変更しても、他方へ自動反映されません。

公式資料: [Electron Cookies API](https://www.electronjs.org/docs/latest/api/cookies)

## 通信経路

Twitterカラムから発生する通信は、ChromiumがTwitter Webを表示するための通常の通信です。

- Twitterが配信するHTML、JavaScript、画像、動画などの取得
- Twitter Web上で利用者が行った投稿、いいね、検索などの通信
- Twitter Webが利用する関連ドメインへの通信

vanilla-deck独自の中継サーバーはありません。アプリ作者へ認証情報、Cookie、投稿内容、閲覧履歴、利用統計を送信する処理もありません。

ただし、Twitter Web自身が行う情報収集と通信には、Twitterのプライバシーポリシーが適用されます。

- [X Privacy Policy](https://x.com/en/privacy)

## ローカルに保存する情報

Electron は、セッションデータをOS上のアプリ用データ領域へ保存します。

- Cookie
- localStorage
- IndexedDB
- HTTPキャッシュ
- ネットワーク状態など、Chromiumが管理するセッション情報

vanilla-deck自身の `state.json` には次の情報を保存します。

- カラムID
- partition名
- 各カラムで最後に表示していたURL
- ページタイトル
- アクティブカラム
- カラム幅、ズーム倍率、横スクロール位置

`state.json` 自体にはCookie値やパスワードを保存しません。CookieなどはElectronのセッション保存領域が管理します。

保存先は Electron の `userData` / `sessionData` 配下です。`sessionData` は既定で `userData` を指し、Windows では通常 `%APPDATA%\vanilla-deck` 配下に保存されます。実際のパスは OS とインストール形態により異なりますが、各カラムの Cookie はその配下の `Partitions/<partition>/Network/Cookies` に保存されます。

Windows 配布版では Electron の Cookie 暗号化 Fuse を有効にし、OS の暗号化機能を使って Cookie を保存します。

ツールバーの Cookies ボタンから、全カラムの cookie を削除して各カラムを再読込できます。

公式資料: [Electron app.getPath](https://www.electronjs.org/docs/latest/api/app#appgetpathname)

## Twitter画面の権限制限

Twitterを表示する `WebContentsView` は、次の設定で作成します。

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
```

このため、Twitter Web上のJavaScriptからNode.js、ファイルシステム、任意のElectron APIを直接使用できません。

Twitterカラムのpreloadスクリプトは、タッチパッドなどの横スクロール量をメインプロセスへ渡す処理だけを行います。Node.jsやElectron APIをTwitter画面へ公開せず、TwitterのDOM解析や書き換えも行いません。アプリ操作用の限定APIは、ローカルのツールバーとスクロールバー画面だけに公開しています。

カラムのトップレベル遷移は HTTPS の `twitter.com`、`x.com` とそのサブドメインに限定します。保存状態に別のURLが書かれていても既定のTwitterホームへ戻します。新しいウィンドウの作成は拒否し、HTTPSの外部リンクだけをOSの既定ブラウザへ渡します。

カメラ、マイク、位置情報、通知などの Web 権限は既定で拒否します。カラムからメインプロセスへ送れるIPCは横スクロール通知だけで、送信元の `WebContents` と main frame を検証します。

ツールバーとスクロールバーは、許可したローカルファイルだけを返す `vanilla-deck://` protocol から読み込みます。`file://` は使用せず、CSPでスクリプトとスタイルの読込元を同一originに限定します。

Windows 配布版はASAR整合性検証を有効にし、`app.asar`以外からのアプリコード読込、`ELECTRON_RUN_AS_NODE`、`NODE_OPTIONS`、Node inspect引数を無効にします。

公式資料:

- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security/)
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron Fuses](https://www.electronjs.org/docs/tutorial/fuses)
- [Electron ASAR Integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity)

## 行わないこと

現在の実装は次の処理を行いません。

- Twitter画面のDOM操作を目的とした独自JavaScript注入
- Twitter画面のDOM解析やスクレイピング
- Twitterの非公開API呼び出し
- X APIを使ったタイムライン取得や投稿
- 自動投稿、自動いいね、自動フォロー、自動DM
- 認証、レート制限、アクセス制限の回避
- User-Agentの偽装
- 広告除去やTwitter画面のCSS改変
- アプリ作者のサーバーへのテレメトリ送信
- パスワードの独自保存

## 残るリスク

「通常のChromiumに近い」ことは、無条件に安全であることを意味しません。

- ElectronとChromiumには将来、脆弱性が見つかる可能性がある
- Twitter Web自体や読み込まれる第三者コンテンツのリスクは残る
- PCやWindowsアカウントへアクセスできる第三者は、ローカルのセッションデータへ到達できる可能性がある
- 現在のWindows配布物はコード署名されていない
- 本文書はコードレビュー結果であり、第三者機関によるセキュリティ監査ではない

配布版ではElectronを継続的に更新し、依存関係の脆弱性確認を行う必要があります。
