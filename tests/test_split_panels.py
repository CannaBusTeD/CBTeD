import importlib.util
import tempfile
import unittest
from pathlib import Path
from PIL import Image

FILE = Path(__file__).resolve().parents[1] / "scripts" / "split_panels.py"
spec = importlib.util.spec_from_file_location("split_panels", FILE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PanelsTest(unittest.TestCase):
    def test_four_individual_files_not_a_sheet(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "composite.png"
            Image.new("RGB", (3200, 1800), (20, 40, 60)).save(source)
            files = module.split_sheet(source, root / "out", 2, 2)
            self.assertEqual(len(files), 4)
            self.assertTrue(all((root / "out" / f["file"]).exists() for f in files))
            self.assertTrue(all(f["status"] == "needs_review" for f in files))
            self.assertTrue(all(f["meets_minimum_resolution"] for f in files))
            self.assertTrue((root / "out" / "manifest.json").exists())
    def test_low_resolution_crops_remain_unapproved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root / "tiny.png"
            Image.new("RGB", (800, 450)).save(source)
            frames = module.split_sheet(source, root / "out", 2, 2)
            self.assertFalse(any(f["meets_minimum_resolution"] for f in frames))
            self.assertTrue(all(f["status"] == "needs_review" for f in frames))
    def test_one_frame_is_not_a_grid(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp); im=p/"a.png"; Image.new("RGB", (800, 450)).save(im)
            with self.assertRaises(ValueError):
                module.split_sheet(im,p/"out",1,1)
if __name__=="__main__":
    unittest.main()
