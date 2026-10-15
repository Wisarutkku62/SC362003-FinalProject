"""QoS/QoE Analytics - backend (FastAPI)
Endpoints:  /ping  /download  /upload  /api/results  + เสิร์ฟหน้าเว็บจากโฟลเดอร์ web/
"""
import os, json, time, sqlite3, platform, re, subprocess, ipaddress, socket, html, io
from fastapi import FastAPI, Request, Query
from fastapi.responses import StreamingResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, "results.db")
NOCACHE = {"Cache-Control": "no-store"}
app = FastAPI(title="QoE Analytics")


def db():
    c = sqlite3.connect(DB)
    c.execute("create table if not exists results(id integer primary key autoincrement, ts real, data text)")
    return c


@app.get("/ping")            
def ping():
    return JSONResponse({"t": time.time()}, headers=NOCACHE)


@app.get("/download") 
def download(size: int = Query(500_000, ge=1, le=20_000_000)):
    chunk = os.urandom(65536)

    def gen():
        left = size
        while left > 0:
            n = min(left, len(chunk))
            yield chunk[:n]
            left -= n

    return StreamingResponse(gen(), media_type="application/octet-stream",
                             headers={**NOCACHE, "Content-Length": str(size)})


@app.post("/upload")  
async def upload(request: Request):
    n = 0
    async for c in request.stream():
        n += len(c)
    return {"bytes": n}


@app.post("/api/results") 
async def save(request: Request):
    data = await request.json()
    data["ip"] = request.client.host         
    data["name"] = str(data.get("name", ""))[:30]
    with db() as c:
        c.execute("insert into results(ts,data) values(?,?)", (time.time(), json.dumps(data)))
    return {"ok": True}


@app.get("/api/results")    
def history(limit: int = 20):
    with db() as c:
        rows = c.execute("select id,ts,data from results order by id desc limit ?", (limit,)).fetchall()
    return [{"id": i, "ts": t, **json.loads(d)} for i, t, d in rows]


@app.get("/api/traceroute")
def traceroute(request: Request, target: str = "client"):
    ip = request.client.host if target == "client" else "1.1.1.1"
    try:
        ipaddress.ip_address(ip) 
    except ValueError:
        return {"error": "IP ไม่ถูกต้อง"}
    if platform.system() == "Windows":
        cmd = ["tracert", "-d", "-h", "12", "-w", "1000", ip]
    else:
        cmd = ["traceroute", "-n", "-m", "12", "-w", "1", ip]
    try:                            
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=45).stdout
    except FileNotFoundError:
        return {"error": "ไม่พบคำสั่ง traceroute บนเซิร์ฟเวอร์"}
    except subprocess.TimeoutExpired:
        return {"error": "traceroute หมดเวลา"}
    hops = [l.strip() for l in out.splitlines() if re.match(r"\s*\d+\s", l)]
    return {"target": ip, "hops": hops}


PORT = int(os.environ.get("QOE_PORT", "8000"))  


def lan_ips():
    """หา IP ของเครื่องนี้ในวง LAN อัตโนมัติ (ไม่ต้องพิมพ์ ipconfig เอง)"""
    ips, primary = set(), None
    try:                                   
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        primary = s.getsockname()[0]
        ips.add(primary)
        s.close()
    except OSError:
        pass
    try:
        for i in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(i[4][0])
    except OSError:
        pass
    rest = sorted(i for i in ips if not i.startswith("127.") and i != primary)
    return ([primary] if primary and not primary.startswith("127.") else []) + rest   


def qr_svg(text):
    try:
        import qrcode, qrcode.image.svg
        img = qrcode.make(text, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2)
        buf = io.BytesIO()
        img.save(buf)
        return buf.getvalue().decode()
    except ImportError:
        return None


@app.on_event("startup")
def banner():                           
    ips = lan_ips()
    print("\n=== เปิดจากเครื่องอื่นในเครือข่ายเดียวกัน ===")
    for ip in ips:
        print(f"  http://{ip}:{PORT}")
    print(f"  หน้า QR สำหรับสแกน: http://localhost:{PORT}/qr")
    if ips:
        print(f"  UDP: python udp_probe.py client --host {ips[0]} --port 9000")
    print()


PAGE = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>QR เปิดโปรเจกต์</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:20px auto;padding:0 14px}.g{display:flex;flex-wrap:wrap;gap:16px}
.c{border:1px solid #ccd;border-radius:12px;padding:12px;text-align:center;width:240px}.c svg{width:200px;height:200px}.c b{display:block;word-break:break-all}.c small{color:#667}</style>
<h2>สแกนเพื่อเปิด QoS/QoE Analytics</h2><p>มือถือหรือเครื่องอื่นต้องต่อเครือข่ายเดียวกับเครื่องนี้ (ยกเว้นลิงก์สาธารณะ) ที่อยู่เปลี่ยนเองอัตโนมัติถ้า IP เปลี่ยน แค่เปิดหน้านี้ใหม่</p><div class=g>@@CARDS@@</div>"""


@app.get("/qr")                          
def qr_page(request: Request):
    port = request.url.port or PORT
    items = [(f"http://{ip}:{port}", "ที่อยู่ IP ในวง LAN") for ip in lan_ips()]
    items.append((f"http://{socket.gethostname()}:{port}", "ชื่อเครื่อง (ไม่เปลี่ยนแม้ IP เปลี่ยน; ใช้ได้กับ Windows ด้วยกัน มือถือบางรุ่นอาจเปิดไม่ได้)"))
    if os.environ.get("PUBLIC_URL"):
        items.append((os.environ["PUBLIC_URL"], "ลิงก์สาธารณะ (ตั้งจาก PUBLIC_URL)"))
    cards = ""
    for url, note in items:
        svg = qr_svg(url) or "<p>ติดตั้งตัวสร้าง QR: pip install qrcode</p>"
        cards += f"<div class=c>{svg}<b>{html.escape(url)}</b><small>{html.escape(note)}</small></div>"
    return HTMLResponse(PAGE.replace("@@CARDS@@", cards))


LIVE = {}  


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


@app.post("/api/live")       
async def live_post(request: Request):
    d = await request.json()
    cid = str(d.get("id", ""))[:40]
    if not cid:
        return {"ok": False}
    LIVE[cid] = {"id": cid, "name": str(d.get("name", ""))[:30], "ip": request.client.host,
                 "profile": str(d.get("profile", ""))[:10], "test": str(d.get("test", ""))[:10],
                 "rating": str(d.get("rating") or "")[:5], "seen": time.time(),
                 **{k: num(d.get(k)) for k in ("rtt", "jit", "loss", "tp", "qoe")}}
    for k in sorted(LIVE, key=lambda k: LIVE[k]["seen"])[:-200]:   
        del LIVE[k]
    return {"ok": True}


@app.get("/api/live")         
def live_get():
    now = time.time()
    for k in [k for k, v in LIVE.items() if now - v["seen"] > 30]:
        del LIVE[k]
    return [{**v, "age": round(now - v["seen"], 1)} for v in LIVE.values()]


app.mount("/", StaticFiles(directory=os.path.join(BASE, "..", "web"), html=True), name="web")
