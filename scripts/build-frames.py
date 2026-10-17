#!/usr/bin/env python3
"""Cut the source films into scroll-scrubbed WebP frame sequences.

The three source clips are one continuous camera move:
  a-build.mp4   bare earth -> finished tower -> lobby -> glass doors open
  b-terrace.mp4 through the doors -> terrace -> rise to aerial
  c-suites.mp4  aerial -> facade -> suites

Each chapter is sampled at its own frame rate: slow aerial orbits need few
frames (the player crossfades neighbours), fast moves like the door swing
need many. Output:
  public/frames/{hd,sd}/f00000.webp
  src/frames.generated.json   chapter -> frame range manifest

Usage: python3 scripts/build-frames.py [--only hd|sd]
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "media" / "source"
OUT = ROOT / "public" / "frames"

# id, file, start s, end s (None = clip end), fps, scroll length in vh
CHAPTERS = [
    ("ground",  "a-build.mp4",   0.0,   12.0,  6, 150),
    ("frame",   "a-build.mp4",   12.0,  44.0,  3, 210),
    ("finish",  "a-build.mp4",   44.0,  66.0,  5, 170),
    ("vision",  "a-build.mp4",   66.0,  84.0,  5, 160),
    ("arrival", "a-build.mp4",   84.0,  98.0,  6, 130),
    ("lobby",   "a-build.mp4",   98.0,  111.5, 8, 140),
    ("doors",   "a-build.mp4",   111.5, None,  20, 170),
    ("terrace", "b-terrace.mp4", 0.0,   None,  10, 360),
    ("suites",  "c-suites.mp4",  0.0,   None,  8, 280),
]

TIERS = {"hd": (720, 55), "sd": (480, 55)}


def duration(path: Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "csv=p=0", str(path)])
    return float(out)


def extract(tier: str, width: int, quality: int) -> list[dict]:
    dest = OUT / tier
    dest.mkdir(parents=True, exist_ok=True)
    for old in dest.glob("f*.webp"):
        old.unlink()
    manifest, cursor = [], 0
    for cid, name, start, end, fps, scroll in CHAPTERS:
        src = SRC / name
        end = duration(src) if end is None else end
        with tempfile.TemporaryDirectory(dir=dest) as tmp:
            subprocess.run([
                "ffmpeg", "-v", "error", "-y", "-ss", f"{start}", "-to", f"{end}",
                "-i", str(src), "-an",
                "-vf", f"fps={fps},scale={width}:-2:flags=lanczos",
                "-c:v", "libwebp", "-quality", str(quality),
                "-compression_level", "6",
                f"{tmp}/%05d.webp"], check=True)
            frames = sorted(Path(tmp).glob("*.webp"))
            for i, f in enumerate(frames):
                f.rename(dest / f"f{cursor + i:05d}.webp")
        manifest.append({"id": cid, "start": cursor, "end": cursor + len(frames) - 1,
                         "scroll": scroll, "fps": fps})
        print(f"{tier} {cid:8s} {len(frames):4d} frames", flush=True)
        cursor += len(frames)
    size = sum(p.stat().st_size for p in dest.glob("f*.webp"))
    print(f"{tier} total {cursor} frames, {size / 1e6:.1f} MB")
    return manifest


def main() -> None:
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    manifest = None
    for tier, (width, quality) in TIERS.items():
        if only and tier != only:
            continue
        manifest = extract(tier, width, quality)
    first = (OUT / "hd" / "f00000.webp")
    height = int(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "stream=width,height",
        "-of", "csv=p=0", str(first)]).decode().split(",")[1])
    (ROOT / "src" / "frames.generated.json").write_text(json.dumps({
        "aspect": TIERS["hd"][0] / height,
        "count": manifest[-1]["end"] + 1,
        "chapters": manifest,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
