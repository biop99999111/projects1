        function renderFeeCalculatorPanel() {
            var nav = document.getElementById('nav-content');
            if (currentMenu !== 'fee') return;
            var html = '<div class="nav-title" style="color:#1976d2;">💰 주차요금 계산기</div>';

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
            html += '  <div id="fee-start-times" style="display:none;margin-top:4px;border:1px solid #dee2e6;border-radius:4px;background:#fff;max-height:180px;overflow-y:auto;padding:4px 0;box-shadow:0 2px 6px rgba(0,0,0,0.12);">';
            html += '    <div style="padding:4px 8px;font-weight:bold;color:#495057;">오전</div>';
            for (var h = 0; h < 12; h++) {
                var labelH = h === 0 ? 12 : h;
                var hh = (h < 10 ? '0' : '') + h;
                ['00', '30'].forEach(function(mm) {
                    html += '<div class="time-option" data-hour="' + hh + '" data-minute="' + mm + '" style="padding:2px 12px;cursor:pointer;font-size:11px;">' +
                            '오전 ' + labelH + ':' + mm + '</div>';
                });
            }
            html += '    <div style="padding:4px 8px;font-weight:bold;color:#495057;border-top:1px solid #f1f3f5;margin-top:4px;">오후</div>';
            for (var h2 = 12; h2 < 24; h2++) {
                var labelH2 = h2 === 12 ? 12 : h2 - 12;
                var hh2 = (h2 < 10 ? '0' : '') + h2;
                ['00', '30'].forEach(function(mm) {
                    html += '<div class="time-option" data-hour="' + hh2 + '" data-minute="' + mm + '" style="padding:2px 12px;cursor:pointer;font-size:11px;">' +
                            '오후 ' + labelH2 + ':' + mm + '</div>';
                });
            }
            html += '  </div>';
            html += '</label>';

            html += '<label>출차 시각';
            html += '  <input id="fee-end" type="datetime-local" style="width:100%;padding:4px 6px;font-size:12px;border:1px solid #ced4da;border-radius:4px;box-sizing:border-box;">';
            html += '  <button type="button" id="fee-end-open" style="margin-top:4px;padding:4px 6px;font-size:11px;border:1px solid #ced4da;border-radius:4px;background:#f8f9fa;cursor:pointer;">오전/오후 시간 선택</button>';
            html += '  <div id="fee-end-times" style="display:none;margin-top:4px;border:1px solid #dee2e6;border-radius:4px;background:#fff;max-height:180px;overflow-y:auto;padding:4px 0;box-shadow:0 2px 6px rgba(0,0,0,0.12);">';
            html += '    <div style="padding:4px 8px;font-weight:bold;color:#495057;">오전</div>';
            for (var h3 = 0; h3 < 12; h3++) {
                var labelH3 = h3 === 0 ? 12 : h3;
                var hh3 = (h3 < 10 ? '0' : '') + h3;
                ['00', '30'].forEach(function(mm) {
                    html += '<div class="time-option" data-hour="' + hh3 + '" data-minute="' + mm + '" style="padding:2px 12px;cursor:pointer;font-size:11px;">' +
                            '오전 ' + labelH3 + ':' + mm + '</div>';
                });
            }
            html += '    <div style="padding:4px 8px;font-weight:bold;color:#495057;border-top:1px solid #f1f3f5;margin-top:4px;">오후</div>';
            for (var h4 = 12; h4 < 24; h4++) {
                var labelH4 = h4 === 12 ? 12 : h4 - 12;
                var hh4 = (h4 < 10 ? '0' : '') + h4;
                ['00', '30'].forEach(function(mm) {
                    html += '<div class="time-option" data-hour="' + hh4 + '" data-minute="' + mm + '" style="padding:2px 12px;cursor:pointer;font-size:11px;">' +
                            '오후 ' + labelH4 + ':' + mm + '</div>';
                });
            }
            html += '  </div>';
            html += '</label>';
            html += '<label style="display:flex;align-items:center;gap:6px;margin-top:4px;">';
            html += '<input id="fee-eco" type="checkbox"> 친환경 차량 (50% 할인)';
            html += '</label>';
            html += '<button id="fee-calc-btn" type="button" style="margin-top:6px;padding:6px 8px;font-size:12px;border:none;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;">요금 계산</button>';
            html += '</div>';
            html += '</div>';

            html += '<div class="nav-section">';
            html += '<div class="nav-label">예상 요금</div>';
            html += '<div id="fee-result" class="nav-text" style="min-height:32px;color:#212529;">입·출차 시간을 입력하고 계산 버튼을 눌러 주세요.</div>';
            html += '</div>';

            nav.innerHTML = html;

            function initTimePicker(inputId, panelId, openBtnId) {
                var input = document.getElementById(inputId);
                var panel = document.getElementById(panelId);
                var openBtn = document.getElementById(openBtnId);
                if (!input || !panel || !openBtn) return;

                openBtn.addEventListener('click', function () {
                    panel.style.display = panel.style.display === 'none' || panel.style.display === '' ? 'block' : 'none';
                });

                panel.querySelectorAll('.time-option').forEach(function (item) {
                    item.addEventListener('click', function () {
                        var h = this.getAttribute('data-hour');
                        var m = this.getAttribute('data-minute');
                        var base = input.value || new Date().toISOString().slice(0, 16);
                        var datePart = base.slice(0, 11); // YYYY-MM-DDT
                        input.value = datePart + h + ':' + m;
                        panel.style.display = 'none'; // 선택 후 창 닫기
                        input.dispatchEvent(new Event('change'));
                    });
                });

                document.addEventListener('click', function (e) {
                    if (!panel.contains(e.target) && e.target !== openBtn) {
                        panel.style.display = 'none';
                    }
                });
            }

            initTimePicker('fee-start', 'fee-start-times', 'fee-start-open');
            initTimePicker('fee-end', 'fee-end-times', 'fee-end-open');

            var btn = document.getElementById('fee-calc-btn');
            if (btn) {
                btn.addEventListener('click', function () {
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
                    var minutes = Math.ceil((end - start) / 60000); // 분 단위

                    var baseMin = parseInt(p.base_minutes, 10);
                    var baseFee = parseInt(p.base_fee, 10);
                    var extraMin = parseInt(p.extra_unit_minutes, 10);
                    var extraFee = parseInt(p.extra_unit_fee, 10);

                    if (!(baseMin > 0) || !(baseFee >= 0) || !(extraMin > 0) || !(extraFee >= 0)) {
                        out.textContent = '해당 주차장은 자동 요금 계산 정보를 제공하지 않습니다. 비고의 요금정보를 참고해 주세요.';
                        out.style.color = '#6c757d';
                        return;
                    }

                    var total = 0;
                    if (minutes <= baseMin) {
                        total = baseFee;
                    } else {
                        total = baseFee;
                        var remain = minutes - baseMin;
                        var units = Math.ceil(remain / extraMin);
                        total += units * extraFee;
                    }

                    var original = total;
                    if (eco) {
                        total = Math.round(total * 0.5);
                    }

                    var nf = new Intl.NumberFormat('ko-KR');
                    var text = '총 이용 시간: 약 ' + minutes + '분\n';
                    text += '기본 요금 체계 기준 예상 요금: ' + nf.format(original) + '원';
                    if (eco) {
                        text += '\n친환경 차량 50% 할인 적용 요금: ' + nf.format(total) + '원';
                    }
                    out.textContent = text;
                    out.style.whiteSpace = 'pre-line';
                    out.style.color = '#212529';
                });
            }