// 1. CONFIGURATION ET ÉTABLISSEMENT DE LA CONNEXION
const socket = io();
const userId = localStorage.getItem("userId");
let receiver = null;

if (!userId) {
    alert("Reconnecte-toi !");
    window.location.href = "login.html";
} else {
    // Rejoindre sa propre "room" pour recevoir les messages privés
    socket.emit("join", userId);
}

// ---------------------------------------------------------
// 2. GESTION DES MESSAGES (SOCKET ET AFFICHAGE)
// ---------------------------------------------------------

// ÉCOUTER les messages entrants en temps réel
socket.on("receiveMessage", (data) => {
    // On n'affiche que si le message vient de quelqu'un d'autre
    // (L'expéditeur l'affiche déjà via le submit du formulaire)
    if (data.sender !== userId) {
        addMessage(data);
    }
});

// FONCTION D'AFFICHAGE UNIQUE (utilisée par Socket, Load et Submit)
function addMessage(data) {
    const messagesDiv = document.querySelector(".messages-area");
    if (!messagesDiv) return;

    const div = document.createElement("div");
    const isMe = data.sender == userId;

    div.className = isMe ? "msg sent" : "msg received";
    div.innerHTML = `
        <div class="msg-bubble">
            ${data.message}
        </div>
    `;

    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// CHARGER L'HISTORIQUE des messages avec un contact
async function loadMessages(receiverId) {
    const res = await fetch(`/messages/${userId}/${receiverId}`);
    const data = await res.json();

    if (!data.success) return;

    const messagesDiv = document.querySelector(".messages-area");
    messagesDiv.innerHTML = ""; // Vider l'écran avant de charger l'historique

    data.messages.forEach(msg => {
        addMessage(msg);
    });
}

// ---------------------------------------------------------
// 3. GESTION DES CONTACTS (RECHERCHE ET CHARGEMENT)
// ---------------------------------------------------------

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
            <img src="https://i.pravatar.cc/150?u=${user.username}">
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

async function loadContacts() {
    const res = await fetch("/contacts/" + userId);
    const data = await res.json();

    if (!data.success) return;

    const contactsDiv = document.getElementById("contactsList");
    contactsDiv.innerHTML = ""; 

    data.contacts.forEach(contact => {
        const div = document.createElement("div");
        div.className = "chat-item";
        div.innerHTML = `
            <img src="https://i.pravatar.cc/150?u=${contact.username}">
            <div class="chat-info">
                <h4>${contact.username}</h4>
                <p>${contact.email}</p>
            </div>
        `;

        div.onclick = () => {
            receiver = contact._id;
            loadMessages(receiver); // Charger les anciens messages
        };

        contactsDiv.appendChild(div);
    });
}

// ---------------------------------------------------------
// 4. ENVOI DE MESSAGE
// ---------------------------------------------------------

const form = document.getElementById('fileForm');
form.addEventListener("submit", (e) => {
    e.preventDefault();

    const msgInput = document.getElementById("msgInput");
    const msg = msgInput.value.trim();

    if (!msg) return;
    if (!receiver) {
        alert("Choisis un contact");
        return;
    }

    // Envoyer au serveur via Socket
    socket.emit("sendMessage", {
        sender: userId,
        receiver: receiver,
        message: msg
    });

    // Affichage immédiat côté expéditeur
    addMessage({
        sender: userId,
        message: msg
    });

    msgInput.value = "";
});

// Lancer au chargement de la page
loadContacts();