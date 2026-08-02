# 公開手順（新HP → luminalogicminds.jp 差し替え）

サーバー: お名前.com レンタルサーバー（cPanel / Apache）
公開先: `public_html/luminalogicminds.jp/`

---

## 0. 事前準備

### 0-1. Apps Script のスクリプトプロパティを登録

script.google.com → 「問い合わせフォーム」プロジェクト → 左の歯車 **プロジェクトの設定** → **スクリプト プロパティ**

| プロパティ | 値 |
|---|---|
| `ADMIN_PASSWORD` | 管理画面のパスワード |
| `TOKEN_SECRET` | 推測不可能な長い文字列 |

> このリポジトリは公開されている。**実際の値をこのファイルに書かないこと。**
> 値は Apps Script のスクリプトプロパティにのみ保持する。

- 登録は 2026-08-02 に実施済み
- `TOKEN_SECRET` はエディタで一時的に下記を実行して生成（実行後この関数は削除）

```js
function makeSecret() { console.log(Utilities.getUuid() + Utilities.getUuid()); }
```

この段階ではまだ何も壊れない（旧コードはこれらを参照しないため）。落ち着いて作業できる。

### 0-2. サーバー側の現状確認

ファイルマネージャーで**隠しファイルを表示**に切り替えて、以下を確認する。

- `public_html/luminalogicminds.jp/.htaccess` は存在するか？
  - **存在する場合、中身を必ず控える。** http→https リダイレクト等が入っている可能性があり、
    本リポジトリの `.htaccess` で上書きするとそれらが失われる。必要なら両方を統合すること
- `.htpasswds` に Basic 認証の設定があるか？（現行 admin が保護されている可能性）

### 0-3. バックアップ

`public_html/luminalogicminds.jp/` を丸ごとダウンロード、または cPanel でバックアップを取得。

---

## 1. 差し替え（順序厳守）

### ⚠️ 必ず「GAS を先、アップロードを後」

逆にすると、新 `admin.html` / `login.html` の POST を旧 GAS が「問い合わせ送信」として処理してしまい、
**スプレッドシートに空行が追加され、管理者宛に中身が `undefined` のメールが飛ぶ**
（旧 `doPost` は action で分岐しないため）。

> 2026-08-02、テスト中に実際に発生した。`js/config.js` を旧URLに向けたままログインを試したため、
> シートに空行が1行追加され、`【お名前】undefined ...` というメールが1通届いた。
> パスワードは記録されず、外部への誤送信も無かったが、順序を守れば起きない事象。

GAS を先にした場合は、現行サイトの管理画面が一覧を表示できなくなるだけで、
**問い合わせフォームは新旧どちらでも動き続ける**（`doPost` の既定動作が従来どおりのため）。
続けて作業すれば管理画面の停止は数分で済む。

### 手順 1-1. Apps Script を更新

1. `gas/Code.gs` の中身を全コピー → `コード.gs` に貼り付けて保存
2. **デプロイ** → **デプロイを管理** → 鉛筆アイコン → バージョン **新バージョン** → **デプロイ**

> ⚠️ 「**新しいデプロイ**」を作ると URL が変わり、HTML 側の書き換えが必要になる。
> 必ず「デプロイを管理」から**既存のデプロイを更新**すること。
> 保存しただけでは `/exec` は旧コードのまま。

### 手順 1-2. 旧ファイルを削除

新HPはフォルダ構成が変わっているため、以下は参照されない残骸になる。削除する。

- `style.css` `contact.css` `admin.css` `reskilling.css`（ルート直下の4つ。新HPでは `css/` 配下）
- `image/` フォルダ（新HPでは `assets/`）

**`error/` は削除しないこと**（カスタムエラーページ。新HPには含まれていない）。

### 手順 1-3. 新ファイルをアップロード

`public_html/luminalogicminds.jp/` へ以下をアップロード（合計約71MB）。

```
.htaccess
index.html  contact.html
reskilling.html  web-development.html          ← 事業詳細ページ（今後3ページ追加予定）
privacy-policy.html  tokusho.html
login.html  admin.html
css/     admin.css  contact.css  legal.css  style.css  service.css
js/      main.js  login.js  back-link.js  config.js  service-page.js
assets/models/   brain-top-opt.glb  engine1-opt.glb  planets-opt.glb
                 rocket-opt.glb  space-opt.glb  spine-opt.glb
                 favicon.png  logo-white.png
assets/videos/   card1.mp4 〜 card5.mp4  company-1.mp4  company-2.mp4
```

> モデルは `-opt` が付いた圧縮版のみを使う。圧縮前の `brain-top.glb` `planets.glb`
> `rocket.glb` `space.glb` `spine.glb` はコードから参照されておらず、**アップロード不要**
> （合計55MB）。

**アップロードしないもの**

| | 理由 |
|---|---|
| `serve.py` | ローカル開発用サーバー。サイトの一部ではない |
| `gas/` | Apps Script に貼るコード。Web で配信する必要はない |
| `tools/` | モデル圧縮用スクリプト。開発用 |
| `DEPLOY.md` | この手順書 |
| 圧縮前の `.glb` 5本 | `-opt` 版に置き換え済み。参照されていない（55MB） |
| `.git/` | バージョン管理データ。**公開すると全履歴（旧パスワード含む）が漏れる** |
| `.DS_Store`（4つ） | macOS が作る不可視ファイル。不要 |

---

## 2. 公開後の確認

- [ ] `https://luminalogicminds.jp/` が表示される
- [ ] ナビ（Top / About / Work / Company / Contact）が5項目で表示され、クリックで移動する
- [ ] お問い合わせフォームを送信 → スプレッドシートに記録され、自動返信メールが届く
- [ ] `contact.html` の「← トップへ戻る」でトップに戻り、**ナビが5項目のまま**であること
- [ ] `login.html` で `— ACCESS LOCKED —` が表示される
- [ ] `Restricted Access` / `ADMINISTRATOR` / `Password` の文字を **W→I→T→N→E→S→S** の順にクリック → パスワード欄が出現
- [ ] 正しいパスワードで管理画面に入れる／一覧・削除が動く
- [ ] **`https://script.google.com/macros/s/.../exec?action=getContacts` をブラウザに直接貼って、データが返らないこと** ← 今回の改修の本丸

---

## 3. うまく動かないとき

| 症状 | 原因 |
|---|---|
| ログインが「通信に失敗しました」 | デプロイを更新していない（保存だけでは反映されない） |
| ログインが「スクリプトプロパティが未設定です」 | 0-1 の登録漏れ |
| 管理画面が真っ白／一覧が出ない | 同上、またはトークン期限切れ（8時間）。再ログインする |
| サイトを更新したのに反映されない | `.htaccess` が正しく置かれているか確認。ブラウザは Ctrl+Shift+R |
| **モデル・動画を差し替えたのに反映されない** | `.htaccess` で1年キャッシュしているため。**ファイル名を変える**こと（例: `planets.glb` → `planets-v2.glb`）。同名上書きは再訪問者に最長1年間反映されない |

---

## 4. 公開後の宿題

- **動画 14.9MB の再圧縮**（カード5本＋会社紹介2本）。画面上は小さなカード面に貼られるだけなので
  解像度を落としても目立ちにくい。ffmpeg の導入が必要
- **遅延読み込み** — `planets-opt.glb` `space-opt.glb` `rocket-opt.glb` と `company-*.mp4` は
  終盤でしか使わないのに起動時に読んでいる。終盤に近づいてから読めば初回がさらに軽くなる
- **ローダーの進捗表示が偽物** — `js/main.js` 末尾の loader は乱数でカウントしており、実際の
  読み込み状況と無関係。実進捗に繋ぐと体感が改善する
- 管理画面に Basic 認証（`.htaccess`）を重ねると、さらに一段安全になる

### 済んだ軽量化（2026-08-01）

モデル 55.1MB → 13.0MB（76%削減）。初回表示は約70MB → 約27.9MB。
手法は meshopt 圧縮＋頂点量子化、`planets` はテクスチャの WebP 化。
**ポリゴンの間引きはしていない**（三角形数は元と完全一致）。再実行するなら:

```
npx @gltf-transform/cli meshopt <入力>.glb <出力>.glb --level high
python tools/glb_repack.py <入力>.glb <出力>.glb --quality 90   # テクスチャが重い場合
```
