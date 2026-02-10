const mysql = require("mysql2");

const pool = mysql.createPool({
    host: "192.168.219.48",
    port: 3306,
    user: "GreenSync",
    password: "1234",
    database: "greensync",
    timezone: 'Z',      // 로컬 시간 그대로 가져오기
    dateStrings: true, // 날짜를 문자열로 가져오기
    waitForConnections: true,
    connectionLimit: 10

});

const db = pool.promise();

(async ()=>{
    try {
        await db.query('SELECT 1');
        console.log("greensync DB 연결 성공!");        
    } catch (err) {
        console.error("greensync DB 연결 실패!");
        console.error('에러내용 :', err.code, err.message)
    }
})();

module.exports = db
