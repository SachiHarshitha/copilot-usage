"""Dashboard package."""

# Re-export queries to make ``from copilot_usage.dashboard import queries``
# robust in frozen builds.
from . import queries

__all__ = ["queries"]
