# 仕様

状態: Draft

このドキュメントは `vanilla-deck` の作業中仕様です。
プロジェクトの形が固まるまでは小さく保ち、読みづらくなってから必要な単位で分割します。

## プロダクト

`vanilla-deck` は、現在は無くなった TweetDeck に近い体験を復活させるための、Twitter 専用クライアントを目指す。

この仕様では、対象サービスを「Twitter(自称X)」という立場で扱い、以降は基本的に `Twitter` と表記する。

主眼は Twitter の API を使った独自実装ではなく、公式 Web 版をできるだけそのまま表示しながら、複数アカウント・複数カラムを同時に扱えるようにすること。

アプリ側で TweetDeck 風の細かい UI を再実装するのではなく、Twitter 側の標準 UI を「バニラに近い状態」で表示する。

## ユーザー

複数の Twitter アカウントを同時に運用したいユーザー。

例:

- 個人用、仕事用、趣味用など複数アカウントを切り替えて使う人。
- 複数アカウントの画面を並べて監視したい人。
- 投稿アカウントの取り違えを避けたい人。

## コア動作

v1 では、1つのデスクトップアプリウィンドウ内に複数の表示領域を並べ、それぞれを独立したブラウザセッションとして扱えることを最重要要件にする。

この表示領域は「カラム」と呼ぶ。ただし、ここでのカラムは TweetDeck のホーム、通知、検索などに特化した機能単位ではなく、縦方向に分割されたブラウザタブ相当の表示単位を指す。ホーム、通知、検索などの切り替えは、基本的に各カラム内の Twitter 標準 UI に任せる。

最小ワークフロー:

1. ユーザーがカラムを追加する。
2. 各カラムに独立した Twitter セッションを割り当てる。
3. 各カラムで別々のアカウントにログインできる。
4. タイムライン閲覧、更新、投稿操作が、そのカラムに割り当てられたアカウントのまま完結する。
5. 最後に操作したアカウントへ投稿先が意図せず寄る挙動を避ける。

v1 の UI 方針:

- アプリ側の機能はカラムの増減と順番変更を中心にする。
- アカウント選択 UI は作り込まない。
- 新しいカラムを追加したときは、現在の最新セッションの Cookie をコピーしてから、別セッションとして分離する。
- Twitter の左ナビゲーション、ホーム、通知、検索、投稿画面などは、可能な限り公式 Web UI のまま扱う。
- 通信や投稿に関わる独自 UI は基本的に持たない。この「公式 Web UI を素のまま扱う」方針を `vanilla` の意味とする。
- 必要に応じて CSS 調整で表示密度を上げる余地は残すが、v1 では必須要件にしない。

既存ブラウザのタブ分割やコンテナ分割では、同一画面内の複数アカウント同時利用時にセッションや投稿アカウントの扱いが崩れることがあるため、アプリ側で明示的にセッションを分離する。

## 技術方針

デスクトップアプリとして作る方向を第一候補にする。

第一候補:

- Electron
- `WebContentsView`
- Electron の `session` / `partition` によるセッション分離

理由:

- Electron には複数の Web コンテンツ表示を1つのウィンドウに追加する `WebContentsView` がある。
- Electron の `session.fromPartition()` は partition ごとに `Session` を作成でき、`persist:` 付きなら永続セッション、無しならインメモリセッションとして扱える。
- `BrowserView` は非推奨化されているため、新規実装では `WebContentsView` を優先する。

比較候補:

- Tauri: 軽量だが、OS 標準 WebView 依存になるため、Twitter のように Web 互換性変化が激しいサイトでは検証負荷が高そう。
- Chrome/Firefox 拡張: 普段使いのブラウザに近いが、1ウィンドウ内で複数の完全独立セッションを安定して扱う要件に対して不安が残る。
- Playwright 等の自動操作系: 検証やプロトタイプには使えるが、常用クライアントの UI 基盤としては重い。

技術検証では、まず Electron で2カラムを作り、各カラムを異なる永続 partition に紐づけて、別アカウントでログイン・更新・投稿先維持ができるか確認する。

追加で、既存の Open-Deck は公式 Twitter フロントエンドを呼び出す Chrome 拡張として近い方向性を持つ。`vanilla-deck` はブラウザ拡張ではなく、カラムごとのセッション分離を主目的にする。

Windows で動作することは必須要件とする。Electron のクロスプラットフォーム性を前提に、まず Windows 対応を外さない構成で検証する。

セキュリティ要件:

- TwitterカラムのトップレベルURLはHTTPSの `twitter.com`、`x.com` とそのサブドメインに限定する。
- remote contentではNode integrationを無効にし、context isolationとsandboxを有効にする。
- Web権限は既定拒否とし、必要になった権限だけをorigin単位で追加する。
- IPCはchannel、引数、送信元 `WebContents`、main frameを検証する。
- ローカルUIは `file://` を使わず、限定したcustom protocolとCSPで配信する。
- Windows配布版はCookie暗号化、ASAR整合性検証、不要なNode実行入口の無効化を行う。
- 公開配布物はコード署名する。

参考:

- Electron `WebContentsView`: https://www.electronjs.org/docs/latest/api/web-contents-view
- Electron `session.fromPartition()`: https://www.electronjs.org/docs/latest/api/session#sessionfrompartitionpartition-options
- Electron `BrowserView` 非推奨: https://www.electronjs.org/docs/latest/api/browser-view
- Electron `BrowserView` から `WebContentsView` への移行: https://www.electronjs.org/blog/migrate-to-webcontentsview
- Open-Deck Chrome Web Store: https://chromewebstore.google.com/detail/open-deck/gmkadaeibmhchpimnfplodelecmogdic
- Open-Deck GitHub: https://github.com/kawa-nobu/Open-Deck

## 決定事項

- 2026-06-05: 最初は仕様書を最小構成にする。内容が自然に分割を必要とするまで、この1ファイルで管理する。
- 2026-06-05: API ベースの Twitter クライアントではなく、公式 Web 版を埋め込む専用ブラウザ型クライアントを基本方針にする。
- 2026-06-05: 技術候補は Electron + WebContentsView + partition 分離を第一候補にする。ただし、実装前に最小プロトタイプで検証する。
- 2026-06-05: v1 ではアカウント管理 UI を作り込まず、カラム単位のセッション分離とカラム増減を中心にする。
- 2026-06-05: サービス名は仕様上 `Twitter` で統一する。立場としては Twitter(自称X) とする。
- 2026-06-05: 通信や投稿に関わる独自 UI は基本的に持たず、公式 Web UI をバニラに近い状態で表示する。
- 2026-06-05: カラムのレイアウト設定とセッション情報は永続化する。
- 2026-06-05: Windows で動作することを必須要件にする。
- 2026-06-06: 新規カラムには直前のカラムの Cookie を複製し、ログイン状態を引き継いだ独立セッションを作る。
- 2026-06-07: Cookie複製はTwitter/Xドメインに限定し、remote contentの権限、遷移先、IPC送信元を既定拒否で制御する。
- 2026-06-07: 配布版はASARとElectron Fuseで保護する。