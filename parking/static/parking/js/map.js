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

        // 경로 전체(파란 선)가 지도에 다 보이도록 범위 조정 (여백 포함)
        function setMapViewToShowPath(path) {
            if (!path || path.length === 0) return;
            var bounds = new kakao.maps.LatLngBounds();
            for (var i = 0; i < path.length; i++) {
                var pt = path[i];
                var latLng = (pt && pt.getLat) ? pt : new kakao.maps.LatLng(pt[0], pt[1]);
                bounds.extend(latLng);
            }
            if (bounds.isEmpty()) return;
            var sw = bounds.getSouthWest();
            var ne = bounds.getNorthEast();
            if (sw && ne) {
                var pad = 0.15;
                var latSpan = Math.max(ne.getLat() - sw.getLat(), 0.002);
                var lngSpan = Math.max(ne.getLng() - sw.getLng(), 0.002);
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

        function updateNavBar(isEnforcement, cctv, nearbyParking, clickLat, clickLng) {
            var nav = document.getElementById('nav-content');
            var titleClass = isEnforcement ? 'enforcement' : 'safe';
            var title = isEnforcement ? '⚠ 단속 구역 (CCTV)' : '✓ 주차 가능 구역';
            var html = '<div class="nav-title ' + titleClass + '">' + title + '</div>';
            html += '<div class="nav-section">';
            if (isEnforcement && cctv) {
                html += '<div class="nav-label">관리번호</div><div class="nav-text">' + (cctv.id || '-') + '</div>';
                html += '<div class="nav-label">소재지</div><div class="nav-text">' + (cctv.address || '-') + '</div>';
                html += '<div class="nav-text" style="color:#c00;font-weight:bold;margin-top:8px;">' + FINE_INFO + '</div>';
            } else {
                html += '<div class="nav-text">해당 위치는 단속 구역이 아닙니다. 주차 시 규정을 확인하세요.</div>';
            }
            html += '</div>';
            if (nearbyParking && nearbyParking.length > 0) {
                currentNearbyParking = nearbyParking;
                html += '<div class="nav-section">';
                html += '<button type="button" class="btn btn-primary" id="btn-guide-nearest" style="margin-bottom:12px; width:100%;">가장 가까운 공영주차장으로 안내</button>';
                html += '<div class="nav-label">근처 500m 이내 공영 주차장</div>';
                html += '<ul class="parking-list">';
                for (var i = 0; i < nearbyParking.length; i++) {
                    var p = nearbyParking[i];
                    html += '<li data-index="' + i + '" data-lat="' + p.lat + '" data-lng="' + p.lng + '" data-name="' + (p.name || '').replace(/"/g, '&quot;') + '" data-fee="' + (p.fee || '').replace(/"/g, '&quot;') + '" data-addr="' + (p.address || '').replace(/"/g, '&quot;') + '" data-dist="' + p.distance_km + '">';
                    html += (p.name || '주차장') + ' (' + p.distance_km + 'km) - ' + (p.fee || '') + '</li>';
                }
                html += '</ul></div>';
                html += '<div id="nav-detail-card">' + buildNearestDetailCard(nearbyParking[0]) + '</div>';
            }
            lastAreaData = { isEnforcement: isEnforcement, cctv: cctv, nearbyParking: nearbyParking || [] };
            if (currentMenu === 'area') {
                nav.innerHTML = html;
                var btnNearest = document.getElementById('btn-guide-nearest');
                if (btnNearest && nearbyParking && nearbyParking.length > 0) {
                    btnNearest.addEventListener('click', function() {
                        var nearest = nearbyParking[0];
                        if (placeMarkerLat != null && placeMarkerLng != null) {
                            setMapViewToShowStartAndEnd(placeMarkerLat, placeMarkerLng, nearest.lat, nearest.lng);
                            drawRouteToNearest(placeMarkerLat, placeMarkerLng, nearest);
                            updateDetailCard(nearest);
                        }
                    });
                }
            } else if (currentMenu === 'list') renderListPanel();
        }

        function showRouteInfoOnMarker(targetParking) {
    // 지도 위에 경로/주차장 정보창을 표시하지 않습니다.
    if (routeInfoOverlay) {
        routeInfoOverlay.setMap(null);
        routeInfoOverlay = null;
    }
}

        function renderRouteGuidePanel() {
            var nav = document.getElementById('nav-content');
            if (currentMenu !== 'route') return;
            var html = '<div class="nav-title" style="color:#1976d2;">🕒 실시간 예상 시간</div>';
            if (!lastRouteParking) {
                html += '<div class="empty-state">주차장을 선택하면 실시간 이동 예상시간이 여기에 표시됩니다.</div>';
            } else {
                html += '<div class="detail-card">';
                html += '<div class="detail-head">' + (lastRouteParking.name || '공영주차장') + '</div>';
                if (lastRouteParking.distance_km != null && lastRouteParking.distance_km !== undefined) {
                    html += '<div class="detail-row"><span class="label">거리</span><span class="value">' + lastRouteParking.distance_km + ' km</span></div>';
                }
                if (lastRouteDurationSeconds != null && lastRouteDurationSeconds > 0) {
                    var min = Math.round(lastRouteDurationSeconds / 60);
                    html += '<div class="detail-row"><span class="label">실시간 이동 예상시간</span><span class="value"><strong>약 ' + min + '분</strong></span></div>';
                } else {
                    html += '<div class="detail-row"><span class="label">경로</span><span class="value">직선 경로 표시</span></div>';
                }
                html += '</div>';
            }
            nav.innerHTML = html;
        }

        function renderListPanel() {
            var nav = document.getElementById('nav-content');
            if (currentMenu !== 'list') return;
            var html = '<div class="nav-title" style="color:#1976d2;">🅿 공영주차장 리스트 검색</div>';

            if (!allParkingLoaded) {
                html += '<div class="empty-state">전체 공영 주차장 정보를 불러오는 중입니다...</div>';
                nav.innerHTML = html;
                fetch('/api/parking-list/')
                    .then(function(res) { return res.json(); })
                    .then(function(data) {
                        allParkingList = (data && data.parking) || [];
                        allParkingLoaded = true;
                        renderListPanel();
                    })
                    .catch(function() {
                        nav.innerHTML = html + '<div class="empty-state" style="color:#c00;">주차장 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</div>';
                    });
                return;
            }

            if (!allParkingList.length) {
                html += '<div class="empty-state">등록된 공영 주차장 정보가 없습니다.</div>';
                nav.innerHTML = html;
                return;
            }

            html += '<div class="nav-section">';
            html += '  <div class="nav-label">주차장 이름/주소 검색</div>';
            html += '  <input id="parking-search" type="text" placeholder="이름, 주소, 요금 등으로 검색" ';
            html += '         style="width:100%;padding:6px 8px;font-size:12px;border:1px solid #ced4da;border-radius:4px;box-sizing:border-box;" />';
            html += '</div>';

            html += '<div class="nav-section"><div class="nav-label">전체 공영 주차장</div><ul class="parking-list">';
            for (var i = 0; i < allParkingList.length; i++) {
                var p = allParkingList[i];
                html += '<li data-index="' + i + '" data-lat="' + p.lat + '" data-lng="' + p.lng + '" data-name="' + (p.name || '').replace(/"/g, '&quot;') + '" data-addr="' + (p.address || '').replace(/"/g, '&quot;') + '" data-fee="' + (p.fee || '').replace(/"/g, '&quot;') + '">';
                html += (p.name || '주차장') + ' - ' + (p.address || '') + (p.fee ? ' (' + p.fee + ')' : '');
                html += '</li>';
            }
            html += '</ul></div><div id="nav-detail-card"></div>';

            nav.innerHTML = html;

            var searchInput = document.getElementById('parking-search');
            if (searchInput) {
                searchInput.addEventListener('input', function () {
                    var q = this.value.toLowerCase();
                    var items = nav.querySelectorAll('.parking-list li');
                    var filtered = [];
                    items.forEach(function (li) {
                        var idx = parseInt(li.dataset.index, 10);
                        var name = (li.dataset.name || '').toLowerCase();
                        var addr = (li.dataset.addr || '').toLowerCase();
                        var fee = (li.dataset.fee || '').toLowerCase();
                        var text = li.textContent.toLowerCase();
                        var match = !q || name.indexOf(q) !== -1 || addr.indexOf(q) !== -1 || fee.indexOf(q) !== -1 || text.indexOf(q) !== -1;
                        li.style.display = match ? '' : 'none';
                        if (match && !isNaN(idx) && idx >= 0 && idx < allParkingList.length) {
                            filtered.push(allParkingList[idx]);
                        }
                    });
                    // 검색 결과와 연관된 주차장만 지도에 마커 표시
                    showParkingMarkers(filtered.length ? filtered : allParkingList);
                });
            }

            // 초기에는 전체 주차장 마커 표시
            showParkingMarkers(allParkingList);

            var list = nav.querySelectorAll('.parking-list li');
            for (var j = 0; j < list.length; j++) {
                list[j].addEventListener('click', function () {
                    var idx = parseInt(this.getAttribute('data-index'), 10);
                    if (isNaN(idx) || idx < 0 || idx >= allParkingList.length) return;
                    var park = allParkingList[idx];
                    if (!park) return;
                    updateDetailCard(park);
                    var lat = park.lat;
                    var lng = park.lng;
                    if (lat != null && lng != null) {
                        if (placeMarkerLat != null && placeMarkerLng != null) {
                            setMapViewToShowStartAndEnd(placeMarkerLat, placeMarkerLng, lat, lng);
                            drawRouteToNearest(placeMarkerLat, placeMarkerLng, park);
                        } else {
                            map.setCenter(new kakao.maps.LatLng(lat, lng));
                            map.setLevel(PARKING_CLICK_MAP_LEVEL);
                        }
                    }
                });
            }
        }

        // ==========================
        // 20260320_양희찬: 요금 계산 + 포트원 결제 통합
        // ==========================
        function renderFeeCalculatorPanel() {
            var nav = document.getElementById('nav-content');
            if (currentMenu !== 'fee') return;

            var html = '<div class="nav-title" style="color:#1976d2;">💰 공영주차장 요금 계산기</div>';

            if (!currentSelectedParking) {
                html += '<div class="empty-state">요금을 계산할 주차장을 먼저 선택해 주세요.<br>지도에서 위치를 클릭해 근처 주차장을 선택하거나, 주차장 리스트에서 하나를 선택하면 됩니다.</div>';
                nav.innerHTML = html;
                return;
            }

            var p = currentSelectedParking;
            html += '<div class="detail-card">';
            html += '<div class="detail-head">' + esc(p.name || '공영 주차장') + '</div>';
            html += row('요금정보', p.fee);
            html += row('기본시간', p.base_minutes ? p.base_minutes + '분' : null);
            html += row('기본요금', p.base_fee ? p.base_fee + '원' : null);
            html += row('추가단위', (p.extra_unit_minutes && p.extra_unit_fee) ? (p.extra_unit_minutes + '분당 ' + p.extra_unit_fee + '원') : null);
            html += '</div>';

            html += '<div class="nav-section">';
            html += '<div class="nav-label">이용 시간 입력</div>';
            html += '<div style="display:flex; flex-direction:column; gap:6px; font-size:12px;">';
            html += '<label>입차 시각';
            html += '  <input id="fee-start" type="datetime-local" style="width:100%;padding:4px 6px;font-size:12px;border:1px solid #ced4da;border-radius:4px;box-sizing:border-box;">';
            html += '  <button type="button" id="fee-start-open" style="margin-top:4px;padding:4px 6px;font-size:11px;border:1px solid #ced4da;border-radius:4px;background:#f8f9fa;cursor:pointer;">오전/오후 시간 선택</button>';
            html += '</label>';

            html += '<label>출차 시각';
            html += '  <input id="fee-end" type="datetime-local" style="width:100%;padding:4px 6px;font-size:12px;border:1px solid #ced4da;border-radius:4px;box-sizing:border-box;">';
            html += '  <button type="button" id="fee-end-open" style="margin-top:4px;padding:4px 6px;font-size:11px;border:1px solid #ced4da;border-radius:4px;background:#f8f9fa;cursor:pointer;">오전/오후 시간 선택</button>';
            html += '</label>';

            html += '<label style="display:flex;align-items:center;gap:6px;margin-top:4px;">';
            html += '<input id="fee-eco" type="checkbox"> 친환경 차량 (50% 할인)';
            html += '</label>';

            html += '<button id="fee-calc-btn" type="button" style="margin-top:6px;padding:6px 8px;font-size:12px;border:none;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;">요금 계산</button>';
            html += '<button id="fee-pay-btn" type="button" style="margin-top:6px;padding:6px 8px;font-size:12px;border:none;border-radius:4px;background:#28a745;color:#fff;cursor:pointer;">결제하기</button>';
            html += '</div></div>';

            html += '<div class="nav-section">';
            html += '<div class="nav-label">예상 요금</div>';
            html += '<div id="fee-result" class="nav-text" style="min-height:32px;color:#212529;">입·출차 시간을 입력하고 계산 버튼을 눌러 주세요.</div>';
            html += '</div>';

            nav.innerHTML = html;

            // --- 요금 계산 버튼 이벤트 (20260320_양희찬) ---
            var calcBtn = document.getElementById('fee-calc-btn');
            if (calcBtn) {
                calcBtn.addEventListener('click', function () {
                    var startVal = document.getElementById('fee-start').value;
                    var endVal = document.getElementById('fee-end').value;
                    var eco = document.getElementById('fee-eco').checked;
                    var out = document.getElementById('fee-result');

                    if (!startVal || !endVal) {
                        out.textContent = '입차 시각과 출차 시각을 모두 입력해 주세요.';
                        out.style.color = '#c00';
                        return;
                    }

                    var start = new Date(startVal);
                    var end = new Date(endVal);
                    if (!(start.getTime()) || !(end.getTime()) || end <= start) {
                        out.textContent = '출차 시각은 입차 시각보다 이후여야 합니다.';
                        out.style.color = '#c00';
                        return;
                    }

                    var minutes = Math.ceil((end - start) / 60000);
                    var baseMin = parseInt(p.base_minutes, 10);
                    var baseFee = parseInt(p.base_fee, 10);
                    var extraMin = parseInt(p.extra_unit_minutes, 10);
                    var extraFee = parseInt(p.extra_unit_fee, 10);

                    if (!(baseMin > 0) || !(baseFee >= 0) || !(extraMin > 0) || !(extraFee >= 0)) {
                        out.textContent = '해당 주차장은 자동 요금 계산 정보를 제공하지 않습니다. 비고의 요금정보를 참고해 주세요.';
                        out.style.color = '#6c757d';
                        return;
                    }

                    var total = minutes <= baseMin ? baseFee : baseFee + Math.ceil((minutes - baseMin) / extraMin) * extraFee;
                    if (eco) total = Math.round(total * 0.5);

                    var nf = new Intl.NumberFormat('ko-KR');
                    out.textContent = '총 이용 시간: 약 ' + minutes + '분\n기본 요금 체계 기준 예상 요금: ' + nf.format(total) + '원' + (eco ? '\n친환경 차량 50% 할인 적용 요금: ' + nf.format(total) + '원' : '');
                    out.style.whiteSpace = 'pre-line';
                    out.style.color = '#212529';
                });
            }

            // --- 포트원 결제 버튼 이벤트 (20260320_양희찬) ---
            var payBtn = document.getElementById('fee-pay-btn');
            if (payBtn) {
                payBtn.addEventListener('click', function () {
                    var IMP = window.IMP;
                    IMP.init('imp04216675'); // 가맹점 코드 (테스트)

                    var amountText = document.getElementById('fee-result').textContent.match(/([\d,]+)원/);
                    var amount = amountText ? parseInt(amountText[1].replace(/,/g, '')) : 0;

                    IMP.request_pay({
                        pg: 'kakaopay',
                        channel_key: 'channel-key-ed50abae-4837-4115-b43c-8ee299767d85',
                        pay_method: 'card',
                        merchant_uid: 'mid_' + new Date().getTime(),
                        name: '주차 요금',
                        amount: amount,
                        buyer_name: '테스트 유저',
                        buyer_tel: '01012345678',
                        buyer_email: 'test@example.com'
                    }, function (rsp) {

                        if (rsp.success) {
                            alert('결제 성공! 결제 ID: ' + rsp.imp_uid);

                            // 🔥 여기 추가 (핵심)
                            fetch('/payment/complete/', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    imp_uid: rsp.imp_uid,
                                    merchant_uid: rsp.merchant_uid,
                                    amount: rsp.paid_amount
                                })
                            });

                        } else {
                            alert('결제 실패: ' + rsp.error_msg);
                        }

                    });
                });
            }
        }

        function renderSearchPanel() {
            var nav = document.getElementById('nav-content');
            if (currentMenu !== 'search') return;

            var html = '<div class="nav-title" style="color:#1976d2;">🔍 주차장 검색 (카카오맵)</div>';

            if (placeMarkerLat == null || placeMarkerLng == null) {
                html += '<div class="empty-state">지도를 클릭하면 해당 위치 기준 500m 이내 카카오맵 주차장을 검색합니다.</div>';
                nav.innerHTML = html;
                return;
            }

            if (!currentSearchParking.length) {
                html += '<div class="empty-state">500m 이내에 검색된 주차장이 없습니다.</div>';
                nav.innerHTML = html;
                return;
            }

            html += '<div class="nav-section"><div class="nav-label">검색 반경 500m 주차장</div><ul class="parking-list">';
            for (var i = 0; i < currentSearchParking.length; i++) {
                var p = currentSearchParking[i];
                html += '<li data-index="' + i + '">';
                html += esc(p.place_name || '주차장') + ' - ' + esc(p.road_address_name || p.address_name || '');
                if (p.distance != null) {
                    html += ' (' + p.distance + 'm)';
                }
                html += '</li>';
            }
            html += '</ul></div>';
            html += '<div id="nav-search-detail"></div>';

            nav.innerHTML = html;

            // 검색 주차장 마커 표시
            showSearchMarkers(currentSearchParking);

            var list = nav.querySelectorAll('.parking-list li');
            for (var j = 0; j < list.length; j++) {
                list[j].addEventListener('click', function () {
                    var idx = parseInt(this.getAttribute('data-index'), 10);
                    if (isNaN(idx) || idx < 0 || idx >= currentSearchParking.length) return;
                    var p = currentSearchParking[idx];
                    var detailEl = document.getElementById('nav-search-detail');
                    if (!detailEl) return;
                    detailEl.innerHTML = buildSearchDetailCard(p);
                    detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    if (p.y != null && p.x != null) {
                        var destLat = parseFloat(p.y);
                        var destLng = parseFloat(p.x);
                        if (placeMarkerLat != null && placeMarkerLng != null) {
                            setMapViewToShowStartAndEnd(placeMarkerLat, placeMarkerLng, destLat, destLng);
                            var targetForRoute = { lat: destLat, lng: destLng, name: p.place_name || '주차장' };
                            drawRouteToNearest(placeMarkerLat, placeMarkerLng, targetForRoute);
                        } else {
                            map.setCenter(new kakao.maps.LatLng(destLat, destLng));
                            map.setLevel(PARKING_CLICK_MAP_LEVEL);
                        }
                    }
                    // 클릭한 주차장만 지도에 표시 (나머지 검색 마커 제거)
                    showSearchMarkers([p]);
                });
            }
        }

        function renderNavByMenu() {
            if (currentMenu === 'list') renderListPanel();
            else if (currentMenu === 'route') renderRouteGuidePanel();
            else if (currentMenu === 'fee') renderFeeCalculatorPanel();
            else if (currentMenu === 'search') renderSearchPanel();
            else if (currentMenu === 'report') renderReportPanel();
            else if (currentMenu === 'report-list') renderReportListPanel();
            else if (currentMenu === 'area' && lastAreaData) {
                var d = lastAreaData;
                updateNavBar(d.isEnforcement, d.cctv, d.nearbyParking, placeMarkerLat, placeMarkerLng);
            } else if (currentMenu === 'area') {
                document.getElementById('nav-content').innerHTML = '<div class="empty-state">지도를 클릭하면 해당 위치의 단속 여부와 근처 공영 주차장을 안내합니다.</div>';
            }
        }

        function renderReportPanel() {
            var nav = document.getElementById('nav-content');
            if (currentMenu !== 'report') return;
            var locText = (placeMarkerLat != null && placeMarkerLng != null)
                ? ('위도 ' + placeMarkerLat.toFixed(6) + ', 경도 ' + placeMarkerLng.toFixed(6))
                : '지도를 클릭하여 위치를 설정하세요.';
            var html = '<div class="nav-title" style="color:#1976d2;">📋 신고하기</div>';
            html += '<div class="form-group"><label>차량번호</label><input type="text" id="report-vehicle" placeholder="예: 12가 3456" maxlength="20"></div>';
            html += '<div class="form-group"><label>마커에 위치</label><div class="value" id="report-location">' + esc(locText) + '</div></div>';
            html += '<div class="form-group"><label>신고내용</label><textarea id="report-content" placeholder="신고 내용을 입력하세요."></textarea></div>';
            html += '<div class="form-group"><label>비밀번호</label><input type="password" id="report-password" placeholder="삭제 시 사용"></div>';
            html += '<div class="form-actions">';
            html += '<button type="button" class="btn btn-primary" id="report-submit">신고하기</button>';
            html += '<button type="button" class="btn btn-secondary" id="report-reset">재작성</button>';
            html += '</div>';
            nav.innerHTML = html;
            document.getElementById('report-submit').addEventListener('click', function() {
                var vehicle = (document.getElementById('report-vehicle').value || '').trim();
                var content = (document.getElementById('report-content').value || '').trim();
                var password = document.getElementById('report-password').value || '';
                if (placeMarkerLat == null || placeMarkerLng == null) {
                    alert('지도를 클릭하여 신고 위치를 먼저 설정하세요.');
                    return;
                }
                if (!vehicle) {
                    alert('차량번호를 입력하세요.');
                    return;
                }
                if (!password) {
                    alert('비밀번호를 입력하세요. (삭제 시 사용됩니다.)');
                    return;
                }
                fetch('/api/reports/create/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vehicle_number: vehicle,
                        lat: placeMarkerLat,
                        lng: placeMarkerLng,
                        content: content,
                        password: password
                    })
                }).then(function(res) { return res.json(); }).then(function(data) {
                    if (data.error) { alert(data.error); return; }
                    alert('신고가 접수되었습니다.');
                    document.getElementById('report-vehicle').value = '';
                    document.getElementById('report-content').value = '';
                    document.getElementById('report-password').value = '';
                }).catch(function() { alert('신고 접수에 실패했습니다.'); });
            });
            document.getElementById('report-reset').addEventListener('click', function() {
                document.getElementById('report-vehicle').value = '';
                document.getElementById('report-content').value = '';
                document.getElementById('report-password').value = '';
            });
        }

        function renderReportListPanel() {
            var nav = document.getElementById('nav-content');
            if (currentMenu !== 'report-list') return;
            var html = '<div class="nav-title" style="color:#1976d2;">📋 신고목록</div>';
            html += '<div class="nav-section"><ul class="parking-list" id="report-list-ul"></ul></div>';
            html += '<div id="nav-report-detail"></div>';
            nav.innerHTML = html;
            function loadList() {
                fetch('/api/reports/').then(function(res) { return res.json(); }).then(function(data) {
                    var list = document.getElementById('report-list-ul');
                    if (!list) return;
                    var reports = data.reports || [];
                    if (reports.length === 0) {
                        list.innerHTML = '<li class="empty-state">등록된 신고가 없습니다.</li>';
                        return;
                    }
                    list.innerHTML = '';
                    reports.forEach(function(r) {
                        var li = document.createElement('li');
                        li.className = 'report-list-item';
                        li.setAttribute('data-id', r.id);
                        li.textContent = (r.vehicle_number || '') + ' - ' + (r.created_at ? r.created_at.slice(0, 19).replace('T', ' ') : '');
                        list.appendChild(li);
                    });
                    list.querySelectorAll('.report-list-item').forEach(function(li) {
                        li.addEventListener('click', function() {
                            var id = parseInt(this.getAttribute('data-id'), 10);
                            if (isNaN(id)) return;
                            fetch('/api/reports/' + id + '/').then(function(res) { return res.json(); }).then(function(r) {
                                var detailEl = document.getElementById('nav-report-detail');
                                if (!detailEl) return;
                                // 지도에는 해당 신고의 위도·경도 마커만 표시 (다른 마커는 모두 제거)
                                showOnlyReportLocationMarker(r.lat, r.lng);
                                var h = '<div class="detail-card">';
                                h += '<div class="detail-head">신고 상세정보</div>';
                                h += '<div class="detail-row"><span class="label">차량번호</span><span class="value">' + esc(r.vehicle_number || '') + '</span></div>';
                                h += '<div class="detail-row"><span class="label">위치</span><span class="value">' + esc(r.lat + ', ' + r.lng) + '</span></div>';
                                h += '<div class="detail-row"><span class="label">신고내용</span><span class="value wrap">' + esc(r.content || '-') + '</span></div>';
                                h += '<div class="detail-row"><span class="label">등록일시</span><span class="value">' + esc(r.created_at ? r.created_at.slice(0, 19).replace('T', ' ') : '') + '</span></div>';
                                h += '<div class="delete-password-row"><input type="password" id="report-delete-password" placeholder="비밀번호 입력">';
                                h += '<button type="button" class="btn btn-danger" id="report-delete-btn" data-id="' + r.id + '">삭제</button></div>';
                                h += '</div>';
                                detailEl.innerHTML = h;
                                document.getElementById('report-delete-btn').addEventListener('click', function() {
                                    var pw = document.getElementById('report-delete-password').value || '';
                                    var rid = parseInt(this.getAttribute('data-id'), 10);
                                    if (!pw) { alert('비밀번호를 입력하세요.'); return; }
                                    fetch('/api/reports/' + rid + '/delete/', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ password: pw })
                                    }).then(function(res) { return res.json(); }).then(function(data) {
                                        if (data.error) { alert(data.error); return; }
                                        clearSelectedReportMarker();
                                        detailEl.innerHTML = '';
                                        loadList();
                                    }).catch(function() { alert('삭제 요청에 실패했습니다.'); });
                                });
                            });
                        });
                    });
                }).catch(function() {
                    var list = document.getElementById('report-list-ul');
                    if (list) list.innerHTML = '<li class="empty-state">목록을 불러오지 못했습니다.</li>';
                });
            }
            loadList();
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
                // 파란 경로 전체가 보이도록 지도 확대/축소 조정
                setMapViewToShowPath(path);
            }).catch(function() {
                // 실패 시 이미 그린 직선 경로 유지, 직선 경로 기준으로 뷰 조정
                setMapViewToShowPath([[startLat, startLng], [endLat, endLng]]);
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

        function showNavLoading() {
            var nav = document.getElementById('nav-content');
            if (!nav) return;
            nav.innerHTML = '<div class="nav-loading"><div class="nav-loading-spinner"></div><div class="nav-loading-text">위치 확인 중...</div></div>';
        }

        function placeMarkerAndCheck(lat, lng) {
            hideOverlay();
            hideParkingInfoOverlay();
            clearRouteLine();
            clearParkingMarkers();
            clearSearchMarkers();
            clearEnforcementCircle();
            if (currentMarker) { currentMarker.setMap(null); currentMarker = null; }
            var pos = new kakao.maps.LatLng(lat, lng);
            var marker = new kakao.maps.Marker({ position: pos });
            marker.setMap(map);
            currentMarker = marker;

            if (currentMenu === 'area') showNavLoading();

            // check-location과 search-parking을 동시에 요청해 응답 대기 시간 단축
            var checkUrl = '/api/check-location/?lat=' + lat + '&lng=' + lng;
            var searchUrl = '/api/search-parking/?lat=' + lat + '&lng=' + lng;
            var searchPromise = fetch(searchUrl).then(function(res) { return res.json(); });

            fetch(checkUrl)
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    var isEnforcement = data.is_enforcement === true;
                    clearEnforcementCircle();
                    if (isEnforcement) {
                        marker.setMap(null);
                        var redMarker = new kakao.maps.Marker({ position: pos });
                        try {
                            var redImg = 'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png';
                            var redSize = new kakao.maps.Size(24, 35);
                            redMarker.setImage(new kakao.maps.MarkerImage(redImg, redSize));
                        } catch (e) {}
                        redMarker.setMap(map);
                        currentMarker = redMarker;

                        if (data.cctv && data.cctv.lat != null && data.cctv.lng != null) {
                            enforcementCircle = new kakao.maps.Circle({
                                center: new kakao.maps.LatLng(data.cctv.lat, data.cctv.lng),
                                radius: 100, // 100m
                                strokeWeight: 2,
                                strokeColor: '#ff0000',
                                strokeOpacity: 0.8,
                                strokeStyle: 'solid',
                                fillColor: '#ff0000',
                                fillOpacity: 0.15
                            });
                            enforcementCircle.setMap(map);
                        }
                    }
                    updateNavBar(isEnforcement, data.cctv || null, data.nearby_parking || [], lat, lng);
                    showParkingMarkers(data.nearby_parking || []);
                    placeMarkerLat = lat;
                    placeMarkerLng = lng;
                    if (currentMenu === 'report') {
                        var locEl = document.getElementById('report-location');
                        if (locEl) locEl.textContent = '위도 ' + lat.toFixed(6) + ', 경도 ' + lng.toFixed(6);
                    }
                    if (data.nearby_parking && data.nearby_parking.length > 0) {
                        drawRouteToNearest(lat, lng, data.nearby_parking[0]);
                    }
                    // search-parking 결과는 별도 요청이므로 도착 시 반영
                    searchPromise.then(function(searchData) {
                        currentSearchParking = searchData.documents || [];
                        showSearchMarkers(currentSearchParking);
                        if (currentMenu === 'search') renderSearchPanel();
                    }).catch(function() {
                        currentSearchParking = [];
                        clearSearchMarkers();
                        if (currentMenu === 'search') renderSearchPanel();
                    });
                })
                .catch(function() {
                    placeMarkerLat = lat;
                    placeMarkerLng = lng;
                    if (currentMenu === 'report') {
                        var locEl = document.getElementById('report-location');
                        if (locEl) locEl.textContent = '위도 ' + lat.toFixed(6) + ', 경도 ' + lng.toFixed(6);
                    }
                    if (currentMenu === 'area') {
                        var nav = document.getElementById('nav-content');
                        if (nav) nav.innerHTML = '<div class="empty-state" style="color:#c00;">일시적인 오류입니다. 다시 클릭해 주세요.</div>';
                    } else {
                        updateNavBar(false, null, [], lat, lng);
                    }
                    showParkingMarkers([]);
                });
        }

        kakao.maps.event.addListener(map, 'click', function(mouseEvent) {
            var latlng = mouseEvent.latLng;
            placeMarkerAndCheck(latlng.getLat(), latlng.getLng());
        });

        document.getElementById('menu-bar').addEventListener('click', function(e) {
            var btn = e.target.closest('.menu-bar-item');
            if (!btn) return;
            var menu = btn.getAttribute('data-menu');
            if (!menu) return;
            currentMenu = menu;
            if (menu !== 'report-list') clearSelectedReportMarker();
            document.querySelectorAll('.menu-bar-item').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');

            // 내비게이션 바가 닫혀 있으면 다시 열기
            var wrap = document.getElementById('nav-wrap');
            if (wrap.classList.contains('closed')) {
                wrap.classList.remove('closed');
            }

            renderNavByMenu();
        });

        document.getElementById('nav-bar').addEventListener('click', function(e) {
            if (currentMenu !== 'area') return;
            var li = e.target.closest('.parking-list li');
            if (!li) return;
            var idx = parseInt(li.getAttribute('data-index'), 10);
            if (isNaN(idx) || idx < 0 || idx >= currentNearbyParking.length) return;
            var park = currentNearbyParking[idx];
            updateDetailCard(park);
            if (placeMarkerLat != null && placeMarkerLng != null) {
                drawRouteToNearest(placeMarkerLat, placeMarkerLng, park);
            }
        });

        (function() {
            var wrap = document.getElementById('nav-wrap');
            var resizeHandle = document.getElementById('nav-resize');
            var closeBtn = document.getElementById('nav-close');
            var openTab = document.getElementById('nav-open-tab');
            var minW = 280, maxW = 720;
            var startX = 0, startW = 0;

            function refreshMapSize() {
                if (typeof map === 'undefined' || !map.relayout) return;
                requestAnimationFrame(function() {
                    map.relayout();
                });
                setTimeout(function() {
                    map.relayout();
                }, 100);
                setTimeout(function() {
                    map.relayout();
                }, 350);
            }

            closeBtn.addEventListener('click', function() {
                wrap.classList.add('closed');
                refreshMapSize();
                wrap.addEventListener('transitionend', function onEnd() {
                    wrap.removeEventListener('transitionend', onEnd);
                    refreshMapSize();
                }, { once: true });
            });
            openTab.addEventListener('click', function() {
                wrap.classList.remove('closed');
                if (wrap.style.width) wrap.style.width = startW || 420 + 'px';
                refreshMapSize();
                wrap.addEventListener('transitionend', function onEnd() {
                    wrap.removeEventListener('transitionend', onEnd);
                    refreshMapSize();
                }, { once: true });
            });

            resizeHandle.addEventListener('mousedown', function(e) {
                e.preventDefault();
                startX = e.clientX;
                startW = wrap.offsetWidth;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';

                function onMove(e) {
                    var dx = e.clientX - startX;
                    var newW = Math.min(maxW, Math.max(minW, startW + dx));
                    wrap.style.width = newW + 'px';
                }
                function onUp() {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    refreshMapSize();
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        })();