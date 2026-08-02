/* 下層ページ -> トップページ の「戻り先」受け渡し。
 *
 * 以前は index.html?back=xxx というクエリで渡していたが、ブラウザは
 * /index.html と /index.html?back=xxx を別々のキャッシュエントリとして持つ。
 * 開発中にリロードするのは前者だけなので、リンクからしか到達しない後者は
 * 編集前の HTML を返し続ける（= 戻ると古い画面が出る）。ハードリロードでも
 * 直せない。トップページの URL を 1 種類に保つため sessionStorage で渡す。
 *
 * 使い方: <a href="index.html" data-back="contact">← トップへ戻る</a>
 * キーは js/main.js の RETURN_SCROLL に対応する。
 */
document.querySelectorAll("a[data-back]").forEach((a) => {
  a.addEventListener("click", () => {
    // 同期書き込みなので、この直後の画面遷移より先に必ず確定する
    try { sessionStorage.setItem("llm:back", a.dataset.back); } catch (e) {}
  });
});
