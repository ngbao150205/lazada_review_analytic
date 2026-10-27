# DuanCNTT — Hệ thống phân tích đánh giá sản phẩm Lazada

Ứng dụng thu thập đánh giá tiếng Việt từ Lazada, phân tích cảm xúc bằng model
`underthesea_bilstm_custom_vocab_v3`, áp dụng rule ở backend khi model chưa đủ
tin cậy, phân loại vấn đề và phát hiện rủi ro. Kết quả được lưu trong PostgreSQL
để xem dashboard, review và lịch sử các lần phân tích.

## Chạy nhanh — 3 bước

Cài Git, mở Docker Desktop/Engine, rồi chạy:

```bash
# 1. Clone source kèm model v3
git clone --branch dev https://github.com/ngbao150205/DACNTT_HuBa.git DuanCNTT
cd DuanCNTT

# 2. Tạo .env, rồi điền LAZADA_COOKIE nếu dùng phân tích URL
cp .env.example .env
# Giữ cookie thật trong .env cục bộ, không đưa vào Git hoặc chat

# 3. Khởi chạy toàn bộ hệ thống
docker compose up -d
```

Mở **http://localhost:5173** sau khi các service sẵn sàng. Lần đầu Docker tự
build image, PostgreSQL tạo database và backend tự tạo các bảng còn thiếu.
Không cần chạy lệnh build hay tạo bảng riêng. Model v3 đã đi kèm source.

`.env.example` có sẵn cấu hình chạy local. Nhánh URL chỉ cần điền
`LAZADA_COOKIE='...'` trên một dòng trong `.env`; lấy giá trị header Cookie từ
request `getReviewList` trả JSON thành công. Không cần `LAZADA_USER_AGENT` hoặc
khóa API TinyFish. Nhánh tải CSV/Excel không cần cookie.
Có thể sửa thông tin kết nối trong `.env` nếu cần. Trên PowerShell, thay lệnh copy bằng `Copy-Item .env.example .env`.
Lần đầu có thể mất vài phút để tải dependency và nạp 5 fold của model.

Các mục bên dưới là tài liệu tham khảo, không phải các bước bắt buộc bổ sung.

## Hai cách phân tích dữ liệu

1. **URL sản phẩm:** nhập URL Lazada; crawler dùng cookie trong `.env` để gọi
   API đánh giá, chuẩn hóa review, rồi backend phân tích và lưu. Cookie được đọc
   lại mỗi lượt crawl mới, không cần restart sau khi thay cookie.
2. **Tải file CSV / Excel:** nhập tên sản phẩm, chọn `.csv`, `.xlsx` hoặc `.xls`,
   rồi phân tích. Không cần URL hoặc cookie Lazada. File cùng tên sản phẩm được
   gộp và loại review trùng trong cùng tài khoản.

Cả hai cách dùng PostgreSQL và chung pipeline model v3 / rule backend.
Cookie không bảo đảm lấy mọi review hoặc không gặp CAPTCHA. Khi có dữ liệu
một phần, hệ thống giữ review hợp lệ kèm cảnh báo và metadata của lượt crawl.

Xem [hướng dẫn URL / CSV / Excel](HYBRID_COLLECTION.md) và
[cách lấy cookie](crawler-service/README.md#cấu-hình). Cookie thật chỉ nằm trong
`.env` cục bộ, không đưa vào Git, log, chat hay giao diện.

## Mục lục

1. [Chức năng và phạm vi](#1-chức-năng-và-phạm-vi)
2. [Kiến trúc và cấu trúc mã nguồn](#2-kiến-trúc-và-cấu-trúc-mã-nguồn)
3. [Chuẩn bị máy, mã nguồn và model](#3-chuẩn-bị-máy-mã-nguồn-và-model)
4. [Triển khai lần đầu bằng Docker Compose](#4-triển-khai-lần-đầu-bằng-docker-compose)
5. [Kiểm tra và sử dụng](#5-kiểm-tra-và-sử-dụng)
6. [Luồng xử lý và model AI](#6-luồng-xử-lý-và-model-ai)
7. [Database và lịch sử](#7-database-và-lịch-sử)
8. [API](#8-api)
9. [Biến môi trường và cấu hình mạng](#9-biến-môi-trường-và-cấu-hình-mạng)
10. [Chạy từng service để phát triển](#10-chạy-từng-service-để-phát-triển)
11. [Kiểm thử](#11-kiểm-thử)
12. [Vận hành, cập nhật và phân tích lại](#12-vận-hành-cập-nhật-và-phân-tích-lại)
13. [Backup và khôi phục](#13-backup-và-khôi-phục)
14. [Triển khai trên máy chủ](#14-triển-khai-trên-máy-chủ)
15. [Xử lý lỗi thường gặp](#15-xử-lý-lỗi-thường-gặp)
16. [Checklist bàn giao](#16-checklist-bàn-giao)

## 1. Chức năng và phạm vi

| Chức năng | Cách hoạt động |
| --- | --- |
| Phân tích sản phẩm | Nhập URL Lazada, crawl review, phân tích và lưu database |
| Tải CSV / Excel | Chỉ cần tên sản phẩm và file, gộp/chống trùng và phân tích theo tài khoản |
| Sentiment | `Positive`, `Neutral`, `Negative` từ model và decision layer |
| Dashboard | Phân bố 1–5 sao, điểm sao trung bình, cảnh báo gian lận/hàng giả, cảm xúc, nhóm vấn đề và xu hướng qua các lần phân tích |
| Review | Xem nội dung, rating, sentiment, issue/risk; API có phân trang và lọc rating |
| Lịch sử | Xem sản phẩm đã lưu và snapshot thống kê của từng lần phân tích |
| Issue | Chỉ xét Neutral/Negative; Negative chưa rõ nhóm vào OTHER; lưu đoạn bằng chứng, rule, category và giải thích |
| Risk | Cờ có/không và từ khóa gian lận/hàng giả; không phân mức độ |
| Nhận xét sản phẩm | Tổng quan, 3 điểm mạnh, 3 điểm cần cải thiện và 3 việc ưu tiên; kèm số review và bằng chứng |
| Phân tích cạnh tranh | Tìm sản phẩm đã phân tích hoặc nhập URL để phân tích rồi so sánh ngay; hiển thị tên sản phẩm, tỷ lệ khen/chê, đề xuất và bằng chứng/lịch sử |
| Category | 30 ngành hàng, nhãn tiếng Việt, nhận diện loại sản phẩm từ tên và slug URL; ánh xạ sang nhóm issue |

Category bao gồm thực phẩm, mỹ phẩm, chăm sóc cá nhân, sức khỏe, mẹ và bé,
điện thoại/phụ kiện, máy tính/phụ kiện, tai nghe, gia dụng, dụng cụ, thời trang,
nhà cửa, thể thao, thú cưng và các ngành hàng khác; chưa xác định dùng `GENERAL`.
Danh mục và luồng nhận diện ở [backend/CATEGORIES.md](backend/CATEGORIES.md);
từ khóa cấu hình tại [product_category_rules.json](backend/app/rules/product_category_rules.json).
Nút **Phân tích AI lại** nhận diện lại category trước khi chạy issue trên đánh giá đã lưu.
Phần nhận xét được tạo bằng rule/mẫu câu sau mỗi lượt phân tích, lưu theo
snapshot; không cần gọi thêm AI hoặc cung cấp API key. Xem
[hướng dẫn nhận xét và đề xuất](backend/PRODUCT_INSIGHTS.md).
Mã issue trả về gồm `PRODUCT_QUALITY`, `SHIPPING_LOGISTICS`,
`CUSTOMER_SERVICE_RETURNS`, `PRICING_PROMOTIONS`, `OTHER` (Vấn đề khác). Risk chỉ gắn cờ
cho dấu hiệu như lừa đảo, hàng giả, hàng nhái, fake, giả mạo, không chính hãng,
tráo hàng; xét từng đoạn thực tế và loại phủ định. Sentiment/số sao không tự tạo
hoặc loại cảnh báo. Giao chậm, hộp móp, đổi trả và lỗi thông thường thuộc issue.
Xem [quy tắc risk](backend/RISK_RULES.md) và [cấu hình từ khóa](backend/app/rules/risk_rules.json).

Dashboard tính điểm sao trung bình và tỷ lệ từng sao trên các review đã lưu có
rating hợp lệ từ 1 đến 5; review thiếu sao được đếm riêng. Biểu đồ rủi ro chỉ
so sánh review có cảnh báo và chưa phát hiện dấu hiệu; `risk_summary` có dạng
`{"FLAGGED": n}`, mỗi review tính một lần. Biểu đồ xu hướng so sánh
tỷ lệ cảm xúc của tập review tại từng lần phân tích, không phải review mới mỗi ngày.

Các lần phân tích mới lưu thêm `rating_summary` vào lịch sử; backend tự bổ sung
cột khi khởi động, giữ nguyên dữ liệu cũ. Với lịch sử cũ chưa có thống kê số sao,
lần mới nhất hiển thị số sao **hiện có** kèm chú thích; các lần cũ hơn hiển thị
thông báo thiếu thống kê, không lấy số liệu hiện tại giả làm dữ liệu lịch sử.

Các giới hạn cần hiểu khi sử dụng:

- Crawler đang hoạt động chỉ nhận URL đầy đủ của **Lazada Việt Nam**. Dữ liệu Tiki đã lưu vẫn xem được; không đổi nhãn sàn cho dữ liệu cũ.
- So sánh cạnh tranh dựa trên review đã lưu trong tài khoản, không bảo đảm đại diện toàn bộ thị trường. Xem [cách dùng và API so sánh](backend/PRODUCT_COMPARISON.md).
- Có đăng ký, đăng nhập, đăng xuất và quên mật khẩu; dữ liệu được tách theo tài khoản.
  Mailpit chỉ nhận email thử nghiệm trên máy local.
- Phân tích là request đồng bộ, xử lý review lần lượt; chưa có hàng đợi tác vụ/background job.
- Crawler dùng cookie để gọi API đánh giá Lazada, phân trang các mức 1–5 sao
  đến khi hết dữ liệu; không giới hạn 50 review. Mỗi request có timeout 15 giây,
  không áp tổng thời gian crawl. Gặp xác minh/lỗi truy cập thì dừng và giữ dữ
  liệu đã lấy với `PARTIAL`; không tự vượt CAPTCHA hoặc thử lại liên tục.
- Repo hiện chứa inference, kiểm thử và bộ weights v3 đi kèm source; chưa có
  pipeline train đầy đủ để tái tạo model từ dataset ngay sau khi clone.

## 2. Kiến trúc và cấu trúc mã nguồn

```text
Trình duyệt → Frontend React → Backend FastAPI
                                ├─ Crawler Service → API Lazada (cookie)
                                ├─ AI Service → 5 fold của model v3
                                ├─ Decision Layer → final sentiment
                                ├─ Issue / Risk Rules
                                └─ PostgreSQL → dashboard / review / lịch sử

CSV / Excel + tên sản phẩm → API xác thực → Backend → cùng pipeline AI / database
```

### Các service

| Service Compose | Công nghệ chính | Địa chỉ từ máy host | Địa chỉ trong mạng Docker |
| --- | --- | --- | --- |
| `frontend` | React 19, TypeScript 6, Vite 8, Tailwind, Recharts | `http://localhost:5173` | `http://frontend:5173` |
| `backend` | Python 3.12, FastAPI, SQLAlchemy | `http://127.0.0.1:8000` | `http://backend:8000` |
| `ai-service` | TensorFlow 2.21.0, Keras 3.13.2, Underthesea | `http://127.0.0.1:8001` | `http://ai-service:8001` |
| `crawler-service` | FastAPI, curl_cffi, pandas | `http://127.0.0.1:8002` | `http://crawler-service:8002` |
| `postgres` | PostgreSQL 16 | `127.0.0.1:5433` | `postgres:5432` |
| `mailpit` | Hộp thư reset mật khẩu thử nghiệm | `http://localhost:8025` | SMTP `mailpit:1025` |

Phiên bản phụ thuộc chi tiết nằm trong `*/requirements.txt` và
`frontend/package-lock.json`. Dockerfile là tham chiếu môi trường chạy.

### Cây thư mục

```text
DuanCNTT/
├── README.md
├── .env.example
├── docker-compose.yml
├── .dockerignore
├── frontend/
│   ├── src/pages/                 # Analyze, History, Dashboard, Reviews, Issues, Risk...
│   ├── src/services/api.ts        # Gọi backend và kiểu dữ liệu
│   ├── src/layouts/               # Bố cục và điều hướng
│   ├── package.json
│   └── Dockerfile
├── backend/
│   ├── app/main.py                # FastAPI, tự tạo schema, CORS, router
│   ├── app/api/products.py        # API sản phẩm / phân tích / review / lịch sử
│   ├── app/services/
│   │   ├── product_service.py     # Điều phối crawl → AI → lưu / tổng hợp
│   │   ├── ai_client.py           # Gọi AI rồi quyết định final ở backend
│   │   ├── decision_layer.py      # Gate confidence cấu hình trong source và sentiment guards
│   │   ├── crawler_client.py
│   │   ├── issue_service.py
│   │   ├── risk_service.py
│   │   └── product_analysis_service.py
│   ├── app/rules/                 # JSON rule sentiment, issue, risk đang dùng
│   ├── scripts/                   # Phân tích lại dữ liệu đã lưu
│   ├── tests/                     # Kiểm thử tích hợp Lazada bằng SQLite
│   └── create_tables.py
├── ai-service/
│   ├── main.py                    # GET /health, POST /predict
│   ├── custom_vocab_predictor.py  # Predictor đang hoạt động
│   ├── models/underthesea_bilstm_custom_vocab_v3/
│   └── README.md                  # Chi tiết inference
├── crawler-service/
│   ├── main.py                    # Entry point thực tế trong Docker
│   ├── cookie_crawler.py          # Crawler cookie đang dùng, phân trang 1–5 sao
│   ├── lazada_common.py           # Kiểm tra URL và chuẩn hóa ngày
│   └── tests/                     # Kiểm thử offline và fixture cho E2E
├── database/
│   ├── models.py                  # 6 bảng hiện có + review_collections audit nhập dữ liệu
│   ├── connection.py              # Engine / session / get_db
│   ├── init_db.py
│   └── init/01-restore-backup.sh   # Import backup tùy chọn khi volume mới
└── backups/                       # Tự tạo nếu bản clone chưa có
```

AI service chỉ giữ predictor và bộ model v3 đang chạy. Rule sentiment đặt tại
`backend/app/services/decision_layer.py` và `backend/app/rules`; không còn
loader hay rule sentiment trùng lặp ở AI service. Chromium chỉ dùng trong
image kiểm thử giao diện tùy chọn, không được cài vào crawler ứng dụng.

## 3. Chuẩn bị máy, mã nguồn và model

### 3.1. Yêu cầu

- Git để clone repo.
- Docker Engine/Desktop đang chạy và Docker Compose v2 (`docker compose`).
- Internet để tải image, Python/npm packages và gọi API đánh giá Lazada.
- Cookie từ request đánh giá Lazada thành công nếu dùng nhánh URL; xem
  [hướng dẫn cookie](crawler-service/README.md#cấu-hình). Nhánh file không cần.
- Các cổng host `5173`, `8000`, `8001`, `8002`, `5433`, `5678` chưa bị ứng dụng khác chiếm.
- Khuyến nghị dành khoảng 8 GB RAM cho môi trường Docker và ít nhất 10 GB dung
  lượng trống cho image, cache build và dữ liệu. Đây là gợi ý vận hành, không phải
  cấu hình tối thiểu đã benchmark. Inference hiện có thể chạy bằng CPU.

Các lệnh dưới viết cho Bash trên Linux/macOS hoặc Windows qua WSL2.
Nếu dùng PowerShell, thao tác copy `.env` tương ứng là
`Copy-Item .env.example .env`; nên dùng `curl.exe` thay cho alias `curl`.

Kiểm tra công cụ:

```bash
git --version
docker version
docker compose version
```

### 3.2. Model đi kèm source

Nhánh `dev` chứa source và bộ model v3. Người bàn giao cần push đủ mã nguồn và
artifact trước khi người khác clone; không cần tải weights riêng hoặc dùng Git LFS.

<details>
<summary>Chi tiết bộ model — chỉ cần xem khi thay model hoặc kiểm tra lỗi thiếu file</summary>

```text
ai-service/models/underthesea_bilstm_custom_vocab_v3/
├── fold1.keras
├── fold2.keras
├── fold3.keras
├── fold4.keras
├── fold5.keras
├── vocab.json
├── label_encoder.pkl
└── inference_config.json
```

Cấu hình inference dùng 5 fold, padding/truncating `post`. Không trộn weights,
vocab hoặc label encoder của các bản khác nhau. `suspect_labels.csv` không cần
cho inference. Weights/encoder v3 được đánh dấu binary trong `.gitattributes`.

</details>

## 4. Triển khai lần đầu bằng Docker Compose

Chỉ cần ba bước ở [Chạy nhanh](#chạy-nhanh--3-bước). Lệnh `docker compose up -d`
tự thực hiện các việc sau:

1. Build image chưa có trên máy, dùng cấu hình từ `.env` gốc.
2. Khởi tạo PostgreSQL và volume lưu dữ liệu; đợi database, AI và crawler healthy.
3. Backend tự tạo các bảng còn thiếu trước khi nhận request.
4. Khởi động frontend tại **http://localhost:5173**.

Không cần tạo `backend/.env`, tạo thư mục backup hay chạy `create_tables.py`
riêng. Nếu có backup `backups/sentiment_ai_backup.sql`, cơ chế import lần đầu
vẫn hoạt động như [mục 13](#13-backup-và-khôi-phục).

Nếu cần xem tiến độ khởi động:

```bash
docker compose ps
docker compose logs -f backend ai-service
```

Backend/frontend hiện chỉ có trạng thái `Up`; PostgreSQL, AI và crawler có
healthcheck. Với source đã có image cũ trên máy, xem cách build lại tại
[mục 12](#12-vận-hành-cập-nhật-và-phân-tích-lại).

## 5. Kiểm tra và sử dụng

### 5.1. Health và database

```bash
curl -fsS http://127.0.0.1:8000/
curl -fsS http://127.0.0.1:8001/health
curl -fsS http://127.0.0.1:8002/
curl -fsS http://127.0.0.1:8000/products -H "Authorization: Bearer $PERSONAL_API_TOKEN"
```

- AI health phải báo `model_name = underthesea_bilstm_custom_vocab_v3` và 5 checkpoint.
- Lệnh `/products` cần PERSONAL_API_TOKEN tạo qua Swagger (xem AUTHENTICATION.md); thiếu xác thực trả 401.
- Với tài khoản mới, `/products` trả `{"products":[]}` là bình thường.
- Backend hoàn tất tạo schema trước khi phục vụ; `/products` kiểm tra truy vấn database hiện tại.
- Nếu vừa khởi động mà chưa kết nối được, xem log và đợi service sẵn sàng.

### 5.2. Test riêng model AI

```bash
curl -fsS http://127.0.0.1:8001/predict \
  -H 'Content-Type: application/json' \
  -d '{"text":"sản phẩm rất tốt giao hàng nhanh","rating":5}'
```

Đây là kết quả **model thuần**, chưa qua rule backend. Nhãn và confidence cụ thể
phụ thuộc văn bản, checkpoint và môi trường tiền xử lý.

### 5.3. Test model + rule backend, không lưu database

```bash
docker compose exec -T backend python - <<'PY'
import json
from app.services.ai_client import predict_sentiment

for text, rating in [("sản phẩm rất tốt giao hàng nhanh", 1), ("đeo không đau tai", 5)]:
    result = predict_sentiment(text, rating=rating)
    print(json.dumps({
        "text": text,
        "model_result": result["model_result"],
        "final": result["final"],
    }, ensure_ascii=False, indent=2))
PY
```

So sánh `model_result.confidence`, `final.rules_applied`, `final.method` và
`final.sentiment` để biết nhánh nào được chọn.

### 5.4. Phân tích sản phẩm trên giao diện

1. Đăng ký / đăng nhập ở trang chủ, chọn **Bắt đầu phân tích** (`/analyze`).
2. Dán URL sản phẩm Lazada dạng `https://www.lazada.vn/products/pdp-i3215038850-s116979513497.html`.
   Dùng link đầy đủ chứa `-i<itemId>-s<skuId>.html`; link rút gọn cần mở trong trình duyệt để lấy URL đầy đủ. Query quảng cáo được bỏ qua.
3. Nhấn phân tích và đợi request hoàn tất. Không bấm gửi liên tục trong lúc xử lý.
4. Giao diện điều hướng đến `/products/{product_db_id}/dashboard`.
5. Xem Reviews, Issues, Risk và trang History (`/history`).

Lượt phân tích có thể mất vài phút do phân trang đánh giá và backend chạy
5 fold cho từng review mới. Nguồn có thể chặn hoặc chỉ cung cấp dữ liệu một
phần. Đọc cảnh báo và metadata trước khi coi tập review là đầy đủ.

Nếu muốn gọi bằng terminal, tạo khóa qua `POST /auth/api-token` trong Swagger
như [hướng dẫn xác thực](AUTHENTICATION.md#nhập-dữ-liệu), đặt vào biến PERSONAL_API_TOKEN rồi thay URL ví dụ bằng URL Lazada thực tế còn hợp lệ:

```bash
curl -sS http://127.0.0.1:8000/products/analyze \
  -H "Authorization: Bearer $PERSONAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.lazada.vn/products/pdp-i3215038850-s116979513497.html"}'
```

Lấy **`product_db_id`** trong response để gọi các API tiếp theo; đây là ID nội bộ,
khác `product_id`/`platform_product_id` của Lazada.

```bash
SENTIMENT_PRODUCT_DB_ID=1 # Thay bằng product_db_id thực tế
curl -fsS "http://127.0.0.1:8000/products/${SENTIMENT_PRODUCT_DB_ID}/analysis" -H "Authorization: Bearer $PERSONAL_API_TOKEN"
curl -fsS "http://127.0.0.1:8000/products/${SENTIMENT_PRODUCT_DB_ID}/histories" -H "Authorization: Bearer $PERSONAL_API_TOKEN"
curl -fsS "http://127.0.0.1:8000/products/${SENTIMENT_PRODUCT_DB_ID}/reviews?page=1&page_size=10" -H "Authorization: Bearer $PERSONAL_API_TOKEN"
```

## 6. Luồng xử lý và model AI

### 6.1. Luồng phân tích sản phẩm

1. `POST /products/analyze` nhận URL.
2. Backend gọi crawler; crawler kiểm tra URL Lazada, đọc cookie từ `.env` rồi
   phân trang API đánh giá cho các mức 1–5 sao. Crawler chuẩn hóa dữ liệu, loại
   review rỗng/trùng và trả metadata. Cookie chỉ dùng phía crawler.
3. Backend tìm/tạo Product, suy luận category từ tên/URL.
4. Review mới hoặc thiếu sentiment được gửi sang AI. Review đã hoàn thiện dữ
   liệu phân tích được tái sử dụng, không tự chạy lại model mỗi lần crawl.
5. Backend `ai_client.py` nhận model output, gọi `decision_layer.py` để quyết định final.
6. Backend lưu `ReviewAnalysis`, chạy issue/risk dựa trên nội dung và final sentiment,
   cập nhật trạng thái review.
7. Tổng hợp thống kê và ghi `AnalysisHistory`; frontend đọc dữ liệu đã lưu.

Các API xem dashboard, review và history không crawl và không tự gọi AI lại.

### 6.2. Model đang hoạt động

- Model: **`underthesea_bilstm_custom_vocab_v3`**.
- 5 checkpoint; lấy trung bình vector xác suất rồi chọn lớp có xác suất lớn nhất.
- Nhánh A: word embedding → BiLSTM → Attention → average pooling.
- Nhánh B: word embedding → TextCNN với kernel 2/3/4 → max pooling.
- Nhánh C: char embedding → CharCNN với kernel 3/4/5 → max pooling.
- Hợp nhất các nhánh → Dense → softmax 3 lớp.
- Word vocab: 4.521 token; char vocab: 95 token; PAD `0`, OOV `1`.
- Đầu vào: `word_in` dài 64 token và `char_in` dài 160 ký tự.
- Model được nạp một lần khi AI service khởi động.

Tiền xử lý: NFC, lowercase, rút gọn ký tự lặp từ 3 lần trở lên thành 2, giữ chữ
tiếng Việt/Latin/số, chuẩn hóa khoảng trắng. Nhánh word dùng Underthesea và gộp
phủ định như `không` + `tốt` → `không_tốt`; nhánh char dùng text clean. Cả hai
padding/truncating `post`.

Bản artifact v3 chưa kèm code tiền xử lý riêng; pipeline đang giữ theo code
huấn luyện đã được cung cấp trước đó và cấu trúc/vocab tương thích. Khi thay
model, phải xác nhận lại pipeline này với code huấn luyện tương ứng.

Keras được cố định **3.13.2** theo metadata checkpoint; TensorFlow **2.21.0**.
Bản Keras nightly từng cho cảnh báo masking và kết quả khác trên cùng đầu vào,
nên không tự đổi runtime sang nightly.

### 6.3. Quyết định final ở backend

Decision layer dùng rule **`idea_context_v3`**. Ngưỡng tin model được cấu
hình bằng `MODEL_CONFIDENCE_THRESHOLD` trong `decision_layer.py`.
Xem [luồng chi tiết, kết quả trước/sau và lệnh test](backend/tests/DECISION_LAYER_AUDIT.md).
Các sửa lỗi từ review thực tế và URL quá dài nằm tại
[REAL_REVIEW_REGRESSIONS.md](backend/tests/REAL_REVIEW_REGRESSIONS.md).
Luồng đoạn ý, kiểm tra mâu thuẫn và lưu trace hiện tại được mô tả tại
[IDEA_RULES_V3.md](backend/tests/IDEA_RULES_V3.md).

| Điều kiện (xét theo thứ tự) | Xử lý |
| --- | --- |
| Negative + 4–5 sao hoặc Positive + 1–2 sao | Luôn kiểm tra từng đoạn ý, kể cả confidence bằng 1; không tự đảo nhãn theo sao |
| Không thuộc nhóm trên và confidence `>= MODEL_CONFIDENCE_THRESHOLD` | Giữ nguyên nhãn/confidence model |
| Các trường hợp còn lại | Xét từng đoạn ý, ngữ cảnh, khía cạnh và policy số sao để chọn final |

So sánh trước khi làm tròn: ví dụ ngưỡng 0.8 thì đúng 0.8 dùng model,
0.799999 vẫn chạy rule. Hai nhóm mâu thuẫn sao luôn được kiểm tra, kể cả
khi gate là 0.1; gate thấp không còn vô hiệu hóa toàn bộ sentiment rule.
Ngưỡng của container đang chạy được trả trong
response phân tích lại, không tự thay đổi khi chỉ sửa file trên host.
Confidence model không phải cam kết accuracy. Rating không phải đầu vào model.

Luồng rule mới:

1. Tách đoạn ý trước khi gom khoảng trắng: giữ xuống dòng, bảo vệ số thập
   phân/URL/chữ viết tắt, ghép ngắt dòng giữa một cụm hoặc phủ định đã nhận
   diện. Sau đó chuẩn hóa NFC, chữ thường và biến thể chữ trong từng đoạn.
2. Giữ quan hệ dấu câu/liên từ, khía cạnh và marker ngữ cảnh. Phân biệt
   trải nghiệm thực tế, câu giả định/chưa dùng, lời dẫn và sự cố cũ có cập nhật.
3. Chọn cụm dài nhất không chồng lấn, xử lý phủ định cục bộ; kết luận từng
   đoạn trước khi tổng hợp. Mỗi đoạn góp tối đa một phiếu mỗi cực, không
   tăng điểm từ bản sao cùng bằng chứng. Unknown không được tính là Neutral.
4. Nếu nhận diện được **cả khen và chê thực tế**, áp dụng
   `mixed_sentiment_rating_policy`: **3–4 sao → Neutral; 5 sao → Positive**.
   Nhánh này ưu tiên trước kết luận tổng thể, lỗi nghiêm trọng trong sentiment
   và `keep_model` của policy xung đột cũ. Issue/risk tiếp tục được xét riêng.
5. Các trường hợp còn lại xét kết luận tổng thể hoặc bằng chứng nội dung.
   **Chỉ chê và 1–2 sao → Negative**; chỉ chê ở sao cao vẫn có thể Negative.
   Mixed ở 1–2 sao hoặc thiếu/sai số sao dùng luồng nội dung cũ. Thiếu bằng
   chứng thì giữ model/đánh dấu xem lại; không ép nhãn chỉ từ số sao.

Ví dụ `Âm thanh tốt nhưng pin hơi yếu`: 3 hoặc 4 sao là Neutral; 5 sao là
Positive. `Không tốt, không hài lòng` không phải mixed vì các từ khen đã bị
phủ định. Tiêu đề mẫu, lời shop quảng cáo, giả định, sự cố cũ đã được xử lý
không được tính như nhận định thực tế hiện tại. Một số mẫu mỉa mai rõ, kèm
lời chê và kết luận tiêu cực, được loại khỏi bằng chứng khen; đây vẫn là bộ
rule, không bảo đảm hiểu mọi cách diễn đạt.

V2.1 tách tiêu đề mẫu `Dễ sử dụng:`, `Độ bền:` khỏi phần trả lời. Mệnh đề xã
giao/thông tin không được tự động phủ quyết nhiều nhận định khen rõ; mệnh đề
nghi có phàn nàn vẫn chặn override Positive. Mô tả loại sản phẩm thuần túy có
thể về Neutral khi model chưa chắc chắn (`descriptive_confidence_threshold`,
mặc định 0.65). Giao trễ tối đa một ngày kèm lời khen theo policy mixed mới:
3–4 sao Neutral, 5 sao Positive. Issue chỉ xét Neutral/Negative theo policy hiện tại.
Risk xét riêng dấu hiệu gian lận/hàng giả, không đánh dấu độ trễ giao hàng.

URL Lazada được xác thực và chuẩn hóa trước khi crawl/lưu: bỏ tracking,
fragment, slug dài; SKU được giữ khi gọi crawler, database dùng URL theo
product ID. Link hơn 1.000 ký tự không còn được ghi nguyên vào `products.url`.

Các nhóm từ, marker, mốc sao, `rule_version`, `rule_confidence` nằm trong
`backend/app/rules/sentiment_decision_rules.json`. Các mốc sao phải thỏa
`negative_rating_threshold < neutral_rating < positive_rating_threshold`, đều
là số nguyên 1–5. `neutral_rating` dùng phân nhóm sao; không còn guard ép mọi
review mức sao trung lập thành Neutral.

Tên policy cũ được giữ để tương thích cấu hình:

| Policy | Giá trị hỗ trợ | Hành vi v2 |
| --- | --- | --- |
| `positive_model_low_rating` | `review_text_then_rating`, `keep_model` | Xét nội dung; không đổi chỉ vì sao thấp |
| `negative_model_high_rating` | `review_text_then_rating`, `keep_model` | Xét nội dung; không đổi chỉ vì sao cao/thiếu keyword |
| `neutral_model_extreme_rating` | `rating_if_text_clear`, `keep_model` | Nội dung rõ có thể đổi Neutral, kể cả khi sao mâu thuẫn |

`keep_model` chặn override khi có xung đột model/rating tương ứng, ngoại trừ
nhánh mixed theo sao ở trên và sửa phủ định thuần tích cực. Policy không hỗ
trợ sẽ báo lỗi. Mapping mixed nằm trong JSON, chỉ nhận khóa sao `"1"`–`"5"`
và nhãn Positive/Neutral/Negative; hiện cấu hình các khóa 3, 4, 5.

Backend giữ `model_result`, `raw_sentiment`, `raw_confidence` và trả `final`
mới. Có thêm `rules_version`, `label_overridden`, `mixed_sentiment`,
`needs_review`, `confidence_source` và trace evidence theo mệnh đề. Offset
của mỗi match trỏ vào `normalized_text` của mệnh đề, không phải review gốc.
Nếu giữ nhãn thì giữ xác suất model; nếu đổi nhãn thì dùng confidence heuristic
cấu hình riêng (Positive 0.75, Negative 0.70, Neutral 0.60), không kế thừa xác
suất nhãn cũ và không coi đây là xác suất đã hiệu chỉnh.

Sentiment `idea_context_v3_3` nhận diện thêm lời khen như “size đúng theo bảng
đo”, “chất liệu chắc chắn”, “không cần đổi trả”, “không có sai sót” và “không
phải đợi quá lâu”. Phân biệt với “không được đổi trả”, “có sai sót” và các
phàn nàn khác trong cùng review. Xem [rule phủ định tích cực và test hồi quy](backend/tests/POSITIVE_NEGATION_RULES.md).

Sentiment v3.3 và issue v8 bổ sung tiếng lóng “đỉnh điên”, kiểm tra phần trả
lời có chuỗi chữ nhiễu, thiếu quà tặng có lời hứa, dịch vụ không giải quyết,
lỗi kết nối và thông tin gây nhầm lẫn. Xem [rule và test review camera](backend/tests/CAMERA_REVIEW_RULES.md).

Database lưu nhãn/confidence final, model version, method và JSON
`review_analysis.decision_details` chứa raw/final, lý do và evidence từng
đoạn. Migration chỉ thêm cột nullable, dữ liệu cũ chưa có trace vẫn là null.
API review trả trace tại `sentiment.decision_details`; dashboard chưa hiển
thị chi tiết từng đoạn. Issue chạy bằng final sentiment; risk xét riêng từ khóa
gian lận/hàng giả trên mọi nhãn và số sao. Gate sentiment không bỏ qua hai bước này.

Issue dùng chung bộ phân đoạn và ngữ cảnh v3 của sentiment. Lời dẫn, giả định,
bất định hoặc khen ngợi không còn lọc cả review; mỗi lần xuất hiện keyword
được kiểm tra theo đoạn chứa nó và phủ định ngay tại vị trí đó. Issue v7 chỉ
áp dụng cho nhãn cuối Neutral/Negative; Positive không có issue. Trọng số
được cấu hình theo rule, không tính theo số từ hoặc cộng bonus số sao.
Các từ chê chung “tệ”, “dở”, “dởm/dỏm/rởm” thuộc chất lượng sản phẩm. Rule
hỗ trợ vải quá mỏng, lỗi đường may, size không chính xác và màu không giống
ảnh; “khá lâu” chỉ được gán vận chuyển khi đúng ngữ cảnh giao hàng. Hộp ngoài
móp được gán vận chuyển; mỹ phẩm vỡ, thiếu quà tặng đã hứa và từ chối đổi trả
có rule riêng. Bằng chứng có thể kèm đoạn ngữ cảnh liên quan như lời hứa tặng cọ.
Negative chưa có bằng
chứng đủ rõ để gán nhóm cụ thể được đưa vào OTHER và ghi rõ cần kiểm tra thêm. Lưu proof ở
`issue_analysis.evidence` và kết quả cần kiểm tra ở `reviews.issue_assessment`;
Reviews/Issues có mục xem bằng chứng và lý do fallback. Xem [Issue v7 và ví dụ kiểm thử](backend/tests/ISSUE_RULES_V7.md).

Rule nạp khi backend khởi động. Sau khi sửa source/JSON, áp dụng bằng
`docker compose up -d --no-deps --build backend`. Review đã phân tích và các
snapshot lịch sử không tự thay đổi; script rebuild chỉ chạy khi chủ động gọi.

Nguồn điều chỉnh:

- [Decision layer](backend/app/services/decision_layer.py): ngưỡng confidence và quyết định final.
- [Evidence parser](backend/app/services/sentiment_evidence.py): chuẩn hóa, mệnh đề, ngữ cảnh, phạm vi phủ định.
- [Sentiment rules](backend/app/rules/sentiment_decision_rules.json): cấu hình từ và ngữ cảnh.
- [Issue service](backend/app/services/issue_service.py) và [risk service](backend/app/services/risk_service.py): xử lý sau final.

### 6.4. Review không thể phân tích

Review chỉ emoji/dấu câu có thể rỗng sau clean. AI trả HTTP 422 với thông báo
`Review text is empty after preprocessing`; backend nhận diện trường hợp này,
giữ review gốc, không tạo sentiment giả và tiếp tục các review còn lại.

Response phân tích có `unanalyzable_reviews` và `unanalyzable_review_ids`.
Vì vậy `total_reviews` có thể lớn hơn `analyzed_reviews`. Các lỗi AI khác không
bị bỏ qua theo cơ chế này; cần đọc detail/log để xử lý.

## 7. Database và lịch sử

| Bảng | Vai trò |
| --- | --- |
| `products` | Chủ sở hữu, nguồn Lazada/file, URL, tên, category và thời điểm cập nhật |
| `reviews` | Nội dung gốc, rating, ngày review và trạng thái phân tích |
| `review_analysis` | Sentiment/confidence final, `model_version`, `analysis_method` |
| `issue_analysis` | Nhóm issue, keyword tóm tắt và JSON bằng chứng (đoạn, rule, category, lý do, trọng số) |
| `risk_detection` | `risk_flag`, keyword và phiên bản rule; cột mức độ cũ được giữ nullable để tương thích |
| `analysis_history` | Snapshot sentiment, issue/risk, số sao và nhận xét/bằng chứng theo lần phân tích |
| `review_collections` | Audit lần nhập CSV/Excel (và client API cũ), thống kê chống trùng và liên kết snapshot |
| `users`, `auth_sessions` | Tài khoản và phiên đăng nhập có thể thu hồi |
| `password_reset_tokens`, `user_api_tokens` | Token băm để reset mật khẩu và gọi API cá nhân |
| `auth_throttles` | Bộ đếm giới hạn thử đăng nhập/đăng ký/khôi phục |

Product có khóa duy nhất theo `(owner_id, platform, platform_product_id)`; Review
theo `(product_id, platform, platform_review_id)`. Sản phẩm, review và lịch sử
được giới hạn theo tài khoản đăng nhập. Đổi model/rule không tự phân tích lại dữ liệu cũ.
Tỷ lệ sentiment được tổng hợp trên review đã có analysis; có thể lệch nhẹ tổng
100% do làm tròn.

`analysis_history` lưu thống kê tổng hợp, không đóng băng đầy đủ nội dung và
kết quả của từng review ở thời điểm cũ. Các script rebuild không tự tái tạo
snapshot lịch sử. Chi tiết model/schema: [database/models.py](database/models.py).

Backend tạo bảng còn thiếu và chạy migration xác thực tự động khi khởi động,
trong một transaction có advisory lock. Migration thêm chủ sở hữu và cập nhật
unique sản phẩm/review; giữ nguyên dữ liệu. Xem [quyền dữ liệu cũ](AUTHENTICATION.md#dữ-liệu-trước-khi-có-đăng-nhập).
Những thay đổi schema khác vẫn cần migration phù hợp.

Dữ liệu PostgreSQL nằm trong named volume `postgres_data` của Compose project,
không nằm trong image backend. `docker compose down` giữ volume; `down -v` xóa
volume và dữ liệu. Không dùng `down -v` như thao tác sửa lỗi thông thường.

## 8. API

Swagger/OpenAPI khi service chạy:

- Backend: http://127.0.0.1:8000/docs
- AI: http://127.0.0.1:8001/docs
- Crawler: http://127.0.0.1:8002/docs

### Backend — cổng 8000

Các API `/products/*` và `/collections/*` cần cookie đăng nhập hoặc Bearer cá nhân.
Thiếu xác thực trả 401; sản phẩm của tài khoản khác trả 404. Luồng đăng ký,
đăng nhập và khôi phục mật khẩu: [API Authentication](AUTHENTICATION.md#api).

| Method | Endpoint | Ý nghĩa |
| --- | --- | --- |
| GET | `/` | Process backend đang chạy |
| GET | `/products` hoặc `/products/` | Danh sách sản phẩm đã lưu |
| GET | `/products/collection-config` | Nhánh thu thập URL: crawler cookie Lazada |
| POST | `/products/analyze` | Body `{"url":"URL_LAZADA"}`; lấy review qua crawler cookie, phân tích, ghi database |
| GET | `/products/{product_id}/insights/evidence` | Review hỗ trợ nhận xét, có phân trang và xác thực theo chủ sở hữu |
| POST | `/products/{product_id}/reanalyze` | Chạy AI/rule lại trên toàn bộ review đã lưu của sản phẩm thuộc tài khoản; không crawl; cập nhật issue/risk và tạo snapshot mới |
| GET | `/collections/status` | Kiểm tra khóa nhập dữ liệu và giới hạn upload |
| POST | `/collections/reviews` | Nhận JSON cho client API cũ; cần cookie / Bearer cá nhân |
| POST | `/collections/import` | Import bytes CSV/Excel với tên sản phẩm; cần cookie / Bearer cá nhân; xem [hợp đồng API](HYBRID_COLLECTION.md#api) |
| GET | `/products/{product_id}/analysis` | Dashboard; có query `history_id` để chọn snapshot |
| GET | `/products/{product_id}/histories` | Danh sách snapshot của sản phẩm |
| GET | `/products/{product_id}/reviews` | Query `page=1`, `page_size=10`, `rating` tùy chọn |

`{product_id}` trên URL API là **ID nội bộ database**. `page_size` được giới hạn
tối đa 100. Sản phẩm không tồn tại trả 404. Các lỗi xử lý trả detail trong JSON;
frontend Analyze hiển thị detail chuỗi từ backend.

### AI — cổng 8001

| Method | Endpoint | Ý nghĩa |
| --- | --- | --- |
| GET | `/` | Tên service, model và checkpoint |
| GET | `/health` | Model đã được nạp và service sẵn sàng |
| POST | `/predict` | Body `{"text":"...","rating":5}` |

`text` dài 1–5.000 ký tự; rating tùy chọn trong khoảng 1–5. AI trả sentiment,
confidence, probabilities, model name, checkpoint và `final` của model thuần.
Chỉ khi đi qua backend client thì `final` mới được quyết định lại theo confidence/rule.

### Crawler — cổng 8002

| Method | Endpoint | Ý nghĩa |
| --- | --- | --- |
| GET | `/` | Trạng thái process |
| POST | `/crawl` | Body `{"url":"URL_LAZADA"}`; trả platform=lazada, product ID, sku_id, tên và reviews |

Crawler gọi API đánh giá Lazada qua
[`cookie_crawler.py`](crawler-service/cookie_crawler.py). `GET /` trả
`crawler_mode=cookie`, `access_mode=configured_cookie`. Thiếu `LAZADA_COOKIE`
trả `503` trước khi gọi nguồn; URL/cookie sai định dạng trả `400`. Gặp xác minh
mà chưa lấy được review trả `429`; timeout mạng trả `504`; lỗi nguồn khác có thể trả `502`.

Kết quả có `crawl_source=cookie_star_filter`, `crawl_status` (`FULL`/`PARTIAL`),
`crawl_error`, `crawl_error_code`, `curl_error_code`, `request_attempts`,
`requires_verification` và các mức sao chưa hoàn tất. Backend
thêm `collection_provider=crawler`. Có dữ liệu một phần thì vẫn phân tích/lưu
review hợp lệ, hiển thị cảnh báo. Khi không có review mới, kết quả các lần
phân tích trước vẫn được giữ. `FULL` chỉ phản ánh các trang API đã đọc, không
cam kết những review bị nguồn ẩn hoặc không truy cập được.

Chỉ cần `LAZADA_COOKIE`; User-Agent mặc định do `curl_cffi` cung cấp. Crawler
không giới hạn số review hay tổng thời gian, mỗi request có timeout 30 giây
và thử lại tối đa một lần khi có lỗi kết nối tạm thời hoặc HTTP 5xx phù hợp.
Không retry CAPTCHA/giới hạn truy cập. Mã `network_timeout` (curl 28) phân biệt
với `verification_required`; log không in dữ liệu cookie hoặc exception thô.
Backend còn chạy AI/rule sau đó; mỗi lần gọi AI có timeout 60 giây riêng.
Cookie không bảo đảm tránh CAPTCHA. Test offline không xác nhận truy cập
Lazada thật thành công.

Chi tiết cấu hình và giới hạn nằm trong [README crawler](crawler-service/README.md)
và [hướng dẫn URL / file](HYBRID_COLLECTION.md). `sku_id` được ghi nhận từ URL;
review trích xuất có thể thuộc toàn listing, không bảo đảm chỉ một SKU.
Ngày review được chuẩn hóa trước khi backend lưu database. Backend lưu
`platform=lazada`; các bản ghi `platform=tiki` có sẵn giữ nguyên và không bị
trùng ID với dữ liệu mới. Không cần đổi schema hay xóa volume database.

## 9. Biến môi trường và cấu hình mạng

| Biến | Dùng ở đâu / ý nghĩa |
| --- | --- |
| `POSTGRES_USER` | User khởi tạo PostgreSQL |
| `POSTGRES_PASSWORD` | Password user PostgreSQL |
| `POSTGRES_DB` | Database khởi tạo |
| `DATABASE_URL` | SQLAlchemy kết nối PostgreSQL |
| `AI_SERVICE_URL` | Backend gọi `/predict`; trong Compose là `http://ai-service:8001` |
| `CRAWLER_SERVICE_URL` | Backend gọi `/crawl`; trong Compose là `http://crawler-service:8002` |
| `BACKEND_URL` | Có trong `.env.example`, chưa được frontend hiện tại dùng để chọn URL API |
| `APP_ENV` | Có trong `.env.example`, chưa tự chuyển CORS/URL hay thay cấu hình deployment |
| `AUTH_FRONTEND_URL` | Origin website và gốc link reset; mặc định `http://localhost:5173` |
| `AUTH_COOKIE_SECURE` | `false` cho local HTTP, `true` khi triển khai HTTPS |
| `SMTP_HOST` / `SMTP_PORT` | Mailpit `mailpit:1025`, UI email thử tại `localhost:8025` |
| `LAZADA_COOKIE` | Giá trị header Cookie từ request `getReviewList` thành công; đặt trong nháy đơn trên một dòng, chỉ lưu cục bộ |
| `LAZADA_ENV_FILE` | Compose đặt `/run/duancntt/config/.env` để crawler đọc lại cookie mỗi lượt |

File `.env.example` có sẵn cấu hình local cho Compose. Nếu đổi username,
password hoặc database, sửa đồng bộ các biến PostgreSQL và `DATABASE_URL`.
Password có ký tự đặc biệt trong URL cần URL-encode. Không commit `.env` thật.
Crawler đọc lại `LAZADA_COOKIE` khi bắt đầu lượt mới; thay cookie không cần
restart hoặc build lại. Các biến service khác vẫn cần recreate container khi thay đổi.
Trong Docker, dùng `postgres:5432`; backend native trên host dùng `127.0.0.1:5433`.

`database/connection.py` tìm `database/.env` nếu file đó tồn tại, nếu không dùng
`load_dotenv()`. Biến đã có trong process được ưu tiên. Với Docker, dùng `.env`
gốc qua Compose; với native, export đúng giá trị như mục 10 để tránh hostname Docker.

Frontend gọi API qua `frontend/src/services/http.ts`, dùng cùng hostname với
website và cổng 8000. Có thể đặt VITE_API_URL khi chạy Vite/build. `BACKEND_URL`
trong `.env` không tự đổi URL frontend. Cookie được gửi bằng credentials include;
không trộn localhost và 127.0.0.1 giữa UI/API. Backend cho phép origin cấu hình
AUTH_FRONTEND_URL và hai origin local cổng 5173. Khi đổi domain phải cập nhật
AUTH_FRONTEND_URL, API URL và HTTPS/Secure cookie đồng bộ.

## 10. Chạy từng service để phát triển

Khuyến nghị Docker nếu chỉ cần sử dụng. Native phù hợp khi sửa code/hot reload.
Ví dụ dưới dành cho Bash/Linux/macOS; mỗi terminal bắt đầu từ thư mục gốc repo.
Dùng Python **3.12** như Dockerfile; không dùng chung venv của dự án khác.
Frontend cần Node `^20.19.0` hoặc `>=22.12.0` theo Vite đang dùng.

### Terminal 1 — PostgreSQL trong Docker

Chuẩn bị `.env` như mục 4, rồi:

```bash
docker compose up -d postgres
```

Đợi healthy. Nếu các container app khác đang chạy, dừng chúng trước để tránh
trùng cổng với các process native:

```bash
docker compose stop frontend backend ai-service crawler-service
```

### Terminal 2 — AI

```bash
cd ai-service
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8001
```

Phải có đủ bộ model như mục 3.2. Không cần GPU để chạy luồng hiện tại.

### Terminal 3 — Crawler

```bash
cd crawler-service
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
LAZADA_ENV_FILE=../.env python -m uvicorn main:app --host 127.0.0.1 --port 8002
```

### Terminal 4 — Backend

Thay thông tin database mẫu bằng bộ giá trị đã đặt trong `.env`:

```bash
python3.12 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
export DATABASE_URL='postgresql://my_db_user:my_db_password@127.0.0.1:5433/my_database_name'
export AI_SERVICE_URL='http://127.0.0.1:8001'
export CRAWLER_SERVICE_URL='http://127.0.0.1:8002'
python -m uvicorn --app-dir backend app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Terminal 5 — Frontend

```bash
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Mở http://localhost:5173. Nếu Vite tự chọn cổng khác vì 5173 đang bận, giải phóng
cổng hoặc cập nhật CORS cho cổng mới.

## 11. Kiểm thử

Chạy sau `docker compose up -d` và đợi các service sẵn sàng. Các lệnh dưới
kiểm tra nhanh hệ thống đang chạy. Bộ kiểm thử offline cho chuyển đổi Lazada được hướng dẫn bên dưới.

### Kiểm thử offline crawler và backend

Sau khi build lại image theo source mới:

```bash
docker compose run --rm --no-deps crawler-service python -m unittest discover -s tests -p test_cookie_crawler.py -v
docker compose run --rm --no-deps -e DATABASE_URL=sqlite:///:memory: backend python -m unittest discover -s tests -v
```

Các test dùng HTTP giả lập/localhost và SQLite tạm; không gọi Lazada/AI thật,
không dùng cookie thật hoặc database sản phẩm. Chúng kiểm tra cấu hình cookie,
phân trang, session, chuẩn hóa review, chống trùng và dữ liệu một phần.
Test offline không chứng minh crawler lấy được review Lazada thật.

### Backend

```bash
curl -fsS http://127.0.0.1:8000/
curl -fsS http://127.0.0.1:8000/products -H "Authorization: Bearer $PERSONAL_API_TOKEN"
```

API gốc trả 200; `/products` cần PERSONAL_API_TOKEN tạo qua Swagger (xem AUTHENTICATION.md)
và trả danh sách riêng của tài khoản. Thiếu/sai khóa trả 401.

### AI

```bash
curl -fsS http://127.0.0.1:8001/health
curl -fsS http://127.0.0.1:8001/predict \
  -H 'Content-Type: application/json' \
  -d '{"text":"sản phẩm rất tốt giao hàng nhanh","rating":5}'
```

Response phải có `model_name` là `underthesea_bilstm_custom_vocab_v3`.
`/health` liệt kê đủ 5 checkpoint; `/predict` trả sentiment và confidence.
Đây là kết quả model; backend mới áp dụng ngưỡng hiện tại trong `decision_layer.py` khi phân tích sản phẩm.

### Frontend

```bash
docker compose run --rm --no-deps frontend npm run build
```

Lệnh kiểm tra TypeScript và bundle Vite. Nếu chạy native: `cd frontend`,
`npm ci`, `npm run build`.

### Crawler thật — tùy chọn, cần Internet và cookie Lazada

```bash
curl -fsS http://127.0.0.1:8002/crawl \
  -H 'Content-Type: application/json' \
  -d '{"url":"URL_SAN_PHAM_LAZADA_CON_HIEU_LUC"}'
```

Thay `URL_SAN_PHAM_LAZADA_CON_HIEU_LUC` bằng URL thật trước khi chạy, điền
`LAZADA_COOKIE` trong `.env`. Lệnh này gọi API Lazada thật và sử dụng cookie
cục bộ. Kiểm tra trạng thái/cảnh báo và metadata để biết dữ liệu có đầy đủ hay
không. Test offline không chứng minh đã chạy thành công lệnh này.

## 12. Vận hành, cập nhật và phân tích lại

### Lệnh thường dùng

```bash
docker compose ps
docker compose logs -f backend ai-service crawler-service
docker compose logs --tail 100 frontend
docker compose restart backend
docker compose stop
docker compose start
docker compose down
```

`stop/start` giữ container; `down` bỏ container/network nhưng giữ named volume.
Với container mới từ đầu dùng `up -d`, không dùng `start`.

### Sau khi sửa source, model hoặc rule

Dockerfile copy source vào image, không bind mount source để tự cập nhật:

```bash
# Thay model, predictor hoặc rule sentiment backend
docker compose up -d --build ai-service backend

# Thay frontend
docker compose up -d --build frontend
```

`restart` không build/copy mã nguồn mới. Model và JSON rule được nạp khi process
khởi động; thay file trên host rồi chỉ mở lại trang web không cập nhật container.

### Phân tích lại review đã lưu

**Trên giao diện, theo từng sản phẩm:**

1. Sau khi sửa model/rule/ngưỡng, build và khởi động lại dịch vụ tương ứng
   theo hướng dẫn ở trên. Sửa rule hoặc ngưỡng backend chỉ cần build backend.
2. Vào **Lịch sử → mở Dashboard** của sản phẩm đã có review.
3. Bấm **Phân tích AI lại**, chờ tác vụ hoàn tất. Toàn bộ review hiện có
   được xử lý, kể cả review đã phân tích; không gọi Lazada hoặc cần cookie.
4. Dashboard tự chuyển sang snapshot mới, báo số review xử lý, số nhãn thay
   đổi và ngưỡng tin model đã sử dụng. Dùng **Chuyển lần phân tích** để so
   sánh các thống kê cũ/mới.

Chức năng áp dụng cho dữ liệu thu từ URL và dữ liệu nhập file. Cảm xúc,
confidence, method, issue và risk được tính lại bằng pipeline hiện tại.
Review không đủ văn bản cho AI được đếm riêng, không giữ nhãn sentiment cũ.
Nếu AI hoặc database lỗi, toàn bộ thay đổi của lượt đó được rollback.
Sản phẩm đang xử lý trả 409; sản phẩm không có review trả 400. Thời gian
chạy phụ thuộc số review; giữ trang mở trong lúc xử lý.

Snapshot thống kê cũ được giữ nguyên; nhãn/issue/risk của từng review phản
ánh lần chạy mới nhất, không phải bản sao riêng cho từng lịch sử. Nút chạy
trên toàn bộ review hiện có, kể cả khi đang xem một snapshot cũ.

API tương đương (dùng ID nội bộ database):

```bash
curl -fsS -X POST "http://127.0.0.1:8000/products/${SENTIMENT_PRODUCT_DB_ID}/reanalyze" \
  -H "Authorization: Bearer $PERSONAL_API_TOKEN"
```

Response có `analysis_history_id`, `reanalyzed_reviews`, `skipped_reviews`,
`changed_sentiments`, `decision_methods`, `analysis_config` (ngưỡng, version
sentiment/category/issue rule), `classification` (category cũ/mới, tên tiếng Việt,
nguồn nhận diện và từ khóa khớp) và `analysis` mới. API yêu cầu đăng nhập hoặc token cá nhân;
chỉ xử lý sản phẩm của tài khoản đó. Lỗi AI/response model trả 502, lỗi lưu
khác trả 500; cả hai đều không lưu một phần kết quả.

**Các script quản trị cũ (có thể ảnh hưởng nhiều sản phẩm/tài khoản):**

Các script sau **ghi lại dữ liệu phân tích**. Backup database trước khi chạy;
không chạy song song với một đợt phân tích sản phẩm khác.

```bash
# Gọi model v3 + decision layer cho các review đã lưu, không crawl Lazada
docker compose exec -T backend python scripts/rebuild_sentiment_analysis.py

# Dùng sentiment đã lưu để chạy lại issue/risk
docker compose exec -T backend python scripts/rebuild_issue_analysis.py
docker compose exec -T backend python scripts/rebuild_risk_detection.py

# Risk có thể giới hạn theo ID nội bộ sản phẩm
docker compose exec -T backend python scripts/rebuild_risk_detection.py --product-id 1 --batch-size 500
```

Đọc log `rebuilt/skipped/failed`. Script sentiment có thể báo `FAILED` cho review
chỉ emoji vì chưa có cơ chế đếm riêng như API phân tích sản phẩm; nó không gán
sentiment giả. Script issue dùng rating và category của từng product.

Các script không tự cập nhật snapshot cũ trong `analysis_history`. Không xem
việc đổi weights/rule là thao tác tự động sửa mọi kết quả đã lưu.

## 13. Backup và khôi phục

### Backup database đang chạy

```bash
mkdir -p backups
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' \
  > backups/sentiment_manual.sql
```

Kiểm tra lệnh thành công và file backup có dữ liệu. File này không được commit
theo `.gitignore`. `--no-owner --no-privileges` giúp chuyển sang môi trường dùng
user PostgreSQL khác mà không cần tạo lại owner của máy nguồn.

### Khôi phục vào database kiểm tra riêng

Ví dụ tạo một database mới tên `sentiment_restore_check`; không ghi đè database
đang dùng:

```bash
docker compose exec -T postgres sh -c \
  'createdb -U "$POSTGRES_USER" sentiment_restore_check'
docker compose exec -T postgres sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d sentiment_restore_check' \
  < backups/sentiment_manual.sql
```

Kiểm tra schema/dữ liệu trước khi quyết định chuyển ứng dụng sang database đó.
Database kiểm tra chỉ được tạo một lần; nếu tên đã tồn tại, chọn tên mới thay vì
tự xóa dữ liệu. Khi đổi kết nối phải cập nhật `DATABASE_URL` và recreate backend.

### Cơ chế import backup khi PostgreSQL khởi tạo lần đầu

Compose mount `database/init/` và `backups/` vào PostgreSQL. Script
`01-restore-backup.sh` tìm đúng file **`backups/sentiment_ai_backup.sql`** và chạy
nó **chỉ khi data volume còn mới**.

- Không có file: PostgreSQL tạo database trống; backend tự tạo schema khi khởi động.
- Volume đã có dữ liệu: restart/up không chạy lại init script và không import lại backup.
- Script hiện dùng `ON_ERROR_STOP=0`; phải đọc log lỗi, không chỉ dựa vào dòng
  “Import database hoàn tất”. SQL dump cũ có owner/role khác máy đích có thể báo lỗi.
- Không đặt file backup vào thư mục rồi xóa volume để “thử” trên hệ thống có dữ liệu thật.
- Đổi `POSTGRES_USER/PASSWORD/DB` trong `.env` không tự đổi user/password/database
  đã tồn tại trong volume cũ.

Backup chỉ là dữ liệu/schema, không chứa weights model và không thay cho bản
bàn giao source + model + cấu hình.

## 14. Triển khai trên máy chủ

### Chạy demo trên server qua SSH tunnel

Trên server: làm toàn bộ mục 3–5. Trên máy người xem, mở tunnel:

```bash
ssh -N \
  -L 5173:127.0.0.1:5173 \
  -L 8000:127.0.0.1:8000 \
  user@your-server
```

Sau đó mở http://localhost:5173 trên máy người xem. Tunnel cả 8000 là cần thiết
vì trình duyệt đang gọi backend tại `127.0.0.1:8000`; chỉ tunnel cổng frontend
sẽ không đủ. Không cần mở AI/crawler/database ra ngoài để trình duyệt sử dụng.

### Phục vụ bằng domain/IP cho nhiều máy

Cấu hình hiện tại dùng Vite dev server và URL/CORS cố định cho local; chưa phải
một bộ cấu hình production hoàn chỉnh. Khi triển khai public cần thực hiện:

1. Chọn địa chỉ API mà trình duyệt người dùng truy cập được; cấu hình tập trung
   tại `frontend/src/services/http.ts` hoặc VITE_API_URL khi build.
2. Cấu hình AUTH_FRONTEND_URL theo origin frontend thực tế để CORS và link reset đúng.
3. Build frontend bằng `npm run build`; phục vụ `frontend/dist` bằng web server
   có SPA fallback về `index.html`, thay cho Vite dev server.
4. Cấu hình reverse proxy, HTTPS và timeout đủ cho request phân tích đồng bộ.
   Trang HTTPS phải gọi API HTTPS, tránh mixed content.
5. Giới hạn public ports bằng cấu hình bind/firewall; Compose hiện publish cả
   PostgreSQL, AI và crawler trên host. API sản phẩm/nhập dữ liệu yêu cầu xác thực tài khoản; xem [cấu hình HTTPS và SMTP](AUTHENTICATION.md).
6. Thiết lập backup, tài nguyên và theo dõi log trước khi sử dụng lâu dài.

README không giả định việc đổi `APP_ENV=production` sẽ tự thực hiện các bước này.

## 15. Xử lý lỗi thường gặp

Luôn đọc response `detail` và log trước:

```bash
docker compose ps -a
docker compose logs --tail 100 backend ai-service crawler-service postgres
```

| Hiện tượng | Kiểm tra / hướng xử lý |
| --- | --- |
| Docker daemon/socket không kết nối | Mở Docker Desktop/daemon, kiểm tra `docker version` |
| Cổng đã được dùng | Dừng process trùng cổng hoặc đổi host port rồi đồng bộ URL frontend/CORS |
| AI thoát vì thiếu file | Kiểm tra đủ 8 file v3 ở mục 3.2, không chỉ có vocab hoặc model cũ |
| Lỗi shape/input/vocab/label khi nạp model | Dùng nguyên bộ weights, vocab, encoder và cấu hình của cùng lần train |
| Warning masking / Keras load lỗi | Dùng requirements đã cố định; kiểm tra Keras 3.13.2, build lại AI |
| `DATABASE_URL is not configured` | Tạo `.env` đúng chỗ; Compose phải được chạy từ đúng thư mục/cấu hình |
| `relation ... does not exist` khi gọi `/products` | Rebuild backend với source mới và khởi động lại để tự tạo bảng; schema cũ thiếu cột cần migration |
| `failed to resolve host 'postgres'` | Backend và PostgreSQL phải cùng mạng Compose, alias `postgres` phải tồn tại |
| Kết nối DB sai password sau sửa `.env` | Volume cũ vẫn giữ user/password cũ; cập nhật thông tin kết nối hoặc đổi password DB có kiểm soát |
| `localhost` kết nối thất bại trong backend container | `localhost` là chính container; dùng `postgres`, `ai-service`, `crawler-service` trong Compose |
| Trình duyệt báo CORS/Failed to fetch | Kiểm tra backend có chạy, origin được cho phép và URL API đang hard-code ở frontend |
| `/products/analyze` trả lỗi | `400`: URL sai; `503`: thiếu cookie; `429`: Lazada yêu cầu xác minh/giới hạn truy cập; `502`: lỗi nguồn/dịch vụ; `504`: timeout; `500`: xem detail và log backend/AI/database |
| `/predict` trả 422 cho emoji | Bình thường với nội dung rỗng sau clean; API phân tích sản phẩm hiện bỏ qua sentiment của review đó |
| Crawl không có/thiếu review | Kiểm tra URL, cookie của request đánh giá thành công, `PARTIAL` và `requires_verification`; cookie không bảo đảm tránh CAPTCHA, dữ liệu đã lưu vẫn được giữ |
| Build timeout khi tải package | Kiểm tra mạng/DNS Docker, chạy lại build; tránh nâng dependency ngẫu nhiên |
| `load metadata`, `auth.docker.io`, `context deadline exceeded` hoặc `x509` khi build | Docker chưa kết nối/xác thực TLS được với Docker Hub; xem hướng dẫn ngay dưới bảng |
| Sửa code mà giao diện/AI không đổi | Build và recreate đúng service; restart hoặc refresh trình duyệt không copy source vào image |
| `Cannot find module`/`ModuleNotFoundError` khi native | Đúng thư mục, đúng venv và entry point; không chạy backend bằng venv Python 3.14 của dự án khác |
| TypeScript báo biến không dùng | Sửa biến/import không dùng rồi chạy `npm run build`; không bỏ kiểm tra chỉ để tạo bundle |

Nếu máy **đã có đủ image của dự án**, có thể khởi chạy trong lúc Docker Hub
không truy cập được:

```bash
docker compose up -d --no-build --pull never
docker compose ps
```

Lệnh này dùng image đã có, không đóng gói các thay đổi source mới. Máy mới
clone chưa có image vẫn cần kết nối registry để build/tải lần đầu.
`--pull never` chỉ kiểm soát việc tải image khi khởi chạy; không giải quyết
việc BuildKit đọc metadata của `FROM` khi chạy `--build`.

Nếu build lỗi ở `FROM python:3.12-slim` hoặc `FROM node:20-alpine`, kiểm tra
kết nối tới cả `registry-1.docker.io` và `auth.docker.io`, cấu hình VPN/proxy
trong [Docker Desktop Settings](https://docs.docker.com/desktop/settings-and-maintenance/settings/#proxies),
rồi khởi động lại Docker Desktop. Nếu mạng dùng proxy kiểm tra HTTPS, cần
trust CA chính thức của proxy theo
[hướng dẫn Docker trên macOS](https://docs.docker.com/engine/network/ca-certs/#macos).
Lỗi này xảy ra trước các bước cài package/chạy ứng dụng trong Dockerfile.

Để kiểm tra mạng khi hostname `postgres` không phân giải:

```bash
docker inspect sentiment-backend sentiment-postgres --format '{{.Name}} {{json .NetworkSettings.Networks}}'
docker network ls
```

Nếu xác nhận PostgreSQL bị tách khỏi mạng, nối lại **đúng mạng của Compose project**
với alias `postgres`, hoặc recreate service đúng project sau khi bảo đảm volume
dữ liệu vẫn được sử dụng. Không cố định IP container vì IP có thể thay đổi.

Giới hạn schema/backend validation của `/predict` vẫn áp dụng: text quá dài,
rating ngoài khoảng 1–5 hoặc response không hợp lệ là lỗi khác với emoji-only.
Không bỏ qua mọi lỗi AI để biến một đợt phân tích lỗi thành “thành công”.

## 16. Checklist bàn giao

- [ ] Nhánh/commit trên remote có source mới, gồm predictor v3, decision layer backend và rule.
- [ ] Commit/push đủ 8 file model v3 cùng source, kiểm tra bằng một bản clone mới.
- [ ] Xác nhận tiền xử lý khớp code train, cung cấp code/config train nếu có thay đổi.
- [ ] Cung cấp `.env.example` không chứa bí mật; người nhận tự tạo `.env`.
- [ ] Chọn database rỗng hoặc bản backup, không phụ thuộc volume trên máy người phát triển.
- [ ] Kiểm tra database mới được tự tạo bảng sau `docker compose up -d`.
- [ ] Kiểm tra AI `/health` đúng `_v3`, backend `/products` hoạt động.
- [ ] Chạy kiểm tra API backend/AI ở mục 11 và build frontend.
- [ ] Thử một URL Lazada còn hợp lệ và kiểm tra dashboard/history sau khi phân tích.
- [ ] Nếu public domain: hoàn tất URL API, CORS, frontend static/reverse proxy và quản lý truy cập.

Không cần giao `.venv`, `node_modules` hoặc image Docker của máy cá nhân.
Weights v3 được giao bằng Git cùng source; cần bảo đảm commit trên remote thực
sự chứa đủ artifact. Bản clone thiếu weights v3 thì AI service chưa thể khởi động.
