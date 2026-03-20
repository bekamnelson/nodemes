const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- 1. MIDDLEWARES ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- 2. CONNEXION MONGODB ---
const mongoURI = process.env.MONGO_URI || "mongodb+srv://nelson:a4gb5ui6@cluster0.uvjq8jz.mongodb.net/?appName=Cluster0";
const PORT = process.env.PORT || 3000;

mongoose.connect(mongoURI)
    .then(() => console.log(`✅ Connecté à MongoDB`))
    .catch(err => console.error("❌ Erreur MongoDB :", err));

// --- 3. MODÈLES (SCHEMAS) ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profilePic: { type: String, default: "/images/noprofil.png" },
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
});

const messageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    message: String,
    file: String,
    seen: { type: Boolean, default: false },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Message = mongoose.model("Message", messageSchema);

// --- 4. CONFIGURATION MULTER ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// --- 5. ROUTES AUTHENTIFICATION & PROFIL ---
app.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (await User.findOne({ email })) return res.json({ success: false, message: "Email déjà utilisé" });
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();
        res.json({ success: true, message: "Utilisateur créé !" });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.json({ success: false, message: "Identifiants incorrects" });
        }
        res.json({ success: true, user });
    } catch (err) { res.json({ success: false }); }
});

app.get("/user/:id", async (req, res) => {
    const user = await User.findById(req.params.id);
    res.json({ user });
});

app.post("/updateProfile", async (req, res) => {
    try {
        const { userId, username, email } = req.body;
        const updatedUser = await User.findByIdAndUpdate(userId, { username, email }, { new: true });
        res.json({ success: true, user: updatedUser });
    } catch (err) { res.json({ success: false }); }
});

app.post("/uploadProfilePic", upload.single("image"), async (req, res) => {
    try {
        const imageUrl = "/uploads/" + req.file.filename;
        await User.findByIdAndUpdate(req.body.userId, { profilePic: imageUrl });
        res.json({ success: true, imageUrl });
    } catch (err) { res.json({ success: false }); }
});

// --- 6. ROUTES CONTACTS ---
app.post("/searchUser", async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    res.json({ success: !!user, user });
});

app.post("/addContact", async (req, res) => {
    try {
        const { userId, contactId } = req.body;
        const user = await User.findById(userId);
        if (user && !user.contacts.includes(contactId)) {
            user.contacts.push(contactId);
            await user.save();
            return res.json({ success: true, message: "Contact ajouté" });
        }
        res.json({ success: false, message: "Erreur ou déjà ajouté" });
    } catch (err) { res.json({ success: false }); }
});

app.get("/contacts/:userId", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).populate("contacts", "username email profilePic");
        res.json({ success: true, contacts: user.contacts });
    } catch (err) { res.json({ success: false }); }
});

// --- 7. ROUTES MESSAGES & CONVERSATIONS ---

// Récupérer les messages avec tags (version optimisée)
app.get("/messages/:userId/:receiverId", async (req, res) => {
    try {
        const { userId, receiverId } = req.params;
        const messages = await Message.find({
            $or: [
                { sender: userId, receiver: receiverId },
                { sender: receiverId, receiver: userId }
            ]
        }).sort({ createdAt: 1 }).populate("replyTo");
        res.json({ success: true, messages });
    } catch (err) { res.json({ success: false }); }
});

app.get("/conversations/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const messages = await Message.find({
            $or: [{ sender: userId }, { receiver: userId }]
        }).sort({ createdAt: -1 });

        const conversations = {};
        messages.forEach(msg => {
            const otherUser = msg.sender == userId ? msg.receiver : msg.sender;
            if (!conversations[otherUser]) {
                conversations[otherUser] = {
                    lastMessage: msg.message,
                    date: msg.createdAt,
                    unread: 0
                };
            }
            if (msg.receiver == userId && !msg.seen) conversations[otherUser].unread++;
        });
        res.json({ success: true, conversations });
    } catch (err) { res.json({ success: false }); }
});

app.post("/markSeen", async (req, res) => {
    const { userId, receiver } = req.body;
    await Message.updateMany({ sender: receiver, receiver: userId, seen: false }, { seen: true });
    res.json({ success: true });
});

app.post("/editMessage", async (req, res) => {
    await Message.findByIdAndUpdate(req.body.id, { message: req.body.newText, edited: true });
    res.json({ success: true });
});

app.post("/deleteMessage", async (req, res) => {
    await Message.findByIdAndUpdate(req.body.id, { deleted: true, message: "" });
    res.json({ success: true });
});

app.post("/forwardMessage", async (req, res) => {
    const msg = await Message.findById(req.body.id);
    const newMsg = new Message({ sender: msg.sender, receiver: req.body.newReceiver, message: msg.message });
    await newMsg.save();
    res.json({ success: true });
});

app.post("/upload", upload.single("file"), async (req, res) => {
    const { sender, receiver, message } = req.body;
    const newMsg = new Message({ sender, receiver, message, file: req.file ? `/uploads/${req.file.filename}` : null });
    await newMsg.save();
    io.to(receiver).emit("receiveMessage", newMsg);
    io.to(sender).emit("receiveMessage", newMsg);
    res.json({ success: true, data: newMsg });
});

// --- 8. LOGIQUE SOCKET.IO ---
let onlineUsers = {};

io.on("connection", (socket) => {
    console.log("🔌 Connecté :", socket.id);

    socket.on("join", (userId) => {
        socket.join(userId);
        onlineUsers[userId] = socket.id;
        io.emit("userStatus", { userId, status: "online" });
    });

   socket.on("sendMessage", async (data) => {
    const { sender, receiver, message, replyTo } = data;

    // A. Sauvegarde en base de données
    const newMsg = new Message({
        sender,
        receiver,
        message,
        replyTo: replyTo || null
    });
    await newMsg.save();

    // B. RÉCUPÉRATION DEPUIS LA BASE (avec le texte du tag)
    // C'est cette étape qui garantit que le message s'affiche avec son tag
    const fullMsg = await Message.findById(newMsg._id).populate("replyTo");

    // C. RENVOI AUX DEUX UTILISATEURS
    io.to(receiver).emit("receiveMessage", fullMsg); // Pour l'ami
    io.to(sender).emit("receiveMessage", fullMsg);   // POUR TOI (Déclenche l'affichage chez toi)
});

    socket.on("getStatus", (userId) => {
        socket.emit("userStatus", { userId, status: onlineUsers[userId] ? "online" : "offline" });
    });

    socket.on("disconnect", () => {
        for (let userId in onlineUsers) {
            if (onlineUsers[userId] === socket.id) {
                delete onlineUsers[userId];
                io.emit("userStatus", { userId, status: "offline" });
            }
        }
    });
});

// --- 9. LANCEMENT ---
server.listen(PORT, () => console.log(`🚀 Serveur sur port ${PORT}`));