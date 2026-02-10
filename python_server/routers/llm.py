# python_server/routers/llm.py
# ✅ 역할: "LLM 알림 생성 서비스"
# - Node가 이벤트 정보를 보내면
# - LLM이 사용자 알림 문장(JSON)을 만들어서 반환한다
# - 실패하면 fallback(고정 문장)으로라도 반드시 응답한다 (서비스 안정성)

import os
# ✅ .env 파일에서 OPENAI_API_KEY 읽어오기
# - .env는 python_server/.env 위치에 있어야 함
# - 이 코드를 넣어야 FastAPI(uvicorn)가 실행될 때 키를 로드할 수 있음
from pathlib import Path
from dotenv import load_dotenv

# ✅ llm.py 위치 기준으로 python_server/.env 경로를 강제로 지정
# llm.py = python_server/routers/llm.py
# parents[1] = python_server
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

# ✅ 디버그: 키가 제대로 로드됐는지 확인 (True가 나와야 정상)
print("✅ OPENAI_API_KEY loaded?", bool(os.getenv("OPENAI_API_KEY")))

import json
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# OpenAI 공식 Python SDK
# - pip install openai 필요
from openai import OpenAI

router = APIRouter()

# ✅ Node가 보내줄 요청(JSON) 형태 정의 (계약/스펙)
class NotificationRequest(BaseModel):
    plant_id: int
    event_type: str

    # 센서값/임계치 (이벤트 설명에 가장 중요)
    sensor_value: Optional[float] = None
    threshold_min: Optional[float] = None
    threshold_max: Optional[float] = None

    # (선택) 상황 맥락 추가하면 문장이 좋아짐
    temp: Optional[float] = None
    hum: Optional[float] = None
    light: Optional[float] = None
    soil: Optional[float] = None
    event_date: Optional[str] = None


# ✅ LLM이 반환할 응답(JSON) 형태 (Node/프론트에서 바로 쓰기 좋게)
class NotificationResponse(BaseModel):
    title: str
    message: str
    action_steps: List[str] = Field(default_factory=list)
    severity: str = "info"  # info | warn | urgent (원하면 Node에서 색/아이콘에 쓰기 좋음)


# -----------------------------
# 1) 이벤트 타입별 "가이드 템플릿"
# -----------------------------
# ✅ LLM에게 "결정"시키지 말고, "설명"만 시키는 게 안전하고 일관됨
EVENT_GUIDE: Dict[str, Dict[str, Any]] = {
    "TEMP_HIGH": {
        "title": "온도가 높아요",
        "severity": "warn",
        "tips": ["통풍이 잘 되게 해주세요", "직사광선이면 그늘로 옮겨주세요", "급격한 환경 변화는 피해주세요"],
    },
    "TEMP_LOW": {
        "title": "온도가 낮아요",
        "severity": "warn",
        "tips": ["찬 바람/창가를 피해주세요", "실내 온도를 안정적으로 유지해주세요", "과습만 주의해주세요"],
    },
    "WATER_LOW": {
        "title": "급수 필요 신호",
        "severity": "warn",
        "tips": ["흙 상태를 확인하고 물을 주세요", "한 번에 과다 급수는 피해주세요", "배수 상태도 같이 확인해주세요"],
    },
    "SOIL_LOW": {
        "title": "토양 수분이 낮아요",
        "severity": "warn",
        "tips": ["겉흙/속흙 상태를 확인해 주세요", "필요 시 물을 천천히 나눠 주세요", "최근 급수/배수 상태도 확인해 주세요"],
    },
    "LUX_LOW": {
        "title": "광량이 부족해요",
        "severity": "info",
        "tips": ["밝은 창가로 옮겨주세요", "직사광선은 식물에 따라 주의해주세요", "조명이 있으면 보조광도 고려해요"],
    },
}

DEFAULT_GUIDE = {
    "title": "식물 상태 알림",
    "severity": "info",
    "tips": ["식물 상태를 확인해 주세요", "필요 시 환경을 조절해 주세요"],
}


# -----------------------------
# 2) fallback (LLM 실패 시)
# -----------------------------
def fallback_notification(req: NotificationRequest) -> NotificationResponse:
    guide = EVENT_GUIDE.get(req.event_type, DEFAULT_GUIDE)
    return NotificationResponse(
        title=guide["title"],
        message=f"{req.event_type} 이벤트가 감지되었습니다.",
        action_steps=guide["tips"],
        severity=guide["severity"],
    )


# -----------------------------
# 3) 프롬프트 생성
# -----------------------------
def build_prompt(req: NotificationRequest) -> str:
    guide = EVENT_GUIDE.get(req.event_type, DEFAULT_GUIDE)

    # ✅ LLM에게 “무조건 JSON만” 출력하게 강하게 요구
    # - response_format={"type":"json_object"}를 같이 쓰면 JSON만 출력되게 강제 가능 :contentReference[oaicite:2]{index=2}
    prompt = f"""
너는 반려식물 관리 코치야. 아래 이벤트를 보고 사용자에게 보낼 알림을 만들어줘.

[이벤트]
plant_id: {req.plant_id}
event_type: {req.event_type}
sensor_value: {req.sensor_value}
threshold_min: {req.threshold_min}
threshold_max: {req.threshold_max}
temp: {req.temp}
hum: {req.hum}
light: {req.light}
soil: {req.soil}
event_date: {req.event_date}

[가이드(참고)]
- 권장 제목 후보: "{guide['title']}"
- 권장 조치 후보: {guide['tips']}
- 심각도 후보: "{guide['severity']}"

[출력 규칙]
- 절대 과장/확정 진단 금지 (예: "병입니다", "반드시 죽습니다" 금지)
- 2~4문장 이내로 짧고 명확하게
- 행동 제안은 2~3개
- 결과는 반드시 JSON 1개만 출력 (추가 설명 텍스트 금지)
- JSON 스키마:
{{
  "title": "string",
  "message": "string",
  "action_steps": ["string", "string"],
  "severity": "info|warn|urgent"
}}
""".strip()

    return prompt


# -----------------------------
# 4) LLM 호출 함수
# -----------------------------
def call_llm(prompt: str) -> Dict[str, Any]:
    # ✅ SDK는 환경변수 OPENAI_API_KEY를 읽는 방식이 기본 :contentReference[oaicite:3]{index=3}
    # ✅ OpenAI 클라이언트 생성
# - env에서 읽은 키를 명시적으로 넣어주면 더 확실함
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


    # ✅ Responses API + JSON 모드 사용
    # - response_format={"type":"json_object"} 로 JSON만 나오게 강제 :contentReference[oaicite:4]{index=4}
    resp = client.responses.create(
        model="gpt-5",
        input=prompt,
        response_format={"type": "json_object"},
    )

    # SDK가 만들어준 최종 텍스트(= JSON 문자열)
    text = resp.output_text

    # JSON 문자열 → dict로 변환
    return json.loads(text)


# -----------------------------
# 5) 라우터: Node가 호출하는 엔드포인트
# -----------------------------
@router.post("/notification")
async def make_notification(req: NotificationRequest):
    """
    ✅ Node가 이벤트 발생 시 호출:
    POST /llm/notification
    body: NotificationRequest

    ✅ 반환:
    NotificationResponse 형태의 JSON(dict)
    """
    try:
        prompt = build_prompt(req)
        data = call_llm(prompt)

        # ✅ 최소 검증/정리 (키 없으면 fallback)
        # - LLM이 가끔 필드 누락할 수 있으니 안전장치
        if "title" not in data or "message" not in data:
            return fallback_notification(req).model_dump()

        # action_steps / severity 보정
        if "action_steps" not in data or not isinstance(data["action_steps"], list):
            data["action_steps"] = EVENT_GUIDE.get(req.event_type, DEFAULT_GUIDE)["tips"][:2]

        if "severity" not in data:
            data["severity"] = EVENT_GUIDE.get(req.event_type, DEFAULT_GUIDE)["severity"]

        # ✅ 최종 응답
        # (Pydantic으로 한 번 검증해서 깨끗한 JSON으로 반환)
        return NotificationResponse(**data).model_dump()

    except Exception as e:
        # ✅ LLM 실패/파싱 실패/네트워크 문제 등 → fallback으로 서비스 유지
        print(f"❌ LLM 실패: {e}")
        return fallback_notification(req).model_dump()


# (선택) 라우터 살아있는지 확인용
@router.get("/ping")
def ping():
    return {"msg": "LLM router alive"}
