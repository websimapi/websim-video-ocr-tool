import Tesseract from 'tesseract.js';

// DOM elements
const videoInput = document.getElementById('videoInput');
const video = document.getElementById('video');
const videoContainer = document.getElementById('videoContainer');
const selectionBox = document.getElementById('selectionBox');
const selectRegionBtn = document.getElementById('selectRegion');
const startCaptureBtn = document.getElementById('startCapture');
const stopCaptureBtn = document.getElementById('stopCapture');
const resultsContainer = document.getElementById('resultsContainer');
const results = document.getElementById('results');
const clearResultsBtn = document.getElementById('clearResults');

// State variables
let isSelecting = false;
let startX, startY;
let ocrRegion = null;
let captureInterval = null;
let prevImageData = null;
let worker = null;
let isProcessing = false;

// Initialize Tesseract worker
async function initWorker() {
    worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    console.log('Tesseract worker initialized');
}

// Initialize worker when page loads
initWorker();

// Video input handling
videoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const videoUrl = URL.createObjectURL(file);
        video.src = videoUrl;
        videoContainer.classList.remove('hidden');
        ocrRegion = null;
        selectionBox.classList.add('hidden');
        startCaptureBtn.disabled = true;
    }
});

// Mouse events for region selection
selectRegionBtn.addEventListener('click', () => {
    isSelecting = true;
    selectionBox.style.width = '0';
    selectionBox.style.height = '0';
    selectionBox.classList.remove('hidden');
});

document.getElementById('videoWrapper').addEventListener('mousedown', (e) => {
    if (!isSelecting) return;
    
    const rect = video.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    
    selectionBox.style.left = `${startX}px`;
    selectionBox.style.top = `${startY}px`;
    selectionBox.style.width = '0';
    selectionBox.style.height = '0';
});

document.getElementById('videoWrapper').addEventListener('mousemove', (e) => {
    if (!isSelecting || !startX) return;
    
    const rect = video.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const width = currentX - startX;
    const height = currentY - startY;
    
    selectionBox.style.width = `${Math.abs(width)}px`;
    selectionBox.style.height = `${Math.abs(height)}px`;
    
    if (width < 0) {
        selectionBox.style.left = `${currentX}px`;
    }
    
    if (height < 0) {
        selectionBox.style.top = `${currentY}px`;
    }
});

document.getElementById('videoWrapper').addEventListener('mouseup', (e) => {
    if (!isSelecting) return;
    
    isSelecting = false;
    
    const rect = video.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    
    // Store the selected region relative to the video dimensions
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const displayWidth = video.offsetWidth;
    const displayHeight = video.offsetHeight;
    
    // Convert screen coordinates to video coordinates
    const x = Math.min(startX, endX) * (videoWidth / displayWidth);
    const y = Math.min(startY, endY) * (videoHeight / displayHeight);
    const width = Math.abs(endX - startX) * (videoWidth / displayWidth);
    const height = Math.abs(endY - startY) * (videoHeight / displayHeight);
    
    ocrRegion = { x, y, width, height };
    startCaptureBtn.disabled = false;
    
    console.log('Selected region:', ocrRegion);
});

// OCR processing
async function processFrame() {
    if (isProcessing || !ocrRegion) return;
    
    isProcessing = true;
    
    try {
        // Create an offscreen canvas for frame manipulation
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set dimensions to match the selected region
        canvas.width = ocrRegion.width;
        canvas.height = ocrRegion.height;
        
        // Draw the current video frame's selected region to the canvas
        ctx.drawImage(
            video,
            ocrRegion.x, ocrRegion.y, ocrRegion.width, ocrRegion.height,
            0, 0, ocrRegion.width, ocrRegion.height
        );
        
        // Get image data for comparison
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        
        // Check if the frame has changed significantly
        if (prevImageData && !hasSignificantChange(imageData, prevImageData)) {
            isProcessing = false;
            return;
        }
        
        // Save the current frame data
        prevImageData = imageData;
        
        // Run OCR on the canvas
        const { data } = await worker.recognize(canvas);
        
        // If text is found, display the result
        if (data.text.trim()) {
            const timestamp = video.currentTime.toFixed(2);
            displayResult(timestamp, data.text);
        }
    } catch (error) {
        console.error('OCR error:', error);
    }
    
    isProcessing = false;
}

// Determine if frame has significant changes
function hasSignificantChange(current, previous) {
    // Calculate pixel difference (simple algorithm)
    let differentPixels = 0;
    const threshold = 30; // Pixel difference threshold
    const requiredDifference = 0.05; // Require 5% of pixels to change
    
    for (let i = 0; i < current.length; i += 4) {
        // Check R, G, B values (ignore alpha)
        const diff = Math.abs(current[i] - previous[i]) + 
                     Math.abs(current[i+1] - previous[i+1]) + 
                     Math.abs(current[i+2] - previous[i+2]);
        
        if (diff > threshold) {
            differentPixels++;
        }
    }
    
    const pixelCount = current.length / 4;
    return (differentPixels / pixelCount) > requiredDifference;
}

// Display OCR result
function displayResult(timestamp, text) {
    resultsContainer.classList.remove('hidden');
    
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';
    
    resultItem.innerHTML = `
        <div class="timestamp">Time: ${timestamp}s</div>
        <div class="text">${text}</div>
    `;
    
    results.appendChild(resultItem);
    resultItem.scrollIntoView({ behavior: 'smooth' });
}

// Start and stop OCR capture
startCaptureBtn.addEventListener('click', () => {
    if (!ocrRegion) return;
    
    // Reset previous results
    prevImageData = null;
    
    // Start playing the video
    video.play();
    
    // Create capture interval
    captureInterval = setInterval(processFrame, 500); // Check every 500ms
    
    startCaptureBtn.disabled = true;
    stopCaptureBtn.disabled = false;
});

stopCaptureBtn.addEventListener('click', () => {
    if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
    }
    
    video.pause();
    startCaptureBtn.disabled = false;
    stopCaptureBtn.disabled = true;
});

// Clear results
clearResultsBtn.addEventListener('click', () => {
    results.innerHTML = '';
});

// Clean up resources when page is unloaded
window.addEventListener('beforeunload', () => {
    if (worker) {
        worker.terminate();
    }
    
    if (captureInterval) {
        clearInterval(captureInterval);
    }
});