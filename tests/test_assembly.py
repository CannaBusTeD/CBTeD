#!/usr/bin/env python3
"""Run CBTeD assembly without user media, credentials or paid services."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RENDER = ROOT / "scripts" / "assemble_project.py"


def ffmpeg(args):
    process = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y"] + args,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if process.returncode:
        raise AssertionError(process.stderr[-1500:])


class AssemblyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            raise unittest.SkipTest("FFmpeg tools not present")

    def test_assembles_two_clips_with_music_and_silent_clip(self):
        with tempfile.TemporaryDirectory(prefix="cbted_assembly_test_") as temp:
            root = Path(temp)
            ffmpeg(["-f", "lavfi", "-i", "color=c=blue:s=320x180:d=1.3:r=30",
                    "-f", "lavfi", "-i", "sine=frequency=420:duration=1.3",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                    str(root / "a.mp4")])
            ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=320x180:d=1.3:r=30",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(root / "b.mp4")])
            ffmpeg(["-f", "lavfi", "-i", "sine=frequency=220:duration=3",
                    "-c:a", "libmp3lame", str(root / "music.mp3")])
            manifest = {
                "aspect_ratio": "16:9", "fps": 30,
                "clips": [{"path": "a.mp4", "duration": 1.0}, {"path": "b.mp4", "duration": 1.0}],
                "music": {"path": "music.mp3", "volume": 0.35}
            }
            (root / "project.json").write_text(json.dumps(manifest), encoding="utf8")
            completed = subprocess.run([sys.executable, str(RENDER), "project.json",
                                        "--root", str(root), "--test-size"],
                                       capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            report = json.loads(completed.stdout)
            self.assertEqual(report["status"], "rendered_and_probed")
            self.assertEqual(report["clips"], 2)
            self.assertTrue(report["music_mixed"])
            self.assertFalse(report["narration_mixed"])
            self.assertEqual(report["resolution"], "320x180")
            self.assertAlmostEqual(report["duration_seconds"], 2.0, delta=0.7)
            self.assertEqual(len(report["sha256"]), 64)
            self.assertGreater((root / "output" / "final.mp4").stat().st_size, 10000)

    def test_blocks_path_escape_before_running_ffmpeg(self):
        with tempfile.TemporaryDirectory(prefix="cbted_assembly_test_") as temp:
            root = Path(temp)
            (root / "project.json").write_text(json.dumps({"clips": [{"path": "../secret.mp4"}]}))
            result = subprocess.run([sys.executable, str(RENDER), "project.json",
                                     "--root", str(root), "--test-size"], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("escapes the project workspace", result.stderr)


if __name__ == "__main__":
    unittest.main()
