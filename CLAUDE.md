# 株式会社 Lumina Logic Minds コーポレートサイト（新HP）

このファイルは新しいセッションで自動的に読み込まれる引き継ぎ書です。
**作業を始める前に必ず全体を読んでください。** 特に「絶対に守ること」の節は、
過去に実際に事故が起きた内容です。

---

## 1. これは何か

既存の https://luminalogicminds.jp/ を差し替えるための新コーポレートサイト。
ビルドツールなしの素の HTML / CSS / JavaScript。Three.js r160 を CDN から読み込む。
バックエンドは Google Apps Script が1つだけ（問い合わせフォームと管理画面API）。

| | |
|---|---|
| GitHub | https://github.com/Lumina-Logic-Minds/lumina-hp-new （**Public**） |
| 確認用URL | https://lumina-logic-minds.github.io/lumina-hp-new/ |
| 本番 | https://luminalogicminds.jp/ （**まだ旧HPのまま**） |
| サーバー | お名前.com レンタルサーバー（cPanel / Apache） |

### 現在地（2026-08-02）

サイトは完成。PC・モバイルとも調整済み。GitHub へ反映済み。
**本番はまだ差し替えていない。自動デプロイは意図的に無効化してある。**

---

## 2. 絶対に守ること

### 2-1. 管理者パスワードの話を蒸し返さない

公開リポジトリの履歴に旧 `login.html` が残っており、そこに管理者パスワードが平文で
読める状態にある。**この事実は既に2度伝えたうえで、ユーザーは「変更しない」と判断済み。**
再度の指摘は不要。

### 2-2. 公開時は「Apps Script が先、デプロイが後」

順序を逆にすると、新しい HTML の POST を旧 Apps Script が「問い合わせ送信」として
処理してしまい、スプレッドシートに空行が追加され `【お名前】undefined` という
メールが飛ぶ。**2026-08-02 のテスト中に実際に発生した。**

### 2-3. `login.html` の `Password` ラベルを隠さない

隠しコマンド「WITNESS」の `W` は、ページ内でそのラベルにしか存在しない。
隠すとコマンドが成立しなくなる。CSS で `display:none` にしないこと。

### 2-4. サーバー上で直接ファイルを編集しない

以前はお名前.com のファイルマネージャーで直接編集する運用だった。
自動デプロイ有効後にそれをやると、**次のプッシュで上書きされて消える。**
必ず手元を直してプッシュすること。

### 2-5. モデル・動画を差し替えるときはファイル名を変える

`.htaccess` で1年間キャッシュする設定にしている。同名で上書きすると
再訪問者に最長1年間反映されない。`planets-opt.glb` → `planets-v2.glb` のように改名する。

---

## 3. 文章のトーン（推敲で何度もやり直しになった点）

**広告コピーの型を嫌う。** 以下は明確に却下された。

- 「〜ではない。〜だ。」の反転構文
- 作り話めいた語り（「そう言われた」「見積書を開く前に」など）
- 無理に入れる読点
- 「3つの原則」のような定型の見出し

**採用されたのは、平坦な事実の断定。** 少し意外だが力んでいないもの。

```
AIが書き、人が決める                    （Web開発ページ）
導入より定着のほうが難しい              （DX推進ページ）
開発の値段は技術ではなく時間で決まる    （Web開発ページ Insight）
```

コピーを提案するときは、この register に寄せること。

---

## 4. ファイル構成

### 配信されるもの

```
index.html              トップ。全画面 WebGL の1枚もののスクロール体験
contact.html            お問い合わせフォーム
login.html / admin.html 管理者ログイン・問い合わせ管理
privacy-policy.html / tokusho.html
reskilling.html         事業詳細（既存・完成済み。デザインの原型）
web-development.html / dx.html / data-ml.html / gpu.html   事業詳細（新規4本）
css/  style.css(トップ) admin.css contact.css legal.css service.css(事業詳細4本で共有)
js/   main.js(トップの3D 2200行) login.js config.js back-link.js service-page.js
assets/models/*-opt.glb   assets/videos/*-opt.mp4
.htaccess               キャッシュ制御・MIME・圧縮
```

### 配信されないもの（リポジトリにはあるが deploy.yml で除外）

```
serve.py            開発用サーバー（後述）
tools/glb_repack.py GLBのテクスチャ圧縮ツール
gas/Code.gs         Apps Script に貼るコード
DEPLOY.md           公開手順書
CLAUDE.md           このファイル
圧縮前の .glb / .mp4
```

---

## 5. 開発の進め方

### ローカルサーバー

```
cd C:\Users\MDL\lumina-hp-new
python serve.py
http://localhost:8123/
```

**`python -m http.server` は使わないこと。** `Cache-Control` を返さないため、
ブラウザが古いHTMLを配信し続ける。この問題の切り分けに実際に1時間以上を費やした。
`serve.py` は `no-store` を付け、二重起動も検出する。

### トップページの構造

スクロール量 `0 〜 7.4`（`SCROLL_MAX`）を1本のタイムラインとして6つの3Dシーンが連続変化する。
DOM のスクロールではなくホイール/タッチを拾った独自スクロール。

| 範囲 | セクション |
|---|---|
| 0 〜 1.0 | TOP（ガラスのリング＋脳ロゴ、森へ） |
| 1.88 〜 3.65 | Work（背骨＋事業カード4枚が周回） |
| 3.28 〜 5.5 | Finale（部屋が生成、GPUのヒーローカード） |
| 5.0 〜 6.7 | Underwater（水面、ワードマーク） |
| 6.7 〜 7.4 | Company（ヘックスグリッドに会社紹介動画） |

`5.8 〜 6.3` でワードマークの L / L / M を各5回順にクリックすると、
ロケット演出を経て `login.html` へ遷移する隠し導線がある。

### レスポンシブ

3Dは画面比率から算出した倍率で縮小している。固定のブレークポイントではない
（820x1180 のような縦長タブレットを取りこぼすため）。調整用の定数は `js/main.js` 冒頭。

```js
FIT_GAIN    // Workのカードと背骨、Finaleのヒーローカード
WORD_GAIN   // 水中のワードマーク
HEX_GAIN    // 会社紹介動画のヘックスグリッド
HEX_NUDGE_X / HEX_NUDGE_Y   // グリッドの位置微調整
```

**PCの見た目は変更しないこと。** これらの倍率は縦長画面でのみ1未満になる。

---

## 6. Apps Script（バックエンド）

`gas/Code.gs` が本体。**リポジトリのファイルを直接動かすのではなく、
script.google.com のプロジェクトに貼り付けて使う。**

- パスワードと署名鍵はコードに書かず、スクリプトプロパティに置く
  （`ADMIN_PASSWORD` / `TOKEN_SECRET`）
- ログインはサーバー側で照合し、HMAC署名付き・8時間有効のトークンを発行する
- `doGet` は無効化済み。以前は認証なしで全件取得・削除ができた
- `doPost` は `action` で振り分ける。**未知の action は拒否**して、
  誤って問い合わせメールが飛ばないようにしてある

接続先の切り替えは `js/config.js` の最終行1箇所。

```js
window.LLM_API_URL = API_TEST;   // ← 現在。公開時は API_PRODUCTION に変える
```

---

## 7. デプロイ

`.github/workflows/deploy.yml`。**現在は手動実行のみ**（`push:` をコメントアウト）。

転送前に3つの検査が走り、1つでも失敗すれば転送されない。

1. `config.js` が本番を向いているか
2. HTML が参照する css/js/画像が実在するか
3. JavaScript の構文

FTPアカウント・Secrets・接続テストはすべて設定・検証済み（詳細は `DEPLOY.md`）。

---

## 8. 残作業

### 公開当日（手順の詳細は `DEPLOY.md`）

1. Apps Script の本番デプロイを新バージョンに更新 ← **ユーザー操作が必要**
2. `js/config.js` を `API_PRODUCTION` に変更
3. `deploy.yml` の `push:` 3行のコメントを外す
4. コミットしてプッシュ

### 公開直後

- サーバー上の旧ファイルを削除（ルート直下の `style.css` `contact.css` `admin.css`
  `reskilling.css` と `image/`）。**`error/` は残す**
- Apps Script のテスト用デプロイを削除

### 未着手の改善（急ぎではない）

- **終盤アセットの遅延読み込み** — `planets-opt.glb`(5.4MB) `space-opt.glb` `rocket-opt.glb`
  `company-*.mp4` は終盤でしか使わないのに起動時に読んでいる。効果が最も大きい
- **ローダーの進捗表示が偽物** — `js/main.js` 末尾のローダーは乱数でカウントしており
  実際の読み込みと無関係。「100%なのにまだ出ない」が起こり得る
- 管理画面への Basic 認証の追加

### 未検証

- お問い合わせフォームの**送信成功パス**。送るとチーム宛にメールが飛ぶため保留中。
  検証するなら `gas/Code.gs` の `NOTIFY_TO` を一時的に個人アドレスへ変え、
  テスト用デプロイのみ更新すること
