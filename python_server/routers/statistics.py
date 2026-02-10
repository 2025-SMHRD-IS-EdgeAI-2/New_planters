# 데이터 통계 라우터
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
import pandas as pd
from datetime import datetime

router = APIRouter()

# 데이터 규격 정의 (Node에서 보내주는 데이터 형태)
class StatsRequest(BaseModel):
    hourly: List[dict]
    events: List[dict]

@router.post("/stats")
async def analyze_stats(data: StatsRequest):
    # 1. 데이터를 Pandas DataFrame으로 변환
    df_hourly = pd.DataFrame(data.hourly)
    df_events = pd.DataFrame(data.events)
    # print("--- 관수 데이터 디버깅 ---")
    # print("전체 이벤트 개수:", len(df_events))

    # 2. 온습도 데이터
    if not df_hourly.empty: # 값이 하나라도 있다면 True 반환
        # 시간 형식으로 확실히 변환 (문자열 방지)
        df_hourly['CREATED_AT'] = pd.to_datetime(df_hourly['CREATED_AT'])
        # 과거(오전) -> 현재(오후) 순서로 정렬
        df_hourly = df_hourly.sort_values(by='CREATED_AT', ascending=True)        # 결측치 처리 ( interpolate(method='linear')> 중간에 빈 값 채우기 : 선형 방식)
        for col in ['TEMP_AVG', 'HUM_AVG', 'LIGHT_AVG']:
            df_hourly[col] = df_hourly[col].interpolate(method='linear').fillna(0)    
    
    # 3. 관수 통계 분석 (WATER_DROP_DETECTED)
    # 날짜 형식 변환
    # str > datetime 객체로 변환, dt 접근자를 통해 효과적인 분석 및 관리 가능
    # print("현재 컬럼들:", df_events.columns)
    df_events['EVENT_DATE'] = pd.to_datetime(df_events['EVENT_DATE'])
    now = datetime.now()

    # 물 준 이벤트만 필터링 및 날짜순 정렬
    water_df = df_events[df_events['EVENT_TYPE'] == 'WATER_DROP_DETECTED'].copy()
    water_df = water_df.sort_values(by='EVENT_DATE')
    # print("물준 이벤트:", water_df)

    # (1) 평균 관수 주기 계산 (전체 기록 대상)
    # diff() : 차이 계산, dt.days : 날짜로 변환(숫자)
    intervals = water_df['EVENT_DATE'].diff().dt.days.dropna()
    avg_water_interval = intervals.mean() if not intervals.empty else 0

    # (2) 이번 달 총 횟수 계산
    this_month_df = water_df[water_df['EVENT_DATE'].dt.month == now.month]
    total_count_this_month = len(this_month_df)

    # (3) 주차별 횟수 계산 (1주차~4주차)
    # (d.day - 1) // 7 + 1 로직으로 월별 주차 계산
    this_month_df['week_of_month'] = this_month_df['EVENT_DATE'].apply(lambda d: (d.day - 1) // 7 + 1)
    
    weekly_counts = []
    for i in range(1, 5):
        count = len(this_month_df[this_month_df['week_of_month'] == i])
        weekly_counts.append({"label": f"{i}주차", "value": count})


    # 4. 분석 결과 조립
    result = {
        # 그래프용 라벨 (HH:MM)
        "labels": df_hourly['CREATED_AT'].apply(lambda x: str(x)[11:16]).tolist() if not df_hourly.empty else [],
        "temp_data": df_hourly['TEMP_AVG'].tolist() if not df_hourly.empty else [],
        "hum_data": df_hourly['HUM_AVG'].tolist() if not df_hourly.empty else [],
        "light_data": df_hourly['LIGHT_AVG'].tolist() if not df_hourly.empty else [],
        
        # 디자인 시안 하단 수치들
        "analysis": {
            "avg_temp": round(df_hourly['TEMP_AVG'].mean(), 1) if not df_hourly.empty else 0,
            "avg_hum": round(df_hourly['HUM_AVG'].mean(), 1) if not df_hourly.empty else 0,
            "avg_light": int(df_hourly['LIGHT_AVG'].mean()) if not df_hourly.empty else 0,
            
            "water_avg_interval": round(avg_water_interval, 1),  # 평균 주기
            "water_total_month": total_count_this_month,         # 이번 달
            "water_weekly": weekly_counts                        # 주차별 횟수 리스트
        }
    }

    return result