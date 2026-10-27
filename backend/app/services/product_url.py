"""Validate public Lazada product URLs and discard unneeded tracking data."""
import re
from urllib.parse import urlsplit


def normalize_product_url(url: str, *, keep_sku: bool = False) -> tuple[str, str]:
    message = "Cần URL sản phẩm https://www.lazada.vn/products/...-i123-s456.html hợp lệ."
    try:
        if not isinstance(url, str) or len(url) > 32768:
            raise ValueError(message)
        value = url.strip()
        # Accept a copied Markdown/autolink without ever fetching its label.
        markdown = re.fullmatch(r"\[[^\]\r\n]*\]\((https://[^\s]+)\)", value)
        if markdown:
            value = markdown.group(1).replace(r"\&", "&")
        elif value.startswith("<") and value.endswith(">"):
            value = value[1:-1]
        if re.search(r"[\x00-\x20\\]", value):
            raise ValueError(message)
        parsed = urlsplit(value)
        if (parsed.scheme != "https" or parsed.hostname not in {"lazada.vn", "www.lazada.vn"}
                or parsed.username is not None or parsed.password is not None or parsed.port not in {None, 443}):
            raise ValueError(message)
        match = re.fullmatch(r"/products/(?:[^/]*-)?i(\d{1,32})(?:-s(\d{1,32}))?\.html/?", parsed.path)
        if not match:
            raise ValueError(message)
    except (ValueError, AttributeError) as error:
        raise ValueError(message) from error
    product_id, sku = match.groups()
    suffix = f"-s{sku}" if keep_sku and sku else ""
    return product_id, f"https://www.lazada.vn/products/pdp-i{product_id}{suffix}.html"
