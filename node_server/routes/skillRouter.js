// node_server/routes/skillRouter.js  = = = 숙련도점수
const express = require("express");
const router = express.Router();
const db = require("../config/db"); // ✅ node_server/config/db.js
const axios = require("axios");
const PYTHON_BASE_URL = "http://localhost:8000"; // 팀 환경이면 Python IP로 변경

// db.query 결과가 [rows, fields] 또는 rows 로 올 수 있어서 안전 처리
function unwrapRows(result) {
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(n, max));
}

function round(n) {
  return Math.round(n);
}

function calcLevel(totalScore) {
  const s = clamp(totalScore, 0, 100);
  if (s <= 30) return { levelName: "초보 식집사", nextCut: 31 };
  if (s <= 60) return { levelName: "성장하는 식집사", nextCut: 61 };
  if (s <= 85) return { levelName: "숙련된 식집사", nextCut: 86 };
  return { levelName: "마스터 식집사", nextCut: 100 };
}

// ✅ email로 가장 최근 등록된 plant_id 하나 가져오기
// (plantRouter가 PLANT_INFO + USER_INFO join 쓰는 패턴 그대로) :contentReference[oaicite:2]{index=2}
async function resolvePlantIdByEmail(email) {
  const sql = `
    SELECT p.PLANT_ID
    FROM PLANT_INFO p
    JOIN USER_INFO u ON p.USER_ID = u.USER_ID
    WHERE u.EMAIL = ?
    ORDER BY p.CREATED_AT DESC
    LIMIT 1
  `;
  const result = await db.query(sql, [email]);
  const rows = unwrapRows(result);
  return rows?.[0]?.PLANT_ID ?? null;
}

// ✅ 최근 N일 동안 센서별 "적정 범위 비율" 집계
async function fetchSensorInRangeRates({ plantId, days }) {
const sql = `
  SELECT
    SENSOR_TYPE AS sensor_type,
    COUNT(*) AS total_cnt,
    SUM(
      CASE
        WHEN
          SENSOR_VALUE IS NOT NULL
          AND (
            (SENSOR_TYPE='temp' AND SENSOR_VALUE BETWEEN 18 AND 28)
            OR (SENSOR_TYPE='hum'  AND SENSOR_VALUE BETWEEN 30 AND 60)
            OR (SENSOR_TYPE='lux'  AND SENSOR_VALUE BETWEEN 50 AND 500)
            OR (SENSOR_TYPE='soil' AND SENSOR_VALUE BETWEEN 0 AND 60)
          )
        THEN 1 ELSE 0
      END
    ) AS ok_cnt
  FROM event_log
  WHERE PLANT_ID = ?
    AND EVENT_DATE >= DATE_SUB(NOW(), INTERVAL ? DAY)
    AND SENSOR_TYPE IN ('temp','hum','lux','soil')
  GROUP BY SENSOR_TYPE
`;

const result = await db.query(sql, [plantId, days]);
const rows = unwrapRows(result);

// DB sensor_type → 표준 sensor_type 변환
const mapType = (t) => {
  const x = String(t || "").toLowerCase();
  if (x === "temp") return "TEMP";
  if (x === "hum") return "HUM";
  if (x === "lux") return "LIGHT";
  if (x === "soil") return "SOIL";
  return x.toUpperCase();
};

const byType = {};
for (const r of rows) {
  const type = mapType(r.sensor_type);
  const total = Number(r.total_cnt || 0);
  const ok = Number(r.ok_cnt || 0);
  const rate = total > 0 ? ok / total : null;
  byType[type] = { total, ok, rate };
}
return byType;
}

function avgRates(types, byType) {
  const vals = [];
  for (const t of types) {
    const rate = byType?.[t]?.rate;
    if (typeof rate === "number" && !Number.isNaN(rate)) vals.push(rate);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * ✅ 호출 예시:
 * GET /api/report/skill-score?email=test@test.com&days=30
 */
router.get("/skill-score", async (req, res) => {
  try {
    const email = req.query.email;
    const days = clamp(Number(req.query.days) || 30, 7, 90);

    if (!email) {
      return res.status(400).json({
        ok: false,
        message: "email 쿼리가 필요합니다. 예) /api/report/skill-score?email=test@test.com",
      });
    }

    // 1) email -> plantId
    const plantId = await resolvePlantIdByEmail(email);
    if (!plantId) {
      return res.status(404).json({
        ok: false,
        message: "해당 이메일로 등록된 식물이 없습니다.",
      });
    }

    // 2) 센서별 적정비율 조회
    const byType = await fetchSensorInRangeRates({ plantId, days });

    // 3) 점수 계산
    // envScore: TEMP/HUM/LIGHT 평균
    const envRate = avgRates(["TEMP", "HUM", "LIGHT"], byType);
    const envScore = envRate === null ? 0 : round(envRate * 100);

    // waterScore: SOIL 적정비율
    const soilRate = byType?.SOIL?.rate;
    const waterScore = typeof soilRate === "number" ? round(soilRate * 100) : 0;

    // recordScore: 이번 1단계에서는 0 (다음 단계에서 timeline 연결)
    const recordScore = 0;

    // 가중치: 물 40 / 환경 35 / 기록 25
    const totalScore = round(
      waterScore * 0.4 + envScore * 0.35 + recordScore * 0.25
    );

    const { levelName, nextCut } = calcLevel(totalScore);
    const nextLevelRemaining =
      nextCut === 100 && totalScore >= 100 ? 0 : Math.max(0, nextCut - totalScore);

    // 4) 응답
    return res.json({
      ok: true,
      email,
      plantId,
      periodDays: days,
      scores: { totalScore, waterScore, envScore, recordScore },
      level: { levelName, nextLevelRemaining },

      // LLM/프론트에 “근거 데이터”로도 쓰기 좋음
      signals: {
        sensor_ok_rate: {
          TEMP: byType?.TEMP?.rate ?? null,
          HUM: byType?.HUM?.rate ?? null,
          LIGHT: byType?.LIGHT?.rate ?? null,
          SOIL: byType?.SOIL?.rate ?? null,
        },
        sensor_counts: {
          TEMP: byType?.TEMP?.total ?? 0,
          HUM: byType?.HUM?.total ?? 0,
          LIGHT: byType?.LIGHT?.total ?? 0,
          SOIL: byType?.SOIL?.total ?? 0,
        },
        record: {
          status: "not_implemented",
          message: "timeline 기록 점수는 2단계에서 연동합니다.",
        },
      },
    });
  } catch (err) {
    console.error("❌ skill-score error:", err);
    return res.status(500).json({
      ok: false,
      message: "숙련도 점수 계산 실패",
      error: err?.message,
    });
  }
});

/**
 * ✅ 2단계: 점수 계산 + LLM 해석까지 한번에
 * 호출 예시:
 * GET /api/report/skill-interpret?email=test@test.com&days=30
 */
router.get("/skill-interpret", async (req, res) => {
  try {
    const email = req.query.email;
    const days = clamp(Number(req.query.days) || 30, 7, 90);

    if (!email) {
      return res.status(400).json({ ok: false, message: "email 쿼리가 필요합니다." });
    }

    // ------------------------------------------------
    // (1) 기존 skill-score 로직 그대로 재사용해서 scorePayload 만들기
    //     (router.get("/skill-score") 내부와 '같은 계산')
    // ------------------------------------------------
    const plantId = await resolvePlantIdByEmail(email);
    if (!plantId) {
      return res.status(404).json({ ok: false, message: "해당 이메일로 등록된 식물이 없습니다." });
    }

    const byType = await fetchSensorInRangeRates({ plantId, days });

    const envRate = avgRates(["TEMP", "HUM", "LIGHT"], byType);
    const envScore = envRate === null ? 0 : round(envRate * 100);

    const soilRate = byType?.SOIL?.rate;
    const waterScore = typeof soilRate === "number" ? round(soilRate * 100) : 0;

    const recordScore = 0;

    const totalScore = round(waterScore * 0.4 + envScore * 0.35 + recordScore * 0.25);

    const { levelName, nextCut } = calcLevel(totalScore);
    const nextLevelRemaining =
      nextCut === 100 && totalScore >= 100 ? 0 : Math.max(0, nextCut - totalScore);

    const scorePayload = {
      ok: true,
      email,
      plantId,
      periodDays: days,
      scores: { totalScore, waterScore, envScore, recordScore },
      level: { levelName, nextLevelRemaining },
      signals: {
        sensor_ok_rate: {
          TEMP: byType?.TEMP?.rate ?? null,
          HUM: byType?.HUM?.rate ?? null,
          LIGHT: byType?.LIGHT?.rate ?? null,
          SOIL: byType?.SOIL?.rate ?? null,
        },
        sensor_counts: {
          TEMP: byType?.TEMP?.total ?? 0,
          HUM: byType?.HUM?.total ?? 0,
          LIGHT: byType?.LIGHT?.total ?? 0,
          SOIL: byType?.SOIL?.total ?? 0,
        },
        record: { status: "not_implemented", message: "timeline 기록 점수는 2단계에서 연동합니다." },
      },
    };

    // ------------------------------------------------
    // (2) Python LLM 해석 호출
    // ------------------------------------------------
    const pyRes = await axios.post(`${PYTHON_BASE_URL}/llm/skill_interpret`, {
      email: scorePayload.email,
      plantId: scorePayload.plantId,
      periodDays: scorePayload.periodDays,
      scores: scorePayload.scores,
      level: scorePayload.level,
      signals: scorePayload.signals,
    });

    // ------------------------------------------------
    // (3) 합쳐서 반환
    // ------------------------------------------------
    return res.json({
      ok: true,
      score: scorePayload,
      llm: pyRes.data,
    });

  } catch (err) {
    console.error("❌ skill-interpret error:", err?.message);
    return res.status(500).json({ ok: false, message: "숙련도 LLM 해석 실패", error: err?.message });
  }
});

module.exports = router;
