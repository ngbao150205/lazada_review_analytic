from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from cookie_crawler import crawl_product_reviews
from lazada_common import CrawlUpstreamError
from lazada_response import REQUEST_TIMEOUT_SECONDS, MAX_REQUEST_ATTEMPTS

app = FastAPI(title="Lazada Cookie Crawler Service", version="3.1.0")


class CrawlRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


@app.get("/")
def home():
    return {"service": "crawler-service", "status": "running", "platform": "lazada",
            "max_pages": None, "total_timeout_seconds": None, "page_size": 5,
            "access_mode": "configured_cookie", "crawler_mode": "cookie",
            "request_timeout_seconds": REQUEST_TIMEOUT_SECONDS, "max_request_attempts": MAX_REQUEST_ATTEMPTS}


@app.post("/crawl")
def crawl(request: CrawlRequest):
    try:
        return crawl_product_reviews(request.url)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except CrawlUpstreamError as error:
        retry = getattr(error, "retry_after_seconds", 0)
        headers = {"Retry-After": str(retry)} if retry else None
        code = getattr(error, "error_code", None)
        if code:
            headers = {**(headers or {}), "X-Crawl-Error-Code": code}
        raise HTTPException(status_code=getattr(error, "status_code", 502), detail=str(error), headers=headers) from error
