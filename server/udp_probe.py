"""วัด RTT / Jitter / Packet Loss จริงด้วย UDP ระหว่าง 2 เครื่อง (ใช้เฉพาะ Python มาตรฐาน ไม่ต้องติดตั้งอะไร)

เครื่อง A (เซิร์ฟเวอร์):  python udp_probe.py server --port 9000
เครื่อง B (ตัววัด):      python udp_probe.py client --host <IP เครื่อง A> --port 9000
"""
import argparse, select, socket, struct, time

HDR = struct.Struct("!Id") 


def server(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind(("0.0.0.0", port))
    print(f"UDP echo server พร้อมที่พอร์ต {port} (Ctrl+C เพื่อหยุด)")
    while True:
        try:
            data, addr = s.recvfrom(2048)
            s.sendto(data, addr)       
        except ConnectionResetError:      
            continue


def rate(rtt, jit, loss, lim):
    r = [rtt, jit, loss]
    if all(v < g for v, g in zip(r, lim[0])): return "GOOD"
    if all(v < f for v, f in zip(r, lim[1])): return "FAIR"
    return "POOR"


def client(host, port, count, interval, size):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setblocking(False)
    pad = b"x" * max(0, size - HDR.size)
    got, state = {}, {"hi": -1, "ooo": 0}

    def drain(wait):
        end = time.perf_counter() + wait
        while (left := end - time.perf_counter()) > 0:
            if not select.select([s], [], [], left)[0]:
                break
            try:
                data, _ = s.recvfrom(2048)
            except (BlockingIOError, ConnectionResetError):
                continue
            now = time.perf_counter()
            if len(data) < HDR.size: continue
            seq, t = HDR.unpack(data[:HDR.size])
            if seq in got: continue
            got[seq] = (now - t) * 1000
            if seq < state["hi"]: state["ooo"] += 1   # แพ็กเก็ตมาสลับลำดับ
            state["hi"] = max(state["hi"], seq)

    print(f"ส่ง {count} แพ็กเก็ต ไปที่ {host}:{port} ทุก {interval*1000:.0f} ms ขนาด {size} ไบต์ ...")
    t0 = time.perf_counter()
    for i in range(count):
        s.sendto(HDR.pack(i, time.perf_counter()) + pad, (host, port))
        drain(max(0, t0 + (i + 1) * interval - time.perf_counter()))
    drain(1.0) 

    rtts = [got[k] for k in sorted(got)]
    if not rtts:
        print("ไม่ได้รับการตอบกลับเลย: เช็กว่าเซิร์ฟเวอร์รันอยู่ และ Firewall เปิดพอร์ต UDP นี้แล้ว")
        return
    loss = (count - len(got)) / count * 100
    jit = sum(abs(a - b) for a, b in zip(rtts, rtts[1:])) / max(1, len(rtts) - 1)
    avg = sum(rtts) / len(rtts)
    print(f"\nรับกลับ {len(got)}/{count}  |  Packet Loss {loss:.1f}%  |  Out-of-order {state['ooo']}")
    print(f"RTT  min/avg/max = {min(rtts):.2f} / {avg:.2f} / {max(rtts):.2f} ms")
    print(f"Jitter (เฉลี่ยผลต่าง RTT ติดกัน) = {jit:.2f} ms")
    print("Voice/Video Call :", rate(avg, jit, loss, [(150, 30, 1), (250, 50, 3)]))
    print("Online Gaming    :", rate(avg, jit, loss, [(80, 20, 1), (150, 50, 3)]))


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("mode", choices=["server", "client"])
    a.add_argument("--host", default="127.0.0.1")
    a.add_argument("--port", type=int, default=9000)
    a.add_argument("--count", type=int, default=200)
    a.add_argument("--interval", type=float, default=0.05, help="วินาทีระหว่างแพ็กเก็ต")
    a.add_argument("--size", type=int, default=100, help="ไบต์ต่อแพ็กเก็ต")
    x = a.parse_args()
    server(x.port) if x.mode == "server" else client(x.host, x.port, x.count, x.interval, x.size)
