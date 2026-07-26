"""Packaging metadata regression tests."""

from pathlib import Path
import tomllib


def test_declared_readme_exists():
    pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
    metadata = tomllib.loads(pyproject.read_text())
    readme = metadata["project"]["readme"]
    assert (pyproject.parent / readme).is_file()
