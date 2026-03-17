        var mapContainer = document.getElementById('map');
        var options = {
            center: new kakao.maps.LatLng(37.6584, 126.8320),
            level: 7
        };
        var map = new kakao.maps.Map(mapContainer, options);

        // 캐시 프리웜: 페이지 로드 후 한 번 호출해 서버 캐시를 채워 두어 첫 클릭 시 응답이 빨라지도록 함
        fetch('/api/check-location/?lat=37.6584&lng=126.8320').catch(function() {});

        var currentMarker = null;
        var currentOverlay = null;
        var parkingInfoOverlay = null;
        var routeInfoOverlay = null;  // 마커 위 예상시간 등 경로 안내 오버레이
        var parkingMarkers = [];
        var searchMarkers = [];
        var allParkingList = [];
        var allParkingLoaded = false;
        var routeLine = null;  // 선택한 공영 주차장까지 경로선
        var enforcementCircle = null; // 단속구역 표시 원
        var selectedReportMarker = null;  // 신고목록에서 선택한 신고 위치 마커 (이 마커만 표시)
        var currentNearbyParking = [];  // 현재 표시 중인 근처 공영 주차장 목록(전체 필드)
        var currentSearchParking = [];  // 카카오맵 검색 주차장 목록
        var placeMarkerLat = null;  // 사용자가 찍은 마커 위도
        var placeMarkerLng = null;  // 사용자가 찍은 마커 경도
        var currentMenu = 'area';   // 'list' | 'area' | 'route'
        var lastRouteParking = null;
        var lastRouteDurationSeconds = null;
        var lastAreaData = null;    // { isEnforcement, cctv, nearbyParking } for area panel
        var currentSelectedParking = null;  // 요금 계산 등에 사용할 현재 선택 주차장

        var markerImageSrc = 'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/category.png';
        var PARKING_CLICK_MAP_LEVEL = 4;  // 주차장 마커/리스트 클릭 시 지도 확대 레벨 (숫자 작을수록 확대)
        // 카카오 Places JS는 사용하지 않고, 서버에서 REST API를 호출하여 검색합니다.

        function createMarkerImage(src, imageSize, imageOptions) {
            return new kakao.maps.MarkerImage(src, imageSize, imageOptions);
        }
        function createCarparkMarker(position, markerImage) {
            return new kakao.maps.Marker({ position: position, image: markerImage });
        }

        // 출발지와 목적지가 모두 보이도록 지도 범위 조정 (축소/확대 후 여백 포함)
        function setMapViewToShowStartAndEnd(startLat, startLng, endLat, endLng) {
            if (startLat == null || startLng == null || endLat == null || endLng == null) return;
            var start = new kakao.maps.LatLng(startLat, startLng);
            var end = new kakao.maps.LatLng(endLat, endLng);
            var bounds = new kakao.maps.LatLngBounds();
            bounds.extend(start);
            bounds.extend(end);
            if (bounds.isEmpty()) {
                map.setCenter(end);
                map.setLevel(PARKING_CLICK_MAP_LEVEL);
                return;
            }
            var sw = bounds.getSouthWest();
            var ne = bounds.getNorthEast();
            if (sw && ne) {
                var latSpan = Math.max(ne.getLat() - sw.getLat(), 0.002);
                var lngSpan = Math.max(ne.getLng() - sw.getLng(), 0.002);
                var pad = 0.25;
                bounds.extend(new kakao.maps.LatLng(sw.getLat() - latSpan * pad, sw.getLng() - lngSpan * pad));
                bounds.extend(new kakao.maps.LatLng(ne.getLat() + latSpan * pad, ne.getLng() + lngSpan * pad));
            }
            map.setBounds(bounds);
        }

        // 벌금 안내 문구 (불법 주차 단속 기준)
        var FINE_INFO = '불법 주차 과태료: 40,000원 (승차자 하차 후 즉시 출발 20,000원). 장애인 전용 주차구역 위반 등 추가 과태료가 부과될 수 있습니다.';

        function hideOverlay() {
            if (currentOverlay) {
                currentOverlay.setMap(null);
                currentOverlay = null;
            }
        }

        function hideParkingInfoOverlay() {
            if (parkingInfoOverlay) {
                parkingInfoOverlay.setMap(null);
                parkingInfoOverlay = null;
            }
        }

        function clearParkingMarkers() {
            for (var i = 0; i < parkingMarkers.length; i++) {
                parkingMarkers[i].setMap(null);
            }
            parkingMarkers = [];
        }

        function clearRouteLine() {
            if (routeLine) {
                routeLine.setMap(null);
                routeLine = null;
            }
            if (routeInfoOverlay) {
                routeInfoOverlay.setMap(null);
                routeInfoOverlay = null;
            }
        }

        function clearSearchMarkers() {
            for (var i = 0; i < searchMarkers.length; i++) {
                searchMarkers[i].setMap(null);
            }
            searchMarkers = [];
        }
        function clearSelectedReportMarker() {
            if (selectedReportMarker) {
                selectedReportMarker.setMap(null);
                selectedReportMarker = null;
            }
        }
        function showOnlyReportLocationMarker(lat, lng) {
            clearRouteLine();
            clearParkingMarkers();
            clearSearchMarkers();
            clearEnforcementCircle();
            if (currentMarker) { currentMarker.setMap(null); currentMarker = null; }
            clearSelectedReportMarker();
            var pos = new kakao.maps.LatLng(lat, lng);
            selectedReportMarker = new kakao.maps.Marker({ position: pos });
            selectedReportMarker.setMap(map);
            map.setCenter(pos);
            map.setLevel(6);
        }

        function clearEnforcementCircle() {
            if (enforcementCircle) {
                enforcementCircle.setMap(null);
                enforcementCircle = null;
            }
        }

        function esc(v) { return (v === undefined || v === null || v === '') ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

        function distanceKm(lat1, lng1, lat2, lng2) {
            var R = 6371; // km
            var toRad = function(d) { return d * Math.PI / 180; };
            var dLat = toRad(lat2 - lat1);
            var dLng = toRad(lng2 - lng1);
            var a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }
        function row(label, value, allowWrap) {
            var v = value === undefined || value === null || value === '' ? '-' : String(value);
            var cls = v === '-' ? ' value empty' : ' value';
            if (allowWrap) cls += ' wrap';
            return '<div class="detail-row"><span class="label">' + esc(label) + '</span><span class="' + cls.trim() + '">' + esc(v) + '</span></div>';
        }
        function buildSearchDetailCard(p) {
            if (!p) return '';
            var h = '<div class="detail-card">';
            h += '<div class="detail-head">🅿 ' + esc(p.place_name || '주차장') + '</div>';
            h += row('이름', p.place_name);
            h += row('도로명 주소', p.road_address_name, true);
            h += row('지번 주소', p.address_name, true);
            h += row('전화번호', p.phone);
            if (p.distance != null) {
                h += row('거리', p.distance + ' m');
            }
            if (p.place_url) {
                var safeUrl = esc(p.place_url);
                h += '<div class="detail-row"><span class="label">상세보기</span><span class="value wrap"><a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">카카오맵에서 보기</a></span></div>';
            }
            h += '</div>';
            return h;
        }
        function buildNearestDetailCard(p) {
            if (!p) return '';
            var h = '<div class="detail-card">';
            h += '<div class="detail-head">🅿 ' + esc(p.name || '공영 주차장') + '</div>';
            h += row('주차장명', p.name);
            h += row('거리', p.distance_km != null ? p.distance_km + ' km' : null);
            h += row('주차장 유형', p.parking_type);
            h += row('요금정보', p.fee);
            h += row('주차 구획수', p.capacity);
            h += row('지번 주소', p.address_jibun || p.address, true);
            h += row('도로명 주소', p.address_road, true);
            h += '<div class="detail-group"><div class="group-title">운영 시간</div>';
            h += row('운영요일', p.operating_days);
            h += row('평일', (p.weekday_start && p.weekday_end) ? (p.weekday_start + ' ~ ' + p.weekday_end) : null);
            h += row('토요일', (p.saturday_start && p.saturday_end) ? (p.saturday_start + ' ~ ' + p.saturday_end) : null);
            h += row('공휴일', (p.holiday_start && p.holiday_end) ? (p.holiday_start + ' ~ ' + p.holiday_end) : null);
            h += '</div>';
            h += '<div class="detail-group"><div class="group-title">요금 상세</div>';
            h += row('기본시간', p.base_minutes ? p.base_minutes + '분' : null);
            h += row('기본요금', p.base_fee ? p.base_fee + '원' : null);
            h += row('추가단위', p.extra_unit_minutes && p.extra_unit_fee ? (p.extra_unit_minutes + '분당 ' + p.extra_unit_fee + '원') : null);
            h += row('1일 주차권', p.day_pass_fee ? (p.day_pass_fee + '원' + (p.day_pass_hours ? ' (' + p.day_pass_hours + '시간)' : '')) : null);
            h += row('월정기권', p.monthly_fee ? p.monthly_fee + '원' : null);
            h += '</div>';
            h += row('전화번호', p.phone);
            h += row('장애인 전용 구역', p.disabled_space === 'Y' ? '있음' : (p.disabled_space ? p.disabled_space : null));
            h += '</div>';
            return h;
        }

        function updateDetailCard(park) {
            var detailEl = document.getElementById('nav-detail-card');
            if (detailEl && park) {
                detailEl.innerHTML = buildNearestDetailCard(park);
                detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            currentSelectedParking = park;
        }
        function showRouteInfoOnMarker(targetParking) {
    // 지도 위에 경로/주차장 정보창을 표시하지 않습니다.
    if (routeInfoOverlay) {
        routeInfoOverlay.setMap(null);
        routeInfoOverlay = null;
    }
}
        function drawRouteToNearest(startLat, startLng, targetParking) {
            clearRouteLine();
            if (!targetParking || targetParking.lat == null || targetParking.lng == null) return;
            var endLat = Number(targetParking.lat);
            var endLng = Number(targetParking.lng);
            if (isNaN(endLat) || isNaN(endLng)) return;
            // 직선거리(km) 저장
            var dKm = distanceKm(startLat, startLng, endLat, endLng);
            targetParking.distance_km = Math.round(dKm * 100) / 100;
            // 즉시 직선 경로선 표시 (길찾기 안내가 바로 보이도록)
            var straightPath = [new kakao.maps.LatLng(startLat, startLng), new kakao.maps.LatLng(endLat, endLng)];
            routeLine = new kakao.maps.Polyline({
                path: straightPath,
                strokeWeight: 5,
                strokeColor: '#1976d2',
                strokeOpacity: 0.8,
                strokeStyle: 'solid'
            });
            routeLine.setMap(map);
            lastRouteParking = targetParking;
            lastRouteDurationSeconds = null;
            showRouteInfoOnMarker(targetParking);
            if (currentMenu === 'route') renderRouteGuidePanel();
            // 서버에서 실제 도로 경로 요청 후 경로선 갱신
            var url = '/api/route/?start_lat=' + startLat + '&start_lng=' + startLng + '&end_lat=' + endLat + '&end_lng=' + endLng;
            fetch(url).then(function(res) { return res.json(); }).then(function(data) {
                var path = data.path || [];
                if (path.length < 2) path = [[startLat, startLng], [endLat, endLng]];
                var linePath = path.map(function(pt) { return new kakao.maps.LatLng(pt[0], pt[1]); });
                clearRouteLine();
                routeLine = new kakao.maps.Polyline({
                    path: linePath,
                    strokeWeight: 5,
                    strokeColor: '#1976d2',
                    strokeOpacity: 0.8,
                    strokeStyle: 'solid'
                });
                routeLine.setMap(map);
                lastRouteDurationSeconds = data.duration_seconds;
                if (currentMenu === 'route') renderRouteGuidePanel();
            }).catch(function() {
                // 실패 시 이미 그린 직선 경로 유지
            });
        }

     function showParkingInfoBlue(park, position) {
    // 지도 위에 주차장 상세정보 창을 표시하지 않습니다.
    if (parkingInfoOverlay) {
        parkingInfoOverlay.setMap(null);
        parkingInfoOverlay = null;
    }
}

        function showParkingMarkers(parkingArray) {
            clearParkingMarkers();
            if (!parkingArray || parkingArray.length === 0) return;
            // 공영주차장 마커는 더 크게 표시 (기본 22x26 → 44x52, 약 2배)
            var imageSize = new kakao.maps.Size(44, 52);
            var imageOptions = {
                spriteOrigin: new kakao.maps.Point(10, 72),
                spriteSize: new kakao.maps.Size(36, 98)
            };
            var carparkMarkerImage = createMarkerImage(markerImageSrc, imageSize, imageOptions);
            for (var i = 0; i < parkingArray.length; i++) {
                var p = parkingArray[i];
                var pos = new kakao.maps.LatLng(p.lat, p.lng);
                var marker = createCarparkMarker(pos, carparkMarkerImage);
                var distText = (p.distance_km != null) ? ' (' + p.distance_km + 'km)' : '';
                marker.setTitle((p.name || '공영주차장') + distText);
                marker.setMap(map);
                parkingMarkers.push(marker);
                (function(m, park) {
                    kakao.maps.event.addListener(m, 'click', function() {
                        hideOverlay();
                        if (placeMarkerLat != null && placeMarkerLng != null) {
                            setMapViewToShowStartAndEnd(placeMarkerLat, placeMarkerLng, park.lat, park.lng);
                            drawRouteToNearest(placeMarkerLat, placeMarkerLng, park);
                        } else {
                            map.setCenter(new kakao.maps.LatLng(park.lat, park.lng));
                            map.setLevel(PARKING_CLICK_MAP_LEVEL);
                        }
                        updateDetailCard(park);
                    });
                })(marker, p);
            }
        }

        function showSearchMarkers(searchArray) {
            clearSearchMarkers();
            if (!searchArray || searchArray.length === 0) return;

            // 카카오맵 예제와 동일한 주차장(carpark) 스프라이트 사용
            var imageSize = new kakao.maps.Size(22, 26);
            var imageOptions = {
                spriteOrigin: new kakao.maps.Point(10, 72),
                spriteSize: new kakao.maps.Size(36, 98)
            };
            var carparkMarkerImage = createMarkerImage(markerImageSrc, imageSize, imageOptions);

            for (var i = 0; i < searchArray.length; i++) {
                var p = searchArray[i];
                if (p.y == null || p.x == null) continue;
                var lat = parseFloat(p.y);
                var lng = parseFloat(p.x);
                if (isNaN(lat) || isNaN(lng)) continue;

                var pos = new kakao.maps.LatLng(lat, lng);
                var marker = createCarparkMarker(pos, carparkMarkerImage);
                var title = (p.place_name || '주차장');
                if (p.distance != null) title += ' (' + p.distance + 'm)';
                marker.setTitle(title);
                marker.setMap(map);
                searchMarkers.push(marker);

                (function(m, place) {
                    kakao.maps.event.addListener(m, 'click', function() {
                        var detailEl = document.getElementById('nav-search-detail');
                        if (detailEl) {
                            detailEl.innerHTML = buildSearchDetailCard(place);
                            detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                        if (place.y != null && place.x != null) {
                            var destLat = parseFloat(place.y);
                            var destLng = parseFloat(place.x);
                            if (placeMarkerLat != null && placeMarkerLng != null) {
                                setMapViewToShowStartAndEnd(placeMarkerLat, placeMarkerLng, destLat, destLng);
                                var targetForRoute = { lat: destLat, lng: destLng, name: place.place_name || '주차장' };
                                drawRouteToNearest(placeMarkerLat, placeMarkerLng, targetForRoute);
                            } else {
                                map.setCenter(new kakao.maps.LatLng(destLat, destLng));
                                map.setLevel(PARKING_CLICK_MAP_LEVEL);
                            }
                        }
                        // 클릭한 주차장만 지도에 표시 (나머지 검색 마커 제거)
                        showSearchMarkers([place]);
                    });
                })(marker, p);
            }
        }