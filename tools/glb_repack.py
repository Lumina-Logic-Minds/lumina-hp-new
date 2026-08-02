#!/usr/bin/env python3
"""GLB の埋め込みテクスチャを差し替えて詰め直すツール（開発用・サイトからは読まれない）

    python tools/glb_repack.py <入力.glb> <出力.glb> [--max-size N] [--quality Q] [--to-8bit-only]

なぜ自前で用意したか:
  @gltf-transform/cli の webp 変換は内部の libvips が「1ビット白黒PNG」を扱えず、
  planets.glb ではそれが1枚混ざっていたため全体が失敗した。該当画像を通常の8ビットに
  変換して詰め直せば、以降は既製ツールでも処理できる。

--to-8bit-only : 1ビット等の特殊なPNGだけを8ビットへ正規化し、他はそのまま（再圧縮しない）
それ以外       : 全テクスチャを WebP 化（必要なら --max-size で長辺を縮小）
"""
import argparse
import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image

GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path):
    d = Path(path).read_bytes()
    magic, _, _ = struct.unpack_from("<III", d, 0)
    if magic != GLB_MAGIC:
        raise SystemExit(f"{path} は GLB ではありません")
    off, js, binary = 12, None, b""
    while off < len(d):
        clen, ctype = struct.unpack_from("<II", d, off)
        body = d[off + 8: off + 8 + clen]
        if ctype == JSON_CHUNK:
            js = json.loads(body.decode("utf-8"))
        elif ctype == BIN_CHUNK:
            binary = body
        off += 8 + clen + ((4 - clen % 4) % 4)
    return js, binary


def write_glb(path, js, binary):
    jb = json.dumps(js, separators=(",", ":")).encode("utf-8")
    jb += b" " * ((4 - len(jb) % 4) % 4)
    bb = binary + b"\x00" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(jb) + 8 + len(bb)
    out = struct.pack("<III", GLB_MAGIC, 2, total)
    out += struct.pack("<II", len(jb), JSON_CHUNK) + jb
    out += struct.pack("<II", len(bb), BIN_CHUNK) + bb
    Path(path).write_bytes(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--max-size", type=int, default=0, help="長辺の上限px（0=変更しない）")
    ap.add_argument("--quality", type=int, default=90)
    ap.add_argument("--to-8bit-only", action="store_true")
    args = ap.parse_args()

    js, binary = read_glb(args.src)
    views = js.get("bufferViews", [])
    images = js.get("images", [])
    if not images:
        raise SystemExit("埋め込み画像がありません")

    # 画像が使う bufferView は作り直すので、いったん取り出して除外する
    img_views = {im["bufferView"] for im in images if "bufferView" in im}
    new_blobs = {}

    for i, im in enumerate(images):
        if "bufferView" not in im:
            continue
        bv = views[im["bufferView"]]
        raw = binary[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
        img = Image.open(io.BytesIO(raw))
        before = len(raw)
        mode_before, size_before = img.mode, img.size

        if args.to_8bit_only:
            if img.mode in ("1", "P", "I", "I;16", "L") and img.mode != "L":
                img = img.convert("RGB")
                buf = io.BytesIO(); img.save(buf, "PNG", optimize=True)
                new_blobs[i] = (buf.getvalue(), "image/png")
                print(f"  img{i}: {mode_before} -> RGB/PNG  {before/1048576:.2f}MB "
                      f"-> {len(new_blobs[i][0])/1048576:.2f}MB")
            else:
                new_blobs[i] = (raw, im.get("mimeType", "image/png"))
            continue

        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.mode else "RGB")
        if args.max_size and max(img.size) > args.max_size:
            r = args.max_size / max(img.size)
            img = img.resize((max(1, round(img.width * r)), max(1, round(img.height * r))),
                             Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=args.quality, method=6)
        new_blobs[i] = (buf.getvalue(), "image/webp")
        print(f"  img{i}: {size_before[0]}x{size_before[1]} {mode_before} "
              f"-> {img.width}x{img.height} WebP  "
              f"{before/1048576:.2f}MB -> {len(buf.getvalue())/1048576:.2f}MB")

    # 画像以外の bufferView を先に詰め、その後ろへ新しい画像を並べる
    out = bytearray()
    remap = {}
    for idx, bv in enumerate(views):
        if idx in img_views:
            continue
        start = bv.get("byteOffset", 0)
        data = binary[start:start + bv["byteLength"]]
        while len(out) % 4:
            out.append(0)
        remap[idx] = len(out)
        out += data

    new_views = []
    for idx, bv in enumerate(views):
        nb = dict(bv)
        if idx in remap:
            nb["byteOffset"] = remap[idx]
        new_views.append(nb)

    for i, im in enumerate(images):
        if i not in new_blobs:
            continue
        blob, mime = new_blobs[i]
        while len(out) % 4:
            out.append(0)
        nb = {"buffer": 0, "byteOffset": len(out), "byteLength": len(blob)}
        out += blob
        new_views.append(nb)
        im["bufferView"] = len(new_views) - 1
        im["mimeType"] = mime

    js["bufferViews"] = new_views
    js["buffers"] = [{"byteLength": len(out)}]

    # WebP を使う場合は拡張の宣言が要る（three.js は EXT_texture_webp に対応済み）
    if any(m == "image/webp" for _, m in new_blobs.values()):
        for key in ("extensionsUsed", "extensionsRequired"):
            lst = js.setdefault(key, [])
            if "EXT_texture_webp" not in lst:
                lst.append("EXT_texture_webp")
        for tex in js.get("textures", []):
            src = tex.get("source")
            if src is not None and new_blobs.get(src, (None, ""))[1] == "image/webp":
                tex.setdefault("extensions", {})["EXT_texture_webp"] = {"source": src}
                tex.pop("source", None)  # フォールバックPNGは持たない（容量削減が目的のため）

    write_glb(args.dst, js, bytes(out))
    a, b = Path(args.src).stat().st_size, Path(args.dst).stat().st_size
    print(f"\n{Path(args.src).name}: {a/1048576:.1f}MB -> {b/1048576:.1f}MB "
          f"（{(1-b/a)*100:.0f}% 削減）")


if __name__ == "__main__":
    main()
