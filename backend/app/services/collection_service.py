"""Validate complete batches before reusing the existing AI/database pipeline."""

import re
import hashlib
import unicodedata
from datetime import datetime, timezone

from database.models import ReviewCollection
from app.services.product_service import analyze_collected_reviews
from app.services.review_identity import fallback_id, fingerprint

from app.services.file_parser import MAX_BYTES, MAX_ROWS, CollectionValidationError, parse_file
from app.services.product_url import normalize_product_url


def product_identity(url):
    try:
        return normalize_product_url(url)
    except ValueError as error:
        raise CollectionValidationError(str(error)) from error


def field(row, *names):
    for name in names:
        if name in row and row[name] is not None and row[name] != "":
            return row[name]
    return None


def clean_string(value, name, max_length):
    if value is None:
        return ""
    if not isinstance(value, str):
        raise CollectionValidationError(f"{name} phải là chuỗi.")
    text = unicodedata.normalize("NFC", value).strip()
    if len(text) > max_length:
        raise CollectionValidationError(f"{name} dài quá {max_length} ký tự.")
    return text


def date_value(value):
    if value in (None, ""):
        return None
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise CollectionValidationError("created_at cần ngày ISO, dd/mm/yyyy hoặc Unix timestamp.")
    try:
        if isinstance(value, (int, float)) or str(value).replace(".", "", 1).isdigit():
            timestamp = float(value)
            date = datetime.fromtimestamp(timestamp / 1000 if timestamp >= 1e12 else timestamp, timezone.utc)
        else:
            try:
                date = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
            except ValueError:
                date = datetime.strptime(value.strip(), "%d/%m/%Y")
        if date.tzinfo:
            date = date.astimezone(timezone.utc).replace(tzinfo=None)
        return date.isoformat()
    except (ValueError, OSError, OverflowError):
        raise CollectionValidationError("created_at cần ngày ISO, dd/mm/yyyy hoặc Unix timestamp; để trống nếu không rõ ngày.")


def normalize_rows(rows, product_id, *, check_product_identity=True):
    if not isinstance(rows, list) or not rows or len(rows) > MAX_ROWS:
        raise CollectionValidationError("Cần từ 1 đến 10.000 review mỗi lần gửi; có thể gửi nhiều lần để gộp.")
    normalized, seen_ids, seen_fingerprints, errors = [], {}, set(), []
    blank, duplicates, generated = 0, 0, 0
    for index, row in enumerate(rows, 1):
        try:
            if not isinstance(row, dict):
                raise CollectionValidationError("Review phải là object.")
            row_product = field(row, "product_id", "itemId")
            if check_product_identity and row_product is not None and str(row_product) != product_id:
                raise CollectionValidationError("product_id không khớp URL sản phẩm.")
            if check_product_identity and row.get("product_url") and product_identity(row["product_url"])[0] != product_id:
                raise CollectionValidationError("product_url không khớp URL sản phẩm.")
            content = clean_string(field(row, "content", "review", "Review", "text", "reviewContent"), "content", 20000)
            if not content:
                blank += 1
                continue
            name = clean_string(field(row, "customer_name", "buyerName", "Buyer_Name"), "customer_name", 255) or None
            rating = field(row, "rating", "Rating")
            if rating is not None:
                if isinstance(rating, bool) or str(rating).strip() not in {"1", "2", "3", "4", "5", "1.0", "2.0", "3.0", "4.0", "5.0"}:
                    raise CollectionValidationError("rating phải là số nguyên từ 1 đến 5 hoặc để trống.")
                rating = int(float(rating))
            review_id = field(row, "review_id", "reviewId", "reviewRateId", "id")
            generated_id = review_id is None
            if not generated_id:
                if isinstance(review_id, bool) or not isinstance(review_id, (str, int)) or not re.fullmatch(r"[A-Za-z0-9_-]{1,255}", str(review_id)):
                    raise CollectionValidationError("review_id cần chuỗi ID gốc (tối đa 255 ký tự); để trống nếu không có.")
                review_id = str(review_id)
            else:
                review_id = fallback_id(product_id, content, name, rating)
            key = fingerprint(content, name, rating)
            date = date_value(field(row, "created_at", "review_date", "Date", "reviewTime"))
            if review_id in seen_ids:
                if seen_ids[review_id] != key:
                    raise CollectionValidationError("Cùng review_id nhưng nội dung/rating khác nhau.")
                duplicates += 1
                continue
            if generated_id and key in seen_fingerprints:
                duplicates += 1
                continue
            seen_ids[review_id] = key
            seen_fingerprints.add(key)
            generated += int(generated_id)
            normalized.append({"review_id": review_id, "content": content, "customer_name": name,
                               "rating": rating, "created_at": date})
        except CollectionValidationError as exc:
            if len(errors) < 20:
                errors.append(f"Review {index}: {exc}")
    if errors:
        raise CollectionValidationError("Dữ liệu chưa được lưu. " + " | ".join(errors))
    if not normalized:
        raise CollectionValidationError("Không có bình luận có nội dung để phân tích.")
    return normalized, {"received": len(rows), "accepted": len(normalized), "duplicates_in_batch": duplicates,
                        "blank": blank, "generated_ids": generated}


def collect_reviews(db, *, product_url=None, product_name, rows, source, owner_id=None):
    name = clean_string(product_name, "product_name", 500) or None
    if product_url:
        platform = "lazada"
        product_id, url = product_identity(product_url)
    else:
        if not name:
            raise CollectionValidationError("Vui lòng nhập tên sản phẩm.")
        name = " ".join(name.split())
        platform, url = "import", ""
        product_id = "file-" + hashlib.sha256(name.casefold().encode()).hexdigest()
    reviews, counts = normalize_rows(rows, product_id, check_product_identity=platform == "lazada")
    try:
        result = analyze_collected_reviews(db, url, {
            "platform": platform, "product_id": product_id, "product_name": name,
            "collection_provider": "file" if platform == "import" else "api",
            "reviews": reviews, "crawl_source": source, "crawl_status": "PARTIAL",
            "crawl_error": "Chỉ phân tích dữ liệu được gửi; chưa xác nhận đã có toàn bộ đánh giá sản phẩm.",
        }, commit=False, owner_id=owner_id, allow_file_import=platform == "import", category_url=product_url)
        # Includes existing rows whose text cannot be analyzed by the model.
        existing = result["existing_reviews"]
        counts["duplicates_in_database"] = existing
        counts["inserted"] = result["inserted_reviews"]
        batch = ReviewCollection(
            product_id=result["product_db_id"], analysis_history_id=result["analysis_history_id"],
            source=source, received_count=counts["received"], accepted_count=counts["accepted"],
            duplicate_count=counts["duplicates_in_batch"] + existing,
            blank_count=counts["blank"], generated_id_count=counts["generated_ids"],
        )
        db.add(batch)
        db.flush()
        result["collection"] = {"id": batch.id, "source": source, **counts}
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
