"""Shared presentation constants (kept in one place, DRY).

Severity colours mirror the design tokens in the handoff so the API and UI
agree on the meaning of each severity band.
"""
from __future__ import annotations

from app.models.entities import Severity

SEVERITY_COLOR: dict[Severity, str] = {
    Severity.CRITICAL: "#f87171",  # danger / red
    Severity.HIGH: "#fbbf24",      # warning / amber
    Severity.MEDIUM: "#3b82f6",    # blue
    Severity.LOW: "#34d399",       # success / green
}

SEVERITY_LABEL: dict[Severity, str] = {
    Severity.CRITICAL: "Critical",
    Severity.HIGH: "High",
    Severity.MEDIUM: "Medium",
    Severity.LOW: "Low",
}


def severity_color(sev: Severity) -> str:
    return SEVERITY_COLOR.get(sev, "#8b98b3")


def severity_label(sev: Severity) -> str:
    return SEVERITY_LABEL.get(sev, sev.value.title())
