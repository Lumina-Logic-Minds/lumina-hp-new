/**
 * Lumina Logic Minds — お問い合わせフォーム / 管理画面 API
 *
 * ■ このファイルは script.google.com の「問い合わせフォーム」プロジェクトに
 *   貼り付けるためのもの。サイト本体からは読み込まれない（履歴を残すため同梱）。
 *
 * ■ 【必須】スクリプト プロパティに以下2つを登録すること。
 *   コードに直接書かないのが要点（書くと共有時に漏れる）。
 *     ADMIN_PASSWORD : 管理画面のパスワード
 *     TOKEN_SECRET   : ログイントークンの署名鍵（推測不可能な長い文字列）
 *   登録場所: エディタ左の歯車「プロジェクトの設定」→ スクリプト プロパティ
 *
 * ■ 変更後は必ず「デプロイを管理」から【既存のデプロイを新バージョンで更新】する。
 *   保存しただけでは /exec は旧コードのまま。新規デプロイを作ると URL が変わるので注意。
 *
 * ■ 設計
 *   - 問い合わせ送信（doPost / action なし）は従来どおり誰でも実行可。
 *   - 管理系（getContacts / deleteContact）はトークン必須。
 *   - トークンは HMAC-SHA256 署名付きの有効期限入り文字列。サーバー側に保存しないので
 *     キャッシュ揮発の影響を受けず、偽造もできない（署名鍵を知らないため）。
 *   - doGet は情報を返さない。以前は認証なしで全件取得・削除ができた。
 */

const SHEET_ID     = '1LJOqxDqALoQgdbU5kWcWJSpsG7DzduXDIE8AKzbf1jc';
const SHEET_NAME   = 'Contacts';
const NOTIFY_TO    = 'contact@luminalogicminds.jp';
const SENDER_NAME  = '株式会社 Lumina Logic Minds';

const TOKEN_TTL_MS    = 8 * 60 * 60 * 1000; // ログインの有効期間: 8時間
const MAX_LOGIN_FAILS = 8;                  // 10分あたりの失敗許容回数

/* ========== 共通 ========== */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function prop_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('スクリプトプロパティ「' + key + '」が未設定です');
  return v;
}

function sheet_() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
}

/* ========== トークン ========== */

function sign_(payload) {
  const raw = Utilities.computeHmacSha256Signature(payload, prop_('TOKEN_SECRET'));
  return Utilities.base64EncodeWebSafe(raw);
}

function issueToken_() {
  const payload = String(Date.now() + TOKEN_TTL_MS); // 有効期限そのものが中身
  return Utilities.base64EncodeWebSafe(payload) + '.' + sign_(payload);
}

function validToken_(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  let payload;
  try {
    payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  } catch (err) {
    return false;
  }
  if (sign_(payload) !== parts[1]) return false; // 署名不一致 = 偽造・改ざん
  return Number(payload) > Date.now();           // 期限切れ
}

/* ========== ログイン試行の制限 ==========
   GAS からは接続元 IP を取得できないため、プロジェクト全体で数える。
   総当たり攻撃は防げるが、攻撃を受けている間は正規の管理者も10分待たされる。 */

function loginBlocked_() {
  const n = CacheService.getScriptCache().get('loginfails');
  return !!n && Number(n) >= MAX_LOGIN_FAILS;
}

function noteLoginFail_() {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('loginfails') || 0) + 1;
  cache.put('loginfails', String(n), 600); // 10分で解除
}

/* ========== エンドポイント ========== */

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    // action を明示的に振り分ける。未知の action を問い合わせ扱いにしてしまうと、
    // 綴り間違いや想定外の POST でも「お問い合わせを受信しました」メールが飛び、
    // 誤解を招く。該当しないものは何もせずエラーを返す。
    const action = body.action || 'contact'; // action を送らない旧フォーム互換
    switch (action) {
      case 'contact':       return handleContact_(body);
      case 'login':         return handleLogin_(body);
      case 'getContacts':   return handleGetContacts_(body);
      case 'deleteContact': return handleDeleteContact_(body);
      default:              return json_({ success: false, error: 'unknown action' });
    }
  } catch (error) {
    return json_({ success: false, error: error.toString() });
  }
}

/** 以前はここで全件取得・削除ができた。認証を持たせられないので何も返さない。 */
function doGet() {
  return json_({ success: false, error: 'not available' });
}

/* ========== 問い合わせ送信（従来どおり・認証不要） ========== */

function handleContact_(body) {
  // 必須項目が欠けた送信は、記録もメール送信もしない。
  // 管理系の POST が誤ってここへ流れ込んでも「【お名前】undefined」のような
  // 紛らわしい通知メールが飛ばないようにするための歯止め。
  // （2026-08-02、旧デプロイにログインを送ってしまい実際に発生したため追加）
  const data = {
    name:    String(body.name    || '').trim(),
    company: String(body.company || '').trim(),
    email:   String(body.email   || '').trim(),
    phone:   String(body.phone   || '').trim(),
    subject: String(body.subject || '').trim(),
    message: String(body.message || '').trim()
  };
  if (!data.name || !data.email || !data.message || data.email.indexOf('@') === -1) {
    return json_({ success: false, error: '必須項目が入力されていません' });
  }
  if (!data.subject) data.subject = '（件名なし）';

  try {
    sheet_().appendRow([
      new Date(),
      data.name,
      data.company,
      data.email,
      data.phone,
      data.subject,
      data.message
    ]);
  } catch (sheetError) {
    console.error('シート保存エラー:', sheetError);
  }

  GmailApp.sendEmail(NOTIFY_TO, `【お問い合わせ】${data.subject}`, `
ホームページからお問い合わせを受信しました。

【お名前】${data.name}
【会社名】${data.company || 'なし'}
【メール】${data.email}
【電話番号】${data.phone || 'なし'}
【件名】${data.subject}

【内容】
${data.message}
  `, { from: NOTIFY_TO, name: SENDER_NAME });

  GmailApp.sendEmail(data.email, '【Lumina Logic Minds】お問い合わせありがとうございます', `${data.name} 様

この度はお問い合わせいただき、誠にありがとうございます。
以下の内容で承りました。

--------------------
お名前: ${data.name}
会社名: ${data.company || 'なし'}
メール: ${data.email}
電話番号: ${data.phone || 'なし'}
件名: ${data.subject}
内容:
${data.message}
--------------------

内容を確認次第、担当者よりご連絡させていただきます。

株式会社 Lumina Logic Minds
  `, { from: NOTIFY_TO, name: SENDER_NAME });

  return json_({ success: true });
}

/* ========== 管理系（トークン必須） ========== */

function handleLogin_(body) {
  if (loginBlocked_()) {
    return json_({ success: false, error: '試行回数が多すぎます。10分ほどおいて再度お試しください。' });
  }
  if (String(body.password || '') !== prop_('ADMIN_PASSWORD')) {
    noteLoginFail_();
    return json_({ success: false, error: 'パスワードが違います' });
  }
  return json_({ success: true, token: issueToken_() });
}

function handleGetContacts_(body) {
  if (!validToken_(body.token)) return json_({ success: false, error: 'unauthorized' });

  const rows = sheet_().getDataRange().getValues();
  const contacts = rows.slice(1).map(function (row, i) {
    return {
      id: i + 2,            // 実際のシート行番号（1行目はヘッダー）
      timestamp: row[0],
      name: row[1],
      company: row[2],
      email: row[3],
      phone: row[4],
      subject: row[5],
      message: row[6]
    };
  });
  return json_({ success: true, contacts: contacts });
}

function handleDeleteContact_(body) {
  if (!validToken_(body.token)) return json_({ success: false, error: 'unauthorized' });

  const sh = sheet_();
  const row = Number(body.id);
  if (!(row >= 2 && row <= sh.getLastRow())) {
    return json_({ success: false, error: '対象が見つかりません' });
  }

  // 一覧を表示したあとに別の行が消えていると行番号がずれ、無関係の問い合わせを
  // 消してしまう。画面に出ていたメールアドレスと突き合わせ、一致した場合のみ削除する。
  const email = String(sh.getRange(row, 4).getValue() || '');
  if (String(body.email || '') !== email) {
    return json_({ success: false, error: '一覧が古くなっています。再読み込みしてください。' });
  }

  sh.deleteRow(row);
  return json_({ success: true });
}
