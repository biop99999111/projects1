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