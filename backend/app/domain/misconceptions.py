"""Misconception taxonomy shared by quiz generation and diagnosis.

The labels are the fixed vocabulary Gemini must choose from (see ``prompts/misconception_taxonomy.md``).
"""

LABELS = (
    "condition_vs_prediction",
    "formula_inversion",
    "definition_mixup",
    "scope_overgeneralization",
    "calculation_error",
    "guess_or_unknown",
)
UNKNOWN_LABEL = "guess_or_unknown"
DEFAULT_STORED_LABEL = "definition_mixup"


def normalize(label: str | None, default: str = UNKNOWN_LABEL) -> str:
    """Return ``label`` if it is part of the taxonomy, otherwise ``default``."""
    return label if label in LABELS else default
