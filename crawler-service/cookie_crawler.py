"""The supplied star-filter crawler, adapted to the app response contract."""
import hashlib
import json
import logging
import os
from pathlib import Path
import random
import re
import tempfile
import time
import unicodedata

import pandas as pd
from curl_cffi import requests as curl_requests
from curl_cffi.requests.cookies import Cookies
from curl_cffi.requests.exceptions import RequestException
from dotenv import dotenv_values
from lazada_common import CrawlUpstreamError, parse_product_url, normalize_review_date

from lazada_response import (
    ReviewPageError, REQUEST_TIMEOUT_SECONDS, MAX_REQUEST_ATTEMPTS,
    transport_error, validate_http_response, parse_review_page,
)

logger = logging.getLogger(__name__)


def request_review_page(session, headers, params):
    """Retry transport/5xx failures once, never an access challenge or bad JSON."""
    for attempt in range(1, MAX_REQUEST_ATTEMPTS + 1):
        try:
            response = session.get("https://my.lazada.vn/pdp/review/getReviewList", headers=headers,
                params=params, impersonate="chrome", timeout=REQUEST_TIMEOUT_SECONDS, allow_redirects=False)
            validate_http_response(response)
            return response, attempt
        except RequestException as error:
            failure = transport_error(error)
        except ReviewPageError as error:
            failure = error
        failure.attempts = attempt
        if not failure.retryable or attempt == MAX_REQUEST_ATTEMPTS or failure.retry_after > 30:
            raise failure
        logger.warning("Lazada retry product=%s stars=%s page=%s attempt=%s code=%s curl_code=%s http_status=%s",
                       params["itemId"], params["filter"], params["pageNo"], attempt,
                       failure.code, failure.curl_code, failure.http_status)
        time.sleep(max(attempt, failure.retry_after))


def crawler_settings():
    """Read mounted .env for each crawl; never log or return cookie contents."""
    path = Path(os.getenv("LAZADA_ENV_FILE", "/run/duancntt/crawler.env"))
    config = dotenv_values(path, interpolate=False) if path.is_file() else os.environ
    return {"cookie": (config.get("LAZADA_COOKIE") or "").strip(),
            "user_agent": (config.get("LAZADA_USER_AGENT") or "").strip() or None}


def cookie_jar_from_header(cookie):
    """Validate a Cookie header value and seed a private, domain-scoped jar."""
    jar = Cookies()
    if not cookie:
        return jar
    if re.match(r"(?i)^cookie\s*:", cookie) or re.search(r"[\x00-\x1f\x7f]", cookie):
        raise ValueError("LAZADA_COOKIE phải là giá trị header Cookie trên một dòng, không kèm chữ Cookie:.")
    for part in cookie.split(";"):
        if not part.strip():
            continue
        name, separator, value = part.strip().partition("=")
        if not separator or not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", name):
            raise ValueError("LAZADA_COOKIE cần có dạng ten=gia_tri; ten_khac=gia_tri_khac, không phải lệnh curl.")
        jar.set(name, value, domain=".lazada.vn", path="/", secure=True)
    return jar


def _fallback_id(product_id, content, name, rating):
    def normalize(value):
        return " ".join(unicodedata.normalize("NFC", str(value or "")).split())
    digest = hashlib.sha256(json.dumps([normalize(content), normalize(name), rating],
                            ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    return f"collected:{product_id}:{digest}"


def crawl_lazada_reviews(product_id: int, datapath: str, stars: tuple = (1, 2, 3, 4, 5),
                         max_pages: int | None = None, cookie: str | None = None, *, user_agent=None):
    """Return content-only reviews and completeness metadata in DataFrame.attrs.

    Same function interface as the supplied implementation. Defaults cover all
    five ratings. Stop on access challenges rather than continuing other filters.
    """
    if isinstance(product_id, str) and not product_id.strip().isdigit():
        product_id = parse_product_url(product_id)[0]
    if isinstance(product_id, bool) or not str(product_id).isdigit():
        raise ValueError("ID sản phẩm không hợp lệ.")
    product_id = str(int(product_id))
    if max_pages is not None and (isinstance(max_pages, bool) or not isinstance(max_pages, int) or max_pages < 1):
        raise ValueError("max_pages phải là số nguyên >= 1 hoặc None.")
    if any(isinstance(star, bool) or str(star) not in {"1", "2", "3", "4", "5"} for star in stars):
        raise ValueError("stars chỉ nhận các giá trị từ 1 đến 5.")
    stars = tuple(sorted({int(star) for star in stars}))
    if not stars: raise ValueError("stars không được để trống.")
    headers = {"Accept": "application/json, text/plain, */*",
               "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
               "Referer": f"https://www.lazada.vn/products/pdp-i{product_id}.html"}
    if user_agent:
        headers["User-Agent"] = user_agent
    cookie_jar = cookie_jar_from_header(cookie)
    reviews, seen, completed_stars = [], set(), []
    pages_attempted = pages_crawled = 0
    failure = None
    retry_after = 0
    requires_verification = False
    product_name = None
    failure_code = None
    curl_code = upstream_status = None
    request_attempts = 0
    with curl_requests.Session(cookies=cookie_jar) as session:
        for index, star in enumerate(stars):
            if index: time.sleep(random.uniform(10, 20))
            page = 1
            signatures = set()
            while max_pages is None or page <= max_pages:
                pages_attempted += 1
                try:
                    response, attempts = request_review_page(session, headers,
                        {"itemId": product_id, "pageSize": 5, "filter": star, "sort": 0, "pageNo": page})
                    request_attempts += attempts
                    try:
                        payload = response.json()
                    except ValueError:
                        raise ReviewPageError("verification_required", "Lazada trả trang xác minh thay vì JSON.",
                                              requires_verification=True, http_status=200)
                    data, name, total_pages = parse_review_page(payload)
                    pages_crawled += 1
                    if not data:
                        completed_stars.append(star)
                        break
                    signature = hashlib.sha256(json.dumps([
                        [row.get("reviewRelId") or row.get("reviewRateId") or row.get("reviewId"),
                         row.get("reviewContent"), row.get("buyerName"), row.get("rating"), row.get("reviewTime")]
                        for row in data], ensure_ascii=False).encode()).hexdigest()
                    if signature in signatures:
                        failure = f"Lazada lặp lại trang review tại {star} sao, trang {page}; chưa xác nhận đã lấy đủ."
                        break
                    signatures.add(signature)
                    if name: product_name = name
                    new_count = 0
                    for review in data:
                        content = review.get("reviewContent")
                        if not isinstance(content, str) or not content.strip(): continue
                        rating = review.get("rating")
                        if isinstance(rating, bool): continue
                        try: rating = int(rating)
                        except (ValueError, TypeError): continue
                        if rating != star: continue
                        content = content.strip()
                        customer = review.get("buyerName")
                        if not isinstance(customer, str): customer = None
                        review_id = review.get("reviewRelId") or review.get("reviewRateId") or review.get("reviewId")
                        review_id = str(review_id) if review_id is not None else _fallback_id(product_id, content, customer, rating)
                        if review_id in seen: continue
                        seen.add(review_id); new_count += 1
                        reviews.append({"review_id": review_id, "rating": rating, "title": review.get("reviewTitle"),
                            "content": content, "thank_count": review.get("likeCount"),
                            "created_at": normalize_review_date(review.get("reviewTime") or review.get("boughtDate")), "customer_name": customer})
                    logger.info("Lazada product=%s stars=%s page=%s new_reviews=%s", product_id, star, page, new_count)
                    if total_pages is not None and page >= total_pages:
                        completed_stars.append(star)
                        break
                except ReviewPageError as error:
                    failure_code = error.code
                    curl_code, upstream_status = error.curl_code, error.http_status
                    requires_verification, retry_after = error.requires_verification, error.retry_after
                    attempts = getattr(error, "attempts", 0)
                    request_attempts += attempts
                    failure = f"{error.message} Đã dừng tại {star} sao, trang {page}."
                    if attempts > 1:
                        failure += f" Đã thử {attempts} lần."
                    break
                except Exception as error:
                    failure_code = "processing_error"
                    failure = f"Lỗi xử lý phản hồi review Lazada tại {star} sao, trang {page}; xem mã processing_error trong log crawler."
                    # Exception messages can contain request/cookie data. Log
                    # only type and a fixed code, never raw exceptions/headers.
                    logger.error("Lazada processing failure product=%s stars=%s page=%s error_type=%s code=%s",
                                 product_id, star, page, type(error).__name__, failure_code)
                    break
                page += 1
                if max_pages is not None and page > max_pages:
                    failure = f"Đã đạt max_pages={max_pages} tại mức {star} sao; chưa xác nhận đã lấy đủ."
                    break
                time.sleep(random.uniform(1.5, 3.5))
            if failure: break
    frame = pd.DataFrame(reviews, columns=["review_id", "rating", "title", "content", "thank_count", "created_at", "customer_name"])
    frame.attrs["crawl"] = {"product_id": product_id, "product_name": product_name,
        "crawl_status": "FULL" if len(completed_stars) == len(stars) else "PARTIAL", "crawl_error": failure,
        "pages_attempted": pages_attempted, "pages_fetched": pages_crawled,
        "completed_stars": completed_stars, "incomplete_stars": [star for star in stars if star not in completed_stars],
        "stopped_at_star": star if failure else None, "stopped_at_page": page if failure else None,
        "requires_verification": requires_verification, "retry_after_seconds": retry_after,
        "crawl_error_code": failure_code, "curl_error_code": curl_code,
        "upstream_status": upstream_status, "request_attempts": request_attempts}
    if failure:
        logger.warning("Lazada crawl partial product=%s reviews=%s stopped_star=%s stopped_page=%s requires_verification=%s: %s",
                       product_id, len(reviews), star, page, requires_verification, failure)
        logger.warning("Lazada diagnostics product=%s code=%s curl_code=%s http_status=%s request_attempts=%s",
                       product_id, failure_code, curl_code, upstream_status, request_attempts)
    if not frame.empty and datapath:
        directory = Path(datapath); directory.mkdir(parents=True, exist_ok=True)
        # Atomic replacement keeps simultaneous same-product exports valid.
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=directory, suffix=".csv", delete=False) as stream:
                temporary = stream.name
            frame.to_csv(temporary, index=False, encoding="utf-8-sig")
            os.replace(temporary, directory / f"{product_id}_1.csv")
        finally:
            if temporary and Path(temporary).exists(): Path(temporary).unlink()
    return frame


def crawl_product_reviews(url):
    product_id, sku_id, _ = parse_product_url(url)
    settings = crawler_settings()
    if not settings["cookie"]:
        error = CrawlUpstreamError("Chưa cấu hình LAZADA_COOKIE trong .env. Cập nhật cookie rồi phân tích lại URL.")
        error.status_code = 503
        raise error
    frame = crawl_lazada_reviews(product_id, os.getenv("LAZADA_EXPORT_DIR", "/var/lib/crawler/exports"),
                                stars=(1, 2, 3, 4, 5), max_pages=None, **settings)
    metadata = frame.attrs["crawl"]
    if frame.empty and metadata["crawl_status"] == "PARTIAL":
        error = CrawlUpstreamError(metadata["crawl_error"] or "Chưa lấy được đánh giá Lazada.")
        error.status_code = 429 if metadata["requires_verification"] else 504 if metadata["crawl_error_code"] == "network_timeout" else 502
        error.error_code = metadata["crawl_error_code"]
        error.retry_after_seconds = metadata["retry_after_seconds"]
        raise error
    return {**metadata, "platform": "lazada", "sku_id": sku_id, "crawl_source": "cookie_star_filter",
            "reviews": frame.astype(object).where(pd.notna(frame), None).to_dict(orient="records"), "newly_fetched_reviews": len(frame), "cached_reviews": 0}
