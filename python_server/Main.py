from fastapi import FastAPI, UploadFile, File  # 통신 위한 FastAPI 라이브러리
from routers import sensor, image, statistics, llm  # 라우터 불러오기
import asyncio
from services.plant_analysis import analyze_plant_height  # ✅ 이걸로 통일


app = FastAPI()

# 라우터 불러오기 : node의 app.use와 유사
# (무엇을, 주소 접두사, 태그) 
app.include_router(sensor.router, prefix="/sensor", tags=["Sensor"])        # 센서 라우터
app.include_router(image.router, prefix="/image", tags=["Image"])           # 이미지 라우터
app.include_router(statistics.router, prefix="/statistics", tags=["Statistics"]) # 데이터 통계 라우터
app.include_router(llm.router, prefix="/llm", tags=["LLM"])                     # llm 라우터

# ✅ Node.js가 보내는 multipart '업로드' 엔드포인트
@app.post("/analyze")
async def analyze_image(file: UploadFile = File(...)):
    contents = await file.read()
    height = analyze_plant_height(contents)
    return {"status": "success", "height": height}

# 일정 시간마다 센서값 평균 내서 노드서버로 전송
@app.on_event("startup")
async def _startup():
    asyncio.create_task(sensor.flush_hourly_to_node("http://192.168.219.236:3001/api/hourly"))

# 기본 확인용 엔드포인트
@app.get("/")
def read_root():
    return {"msg": "Python Server is Running"}

# 실행: uvicorn Main:app --host 0.0.0.0 --port 8000