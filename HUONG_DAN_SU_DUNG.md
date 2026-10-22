# 🎵 HƯỚNG DẪN CÀI ĐẶT & SỬ DỤNG CRAFTOPIA MUSIC (DISCORD BOT + WEB DASHBOARD)

**Craftopia Music** là bot Discord phát nhạc chất lượng cao với **Web Dashboard điều khiển thời gian thực** có bố cục hiện đại theo phong cách máy tính nghe nhạc (Spotify Desktop Style).

---

## 🚀 1. LẤY TOKEN VÀ CẤU HÌNH TRÊN DISCORD DEVELOPER PORTAL

1. Truy cập vào trang quản lý bot: **[Discord Developer Portal](https://discord.com/developers/applications)**.
2. Bấm **New Application** $\rightarrow$ Đặt tên bot: `Craftopia Music`.
3. **Lấy Token Bot**:
   - Vào mục **Bot** ở menu bên trái.
   - Bấm **Reset Token** để lấy chuỗi Token $\rightarrow$ Copy Token này.
   - Bật các mục trong **Privileged Gateway Intents**:
     - ✅ **Presence Intent**
     - ✅ **Server Members Intent**
     - ✅ **Message Content Intent**
4. **Lấy Client ID & Client Secret (để đăng nhập Dashboard qua Discord)**:
   - Vào mục **OAuth2** $\rightarrow$ **General**.
   - Copy **Client ID**.
   - Bấm **Reset Secret** $\rightarrow$ Copy **Client Secret**.
   - Ở mục **Redirects**, bấm **Add Redirect** và nhập:
     ```
     http://localhost:3000/api/auth/callback
     ```
   - Bấm **Save Changes**.
5. **Mời Bot vào Server Discord của bạn**:
   - Vào mục **OAuth2** $\rightarrow$ **URL Generator**.
   - Ở bảng **SCOPES**, tích chọn:
     - ✅ `bot`
     - ✅ `applications.commands`
   - Ở bảng **BOT PERMISSIONS** bên dưới, tích chọn:
     - ✅ `Administrator` (hoặc các quyền: `Connect`, `Speak`, `Send Messages`, `Embed Links`, `Use Application Commands`).
   - Copy đường link ở dưới cùng $\rightarrow$ Dán vào trình duyệt để mời bot vào server của bạn.

---

## ⚙️ 2. ĐIỀN THÔNG TIN VÀO FILE CẤU HÌNH `.env`

Mở file [`.env`](file:///c:/Users/mtrii/Downloads/donate/discord-music-bot/.env) trong thư mục `discord-music-bot` và điền:

```env
DISCORD_TOKEN=dán_token_của_bạn_vào_đây
CLIENT_ID=dán_client_id_của_bạn_vào_đây
CLIENT_SECRET=dán_client_secret_vào_đây
PORT=3000
REDIRECT_URI=http://localhost:3000/api/auth/callback
SESSION_SECRET=craftopia_music_super_secret_key_2026
```

---

## ▶️ 3. KHỞI CHẠY BOT VÀ WEB DASHBOARD

Bạn chỉ cần thực hiện 1 trong 2 cách sau:

- **Cách 1**: Nhấp đúp chuột vào file [`start.bat`](file:///c:/Users/mtrii/Downloads/donate/discord-music-bot/start.bat).
- **Cách 2**: Mở PowerShell trong thư mục `discord-music-bot` và gõ:
  ```bash
  npm start
  ```

Sau khi chạy, Web Dashboard sẽ tự động mở tại:
👉 **`http://localhost:3000`**

---

## 🎧 4. DANH SÁCH LỆNH DISCORD (SLASH COMMANDS)

| Lệnh | Mô tả |
| :--- | :--- |
| `/play <tên bài hoặc link>` | Tìm kiếm và phát bài hát từ YouTube, thêm vào danh sách chờ. |
| `/pause` | Tạm dừng phát bài hát hiện tại. |
| `/resume` | Tiếp tục phát bài hát đang tạm dừng. |
| `/skip` | Bỏ qua bài hát hiện tại sang bài kế tiếp. |
| `/previous` | Phát lại từ đầu hoặc chuyển về bài trước đó. |
| `/stop` | Dừng phát nhạc, xoá sạch hàng đợi và rời khỏi phòng thoại. |
| `/queue` | Xem danh sách các bài hát đang chờ phát. |
| `/nowplaying` | Xem thông tin chi tiết bài hát đang phát kèm thanh thời lượng. |
| `/volume <0-150>` | Điều chỉnh âm lượng phát nhạc (mặc định 80%). |
| `/loop <off \| track \| queue>` | Đổi chế độ lặp (tắt / lặp 1 bài / lặp cả danh sách). |
| `/shuffle` | Xáo trộn ngẫu nhiên thứ tự các bài hát trong hàng đợi. |
| `/dashboard` | Nhận link mở Web Dashboard Craftopia Music. |

---

## 🟢 5. CÁC TÍNH NĂNG TRÊN CRAFTOPIA MUSIC DASHBOARD

- **Giao diện Obsidian Dark & Neon Emerald**: Thiết kế hiện đại, typography Plus Jakarta Sans, bo tròn tinh tế, hiệu ứng bóng mờ (glassmorphism).
- **Thanh phát nhạc dưới cùng (Bottom Player Bar)**:
  - Album art bo góc tinh xảo.
  - Tên bài hát và ca sĩ.
  - Các nút điều khiển: **Shuffle, Previous, Play/Pause tròn, Next, Loop**.
  - **Thanh Seekbar kéo tua trực tiếp**: Kéo hoặc nhấp chuột vào bất kỳ đoạn nào để tua bài hát theo giây mượt mà!
  - **Thanh trượt âm lượng (Volume Slider)**: Tăng giảm âm lượng từ 0% đến 150%, có nút tắt tiếng (Mute).
- **Banner Hero Showcase**:
  - Trình chiếu bài hát đang phát với Audio Visualizer EQ chuyển động sống động.
- **Khám phá & Tìm kiếm nhanh**:
  - Các nút danh mục nhanh: V-Pop Thịnh Hành, Gaming NCS, Lofi Chill, EDM Remix, Anime Music.
  - Gõ từ khoá $\rightarrow$ hiện thẻ bài hát $\rightarrow$ 1-click phát ngay hoặc thêm vào Queue.
- **Quản lý hàng đợi (Queue Management)**:
  - Xem danh sách bài hát, ai là người yêu cầu, xoá bài hát khỏi hàng đợi, xáo trộn thứ tự, hoặc xoá toàn bộ hàng đợi.
- **Phím tắt bàn phím (Keyboard Shortcuts)**:
  - `Phím Space`: Tạm dừng / Tiếp tục phát.
  - `Mũi tên phải / trái`: Tua tới / lui 5 giây.
  - `Mũi tên lên / xuống`: Tăng / giảm 5% âm lượng.
  - `Phím M`: Bật / Tắt tiếng (Mute).
