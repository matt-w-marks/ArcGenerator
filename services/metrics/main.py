from fastapi import FastAPI

app = FastAPI(title="Metrics Service")


@app.get("/health")
def health():
    return {"status": "ok", "service": "metrics"}
