const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
    transports: ["websocket", "polling"],
    allowEIO3: true
});

// --- 1. MIDDLEWARES ---
// CORS élargi pour APK Android (Capacitor envoie origin null ou capacitor://)
app.use(cors({
    origin: function(origin, callback) {
        // Autoriser : pas d'origin (mobile natif), localhost, Capacitor, et votre domaine
        const allowed = [
            undefined, null,
            "capacitor://localhost",
            "http://localhost",
            "http://localhost:3000",
            "http://localhost:8080",
            "https://nodemes-3.onrender.com"
        ];
        if (!origin || allowed.includes(origin)) return callback(null, true);
        callback(null, true); // Permissif pour le dev — restreindre en production
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Route /ping pour le wake-up Render et la détection de connectivité
app.get("/ping", (req, res) => res.json({ ok: true, ts: Date.now() }));

// --- 2. CONNEXION MONGODB ---
const mongoURI = process.env.MONGO_URI || "mongodb+srv://nelson:a4gb5ui6@cluster0.uvjq8jz.mongodb.net/?appName=Cluster0";
const PORT = process.env.PORT || 3000;

mongoose.connect(mongoURI)
    .then(() => console.log(`✅ Connecté à MongoDB`))
    .catch(err => console.error("❌ Erreur MongoDB :", err));

// --- 3. CONFIGURATION CLOUDINARY ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storageCloud = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'studychat_uploads',
        allowed_formats: ['jpg', 'png', 'jpeg', 'pdf', 'docx'],
        resource_type: 'auto'
    },
});
const uploadCloud = multer({ storage: storageCloud });

// --- 4. MODÈLES ---
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
    isForwarded: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Message = mongoose.model("Message", messageSchema);

// --- 5. CONFIG MULTER LOCAL ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// --- 6. ROUTES AUTH & PROFIL ---
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
    try {
        const user = await User.findById(req.params.id).select('-password');
        res.json({ user });
    } catch (err) { res.json({ user: null }); }
});

app.post("/updateProfile", async (req, res) => {
    try {
        const { userId, username, email } = req.body;
        const updatedUser = await User.findByIdAndUpdate(userId, { username, email }, { new: true }).select('-password');
        res.json({ success: true, user: updatedUser });
    } catch (err) { res.json({ success: false }); }
});

app.post("/uploadProfilePic", uploadCloud.single("image"), async (req, res) => {
    try {
        const imageUrl = req.file.path;
        await User.findByIdAndUpdate(req.body.userId, { profilePic: imageUrl });
        res.json({ success: true, imageUrl });
    } catch (err) { res.json({ success: false }); }
});

app.post("/logout", (req, res) => {
    res.json({ success: true });
});

// --- 7. ROUTES CONTACTS ---
app.post("/searchUser", async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).select('-password');
    res.json({ success: !!user, user });
});

app.post("/addContact", async (req, res) => {
    try {
        const { userId, contactId } = req.body;
        if (userId === contactId) return res.json({ success: false, message: "Vous ne pouvez pas vous ajouter vous-même" });
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

// --- 8. ROUTES MESSAGES ---
app.get("/messages/:userId/:receiverId", async (req, res) => {
    try {
        const { userId, receiverId } = req.params;
        const messages = await Message.find({
            $or: [
                { sender: userId, receiver: receiverId },
                { sender: receiverId, receiver: userId }
            ]
        }).sort({ createdAt: 1 })
          .populate({
              path: 'replyTo',
              populate: { path: 'sender', select: 'username' }
          });
        res.json({ success: true, messages });
    } catch (err) { res.json({ success: false }); }
});

app.get("/conversations/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const messages = await Message.find({
            $or: [{ sender: userId }, { receiver: userId }]
        })
        .sort({ createdAt: -1 })
        .populate("sender", "username email profilePic")
        .populate("receiver", "username email profilePic");

        const conversations = {};
        messages.forEach(msg => {
            const otherUser = msg.sender._id.toString() === userId ? msg.receiver : msg.sender;
            const otherId = otherUser._id.toString();
            if (!conversations[otherId]) {
                conversations[otherId] = {
                    lastMessage: msg.deleted ? "🚫 Message supprimé" : (msg.message || "📎 Fichier"),
                    date: msg.createdAt,
                    unread: 0,
                    username: otherUser.username,
                    email: otherUser.email,
                    profilePic: otherUser.profilePic
                };
            }
            if (msg.receiver._id.toString() === userId && !msg.seen) {
                conversations[otherId].unread++;
            }
        });
        res.json({ success: true, conversations });
    } catch (err) {
        res.json({ success: false });
    }
});

app.post("/markSeen", async (req, res) => {
    const { userId, receiver } = req.body;
    await Message.updateMany({ sender: receiver, receiver: userId, seen: false }, { seen: true });
    res.json({ success: true });
});

app.post("/editMessage", async (req, res) => {
    try {
        const { id, newText } = req.body;
        const msg = await Message.findByIdAndUpdate(id, { message: newText, edited: true }, { new: true });
        if (msg) {
            io.to(msg.receiver.toString()).emit("messageEdited", { id, newText });
            io.to(msg.sender.toString()).emit("messageEdited", { id, newText });
        }
        res.json({ success: true });
    } catch (err) { res.json({ success: false }); }
});

app.post("/deleteMessage", async (req, res) => {
    try {
        const { id } = req.body;
        const msg = await Message.findById(id);
        if (!msg) return res.json({ success: false, message: "Message introuvable" });

        if (msg.deleted) {
            await Message.findByIdAndDelete(id);
            io.to(msg.receiver.toString()).emit("messageHardDeleted", id);
            io.to(msg.sender.toString()).emit("messageHardDeleted", id);
            return res.json({ success: true, action: "hard_delete" });
        } else {
            msg.deleted = true;
            msg.message = "🚫 Ce message a été supprimé";
            await msg.save();
            io.to(msg.receiver.toString()).emit("messageSoftDeleted", { id, text: msg.message });
            io.to(msg.sender.toString()).emit("messageSoftDeleted", { id, text: msg.message });
            return res.json({ success: true, action: "soft_delete" });
        }
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/forwardMessage", async (req, res) => {
    try {
        const { id, newReceiver, userId } = req.body;
        const originalMsg = await Message.findById(id);
        if (!originalMsg) return res.json({ success: false });

        const newMsg = new Message({
            sender: userId || originalMsg.sender,
            receiver: newReceiver,
            message: originalMsg.message,
            isForwarded: true,
            createdAt: new Date()
        });
        await newMsg.save();
        res.json({ success: true, message: newMsg });
    } catch (err) { res.json({ success: false }); }
});

app.post("/upload", uploadCloud.single("file"), async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        const fileUrl = req.file ? req.file.path : null;
        const newMsg = new Message({ sender, receiver, message, file: fileUrl });
        await newMsg.save();
        const fullMsg = await Message.findById(newMsg._id).populate({
            path: 'replyTo',
            populate: { path: 'sender', select: 'username' }
        });
        io.to(receiver).emit("receiveMessage", fullMsg);
        io.to(sender).emit("receiveMessage", fullMsg);
        res.json({ success: true, data: fullMsg });
    } catch (err) { res.json({ success: false }); }
});

// --- 9. SOCKET.IO ---
let onlineUsers = {};

io.on("connection", (socket) => {
    socket.on("join", (userId) => {
        socket.join(userId);
        onlineUsers[userId] = socket.id;
        io.emit("userStatus", { userId, status: "online" });
    });

    socket.on("sendMessage", async (data) => {
        const { sender, receiver, message, replyTo } = data;
        const newMsg = new Message({
            sender,
            receiver,
            message,
            replyTo: replyTo || null
        });
        await newMsg.save();

        const fullMsg = await Message.findById(newMsg._id)
            .populate({
                path: 'replyTo',
                populate: { path: 'sender', select: 'username' }
            });

        io.to(receiver).emit("receiveMessage", fullMsg);
        io.to(sender).emit("receiveMessage", fullMsg);
    });

    socket.on("readMessages", async ({ from, to }) => {
        await Message.updateMany({ sender: from, receiver: to, seen: false }, { seen: true });
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

// --- 10. LANCEMENT ---
server.listen(PORT, () => console.log(`🚀 Serveur sur port ${PORT}`));
