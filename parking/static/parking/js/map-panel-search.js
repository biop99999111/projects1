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