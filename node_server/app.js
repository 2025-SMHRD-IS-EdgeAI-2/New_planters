// app.js
const express = require('express');
const app = express();
const path = require('path');
const cors = require('cors');

// sensor와 image 라우터 
// 라파에서 보내는 포트번호 3001로 설정해 놓음 (바꿀 수 있음)
const sensorRoutes = require('./routes/sensorRouter');
const imgRoutes = require('./routes/imgRouter');
const userRoutes = require('./routes/userRouter');              // web의 user 라우터
const plantRoutes = require('./routes/plantRouter');            // 식물 정보 라우터
const timelapseRoutes = require('./routes/timelapseRouter');    // 타임랩스 라우터
const statsRouter = require('./routes/statsRouter');            // 데이터 통계 라우터
const recommendationRoutes = require("./routes/recommendationRouter"); // 관수 분석 라우터
const growthRoutes = require("./routes/growthRouter");          // 관수 분석 라우터
const llmRoutes = require("./routes/llmRouter");                // llm 라우터
const diaryRoutes = require("./routes/diaryRouter");            // llm 라우터
const skillRouter = require("./routes/skillRouter");            // 숙련도점수 라우터


app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.json()); // json으로 날아온 데이터를 객체로 품! >> body로 전달
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/raspi_img', express.static(path.join(__dirname, 'raspi_img'))); // 사진 업로드용(타임랩스)

// 라우터 등록
app.use("/api/diary", diaryRoutes);
app.use("/api/llm", llmRoutes);
app.use("/api/growth", growthRoutes);
app.use("/api/recommendation", recommendationRoutes);
app.use('/api/user', userRoutes);
app.use('/api/imgs', imgRoutes);
app.use('/api/plants', plantRoutes);
app.use('/api/timelapse', timelapseRoutes);
app.use('/api/stats', statsRouter);
app.use('/api', sensorRoutes);
app.use("/api/report", skillRouter);

const PORT = 3001; // Node 서버는 3001번으로 방화벽 열어둠

// '0.0.0.0' : 모든 네트워크 주소로 들어오는 접속을 허용
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Node.js 서버 실행 중: 192.168.219.236:${PORT}`);
});