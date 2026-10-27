import os
import re
import requests
from dotenv import load_dotenv

load_dotenv()
CRAWLER_URL = os.getenv("CRAWLER_SERVICE_URL", "http://localhost:8002")


class CrawlerServiceError(RuntimeError):
    """A crawler failure with an HTTP status suitable for the backend API."""

    def __init__(self, detail: str, status_code: int = 502, retry_after: str | None = None, error_code: str | None = None):
        super().__init__(detail)
        self.status_code = status_code
        self.retry_after = retry_after
        self.error_code = error_code


def crawl_product(url: str):
    try:
        response = requests.post(f"{CRAWLER_URL}/crawl", json={"url": url}, timeout=(5, None))
    except requests.Timeout as error:
        raise CrawlerServiceError("Crawler Lazada hết thời gian phản hồi.", 504) from error
    except requests.RequestException as error:
        raise CrawlerServiceError("Không kết nối được crawler Lazada.") from error
    try:
        data = response.json()
    except ValueError as error:
        raise CrawlerServiceError("Nguồn thu thập trả dữ liệu không hợp lệ; kiểm tra log crawler.") from error
    if response.status_code != 200:
        detail = data.get("detail") if isinstance(data, dict) else None
        message = detail if isinstance(detail, str) else "Crawler Lazada không xử lý được yêu cầu."
        status = 400 if response.status_code in {400, 422} else response.status_code if response.status_code in {429, 503, 504} else 502
        retry = getattr(response, "headers", {}).get("Retry-After")
        code = getattr(response, "headers", {}).get("X-Crawl-Error-Code")
        code = code if isinstance(code, str) and re.fullmatch(r"[a-z_]{1,64}", code) else None
        raise CrawlerServiceError(message, status, retry_after=retry if isinstance(retry, str) else None, error_code=code)
    if not isinstance(data, dict) or data.get("platform") != "lazada":
        raise CrawlerServiceError("Crawler chưa chạy phiên bản Lazada; hãy build lại crawler-service.")
    data["collection_provider"] = "crawler"
    return data
