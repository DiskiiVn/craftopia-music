# 🚀 HƯỚNG DẪN ĐƯA CRAFTOPIA MUSIC LÊN CLOUD CHẠY 24/7 (RENDER.COM)

Với giải pháp này, cả **Discord Bot** và **Web Dashboard** sẽ chạy online liên tục 24/7 trên máy chủ đám mây, bạn sẽ có một đường link công khai (HTTPS) như:
👉 **`https://craftopia-music.onrender.com`** để bất kỳ ai ở bất kỳ đâu cũng có thể truy cập điều khiển nhạc mà không cần bạn phải bật máy tính!

---

### 📦 BƯỚC 1: ĐƯA DỰ ÁN LÊN GITHUB

Tôi đã nén sẵn gói mã nguồn sạch (đã loại bỏ file rác và token bảo mật) tại:
📁 **[`c:\Users\mtrii\Downloads\donate\craftopia-music-deploy.zip`](file:///c:/Users/mtrii/Downloads/donate/craftopia-music-deploy.zip)**

1. Truy cập vào **[GitHub](https://github.com)** và đăng nhập.
2. Bấm vào dấu **`+`** ở góc trên bên phải $\rightarrow$ Chọn **New repository**.
3. Đặt tên: `craftopia-music`.
4. **Quan trọng**: Chọn chế độ **Private** (để giữ mã nguồn riêng tư).
5. Bấm **Create repository**.
6. Tại trang vừa tạo, bấm vào dòng chữ **"uploading an existing file"** (hoặc giải nén file zip và kéo thả toàn bộ các file/thư mục vào đó) $\rightarrow$ Bấm **Commit changes**.

---

### 🌐 BƯỚC 2: TẠO VÀ CHẠY DỰ ÁN TRÊN RENDER.COM

1. Truy cập vào: **[Render.com](https://render.com)**.
2. Đăng ký / Đăng nhập bằng tài khoản **GitHub**.
3. Tại trang quản lý (Dashboard), bấm nút **New +** $\rightarrow$ Chọn **Web Service**.
4. Chọn repository **`craftopia-music`** bạn vừa tạo trên GitHub $\rightarrow$ Bấm **Connect**.
5. Cấu hình các thông số cơ bản:
   - **Name**: `craftopia-music` *(hoặc tên bạn thích)*
   - **Region**: `Singapore` *(cho tốc độ về Việt Nam nhanh nhất)*
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Instance Type**: Chọn gói **Free ($0/month)**.

---

### 🔑 BƯỚC 3: ĐIỀN BIẾN MÔI TRƯỜNG (ENVIRONMENT VARIABLES)

Cuộn xuống phần **Environment Variables** (hoặc vào tab Environment sau khi tạo), bấm **Add Environment Variable** và thêm các dòng sau:

| Key | Value (Giá trị) |
| :--- | :--- |
| **`DISCORD_TOKEN`** | Token bot Discord của bạn |
| **`CLIENT_ID`** | Client ID của bot |
| **`CLIENT_SECRET`** | Client Secret của bot |
| **`PORT`** | `10000` |
| **`SESSION_SECRET`** | `craftopia_super_secret_session_2026` |
| **`REDIRECT_URI`** | `https://tên-app-của-bạn.onrender.com/api/auth/callback` |

> *Lưu ý: Thay `tên-app-của-bạn.onrender.com` bằng tên miền mà Render cấp cho bạn.*

Bấm **Create Web Service** (hoặc **Save Changes**).
Render sẽ tự động tải thư viện, cài đặt FFmpeg và khởi chạy bot trong vòng 1-2 phút!

---

### 🔗 BƯỚC 4: CẬP NHẬT REDIRECT URL TRÊN DISCORD PORTAL

1. Vào [Discord Developer Portal](https://discord.com/developers/applications) $\rightarrow$ Chọn Bot **Craftopia Music**.
2. Vào mục **OAuth2** $\rightarrow$ **General**.
3. Ở mục **Redirects**, thêm đường link mới:
   ```
   https://tên-app-của-bạn.onrender.com/api/auth/callback
   ```
4. Bấm **Save Changes**.

---

### ⏰ BƯỚC 5: GIỮ BOT CHẠY 24/7 KHÔNG BAO GIỜ NGỦ (KEEP-ALIVE MIỄN PHÍ)

Gói miễn phí của Render sẽ tạm nghỉ nếu không có ai truy cập web sau 15 phút. Để bot **chạy vĩnh viễn 24/7**:
1. Đăng ký tài khoản miễn phí tại: **[UptimeRobot](https://uptimerobot.com)**.
2. Bấm **Add New Monitor**:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `Craftopia Music`
   - **URL (or IP)**: `https://tên-app-của-bạn.onrender.com/health`
   - **Monitoring Interval**: `5 minutes`
3. Bấm **Create Monitor**.

Từ nay, UptimeRobot sẽ tự động ping mỗi 5 phút, giữ cho Web Dashboard và Bot Discord của bạn **hoạt động 24/7 hoàn toàn miễn phí**!
