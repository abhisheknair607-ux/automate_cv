"""Allowlisted CV model tiers. Google Sheets stores names, never API model IDs.

The default merged Stage 1+2 call uses the selected Stage 2 model.
Stage 3 requires Code Interpreter; test its DOCX QA before treating Economy as proven.
Premium preserves the existing production GPT-5.6 route.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class ModelPreset:
    tier: str
    stage1: str
    stage2: str
    stage3: str
    stage1_effort: str = 'low'
    stage2_effort: str = 'medium'
    stage3_effort: str = 'medium'


MODEL_PRESETS = {
    'Economy': ModelPreset('Economy', 'gpt-6-luna', 'gpt-6-luna', 'gpt-6-luna'),
    'Balanced': ModelPreset('Balanced', 'gpt-6-luna', 'gpt-6-luna', 'gpt-6.1-sol'),
    'Premium': ModelPreset('Premium', 'gpt-5.6-terra', 'gpt-5.6-terra', 'gpt-5.6-sol'),
}

DEFAULT_MODEL_TIER = 'Premium'


def resolve_preset(value) -> ModelPreset:
    """Empty = backwards-compatible Premium; invalid explicit label = fail closed."""
    name = str(value or '').strip().title() or DEFAULT_MODEL_TIER
    if name not in MODEL_PRESETS:
        raise ValueError(
            f'Unsupported CV model preset {value!r}; choose Economy, Balanced, or Premium.'
        )
    return MODEL_PRESETS[name]
