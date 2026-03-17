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