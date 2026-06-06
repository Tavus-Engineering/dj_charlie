#!/usr/bin/env bash
# Set up (idempotent) and launch the local Music-Flamingo audio service.
# Usage: ./run.sh    (from local-audio/)
set -euo pipefail
cd "$(dirname "$0")"

# Reuse the machine's CUDA torch instead of pulling a CPU build into the venv.
uv venv --system-site-packages .venv 2>/dev/null || true
# shellcheck disable=SC1091
source .venv/bin/activate

echo "[run] installing deps (torch reused from system site-packages) ..."
uv pip install -r requirements.txt

# Sanity: confirm the AudioFlamingo3 class is importable before we try to load it.
python - <<'PY'
import sys
try:
    from transformers import AudioFlamingo3ForConditionalGeneration  # noqa: F401
except Exception as e:
    sys.stderr.write(
        "\n[run] transformers is missing AudioFlamingo3ForConditionalGeneration.\n"
        "[run] Run: uv pip install -U 'transformers @ git+https://github.com/huggingface/transformers'\n"
        f"[run] ({e})\n\n"
    )
    sys.exit(1)
print("[run] AudioFlamingo3 class OK")
PY

echo "[run] starting server (first run downloads ~16GB of weights) ..."
exec python server.py
