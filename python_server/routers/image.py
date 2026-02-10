from fastapi import APIRouter
# 데이터 검증 및 규격 정의를 위한 pydantic 라이브러리 / BaseModel 클래스
from pydantic import BaseModel
import os
from services.plant_analysis import analyze_plant_height



# Main.py에서 불러올 router 만들기!
router = APIRouter()

# 노드 서버를 통해 로컬에 저장된 데이터 경로 정의
class ImagePath(BaseModel):
    file_path: str

# 분석 경로 설정 /image/analyze가 최종 경로
@router.post("/analyze")
async def analyze_image(data: ImagePath):
    # data.file_path에 "C:/uploads/plant.jpg" 같은 게 들어올 거야.
    print(f" 분석할 이미지 경로: {data.file_path}")

    # 실제로 파일이 존재하는지 체크 (에러 방지용)
    if not os.path.exists(data.file_path):
        return {"status": "error", "message": "No File"}
    
    try:
        with open(data.file_path, "rb") as f:
            contents = f.read()  # 바이너리로 파일 읽기

        # 분석 모델로 분석 
        height = analyze_plant_height(contents)
        
        return {
            "success": True, 
            "height": height,
            "message": "분석 완료"
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}