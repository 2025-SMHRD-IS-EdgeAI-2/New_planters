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

class NotificationSummaryRequest(BaseModel):
    events: List[NotificationRequest] = Field(default_factory=list) 

# ✅ LLM이 반환할 응답(JSON) 형태 (Node/프론트에서 바로 쓰기 좋게)
class NotificationResponse(BaseModel):
    status_short: str
    reason: str
    action_tip: str
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
        status_short="상태 확인이 필요해요.",
        reason=f"{req.event_type} 이벤트가 감지되었습니다.",
        action_tip="상태를 확인하고 필요 시 조치를 진행해 주세요.",
    )

# -----------------------------
# 3) 프롬프트 생성 (발표용/운영용)
# -----------------------------
def build_prompt(req: NotificationRequest) -> str:
    guide = EVENT_GUIDE.get(req.event_type, DEFAULT_GUIDE)

    # ✅ (1) LLM이 말 예쁘게 하려면 "상황 요약값"이 필요함
    # - 현재값이 범위를 얼마나 벗어났는지(초과/미달)를 계산해서 함께 제공
    deviation_note = ""
    try:
        v = float(req.sensor_value) if req.sensor_value is not None else None
        tmin = float(req.threshold_min) if req.threshold_min is not None else None
        tmax = float(req.threshold_max) if req.threshold_max is not None else None

        if v is not None and tmin is not None and tmax is not None:
            if v < tmin:
                deviation_note = f"상태: 정상 범위보다 낮음 (차이: {round(tmin - v, 2)})"
            elif v > tmax:
                deviation_note = f"상태: 정상 범위보다 높음 (차이: {round(v - tmax, 2)})"
            else:
                deviation_note = "상태: 정상 범위 안"
    except Exception:
        deviation_note = ""

    # ✅ (2) 필드별 역할/톤/길이를 강하게 지정하면 결과가 확 달라짐
    # - message: 오늘의 메시지(따뜻하게 1~2문장)
    # - status_short: 카드/모달 공통(짧은 1문장)
    # - reason: 데이터 기반 근거 1문장
    # - action_tip: 당장 할 수 있는 핵심 팁 1문장
    # - action_steps: 2~3개, 짧은 명령형
    prompt = f"""
너는 "GreenSync"의 반려식물 관리 코치야.
사용자는 일반 사용자이니 쉬운 말로, 친절하고 따뜻하게 안내해줘.
과장/확정 진단은 절대 금지야. (예: "병입니다", "반드시 죽습니다" 금지)

[입력 이벤트]
- plant_id: {req.plant_id}
- event_type: {req.event_type}
- sensor_value: {req.sensor_value}
- threshold_min: {req.threshold_min}
- threshold_max: {req.threshold_max}
- temp: {req.temp}
- hum: {req.hum}
- light: {req.light}
- soil: {req.soil}
- event_date: {req.event_date}
- {deviation_note}

[가이드(참고만 할 것)]
- 권장 제목 후보: "{guide['title']}"
- 권장 조치 후보: {guide['tips']}
- 권장 심각도: "{guide['severity']}"

[출력 규칙 - 매우 중요]
1) 결과는 반드시 JSON 객체 1개만 출력 (추가 설명/문장/코드블록 금지)
2) 아래 필드를 반드시 포함:
   - title, message, status_short, reason, action_tip, action_steps, severity
3) 문장 규칙:
   - message: 오늘의 메시지용 (친절한 1~2문장, 이모지는 최대 1개만 사용 가능)
   - status_short: 카드/모달 상태 요약용 (15~25자, 짧은 1문장, 이모지 금지)
   - reason: 왜 이런 알림인지 데이터 기반 1문장(수치/범위 언급)
   - action_tip: 지금 당장 할 수 있는 핵심 팁 1문장
   - action_steps: 2~3개, 짧은 명령형(각 15자 내외 권장)
4) severity는 반드시 아래 중 하나:
   - "info" | "warn" | "urgent"
   (권장 심각도를 가능한 한 따르되, 과장하지 말 것)

[JSON 스키마]
{{
  "title": "string",
  "message": "string",
  "status_short": "string",
  "reason": "string",
  "action_tip": "string",
  "action_steps": ["string", "string"],
  "severity": "info|warn|urgent"
}}

[좋은 예시(형식만 참고)]
{{
  "title": "온도가 높아요",
  "message": "지금 주변 온도가 조금 높게 감지됐어요 🌡️ 통풍을 도와주면 좋아요.",
  "status_short": "온도가 높아 주의가 필요해요.",
  "reason": "현재 온도(21.9)가 권장 범위(16~20)를 초과했어요.",
  "action_tip": "직사광선이면 위치를 살짝 옮겨 주세요.",
  "action_steps": ["환기해 주세요", "직사광선 피하기", "1시간 뒤 재확인"],
  "severity": "warn"
}}
""".strip()

    return prompt

SEVERITY_RANK = {"info": 0, "warn": 1, "urgent": 2}

def pick_primary_event(events: List[NotificationRequest]) -> NotificationRequest:
    """가장 심각한(guide severity 기준) 이벤트를 대표로 선택"""
    best = events[0]
    best_rank = SEVERITY_RANK.get(EVENT_GUIDE.get(best.event_type, DEFAULT_GUIDE)["severity"], 0)

    for e in events[1:]:
        rank = SEVERITY_RANK.get(EVENT_GUIDE.get(e.event_type, DEFAULT_GUIDE)["severity"], 0)
        if rank > best_rank:
            best, best_rank = e, rank

    return best

def build_summary_prompt(events: List[NotificationRequest]) -> str:
    """
    여러 이벤트를 한 번에 넣고, LLM이 '통합 알림 JSON 1개'만 만들게 하는 프롬프트
    """
    primary = pick_primary_event(events)
    primary_guide = EVENT_GUIDE.get(primary.event_type, DEFAULT_GUIDE)

    # 이벤트들을 사람이 읽기 좋게 묶어서 전달
    event_lines = []
    for idx, e in enumerate(events, start=1):
        guide = EVENT_GUIDE.get(e.event_type, DEFAULT_GUIDE)
        event_lines.append(f"""
[{idx}]
- plant_id: {e.plant_id}
- event_type: {e.event_type}
- sensor_value: {e.sensor_value}
- threshold_min: {e.threshold_min}
- threshold_max: {e.threshold_max}
- temp: {e.temp}
- hum: {e.hum}
- light: {e.light}
- soil: {e.soil}
- event_date: {e.event_date}
- guide_title: {guide["title"]}
- guide_severity: {guide["severity"]}
- guide_tips: {guide["tips"]}
""".strip())

    joined = "\n\n".join(event_lines)

    prompt = f"""
너는 "GreenSync"의 반려식물 관리 코치야.
사용자는 일반 사용자이니 쉬운 말로, 친절하고 따뜻하게 안내해줘.
과장/확정 진단은 절대 금지야.

[입력: 최근 이벤트 여러 개]
{joined}

[통합 요약 규칙 - 매우 중요]
1) 여러 이벤트를 종합해서 "알림 1개"로 만들어.
2) 중복되는 내용은 합치고, 가장 위험한 이슈를 우선으로 정리해.
3) 행동 제안은 2~3개만, 지금 당장 할 수 있는 것 위주.
4) 결과는 반드시 JSON 객체 1개만 출력 (추가 설명/문장/코드블록 금지)
5) 아래 필드를 반드시 포함:
   - title, message, status_short, reason, action_tip, action_steps, severity
6) severity는 아래 중 하나:
   - "info" | "warn" | "urgent"
   (기본은 대표 이벤트({primary.event_type})의 권장 심각도("{primary_guide["severity"]}")를 따르되 과장 금지)

[JSON 스키마]
{{
  "title": "string",
  "message": "string",
  "status_short": "string",
  "reason": "string",
  "action_tip": "string",
  "action_steps": ["string", "string"],
  "severity": "info|warn|urgent"
}}
""".strip()

    return prompt

def fallback_summary(events: List[NotificationRequest]) -> NotificationResponse:
    primary = pick_primary_event(events)
    guide = EVENT_GUIDE.get(primary.event_type, DEFAULT_GUIDE)

    return NotificationResponse(
        title=guide["title"],
        message="여러 상태 변화를 감지했어요. 한 번에 점검해 주세요.",
        status_short="여러 상태 점검 필요",
        reason="최근 여러 이벤트가 연속으로 감지되었습니다.",
        action_tip="우선 온도·빛·수분을 한 번에 확인해 주세요.",
        action_steps=guide.get("tips", ["상태 확인", "환경 조절", "재확인"])[:3],
        severity=guide.get("severity", "warn"),
    )

# -----------------------------
# 4) LLM 호출 함수
# -----------------------------
def call_llm(prompt: str) -> dict:
    # OpenAI 클라이언트 생성
    # - timeout: LLM이 응답 안 줄 때 무한 대기 방지
    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        timeout=60.0,        # ✅ 전체 기본 타임아웃(초) 크게
        max_retries=2        # ✅ 자동 재시도(지원되는 버전이면)
    )

    # LLM 호출
    # ❌ response_format 제거 (현재 SDK에서 에러 원인)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={ "type": "json_object" } # JSON으로만 받기
    )

    # responses API는 text를 여러 output으로 줄 수 있음
    # output_text는 "모든 텍스트 응답을 합친 문자열"
    raw_content = response.choices[0].message.content
    print(f"🤖 AI 원본 응답: {raw_content}") # 결과 확인용 로그
    # ===== JSON 파싱 =====
    # 우리가 프롬프트에서 "JSON만 출력"하라고 했기 때문에
    # 정상이라면 바로 json.loads 가능
    try:
        data = json.loads(raw_content)
        print(f"🤖 AI 응답 파싱 성공!")
        return data

    except Exception:
        # ❗ LLM이 가끔 이런 식으로 응답함
        # "다음은 결과입니다:\n{ ...json... }"
        # → 이 경우를 대비한 보정 로직

        start = raw_content.find("{")
        end = raw_content.rfind("}")

        if start != -1 and end != -1 and end > start:
            return json.loads(raw_content[start:end + 1])

        # 여기까지 왔다는 건 진짜 JSON이 깨졌다는 뜻
        # → 상위에서 fallback 처리하게 에러 다시 던짐
        raise

# -----------------------------
# 5) 라우터: Node가 호출하는 엔드포인트
# -----------------------------
@router.post("/notification")
def make_notification(req: NotificationRequest):
    """
    - LLM이 JSON을 이상하게 주거나 필드를 누락해도 서버가 500을 내지 않게 만든다.
    - 항상 NotificationResponse 스키마를 만족하도록 '보정'해서 반환한다.
    """

    # 0) 이벤트 타입에 따른 기본 가이드 (fallback 품질의 기준점)
    guide = EVENT_GUIDE.get(req.event_type, DEFAULT_GUIDE)

    try:
        # 1) 프롬프트 생성 → LLM 호출
        prompt = build_prompt(req)
        data = call_llm(prompt)  # dict 기대

        # 2) LLM이 dict가 아닌 값을 줄 수 있으니 1차 방어
        if not isinstance(data, dict):
            # dict 아니면 바로 fallback
            return fallback_notification(req).model_dump()

        # 3) 필수 필드(required) 누락 체크
        # NotificationResponse에서 '필수'로 잡아둔 키들
        required_keys = ["title", "message", "status_short", "reason", "action_tip"]

        # 하나라도 없으면 LLM 결과를 신뢰할 수 없으므로 fallback
        if any(k not in data or not str(data[k]).strip() for k in required_keys):
            return fallback_notification(req).model_dump()

        # 4) 선택 필드 보정: action_steps
        steps = data.get("action_steps", [])

        # steps가 리스트가 아니면 강제로 리스트로
        if not isinstance(steps, list):
            steps = []

        # 빈 문자열/공백 제거 (LLM이 ["", "   "] 줄 때 방어)
        steps = [s.strip() for s in steps if isinstance(s, str) and s.strip()]

        # 2개 미만이면 guide 기반으로 채우기
        if len(steps) < 2:
            steps = guide.get("tips", ["상태를 확인해 주세요.", "필요 시 조치를 진행해 주세요."])

        data["action_steps"] = steps[:3]

        # 5) 선택 필드 보정: severity
        # - 이벤트 타입(TEMP_HIGH 등)에 대해 우리가 정한 guide severity가 "정답"
        # - LLM이 info를 줘도 TEMP_HIGH면 warn으로 '강제'해서 UX가 일관되게 만든다

        default_severity = guide.get("severity", "warn")

        allowed = {"info", "warn", "urgent"}
        severity_from_llm = data.get("severity")

        # (1) LLM이 이상한 값을 주면 기본값
        if severity_from_llm not in allowed:
            data["severity"] = default_severity

        # (2) LLM이 허용값을 줬더라도, 이벤트 가이드가 warn/urgent면 그걸 우선 적용
        else:
            data["severity"] = default_severity

        # 6) (선택) title/message가 너무 기계적이면 여기서 후처리 가능
        # - 지금은 그대로 두되, 나중에 개선 가능 지점

        # 7) 최종 스키마 검증 + 반환
        # 여기서 NotificationResponse가 한 번 더 검증해줌
        return NotificationResponse(**data).model_dump()

    except Exception as e:
        # 8) 어떤 오류가 나도 500 대신 안정적으로 fallback 반환
        print("❌ make_notification error:", repr(e), flush=True)
        return fallback_notification(req).model_dump()
    
@router.post("/notification_summary")
def make_notification_summary(req: NotificationSummaryRequest):
    events = req.events or []
    print("1. 요청 들어옴!") # 이거 찍히나 봐봐
    if not events:
        raise HTTPException(status_code=400, detail="events가 비어 있습니다.")

    primary = pick_primary_event(events)
    guide = EVENT_GUIDE.get(primary.event_type, DEFAULT_GUIDE)

    try:
        prompt = build_summary_prompt(events)
        print("2. 프롬프트 완성!")
        data = call_llm(prompt)
        print("3. AI 응답 도착!")
        if not isinstance(data, dict):
            return fallback_summary(events).model_dump()

        required_keys = ["title", "message", "status_short", "reason", "action_tip"]
        if any(k not in data or not str(data[k]).strip() for k in required_keys):
            return fallback_summary(events).model_dump()

        # action_steps 보정
        steps = data.get("action_steps", [])
        if not isinstance(steps, list):
            steps = []
        steps = [s.strip() for s in steps if isinstance(s, str) and s.strip()]
        if len(steps) < 2:
            steps = guide.get("tips", ["상태 확인", "환경 조절", "재확인"])
        data["action_steps"] = steps[:3]

        # severity 보정 (대표 이벤트 기준으로 강제)
        allowed = {"info", "warn", "urgent"}
        default_sev = guide.get("severity", "warn")
        if data.get("severity") not in allowed:
            data["severity"] = default_sev
        else:
            data["severity"] = default_sev

        return NotificationResponse(**data).model_dump()

    except Exception as e:
        print("❌ make_notification_summary error:", repr(e), flush=True)
        return fallback_summary(events).model_dump()

# (선택) 라우터 살아있는지 확인용
@router.get("/ping")
def ping():
    return {"msg": "LLM router alive - v2026-02-10-C1"}