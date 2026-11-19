#!/usr/bin/env python3
"""CBTeD local media assembler.

Input: project-owned files already downloaded into a workspace and a small
JSON manifest. Output: a real MP4 and a machine-readable verification report.
No generation provider, secret, cloud account, or external network is used.
This can run in the Higgsfield-connected sandbox or another FFmpeg worker.
"""
import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

SIZES = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080), "7:3": (2100, 900)}
MAX_CLIPS = 40


class RenderError(RuntimeError):
    pass


def run(args):
    process = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    if process.returncode:
        raise RenderError("FFmpeg operation failed: " + process.stderr[-2400:])
    return process.stdout


def probe(path):
    output = run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)])
    data = json.loads(output)
    streams = data.get("streams", [])
    if not any(s.get("codec_type") == "video" for s in streams):
        if not any(s.get("codec_type") == "audio" for s in streams):
            raise RenderError("Input contains no video or audio: " + path.name)
    try:
        duration = float(data.get("format", {}).get("duration", "0"))
    except ValueError:
        duration = 0
    return {"duration": duration, "streams": streams}


def path_inside(root, requested):
    if not isinstance(requested, str) or not requested or requested.startswith(("https:", "http:")):
        raise RenderError("Use a real local file path, not a network link")
    candidate = (root / requested).resolve()
    if root not in candidate.parents and candidate != root:
        raise RenderError("Input path escapes the project workspace")
    if not candidate.is_file():
        raise RenderError("Missing project asset: " + requested)
    return candidate


def positive(value, label, low=0.001, high=10000):
    if not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise RenderError(label + " must be a finite number in range")
    return float(value)


def sha256_file(path):
    h = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Render an approved CBTeD project manifest to a verified MP4")
    parser.add_argument("manifest", help="Local JSON manifest of real video and optional audio project assets")
    parser.add_argument("--root", default=".", help="The trusted workspace containing project assets")
    parser.add_argument("--output", default="output/final.mp4", help="Output path, inside --root")
    parser.add_argument("--test-size", action="store_true", help="Small 320px render for automated regression tests")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    manifest_file = path_inside(root, args.manifest)
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    clips = manifest.get("clips")
    if not isinstance(clips, list) or not 1 <= len(clips) <= MAX_CLIPS:
        raise RenderError("Supply 1 to 40 ordered video clips")
    aspect = manifest.get("aspect_ratio", "16:9")
    if aspect not in SIZES:
        raise RenderError("Unsupported target aspect ratio")
    width, height = SIZES[aspect]
    if args.test_size:
        width, height = (320, 180) if aspect == "16:9" else (180, 320) if aspect == "9:16" else (320, 320)
    fps = int(positive(manifest.get("fps", 30), "Frame rate", 24, 60))
    if fps not in (24, 25, 30, 50, 60):
        raise RenderError("Use a supported frame rate")
    out_path = (root / args.output).resolve()
    if root not in out_path.parents:
        raise RenderError("Output path escapes project workspace")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    expected_duration = 0.0
    with tempfile.TemporaryDirectory(prefix="cbted_assemble_") as working:
        tmp = Path(working)
        prepared = []
        for index, item in enumerate(clips):
            if not isinstance(item, dict):
                raise RenderError("Each clip needs a path")
            source = path_inside(root, item.get("path"))
            meta = probe(source)
            if not any(s.get("codec_type") == "video" for s in meta["streams"]):
                raise RenderError("A clip has no video stream")
            start = positive(item.get("start", 0), "Trim start", 0, 3600)
            max_len = max(0, meta["duration"] - start)
            trim = item.get("duration", max_len)
            length = positive(trim, "Clip duration", 0.2, 600)
            if meta["duration"] > 0 and start + length > meta["duration"] + 0.15:
                raise RenderError("Requested clip duration exceeds real file length")
            expected_duration += length
            has_audio = any(s.get("codec_type") == "audio" for s in meta["streams"])
            normalized = tmp / ("clip_%03d.mp4" % index)
            cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
                   "-ss", str(start), "-i", str(source)]
            if not has_audio:
                cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
            cmd += ["-t", str(length), "-map", "0:v:0",
                    "-map", "0:a:0" if has_audio else "1:a:0",
                    "-vf", "scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=black,fps=%d,setsar=1,format=yuv420p" %
                        (width, height, width, height, fps),
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
                    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
                    "-movflags", "+faststart", str(normalized)]
            run(cmd)
            prepared.append(normalized)
        concat_file = tmp / "clips.txt"
        concat_file.write_text("".join("file '%s'\n" % str(p) for p in prepared), encoding="utf-8")
        joined = tmp / "joined.mp4"
        run(["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
             "-f", "concat", "-safe", "0", "-i", str(concat_file),
             "-c", "copy", "-movflags", "+faststart", str(joined)])
        music = manifest.get("music")
        narration = manifest.get("narration")
        caption_spec = manifest.get("captions")
        cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-i", str(joined)]
        audio_tracks = ["[0:a]volume=%s[track0]" % positive(manifest.get("clip_audio_volume", 1.0), "Clip audio volume", 0, 2)]
        terms = ["[track0]"]
        next_input = 1
        for label, entry in (("music", music), ("narration", narration)):
            if entry is None:
                continue
            if not isinstance(entry, dict):
                raise RenderError(label + " requires a path")
            asset = path_inside(root, entry.get("path"))
            meta = probe(asset)
            if not any(s.get("codec_type") == "audio" for s in meta["streams"]):
                raise RenderError(label + " has no audio stream")
            if label == "music":
                cmd += ["-stream_loop", "-1"]
            cmd += ["-i", str(asset)]
            volume = positive(entry.get("volume", 0.6 if label == "music" else 1.0),
                              label + " volume", 0, 2)
            audio_tracks.append("[%d:a]volume=%s,apad[track%d]" % (next_input, volume, next_input))
            terms.append("[track%d]" % next_input)
            next_input += 1
        captions = None
        if caption_spec:
            if not isinstance(caption_spec, str):
                raise RenderError("Captions must be a local .srt path")
            captions = path_inside(root, caption_spec)
            if captions.suffix.lower() != ".srt":
                raise RenderError("Captions must be an SRT file")
            cmd += ["-i", str(captions)]
        filter_graph = ";".join(audio_tracks) + ";" + "".join(terms) + \
            "amix=inputs=%d:duration=first:normalize=0,alimiter=limit=0.95[aout]" % len(terms)
        cmd += ["-filter_complex", filter_graph, "-map", "0:v:0", "-map", "[aout]"]
        if captions:
            cmd += ["-map", "%d:0" % next_input, "-c:s", "mov_text"]
        cmd += ["-t", str(expected_duration), "-c:v", "copy", "-c:a", "aac",
                "-ar", "48000", "-b:a", "192k", "-movflags", "+faststart",
                str(out_path)]
        run(cmd)
    result = probe(out_path)
    duration = result["duration"]
    if not result["streams"] or not any(x.get("codec_type") == "video" for x in result["streams"]):
        raise RenderError("Output video verification failed")
    if not any(x.get("codec_type") == "audio" for x in result["streams"]):
        raise RenderError("Output is missing its audio track")
    if abs(duration - expected_duration) > 1.0:
        raise RenderError("Final duration unexpectedly differs from approved edit")
    report = {"status": "rendered_and_probed", "path": str(out_path),
              "sha256": sha256_file(out_path), "duration_seconds": round(duration, 3),
              "expected_duration_seconds": round(expected_duration, 3),
              "resolution": "%dx%d" % (width, height),
              "clips": len(clips), "music_mixed": music is not None,
              "narration_mixed": narration is not None,
              "captions_embedded": captions is not None,
              "notes": "Technical verification only. Creator review and approval still required."}
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (RenderError, OSError, ValueError, json.JSONDecodeError) as error:
        print("CBTeD assembly failed: " + str(error), file=sys.stderr)
        sys.exit(1)
