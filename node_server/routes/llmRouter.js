// node_server/routes/llmRouter.js
// ✅ 역할: (1) DB에서 최신 이벤트 1건 조회 → (2) Python LLM 서버에 전달 → (3) 알림 JSON 반환

const express = require("express");
const router = express.Router();

const axios = require("axios");              // ✅ Python 서버 호출용
const db = require("../config/db");          // ✅ 기존 DB 연결 모듈(너희 sensorRouter.js가 쓰는 거랑 동일)

// ✅ Python FastAPI 서버 주소
// - 팀 환경에서 Python 서버가 다른 PC/IP에 있으면 여기만 바꾸면 됨
const PYTHON_BASE_URL = "http://192.168.219.197:8000";

// ------------------------------------------------------
// 1) 최신 event log 1건 가져오기 (Promise 방식)
// ------------------------------------------------------
async function fetchLatestEventFromDB() {
  // ✅ Workbench에서 확인한 쿼리 그대로
  const sql = `
    SELECT *
    FROM EVENT_LOG
    ORDER BY event_date DESC
    LIMIT 1
  `;

  /**
   * ✅ mysql2/promise면 db.query(sql) 결과가 [rows, fields] 형태
   * ❌ 콜백(db.query(sql, (err, rows)=>...)) 쓰면
   *    "Callback function is not available with promise clients." 에러남
   */
  const [rows] = await db.query(sql);

  // ✅ 최신 1건 반환 (없으면 null)
  return rows && rows.length > 0 ? rows[0] : null;
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
    // (1) 최신 이벤트 조회
    const latest = await fetchLatestEventFromDB();

    if (!latest) {
      return res.status(404).json({
        ok: false,
        message: "event_log에 데이터가 없습니다.",
      });
    }

    // (2) payload로 변환
    const payload = mapEventToLLMPayload(latest);
    console.log("📦 Python으로 보낼 payload:", payload);

    // (3) Python LLM 서버 호출
    // ✅ Python 쪽: POST /llm/notification
    const pyRes = await axios.post(`${PYTHON_BASE_URL}/llm/notification`, payload);

    // (4) 그대로 프론트/웹으로 반환
    return res.status(200).json({
      ok: true,
      source_event: latest,      // ✅ 어떤 이벤트로 생성했는지(디버깅에 도움)
      llm_notification: pyRes.data // ✅ Python이 만든 알림 JSON
    });
  } catch (err) {
    console.error("❌ LLM 라우터 실패:", err?.message);

    // Python 서버가 꺼져있거나, 네트워크/키 문제 등
    return res.status(500).json({
      ok: false,
      message: "LLM 알림 생성 실패",
      error: err?.message,
    });
  }
});

module.exports = router;
