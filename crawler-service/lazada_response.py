"""Safe diagnostics for the public review response; never expose payload/session data."""
from dataclasses import dataclass

from curl_cffi.requests import exceptions

REQUEST_TIMEOUT_SECONDS = 30
MAX_REQUEST_ATTEMPTS = 2
RETRYABLE_HTTP_STATUSES = {500, 502, 503, 504}
RETRYABLE_CURL_CODES = {5, 6, 7, 16, 18, 28, 35, 52, 55, 56, 92, 95, 96}


@dataclass
class ReviewPageError(Exception):
    code: str
    message: str
    requires_verification: bool = False
    retryable: bool = False
    http_status: int | None = None
    curl_code: int | None = None
    retry_after: int = 0

    def __str__(self):
        return self.message


def transport_error(error):
    try:
        code = int(error.code)
    except (AttributeError, TypeError, ValueError):
        code = None
    if code == 28 or isinstance(error, exceptions.Timeout):
        kind, message = 'network_timeout', f'Kết nối tới Lazada quá thời gian chờ {REQUEST_TIMEOUT_SECONDS} giây/lượt.'
    elif code in {5, 6}:
        kind, message = 'dns_error', 'Không phân giải được địa chỉ kết nối tới Lazada.'
    elif code in {35, 60, 77} or isinstance(error, exceptions.SSLError):
        kind, message = 'tls_error', 'Kết nối HTTPS tới Lazada gặp lỗi TLS/chứng chỉ.'
    else:
        kind, message = 'network_error', 'Kết nối tới Lazada bị gián đoạn.'
    return ReviewPageError(kind, message, curl_code=code,
                           retryable=code in RETRYABLE_CURL_CODES or isinstance(error, exceptions.Timeout))


def validate_http_response(response):
    status = response.status_code
    if status == 200:
        return
    headers = getattr(response, 'headers', {}) or {}
    try:
        retry = max(0, int(headers.get('Retry-After', 0)))
    except (TypeError, ValueError):
        retry = 0
    location = str(headers.get('Location', '')).lower()
    verification = status in {401, 403, 429} or (300 <= status < 400 and any(
        term in location for term in ('captcha', 'punish', 'verify', 'login', '_____tmd_____')))
    raise ReviewPageError('verification_required' if verification else 'upstream_http_error',
                          f'Lazada trả HTTP {status}.', requires_verification=verification,
                          retryable=status in RETRYABLE_HTTP_STATUSES and not verification,
                          http_status=status, retry_after=retry)


def _is_access_challenge(payload):
    values = [payload.get(key) for key in ('ret', 'code', 'errorCode')]
    markers = ('FAIL_SYS_USER_VALIDATE', 'FAIL_SYS_LOGIN', 'RGV587_ERROR', 'CAPTCHA', 'ACCESS_DENIED')
    for value in values:
        candidates = value if isinstance(value, list) else [value]
        if any(isinstance(item, str) and any(marker in item.upper() for marker in markers) for item in candidates):
            return True
    return False


def parse_review_page(payload):
    if not isinstance(payload, dict):
        raise ReviewPageError('invalid_response', 'Lazada trả JSON không đúng định dạng danh sách đánh giá.')
    if _is_access_challenge(payload):
        raise ReviewPageError('verification_required', 'Lazada yêu cầu xác minh phiên hoặc giới hạn truy cập.', requires_verification=True)
    if payload.get('success') is False:
        raise ReviewPageError('invalid_response', 'Lazada báo chưa thể cung cấp danh sách đánh giá.')
    model = payload.get('model')
    model = model if isinstance(model, dict) else {}
    rows = model.get('items')
    if rows is None:
        data = payload.get('data')
        module = data.get('module') if isinstance(data, dict) else None
        rows = module.get('reviews') if isinstance(module, dict) else None
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ReviewPageError('invalid_response', 'Lazada chưa cung cấp danh sách review hợp lệ.')
    item = model.get('item')
    item = item if isinstance(item, dict) else {}
    name = model.get('productName') or item.get('itemTitle')
    name = name.strip()[:500] if isinstance(name, str) and name.strip() else None
    paging = model.get('paging')
    value = paging.get('totalPages') if isinstance(paging, dict) else None
    # Missing/bad optional metadata is not a reason to discard valid reviews.
    # Continue until an explicit empty page or repeated-page guard instead.
    try:
        total_pages = int(value) if type(value) is int or (isinstance(value, str) and value.isascii() and value.isdigit()) else None
    except ValueError:
        total_pages = None
    total_pages = total_pages if total_pages is not None and total_pages > 0 else None
    return rows, name, total_pages
