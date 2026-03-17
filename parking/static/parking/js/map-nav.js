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




