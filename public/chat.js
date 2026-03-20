// ==========================================
// 1. CONFIGURATION ET CONNEXION
// ==========================================
const socket = io();
const userId = localStorage.getItem("userId");

let receiver = null;
let replyTo = null;
let currentContact = null;

const sidebar = document.querySelector('.sidebar');
const mainChat = document.querySelector('.main-chat');
const backBtn = document.getElementById('back-to-list');
const messagesDiv = document.querySelector(".messages-area");
const msgInput = document.getElementById("msgInput");
const replyPreview = document.getElementById("replyPreview");

if (!userId) {
    alert("Reconnecte-toi !");
    window.location.href = "login.html";
} else {
    socket.emit("join", userId);
}

// ==========================================
// 2. TES FONCTIONS DE NAVIGATION (EXACTES)
// ==========================================

function showConversations(){
    // cacher la barre de recherche
    document.getElementById("searchBar").style.display = "none";
    loadConversations();
}

function showContacts(){
    loadContacts();
    document.getElementById("searchBar").style.display = "flex";
}

// ==========================================
// 3. GESTION DES CONTACTS (RECHERCHE ET AJOUT)
// ==========================================

async function searchUser() {
    const email = document.getElementById("searchEmail").value;
    const resultDiv = document.getElementById("searchResult");

    const res = await fetch("/searchUser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (!data.success) {
        resultDiv.innerHTML = "Utilisateur introuvable";
        return;
    }

    const user = data.user;
    resultDiv.innerHTML = `
        <div class="chat-item">
            <img src="${user.profilePic}">
            <div class="chat-info">
                <h4>${user.username}</h4>
                <p>${user.email}</p>
            </div>
            <button onclick="addContact('${user._id}')">Ajouter</button>
        </div>
    `;
}

async function addContact(contactId) {
    const res = await fetch("/addContact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, contactId })
    });

    const data = await res.json();
    if (data.success) {
        alert("Contact ajouté !");
        loadContacts(); 
    }
}

// ==========================================
// 4. GESTION DES MESSAGES (SOCKET & RENDU)
// ==========================================

socket.on("receiveMessage", (data) => {
    if (data.sender !== userId) {
        addMessage(data);
    }
});

function formatTime(date){
    const d = new Date(date);
    return d.getHours().toString().padStart(2,'0') + ":" +
           d.getMinutes().toString().padStart(2,'0');
}

function addMessage(data){
    const div = document.createElement("div");
    const isMe = data.sender == userId;

    div.className = isMe ? "msg sent" : "msg received";

    let replyHTML = "";
    if(data.replyTo){
        replyHTML = `
        <div class="reply-preview">
            <small>${data.replyTo.sender}</small>
            <p>${data.replyTo.message}</p>
        </div>`;
    }

    div.innerHTML = `
    <div class="msg-container ${isMe ? 'sent' : 'received'}">
        <div class="msg-bubble" onclick="selectReply('${data._id}', '${data.message.replace(/'/g, "\\'")}')">
            ${replyHTML}
            <div class="msg-text">${data.message}</div>
            <div class="msg-time">${formatTime(data.createdAt)}</div>
        </div>

        <div class="msg-options ${isMe ? 'left' : 'right'}" onclick="toggleMenu(this, event)">⋮</div>

        <div class="msg-menu ${isMe ? 'left' : 'right'}">
            <div onclick="replyMessage('${data._id}')">Répondre</div>
            <div onclick="editMessage('${data._id}', '${data.message.replace(/'/g, "\\'")}')">Modifier</div>
            <div onclick="deleteMessage('${data._id}')">Supprimer</div>
            <div onclick="forwardMessage('${data._id}')">Transférer</div>
        </div>
    </div>`;

    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ==========================================
// 5. ACTIONS (RÉPONDRE, MODIFIER, SUPPRIMER)
// ==========================================

function selectReply(id, text){
    replyTo = id;
    replyPreview.innerHTML = `
    <div class="reply-box">
        Réponse à : ${text}
        <button onclick="cancelReply()">X</button>
    </div>`;
    replyPreview.style.display = "block";
}

function cancelReply(){
    replyTo = null;
    replyPreview.style.display = "none";
}

function replyMessage(messageId){
    replyTo = messageId;
    alert("Réponse activée");
}

function toggleMenu(el, event){
    event.stopPropagation();
    document.querySelectorAll(".msg-menu").forEach(m => m.style.display = "none");
    const menu = el.parentElement.querySelector(".msg-menu");
    if(menu) menu.style.display = "block";
}

async function editMessage(id, oldText){
    const newText = prompt("Modifier message :", oldText);
    if(!newText) return;
    await fetch("/editMessage", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ id, newText })
    });
}

async function deleteMessage(id){
    await fetch("/deleteMessage", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ id })
    });
}

async function forwardMessage(id){
    const newReceiver = prompt("ID du destinataire");
    await fetch("/forwardMessage", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ id, newReceiver })
    });
}

// ==========================================
// 6. CHARGEMENT DONNÉES (API)
// ==========================================

async function loadMessages(receiverId) {
    const res = await fetch(`/messages/${userId}/${receiverId}`);
    const data = await res.json();
    if (!data.success) return;

    messagesDiv.innerHTML = ""; 
    data.messages.forEach(msg => addMessage(msg));
}

async function loadContacts() {
    const res = await fetch("/contacts/" + userId);
    const data = await res.json();
    if (!data.success) return;

    const contactsDiv = document.getElementById("contactsList");
    contactsDiv.innerHTML = "<h3 style='padding:10px'>Contacts</h3>";

    data.contacts.forEach(contact => {
        const div = document.createElement("div");
        div.className = "chat-item";
        div.innerHTML = `
            <img src="${contact.profilePic}">
            <div class="chat-info">
                <h4>${contact.username}</h4>
                <p>${contact.email}</p>
            </div>`;

        div.onclick = () => {
            receiver = contact._id;
            setChatHeader(contact);
            loadMessages(receiver);
            if (window.innerWidth <= 768) {
                sidebar.style.display = 'none';
                mainChat.style.display = 'flex';
                mainChat.style.width = '100%';
            }
        };
        contactsDiv.appendChild(div);
    });
}

async function loadConversations(){
    const res = await fetch("/conversations/" + userId);
    const data = await res.json();
    if(!data.success) return;

    const contactsDiv = document.getElementById("contactsList");
    contactsDiv.innerHTML = "<h3 style='padding:10px'>Messages</h3>";

    for(let id in data.conversations){
        const conv = data.conversations[id];
        const div = document.createElement("div");
        div.className = "chat-item";
        div.innerHTML = `
            <img src="${conv.profilePic || "/images/noprofil.png"}">
            <div class="chat-info">
                <h4>${id}</h4>
                <p>${conv.lastMessage}</p>
            </div>
            ${conv.unread > 0 ? `<div class="badge">${conv.unread}</div>` : ""}`;

        div.onclick = async () => {
            receiver = id;
            const resUser = await fetch("/user/" + id);
            const dataUser = await resUser.json();
            setChatHeader(dataUser.user);
            loadMessages(receiver);
            await fetch("/markSeen", {
                method:"POST",
                headers:{ "Content-Type":"application/json" },
                body: JSON.stringify({ userId, receiver })
            });

            if (window.innerWidth <= 768) {
                sidebar.style.display = 'none';
                mainChat.style.display = 'flex';
                mainChat.style.width = '100%';
            }
        };
        contactsDiv.appendChild(div);
    }
}

// ==========================================
// 7. INITIALISATION ET ÉVÉNEMENTS
// ==========================================

function setChatHeader(contact){
    currentContact = contact;
    document.getElementById("chatUserName").innerText = contact.username;
    document.getElementById("chatUserImg").src = contact.profilePic || "/images/noprofil.png";
    document.getElementById("chatUserStatus").innerText = "offline";
    socket.emit("getStatus", contact._id);
}

document.getElementById('fileForm').addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = msgInput.value.trim();
    if(!msg || !receiver) return;

    socket.emit("sendMessage", {
        sender: userId,
        receiver: receiver,
        message: msg,
        replyTo: replyTo
    });

    addMessage({
        sender: userId,
        message: msg,
        createdAt: new Date(),
        replyTo: null
    });

    msgInput.value = "";
    cancelReply();
});

socket.on("userStatus", (data) => {
    if(currentContact && data.userId == currentContact._id){
        document.getElementById("chatUserStatus").innerText = (data.status === "online") ? "🟢 En ligne" : "⚫ Hors ligne";
    }
});

if (backBtn) {
    backBtn.addEventListener('click', () => {
        sidebar.style.display = 'flex';
        mainChat.style.display = 'none';
    });
}

document.addEventListener("click", () => {
    document.querySelectorAll(".msg-menu").forEach(m => m.style.display = "none");
});

window.onload = () => {
    showConversations();
};