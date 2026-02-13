from fastapi import APIRouter
# 데이터 검증 및 규격 정의를 위한 pydantic 라이브러리 / BaseModel 클래스
from pydantic import BaseModel
from datetime import datetime, timedelta
import asyncio
import httpx  # pip install httpx


# Main.py에서 불러올 router 만들기!
router = APIRouter()

# 라즈베리파이에서 보낸 센서 데이터 규격 정의
class SensorIn(BaseModel):
    plant_id: int
    temp: float
    hum: float
    light: float
    soil: float
    
_buffers = {}  # { plant_id: {"start": datetime, "rows": [SensorIn,...]} }

@router.post("/ingest")
async def ingest(data: SensorIn):
    now = datetime.now()
    buf = _buffers.get(data.plant_id)

    if not buf:
        _buffers[data.plant_id] = {"start": now, "rows": [data]}
        return {"status": "ok", "message": "buffer created"}

    buf["rows"].append(data)
    return {"status": "ok", "message": "buffer appended", "count": len(buf["rows"])}

async def flush_hourly_to_node(node_url: str):
    while True:
        await asyncio.sleep(10)  # 10초마다 체크
        now = datetime.now()

        for plant_id in list(_buffers.keys()):
            buf = _buffers[plant_id]
            start = buf["start"]
            rows = buf["rows"]

            # ✅ 테스트 빨리 하려면 hours=1을 minutes=1로 잠깐 바꿔도 됨
            #  if (now - start) >= timedelta(hours=1) and rows:
            if (now - start) >= timedelta(minutes=1) and rows:
                n = len(rows)
                payload = {
                    "plant_id": plant_id,
                    "start_at": start.strftime("%Y-%m-%d %H:%M:%S"),
                    "end_at": now.strftime("%Y-%m-%d %H:%M:%S"),
                    "temp_avg": sum(r.temp for r in rows) / n,
                    "hum_avg": sum(r.hum for r in rows) / n,
                    "lux_avg": sum(r.light for r in rows) / n,
                    "soil_avg": sum(r.soil for r in rows) / n,
                }
                print(payload["lux_avg"])
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.post(node_url, json=payload)
                        resp.raise_for_status()

                # 다음 1시간 버퍼로 리셋
                    _buffers[plant_id] = {"start": now, "rows": []}

                except Exception as e:
                    print("❌ hourly 전송 실패:", e)

# 분석 경로 설정 /sensor/analyze가 최종 경로
@router.post("/analyze")
async def analyze_sensor(data: SensorIn):
    print(f"데이터 수신 성공: {data}")

    # ✅ 임계치(일단 하드코딩) - 나중에 DB에서 불러오면 됨
    TEMP_MIN = 21
    TEMP_MAX = 25
    HUM_MIN = 40
    HUM_MAX = 70
    LUX_MIN = 300
    SOIL_MAX = 3000   # 너 화면에서 WATER 기준치처럼 쓰는 값이 soil이라면 이렇게

    # ✅ 이벤트 판정
    events = []

    if data.temp < TEMP_MIN:
        events.append("TEMP_LOW")
    elif data.temp > TEMP_MAX:
        events.append("TEMP_HIGH")

    if data.hum < HUM_MIN:
        events.append("HUM_LOW")
    elif data.hum > HUM_MAX:
        events.append("HUM_HIGH")

    if data.light < LUX_MIN:
        events.append("LUX_LOW")

    if data.soil > SOIL_MAX:
        events.append("SOIL_HIGH")  # (토양값 의미에 따라 이름은 바꿔도 됨)

    event_occurred = len(events) > 0
    event_type = events[0] if event_occurred else "NORMAL"  # 일단 1개만 대표로

    return {
        "event_occurred": event_occurred,
        "event_type": event_type,
        "events": events,   # <- 여러 개도 확인 가능
        "data": data
    }
