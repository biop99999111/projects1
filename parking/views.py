import urllib.request
import json as json_module
from django.shortcuts import render, get_object_or_404
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import csrf_exempt
from .data_loader import check_enforcement, get_nearby_parking, get_all_parking_simple
from .models import Report


def map_view(request):
    """메인 페이지: 카카오맵 지도."""
    return render(request, 'parking/map.html', {
        'kakao_map_js_key': getattr(settings, 'KAKAO_MAP_JS_KEY', ''),
    })


@require_GET
def api_check_location(request):
    """위·경도로 단속 구역 여부 + 근처 공영 주차장(500m) JSON 반환."""
    try:
        lat = float(request.GET.get('lat', 0))
        lng = float(request.GET.get('lng', 0))
    except (TypeError, ValueError):
        return JsonResponse({'error': 'lat, lng required'}, status=400)
    info = check_enforcement(lat, lng)
    info['nearby_parking'] = get_nearby_parking(lat, lng, radius_km=0.5)
    return JsonResponse(info, json_dumps_params={'ensure_ascii': False})


@require_GET
def api_route(request):
    """출발·도착 위경도로 실제 도로 경로 좌표 및 실시간 이동시간 반환 (카카오 내비 REST API)."""
    try:
        start_lat = float(request.GET.get('start_lat'))
        start_lng = float(request.GET.get('start_lng'))
        end_lat = float(request.GET.get('end_lat'))
        end_lng = float(request.GET.get('end_lng'))
    except (TypeError, ValueError, KeyError):
        return JsonResponse({'error': 'start_lat, start_lng, end_lat, end_lng required'}, status=400)

    rest_key = getattr(settings, 'KAKAO_REST_API_KEY', 'db210bbb1640818e0b3e3fc726869367')
    url = (
        'https://apis-navi.kakaomobility.com/v1/directions'
        f'?origin={start_lng},{start_lat}&destination={end_lng},{end_lat}&priority=TIME'
    )
    req = urllib.request.Request(url, headers={'Authorization': f'KakaoAK {rest_key}'})

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json_module.loads(resp.read().decode())
    except Exception:
        # 실패 시에는 경로 없이 시간도 제공하지 않음
        return JsonResponse({'path': [], 'duration_seconds': None})

    # 카카오 내비 응답: routes[0].summary.duration (초 단위, 일부 버전은 ms일 수 있어 보정)
    duration_seconds = None
    path = []
    routes = data.get('routes') or []
    if routes:
        first_route = routes[0]
        summary = first_route.get('summary') or {}
        dur = summary.get('duration')
        if isinstance(dur, (int, float)):
            # ms 단위 가능성도 고려해 1,000,000 이상이면 초로 보정
            duration_seconds = int(dur / 1000) if dur > 1000000 else int(dur)

        # 실제 도로 경로 좌표 구성
        sections = first_route.get('sections') or []
        coords = []
        for sec in sections:
            roads = sec.get('roads') or []
            for road in roads:
                # vertexes: [lng1, lat1, lng2, lat2, ...]
                v = road.get('vertexes') or []
                for i in range(0, len(v) - 1, 2):
                    lng = v[i]
                    lat = v[i + 1]
                    coords.append([lat, lng])

        # 좌표가 있으면 그것을 path로 사용, 없으면 직선 fallback
        if coords:
            path = coords
        else:
            path = [[start_lat, start_lng], [end_lat, end_lng]]
    else:
        # routes 없으면 직선 fallback
        path = [[start_lat, start_lng], [end_lat, end_lng]]

    return JsonResponse({'path': path, 'duration_seconds': duration_seconds})

@require_GET
def api_parking_list(request):
    """전체 공영 주차장 CSV 검색용 리스트."""
    return JsonResponse(
        {'parking': get_all_parking_simple()},
        json_dumps_params={'ensure_ascii': False},
    )


@require_GET
def api_search_parking_kakao(request):
    """카카오 로컬 REST API로 반경 500m 이내 주차장(PK6) 검색."""
    try:
        lat = float(request.GET.get('lat'))
        lng = float(request.GET.get('lng'))
    except (TypeError, ValueError):
        return JsonResponse({'error': 'lat, lng required'}, status=400)

    rest_key = getattr(settings, 'KAKAO_REST_API_KEY', 'db210bbb1640818e0b3e3fc726869367')
    base_url = 'https://dapi.kakao.com/v2/local/search/category.json'
    query = (
        f'{base_url}?category_group_code=PK6'
        f'&x={lng}&y={lat}&radius=500&sort=distance&page=1&size=15'
    )
    req = urllib.request.Request(query, headers={'Authorization': f'KakaoAK {rest_key}'})

    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json_module.loads(resp.read().decode('utf-8'))
    except Exception:
        return JsonResponse({'documents': []})

    docs = data.get('documents') or []
    # 그대로 프론트에 전달 (place_name, address_name, road_address_name, x,y,distance 등)
    return JsonResponse({'documents': docs}, json_dumps_params={'ensure_ascii': False})


# ----- 신고하기 / 신고목록 API -----

@require_GET
def api_report_list(request):
    """신고 목록 (비밀번호 제외)."""
    reports = Report.objects.all()[:200]
    items = []
    for r in reports:
        items.append({
            'id': r.id,
            'vehicle_number': r.vehicle_number,
            'lat': r.lat,
            'lng': r.lng,
            'content': r.content,
            'created_at': r.created_at.isoformat() if r.created_at else None,
        })
    return JsonResponse({'reports': items}, json_dumps_params={'ensure_ascii': False})


@require_GET
def api_report_detail(request, report_id):
    """신고 상세 (비밀번호 제외)."""
    r = get_object_or_404(Report, pk=report_id)
    return JsonResponse({
        'id': r.id,
        'vehicle_number': r.vehicle_number,
        'lat': r.lat,
        'lng': r.lng,
        'content': r.content,
        'created_at': r.created_at.isoformat() if r.created_at else None,
    }, json_dumps_params={'ensure_ascii': False})


@csrf_exempt
@require_POST
def api_report_create(request):
    """신고하기 제출."""
    try:
        body = json_module.loads(request.body.decode('utf-8'))
        vehicle_number = (body.get('vehicle_number') or '').strip()
        lat = float(body.get('lat'))
        lng = float(body.get('lng'))
        content = (body.get('content') or '').strip()
        password = body.get('password') or ''
    except (TypeError, ValueError, KeyError):
        return JsonResponse({'error': 'vehicle_number, lat, lng, password required'}, status=400)
    if not vehicle_number:
        return JsonResponse({'error': '차량번호를 입력하세요.'}, status=400)
    if not password:
        return JsonResponse({'error': '비밀번호를 입력하세요.'}, status=400)
    r = Report(vehicle_number=vehicle_number, lat=lat, lng=lng, content=content)
    r.set_password(password)
    r.save()
    return JsonResponse({'ok': True, 'id': r.id}, json_dumps_params={'ensure_ascii': False})


@csrf_exempt
@require_POST
def api_report_delete(request, report_id):
    """비밀번호 일치 시 신고 삭제."""
    r = get_object_or_404(Report, pk=report_id)
    try:
        body = json_module.loads(request.body.decode('utf-8'))
        password = body.get('password') or ''
    except Exception:
        return JsonResponse({'error': '비밀번호를 입력하세요.'}, status=400)
    if not r.check_password(password):
        return JsonResponse({'error': '비밀번호가 일치하지 않습니다.'}, status=403)
    r.delete()
    return JsonResponse({'ok': True}, json_dumps_params={'ensure_ascii': False})