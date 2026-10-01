# Ứng Dụng GLOBAL CHAT

Ứng dụng chat công khai siêu tốc, tối giản với giao diện trắng - đen cổ điển và font chữ **Courier New**.
Không cần cơ sở dữ liệu phức tạp, 0 thư viện bên ngoài (Zero Dependencies), mở lên là chạy ngay!

---

## ⚡ Các Tính Năng Nổi Bật

1. **Truy cập tự do & Nhanh chóng**:
   - Ai cũng có thể truy cập ngay lập tức chỉ qua trình duyệt web.
   - Không cần đăng ký tài khoản hay mật khẩu, chỉ cần nhập tên và bấm **[ START CHAT ]**.

2. **Tự động gắn 5 số đuôi IP**:
   - Tên hiển thị luôn kèm theo 5 số nhận diện cố định từ địa chỉ IP (ví dụ: `Danh30009`).
   - Màn hình nhập tên có tính năng **xem trước (preview)** trực tiếp tên hiển thị theo thời gian thực.

3. **Giao diện Retro Trắng - Đen & Font Courier New**:
   - Thiết kế Monochrome tối giản, các viền sắc nét, tương phản cao.
   - Sử dụng thống nhất 100% font `Courier New`.

4. **Khung Chat Lớn & Trực Quan**:
   - Khung chat rộng rãi hiển thị toàn bộ nội dung thảo luận.
   - Phân biệt rõ tin nhắn của chính bạn (`[BẠN]`) và người khác.
   - Hiển thị mốc thời gian gửi tin nhắn `[hh:mm:ss]`.
   - Thông báo sự kiện người tham gia và người rời phòng.
   - Bộ đếm số người đang online theo thời gian thực.
   - Nút cuộn nhanh xuống tin nhắn mới nhất.

5. **Responsive Hoàn Hảo**:
   - Tương thích tốt trên màn hình máy tính (Desktop/Laptop), máy tính bảng (Tablet) và điện thoại di động (iPhone/Android).
   - Tối ưu chiều cao động `100dvh` chống che khuất bàn phím ảo trên điện thoại.

---

## 🚀 Hướng Dẫn Khởi Chạy

### Cách 1: Chạy bằng file `start.bat` (Nhanh nhất trên Windows)
- Nhấp đúp chuột vào file `start.bat`.
- Hệ thống sẽ tự động bật máy chủ và mở trình duyệt web đến địa chỉ chat.

### Cách 2: Khởi chạy bằng dòng lệnh
Mở Terminal / PowerShell / CMD tại thư mục này và gõ:
```bash
node server.js
```
Hoặc:
```bash
npm start
```

---

## 📱 Cách Cho Thiết Bị Khác (Điện Thoại / Máy Cùng Mạng Wi-Fi) Truy Cập

Khi khởi động server, màn hình console sẽ hiển thị địa chỉ IP mạng nội bộ của bạn, ví dụ:
```
> Mọi người cùng mạng Wi-Fi/LAN truy cập bằng:
  http://192.168.1.15:3000
```
- Các thiết bị khác (điện thoại, máy tính khác) chỉ cần kết nối chung mạng Wi-Fi và nhập địa chỉ `http://192.168.x.x:3000` vào trình duyệt để chat cùng nhau!
