"""Safe failures: never retain exception text, URLs, headers or provider bodies."""
from dataclasses import dataclass


@dataclass(frozen=True)
class ObservationFailure(Exception):
    code: str
    stage: str = "HOME"
    effects: str = "NONE"
    sequence: int | None = None

    def __str__(self) -> str:
        return self.code

    def semantic(self) -> dict:
        result = {"code": self.code, "stage": self.stage,
                  "effects": self.effects, "retryable": False}
        if self.sequence is not None:
            result["sequence"] = self.sequence
        return result
