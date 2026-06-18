// Client-side: improved UI, frame-averaging, median score, minimal saved payload
const MODELS_PATH = '/static/models';
const FRAMES_TO_CAPTURE = 5; // number of frames to average
const FRAME_INTERVAL_MS = 150; // time between frames

let video = null;
let overlay = null;
let ctx = null;
let stream = null;
let audioStream = null;
let sessionId = null;
let lastMetrics = null;

function $(id){ return document.getElementById(id); }

function makeSessionId() { return 's_' + Math.random().toString(36).slice(2,10); }

async function loadModels(){
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_PATH);
  await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_PATH);
  console.log('Models loaded');
}

function showPlaceholder(show){
  const ph = document.getElementById('placeholder');
  if(!ph) return;
  ph.style.display = show ? 'block' : 'none';
}

async function startCamera(){
  video = $('video');
  overlay = $('overlay');
  ctx = overlay.getContext('2d');
  try{
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    await video.play();
    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 360;
    sessionId = makeSessionId();
    $('session-id').textContent = sessionId;
    $('btn-capture').disabled = false;
    $('btn-save').disabled = true;
    await loadModels();
    showPlaceholder(false);
  }catch(e){
    alert('Camera error: '+e.message);
    console.error(e);
  }
}

async function requestMic(){
  try{
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // quick level test
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(audioStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256; source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let sum = 0; analyser.getByteFrequencyData(data);
    for(let i=0;i<data.length;i++) sum+=data[i];
    audioCtx.close();
    alert('Microphone available');
  }catch(e){
    alert('Microphone permission denied or unavailable');
  }
}

function drawOverlay(detection){
  if(!ctx) return;
  ctx.clearRect(0,0,overlay.width, overlay.height);
  if(!detection) return;
  const box = detection.detection.box;
  ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  const points = detection.landmarks.positions;
  ctx.fillStyle = '#ffd54f';
  points.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x, p.y, 2,0,Math.PI*2); ctx.fill(); });
}

function avgIndices(landmarks, indices){
  let sx=0, sy=0; indices.forEach(i=>{ sx+=landmarks[i].x; sy+=landmarks[i].y; });
  return {x: sx/indices.length, y: sy/indices.length};
}

function computeSymmetryFromLandmarks(landmarks){
  const leftEye = avgIndices(landmarks,[36,37,38,39,40,41]);
  const rightEye = avgIndices(landmarks,[42,43,44,45,46,47]);
  const midX = (leftEye.x + rightEye.x)/2;
  const pairs = [[17,26],[18,25],[19,24],[20,23],[21,22],[36,45],[37,44],[38,43],[39,42],[40,47],[41,46],[31,35],[32,34],[48,54],[49,53],[50,52],[3,13],[4,12],[5,11]];
  const xs = landmarks.map(p=>p.x);
  const faceWidth = Math.max(...xs) - Math.min(...xs) || 1;
  let dsum=0;
  pairs.forEach(pair=>{
    const a = landmarks[pair[0]]; const b = landmarks[pair[1]];
    const bx_ref = 2*midX - b.x; const by_ref = b.y;
    const dx = a.x - bx_ref; const dy = a.y - by_ref; const dist = Math.hypot(dx,dy);
    dsum += dist/faceWidth;
  });
  const avgNorm = dsum / pairs.length;
  // improved mapping with clamping and sigmoid-like scaling
  const scaled = Math.max(0, Math.min(1, Math.exp(-avgNorm*200)));
  const score = Math.round(scaled * 100);
  return {score, avgNorm};
}

function computeFaceShape(landmarks){
  const top = landmarks[27]; const chin = landmarks[8];
  const leftJaw = landmarks[0]; const rightJaw = landmarks[16];
  const jawWidth = Math.hypot(leftJaw.x-rightJaw.x, leftJaw.y-rightJaw.y);
  const faceHeight = Math.hypot(top.x-chin.x, top.y-chin.y) || 1;
  const ratio = jawWidth/faceHeight; const cheekWidth = Math.hypot(landmarks[1].x-landmarks[15].x, landmarks[1].y-landmarks[15].y);
  const cheekRatio = cheekWidth/faceHeight;
  let shape='Oval';
  if(ratio>0.92) shape='Square'; else if(ratio>0.82) shape='Round'; else if(cheekRatio>0.62) shape='Heart/Oval'; else if(faceHeight/jawWidth>1.55) shape='Long/Oblong';
  return {shape, jawWidth:Math.round(jawWidth), faceHeight:Math.round(faceHeight), ratio:ratio.toFixed(2)};
}

function median(arr){ const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }

async function captureFramesAndAnalyze(){
  if(!video) return alert('Start camera first');
  const results = [];
  for(let i=0;i<FRAMES_TO_CAPTURE;i++){
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
    const detection = await faceapi.detectSingleFace(video, options).withFaceLandmarks(true);
    if(detection){
      drawOverlay(detection);
      const landmarks = detection.landmarks.positions.map(p=>({x:p.x,y:p.y}));
      const sym = computeSymmetryFromLandmarks(landmarks);
      const shape = computeFaceShape(landmarks);
      results.push({sym,shape,landmarks,box:detection.detection.box});
    }
    await new Promise(r=>setTimeout(r, FRAME_INTERVAL_MS));
  }
  if(results.length===0) return alert('No face detected. Try better lighting and center your face.');
  // compute median symmetry score
  const scores = results.map(r=>r.sym.score);
  const avgNorms = results.map(r=>r.sym.avgNorm);
  const medianScore = median(scores);
  const medianNorm = median(avgNorms);
  const finalShape = results[ Math.floor(results.length/2) ].shape; // pick middle frame shape
  // update UI
  $('score').textContent = medianScore + ' / 100';
  $('shape').textContent = finalShape.shape;
  $('qc').textContent = `Frames: ${results.length} | norm: ${medianNorm.toFixed(4)}`;
  const details = $('details'); details.innerHTML='';
  const li1 = document.createElement('li'); li1.textContent = `Symmetry normalized error (median): ${medianNorm.toFixed(4)}`; details.appendChild(li1);
  const li2 = document.createElement('li'); li2.textContent = `Estimated face shape: ${finalShape.shape}`; details.appendChild(li2);
  const li3 = document.createElement('li'); li3.textContent = `Jaw width: ${finalShape.jawWidth}px, face height: ${finalShape.faceHeight}px` ; details.appendChild(li3);

  lastMetrics = { session_id: sessionId, timestamp: new Date().toISOString(), metrics: { symmetry: { score: medianScore, avgNorm: medianNorm }, face_shape: finalShape } };
  $('btn-save').disabled = false;
}

async function saveResultsToServer(){
  if(!lastMetrics) return alert('No analysis to save');
  const payload = { session_id: lastMetrics.session_id, timestamp: lastMetrics.timestamp, metrics: lastMetrics.metrics, device_info: { ua: navigator.userAgent, platform: navigator.platform, screen: {w:screen.width,h:screen.height} } };
  try{
    const res = await fetch('/save_results', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const j = await res.json();
    if(j.status==='ok'){
      $('last-saved').textContent = new Date().toLocaleString();
      alert('Saved locally: ' + j.path);
      $('btn-save').disabled = true;
    }else{
      alert('Save failed');
    }
  }catch(e){ alert('Save failed: '+e.message); }
}

function cleanupStreams(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } if(audioStream){ audioStream.getTracks().forEach(t=>t.stop()); audioStream=null; } }

window.addEventListener('load', ()=>{
  $('btn-consent').addEventListener('click', async ()=>{ await startCamera(); });
  $('btn-capture').addEventListener('click', async ()=>{ $('btn-capture').disabled=true; await captureFramesAndAnalyze(); $('btn-capture').disabled=false; });
  $('btn-save').addEventListener('click', saveResultsToServer);
  $('btn-toggle-audio').addEventListener('click', requestMic);
  $('btn-reset').addEventListener('click', ()=>{ cleanupStreams(); location.reload(); });
});
