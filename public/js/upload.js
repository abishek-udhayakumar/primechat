/**
 * PrimeChat — File Upload
 * Handles drag & drop, file selection, and uploading
 */

document.addEventListener('DOMContentLoaded', () => {
    const attachBtn = document.getElementById('attachBtn');
    const fileInput = document.getElementById('fileInput');
    const dropOverlay = document.getElementById('fileDropOverlay');
    const mainChat = document.getElementById('chatMain');
    
    if (attachBtn && fileInput) {
        attachBtn.addEventListener('click', () => {
            if (!window.appState.activeConversationId && !window.appState.activeOtherUser) {
                showToast('Please select a conversation first');
                return;
            }
            fileInput.click();
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                uploadFile(e.target.files[0]);
                fileInput.value = ''; // Reset
            }
        });
    }
    
    // Drag & Drop
    if (mainChat && dropOverlay) {
        mainChat.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (!window.appState.activeConversationId && !window.appState.activeOtherUser) return;
            dropOverlay.classList.add('show');
        });
        
        mainChat.addEventListener('dragover', (e) => {
            e.preventDefault(); // Necessary to allow dropping
        });
        
        dropOverlay.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropOverlay.classList.remove('show');
        });
        
        dropOverlay.addEventListener('drop', (e) => {
            e.preventDefault();
            dropOverlay.classList.remove('show');
            
            if (e.dataTransfer.files.length > 0) {
                uploadFile(e.dataTransfer.files[0]);
            }
        });
    }
});

async function uploadFile(file) {
    if (!window.appState.activeConversationId && !window.appState.activeOtherUser) return;
    
    // Determine type
    const isImage = file.type.startsWith('image/');
    const uploadType = isImage ? 'image' : 'file';
    
    // Check size limits
    const maxSize = isImage ? 10 * 1024 * 1024 : 25 * 1024 * 1024; // 10MB image, 25MB file
    if (file.size > maxSize) {
        showToast(`File too large. Maximum size is ${formatSize(maxSize)}`, 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_type', uploadType);
    
    if (window.appState.activeConversationId) {
        formData.append('conversation_id', window.appState.activeConversationId);
    } else {
        formData.append('recipient_id', window.appState.activeOtherUser.id);
    }
    
    if (window.appState.replyingTo) {
        formData.append('reply_to_id', window.appState.replyingTo.id);
    }
    
    showToast(`Uploading ${file.name}...`, 'info');
    
    try {
        const res = await api('/upload/file', {
            method: 'POST',
            body: formData
        });
        
        if (res && res.success) {
            // Success! The polling mechanism or optimistic update will handle showing it
            // For now, manual fetch if it's a new conversation
            if (!window.appState.activeConversationId) {
                window.appState.activeConversationId = res.data.conversation_id;
                // Wait a sec for the file to be processed then fetch
                setTimeout(fetchMessages, 500);
            }
            
            cancelReply();
        }
    } catch (e) {
        showToast(`Upload failed: ${e.message}`, 'error');
    }
}
