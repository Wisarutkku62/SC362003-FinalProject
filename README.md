# QoS/QoE Analytics (Web App)

โปรเจกต์ประจำรายวิชาเครือข่ายขั้นแนะนำ Introduction to Networking SC362003 
วิทยาลัยการคอมพิวเตอร์ มหาวิทยาลัยขอนแก่น

วัดคุณภาพเครือข่ายจากมือถือ → แปลงเป็นคะแนน QoE ตามประเภทแอป → อธิบายสาเหตุ + แนะนำ

```
qoe-project/
├─ server/main.py     # Backend FastAPI: /ping /download /upload /api/results
├─ web/index.html     # โครงหน้าเว็บ (HTML)
├─ web/style.css      # หน้าตา/สี/เลย์เอาต์ (CSS)
├─ web/app.js         # ตรรกะวัดค่า คิดคะแนน วาดกราฟ (JavaScript)
└─ requirements.txt
```

## 1) แนวคิด (ทำงานยังไง)

| เลเยอร์ในภาพ | ในโปรเจกต์นี้ | วัดด้วย |
|---|---|---|
| Application (QoE) | คะแนน 0-100 + Good/Fair/Poor | ฟังก์ชัน `qoe()` ถ่วงน้ำหนักตามแอป |
| Transport | Throughput, Loss, Jitter | `/download`, ความล้มเหลวของ `/ping`, ค่าเบี่ยงเบน RTT |
| Network | RTT | เวลา round-trip ของ `/ping` |
| Link | ประเภทเครือข่าย 4G/Wi-Fi | `navigator.connection` (เบราว์เซอร์วัด RSSI ตรงๆ ไม่ได้) |

Flow: เลือกแอป+ชนิดทดสอบ → ทุก 1 วินาที `tick()` ยิง `/ping` → คำนวณ RTT/Jitter/Loss (หน้าต่าง 20 ตัวอย่าง) →
ทุก 4 วินาทีโหลดไฟล์วัด Throughput → ให้คะแนนแต่ละเมตริกเทียบเกณฑ์ → เฉลี่ยถ่วงน้ำหนัก → แสดงผล/ตรวจเหตุการณ์ผิดปกติ →
กดหยุดแล้วสรุป Diagnosis และบันทึกลง SQLite

## 2) ติดตั้งและรัน

```bash
cd qoe-project
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
เปิด http://localhost:8000 ในคอมพิวเตอร์ได้ทันที

## 3) ทดสอบบนมือถือ

- **Local Test**: มือถือกับคอมต่อ Wi-Fi เดียวกัน เปิด `http://<IP ของคอม>:8000` (ดู IP ด้วย `ipconfig` / `ip a`)
- **Internet Test**: เอาไปวางบนคลาวด์ (Render, Railway, Fly.io, VPS) แล้วเปิดผ่านเน็ตมือถือ
- **Mobility Test**: ต้องใช้ **HTTPS** เพราะ GPS ของเบราว์เซอร์ทำงานเฉพาะ HTTPS/localhost
  ทางลัดสำหรับทดลอง: `cloudflared tunnel --url http://localhost:8000` (หรือ ngrok) จะได้ลิงก์ https ชั่วคราว
  แล้วเดินถือมือถือจากจุด A ไป B

## 4) จุดที่ปรับแต่งบ่อย (web/app.js)

- **เกณฑ์ Good/Fair**: ตัวแปร `PROFILES` — รูปแบบ `metric:[good, fair, 'lo'|'hi', น้ำหนัก]`
  เช่น เกม `rtt:[80,150,'lo',.4]` = ต่ำกว่า 80 ดี, ต่ำกว่า 150 พอใช้
- **เพิ่มแอปใหม่**: เพิ่มอีก 1 รายการใน `PROFILES` (เช่น `web:{n:'Web Browsing',m:{rtt:[100,300,'lo',.5],tp:[5,2,'hi',.5]}}`)
- **ความถี่การวัด**: `setInterval(tick,1000)` ใน `start()`
- **ข้อความแนะนำ**: ตัวแปร `REC`

## 5) ดูประวัติผลทดสอบ

`GET http://localhost:8000/api/results` (JSON) หรือเปิด `http://localhost:8000/docs` เพื่อลอง API

## 6) ข้อจำกัด & ก้าวต่อไป

- Packet loss จริงระดับ UDP วัดจากเบราว์เซอร์ไม่ได้ (HTTP อยู่บน TCP) — ที่นี่ใช้ "ความล้มเหลว/timeout ของ ping" แทน
  ถ้าต้องการแม่นกว่า: ทำแอปมือถือ (Kotlin/Swift) ยิง UDP ไปที่เซิร์ฟเวอร์ตามภาพต้นฉบับ
- RSSI/handoff: มีเฉพาะแอปเนทีฟ (Android `WifiManager`/`TelephonyManager`)
- ไอเดียต่อยอด: หน้า History + กราฟย้อนหลัง, แผนที่จริง (Leaflet), WebSocket วัด RTT ต่อเนื่อง,
  Export CSV/PDF, ล็อกอินหลายผู้ใช้, เปลี่ยน SQLite เป็น PostgreSQL

## 7) วัด UDP จริงระหว่าง 2 เครื่อง (`server/udp_probe.py`)

เวอร์ชันเว็บวัดผ่าน HTTP/TCP ส่วนสคริปต์นี้ส่ง UDP ดิบ จึงเห็น packet loss, jitter และ out-of-order จริงกว่า
ไม่ต้องติดตั้งอะไรเพิ่ม (ใช้ Python มาตรฐาน)

```bash
# เครื่อง A (เซิร์ฟเวอร์)
python udp_probe.py server --port 9000
# เครื่อง B (ตัววัด)
python udp_probe.py client --host 192.168.1.20 --port 9000 --count 200 --interval 0.05
```
เปิด Firewall เครื่อง A สำหรับ UDP:
- Windows (PowerShell แบบ Admin): `netsh advfirewall firewall add rule name="QoE-UDP" dir=in action=allow protocol=UDP localport=9000`
- Linux: `sudo ufw allow 9000/udp`

## 8) ฟีเจอร์เพิ่มเติม (ที่ทำงานจริง)

| ฟีเจอร์ | ทำงานยังไง | ไฟล์/ฟังก์ชัน |
|---|---|---|
| MOS คุณภาพเสียงโทร | ประมาณตาม ITU-T G.107 (E-model แบบย่อ): RTT+Jitter -> หน่วงชดเชย -> R-factor -> หักค่า Loss -> MOS 1-4.5 | `app.js` : `mos()` |
| จำลองเล่นวิดีโอ | โมเดลบัฟเฟอร์: เติมตาม Throughput ที่วัดได้ ÷ 3.5 Mbps ลดวินาทีละ 1 ขณะเล่น หมด = ค้าง นับ startup/จำนวนครั้งที่ค้าง/เวลารวม | `app.js` : `insights()` |
| Bufferbloat Test | วัด RTT 5 วินาทีตอนว่าง แล้ววัดอีก 8 วินาทีระหว่างโหลด `/download` 3 สาย เอาผลต่างให้เกรด A+ ถึง F | `app.js` : `bloat()` |
| ประวัติ + เทียบ Local/Internet | ดึง `/api/results` มาเฉลี่ยแยกตามประเภทการทดสอบ | `app.js` : `hist()` |

| Wi-Fi Heatmap | แบ่งห้องเป็นตาราง 3x4 เดินไปแต่ละจุด คลิกช่องแล้ววัด 10 วินาที (ping 20 ครั้ง) -> QoE ตามแอปที่เลือก -> ระบายสีช่อง | `app.js` : `heatMeasure()` |
| วัดอัปโหลด | POST ข้อมูล 2 MB ไป `/upload` จับเวลา -> Mbps | `app.js` : `upTest()` |
| แยกส่วนความหน่วง | Resource Timing API แยก DNS / TCP+TLS / รอเซิร์ฟเวอร์ / ดาวน์โหลด | `app.js` : `breakdown()` |
| Traceroute | เซิร์ฟเวอร์รัน `tracert`/`traceroute` (ส่งเป็น list ไม่ผ่าน shell, ตรวจ IP ก่อน) ไปหาเครื่องผู้ใช้หรือ 1.1.1.1 | `main.py` : `/api/traceroute` |
| พิมพ์/PDF | `window.print()` + CSS ซ่อนปุ่มตอนพิมพ์ | `style.css` : `@media print` |

## 9) เปิดโปรเจกต์โดยไม่ต้องหา/สร้างลิงก์ใหม่

- **ดับเบิลคลิก `start.bat`** (Windows) ครั้งเดียวจบ: สร้าง .venv ถ้ายังไม่มี, ติดตั้งไลบรารี, เปิดเซิร์ฟเวอร์, เปิดหน้า `/qr`
- ตอนเริ่ม เซิร์ฟเวอร์ **พิมพ์ที่อยู่ที่เปิดได้ให้เอง** ไม่ต้องรัน `ipconfig`
- หน้า `http://localhost:8000/qr` แสดง QR ของ IP ปัจจุบัน และ URL แบบชื่อเครื่อง (`http://ชื่อเครื่อง:8000`) ที่ไม่เปลี่ยนแม้ IP เปลี่ยน
- ถ้ามีลิงก์สาธารณะ ตั้งตัวแปร `PUBLIC_URL` ก่อนรัน (`set PUBLIC_URL=https://...`) จะมี QR ของลิงก์นั้นด้วย
- ต้องการที่อยู่คงที่ข้ามเครือข่าย: ใช้ Tailscale (ติดตั้งทั้งสองเครื่อง ล็อกอินบัญชีเดียวกัน แล้วเปิดด้วยชื่อ/IP 100.x ที่ Tailscale ให้ ซึ่งคงที่ ไม่ต้องสร้างลิงก์ใหม่)

## 10) รองรับหลาย client พร้อมกัน

- ทุกเครื่องเปิดเว็บเดียวกัน (`http://<IP เครื่อง A>:8000`) ใส่ชื่อเครื่องในช่องใต้ปุ่มเลือกแอป แล้วทดสอบพร้อมกันได้
- แต่ละเครื่องส่งผลสดไป `POST /api/live` ทุกวินาที (มี id สุ่มเก็บใน localStorage) เซิร์ฟเวอร์เก็บในหน่วยความจำ
- เปิด `http://localhost:8000/dashboard.html` บนเครื่อง A เพื่อดูทุกเครื่องพร้อมกัน: จำนวนที่ออนไลน์, QoE เฉลี่ย, เครื่องที่แย่สุด, กราฟ RTT ย่อของแต่ละเครื่อง
- ผลสรุปที่บันทึกลงฐานข้อมูลมีชื่อเครื่องและ IP ของผู้ส่ง ดูย้อนหลังได้ในตารางประวัติ
- ข้อควรรู้: ทุกเครื่องใช้เครือข่ายร่วมกัน การวัดพร้อมกันจึงกระทบกัน (ยิ่งมี Bufferbloat Test หลายเครื่อง ยิ่งโหลดหนัก)
