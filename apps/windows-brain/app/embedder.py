from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# BGE-M3 dimension is 1024
DIMENSION = 1024


class Embedder:
    def __init__(self, ollama_url: str = "http://localhost:11434", model: str = "bge-m3") -> None:
        self.ollama_url = ollama_url.rstrip("/")
        self.model = model

    def get_embedding(self, text: str) -> list[float]:
        if not text.strip():
            return [0.0] * DIMENSION

        try:
            # We use synchronous httpx because memory.py methods are currently synchronous
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(
                    f"{self.ollama_url}/api/embeddings",
                    json={"model": self.model, "prompt": text},
                )
            if resp.status_code == 200:
                data = resp.json()
                embedding = data.get("embedding")
                if isinstance(embedding, list) and len(embedding) > 0:
                    # Provide exact dimension if needed or rely on the model. 
                    # If model returns different dim, we might need to pad/truncate, 
                    # but bge-m3 is exactly 1024.
                    if len(embedding) == DIMENSION:
                        return embedding
                    else:
                        logger.warning(f"Embedding dimension mismatch: expected {DIMENSION}, got {len(embedding)}")
                        # For safety, let's pad or truncate
                        return (embedding + [0.0] * DIMENSION)[:DIMENSION]
            else:
                raise ConnectionError(f"Ollama returned status code {resp.status_code}")
        except Exception as exc:
            logger.warning(f"Ollama embedding failed ({self.model}): {exc}")
            raise ConnectionError(f"Ollama connection failed: {exc}") from exc
