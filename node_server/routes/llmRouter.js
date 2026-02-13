// node_server/routes/llmRouter.js
// ✅ 역할: (1) DB에서 최신 이벤트 1건 조회 → (2) Python LLM 서버에 전달 → (3) 알림 JSON 반환

const express = require("express");
const router = express.Router();

const axios = require("axios");              // ✅ Python 서버 호출용
const db = require("../config/db");          // ✅ 기존 DB 연결 모듈(너희 sensorRouter.js가 쓰는 거랑 동일)

router.get("/__ping", (req, res) => {
  res.json({ ok: true, route: "llmRouter alive" });
});


// ✅ Python FastAPI 서버 주소(로컬이면 localhost)
// - 팀 환경에서 Python 서버가 다른 PC/IP에 있으면 여기만 바꾸면 됨
const PYTHON_BASE_URL = "http://192.168.219.236:8000";

// ------------------------------------------------------
// 1) 최신 event log N건 가져오기 (Promise 방식)
// ------------------------------------------------------
async function fetchLatestEventsFromDB(limit = 3) {
  // ✅ 안전장치: limit은 1~10 사이만 허용
  const safeLimit = Math.max(1, Math.min(Number(limit) || 3, 10));

  const sql = `
    SELECT *
    FROM event_log
    ORDER BY event_date DESC
    LIMIT ${safeLimit}
  `;

  const result = await db.query(sql);

  // ✅ result가 [rows, fields] 형태면 rows만 꺼내기
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;

  return rows && rows.length > 0 ? rows : [];
}

// ------------------------------------------------------
// 2) DB row → Python LLM payload 형태로 변환(매핑)
// ------------------------------------------------------
function mapEventToLLMPayload(eventRow) {
  // ✅ DB 컬럼명이 대문자/소문자 섞일 수 있어서 안전하게 둘 다 대비
  //    (Workbench 화면은 EVENT_TYPE, PLANT_ID 이런 식이었지)
  const get = (key1, key2) => eventRow[key1] ?? eventRow[key2];

  return {
    plant_id: get("PLANT_ID", "plant_id"),
    event_type: get("EVENT_TYPE", "event_type"),

    // 센서값/임계치
    sensor_value: get("SENSOR_VALUE", "sensor_value"),
    threshold_min: get("THRESHOLD_MIN", "threshold_min"),
    threshold_max: get("THRESHOLD_MAX", "threshold_max"),

    // (선택) 상황 맥락(있으면 LLM 품질 좋아짐)
    temp: get("TEMP", "temp"),
    hum: get("HUM", "hum"),
    light: get("LIGHT", "light"),
    soil: get("SOIL", "soil"),
    event_date: get("EVENT_DATE", "event_date"),
  };
}

// ------------------------------------------------------
// 3) 라우터: "최신 이벤트 기반 LLM 알림 생성"
// ------------------------------------------------------
// ✅ 호출 URL 예시(서버가 /api 붙이면): POST http://localhost:3000/api/llm/latest-notification
router.post("/latest-notification", async (req, res) => {
  try {
    // (1) 최신 이벤트 3건 조회
    const events = await fetchLatestEventsFromDB(3);

    if (!events || events.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "event_log에 데이터가 없습니다.",
      });
    }

    // (2) events -> payload 변환
    const payload = {
      events: events.map(mapEventToLLMPayload),
    };

    console.log("📦 Python으로 보낼 payload(events):", payload);

    // (3) Python LLM 서버 호출 (C안: 통합 요약)
    const pyRes = await axios.post(
      `${PYTHON_BASE_URL}/llm/notification_summary`,
      payload
    );

    // (4) 그대로 프론트/웹으로 반환
    return res.status(200).json({
      ok: true,
      source_events: events,          // ✅ 여러 이벤트
      llm_notification: pyRes.data,   // ✅ Python이 만든 '통합' 알림 JSON 1개
    });
  } catch (err) {
    console.error("❌ LLM 라우터 실패:", err?.message);

    return res.status(500).json({
      ok: false,
      message: "LLM 알림 생성 실패",
      error: err?.message,
    });
  }
});

// ✅ 숙련도 점수 기반 LLM 해석 생성
// POST /api/llm/skill-interpret
router.post("/skill-interpret", async (req, res) => {
  try {
    const { email, days } = req.body || {};
    if (!email) {
      return res.status(400).json({ ok: false, message: "email이 필요합니다." });
    }

    const safeDays = Math.max(7, Math.min(Number(days) || 30, 90));

    const skillRes = await axios.get(
      "http://localhost:3001/api/report/skill-score",
      { params: { email, days: safeDays } }
    );

    if (!skillRes.data?.ok) {
      return res.status(400).json({
        ok: false,
        message: "숙련도 점수 조회 실패",
        detail: skillRes.data,
      });
    }

    const pyRes = await axios.post(
      `${PYTHON_BASE_URL}/llm/skill_interpret`,
      skillRes.data
    );

    return res.json({
      ok: true,
      input: skillRes.data,
      interpretation: pyRes.data,
    });
  } catch (err) {
    console.error("❌ skill-interpret error:", {
      message: err?.message,
      url: err?.config?.url,
      method: err?.config?.method,
      status: err?.response?.status ?? null,
      data: err?.response?.data ?? null,
    });

    return res.status(500).json({
      ok: false,
      message: "LLM 숙련도 해석 실패",
      error: err?.message,
      where: {
        url: err?.config?.url ?? null,
        method: err?.config?.method ?? null,
        status: err?.response?.status ?? null,
      },
    });
  }
});

module.exports = router;
