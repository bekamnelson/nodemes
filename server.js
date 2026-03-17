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
const io = new Server(server, {
    cors: { origin: "*" } 
});

// --- 1. MIDDLEWARES ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- 2. CONNEXION MONGODB ---

// Utilise l'URI de l'environnement (en ligne) ou le local si rien n'est défini
const mongoURI = process.env.MONGO_URI || "mongodb://localhost:27017/studychat";
const PORT = process.env.PORT || 3000;

// Connexion MongoDB
mongoose.connect(mongoURI)
  .then(() => console.log(`✅ Connecté à MongoDB (${process.env.NODE_ENV || 'production'})`))
  .catch(err => console.error("❌ Erreur MongoDB :", err));




// --- 3. MODÈLES (SCHEMAS) ---

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
});
const User = mongoose.model("User", userSchema);

const messageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    message: String,
    file: String,
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", messageSchema);

// --- 4. CONFIGURATION MULTER (UPLOADS) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// --- 5. ROUTES API (AUTHENTIFICATION) ---

app.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.json({ success: false, message: "Email déjà utilisé" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        res.json({ success: true, message: "Utilisateur créé !" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Erreur serveur" });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.json({ success: false, message: "Email incorrect" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.json({ success: false, message: "Mot de passe incorrect" });

        res.json({ success: true, message: "Connexion réussie", user });
    } catch (err) {
        res.json({ success: false, message: "Erreur serveur" });
    }
});

// --- 6. ROUTES API (CONTACTS) ---

app.post("/searchUser", async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: false });
    res.json({ success: true, user });
});

app.post("/addContact", async (req, res) => {
    try {
        const { userId, contactId } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.json({ success: false });

        if (user.contacts.includes(contactId)) {
            return res.json({ success: false, message: "Déjà ajouté" });
        }

        user.contacts.push(contactId);
        await user.save();
        res.json({ success: true, message: "Contact ajouté" });
    } catch (err) {
        res.json({ success: false, message: "Erreur serveur" });
    }
});

app.get("/contacts/:userId", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).populate("contacts", "username email");
        if (!user) return res.json({ success: false });
        res.json({ success: true, contacts: user.contacts });
    } catch (err) {
        res.json({ success: false });
    }
});

// --- 7. ROUTES API (MESSAGES) ---

app.get("/messages/:userId/:receiverId", async (req, res) => {
    try {
        const { userId, receiverId } = req.params;
        const messages = await Message.find({
            $or: [
                { sender: userId, receiver: receiverId },
                { sender: receiverId, receiver: userId }
            ]
        }).sort({ createdAt: 1 });
        res.json({ success: true, messages });
    } catch (err) {
        res.json({ success: false });
    }
});

app.post("/upload", upload.single("file"), async (req, res) => {
    const { sender, receiver, message } = req.body;
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;

    const newMsg = new Message({ sender, receiver, message, file: filePath });
    await newMsg.save();

    io.to(receiver).emit("receiveMessage", newMsg);
    io.to(sender).emit("receiveMessage", newMsg); 
    res.json({ success: true, data: newMsg });
});

// --- 8. LOGIQUE SOCKET.IO ---

io.on("connection", (socket) => {
    console.log("🔌 Utilisateur connecté :", socket.id);

    // Rejoindre une room personnelle basée sur l'ID utilisateur
    socket.on("join", (userId) => {
        socket.join(userId);
        console.log(`User ${userId} a rejoint sa room`);
    });

    // Envoi de message en temps réel
    socket.on("sendMessage", async (data) => {
        const { sender, receiver, message } = data;

        const newMsg = new Message({ sender, receiver, message });
        await newMsg.save();

        // Envoyer au destinataire
        io.to(receiver).emit("receiveMessage", newMsg);
        // Envoyer aussi à l'expéditeur (pour confirmation/synchro)
        io.to(sender).emit("receiveMessage", newMsg);
    });

    socket.on("disconnect", () => {
        console.log("❌ Utilisateur déconnecté");
    });
});

// --- 9. LANCEMENT DU SERVEUR ---

server.listen(PORT, () => {
    console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});