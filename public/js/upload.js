/**
 * PrimeChat — File Upload (Unified)
 * Handles drag & drop, file selection, compression, XHR progress
 *
 * Lazy-loaded by app.js — must export window.initUpload()
 */

'use strict';

let _uploadInitialized = false;

window.initUpload = () => {
    if (_uploadInitialized) return;
    _uploadInitialized = true;

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
                handleFileSelection(e.target.files[0]);
                fileInput.value = '';
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
            e.preventDefault();
        });

        dropOverlay.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropOverlay.classList.remove('show');
        });

        dropOverlay.addEventListener('drop', (e) => {
            e.preventDefault();
            dropOverlay.classList.remove('show');

            if (e.dataTransfer.files.length > 0) {
                handleFileSelection(e.dataTransfer.files[0]);
            }
        });
    }
};

function handleFileSelection(file) {
    if (!window.appState.activeConversationId && !window.appState.activeOtherUser) return;

    const isImage = file.type.startsWith('image/');
    const maxSize = isImage ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > maxSize) {
        showToast(`File too large. Maximum size is ${formatSize(maxSize)}`, 'error');
        return;
    }

    _showPreviewModal(file, isImage);
}

function _showPreviewModal(file, isImage) {
    const modal = document.createElement('div');
    modal.className = 'upload-preview-modal';
    modal.innerHTML = `
        <div class="upload-preview-content">
            <h3>Send ${isImage ? 'Image' : 'File'}</h3>
            <div class="upload-preview-body" id="previewBody"></div>
            <div class="upload-preview-actions">
                <button class="btn btn--ghost" id="cancelUploadBtn">Cancel</button>
                <button class="btn btn--primary" id="confirmUploadBtn">Send</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const previewBody = modal.querySelector('#previewBody');
    let previewUrl = '';

    if (isImage) {
        previewUrl = URL.createObjectURL(file);
        previewBody.innerHTML = `<img src="${previewUrl}" class="preview-img" style="max-width: 100%; max-height: 300px; border-radius: var(--radius-md);">`;
    } else {
        previewBody.innerHTML = `<div class="preview-file-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
            <p style="margin-top: 10px;">${escapeHTML(file.name)}</p>
            <p style="opacity:0.6; font-size:12px;">${formatSize(file.size)}</p>
        </div>`;
    }

    const cleanup = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        modal.remove();
    };

    modal.querySelector('#cancelUploadBtn').addEventListener('click', cleanup);
    modal.querySelector('#confirmUploadBtn').addEventListener('click', async () => {
        const btn = modal.querySelector('#confirmUploadBtn');
        btn.disabled = true;
        btn.textContent = 'Processing...';

        let finalFile = file;

        // Compress images > 1MB via Canvas
        if (isImage && file.size > 1024 * 1024) {
            finalFile = await _compressImage(file);
        }

        cleanup();
        _uploadFileWithProgress(finalFile, isImage ? 'image' : 'file');
    });
}

function _compressImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            let width = img.width;
            let height = img.height;
            const MAX_DIM = 1920;

            if (width > height) {
                if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; }
            } else {
                if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (!blob) { resolve(file); return; }
                const compressed = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                resolve(compressed.size < file.size ? compressed : file);
            }, 'image/jpeg', 0.8);

            URL.revokeObjectURL(img.src);
        };
        img.onerror = () => resolve(file);
        img.src = URL.createObjectURL(file);
    });
}

function _uploadFileWithProgress(file, uploadType) {
    // 1. Optimistic UI bubble with progress bar
    const tempId = 'c_up_' + Date.now();
    const tempMsg = {
        id: tempId,
        client_msg_id: tempId,
        content: file.name,
        type: uploadType,
        created_at: new Date().toISOString(),
        is_mine: true,
        read_status: 'sending',
        reply: window.appState.replyingTo ? { ...window.appState.replyingTo } : null,
        attachment: {
            file_name: file.name,
            file_size: file.size,
            file_path: '',
            _isUploading: true,
            _progress: 0
        }
    };

    cancelReply();
    window.appState.messages.push(tempMsg);
    if (typeof window._appendMessages === 'function') {
        window._appendMessages([tempMsg]);
    }
    scrollToBottom(true);

    // 2. XHR with progress
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

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/file', true);
    xhr.setRequestHeader('X-CSRF-Token', document.querySelector('meta[name="csrf-token"]')?.content || '');

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            const wrapper = document.querySelector(`.message[data-id="${tempId}"]`);
            if (wrapper) {
                const bar = wrapper.querySelector('.upload-progress-bar');
                if (bar) bar.style.width = pct + '%';
                const pctText = wrapper.querySelector('.upload-progress-pct');
                if (pctText) pctText.textContent = pct + '%';
            }
        }
    };

    // Store xhr reference for cancel
    const cancelBtn = document.querySelector(`.message[data-id="${tempId}"] .upload-cancel-btn`);
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            xhr.abort();
            _removeTempUpload(tempId);
            showToast('Upload cancelled');
        });
    }

    xhr.onload = () => {
        _removeTempUpload(tempId);
        if (xhr.status >= 200 && xhr.status < 300) {
            try {
                const res = JSON.parse(xhr.responseText);
                if (res.success) {
                    if (!window.appState.activeConversationId && res.data.conversation_id) {
                        window.appState.activeConversationId = res.data.conversation_id;
                    }
                    // Trigger poll cycle to fetch the real server message
                    EventBus.emit('upload:complete', res.data);
                } else {
                    showToast(res.error || 'Upload failed', 'error');
                }
            } catch (_) {
                showToast('Upload failed — invalid response', 'error');
            }
        } else {
            showToast('Upload failed', 'error');
        }
    };

    xhr.onerror = () => {
        _removeTempUpload(tempId);
        showToast('Network error during upload', 'error');
    };

    xhr.send(formData);
}

function _removeTempUpload(id) {
    const el = document.querySelector(`.message[data-id="${id}"]`);
    if (el) el.closest('.message-wrapper')?.remove();
    window.appState.messages = window.appState.messages.filter(m => m.id !== id);
}

