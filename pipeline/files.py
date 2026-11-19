"""Writing a file whole or not at all: its text or bytes go to a file beside it, which then takes its name, so a reader,
or a run stopped half way, finds the old file or the new one and never part of either.
"""

import os
import tempfile
from pathlib import Path


def write(path: Path, content: str | bytes) -> None:
    """Replace the file with this text (UTF-8) or these bytes, its folder made when it is new."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix=f'.{path.name}.', suffix='.tmp')
    try:
        with os.fdopen(fd, 'wb') as f:
            _ = f.write(content.encode() if isinstance(content, str) else content)
            f.flush()
            os.fsync(f.fileno())
        Path(temp).replace(path)
    except BaseException:
        Path(temp).unlink(missing_ok=True)
        raise
