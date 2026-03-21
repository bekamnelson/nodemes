// ==========================================
// 1. CONFIGURATION ET CONNEXION
// ==========================================
const socket = io();
const userId = localStorage.getItem("userId");

let receiver = null;
let replyTo = null;
let currentContact = null;
let editingMessageId = null; 
let messageToForward = null;
let selectedPeople = new Set();


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
    // 1. Cacher la barre d'input de recherche
    document.getElementById("searchBar").style.display = "none";
    
    // 2. VIDER ou CACHER le résultat de la recherche précédente (L'ajout est ici)
    const resultDiv = document.getElementById("searchResult");
    if(resultDiv) {
        resultDiv.style.display = "none";// Efface le contenu
        // OU  resultDiv.innerHTML = ""; 
    }
    document.getElementById("searchEmail").value = "";
    loadConversations();
}

function showContacts(){
    loadContacts();
    document.getElementById("searchBar").style.display = "flex";
    
    // S'assurer que le bloc de résultat peut à nouveau s'afficher
    const resultDiv = document.getElementById("searchResult");
    if(resultDiv) resultDiv.style.display = "block";
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
   
    if (data.sender === receiver || data.sender === userId) {
        addMessage(data);
    }
});

function formatTime(date){
    const d = new Date(date);
    return d.getHours().toString().padStart(2,'0') + ":" +
           d.getMinutes().toString().padStart(2,'0');
}

function addMessage(data) {
    const div = document.createElement("div");
    const isMe = data.sender == userId;
    div.id = `msg-${data._id}`;
    div.className = isMe ? "msg sent" : "msg received";

    let replyHTML = "";
    if (data.replyTo) {
        // --- LOGIQUE POUR LE NOM "MOI" ---
        // On récupère l'ID du sender du message original (replyTo.sender)
        // Note : Si tu as fait le populate côté backend, data.replyTo.sender peut être un objet.
        const originalSenderId = data.replyTo.sender._id || data.replyTo.sender;
        
        // Si l'ID original est le mien, j'affiche "Moi", sinon son username
        const displayName = (originalSenderId == userId) 
            ? "Moi" 
            : (data.replyTo.sender.username || "Utilisateur");

        replyHTML = `
        <div class="reply-preview">
            <small style="color: #00a884; font-weight: bold;">${displayName}</small>
            <p style="margin: 0; font-size: 0.85em; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${data.replyTo.message}
            </p>
        </div>`;
    }

 // On récupère le nom de l'expéditeur (pour l'afficher dans la preview)
const senderName = isMe ? "Vous" : (currentContact ? currentContact.username : "Utilisateur");

div.innerHTML = `
<div class="msg-container ${isMe ? 'sent' : 'received'}">
    <div class="msg-bubble" onclick="selectReply('${data._id}', '${data.message.replace(/'/g, "\\'")}', '${senderName}')">
        ${replyHTML}
        <div class="msg-text">${data.message}</div>
        <div class="msg-time">${formatTime(data.createdAt)}</div>
    </div>

    <div class="msg-options ${isMe ? 'left' : 'right'}" onclick="toggleMenu(this, event)"><i class="fas fa-chevron-down"></i></div>

    <div class="msg-menu ${isMe ? 'left' : 'right'}">
        <div onclick="selectReply('${data._id}', '${data.message.replace(/'/g, "\\'")}', '${senderName}')">Répondre</div>
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



document.getElementById('fileForm').addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = msgInput.value.trim();
    if (!msg || !receiver) return;

    // Sauvegarde de l'ID pour le traitement
    const currentEditId = editingMessageId;

    if (currentEditId) {
        // --- CAS : MODIFICATION ---
        // On réinitialise l'état d'édition TOUT DE SUITE pour éviter les doubles envois
        stopEditing(); 

        try {
            const res = await fetch("/editMessage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: currentEditId, newText: msg })
            });
            const data = await res.json();
            if (!data.success) {
                alert("Erreur lors de la modification");
                // Optionnel: on pourrait remettre le texte si ça échoue
            }
        } catch (err) {
            console.error("Erreur modification:", err);
        }
    } else {
        // --- CAS : ENVOYER NOUVEAU ---
        socket.emit("sendMessage", {
            sender: userId,
            receiver: receiver,
            message: msg,
            replyTo: replyTo
        });
        
        // Nettoyage immédiat
        msgInput.value = "";
        cancelReply();
    }
});
// --- 1. Mode Édition ---
function editMessage(id, oldText) {
    editingMessageId = id; 
    replyTo = null; 
    
    // On cache la preview de réponse si elle existe
    document.getElementById("replyPreview").style.display = "flex";
    document.getElementById("replyUser").innerText = "Modifier le message";
    document.getElementById("replyText").innerText = oldText;
    
    // Style visuel pour l'édition
    document.getElementById("replyPreview").style.borderLeftColor = "#ffca28"; 
    msgInput.value = oldText;
    msgInput.style.backgroundColor = "#fff9c4"; 
    msgInput.focus();
}

function stopEditing() {
    editingMessageId = null;
    msgInput.value = "";
    msgInput.style.backgroundColor = "";
    document.getElementById("replyPreview").style.display = "none";
    document.getElementById("replyPreview").style.borderLeftColor = "#00a884"; // On remet le vert
}

// --- 2. Mode Réponse ---
function selectReply(id, text, username) {
    // Si on était en train de modifier, on annule proprement avant de répondre
    editingMessageId = null; 
    
    replyTo = id;
    document.getElementById("replyUser").innerText = username || "Utilisateur";
    document.getElementById("replyText").innerText = text;
    
    const preview = document.getElementById("replyPreview");
    preview.style.display = "flex";
    preview.style.borderLeftColor = "#00a884";
    msgInput.style.backgroundColor = ""; // On enlève le jaune si présent
    msgInput.focus();
}

function cancelReply() {
    replyTo = null;
    stopEditing(); // Utilise stopEditing qui gère déjà le nettoyage UI
}


function toggleMenu(el, event){
    event.stopPropagation();
    document.querySelectorAll(".msg-menu").forEach(m => m.style.display = "none");
    const menu = el.parentElement.querySelector(".msg-menu");
    if(menu) menu.style.display = "block";
}



// --- 3. Actions API ---
async function deleteMessage(id){
    if(!confirm("Supprimer ce message ?")) return;
    await fetch("/deleteMessage", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ id })
    });
}

async function forwardMessage(messageId) {
    messageToForward = messageId;
    selectedPeople.clear(); // On vide la sélection précédente
    updateForwardUI();

    const modal = document.getElementById("forwardModal");
    const listDiv = document.getElementById("forwardContactList");
    
    modal.style.display = "flex";
    listDiv.innerHTML = "<p style='padding:10px'>Chargement...</p>";

    const res = await fetch("/contacts/" + userId);
    const data = await res.json();

    if (data.success) {
        listDiv.innerHTML = "";
        data.contacts.forEach(contact => {
            const item = document.createElement("div");
            item.className = "contact-transfer-item";
            item.setAttribute("data-id", contact._id);
            
            item.innerHTML = `
                <input type="checkbox" id="chk-${contact._id}" style="margin-right: 10px;">
                <img src="${contact.profilePic || '/images/noprofil.png'}" style="width:30px; height:30px; border-radius:50%">
                <span>${contact.username}</span>
            `;

            item.onclick = (e) => {
                // Empêcher le clic sur la checkbox de déclencher deux fois l'événement
                if(e.target.type !== 'checkbox') {
                    const cb = item.querySelector('input');
                    cb.checked = !cb.checked;
                }
                
                togglePersonSelection(contact._id, item);
            };

            listDiv.appendChild(item);
        });
    }
}

function togglePersonSelection(id, element) {
    if (selectedPeople.has(id)) {
        selectedPeople.delete(id);
        element.classList.remove('selected');
    } else {
        selectedPeople.add(id);
        element.classList.add('selected');
    }
    updateForwardUI();
}

function updateForwardUI() {
    const count = selectedPeople.size;
    document.getElementById("selectedCount").innerText = `${count} sélectionné(s)`;
    document.getElementById("confirmForward").disabled = (count === 0);
}

document.getElementById("confirmForward").onclick = async () => {
    if (!messageToForward || selectedPeople.size === 0) return;

    const targets = Array.from(selectedPeople);
    
    for (const targetId of targets) {
        try {
            const res = await fetch("/forwardMessage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    id: messageToForward, 
                    newReceiver: targetId 
                })
            });

            const data = await res.json();

            // VERIFICATION : On n'affiche que si le serveur a renvoyé le message
            if (data.success && data.message) {
                if (targetId === receiver || targetId === userId) {
                    addMessage(data.message);
                }
            } else if (!data.message) {
                console.error("Le serveur n'a pas renvoyé l'objet message pour le transfert.");
                // Si le serveur ne renvoie rien, on recharge juste la page ou la discussion
                loadMessages(receiver); 
            }
        } catch (err) {
            console.error("Erreur transfert vers " + targetId, err);
        }
    }

    closeForwardModal();
};

function closeForwardModal() {
    document.getElementById("forwardModal").style.display = "none";
    messageToForward = null;
    selectedPeople.clear();
}

socket.on("messageEdited", (data) => {
    const msgDiv = document.getElementById(`msg-${data.id}`);
    if (msgDiv) {
        const textElement = msgDiv.querySelector(".msg-text");
        if (textElement) {
            textElement.innerText = data.newText;
            // On peut ajouter une petite mention "(modifié)"
            if (!textElement.innerHTML.includes("small")) {
                textElement.innerHTML += ' <small style="font-size:0.7em; opacity:0.5;">(modifié)</small>';
            }
        }
    }
});

// 1. Pour le "Soft Delete" (Premier clic)
socket.on("messageSoftDeleted", (data) => {
    const msgDiv = document.getElementById(`msg-${data.id}`);
    if (msgDiv) {
        const textElement = msgDiv.querySelector(".msg-text");
        if (textElement) {
            textElement.innerText = data.text;
            textElement.style.fontStyle = "italic";
            textElement.style.opacity = "0.6";
        }
    }
});

// 2. Pour le "Hard Delete" (Deuxième clic)
socket.on("messageHardDeleted", (id) => {
    const msgDiv = document.getElementById(`msg-${id}`);
    if (msgDiv) {
        msgDiv.remove(); // Disparaît complètement de l'écran
    }
});
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
async function loadConversations() {
    const res = await fetch("/conversations/" + userId);
    const data = await res.json();
    if (!data.success) return;

    const contactsDiv = document.getElementById("contactsList");
    contactsDiv.innerHTML = "<h3 style='padding:10px'>Messages</h3>";

    for (let id in data.conversations) {
        const conv = data.conversations[id];
        
        // --- LOGIQUE D'AFFICHAGE DU NOM OU DE L'EMAIL ---
        // Si conv.username existe (donc c'est un contact), on le prend.
        // Sinon, on affiche son email (conv.email).
        const displayName = conv.username ? conv.username : conv.email;
        
        const div = document.createElement("div");
        div.className = "chat-item";
        div.innerHTML = `
            <img src="${conv.profilePic || "/images/noprofil.png"}">
            <div class="chat-info">
                <h4>${displayName}</h4>
                <p style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">
                    ${conv.lastMessage}
                </p>
            </div>
            ${conv.unread > 0 ? `<div class="badge">${conv.unread}</div>` : ""}`;


   
        div.onclick = async () => {
            receiver = id;
            const resUser = await fetch("/user/" + id);
            const dataUser = await resUser.json();
            
            setChatHeader(dataUser.user);
            loadMessages(receiver);
              // 2. Supprimer visuellement le badge immédiatement pour la fluidité (UX)
    const badge = div.querySelector(".badge");
    if (badge) badge.remove();
            // Marquer comme lu
            await fetch("/markSeen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, receiver })
            });
             // Optionnel : Émettre un socket pour informer le serveur en temps réel
    socket.emit("readMessages", { from: id, to: userId });


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

socket.on("updateBadge", (data) => {
    // data contient généralement { senderId, count }
    const contactElement = document.querySelector(`.chat-item[onclick*="${data.senderId}"]`);
    if (contactElement) {
        let badge = contactElement.querySelector(".badge");
        
        if (data.count > 0) {
            if (!badge) {
                // Créer le badge s'il n'existe pas encore
                badge = document.createElement("div");
                badge.className = "badge";
                contactElement.appendChild(badge);
            }
            badge.innerText = data.count;
            badge.style.display = "flex";
        } else if (badge) {
            badge.style.display = "none";
        }
    }
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
    const theme = localStorage.getItem("theme");
if(theme === "dark"){
document.body.classList.add("dark");
}
};



function openSettings(){

// afficher page paramètres
document.getElementById("settingsPage").style.display = "block";

// cacher éléments
document.querySelector(".messages-area").style.display = "none";
document.querySelector(".input-area").style.display = "none";
document.querySelector(".chat-header").style.display = "none";

// 🔥 MOBILE ONLY
if(window.innerWidth <= 768){

document.querySelector(".sidebar").style.display = "none";

const mainChat = document.querySelector(".main-chat");
mainChat.style.display = "flex";
mainChat.style.width = "100%";

}

}
function closeSettings(){

document.querySelector(".messages-area").style.display = "flex";
document.querySelector(".input-area").style.display = "flex";

document.getElementById("settingsPage").style.display = "none";

}

function toggleTheme() {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    
    // Optionnel : Changer l'icône du bouton si tu en as un (Lune/Soleil)
    const btnIcon = document.querySelector("#themeBtn i");
    if(btnIcon) {
        btnIcon.className = isDark ? "fas fa-sun" : "fas fa-moon";
    }
}


function logout(){

localStorage.removeItem("userId");

window.location.href = "login.html";

}