import os
from pathlib import Path


def load_env_file(base_path: Path | None = None) -> None:
    """
    Load environment variables from a .env file located alongside the code.

    This keeps the side-effect isolated in one place so other modules can
    depend on environment configuration without duplicating parsing logic.
    """
    env_dir = Path(base_path or Path(__file__).resolve().parent)
    env_path = env_dir / ".env"
    if not env_path.exists():
        return

    try:
        for line in env_path.read_text(encoding="utf-8").splitlines():
            text = line.strip()
            if not text or text.startswith("#") or "=" not in text:
                continue

            key, val = text.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")

            if key and key not in os.environ:
                os.environ[key] = val
    except OSError:
        # Intentionally ignore IO issues so the app can still start.
        return
