"""
Tests for the intelligence pre-processor: entity extraction, recency detection,
DB resolution, and context enrichment.
"""
from unittest.mock import MagicMock, AsyncMock, patch

import pytest

from app.services.intelligence import (
    EntityContext,
    ResolvedEntity,
    _check_recency,
    _extract_tokens,
    _resolve_from_db,
    enrich_context,
    resolve_entities,
)


class TestExtractTokens:
    def test_extracts_name_from_command(self):
        """'Email Rohan Batre' should extract Rohan/Batre but not Email."""
        tokens = _extract_tokens("Email Rohan Batre")
        joined = " ".join(tokens)
        assert "Rohan" in joined
        assert "Batre" in joined
        # "email" is a stop word
        assert "Email" not in tokens

    def test_extracts_quoted_string(self):
        tokens = _extract_tokens('Find "Rohan Batre"')
        assert "Rohan Batre" in tokens

    def test_stop_words_filtered_completely(self):
        tokens = _extract_tokens("email the contact about showing")
        assert tokens == []


class TestCheckRecency:
    def test_my_last_contact_detected(self):
        assert _check_recency("my last contact") is True

    def test_most_recent_contact_detected(self):
        assert _check_recency("Who is my most recent contact?") is True

    def test_non_recency_message(self):
        assert _check_recency("email Rohan") is False


class TestResolveFromDb:
    def test_resolves_tokens_to_contacts(self):
        mock_row = {
            "id": "abc-123",
            "first_name": "Rohan",
            "last_name": "Batre",
            "email": "rohan@example.com",
            "phone": "555-0100",
            "source": "website",
            "created_at": "2026-01-01",
        }
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [mock_row]

        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor

        with patch("app.services.intelligence.get_conn", return_value=mock_conn):
            results = _resolve_from_db(["Rohan Batre"], "agent-1", recency=False)

        assert len(results) == 1
        assert results[0].contact_id == "abc-123"
        assert results[0].first_name == "Rohan"
        assert results[0].match_type == "exact"

    def test_max_three_contacts_cap(self):
        mock_rows = [
            {
                "id": f"id-{i}", "first_name": f"First{i}", "last_name": f"Last{i}",
                "email": f"f{i}@example.com", "phone": None, "source": None,
                "created_at": "2026-01-01",
            }
            for i in range(5)
        ]
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = mock_rows

        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor

        with patch("app.services.intelligence.get_conn", return_value=mock_conn):
            results = _resolve_from_db(["First"], "agent-1", recency=False)

        assert len(results) <= 3


class TestResolveEntities:
    @pytest.mark.asyncio
    async def test_graceful_degradation_on_db_error(self):
        """DB exception → empty EntityContext."""
        with patch(
            "app.services.intelligence.run_query",
            new_callable=AsyncMock,
            side_effect=Exception("DB connection failed"),
        ):
            ctx = await resolve_entities("Email Rohan Batre", "agent-1")

        assert isinstance(ctx, EntityContext)
        assert ctx.contacts == []
        assert ctx.recency_match is False


class TestEnrichContext:
    def test_builds_enrichment_string(self):
        entity = ResolvedEntity(
            contact_id="abc-123", first_name="Rohan", last_name="Batre",
            email="rohan@example.com", phone="555-0100", source="website",
            match_type="exact",
        )
        ctx = EntityContext(contacts=[entity], recency_match=False, raw_tokens=["Rohan"])

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None  # no buyer profile
        mock_cursor.fetchall.return_value = []     # no activities

        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor

        with patch("app.services.intelligence.get_conn", return_value=mock_conn):
            result = enrich_context(ctx, "agent-1")

        assert "<resolved_entities>" in result
        assert "Rohan Batre" in result
        assert "abc-123" in result

    def test_empty_context_returns_empty_string(self):
        ctx = EntityContext(contacts=[], recency_match=False, raw_tokens=[])
        result = enrich_context(ctx, "agent-1")
        assert result == ""
