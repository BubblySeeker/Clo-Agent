"""
Shared test configuration.

Mocks app.database and app.config at sys.modules level before any test imports,
so all AI service modules can be imported without a real DB or env vars.
"""
import sys
from unittest.mock import MagicMock, AsyncMock


def _install_mocks():
    """Install sys.modules mocks for modules that require external resources."""
    # app.config requires env vars — mock it
    if "app.config" not in sys.modules:
        mock_config = MagicMock()
        mock_config.ANTHROPIC_API_KEY = "test-key"
        mock_config.ANTHROPIC_MODEL = "test-model"
        mock_config.DATABASE_URL = "postgresql://test:test@localhost/test"
        mock_config.AI_SERVICE_SECRET = "test-secret"
        mock_config.BACKEND_URL = "http://localhost:8080"
        sys.modules["app.config"] = mock_config

    # app.database requires a running DB — mock it
    if "app.database" not in sys.modules:
        mock_db = MagicMock()
        mock_db.get_conn = MagicMock()
        mock_db.run_query = AsyncMock(side_effect=lambda fn: fn())
        sys.modules["app.database"] = mock_db


_install_mocks()
