from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_summarize_returns_non_empty_summary():
    # Real model, real inference — slow (loads bart-large-cnn on first call),
    # but this is the "input -> non-empty string output" smoke test the
    # design spec calls for, not a unit test with a mocked model.
    text = (
        "Kubernetes is an open-source system for automating deployment, "
        "scaling, and management of containerized applications. "
    ) * 20
    response = client.post("/summarize", json={"text": text})
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["summary"], str)
    assert len(body["summary"]) > 0
