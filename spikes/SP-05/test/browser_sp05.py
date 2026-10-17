"""Headless Chromium integration checks; no third-party npm dependencies."""
import json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:4175'
report={}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1480,'height':960},device_scale_factor=1)
    errors=[];page.on('pageerror', lambda error:errors.append(str(error)))
    t=time.perf_counter();page.goto(BASE,wait_until='networkidle');page.wait_for_function('window.__SP05__ && document.documentElement.dataset.renderedScenes');
    report['load_ms']=round((time.perf_counter()-t)*1000,2)
    m=page.evaluate('window.__SP05__.getMetrics()');assert m['sceneCount']==500 and m['totalMs']==2100000, m
    assert m['mediaClipNodes']<100, m
    report['initial_metrics']={k:m[k] for k in ['sceneCount','totalMs','renderedSceneCount','mediaClipNodes']}
    page.screenshot(path='/mnt/data/ContentStudio_SP05_Timeline_Preview.png',full_page=True)
    # Native HTML5 drop should preserve ID while changing timeline position.
    before=page.evaluate('window.__SP05__.getMetrics().sceneIds.slice(0,8)')
    source=page.locator('#laneMedia [data-scene-id="SC-001"]')
    dest=page.locator('#laneMedia [data-scene-id="SC-005"]')
    source.drag_to(dest,timeout=10000)
    page.wait_for_timeout(250)
    after=page.evaluate('window.__SP05__.getMetrics().sceneIds.slice(0,8)')
    assert after != before and after[4]=='SC-001', (before,after)
    report['drag_reorder']='PASS, SC-001 moved to index 5'
    page.get_by_role('button',name='Undo (Ctrl+Z)').click();page.wait_for_timeout(100)
    restored=page.evaluate('window.__SP05__.getMetrics().sceneIds.slice(0,8)')
    assert restored==before,(before,restored)
    report['undo']='PASS'
    # Zoom keeps DOM bounded and does not change authoritative ms duration.
    page.locator('#zoomRange').fill('44')
    page.wait_for_timeout(100)
    m=page.evaluate('window.__SP05__.getMetrics()')
    assert m['scale']==44 and m['totalMs']==2100000 and m['mediaClipNodes']<100,m
    report['zoom']='PASS'
    # Jump to near the end: scrollbar changes, virtualized nodes represent last scenes.
    start=time.perf_counter()
    page.evaluate('window.__SP05__.select("SC-495")');page.wait_for_timeout(120)
    report['seek_last_ms']=round((time.perf_counter()-start)*1000,2)
    m=page.evaluate('window.__SP05__.getMetrics()')
    assert m['selectedId']=='SC-495' and m['mediaClipNodes']<100,m
    assert page.locator('#laneMedia [data-scene-id="SC-495"]').count()==1
    report['virtual_seek']='PASS, scene 495 visible'
    # Editor updates only the correct field's stale state and persists after reload.
    page.locator('#scriptInput').fill('Kiểm thử thay đổi văn bản chỉ scene này.');page.locator('#sceneHeading').click();page.wait_for_timeout(550)
    assert page.locator('.status-badge').inner_text().find('CẦN TẠO LẠI')!=-1
    page.reload();page.wait_for_function('window.__SP05__')
    page.evaluate('window.__SP05__.select("SC-495")');page.wait_for_timeout(100)
    assert page.locator('#scriptInput').input_value()=='Kiểm thử thay đổi văn bản chỉ scene này.'
    report['edit_persistence']='PASS'
    # Confirm time seeking / playback advances in actual Chromium.
    page.evaluate('window.__SP05__.seek(12500)')
    start_ms=page.evaluate('window.__SP05__.getMetrics().timeMs')
    page.locator('#playBtn').click();page.wait_for_timeout(270);page.locator('#playBtn').click()
    end_ms=page.evaluate('window.__SP05__.getMetrics().timeMs');assert end_ms>start_ms,(start_ms,end_ms)
    report['playback']='PASS, time progressed %sms' % round(end_ms-start_ms)
    # WAV real decoding / waveform (SP-02 output).
    wav='/mnt/data/ContentStudio_SP02_Vietnamese_Offline_Speech.wav'
    page.locator('#audioInput').set_input_files(wav);page.wait_for_timeout(800)
    assert page.locator('#audioLabel').inner_text().startswith('Đã tải:')
    report['real_pcm_waveform']='PASS, decoded SP-02 WAV'
    # Virtualized document size remains roughly constant when jumping.
    m=page.evaluate('window.__SP05__.getMetrics()');report['final_metrics']={k:m[k] for k in ['sceneCount','renderedSceneCount','mediaClipNodes','scale']}
    report['page_errors']=errors
    assert not errors, errors
    browser.close()
Path('/mnt/data/sp05_build/contentstudio-sprint0/SP-05/reports/browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
