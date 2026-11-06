export interface ProjectFile {
  path: string;
  content: string;
}

export function pythonProjectFiles(name: string): ProjectFile[] {
  const distribution =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "python-project";
  return [
    {
      path: "pyproject.toml",
      content: [
        "[project]",
        `name = ${JSON.stringify(distribution)}`,
        'version = "0.1.0"',
        'requires-python = ">=3.10"',
        "dependencies = []",
        "",
        "[tool.pytest.ini_options]",
        'testpaths = ["tests"]',
        'pythonpath = ["."]',
        "",
        "[tool.ruff]",
        'target-version = "py310"',
        "line-length = 100",
        "",
        "[tool.basedpyright]",
        'typeCheckingMode = "standard"',
        'venvPath = "."',
        'venv = ".venv"',
        "",
      ].join("\n"),
    },
    {
      path: "main.py",
      content:
        'def greet(name: str) -> str:\n    return f"Hello, {name}!"\n\n\nif __name__ == "__main__":\n    print(greet("OpenPyCharm"))\n',
    },
    {
      path: "tests/test_main.py",
      content:
        'from main import greet\n\n\ndef test_greet() -> None:\n    assert greet("Python") == "Hello, Python!"\n',
    },
    {
      path: "requirements-dev.txt",
      content: "pytest>=8,<10\nruff>=0.11,<1\nbasedpyright>=1.29,<2\ndebugpy>=1.8,<2\n",
    },
    {
      path: ".gitignore",
      content: ".venv/\n__pycache__/\n*.py[cod]\n.pytest_cache/\n.ruff_cache/\n.openidea/\n.coverage\nhtmlcov/\n",
    },
    {
      path: "README.md",
      content: [
        "# Python project",
        "",
        "Created with OpenPyCharm. Requires Python 3.10 or newer.",
        "",
        "## Environment",
        "",
        "If you skipped environment creation in the wizard, run: python -m venv .venv",
        "",
        "Windows PowerShell: .\\.venv\\Scripts\\Activate.ps1",
        "",
        "macOS / Linux: source .venv/bin/activate",
        "",
        "After activation:",
        "",
        "    python -m pip install -r requirements-dev.txt",
        "    python main.py",
        "    python -m pytest",
        "    python -m ruff check .",
        "    python -m ruff format .",
        "",
        "OpenPyCharm detects .venv. Select it under Settings > Python Interpreter if needed.",
        "Right-click main.py to run or debug; set a breakpoint inside greet first.",
        "Right-click tests/test_main.py to run its tests.",
        "",
      ].join("\n"),
    },
  ];
}
