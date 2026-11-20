#!/usr/bin/env python3
"""Build exercises.json from the two checked after-class solution docx files.

OMML (Office Math) is walked structurally and converted to TeX plus a
handbook-style plaintext `raw` fallback. document.xml is never dumped as
flat text, because that glues subscripts and superscripts into the wrong
order.

Sources (only these editions):
  atmos_kehou_checked_2026-10-03.docx  刘红年等《大气科学概论》第3版
  env_kehou_checked_2026-11-11.docx    方淑荣、姚红《环境科学概论》第2版
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
M = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PKG = "{http://schemas.openxmlformats.org/package/2006/relationships}"

ROOT = Path(__file__).resolve().parents[1]
UPLOADS = Path("/home/ubuntu/.cursor/projects/agent-repos-891-mcq/uploads")
ATMOS_DOC = UPLOADS / "atmos_kehou_checked_2026-10-03_62eb.docx"
ENV_DOC = UPLOADS / "env_kehou_checked_2026-11-11_0423.docx"
OUT_JSON = ROOT / "exercises.json"
IMG_OUT = ROOT / "assets" / "kehou-atmos-4-9.png"

FUNCS = {
    "sin": r"\sin",
    "cos": r"\cos",
    "tan": r"\tan",
    "ln": r"\ln",
    "log": r"\log",
    "lg": r"\lg",
    "exp": r"\exp",
}
GREEK = {
    "Δ": r"\Delta",
    "Ω": r"\Omega",
    "α": r"\alpha",
    "β": r"\beta",
    "γ": r"\gamma",
    "ε": r"\varepsilon",
    "θ": r"\theta",
    "κ": r"\kappa",
    "λ": r"\lambda",
    "μ": r"\mu",
    "ν": r"\nu",
    "π": r"\pi",
    "ρ": r"\rho",
    "σ": r"\sigma",
    "τ": r"\tau",
    "φ": r"\varphi",
    "ω": r"\omega",
}
SYMS = {
    "≈": r"\approx",
    "×": r"\times",
    "−": "-",
    "·": r"\cdot",
    "≥": r"\ge",
    "≤": r"\le",
    "→": r"\rightarrow",
    "⇒": r"\Rightarrow",
    "∂": r"\partial",
    "∝": r"\propto",
    "∫": r"\int",
}
TEX_ESC = {
    "%": r"\%",
    "#": r"\#",
    "_": r"\_",
    "&": r"\&",
    "{": r"\{",
    "}": r"\}",
    "$": r"\$",
}
CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}

WARNINGS: list[str] = []


class Tok:
    def __init__(self, tex: str, raw: str):
        self.tex = tex
        self.raw = raw


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def append_tex(buf: str, piece: str) -> str:
    if buf and piece and re.search(r"\\[A-Za-z]+$", buf) and piece[0].isalpha():
        buf += " "
    return buf + piece


def esc_text(s: str) -> str:
    return (
        s.replace("\\", r"\textbackslash{}")
        .replace("{", r"\{")
        .replace("}", r"\}")
        .replace("%", r"\%")
        .replace("$", r"\$")
        .replace("&", r"\&")
        .replace("#", r"\#")
        .replace("_", r"\_")
        .replace("^", r"\textasciicircum{}")
    )


def is_text_char(ch: str) -> bool:
    o = ord(ch)
    if 0x4E00 <= o <= 0x9FFF:
        return True
    return ch in "，；。、：！？—～·"


def join_toks(toks: list[Tok]) -> tuple[str, str]:
    merged: list[Tok] = []
    for t in toks:
        if (
            merged
            and merged[-1].tex.startswith(r"\text{")
            and merged[-1].tex.endswith("}")
            and t.tex.startswith(r"\text{")
            and t.tex.endswith("}")
        ):
            prev = merged[-1]
            merged[-1] = Tok(r"\text{" + prev.tex[6:-1] + t.tex[6:-1] + "}", prev.raw + t.raw)
        else:
            merged.append(t)
    tex = ""
    raw = ""
    for t in merged:
        tex = append_tex(tex, t.tex)
        if raw and t.raw and raw[-1].isalnum() and t.raw[0].isalpha() and t.tex.startswith("\\"):
            raw += " "
        raw += t.raw
    return tex, raw


def conv_run(text: str, plain: bool) -> Tok:
    text = text.replace("\xa0", " ").replace("\u200b", "")
    if text == "":
        return Tok("", "")
    stripped = text.strip()
    if stripped == "":
        return Tok(r"\ ", " ")
    if stripped in FUNCS and re.fullmatch(r"[A-Za-z]+", stripped):
        return Tok(FUNCS[stripped], stripped)
    if plain and re.fullmatch(r"[A-Za-z0-9 ]+", text or ""):
        return Tok(r"\mathrm{" + text + "}", text)
    tex = ""
    raw = ""
    buf: list[str] = []

    def flush() -> None:
        nonlocal tex, raw
        if not buf:
            return
        s = "".join(buf)
        buf.clear()
        tex = append_tex(tex, r"\text{" + esc_text(s) + "}")
        raw += s

    for ch in text:
        if is_text_char(ch):
            buf.append(ch)
            continue
        flush()
        if ch == "∘":
            if tex.endswith("\\ "):
                tex = tex[:-2]
                if raw.endswith(" "):
                    raw = raw[:-1]
            tex = append_tex(tex, r"^{\circ}")
            raw += "°"
            continue
        if ch == " ":
            tex = append_tex(tex, r"\ ")
            raw += " "
            continue
        if ch == "\\":
            tex = append_tex(tex, r"\backslash ")
            raw += "\\"
            continue
        if ch in GREEK:
            tex = append_tex(tex, GREEK[ch])
            raw += ch
            continue
        if ch in SYMS:
            tex = append_tex(tex, SYMS[ch])
            raw += ch
            continue
        if ch in TEX_ESC:
            tex = append_tex(tex, TEX_ESC[ch])
            raw += ch
            continue
        tex = append_tex(tex, ch)
        raw += ch
    flush()
    return Tok(tex, raw)


def find_child(el: ET.Element, name: str) -> ET.Element | None:
    for c in el:
        if c.tag == M + name:
            return c
    return None


def part_of(el: ET.Element, name: str) -> ET.Element:
    found = find_child(el, name)
    if found is None:
        return ET.Element(M + name)
    return found


def run_text(el: ET.Element) -> str:
    return "".join((t.text or "") for t in el.findall(M + "t"))


def run_plain(el: ET.Element) -> bool:
    rpr = el.find(M + "rPr")
    if rpr is None:
        return False
    sty = rpr.find(M + "sty")
    return sty is not None and sty.get(M + "val") == "p"


def conv_children(el: ET.Element) -> list[Tok]:
    out: list[Tok] = []
    kids = list(el)
    i = 0
    while i < len(kids):
        c = kids[i]
        name = local(c.tag)
        if c.tag == M + "r":
            text = run_text(c)
            nxt = kids[i + 1] if i + 1 < len(kids) else None
            if text == "\\" and nxt is not None and nxt.tag == M + "r" and run_text(nxt) == "%":
                out.append(Tok(r"\%", "%"))
                i += 2
                continue
            if text.strip() == "∘":
                if out and out[-1].tex == r"\ ":
                    out.pop()
                out.append(Tok(r"^{\circ}", "°"))
                i += 1
                continue
            out.append(conv_run(text, run_plain(c)))
        elif name in {
            "sSub",
            "sSup",
            "sSubSup",
            "f",
            "rad",
            "nary",
            "bar",
            "d",
            "m",
            "func",
            "acc",
            "eqArr",
            "limLow",
            "limUpp",
            "sPre",
            "groupChr",
            "borderBox",
            "box",
        }:
            out.append(conv_struct(c))
        elif name in {"rPr", "argPr", "ctrlPr", "mathPr"}:
            pass
        elif c.tag.startswith(M):
            WARNINGS.append("unhandled OMML <" + name + ">")
            out.extend(conv_children(c))
        i += 1
    return out


def raw_script(base: str, script: str, sigil: str) -> str:
    if script == "":
        return base
    if re.fullmatch(r"[A-Za-z0-9*+\-]+", script) and not re.search(r"\s", script):
        return f"{base}{sigil}{script}"
    return f"{base}{sigil}{{{script}}}"


def conv_struct(el: ET.Element) -> Tok:
    name = local(el.tag)
    if name == "sSub":
        base_t, base_r = join_toks(conv_children(part_of(el, "e")))
        sub_t, sub_r = join_toks(conv_children(part_of(el, "sub")))
        return Tok(f"{base_t}_{{{sub_t}}}", raw_script(base_r, sub_r, "_"))
    if name == "sSup":
        base_t, base_r = join_toks(conv_children(part_of(el, "e")))
        sup_t, sup_r = join_toks(conv_children(part_of(el, "sup")))
        return Tok(f"{base_t}^{{{sup_t}}}", raw_script(base_r, sup_r, "^"))
    if name == "sSubSup":
        base_t, base_r = join_toks(conv_children(part_of(el, "e")))
        sub_t, sub_r = join_toks(conv_children(part_of(el, "sub")))
        sup_t, sup_r = join_toks(conv_children(part_of(el, "sup")))
        raw = raw_script(raw_script(base_r, sub_r, "_"), sup_r, "^")
        return Tok(f"{base_t}_{{{sub_t}}}^{{{sup_t}}}", raw)
    if name == "f":
        num_t, num_r = join_toks(conv_children(part_of(el, "num")))
        den_t, den_r = join_toks(conv_children(part_of(el, "den")))
        fpr = find_child(el, "fPr")
        lin = False
        if fpr is not None:
            typ = fpr.find(M + "type")
            lin = typ is not None and typ.get(M + "val") == "lin"
        if lin:
            return Tok(f"{num_t}/{den_t}", f"{num_r}/{den_r}")
        return Tok(rf"\frac{{{num_t}}}{{{den_t}}}", f"({num_r})/({den_r})")
    if name == "rad":
        deg_hide = True
        rpr = find_child(el, "radPr")
        if rpr is not None:
            dh = rpr.find(M + "degHide")
            if dh is not None and dh.get(M + "val") in ("0", "false", "off"):
                deg_hide = False
        e_t, e_r = join_toks(conv_children(part_of(el, "e")))
        if deg_hide:
            return Tok(rf"\sqrt{{{e_t}}}", f"√({e_r})")
        d_t, d_r = join_toks(conv_children(part_of(el, "deg")))
        return Tok(rf"\sqrt[{d_t}]{{{e_t}}}", f"√[{d_r}]({e_r})")
    if name == "bar":
        e_t, e_r = join_toks(conv_children(part_of(el, "e")))
        pos = "top"
        bpr = find_child(el, "barPr")
        if bpr is not None:
            p = bpr.find(M + "pos")
            if p is not None and p.get(M + "val"):
                pos = p.get(M + "val") or "top"
        if pos == "bot":
            raw = e_r + "\u0332" if e_r else e_r
            return Tok(rf"\underline{{{e_t}}}", raw)
        if e_r and re.fullmatch(r"[A-Za-zΑ-ωΔΩ]+(_\{?.+?\}?)?", e_r):
            raw = e_r[0] + "\u0304" + e_r[1:]
        else:
            raw = f"bar({e_r})"
        return Tok(rf"\bar{{{e_t}}}", raw)
    if name == "nary":
        npr = find_child(el, "naryPr")
        ch = "∫"
        if npr is not None:
            chr_el = npr.find(M + "chr")
            if chr_el is not None and chr_el.get(M + "val"):
                ch = chr_el.get(M + "val") or "∫"
        op = { "∫": r"\int", "∑": r"\sum", "∏": r"\prod" }.get(ch, r"\mathop{" + ch + "}")
        sub_t, sub_r = join_toks(conv_children(part_of(el, "sub")))
        sup_t, sup_r = join_toks(conv_children(part_of(el, "sup")))
        e_t, e_r = join_toks(conv_children(part_of(el, "e")))
        tex = op
        raw = ch
        if sub_t != "":
            tex += f"_{{{sub_t}}}"
            raw += raw_script("", sub_r, "_")
        if sup_t != "":
            tex += f"^{{{sup_t}}}"
            raw += raw_script("", sup_r, "^")
        if e_t != "":
            tex += " " + e_t
            raw += e_r
        return Tok(tex, raw)
    # Unknown structure that was explicitly listed: keep descendant math text.
    WARNINGS.append("generic OMML <" + name + ">")
    t, r = join_toks(conv_children(el))
    return Tok(t, r)


def convert_omath(om: ET.Element) -> tuple[str | None, str]:
    try:
        tex, raw = join_toks(conv_children(om))
        raw = re.sub(r"[ \t]{2,}", " ", raw).strip()
        # Keep a trailing TeX space command; str.strip() would eat the space and leave a bare backslash.
        while tex.endswith(" ") and not tex.endswith("\\ "):
            tex = tex[:-1]
        tex = tex.lstrip(" ")
        if tex == "":
            return None, raw
        return tex, raw
    except Exception as exc:  # keep the item; caller falls back to raw text
        flat = "".join((t.text or "") for t in om.iter(M + "t"))
        WARNINGS.append(f"convert failed: {exc}: {flat[:80]}")
        return None, flat


def para_text_nodes(p: ET.Element) -> str:
    bits: list[str] = []
    for el in p.iter(W + "t"):
        # skip text that lives inside math by checking ancestors is hard with ElementTree;
        # math uses m:t, so w:t is prose only.
        bits.append(el.text or "")
    return "".join(bits)


def load_rels(z: zipfile.ZipFile) -> dict[str, str]:
    rels: dict[str, str] = {}
    root = ET.fromstring(z.read("word/_rels/document.xml.rels"))
    for rel in root:
        if local(rel.tag) != "Relationship":
            continue
        rels[rel.get("Id") or ""] = rel.get("Target") or ""
    return rels


def paragraph_blocks(p: ET.Element, rels: dict[str, str], image_src: str | None) -> list[dict]:
    inlines: list[dict] = []
    has_text = False

    def add_text(s: str, href: str | None = None) -> None:
        nonlocal has_text
        if s is None:
            return
        if s.strip():
            has_text = True
        if href:
            inlines.append({"t": "link", "s": s, "href": href})
            return
        if inlines and inlines[-1]["t"] == "text":
            inlines[-1]["s"] += s
        else:
            inlines.append({"t": "text", "s": s})

    for child in list(p):
        if child.tag == W + "r":
            drawings = [el for el in child.iter() if local(el.tag) == "blip"]
            if drawings:
                rid = drawings[0].get(REL + "embed") or ""
                target = rels.get(rid, "")
                src = image_src if target.endswith("image1.png") or image_src else target
                inlines.append({
                    "t": "img",
                    "src": src or "",
                    "alt": "第4-9题温度场（虚线）与气压场（实线）。扫描中四组图都接近同心的冷中心和低压中心。",
                })
                continue
            buf: list[str] = []
            for el in child.iter():
                if el.tag == W + "t":
                    buf.append(el.text or "")
                elif el.tag == W + "br":
                    buf.append("\n")
            add_text("".join(buf))
        elif child.tag == W + "hyperlink":
            rid = child.get(REL + "id") or ""
            href = rels.get(rid, "")
            s = "".join((t.text or "") for t in child.iter(W + "t"))
            add_text(s, href if href.startswith("http") else None)
        elif child.tag == M + "oMath":
            tex, raw = convert_omath(child)
            if tex or raw:
                inlines.append({"t": "math", "tex": tex, "raw": raw})
        elif child.tag == M + "oMathPara":
            for om in child.iter(M + "oMath"):
                tex, raw = convert_omath(om)
                if tex or raw:
                    inlines.append({"t": "math", "tex": tex, "raw": raw})

    blocks: list[dict] = []
    buf: list[dict] = []

    def flush() -> None:
        if not buf:
            return
        only_math = all(n["t"] == "math" for n in buf)
        if only_math and not has_text:
            tex = ""
            raw = ""
            for n in buf:
                if tex and n.get("tex"):
                    tex = append_tex(tex + r"\ ", n["tex"] or "")
                else:
                    tex = append_tex(tex, n.get("tex") or "")
                if raw and n.get("raw"):
                    raw += " "
                raw += n.get("raw") or ""
            blocks.append({"kind": "math", "tex": tex or None, "raw": raw, "display": True})
        else:
            # Drop pure-whitespace text nodes at the edges.
            cleaned = []
            for n in buf:
                if n["t"] == "text":
                    if cleaned and cleaned[-1]["t"] == "text":
                        cleaned[-1]["s"] += n["s"]
                    else:
                        cleaned.append({"t": "text", "s": n["s"]})
                else:
                    cleaned.append(n)
            if cleaned and cleaned[0]["t"] == "text":
                cleaned[0]["s"] = cleaned[0]["s"].lstrip("\n")
            if cleaned and cleaned[-1]["t"] == "text":
                cleaned[-1]["s"] = cleaned[-1]["s"].rstrip()
                if cleaned[-1]["s"] == "":
                    cleaned.pop()
            if cleaned and cleaned[0]["t"] == "text":
                cleaned[0]["s"] = cleaned[0]["s"].lstrip() if not cleaned[0]["s"].startswith("\n") else cleaned[0]["s"].lstrip("\n")
                # Keep intentional leading spaces inside a paragraph, but trim the start.
                cleaned[0]["s"] = cleaned[0]["s"].lstrip(" \t")
            if cleaned:
                blocks.append({"kind": "p", "inlines": cleaned})
        buf.clear()

    for n in inlines:
        if n["t"] == "img":
            flush()
            blocks.append({"kind": "img", "src": n["src"], "alt": n["alt"]})
        else:
            buf.append(n)
    flush()
    return blocks


def flatten(blocks: list[dict]) -> str:
    parts: list[str] = []
    for b in blocks:
        if b["kind"] == "p":
            for n in b["inlines"]:
                if n["t"] in ("text", "link"):
                    parts.append(n["s"])
                elif n["t"] == "math":
                    parts.append(n.get("raw") or "")
        elif b["kind"] == "math":
            parts.append(b.get("raw") or "")
        elif b["kind"] == "img":
            parts.append(b.get("alt") or "")
        elif b["kind"] == "table":
            for row in b["rows"]:
                for cell in row:
                    parts.append(flatten(cell))
    return "".join(parts)


def strip_label(blocks: list[dict], labels: list[str]) -> list[dict]:
    labels = sorted(labels, key=len, reverse=True)
    for b in blocks:
        if b["kind"] != "p" or not b["inlines"]:
            continue
        n0 = b["inlines"][0]
        if n0["t"] != "text":
            break
        s = n0["s"].lstrip(" \t\u3000")
        for lab in labels:
            if s.startswith(lab):
                s = s[len(lab):].lstrip(" \t\u3000:：")
                n0["s"] = s
                if s == "":
                    b["inlines"].pop(0)
                return [x for x in blocks if not (x["kind"] == "p" and not x["inlines"])]
        break
    return [x for x in blocks if not (x["kind"] == "p" and not x["inlines"])]


def table_block(tbl: ET.Element, rels: dict[str, str]) -> dict:
    rows = []
    for tr in tbl.findall(W + "tr"):
        row = []
        for tc in tr.findall(W + "tc"):
            cell: list[dict] = []
            for p in tc.findall(W + "p"):
                cell.extend(paragraph_blocks(p, rels, None))
            cell = [b for b in cell if flatten([b]).strip() or b["kind"] in ("math", "img", "table")]
            if not cell:
                cell = [{"kind": "p", "inlines": [{"t": "text", "s": ""}]}]
            row.append(cell)
        rows.append(row)
    return {"kind": "table", "rows": rows}


def heading_text(p: ET.Element) -> str:
    return para_text_nodes(p).strip()


def style_of(p: ET.Element) -> str:
    st = p.find(W + "pPr/" + W + "pStyle")
    if st is None:
        return ""
    return st.get(W + "val") or ""


def parse_chapter_heading(text: str) -> tuple[int, str] | None:
    m = re.match(r"^第([一二三四五六七八九十]+|\d+)章\s*(.*)$", text.strip())
    if not m:
        return None
    token = m.group(1)
    n = CN_NUM.get(token)
    if n is None:
        n = int(token)
    if n < 1 or n > 10:
        return None
    return n, m.group(2).strip()


def parse_item_heading(text: str) -> tuple[str, str] | None:
    m = re.match(r"^(\d+-\d+)\s+(.+)$", text.strip())
    if not m:
        return None
    return m.group(1), m.group(2).strip()


def nonempty(blocks: list[dict]) -> list[dict]:
    kept = []
    for b in blocks:
        if b["kind"] == "p" and not flatten([b]).strip() and not any(n["t"] == "math" for n in b["inlines"]):
            continue
        if b["kind"] == "math" and not (b.get("tex") or b.get("raw")):
            continue
        kept.append(b)
    return kept


def parse_atmos(path: Path) -> tuple[list[dict], list[dict]]:
    z = zipfile.ZipFile(path)
    rels = load_rels(z)
    # Extract the figure once.
    img_name = None
    for rid, target in rels.items():
        if target.startswith("media/"):
            img_name = target
            break
    if img_name:
        IMG_OUT.parent.mkdir(parents=True, exist_ok=True)
        IMG_OUT.write_bytes(z.read("word/" + img_name))
    root = ET.fromstring(z.read("word/document.xml"))
    body = root.find(W + "body")
    chapters: list[dict] = []
    items: list[dict] = []
    cur_ch: dict | None = None
    cur: dict | None = None
    section: str | None = None
    in_end = False

    def close_item() -> None:
        nonlocal cur, section
        if cur is not None:
            cur["question"] = nonempty(cur["question"])
            cur["answer"] = nonempty(cur["answer"])
            cur["points"] = nonempty(cur["points"])
            items.append(cur)
        cur = None
        section = None

    assert body is not None
    for child in list(body):
        if child.tag == W + "tbl":
            if cur is not None and section:
                blk = table_block(child, rels)
                # The prose line above the table already introduces it.
                cur[section].append(blk)
            continue
        if child.tag != W + "p":
            continue
        st = style_of(child)
        text = heading_text(child)
        if st == "Heading1":
            close_item()
            ch = parse_chapter_heading(text)
            if ch:
                cur_ch = {"part": "atmos", "chapter": ch[0], "title": ch[1], "note": ""}
                chapters.append(cur_ch)
                in_end = False
            else:
                cur_ch = None
                if "核对说明" in text:
                    in_end = True
            continue
        if st == "Heading2":
            close_item()
            parsed = parse_item_heading(text)
            if not parsed or cur_ch is None:
                WARNINGS.append("atmos heading not an item: " + text)
                continue
            qid, title = parsed
            cur = {
                "id": qid,
                "part": "atmos",
                "chapter": cur_ch["chapter"],
                "chapter_title": cur_ch["title"],
                "title": title,
                "question": [],
                "answer": [],
                "points": [],
                "pages": "",
            }
            section = None
            continue
        if cur is None:
            if cur_ch is not None and text.strip():
                extra = text.strip()
                cur_ch["note"] = (cur_ch["note"] + extra) if not cur_ch["note"] else cur_ch["note"] + "\n" + extra
            continue
        blocks = paragraph_blocks(child, rels, "assets/kehou-atmos-4-9.png")
        plain = flatten(blocks).strip()
        if not blocks:
            continue
        norm = plain.replace("\u3000", "").strip()
        if norm.startswith("题目：") or norm.startswith("题目:"):
            section = "question"
            blocks = strip_label(blocks, ["题目：", "题目:"])
            cur["question"].extend(blocks)
            continue
        if norm in ("参考解答", "参考解答：", "参考解答:") or norm.startswith("参考解答：") or norm.startswith("参考解答:"):
            section = "answer"
            if norm in ("参考解答", "参考解答：", "参考解答:"):
                continue
            blocks = strip_label(blocks, ["参考解答：", "参考解答:"])
            cur["answer"].extend(blocks)
            continue
        if norm.startswith("得分要点：") or norm.startswith("得分要点:"):
            section = "points"
            blocks = strip_label(blocks, ["得分要点：", "得分要点:", "得分要点"])
            cur["points"].extend(blocks)
            continue
        if section:
            cur[section].extend(blocks)
        elif plain:
            WARNINGS.append(f"atmos {cur['id']} orphan: {plain[:40]}")
    close_item()
    return chapters, items


def parse_env(path: Path) -> tuple[list[dict], list[dict]]:
    z = zipfile.ZipFile(path)
    rels = load_rels(z)
    root = ET.fromstring(z.read("word/document.xml"))
    body = root.find(W + "body")
    chapters: list[dict] = []
    items: list[dict] = []
    cur_ch: dict | None = None
    cur: dict | None = None
    section: str | None = None

    def close_item() -> None:
        nonlocal cur, section
        if cur is not None:
            cur["question"] = nonempty(cur["question"])
            cur["answer"] = nonempty(cur["answer"])
            cur["points"] = nonempty(cur["points"])
            items.append(cur)
        cur = None
        section = None

    assert body is not None
    for child in list(body):
        if child.tag != W + "p":
            if child.tag == W + "tbl" and cur is not None and section == "answer":
                cur["answer"].append(table_block(child, rels))
            continue
        st = style_of(child)
        text = heading_text(child)
        if st == "Heading1":
            close_item()
            ch = parse_chapter_heading(text)
            if ch:
                cur_ch = {"part": "env", "chapter": ch[0], "title": ch[1], "note": ""}
                chapters.append(cur_ch)
            else:
                cur_ch = None
            continue
        if st == "Heading2":
            close_item()
            parsed = parse_item_heading(text)
            if not parsed or cur_ch is None:
                WARNINGS.append("env heading not an item: " + text)
                continue
            qid, title = parsed
            cur = {
                "id": qid,
                "part": "env",
                "chapter": cur_ch["chapter"],
                "chapter_title": cur_ch["title"],
                "title": title,
                "question": [],
                "answer": [],
                "points": [],
                "pages": "",
            }
            section = None
            continue
        if cur_ch is not None and cur is None:
            if text.strip():
                extra = re.sub(r"\s+", " ", text).strip()
                cur_ch["note"] = extra if not cur_ch["note"] else cur_ch["note"] + extra
            continue
        if cur is None:
            continue
        blocks = paragraph_blocks(child, rels, None)
        plain = flatten(blocks).strip()
        if not plain and not blocks:
            continue
        norm = plain.replace("\u3000", " ").strip()
        if norm.startswith("核对"):
            section = "skip"
            continue
        if norm.startswith("建议写法"):
            section = "answer"
            blocks = strip_label(blocks, ["建议写法"])
            cur["answer"].extend(blocks)
            continue
        if norm.startswith("教材定位"):
            section = "pages"
            blocks = strip_label(blocks, ["教材定位"])
            cur["pages"] = flatten(blocks).strip()
            continue
        if section == "answer":
            cur["answer"].extend(blocks)
        elif section == "skip" and plain:
            WARNINGS.append(f"env {cur['id']} skipped continuation: {plain[:60]}")
        elif plain:
            WARNINGS.append(f"env {cur['id']} orphan: {plain[:60]}")
    close_item()
    return chapters, items


NOTE = (
    "课后题解答供自学核对，不是出版社或南京大学的官方答案。"
    "课后题覆盖范围大于 891 考试范围，这里不把任何题标成必考。"
    "大气：刘红年等《大气科学概论》第3版，2026-10-03 原书核对版，共 131 题。"
    "第五章原书题号误从 6 起，已改回 5，顺序不动。"
    "统一取值：Rd=287，Rv=461.5，cpd=1004，g=9.8，κ≈0.286，σ=5.67×10^-8，Ω=7.292×10^-5。"
    "温度的幂次和泊松方程用 K；气压比两端用相同单位。"
    "环境：方淑荣、姚红《环境科学概论》（清华大学出版社第2版），2026-11-11 逐题核对稿，共 55 题。"
    "环境题核对稿给出题目标题和建议写法，页面不另录教材题干全文。教材定位写的是印刷页；扫描 PDF 的页序比印刷页大 12。"
)


def counts_by_chapter(items: list[dict], part: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for it in items:
        if it["part"] != part:
            continue
        k = str(it["chapter"])
        out[k] = out.get(k, 0) + 1
    return out


def main() -> int:
    WARNINGS.clear()
    ach, aitems = parse_atmos(ATMOS_DOC)
    ech, eitems = parse_env(ENV_DOC)
    items = aitems + eitems
    chapters = ach + ech
    data = {
        "meta": {
            "note": NOTE,
            "sources": [
                {
                    "part": "atmos",
                    "book": "刘红年等《大气科学概论》第3版",
                    "file": "atmos_kehou_checked_2026-10-03",
                    "count": len(aitems),
                },
                {
                    "part": "env",
                    "book": "方淑荣、姚红《环境科学概论》清华大学出版社第2版",
                    "file": "env_kehou_checked_2026-11-11",
                    "count": len(eitems),
                },
            ],
            "counts": {
                "total": len(items),
                "atmos": len(aitems),
                "env": len(eitems),
                "atmos_by_chapter": counts_by_chapter(items, "atmos"),
                "env_by_chapter": counts_by_chapter(items, "env"),
            },
            "constants": "Rd=287，Rv=461.5，cpd=1004，g=9.8，κ≈0.286，σ=5.67×10^-8，Ω=7.292×10^-5",
        },
        "chapters": chapters,
        "items": items,
    }
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT_JSON} items={len(items)} atmos={len(aitems)} env={len(eitems)}")
    print("chapters", [(c["part"], c["chapter"], c["title"], c["note"][:40]) for c in chapters])
    missing_points = [it["id"] for it in aitems if not it["points"]]
    print("atmos missing points", len(missing_points), missing_points)
    missing_pages = [it["id"] for it in eitems if not it["pages"]]
    print("env missing pages", missing_pages)
    empty_ans = [it["part"] + " " + it["id"] for it in items if not it["answer"]]
    print("empty answers", empty_ans)
    empty_q = [it["id"] for it in aitems if not it["question"]]
    print("atmos empty question", empty_q)
    # unique warnings
    uniq = []
    for w in WARNINGS:
        if w not in uniq:
            uniq.append(w)
    print("WARNINGS", len(WARNINGS), "unique", len(uniq))
    for w in uniq[:80]:
        print(" -", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
