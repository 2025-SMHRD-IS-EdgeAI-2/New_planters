from fastapi import APIRouter
from pydantic import BaseModel
import os

from services.plant_analysis import analyze_plant_height

import services.plant_analysis as pa
print("✅ plant_analysis loaded from:", pa.__file__)
print("✅ analyze_plant_height func:", pa.analyze_plant_height)


router = APIRouter()

# 노드 서버를 통해 로컬에 저장된 데이터 경로 정의
class ImagePath(BaseModel):
    file_path: str

# 분석 경로 설정 /image/analyze가 최종 경로
@router.post("/analyze")
async def analyze_image(data: ImagePath):
    print(f"📂 분석할 이미지 경로: {data.file_path}")
    print("✅ runtime plant_analysis file:", pa.__file__)


    # 실제로 파일이 존재하는지 체크 (에러 방지용)
    if not os.path.exists(data.file_path):
        print("❌ 파일 없음")
        return {"success": False, "message": "No File"}

    try:
        with open(data.file_path, "rb") as f:
            image_bytes = f.read()

        # 파일명 기반 tag(디버그 저장 파일명 식별용)
        tag = os.path.splitext(os.path.basename(data.file_path))[0]

        height = analyze_plant_height(
            image_bytes,
            pixels_per_cm=55.0,       # 환경에 맞게 조정
            debug=True,              # True면 debug_outputs/에 저장
            debug_dir="debug_outputs",
            tag=tag,
            roi_ratio=0.7,
            min_area_ratio=0.05
        )

        return {"success": True, "height": height, "message": "분석 완료"}

    except Exception as e:
        print("❌ 분석 에러:", e)
        return {"success": False, "message": str(e)}
