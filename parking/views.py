from django.shortcuts import render
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .data_loader import check_enforcement, get_nearby_parking


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
