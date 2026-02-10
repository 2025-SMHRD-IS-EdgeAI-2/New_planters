import cv2
import numpy as np



def analyze_plant_height(image_bytes):
    try:
        # 1. 바이트 -> 이미지 변환
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return 0.0

        # 2. HSV 변환 및 초록색 마스크
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        
        # 초록색 범위 (조명에 따라 조절 필요)
        lower_green = np.array([30, 40, 40])
        upper_green = np.array([90, 255, 255])
        
        mask = cv2.inRange(hsv, lower_green, upper_green)

        # 3. 윤곽선 찾기
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            print("[Analysis] 초록색 식물 미감지")
            return 0.0

        # 4. 가장 큰 덩어리(식물) 높이 측정
        max_contour = max(contours, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(max_contour)

        # 5. 픽셀 -> cm 변환 (보정값)
        PIXEL_TO_CM = 0.05 
        height_cm = round(h * PIXEL_TO_CM, 1)

        print(f"[Analysis] 높이 픽셀: {h}px -> 변환: {height_cm}cm")
        return height_cm

    except Exception as e:
        print(f"[Error] 분석 실패: {e}")
        return 0.0