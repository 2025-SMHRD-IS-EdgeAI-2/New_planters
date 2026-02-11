// test_event_to_llm.js
const axios = require("axios");
const db = require("./config/db");

async function main() {
  try {
    // 1️⃣ DB에서 최신 이벤트 3건 조회
    const [rows] = await db.query(`
      SELECT *
      FROM event_log
      ORDER BY event_date DESC
      LIMIT 3
    `);

    if (!rows || rows.length === 0) {
      console.log("❌ event_log 테이블에 데이터가 없습니다.");
      return;
    }

    console.log("✅ DB에서 읽은 이벤트들:", rows);

    // 2️⃣ payload 객체를 명시적으로 선언
    const payload = {
      events: rows.map((event) => ({
        plant_id: event.PLANT_ID,
        event_type: event.EVENT_TYPE,
        sensor_value: event.SENSOR_VALUE,
        threshold_min: event.THRESHOLD_MIN,
        threshold_max: event.THRESHOLD_MAX,
        temp: event.TEMP,
        
        hum: event.HUM,
        light: event.LIGHT,
        soil: event.SOIL,
        event_date: event.EVENT_DATE,
      })),
    };

    console.log("➡️ Python으로 보낼 payload:", payload);

    // 3️⃣ Python LLM 서버 호출 (★ 이 줄이 지금 안 타고 있었음)
    const res = await axios.post(
      "http://192.168.219.236:8000/llm/notification_summary",
      payload,
      { timeout: 30000 }
    );

    // 4️⃣ 응답 확인
    console.log("🎉 Python 통합 알림 응답:", res.data);

  } catch (err) {
    console.error("❌ 테스트 실패:", err.message);
    if (err.response) {
      console.error("응답 상태:", err.response.status);
      console.error("응답 데이터:", err.response.data);
    }
  }
}

main();
