import os
from datetime import datetime
from typing import Optional

import cv2
import numpy as np


def analyze_plant_height(
    image_bytes: bytes,
    pixels_per_cm: float = 55.0,
    debug: bool = False,
    debug_dir: str = "debug_outputs",
    tag: Optional[str] = None,
    roi_ratio: float = 0.7,
    min_area_ratio: float = 0.05,
) -> float:
    
    print("📍 [DEBUG] analyze_plant_height loaded from:", __file__)
    print("📍 [DEBUG] received pixels_per_cm:", pixels_per_cm)
    print("📍 [DEBUG] received debug:", debug)


    """
    이미지 바이트 -> HSV 초록색 영역 검출 -> 식물 키(cm) 추정

    반영:
    - OPEN + CLOSE 적용 (노이즈 제거 + 구멍 메우기)
    - 작은 컨투어 제거(min_area_ratio)
    - y_min~y_max 기반 높이 측정 (boundingRect보다 안정적)
    - debug=True이면 debug_dir에 결과 이미지 저장
    """
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            print("❌ 이미지를 읽을 수 없습니다.")
            return 0.0

        H, W = img.shape[:2]

        # ROI(선택): 중앙 영역만 분석해 배경 오검출 줄이기
        if 0.0 < roi_ratio < 1.0:
            roi_w = int(W * roi_ratio)
            roi_h = int(H * roi_ratio)
            x0 = (W - roi_w) // 2
            y0 = (H - roi_h) // 2
            roi = img[y0:y0 + roi_h, x0:x0 + roi_w].copy()
            roi_offset = (x0, y0)
        else:
            roi = img
            roi_offset = (0, 0)

        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

        # 초록색 범위(조명 따라 조절 필요)
        lower_green = np.array([35, 40, 40], dtype=np.uint8)
        upper_green = np.array([85, 255, 255], dtype=np.uint8)

        mask = cv2.inRange(hsv, lower_green, upper_green)

        # 노이즈 제거 + 구멍 메우기
        kernel = np.ones((5, 5), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            print("🌱 초록색 식물을 찾지 못했습니다. (0.0cm 반환)")
            if debug:
                _debug_save(img, roi, mask, None, roi_offset, debug_dir=debug_dir, tag=tag)
            return 0.0

        # 작은 컨투어 제거
        min_area = (roi.shape[0] * roi.shape[1]) * float(min_area_ratio)
        contours = [c for c in contours if cv2.contourArea(c) >= min_area]
        if not contours:
            print("🌱 초록색 영역이 너무 작습니다. (0.0cm 반환)")
            if debug:
                _debug_save(img, roi, mask, None, roi_offset, debug_dir=debug_dir, tag=tag)
            return 0.0

        largest_contour = max(contours, key=cv2.contourArea)

        ys = largest_contour[:, :, 1]
        y_min = int(ys.min())
        y_max = int(ys.max())
        pixel_height = max(0, y_max - y_min)

        print(f"🔍 감지된 식물 픽셀 높이(y-range): {pixel_height}px")

        if pixels_per_cm <= 0:
            print("⚠️ pixels_per_cm 값이 올바르지 않습니다. (0.0cm 반환)")
            if debug:
                _debug_save(img, roi, mask, largest_contour, roi_offset,
                            y_min=y_min, y_max=y_max, debug_dir=debug_dir, tag=tag)
            return 0.0
        
        plant_height_cm = round(pixel_height / float(pixels_per_cm), 1)
        print(f"✅ 최종 분석 결과: {plant_height_cm:.1f}cm")
        print("pixel_height:", pixel_height)
        print("pixels_per_cm:", pixels_per_cm)

        if debug:
            _debug_save(img, roi, mask, largest_contour, roi_offset,
                        y_min=y_min, y_max=y_max, debug_dir=debug_dir, tag=tag)

        return plant_height_cm
    except Exception as e:
        print(f"⚠️ 분석 중 에러 발생: {e}")
        return 0.0


def _debug_save(
    full_img,
    roi_img,
    mask,
    contour,
    roi_offset,
    y_min=None,
    y_max=None,
    debug_dir: str = "debug_outputs",
    tag: Optional[str] = None,
):
    """debug=True일 때 마스크/결과 이미지를 debug_dir에 저장"""
    try:
        os.makedirs(debug_dir, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        tag = tag or "plant"

        mask_path = os.path.join(debug_dir, f"{tag}_{stamp}_mask.png")
        roi_path = os.path.join(debug_dir, f"{tag}_{stamp}_roi.png")
        full_path = os.path.join(debug_dir, f"{tag}_{stamp}_full.png")

        cv2.imwrite(mask_path, mask)

        vis = roi_img.copy()
        if contour is not None:
            cv2.drawContours(vis, [contour], -1, (0, 0, 255), 2)
            if y_min is not None:
                cv2.line(vis, (0, y_min), (vis.shape[1] - 1, y_min), (255, 0, 0), 2)
            if y_max is not None:
                cv2.line(vis, (0, y_max), (vis.shape[1] - 1, y_max), (255, 0, 0), 2)

        cv2.imwrite(roi_path, vis)

        full_vis = full_img.copy()
        x0, y0 = roi_offset
        if (x0, y0) != (0, 0):
            h, w = roi_img.shape[:2]
            cv2.rectangle(full_vis, (x0, y0), (x0 + w, y0 + h), (0, 255, 255), 2)

        cv2.imwrite(full_path, full_vis)

        print(f"🧪 debug 저장 완료: {mask_path} / {roi_path} / {full_path}")

       
        

    except Exception as e:
        print(f"⚠️ debug 저장 실패: {e}")
 


