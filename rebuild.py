"""Best Guess rebuild tool. Run after editing the app, from the repo folder.

  python3 rebuild.py            refresh the privacy lock in index.html
  python3 rebuild.py 0.2.0      also set the version everywhere (index.html and sw.js)
  python3 rebuild.py --check    change nothing; exit 1 if the lock or versions are out of date

Why: the privacy lock (Content-Security-Policy) only lets scripts run whose exact
fingerprint (sha256) is listed. Any edit to a script changes its fingerprint, so the
lock must be refreshed, or the edited app won't start. Files are updated in place,
because the repo files are what the website publishes.
"""
import base64
import hashlib
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
SCRIPT = re.compile(r"<script>(.*?)</script>", re.S)
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")


def lock(html):
    hashes = " ".join(
        "'sha256-" + base64.b64encode(hashlib.sha256(m.group(1).encode("utf-8")).digest()).decode() + "'"
        for m in SCRIPT.finditer(html)
    )
    new, n = re.subn(r"(script-src )[^;]*(;)", lambda m: m.group(1) + hashes + m.group(2), html, count=1)
    assert n == 1, "privacy lock not found in the page"
    return new


def set_version(index, sw, ver):
    index, n1 = re.subn(r'const APP_VERSION = "[^"]+";', 'const APP_VERSION = "%s";' % ver, index, count=1)
    sw, n2 = re.subn(r"\(version [^)]+\)", "(version %s)" % ver, sw, count=1)
    sw, n3 = re.subn(r'const CACHE = "best-guess-[^"]+";', 'const CACHE = "best-guess-%s";' % ver, sw, count=1)
    assert n1 == n2 == n3 == 1, "a version marker is missing"
    return index, sw


def versions(index, sw):
    a = re.search(r'const APP_VERSION = "([^"]+)";', index)
    b = re.search(r'const CACHE = "best-guess-([^"]+)";', sw)
    c = re.search(r"\(version ([^)]+)\)", sw)
    return [m.group(1) if m else None for m in (a, b, c)]


def main(argv):
    index_p, sw_p = HERE / "index.html", HERE / "sw.js"
    index = index_p.read_text(encoding="utf-8")
    sw = sw_p.read_text(encoding="utf-8")
    if argv[:1] == ["--check"]:
        problems = []
        if lock(index) != index:
            problems.append("the privacy lock is out of date (run python3 rebuild.py)")
        v = versions(index, sw)
        if len(set(v)) != 1 or None in v:
            problems.append("versions don't agree: app %s, sw cache %s, sw note %s" % tuple(v))
        for p in problems:
            print("FAIL:", p)
        if not problems:
            print("OK: lock fresh, version", v[0])
        return 1 if problems else 0
    if argv:
        ver = argv[0]
        if not VERSION_RE.match(ver):
            print("Version must look like 1.2.3")
            return 2
        index, sw = set_version(index, sw, ver)
        sw_p.write_text(sw, encoding="utf-8")
    index_p.write_text(lock(index), encoding="utf-8")
    print("updated index.html" + (" and sw.js to " + argv[0] if argv else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
