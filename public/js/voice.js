/**
 * PrimeChat — Voice Recording (Unified)
 * Uses MediaRecorder API and WebAudio for live visualization
 *
 * Lazy-loaded by app.js — must export window.initVoice()
 */

'use strict';

let _voiceInitialized = false;

window.initVoice = () => {
    if (_voiceInitialized) return;
    _voiceInitialized = true;

    const voiceBtn = document.getElementById('voiceBtn');
    const recordingBar = document.getElementById('voiceRecordingBar');
    const timeDisplay = document.getElementById('voiceRecordingTime');
    const indicator = document.querySelector('.voice-recording-indicator');
    const cancelBtn = document.getElementById('voiceRecordingCancel');
    const inputWrapper = document.getElementById('chatInputWrapper');
    const actionsLeft = document.querySelector('.input-actions-left');

    if (!voiceBtn || !recordingBar) return;

    let mediaRecorder = null;
    let audioChunks = [];
    let startTime = 0;
    let timerInterval = null;

    // WebAudio for visualizer
    let audioContext = null;
    let analyser = null;
    let microphone = null;
    let animationFrameId = null;
    let _isRecording = false;

    voiceBtn.addEventListener('mousedown', startRecording);
    voiceBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });

    // Stop on mouseup anywhere
    document.addEventListener('mouseup', () => { if (_isRecording) stopRecording(); });
    document.addEventListener('touchend', () => { if (_isRecording) stopRecording(); });

    cancelBtn.addEventListener('click', cancelRecording);

    async function startRecording() {
        if (!window.appState.activeConversationId && !window.appState.activeOtherUser) {
            showToast('Select a chat first');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            _isRecording = true;

            // Setup Visualizer
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const updateVisualizer = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const average = sum / dataArray.length;
                const scale = 1 + (average / 255) * 0.5;
                if (indicator) indicator.style.transform = `scale(${scale})`;

                animationFrameId = requestAnimationFrame(updateVisualizer);
            };

            updateVisualizer();

            mediaRecorder.addEventListener('dataavailable', event => {
                audioChunks.push(event.data);
            });

            mediaRecorder.addEventListener('stop', () => {
                // Stop visualizer
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
                if (audioContext && audioContext.state !== 'closed') audioContext.close();
                if (indicator) indicator.style.transform = 'scale(1)';

                if (audioChunks.length > 0) {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    const duration = Math.floor((Date.now() - startTime) / 1000);

                    if (duration > 0) {
                        const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
                        timeDisplay.textContent = 'Sending...';
                        cancelBtn.style.display = 'none';
                        uploadVoiceMessage(file, duration);
                    } else {
                        resetUI();
                    }
                } else {
                    resetUI();
                }

                // Cleanup
                stream.getTracks().forEach(track => track.stop());
            });

            mediaRecorder.start();
            startTime = Date.now();

            // Update UI
            voiceBtn.classList.add('recording');
            inputWrapper.style.display = 'none';
            actionsLeft.style.display = 'none';
            cancelBtn.style.display = 'block';
            recordingBar.classList.add('show');

            timerInterval = setInterval(() => {
                const diff = Math.floor((Date.now() - startTime) / 1000);
                const mins = Math.floor(diff / 60).toString().padStart(2, '0');
                const secs = (diff % 60).toString().padStart(2, '0');
                timeDisplay.textContent = `${mins}:${secs}`;
            }, 1000);

        } catch (err) {
            console.error('Microphone access denied', err);
            showToast('Microphone access denied or not available (Requires HTTPS)', 'error');
        }
    }

    function stopRecording() {
        _isRecording = false;
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    }

    function cancelRecording(e) {
        if (e) e.stopPropagation();
        _isRecording = false;
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            audioChunks = [];
            mediaRecorder.stop();
        }
    }

    function resetUI() {
        clearInterval(timerInterval);
        voiceBtn.classList.remove('recording');
        inputWrapper.style.display = 'block';
        actionsLeft.style.display = 'flex';
        recordingBar.classList.remove('show');
        timeDisplay.textContent = '00:00';
        cancelBtn.style.display = 'block';
        if (indicator) indicator.style.transform = 'scale(1)';
    }

    async function uploadVoiceMessage(file, duration) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_type', 'voice');
        formData.append('duration', duration);

        if (window.appState.activeConversationId) {
            formData.append('conversation_id', window.appState.activeConversationId);
        } else {
            formData.append('recipient_id', window.appState.activeOtherUser.id);
        }

        if (window.appState.replyingTo) {
            formData.append('reply_to_id', window.appState.replyingTo.id);
        }

        try {
            const res = await api('/upload/file', {
                method: 'POST',
                body: formData
            });

            if (res && res.success) {
                if (!window.appState.activeConversationId) {
                    window.appState.activeConversationId = res.data.conversation_id;
                }
                cancelReply();
                // Signal upload complete so chat poll can pick up the real message
                EventBus.emit('upload:complete', res.data);
            }
        } catch (e) {
            console.error(e);
            showToast(`Voice upload failed: ${e.message}`, 'error');
        } finally {
            resetUI();
        }
    }
};

