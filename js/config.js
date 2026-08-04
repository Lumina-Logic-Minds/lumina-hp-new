/* Apps Script エンドポイントの設定
 *
 * contact.html / login.html / admin.html がここを参照する。
 * 以前は3ファイルそれぞれに同じURLを直書きしていたため、切り替え時に
 * 書き換え漏れが起きやすかった（フォームだけ旧URLに送信され続ける等）。
 *
 * ■ 切り替えは最下部の1行だけ。
 *   公開時は必ず PRODUCTION に戻すこと（DEPLOY.md 手順1-3の前に確認）。
 */

// 本番。現行サイトが使っているデプロイ。公開時はこちら。
const API_PRODUCTION =
  "https://script.google.com/macros/s/AKfycbwgA91JAODl9yXLgDDG4yN80DAnPEPypAHuJ3JRScGZ8K9_KriDWIFqjF1qgK44DoQN/exec";

// テスト用。認証対応版のコードを載せた別デプロイ（2026-08-02 作成）。
// 本番と同じスプレッドシートを見るため、削除機能の試験はダミー行で行うこと。
const API_TEST =
  "https://script.google.com/macros/s/AKfycbyb6o7tRfYkRnNctDYt3R0YXA75N7tvEr4IAFA44H4oyXVMW4C9-a1b0nF6iwhpwehF/exec";

// ↓↓↓ 切り替えはこの行だけ ↓↓↓
window.LLM_API_URL = API_PRODUCTION;
