#!/usr/bin/env python3
"""開発用ローカルサーバー（ブラウザキャッシュ無効）

    python serve.py            # http://localhost:8123/
    python serve.py 3000       # ポート指定

`python -m http.server` は Cache-Control も ETag も返さないため、ブラウザは
ヒューリスティックキャッシュ（= Last-Modified からの経過時間の 10%）を適用し、
その間サーバーに問い合わせずキャッシュから配信する。さらに /index.html と
/index.html?back=contact は別エントリ扱いなので、リロードしている前者だけが
更新され、リンクからしか到達しない後者は編集前の HTML を返し続ける。
「編集が反映されない」「ページ遷移して戻ると古い画面が出る」の原因。

このサーバーは全レスポンスに no-store を付けて、それを防ぐ。
"""
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123


class NoCacheHandler(SimpleHTTPRequestHandler):
    # keep-alive: .glb / .mp4 を多数取りに行くので接続を使い回す
    protocol_version = "HTTP/1.1"

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".mp4": "video/mp4",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_header(self, keyword, value):
        # Last-Modified を返さない = ヒューリスティックキャッシュの根拠を与えない
        if keyword.lower() == "last-modified":
            return
        super().send_header(keyword, value)

    def log_message(self, fmt, *args):
        # 404 だけ出す（.glb / .mp4 の大量ログを抑える）
        if args and str(args[1]).startswith("4"):
            super().log_message(fmt, *args)


class DevServer(ThreadingHTTPServer):
    # localhost は Windows でまず ::1 (IPv6) に解決される。IPv4 だけで待ち受けると
    # ブラウザのリクエストが届かない / 別プロセスがそちらを掴んだままになるので、
    # デュアルスタック (:: で IPv4 も受ける) で待ち受ける。
    address_family = socket.AF_INET6 if socket.has_ipv6 else socket.AF_INET

    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


def port_in_use(port):
    """既に誰かが待ち受けていないか実際に繋いで確かめる。

    Windows は SO_REUSEADDR やアドレス違い (0.0.0.0 と 127.0.0.1) で二重 bind が
    成立してしまい、エラーも出ないまま古いサーバーが応答し続ける。bind の成否では
    検出できないので、接続できるかどうかで判定する。
    """
    for family, addr in ((socket.AF_INET6, "::1"), (socket.AF_INET, "127.0.0.1")):
        if family == socket.AF_INET6 and not socket.has_ipv6:
            continue
        try:
            with socket.socket(family, socket.SOCK_STREAM) as s:
                s.settimeout(0.4)
                if s.connect_ex((addr, port)) == 0:
                    return addr
        except OSError:
            pass
    return None


if __name__ == "__main__":
    busy = port_in_use(PORT)
    if busy:
        print(f"\n[!] ポート {PORT} は既に使用中です（{busy}:{PORT} が応答しました）。")
        print("    古いサーバー（python -m http.server など）が動いたままです。")
        print("    そのまま起動すると二重待ち受けになり、古い方が応答し続けます。")
        print("    そのターミナルで Ctrl+C するか、PowerShell で次を実行してください:\n")
        print("    Get-NetTCPConnection -LocalPort " + str(PORT) + " -State Listen | "
              "Select-Object -ExpandProperty OwningProcess -Unique | "
              "ForEach-Object { Stop-Process -Id $_ -Force }\n")
        sys.exit(1)

    with DevServer(("", PORT), NoCacheHandler) as httpd:
        print(f"serving {ROOT}")
        print(f"no-store 有効  ->  http://localhost:{PORT}/")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nbye")
