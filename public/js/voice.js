/**
 * PrimeChat — Voice Recording
 * Uses MediaRecorder API
 */

document.addEventListener('DOMContentLoaded', () => {
    const voiceBtn = document.getElementById('voiceBtn');
    const recordingBar = document.getElementById('voiceRecordingBar');
    const timeDisplay = document.getElementById('voiceRecordingTime');
    const cancelBtn = document.getElementById('voiceRecordingCancel');
    const inputWrapper = document.getElementById('chatInputWrapper');
    const actionsLeft = document.querySelector('.input-actions-left');
    
    if (!voiceBtn || !recordingBar) return;
    
    let mediaRecorder = null;
    let audioChunks = [];
    let startTime = 0;
    let timerInterval = null;
    
    voiceBtn.addEventListener('mousedown', startRecording);
    voiceBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
    
    // Stop on mouseup anywhere
    document.addEventListener('mouseup', stopRecording);
    document.addEventListener('touchend', stopRecording);
    
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
            
            mediaRecorder.addEventListener('dataavailable', event => {
                audioChunks.push(event.data);
            });
            
            mediaRecorder.addEventListener('stop', () => {
                // If cancelled, chunks will be cleared
                if (audioChunks.length > 0) {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    const duration = Math.floor((Date.now() - startTime) / 1000);
                    
                    if (duration > 0) {
                        const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
                        // Add duration as custom property to send to our upload handler
                        file.duration = duration;
                        
                        // Fake a file upload call
                        const fakeInput = { target: { files: [file] } };
                        // We need to modify uploadFile in upload.js to accept duration
                        // For now we just call it
                        uploadVoiceMessage(file, duration);
                    }
                }
                
                // Cleanup
                stream.getTracks().forEach(track => track.stop());
                resetUI();
            });
            
            mediaRecorder.start();
            startTime = Date.now();
            
            // Update UI
            voiceBtn.classList.add('recording');
            inputWrapper.style.display = 'none';
            actionsLeft.style.display = 'none';
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
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    }
    
    function cancelRecording(e) {
        if (e) e.stopPropagation();
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            audioChunks = []; // Clear so stop event doesn't upload
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
                    setTimeout(fetchMessages, 500);
                }
                cancelReply();
            }
        } catch (e) {
            console.error(e);
            showToast(`Voice upload failed: ${e.message}`, 'error');
        }
    }
});
