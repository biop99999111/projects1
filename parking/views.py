import urllib.request
import json as json_module
from django.shortcuts import render
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from .data_loader import check_enforcement, get_nearby_parking, get_all_parking_simple


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
    """출발·도착 위경도로 도로 경로 좌표 반환 (OSRM 드라이빙)."""
    try:
        start_lat = float(request.GET.get('start_lat'))
        start_lng = float(request.GET.get('start_lng'))
        end_lat = float(request.GET.get('end_lat'))
        end_lng = float(request.GET.get('end_lng'))
    except (TypeError, ValueError, KeyError):
        return JsonResponse({'error': 'start_lat, start_lng, end_lat, end_lng required'}, status=400)
    # OSRM: coordinates are lon,lat
    url = (
        'https://router.project-osrm.org/route/v1/driving/'
        f'{start_lng},{start_lat};{end_lng},{end_lat}'
        '?overview=full&geometries=geojson'
    )
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json_module.loads(resp.read().decode())
    except Exception:
        return JsonResponse({'path': []})
    path = []
    duration_seconds = None
    if data.get('code') == 'Ok' and data.get('routes'):
        route = data['routes'][0]
        coords = route.get('geometry', {}).get('coordinates', [])
        for lon, lat in coords:
            path.append([lat, lon])
        duration_seconds = route.get('duration')
    return JsonResponse({'path': path, 'duration_seconds': duration_seconds})

@require_GET
def api_parking_list(request):
    """전체 공영 주차장 CSV 검색용 리스트."""
    return JsonResponse(
        {'parking': get_all_parking_simple()},
        json_dumps_params={'ensure_ascii': False},
    )