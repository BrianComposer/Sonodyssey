from sonodyssey.core.schemas import HealthResponse


def test_health_response_schema() -> None:
    payload = HealthResponse(status="ok", indexed_tracks=3)
    assert payload.status == "ok"
    assert payload.indexed_tracks == 3
