// ---------------------------
// Global variables
// ---------------------------
const socket = io();
let botDivChat = null;
let stop_generation = false;
window.uploadedQAData = null;

// ---------------------------
// Sidebar Tab Switching
// ---------------------------
function showTab(tab) {
    document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
    document.getElementById(tab).classList.add("active");

    document.querySelectorAll(".sidebar ul li").forEach(li => li.classList.remove("active"));
    document.getElementById(tab + "Tab").classList.add("active");
}

// ---------------------------
// Chat Functions
// ---------------------------
function sendMessage() {
    const input = document.getElementById("message");
    const msg = input.value.trim();
    if (!msg) return;

    addMessage(msg, "user");
    toggleChatButtons(false);

    socket.emit("user_message", { message: msg });
    input.value = "";
}

function stopGeneration() {
    stop_generation = true;
    socket.emit("stop_generation");
    toggleChatButtons(true);
}

function toggleChatButtons(enabled) {
    document.getElementById("sendBtn").style.display = enabled ? "inline-block" : "none";
    document.getElementById("stopBtn").style.display = enabled ? "none" : "inline-block";
}

// ---------------------------
// Chat Socket Streaming
// ---------------------------
socket.on("bot_thinking", () => {
    botDivChat = createBotDiv("chat-messages");
    addTypingDots(botDivChat);
    scrollDown("chat-messages");
});

socket.on("bot_chunk", data => {
    if (!botDivChat) return;
    removeTypingDots(botDivChat);
    botDivChat.innerText += data.chunk;
    scrollDown("chat-messages");
});

socket.on("bot_done", () => {
    botDivChat = null;
    toggleChatButtons(true);
});

// ---------------------------
// Generic Helpers
// ---------------------------
function addMessage(text, sender, containerId = "chat-messages") {
    const chat = document.getElementById(containerId);
    const div = document.createElement("div");
    div.className = `message ${sender}`;
    div.innerText = text;
    chat.appendChild(div);
    scrollDown(containerId);
}

function scrollDown(containerId = "chat-messages") {
    const chat = document.getElementById(containerId);
    chat.scrollTop = chat.scrollHeight;
}

function createBotDiv(containerId) {
    const container = document.getElementById(containerId);
    const div = document.createElement("div");
    div.className = "message bot";
    container.appendChild(div);
    return div;
}

// ---------------------------
// Typing Dots Animation
// ---------------------------
function addTypingDots(div) {
    div.innerText = "";
    const dots = document.createElement("span");
    dots.className = "typing-dots";
    dots.innerText = "● ● ●";
    div.appendChild(dots);
}

function removeTypingDots(div) {
    const dots = div.querySelector(".typing-dots");
    if (dots) div.removeChild(dots);
}

// ---------------------------
// File Upload + Summarization / Q&A
// ---------------------------
function uploadFile(feature) {
    const fileInput = feature === "summarize" ? document.getElementById("fileInputSum") : document.getElementById("fileInputQA");
    const button = feature === "summarize" ? document.getElementById("uploadSumBtn") : document.getElementById("uploadQABtn");
    button.disabled = true;

    const file = fileInput.files[0];
    if (!file) { alert("Select a file first!"); button.disabled = false; return; }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("feature", feature);

    const outputDiv = feature === "summarize" ? document.getElementById("summaryOutput") : document.getElementById("qaOutput");
    outputDiv.innerHTML = "";
    addTypingDots(outputDiv);

    fetch("/upload_file", { method: "POST", body: formData })
        .then(res => res.json())
        .then(data => {
            removeTypingDots(outputDiv);
            if (feature === "summarize") {
                streamText(data.summary, outputDiv, button);
            } else if (feature === "qa") {
                window.uploadedQAData = data.text;
                document.getElementById("qaSection").style.display = "block";
                outputDiv.innerHTML = "File loaded! Ask a question now.";
                button.disabled = false;
            }
        })
        .catch(err => { console.error(err); button.disabled = false; removeTypingDots(outputDiv); });
}

// ---------------------------
// Ask Question on Uploaded File
// ---------------------------
async function askQuestion() {
    const question = document.getElementById("qaQuestion").value.trim();
    const button = document.getElementById("askQABtn");
    const outputDiv = document.getElementById("qaOutput");

    if (!question) return;
    if (!window.uploadedQAData) {
        alert("No file uploaded!");
        return;
    }

    button.disabled = true;
    outputDiv.innerHTML = "";
    addTypingDots(outputDiv);

    try {
        const response = await fetch("/ask-question", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: window.uploadedQAData,
                question: question
            })
        });

        const data = await response.json();
        removeTypingDots(outputDiv);

        // ChatGPT-style typing
        const words = data.answer.split(/\s+/);
        outputDiv.textContent = "";

        for (let word of words) {
            outputDiv.textContent += word + " ";
            outputDiv.scrollTop = outputDiv.scrollHeight;
            await new Promise(r => setTimeout(r, 30));
        }

    } catch (err) {
        console.error(err);
        outputDiv.textContent = "❌ Failed to generate answer.";
    }

    button.disabled = false;
}


// ---------------------------
// Streaming function simulating typing
// ---------------------------
async function streamText(fullText, outputDiv, button = null) {
    outputDiv.innerText = "";
    const words = fullText.split(" ");
    for (let i = 0; i < words.length; i++) {
        outputDiv.innerText += words[i] + " ";
        await new Promise(r => setTimeout(r, 30)); // simulate typing chunk
    }
    if (button) button.disabled = false;
}
