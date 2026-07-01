# Smart Travel Web Template

## Cách dùng

1. Mở `trip-data.js`.
2. Thay thông tin chuyến đi trong `window.TRIP_DATA`.
3. Mở `index.html` bằng trình duyệt.

## Cấu trúc

- `index.html`: khung giao diện.
- `style.css`: thiết kế.
- `app.js`: logic render, bản đồ, tương tác.
- `trip-data.js`: dữ liệu chuyến đi.

## Khi tạo chuyến đi mới

Chỉ cần thay:

- `trip`
- `days`
- `locations`
- `notes`

Không cần sửa HTML/CSS/JS.

## Gợi ý dữ liệu

- `trip.hotel.coords`: tọa độ khách sạn, dùng để hiện marker khách sạn trên bản đồ.
- `trip.hotel`: được render trong ô `Khách sạn`; bấm vào ô này sẽ focus marker khách sạn trên bản đồ.
- `days[].date`: ngày cụ thể của lịch trình.
- `days[].routeMapUrl`: link Google Maps điều hướng tuyến đường trong ngày; ô `Di chuyển` sẽ mở link này.
- `days[].locations[]`: danh sách điểm đến trong ngày, nên có `id`, `order`, `name`, `category`, `time`, `coords`, `description`.
- `locations[].coords`: tọa độ `[lat, lng]`; nếu thiếu, điểm vẫn hiện trong danh sách nhưng không có marker bản đồ.
- `locations[].mapUrl`: link Google Maps cho từng điểm.
