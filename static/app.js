const MODELS_PATH = '/static/models'  // recommended: download models into this folder
let video = null;
let overlay = null;
let ctx = null;
let stream = null;
let audioStream = null;
let lastMetrics = null;
let sessionId = null;

function $(id){ return document.getElementById(id); }

async function loadModels() {
  // face-api.js models: tiny_face_detector + face_landmark_68
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_PATH);
  await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_PATH);
  console.log('Models loaded');
}

function makeSessionId() {
  return 's_' + Math.random().toString(36).slice(2,10);
}

function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

async function startCamera() {
  video = $('video');
  overlay = $('overlay');
  ctx = overlay.getContext('2d');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    video.srcObject = stream;
    await video.play();
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    sessionId = makeSessionId();
    $('btn-save').disabled = true;
    await loadModels();
    console.log('Camera started');
  } catch (e) {
    alert('Camera start failed: ' + e.message);
    console.error(e);
  }
}

async function requestMic() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // quick level meter for user feedback:
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(audioStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let level = 0;
    const meter = setInterval(()=> {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for(let i=0;i<data.length;i++) sum += data[i];
      level = sum / data.length;
      // update UI
      $('device-info').textContent = $('device-info').textContent + ''; // keep
    }, 200);
    setTimeout(()=>{ clearInterval(meter); audioCtx.close(); }, 2000);
    alert('Microphone permission granted (temporary check).');
  } catch (e) {
    alert('Microphone unavailable or permission denied.');
  }
}

function drawResults(box, landmarks) {
  ctx.clearRect(0,0,overlay.width, overlay.height);
  // draw box
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  // draw landmarks
  ctx.fillStyle = '#ff0';
  landmarks.forEach(p=>{
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI*2);
    ctx.fill();
  });
}

function computeSymmetry(landmarks) {
  // landmarks: array of {x,y} 68 points
  // heuristic: compute midX as average eye centers
  function avg(indices){
    let sx=0, sy=0;
    indices.forEach(i=>{ sx += landmarks[i].x; sy += landmarks[i].y;});
    return {x: sx/indices.length, y: sy/indices.length};
  }
  const leftEye = avg([36,37,38,39,40,41]);
  const rightEye = avg([42,43,44,45,46,47]);
  const midX = (leftEye.x + rightEye.x)/2;

  // pairs (approx symmetric pairs) - indices from 0..67
  const pairs = [
    [17,26],[18,25],[19,24],[20,23],[21,22],
    [36,45],[37,44],[38,43],[39,42],[40,47],[41,46],
    [31,35],[32,34],
    [48,54],[49,53],[50,52],
    [3,13],[4,12],[5,11]
  ];

  const faceWidth = Math.abs(Math.max(...landmarks.map(p=>p.x)) - Math.min(...landmarks.map(p=>p.x))) || 1;
  let dsum = 0;
  pairs.forEach(pair=>{
    const a = landmarks[pair[0]];
    const b = landmarks[pair[1]];
    // reflect b across midX
    const bx_ref = 2*midX - b.x;
    const by_ref = b.y;
    const dx = a.x - bx_ref;
    const dy = a.y - by_ref;
    const dist = Math.hypot(dx,dy);
    dsum += dist / faceWidth; // normalized
  });
  const avgNorm = dsum / pairs.length;
  // heuristic mapping: lower avgNorm -> higher score
  // scale so typical avgNorm ~ 0.01..0.06 maps sensibly
  let score = Math.max(0, Math.round(100 - avgNorm * 2000));
  score = Math.min(100, score);
  return {score, avgNorm};
}

function computeFaceShape(landmarks) {
  // Very simple heuristic using face height vs jaw/cheek widths
  const top = landmarks[27]; // approximate top-of-nose bridge
  const chin = landmarks[8];
  const leftJaw = landmarks[0];
  const rightJaw = landmarks[16];
  const jawWidth = Math.hypot(leftJaw.x - rightJaw.x, leftJaw.y - rightJaw.y);
  const faceHeight = Math.hypot(top.x - chin.x, top.y - chin.y) || 1;
  const ratio = jawWidth / faceHeight; // larger -> squarer
  // cheek width: pts 1 and 15
  const cheekWidth = Math.hypot(landmarks[1].x - landmarks[15].x, landmarks[1].y - landmarks[15].y);
  const cheekRatio = cheekWidth / faceHeight;

  let shape = 'Unknown';
  if (ratio > 0.9) shape = 'Square';
  else if (ratio > 0.78) shape = 'Round';
  else if (cheekRatio > 0.6) shape = 'Heart/Oval';
  else if (faceHeight / jawWidth > 1.5) shape = 'Long/Oblong';
  else shape = 'Oval';

  return {shape, jawWidth: Math.round(jawWidth), faceHeight: Math.round(faceHeight), ratio: ratio.toFixed(2)};
}

async function analyzeCapture() {
  if (!video) return;
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  const result = await faceapi.detectSingleFace(video, options).withFaceLandmarks(true);
  if (!result) {
    alert('No face detected — try better light and center your face.');
    return;
  }
  const box = result.detection.box;
  const landmarks = result.landmarks.positions.map(p=>({x: p.x, y: p.y}));
  drawResults(box, landmarks);
  const sym = computeSymmetry(landmarks);
  const shape = computeFaceShape(landmarks);
  const scoreText = `Symmetry score: ${sym.score} / 100`;
  $('score').textContent = scoreText;
  const details = [
    `Symmetry normalized error: ${sym.avgNorm.toFixed(4)}`,
    `Estimated face shape: ${shape.shape}`,
    `Jaw width: ${shape.jawWidth}px, face height: ${shape.faceHeight}px, ratio: ${shape.ratio}`
  ];
  const dlist = $('details');
  dlist.innerHTML = '';
  details.forEach(s=>{
    const li = document.createElement('li'); li.textContent = s; dlist.appendChild(li);
  });
  lastMetrics = {
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    symmetry: sym,
    face_shape: shape,
    box: box,
  };
  $('btn-save').disabled = false;
}

async function saveResultsToServer() {
  if (!lastMetrics) return alert('No analysis to save yet.');
  // collect device info
  const deviceInfo = {
    ua: navigator.userAgent,
    platform: navigator.platform,
    screen: {w: screen.width, h: screen.height},
    cookies: document.cookie ? document.cookie.split('; ').slice(0,4) : [],
    battery: null
  };
  try {
    if (navigator.getBattery) {
      const bat = await navigator.getBattery();
      deviceInfo.battery = {level: bat.level, charging: bat.charging};
    }
  } catch(e){}
  const payload = { session_id: lastMetrics.session_id, timestamp: lastMetrics.timestamp, metrics: lastMetrics, device_info: deviceInfo };
  try {
    const res = await fetch('/save_results', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const j = await res.json();
    alert('Saved: ' + (j.path || JSON.stringify(j)));
  } catch (e) {
    alert('Save failed: ' + e.message);
  }
}

function showDeviceInfo() {
  const info = {
    ua: navigator.userAgent,
    platform: navigator.platform,
    screen: {w: screen.width, h: screen.height},
    cookies: document.cookie ? document.cookie.split('; ').slice(0,4) : []
  };
  $('device-info').textContent = JSON.stringify(info, null, 2);
}

// UI wiring
window.addEventListener('load', ()=>{
  $('btn-consent').addEventListener('click', async ()=>{
    hide($('consent'));
    show($('camera-section'));
    await startCamera();
    showDeviceInfo();
  });
  $('btn-capture').addEventListener('click', analyzeCapture);
  $('btn-save').addEventListener('click', saveResultsToServer);
  $('btn-toggle-audio').addEventListener('click', requestMic);
  $('btn-reset').addEventListener('click', ()=>{
    if (stream) {
      stream.getTracks().forEach(t=>t.stop());
    }
    if (audioStream) {
      audioStream.getTracks().forEach(t=>t.stop());
    }
    location.reload();
  });
});
