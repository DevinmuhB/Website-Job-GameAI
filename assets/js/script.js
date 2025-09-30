let apiKey = '';
let conversationHistory = [];
let isProcessing = false;
let uploadedFiles = [];

function loadApiKey() {
    const saved = sessionStorage.getItem('gemini_api_key');
    if (saved) {
        apiKey = saved;
        document.getElementById('apiSetup').style.display = 'none';
        document.getElementById('welcomeScreen').style.display = 'flex';
        document.getElementById('sendBtn').disabled = false;
        updateStatus(true);
    }
}

function saveApiKey() {
    const input = document.getElementById('apiKeyInput');
    if (input.value.trim()) {
        apiKey = input.value.trim();
        sessionStorage.setItem('gemini_api_key', apiKey);
        document.getElementById('apiSetup').style.display = 'none';
        document.getElementById('welcomeScreen').style.display = 'flex';
        document.getElementById('sendBtn').disabled = false;
        updateStatus(true);
    } else {
        alert('Masukkan API key yang valid');
    }
}

function updateStatus(connected) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (connected) {
        dot.classList.add('connected');
        text.textContent = 'API Connected';
    } else {
        dot.classList.remove('connected');
        text.textContent = 'API Not Connected';
    }
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function sendExample(text) {
    document.getElementById('messageInput').value = text;
    sendMessage();
}

function newChat() {
    conversationHistory = [];
    uploadedFiles = [];
    document.getElementById('messages').innerHTML = '';
    document.getElementById('welcomeScreen').style.display = 'flex';
    document.getElementById('messageInput').value = '';
    document.getElementById('filePreview').innerHTML = '';
}

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileType = file.type;
    const fileName = file.name;

    // Check file type
    if (fileType.startsWith('image/')) {
        const base64 = await fileToBase64(file);
        uploadedFiles.push({
            type: 'image',
            name: fileName,
            mimeType: fileType,
            data: base64
        });
        showFilePreview(fileName, 'image', base64);
    } else if (fileType.startsWith('video/')) {
        const base64 = await fileToBase64(file);
        uploadedFiles.push({
            type: 'video',
            name: fileName,
            mimeType: fileType,
            data: base64
        });
        showFilePreview(fileName, 'video', URL.createObjectURL(file));
    } else if (fileType === 'application/pdf' || fileType.includes('document') || fileType === 'text/plain') {
        const text = await fileToText(file);
        uploadedFiles.push({
            type: 'document',
            name: fileName,
            mimeType: fileType,
            data: text
        });
        showFilePreview(fileName, 'document', null);
    }

    // Reset input
    event.target.value = '';
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function fileToText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function showFilePreview(fileName, type, data) {
    const previewDiv = document.getElementById('filePreview');
    const item = document.createElement('div');
    item.className = 'file-preview-item';

    let content = '';
    if (type === 'image') {
        content = `<img src="data:image/jpeg;base64,${data}" alt="${fileName}">`;
    } else if (type === 'video') {
        content = `<video src="${data}" controls style="max-width: 100px; max-height: 60px;"></video>`;
    } else if (type === 'document') {
        content = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
        </svg>`;
    }

    item.innerHTML = `
        ${content}
        <span>${fileName}</span>
        <span class="remove-file" onclick="removeFile(${uploadedFiles.length - 1})">×</span>
    `;

    previewDiv.appendChild(item);
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    const previewDiv = document.getElementById('filePreview');
    previewDiv.children[index].remove();
}

async function sendMessage() {
    if (isProcessing || !apiKey) return;

    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message && uploadedFiles.length === 0) return;

    isProcessing = true;
    document.getElementById('sendBtn').disabled = true;
    document.getElementById('welcomeScreen').style.display = 'none';

    // tampilkan pesan user di UI
    addMessage(message, 'user', uploadedFiles);
    input.value = '';
    input.style.height = 'auto';

    // tampilkan loading
    const loadingId = addLoadingMessage();

    // system prompt
    let systemPrompt = `Kamu adalah asisten AI yang membantu pengguna dengan dua topik utama:
1. Informasi lowongan pekerjaan - memberikan info tentang lowongan kerja, tips karir, pembuatan CV, persiapan interview, analisis CV, dll.
2. Informasi game - memberikan rekomendasi game, tips bermain, review game, analisis gameplay dari screenshot/video, dll.

Berikan jawaban yang informatif, ramah, dan membantu. Gunakan bahasa Indonesia yang baik dan mudah dipahami.`;

    // build content parts
    let contentParts = [];

    for (let file of uploadedFiles) {
        if (file.type === 'document') {
            systemPrompt += `\n\nUser mengupload CV/dokumen. Analisis dokumen ini untuk memahami latar belakang pendidikan, pengalaman kerja, dan skill user.`;
            contentParts.push({ text: `Isi dokumen:\n\n${file.data}` });
        } else if (file.type === 'image') {
            systemPrompt += `\n\nUser mengupload screenshot/foto game. Analisis gambar untuk mengidentifikasi game dan beri tips.`;
            contentParts.push({
                inlineData: { mimeType: file.mimeType, data: file.data }
            });
        } else if (file.type === 'video') {
            systemPrompt += `\n\nUser mengupload video gameplay. Analisis video dan berikan feedback.`;
            contentParts.push({
                inlineData: { mimeType: file.mimeType, data: file.data }
            });
        }
    }

    if (message) {
        contentParts.push({ text: message });
    }

    try {
        const modelName = uploadedFiles.some(f => f.type === 'image' || f.type === 'video')
            ? "gemini-2.0-flash"
            : "gemini-2.0-flash";

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        { role: "user", parts: [{ text: systemPrompt }] },
                        ...conversationHistory,
                        { role: "user", parts: contentParts }
                    ],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 2048
                    }
                })
            }
        );

        removeLoadingMessage(loadingId);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log("API response:", data);

        const assistantMessage = data?.candidates?.[0]?.content?.parts?.[0]?.text
            || "⚠️ AI tidak mengirim respons.";

        // simpan ke history
        conversationHistory.push({ role: "user", parts: contentParts });
        conversationHistory.push({ role: "model", parts: [{ text: assistantMessage }] });

        // tampilkan di UI dengan format rapih
        addMessage(assistantMessage, "assistant");

    } catch (error) {
        console.error(error);
        removeLoadingMessage(loadingId);
        addMessage("⚠️ Terjadi kesalahan saat menghubungi AI.", "ai");
    }

    // reset
    uploadedFiles = [];
    document.getElementById('filePreview').innerHTML = '';
    isProcessing = false;
    document.getElementById('sendBtn').disabled = false;
    input.focus();
}        

function addMessage(text, type, files) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const avatar = document.createElement('div');
    avatar.className = `avatar ${type}`;
    avatar.textContent = type === 'user' ? 'U' : 'AI';

    const content = document.createElement('div');
    content.className = 'message-content';
    
    let fileHTML = '';
    if (files && files.length > 0) {
        fileHTML = '<div class="attachment-preview">';
        for (let file of files) {
            if (file.type === 'image') {
                fileHTML += `<div class="attachment-item"><img src="data:${file.mimeType};base64,${file.data}" alt="${file.name}"></div>`;
            } else if (file.type === 'video') {
                fileHTML += `<div class="attachment-item"><video src="data:${file.mimeType};base64,${file.data}" controls></video></div>`;
            } else if (file.type === 'document') {
                fileHTML += `<div class="attachment-item">📄 ${file.name}</div>`;
            }
        }
        fileHTML += '</div>';
    }

    content.innerHTML = fileHTML + (text ? formatMessage(text) : '');

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    messagesDiv.appendChild(messageDiv);

    const chatContainer = document.getElementById('chatContainer');
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addLoadingMessage() {
    const id = "loading-" + Date.now(); // bikin ID unik
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    messageDiv.id = id;

    const avatar = document.createElement('div');
    avatar.className = 'avatar assistant';
    avatar.textContent = 'AI';

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = '<div class="loading"><span></span><span></span><span></span></div>';

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    messagesDiv.appendChild(messageDiv);

    const chatContainer = document.getElementById('chatContainer');
    chatContainer.scrollTop = chatContainer.scrollHeight;

    return id; // balikin ID biar bisa dihapus nanti
}        

function removeLoadingMessage(id) {
    const loadingMsg = document.getElementById(id);
    if (loadingMsg) {
        loadingMsg.remove();
    }
}

function formatMessage(text) {
    // Simple formatting for better readability
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/`(.*?)`/g, '<code>$1</code>');
    text = text.replace(/\n/g, '<br>');
    return text;
}
async function fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
      const res = await fetch(url, options);
      if (res.status !== 503) return res;
      await new Promise(r => setTimeout(r, 2000)); // tunggu 2 detik
    }
    throw new Error("Service Unavailable after retries");
  }
  
// Initialize
loadApiKey();