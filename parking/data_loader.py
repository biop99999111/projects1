# -*- coding: utf-8 -*-
"""CCTV 단속 구역·공영 주차장 CSV 로드 및 거리 계산."""
import csv
import math
from pathlib import Path

from django.conf import settings

# 고양시 중심 (일산) 기본 좌표
GOYANG_CENTER = (37.6584, 126.8320)

# 단속 구역 판정: 클릭 좌표와 이 거리(km) 이내면 단속 구역으로 간주
ENFORCEMENT_RADIUS_KM = 0.05  # 약 50m

# 근처 공영 주차장 반경(km) — 500m
PARKING_RADIUS_KM = 0.5


def _haversine_km(lat1, lon1, lat2, lon2):
    """두 위경도 간 거리(km)."""
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _load_csv(path, encoding='utf-8'):
    if not path or not Path(path).exists():
        return []
    rows = []
    with open(path, 'r', encoding=encoding, newline='') as f:
        try:
            reader = csv.reader(f)
            next(reader, None)  # header
            for row in reader:
                if len(row) > 0:
                    rows.append(row)
        except UnicodeDecodeError:
            with open(path, 'r', encoding='cp949', newline='') as f2:
                reader = csv.reader(f2)
                next(reader, None)
                for row in reader:
                    if len(row) > 0:
                        rows.append(row)
    return rows


def get_cctv_rows():
    """CCTV 단속 CSV 행 목록. 각 행: [관리번호, 소재지, 위도, 경도]."""
    base = getattr(settings, 'BASE_DIR', Path(__file__).resolve().parent.parent)
    path = base / 'Go-yang-si_cctv.csv'
    raw = _load_csv(str(path))
    out = []
    for row in raw:
        if len(row) < 4:
            continue
        try:
            lat = float(row[2].strip())
            lng = float(row[3].strip())
            out.append({
                'id': row[0].strip(),
                'address': row[1].strip(),
                'lat': lat,
                'lng': lng,
            })
        except (ValueError, IndexError):
            continue
    return out


def get_parking_rows():
    """공영 주차장 CSV 행. 위도·경도는 마지막에서 3번째, 2번째 컬럼."""
    base = getattr(settings, 'BASE_DIR', Path(__file__).resolve().parent.parent)
    path = base / 'Go-yang-si_parking_lot.csv'
    raw = _load_csv(str(path))
    out = []
    # CSV 컬럼: 0번호 1아이디 2주차장명 3구분 4유형 5도로명 6지번 7구획수 8운영요일
    # 9평일시작 10평일종료 11토시작 12토종료 13공휴시작 14공휴종료
    # 15요금정보 16기본시간 17기본요금 18추가단위시간 19추가단위요금
    # 20일권적용시간 21일권요금 22월정기권 23전화 24위도 25경도 26장애인
    def _cell(row, i, default=''):
        return row[i].strip() if len(row) > i else default

    for row in raw:
        if len(row) < 26:
            continue
        try:
            lat = float(row[24].strip())
            lng = float(row[25].strip())
            addr_j = _cell(row, 6)
            addr_r = _cell(row, 5)
            out.append({
                'name': _cell(row, 2),
                'address': addr_j or addr_r,
                'parking_type': _cell(row, 4),      # 노외/부설/노상
                'address_road': addr_r,
                'address_jibun': addr_j,
                'capacity': _cell(row, 7),          # 주차구획수
                'operating_days': _cell(row, 8),    # 운영요일
                'weekday_start': _cell(row, 9),
                'weekday_end': _cell(row, 10),
                'saturday_start': _cell(row, 11),
                'saturday_end': _cell(row, 12),
                'holiday_start': _cell(row, 13),
                'holiday_end': _cell(row, 14),
                'fee': _cell(row, 15),              # 요금정보
                'base_minutes': _cell(row, 16),
                'base_fee': _cell(row, 17),
                'extra_unit_minutes': _cell(row, 18),
                'extra_unit_fee': _cell(row, 19),
                'day_pass_hours': _cell(row, 20),
                'day_pass_fee': _cell(row, 21),
                'monthly_fee': _cell(row, 22),
                'phone': _cell(row, 23),
                'lat': lat,
                'lng': lng,
                'disabled_space': _cell(row, 26),   # Y/N
            })
        except (ValueError, IndexError):
            continue
    return out


def get_all_parking_simple():
    """검색용 전체 공영 주차장 리스트 (거리 계산 없음)."""
    parking_list = get_parking_rows()
    return [
        {
            'name': p['name'],
            'address': p.get('address') or p.get('address_jibun') or p.get('address_road', ''),
            'fee': p.get('fee', ''),
            'lat': p['lat'],
            'lng': p['lng'],
        }
        for p in parking_list
    ]


def check_enforcement(lat, lng):
    """해당 위경도가 단속 구역인지 확인. 단속이면 cctv 정보 반환."""
    cctv_list = get_cctv_rows()
    for c in cctv_list:
        km = _haversine_km(lat, lng, c['lat'], c['lng'])
        if km <= ENFORCEMENT_RADIUS_KM:
            return {
                'is_enforcement': True,
                'cctv': {
                    'id': c['id'],
                    'address': c['address'],
                    'lat': c['lat'],
                    'lng': c['lng'],
                },
            }
    return {'is_enforcement': False, 'cctv': None}


def get_nearby_parking(lat, lng, radius_km=None):
    """해당 위경도 기준 반경(기본 2km) 이내 공영 주차장 목록."""
    radius_km = radius_km or PARKING_RADIUS_KM
    parking_list = get_parking_rows()
    result = []
    for p in parking_list:
        km = _haversine_km(lat, lng, p['lat'], p['lng'])
        if km <= radius_km:
            result.append({
                **p,
                'distance_km': round(km, 2),
            })
    result.sort(key=lambda x: x['distance_km'])
    return result[:20]  # 최대 20개

