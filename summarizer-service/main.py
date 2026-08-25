from fastapi import FastAPI
from pydantic import BaseModel
from transformers import pipeline

MODEL_NAME = "facebook/bart-large-cnn"

# BART's position embeddings cap around 1024 tokens; feeding more raises an
# IndexError. Truncating to the first 3000 input characters is the same
# limit used during model comparison (see the design spec's "Input-length
# caveat" — this is a deliberate simplification, not a bug: chunked/map-reduce
# summarization is explicitly out of scope for this iteration).
MAX_INPUT_CHARS = 3000

app = FastAPI()
summarizer = pipeline("summarization", model=MODEL_NAME)


class SummarizeRequest(BaseModel):
    text: str


class SummarizeResponse(BaseModel):
    summary: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/summarize", response_model=SummarizeResponse)
def summarize(request: SummarizeRequest):
    truncated = request.text[:MAX_INPUT_CHARS]
    result = summarizer(truncated, max_length=130, min_length=30, do_sample=False)
    return SummarizeResponse(summary=result[0]["summary_text"])
