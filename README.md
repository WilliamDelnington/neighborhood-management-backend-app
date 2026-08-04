# Hòa Bình Backend App

Backend API cho hệ sinh thái quản lý Tổ dân phố Hòa Bình: phục vụ **Zalo Mini App** (người dân) và **trang quản trị web** (cán bộ tổ dân phố). Xây dựng bằng Next.js (App Router) dưới dạng REST API thuần (không render UI), MongoDB/Mongoose làm lớp lưu trữ, xác thực bằng JWT, và phân quyền theo vai trò (RBAC) chi tiết theo từng module nghiệp vụ.

## Mục lục

- [Tổng quan tính năng](#tổng-quan-tính-năng)
- [Kiến trúc & công nghệ](#kiến-trúc--công-nghệ)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Cài đặt](#cài-đặt)
- [Cấu hình biến môi trường](#cấu-hình-biến-môi-trường)
- [Chạy dự án](#chạy-dự-án)
- [Seed dữ liệu mẫu](#seed-dữ-liệu-mẫu)
- [Kiểm thử](#kiểm-thử)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Xác thực & phân quyền](#xác-thực--phân-quyền)
- [Quy ước response](#quy-ước-response)
- [Ví dụ sử dụng API](#ví-dụ-sử-dụng-api)
- [Các script backfill](#các-script-backfill)
- [CORS](#cors)

## Tổng quan tính năng

Hệ thống quản lý các nghiệp vụ của một tổ dân phố:

- **Người dùng & phân quyền**: tài khoản cán bộ (đăng nhập bằng SĐT + mật khẩu) và cư dân (đăng nhập qua Zalo), vai trò (Role) và gán quyền theo từng module (RBAC).
- **Hộ dân & nhân khẩu**: quản lý hộ khẩu (`Household`), nhân khẩu (`Citizen`), nhà/căn hộ (`HouseRecord`), hộ kinh doanh (`Business`, `BusinessType`).
- **Phản ánh, kiến nghị** (`Complaint`): cư dân gửi phản ánh, cán bộ phân công xử lý, theo dõi lịch sử xử lý (`ComplaintTimeline`), tra cứu theo mã.
- **Thông báo & khảo sát**: thông báo tổ dân phố (`Announcement`), khảo sát ý kiến (`Survey`, `SurveyResponse`), thông báo đẩy tới người dùng (`Notification`, `NotificationDelivery`).
- **Họp tổ dân phố** (`Meeting`): tạo lịch họp, đăng ký tham dự (`MeetingRegistration`).
- **PCCC**: kiểm tra phòng cháy chữa cháy theo hộ/nhà (`PcccCheck`).
- **An ninh trật tự** (`SecurityRecord`): ghi nhận vụ việc an ninh, trạng thái xử lý.
- **Tài chính**: thu/chi của tổ dân phố (`FinanceTransaction`), tổng hợp báo cáo.
- **Báo cáo tổng hợp**: dashboard, dân số, tài chính, PCCC, an ninh, phản ánh, họp, khảo sát.
- **Import/Export**: nhập Excel hàng loạt cho nhân khẩu/hộ khẩu (có bước preview job trước khi commit), xuất Excel/PDF cho nhân khẩu, hộ khẩu, phản ánh.
- **Tệp đính kèm** (`FileAsset`): lưu trữ file liên quan đến các nghiệp vụ trên.
- **Audit log** (`AuditLog`): ghi vết thao tác quan trọng.
- **Mã hoá dữ liệu nhạy cảm**: số điện thoại, CCCD của công dân được mã hoá AES-256-GCM trước khi lưu DB.

## Kiến trúc & công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Framework | Next.js 14 (App Router, dùng làm REST API server, không có UI) |
| Ngôn ngữ | TypeScript |
| CSDL | MongoDB qua Mongoose |
| Xác thực | JWT (`jsonwebtoken`) + mật khẩu băm bằng `bcryptjs` |
| Đăng nhập cư dân | Zalo Mini App (access token qua Zalo Graph API, có chế độ `sandbox` cho dev) |
| Validate input | Zod |
| Xuất dữ liệu | ExcelJS (Excel), PDF export nội bộ |
| Test | Vitest + `mongodb-memory-server` (test chạy với MongoDB in-memory, không cần DB thật) |

Mỗi route nằm dưới `src/app/api/**/route.ts` theo quy ước App Router của Next.js, gọi vào tầng `services/*` để xử lý nghiệp vụ, tầng `models/*` (Mongoose schema) để thao tác dữ liệu, và `validators/*` (Zod schema) để validate input.

## Yêu cầu hệ thống

- Node.js 18+ (khuyến nghị 20+)
- MongoDB (local hoặc Atlas) — chỉ cần cho `dev`/`start`/seed; bộ test dùng MongoDB in-memory nên không bắt buộc khi chạy `npm test`
- npm

## Cài đặt

```bash
git clone <repo-url>
cd quan-ly-to-dan-pho-hoa-binh-backend-app
npm install
```

## Cấu hình biến môi trường

Sao chép file mẫu và điền giá trị phù hợp:

```bash
cp .env.example .env.local
```

| Biến | Bắt buộc | Mô tả |
| --- | --- | --- |
| `MONGODB_URI` | ✅ | Chuỗi kết nối MongoDB, ví dụ `mongodb://127.0.0.1:27017/hoa-binh-mini-app` |
| `MONGODB_DNS_SERVERS` | tuỳ chọn | Danh sách DNS server (phân cách bởi dấu phẩy), dùng khi kết nối `mongodb+srv://` bị lỗi `querySrv ECONNREFUSED` |
| `JWT_SECRET` | ✅ | Khoá ký JWT — **phải đổi giá trị thật khi lên production** |
| `JWT_EXPIRES_IN` | tuỳ chọn | Thời hạn token, mặc định `30d` |
| `ENCRYPTION_KEY` | ✅ | Khoá AES-256-GCM (base64, 32 byte) để mã hoá SĐT/CCCD của công dân. Tạo bằng `openssl rand -base64 32`. **Không đổi khoá này sau khi đã có dữ liệu mã hoá trong DB** — dữ liệu cũ sẽ không giải mã được nữa |
| `ZALO_ENV` | tuỳ chọn | `sandbox` (mặc định, không cần Zalo App thật để dev/test) hoặc `production` (bắt buộc `ZALO_APP_ID`/`ZALO_APP_SECRET` để xác thực accessToken thật qua Zalo Graph API) |
| `ZALO_APP_ID` / `ZALO_APP_SECRET` | khi `ZALO_ENV=production` | Thông tin Zalo Mini App |
| `CORS_ORIGIN` | tuỳ chọn | Origin được phép gọi API, mặc định `*` |

### Database dev và production trên cùng Cluster0

`MONGODB_URI` của `.env.local` (dev) và của VPS production **phải trỏ vào hai
database khác tên nhau**, dù cùng một Atlas cluster (`Cluster0`):

- Production: `to-dan-hoa-binh`
- Dev (máy cá nhân): `to-dan-hoa-binh-dev`

Trước đây cả hai đều trỏ chung vào `to-dan-hoa-binh`, nên `npm run seed` (script
xoá-và-tạo-lại toàn bộ dữ liệu demo) chạy ở máy dev đã xoá mất dữ liệu thật.
`scripts/seed.ts` giờ tự chối chạy nếu `MONGODB_URI` trỏ vào một tên database
nằm trong `PROTECTED_DB_NAMES` (xem `src/lib/config.ts`), bất kể `NODE_ENV` là
gì - đây là lớp bảo vệ thứ hai, **không thay thế** cho việc luôn dùng đúng
database dev ở máy cá nhân.

Database `to-dan-hoa-binh-dev` không cần tạo thủ công trong Atlas UI - MongoDB
tự tạo database/collection khi có lần ghi dữ liệu đầu tiên (ví dụ chạy
`npm run seed -- --yes`).

## Chạy dự án

```bash
# Chế độ phát triển (cổng 4000)
npm run dev

# Build production
npm run build

# Chạy bản build production (cổng 4000)
npm start

# Lint
npm run lint
```

Sau khi chạy `npm run dev`, API sẽ sẵn sàng tại `http://localhost:4000/api/...`.

## Seed dữ liệu mẫu

```bash
npm run seed
```

Script này xoá sạch dữ liệu demo hiện có và tạo lại dữ liệu mẫu cho toàn bộ các module (người dùng, vai trò, hộ khẩu, nhân khẩu, phản ánh, thông báo, họp, khảo sát, PCCC, an ninh, tài chính, v.v). Mật khẩu dùng chung cho các tài khoản cán bộ được seed là `HoaBinh@2026` — **chỉ dùng cho môi trường dev/demo**.

Script khác:

```bash
npm run seed:proposal   # Tạo tài khoản demo cho vai trò "đề xuất"
```

## Kiểm thử

```bash
npm test
```

Bộ test dùng Vitest, khởi tạo một `MongoMemoryServer` dùng chung giữa các file test (xem `tests/setup.ts`), nên **không cần** MongoDB thật để chạy test. Test bao phủ xác thực, RBAC, mã hoá dữ liệu công dân, quyền sở hữu (ownership) trên phản ánh/nhà/hộ, số lượng thành viên hộ khẩu, khảo sát trùng lặp, v.v — xem thư mục `tests/`.

## Cấu trúc thư mục

```
src/
  app/api/          Route handlers (Next.js App Router) — 1 endpoint REST / thư mục
  config/           Danh mục quyền hạn theo module (permissions.ts)
  lib/               Tiện ích dùng chung: auth (JWT/bcrypt), mongodb, mã hoá,
                     RBAC, rate limit, response envelope, xuất Excel/PDF, Zalo, v.v
  models/            Mongoose schema cho từng entity (User, Household, Citizen, ...)
  services/          Business logic — được route handler gọi vào
  types/             Định nghĩa TypeScript dùng chung (ApiResponse, enum vai trò, ...)
  validators/        Zod schema validate input theo từng module
scripts/             Script chạy độc lập: seed dữ liệu, backfill dữ liệu cũ
tests/
  api/               Test tích hợp theo từng luồng nghiệp vụ
  unit/              Test đơn vị cho lib/validators
middleware.ts        Xử lý preflight CORS (OPTIONS) cho toàn bộ /api/*
next.config.mjs      Cấu hình header CORS cho response thật
```

## Xác thực & phân quyền

- **Cán bộ**: đăng nhập bằng số điện thoại + mật khẩu (`POST /api/auth/login`), nhận về JWT gửi kèm header `Authorization: Bearer <token>` cho các request sau.
- **Cư dân**: đăng nhập qua Zalo Mini App (`POST /api/auth/zalo/login`), backend xác thực `accessToken` với Zalo Graph API (bỏ qua khi `ZALO_ENV=sandbox`).
- **RBAC**: mỗi tài khoản được gán một hoặc nhiều `Role`, mỗi `Role` có danh sách quyền dạng `module.action` (ví dụ `citizens.create`, `complaints.assign`) được khai báo tập trung tại [src/config/permissions.ts](src/config/permissions.ts). Route handler gọi `requireUser(req)` để xác thực token, sau đó `requirePermission(user, "module.action")` để kiểm tra quyền trước khi xử lý.
- **Dữ liệu nhạy cảm**: số điện thoại và CCCD của `Citizen` được mã hoá AES-256-GCM (`ENCRYPTION_KEY`) trước khi ghi vào MongoDB.

## Quy ước response

Tất cả API trả về JSON theo cùng một khuôn dạng (`ApiResponse<T>`):

```jsonc
// Thành công
{
  "success": true,
  "data": { /* ... */ },
  "message": "Thao tác thành công"
}

// Thất bại
{
  "success": false,
  "error": "Mô tả lỗi",
  "message": "Mô tả lỗi"
}
```

Mã lỗi HTTP: `422` cho lỗi validate (Zod), mã cụ thể do nghiệp vụ quy định cho các lỗi khác (401/403/404/409...), `500` cho lỗi hệ thống không xác định.

Danh sách phân trang dùng chung 2 query param: `page` (mặc định 1) và `limit` (mặc định 20, tối đa 100).

## Ví dụ sử dụng API

### Đăng nhập (cán bộ)

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "phone": "0912345678", "password": "HoaBinh@2026" }'
```

Response:

```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "user": { "id": "...", "displayName": "...", "phone": "...", "roles": ["..."] }
  },
  "message": "Dang nhap thanh cong"
}
```

### Lấy danh sách nhân khẩu (yêu cầu quyền `citizens.read`)

```bash
curl "http://localhost:4000/api/citizens?page=1&limit=20&search=Nguyen" \
  -H "Authorization: Bearer <jwt>"
```

### Tạo nhân khẩu mới (yêu cầu quyền `citizens.create`)

```bash
curl -X POST http://localhost:4000/api/citizens \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
        "fullName": "Nguyen Van A",
        "householdId": "<householdId>",
        "phone": "0912345678",
        "idNumber": "012345678901"
      }'
```

### Gửi phản ánh (cư dân)

```bash
curl -X POST http://localhost:4000/api/complaints \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Đèn đường bị hỏng", "content": "Đèn khu B ngõ 3 không sáng đã 3 ngày" }'
```

### Xuất Excel danh sách hộ khẩu

```bash
curl "http://localhost:4000/api/export/households" \
  -H "Authorization: Bearer <jwt>" \
  -o households.xlsx
```

## Các script backfill

Dùng khi cần cập nhật/di trú dữ liệu đã tồn tại sau khi thay đổi schema hoặc thêm tính năng mới:

```bash
npm run roles:backfill                       # Gán vai trò mặc định cho user cũ
npm run complaints:backfill-clusters         # Gom cụm phản ánh trùng lặp
npm run citizens:backfill-encryption         # Mã hoá SĐT/CCCD cho công dân đã tồn tại
npm run households:backfill-member-count     # Tính lại số thành viên mỗi hộ
npm run pccc:backfill-house-id               # Gắn houseId cho bản ghi PCCC cũ
npm run security:backfill-house-id           # Gắn houseId cho bản ghi an ninh cũ
npm run security:backfill-handling-status    # Chuẩn hoá trạng thái xử lý vụ việc an ninh cũ
```

## CORS

`middleware.ts` xử lý riêng request `OPTIONS` (preflight) cho mọi route dưới `/api/*` và trả về `204` kèm header CORS cần thiết, vì App Router route handler chỉ trả lời các HTTP method được export tường minh (GET/POST/...) nên sẽ trả `405` cho `OPTIONS` nếu không được middleware chặn trước. Header CORS cho response thật được cấu hình tại `next.config.mjs`. Origin cho phép cấu hình qua biến môi trường `CORS_ORIGIN` (mặc định `*`).
