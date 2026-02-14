from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AuthGuard:
    valid_token_prefix: str = "hk_"

    def authorize(self, token: str) -> bool:
        return bool(token and token.startswith(self.valid_token_prefix))

    def allow_lane(self, user_id: str, lane_id: str) -> bool:
        # Minimal lane isolation policy: user lane prefix must match.
        return lane_id.startswith(f"{user_id}:")
