import cv2
import numpy as np

def analyze_plant_height(image_bytes):
    """
    [기능] 이미지 바이트 데이터를 받아서 -> 식물의 키(cm)를 분석하여 반환
    """
    try:
        # 1. 바이트 데이터를 이미지로 변환 (디코딩)
        # 통신으로 들어온 데이터는 0101... 바이트 형태라 이미지로 바꿔야 합니다.
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            print("이미지를 읽을 수 없습니다.")
            return 0.0

        # 2. 이미지 크기 확인 (세로, 가로)
        height, width, _ = img.shape

        # ---------------------------------------------------------
        # [분석 로직]
        # 실제 프로젝트에서는 여기서 '초록색 영역'을 감지해서 키를 재야 합니다.
        # 지금은 프로토타입이므로 "사진 전체 높이의 10%가 식물 키"라고 가정합니다.
        # ---------------------------------------------------------
        
        # 픽셀 -> cm 변환 비율 (가정), 센서/영상 알고리즘으로 교체 예정
        pixel_to_cm = 0.05 
        plant_height_cm = height * pixel_to_cm

        print(f"[분석 서비스] 이미지 크기: {height}px -> 측정된 키: {plant_height_cm}cm")
        
        # 소수점 둘째 자리에서 반올림해서 반환
        return round(plant_height_cm, 1)

    except Exception as e:
        print(f"분석 중 에러 발생: {e}")
        return 0.0