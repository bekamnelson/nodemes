// ============================================================
// PIXICHAT — chat.js
// All bugs fixed, clean architecture, Dexie offline support
// ============================================================

// --- 1. INIT ---
const userId = localStorage.getItem("userId");
if (!userId) { window.location.href = "/login.html"; }

// Load saved profile for nav avatar
const savedProfile = JSON.parse(localStorage.getItem("userProfile") || "{}");
if (savedProfile.profilePic) {
  const navPic = document.getElementById("navProfilePic");
  if (navPic) navPic.src = savedProfile.profilePic;
}

// Apply theme
if (localStorage.getItem("theme") === "dark") document.body.classList.add("dark");

const socket = io(SERVER_URL);
socket.emit("join", userId);

// --- 2. STATE ---
let receiver = null;         // current open conversation target id
let replyToId = null;        // id of message being replied to
let editingId = null;        // id of message being edited
let messageToForward = null; // id of message to forward
let currentContact = null;   // current contact object
let selectedForward = new Set();
let currentMode = "conversations"; // "conversations" | "contacts"
let ctxTargetId = null;      // id of message for context menu
let ctxIsOwn = false;        // whether ctx message belongs to userId

// --- 3. DEXIE DB ---
const db = new Dexie("PixiChatDB");
db.version(2).stores({
  messages: "_id, sender, receiver, createdAt, status",
  contacts: "_id, username, profilePic"
});

// --- 4. SOCKET EVENTS ---
socket.on("receiveMessage", async (msg) => {
  try {
    // normalize _id
    if (!msg._id && msg.id) msg._id = String(msg.id);
    await db.messages.put(msg);
  } catch (e) { /* ignore dexie duplicate */ }

  if (msg.sender === receiver || msg.receiver === receiver || msg.sender === userId) {
    if (
      (msg.sender === receiver && msg.receiver === userId) ||
      (msg.sender === userId && msg.receiver === receiver)
    ) {
      appendMessage(msg);
    }
  } else {
    // Notification for messages from other conversations
    showToast(`💬 Nouveau message`, "");
    // Refresh conversation list badge
    loadConversations();
  }
});

socket.on("messageEdited", ({ id, newText }) => {
  const el = document.querySelector(`[data-msg-id="${id}"] .bubble-text`);
  if (el) {
    el.textContent = newText;
    const bubble = document.querySelector(`[data-msg-id="${id}"] .bubble`);
    if (bubble && !bubble.querySelector(".edited-tag")) {
      const tag = document.createElement("span");
      tag.className = "edited-tag";
      tag.textContent = "(modifié)";
      bubble.appendChild(tag);
    }
  }
});

socket.on("messageSoftDeleted", ({ id, text }) => {
  const el = document.querySelector(`[data-msg-id="${id}"] .bubble`);
  if (el) {
    const textEl = el.querySelector(".bubble-text");
    if (textEl) textEl.textContent = text;
    el.classList.add("deleted");
  }
});

socket.on("messageHardDeleted", (id) => {
  const el = document.querySelector(`[data-msg-id="${id}"]`);
  if (el) el.remove();
});

socket.on("userStatus", ({ userId: uid, status }) => {
  if (currentContact && uid === currentContact._id) {
    updateStatusUI(status);
  }
});

// --- 5. SEND MESSAGE ---
document.getElementById("msgInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

async function sendMessage() {
  const text = document.getElementById("msgInput").value.trim();
  const fileInput = document.getElementById("fileInput");
  const hasFile = fileInput.files && fileInput.files[0];

  if (!receiver) return showToast("Sélectionnez une conversation", "error");
  if (!text && !hasFile) return;

  // --- EDIT MODE ---
  if (editingId) {
    const idToEdit = editingId;
    cancelReply(); // resets both edit and reply state

    if (navigator.onLine) {
      try {
        await fetch(`${SERVER_URL}/editMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: idToEdit, newText: text })
        });
      } catch (e) { showToast("Erreur modification", "error"); }
    }
    document.getElementById("msgInput").value = "";
    return;
  }

  // --- FILE UPLOAD ---
  if (hasFile) {
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append("sender", userId);
    formData.append("receiver", receiver);
    formData.append("message", text || "");
    clearFile();
    document.getElementById("msgInput").value = "";
    try {
      await fetch(`${SERVER_URL}/upload`, { method: "POST", body: formData });
    } catch (e) { showToast("Erreur envoi fichier", "error"); }
    return;
  }

  // --- NEW MESSAGE ---
  const msgData = {
    sender: userId,
    receiver: receiver,
    message: text,
    replyTo: replyToId || null,
    createdAt: new Date().toISOString(),
  };

  document.getElementById("msgInput").value = "";
  cancelReply();

  if (navigator.onLine) {
    socket.emit("sendMessage", msgData);
  } else {
    // Store locally with pending status
    const localId = "local_" + Date.now();
    const localMsg = { ...msgData, _id: localId, status: "pending" };
    await db.messages.put(localMsg);
    appendMessage(localMsg);
  }
}

// --- 6. RENDER MESSAGE ---
function appendMessage(msg) {
  const area = document.getElementById("messagesArea");
  if (!area) return;

  // Avoid duplicates
  if (document.querySelector(`[data-msg-id="${msg._id}"]`)) return;

  const isOut = msg.sender === userId || String(msg.sender) === userId;

  // Day separator
  const msgDate = new Date(msg.createdAt).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" });
  const lastSep = area.querySelector(".day-sep:last-of-type");
  if (!lastSep || lastSep.dataset.date !== msgDate) {
    const sep = document.createElement("div");
    sep.className = "day-sep";
    sep.dataset.date = msgDate;
    sep.textContent = msgDate;
    area.appendChild(sep);
  }

  const row = document.createElement("div");
  row.className = `msg-row ${isOut ? "out" : "in"}`;
  row.dataset.msgId = msg._id;

  // Reply HTML
  let replyHTML = "";
  if (msg.replyTo) {
    const rt = msg.replyTo;
    const rtSenderId = (rt.sender && rt.sender._id) ? rt.sender._id : String(rt.sender);
    const rtName = rtSenderId === userId ? "Vous" : (rt.sender && rt.sender.username ? rt.sender.username : "Utilisateur");
    const rtText = document.createElement("div");
    rtText.textContent = rt.message || "";
    replyHTML = `
      <div class="bubble-reply">
        <div class="reply-who">${escapeHtml(rtName)}</div>
        <div class="reply-txt">${escapeHtml(rt.message || "")}</div>
      </div>`;
  }

  // Forwarded
  const fwdHTML = msg.isForwarded
    ? `<div class="forwarded-tag"><i class="fas fa-share"></i> Transféré</div>`
    : "";

  // File
  let fileHTML = "";
  if (msg.file) {
    const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(msg.file);
    if (isImage) {
      fileHTML = `<img src="${msg.file}" style="max-width:200px;border-radius:10px;margin-top:6px;cursor:pointer" onclick="window.open('${msg.file}','_blank')">`;
    } else {
      const fname = msg.file.split("/").pop().split("?")[0];
      fileHTML = `<a class="bubble-file" href="${msg.file}" target="_blank"><i class="fas fa-file-alt"></i>${escapeHtml(fname)}</a>`;
    }
  }

  // Text
  const textDiv = msg.deleted
    ? `<span class="bubble-text" style="font-style:italic;opacity:0.7">${escapeHtml(msg.message || "🚫 Message supprimé")}</span>`
    : `<span class="bubble-text">${escapeHtml(msg.message || "")}</span>`;

  const editedTag = msg.edited ? `<span class="edited-tag">(modifié)</span>` : "";
  const pendingIcon = msg.status === "pending" ? `<i class="fas fa-clock" style="font-size:0.65rem;opacity:0.5"></i>` : "";
  const time = formatTime(msg.createdAt);

  row.innerHTML = `
    <div class="msg-wrap">
      <div class="bubble ${msg.deleted ? "deleted" : ""}">
        ${fwdHTML}
        ${replyHTML}
        ${textDiv}${editedTag}
        ${fileHTML}
        <div class="msg-meta">${time} ${pendingIcon}</div>
      </div>
    </div>`;

  // Right-click / long-press context menu
  row.addEventListener("contextmenu", (e) => { e.preventDefault(); openCtxMenu(e, msg, isOut); });
  row.querySelector(".bubble").addEventListener("click", (e) => {
    // Single tap = select reply
    openCtxMenu(e, msg, isOut, true);
  });

  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}

// --- 7. CONTEXT MENU ---
function openCtxMenu(e, msg, isOut, fromClick = false) {
  if (fromClick) {
    // On click, just set reply directly for speed
    setReply(msg._id, msg.message, isOut ? "Vous" : (currentContact ? currentContact.username : "Utilisateur"));
    return;
  }

  ctxTargetId = msg._id;
  ctxIsOwn = isOut;

  const menu = document.getElementById("ctxMenu");
  document.getElementById("ctxEdit").style.display = isOut && !msg.deleted ? "flex" : "none";

  menu.style.display = "block";
  const x = Math.min(e.clientX, window.innerWidth - 180);
  const y = Math.min(e.clientY, window.innerHeight - 160);
  menu.style.left = x + "px";
  menu.style.top = y + "px";
}

document.getElementById("ctxReply").onclick = () => {
  const el = document.querySelector(`[data-msg-id="${ctxTargetId}"] .bubble-text`);
  const text = el ? el.textContent : "";
  const name = ctxIsOwn ? "Vous" : (currentContact ? currentContact.username : "Utilisateur");
  setReply(ctxTargetId, text, name);
  closeCtxMenu();
};

document.getElementById("ctxEdit").onclick = () => {
  const el = document.querySelector(`[data-msg-id="${ctxTargetId}"] .bubble-text`);
  if (el) setEdit(ctxTargetId, el.textContent);
  closeCtxMenu();
};

document.getElementById("ctxDelete").onclick = () => {
  deleteMessage(ctxTargetId);
  closeCtxMenu();
};

document.getElementById("ctxForward").onclick = () => {
  openForwardModal(ctxTargetId);
  closeCtxMenu();
};

function closeCtxMenu() {
  document.getElementById("ctxMenu").style.display = "none";
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".ctx-menu")) closeCtxMenu();
});

// --- 8. REPLY & EDIT STATE ---
function setReply(id, text, name) {
  // Cancel any edit first
  editingId = null;
  replyToId = id;

  const bar = document.getElementById("replyBar");
  bar.style.display = "flex";
  bar.classList.remove("edit-mode");
  document.getElementById("replyBarName").textContent = name;
  document.getElementById("replyBarText").textContent = text;
  document.getElementById("msgInput").focus();
}

function setEdit(id, oldText) {
  // Cancel any reply first
  replyToId = null;
  editingId = id;

  const bar = document.getElementById("replyBar");
  bar.style.display = "flex";
  bar.classList.add("edit-mode");
  document.getElementById("replyBarName").textContent = "Modifier le message";
  document.getElementById("replyBarText").textContent = oldText;
  document.getElementById("msgInput").value = oldText;
  document.getElementById("msgInput").focus();
}

function cancelReply() {
  replyToId = null;
  editingId = null;
  document.getElementById("replyBar").style.display = "none";
  document.getElementById("replyBar").classList.remove("edit-mode");
  document.getElementById("msgInput").value = "";
}

// --- 9. DELETE ---
async function deleteMessage(id) {
  if (!confirm("Supprimer ce message ?")) return;
  try {
    await fetch(`${SERVER_URL}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
  } catch (e) { showToast("Erreur suppression", "error"); }
}

// --- 10. FORWARD ---
function openForwardModal(msgId) {
  messageToForward = msgId;
  selectedForward.clear();
  updateForwardCount();

  const modal = document.getElementById("forwardModal");
  const list = document.getElementById("forwardList");
  modal.style.display = "flex";
  list.innerHTML = "<p style='padding:16px;color:var(--text2);text-align:center'>Chargement...</p>";

  fetch(`${SERVER_URL}/contacts/${userId}`)
    .then(r => r.json())
    .then(data => {
      list.innerHTML = "";
      if (!data.contacts || data.contacts.length === 0) {
        list.innerHTML = "<p style='padding:16px;color:var(--text2);text-align:center'>Aucun contact</p>";
        return;
      }
      data.contacts.forEach(c => {
        const item = document.createElement("div");
        item.className = "forward-contact-item";
        item.dataset.id = c._id;
        item.innerHTML = `
          <img src="${c.profilePic || '/images/noprofil.png'}" class="avatar">
          <span>${escapeHtml(c.username)}</span>
          <i class="fas fa-check-circle chk-icon" style="display:none"></i>`;
        item.onclick = () => toggleForwardSelect(c._id, item);
        list.appendChild(item);
      });
    })
    .catch(() => { list.innerHTML = "<p style='padding:16px;color:var(--danger)'>Erreur chargement</p>"; });
}

function toggleForwardSelect(id, el) {
  if (selectedForward.has(id)) {
    selectedForward.delete(id);
    el.classList.remove("selected");
    el.querySelector(".chk-icon").style.display = "none";
  } else {
    selectedForward.add(id);
    el.classList.add("selected");
    el.querySelector(".chk-icon").style.display = "inline";
  }
  updateForwardCount();
}

function updateForwardCount() {
  const n = selectedForward.size;
  document.getElementById("forwardCount").textContent = `${n} sélectionné(s)`;
  document.getElementById("confirmForwardBtn").disabled = n === 0;
}

async function confirmForward() {
  if (!messageToForward || selectedForward.size === 0) return;
  const targets = Array.from(selectedForward);
  let ok = 0;
  for (const targetId of targets) {
    try {
      const res = await fetch(`${SERVER_URL}/forwardMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: messageToForward, newReceiver: targetId, userId })
      });
      const data = await res.json();
      if (data.success && data.message && targetId === receiver) {
        appendMessage(data.message);
      }
      if (data.success) ok++;
    } catch (e) { /* continue */ }
  }
  closeForwardModal();
  showToast(`Message transféré à ${ok} personne(s)`, "success");
}

function closeForwardModal() {
  document.getElementById("forwardModal").style.display = "none";
  messageToForward = null;
  selectedForward.clear();
}

// --- 11. FILE HANDLING ---
function handleFileSelect() {
  const f = document.getElementById("fileInput").files[0];
  if (!f) return;
  const preview = document.getElementById("filePreview");
  document.getElementById("filePreviewName").textContent = f.name;
  preview.style.display = "flex";
}
function clearFile() {
  document.getElementById("fileInput").value = "";
  document.getElementById("filePreview").style.display = "none";
}

// --- 12. LOAD DATA ---
async function loadMessages(receiverId) {
  const area = document.getElementById("messagesArea");
  area.innerHTML = "";

  if (navigator.onLine) {
    try {
      const res = await fetch(`${SERVER_URL}/messages/${userId}/${receiverId}`);
      const data = await res.json();
      if (data.success) {
        await db.messages.bulkPut(data.messages.map(m => ({ ...m, _id: String(m._id) })));
        data.messages.forEach(m => appendMessage(m));
        return;
      }
    } catch (e) {
      console.warn("Network failed, loading from Dexie...", e);
    }
  }

  // Offline fallback
  const all = await db.messages
    .where("sender").anyOf([userId, receiverId])
    .toArray();
  const conv = all
    .filter(m => (m.sender === userId && m.receiver === receiverId) || (m.sender === receiverId && m.receiver === userId))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (conv.length === 0) {
    area.innerHTML = `<p style="text-align:center;color:var(--text3);margin-top:40px;font-size:0.9rem">Aucun message local</p>`;
  } else {
    conv.forEach(m => appendMessage(m));
  }
}

async function loadConversations() {
  currentMode = "conversations";
  document.getElementById("sidebarTitle").textContent = "Messages";
  const list = document.getElementById("chatList");
  list.innerHTML = "";

  if (!navigator.onLine) {
    // Offline: show from Dexie
    const contacts = await db.contacts.toArray();
    if (contacts.length === 0) {
      list.innerHTML = `<div class="list-empty"><i class="fas fa-wifi-slash"></i><p>Hors-ligne</p></div>`;
      return;
    }
    contacts.forEach(c => list.appendChild(buildChatItem(c._id, c, null, 0)));
    return;
  }

  try {
    const res = await fetch(`${SERVER_URL}/conversations/${userId}`);
    const data = await res.json();
    if (!data.success || Object.keys(data.conversations).length === 0) {
      list.innerHTML = `<div class="list-empty"><i class="fas fa-comment-slash"></i><p>Aucune conversation</p></div>`;
      return;
    }
    for (const id in data.conversations) {
      const conv = data.conversations[id];
      list.appendChild(buildChatItem(id, {
        _id: id,
        username: conv.username || conv.email,
        profilePic: conv.profilePic
      }, conv.lastMessage, conv.unread, conv.date));
    }
  } catch (e) {
    list.innerHTML = `<div class="list-empty"><i class="fas fa-exclamation-circle"></i><p>Erreur chargement</p></div>`;
  }
}

async function loadContacts() {
  currentMode = "contacts";
  document.getElementById("sidebarTitle").textContent = "Contacts";
  const list = document.getElementById("chatList");
  list.innerHTML = "";

  if (!navigator.onLine) {
    const contacts = await db.contacts.toArray();
    if (contacts.length === 0) {
      list.innerHTML = `<div class="list-empty"><i class="fas fa-wifi-slash"></i><p>Hors-ligne</p></div>`;
      return;
    }
    contacts.forEach(c => list.appendChild(buildChatItem(c._id, c, c.email, 0)));
    return;
  }

  try {
    const res = await fetch(`${SERVER_URL}/contacts/${userId}`);
    const data = await res.json();
    if (!data.success || data.contacts.length === 0) {
      list.innerHTML = `<div class="list-empty"><i class="fas fa-users"></i><p>Aucun contact</p></div>`;
      return;
    }
    // Cache contacts in Dexie
    await db.contacts.bulkPut(data.contacts.map(c => ({ ...c, _id: String(c._id) })));
    data.contacts.forEach(c => list.appendChild(buildChatItem(c._id, c, c.email, 0)));
  } catch (e) {
    list.innerHTML = `<div class="list-empty"><i class="fas fa-exclamation-circle"></i><p>Erreur chargement</p></div>`;
  }
}

function buildChatItem(id, contact, preview, unread, date) {
  const item = document.createElement("div");
  item.className = "chat-item";
  item.dataset.contactId = id;

  const timeStr = date ? new Date(date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
  const badgeHTML = unread > 0 ? `<div class="badge">${unread}</div>` : "";

  item.innerHTML = `
    <div class="chat-item-avatar">
      <img src="${contact.profilePic || '/images/noprofil.png'}" class="avatar">
      <div class="online-dot" id="dot-${id}"></div>
    </div>
    <div class="chat-item-info">
      <div class="chat-name">${escapeHtml(contact.username || contact.email || "?")}</div>
      <div class="chat-preview">${escapeHtml(preview || "")}</div>
    </div>
    <div class="chat-item-meta">
      <span class="time">${timeStr}</span>
      ${badgeHTML}
    </div>`;

  item.onclick = () => openConversation(id, contact, item);
  return item;
}

async function openConversation(id, contact, itemEl) {
  receiver = id;
  currentContact = contact;

  // Highlight active
  document.querySelectorAll(".chat-item").forEach(i => i.classList.remove("active"));
  if (itemEl) itemEl.classList.add("active");

  // Remove badge
  const badge = itemEl && itemEl.querySelector(".badge");
  if (badge) badge.remove();

  setChatHeader(contact);
  showChatView();
  await loadMessages(id);
  await markSeen(id);
}

function setChatHeader(contact) {
  document.getElementById("chatName").textContent = contact.username || contact.email || "?";
  document.getElementById("chatAvatar").src = contact.profilePic || "/images/noprofil.png";
  updateStatusUI("offline");
  socket.emit("getStatus", contact._id);
}

function updateStatusUI(status) {
  const dot = document.querySelector(".chat-header .status-dot");
  const label = document.getElementById("chatStatus");
  if (dot) dot.className = "status-dot" + (status === "online" ? " online" : "");
  if (label) label.innerHTML = status === "online"
    ? `<span class="status-dot online"></span> En ligne`
    : `<span class="status-dot"></span> Hors-ligne`;
}

async function markSeen(senderId) {
  const localReceiver = senderId; // capture before any async gap
  try {
    await fetch(`${SERVER_URL}/markSeen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, receiver: localReceiver })
    });
    socket.emit("readMessages", { from: localReceiver, to: userId });
  } catch (e) { /* ignore */ }
}

// --- 13. SEARCH & ADD CONTACT ---
function toggleSearch() {
  const panel = document.getElementById("searchPanel");
  panel.style.display = panel.style.display === "none" ? "block" : "none";
  if (panel.style.display === "block") document.getElementById("searchEmail").focus();
}

async function searchUser() {
  const email = document.getElementById("searchEmail").value.trim();
  const resultDiv = document.getElementById("searchResult");
  if (!email) return;

  resultDiv.innerHTML = `<p style="font-size:0.8rem;color:var(--text3);padding:4px 0">Recherche...</p>`;

  try {
    const res = await fetch(`${SERVER_URL}/searchUser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    if (!data.success || !data.user) {
      resultDiv.innerHTML = `<p style="font-size:0.82rem;color:var(--danger);padding:4px 0">Utilisateur introuvable</p>`;
      return;
    }

    const u = data.user;
    const item = document.createElement("div");
    item.className = "search-result-item";
    item.innerHTML = `
      <img src="${u.profilePic || '/images/noprofil.png'}" class="avatar">
      <div class="info">
        <h4>${escapeHtml(u.username)}</h4>
        <p>${escapeHtml(u.email)}</p>
      </div>
      <button onclick="addContact('${u._id}')">Ajouter</button>`;
    resultDiv.innerHTML = "";
    resultDiv.appendChild(item);
  } catch (e) {
    resultDiv.innerHTML = `<p style="font-size:0.82rem;color:var(--danger)">Erreur serveur</p>`;
  }
}

async function addContact(contactId) {
  if (contactId === userId) return showToast("Impossible de s'ajouter soi-même", "error");
  try {
    const res = await fetch(`${SERVER_URL}/addContact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, contactId })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Contact ajouté !", "success");
      document.getElementById("searchResult").innerHTML = "";
      document.getElementById("searchEmail").value = "";
      loadContacts();
    } else {
      showToast(data.message || "Erreur", "error");
    }
  } catch (e) { showToast("Erreur serveur", "error"); }
}

// --- 14. NAVIGATION ---
function showConversations() {
  loadConversations();
  setActiveNav(0);
}
function showContacts() {
  loadContacts();
  setActiveNav(1);
}

function setActiveNav(index) {
  document.querySelectorAll(".nav-item, .mob-nav-item").forEach((el, i) => {
    el.classList.toggle("active", i === index);
  });
}

function showChatView() {
  const main = document.getElementById("chatMain");
  const empty = document.getElementById("chatEmpty");
  const view = document.getElementById("chatView");
  empty.style.display = "none";
  view.style.display = "flex";
  // Mobile: show chat panel
  if (window.innerWidth <= 680) {
    main.classList.add("visible");
    document.getElementById("sidebar").style.display = "none";
  }
}

function goBackToList() {
  receiver = null;
  currentContact = null;
  const main = document.getElementById("chatMain");
  main.classList.remove("visible");
  document.getElementById("sidebar").style.display = "flex";
  document.getElementById("chatView").style.display = "none";
  document.getElementById("chatEmpty").style.display = "flex";
}

document.getElementById("backBtn").addEventListener("click", goBackToList);

// --- 15. OFFLINE SYNC ---
window.addEventListener("online", async () => {
  document.getElementById("offline-banner").classList.remove("visible");
  showToast("Connexion rétablie ✓", "success");

  // Sync pending messages
  const pending = await db.messages.where("status").equals("pending").toArray();
  for (const msg of pending) {
    const { _id, status, ...cleanMsg } = msg;
    socket.emit("sendMessage", cleanMsg);
    await db.messages.delete(_id);
  }
  if (pending.length > 0) showToast(`${pending.length} message(s) synchronisé(s)`, "success");
  loadConversations();
});

window.addEventListener("offline", () => {
  document.getElementById("offline-banner").classList.add("visible");
  showToast("Connexion perdue — mode hors-ligne", "error");
});

// --- 16. SERVICE WORKER ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// --- 17. HELPERS ---
function formatTime(date) {
  const d = new Date(date);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(msg, type = "") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// --- 18. INIT LOAD ---
window.addEventListener("load", async () => {
  await loadConversations();
  if (!navigator.onLine) {
    document.getElementById("offline-banner").classList.add("visible");
  }
});
